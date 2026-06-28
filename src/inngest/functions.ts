// Inngest Functions — Module B: Seeding & Ingestion Engine
// src/inngest/functions.ts
//
// All background jobs for the VectorMatch job-matching pipeline live here.
// These are wired into the serve handler at app/api/inngest/route.ts.
//
// Coding agents: add new functions here, then import and register them in
// app/api/inngest/route.ts.  Keep domain logic in src/lib/jobs/ and wrap it
// in step.run() for durability and observability.
//
// See docs/reports/inngest-agent-resources.md for patterns and debugging.

import type { Gate3Context } from "@/lib/jobs/gate-3";
import { inngest } from "./client";

// ── Seeder Functions ──────────────────────────────────────────────────────────

/**
 * HN Algolia Delta Seeder — daily discovery of new companies (first 7 days of month).
 *
 * Triggers: cron "0 0 * * *" (daily at 00:00 UTC)
 * Domain logic: src/lib/jobs/seeders/hn-algolia.ts
 *
 * The "Ask HN: Who is hiring" thread is posted on the 1st of each month.
 * Most engagement happens in the first 72 hours, but new comments continue
 * to appear for the first week. After that, very few new comments are posted.
 *
 * Strategy: Run daily for the first 7 days of each month to capture new
 * comments as they appear. Skip for the rest of the month (the thread is
 * effectively dead after the first week). The company table's unique
 * constraint handles dedup — re-running on the same thread only inserts
 * genuinely new companies.
 *
 * Phase 1: Fetch "Ask HN: Who is hiring" comments → extract ATS URLs →
 * insert new companies into the company table.
 * Phase 2 (event-driven): emits `seeder/resolve-custom-url` for non-ATS URLs.
 * Phase 3 (bootstrap poll): emits `poller/poll-company` for newly inserted
 * companies so they're polled immediately (Culprit #4 fix).
 *
 * TDD reference: §4.1.2
 */
export const hnAlgoliaSeeder = inngest.createFunction(
  {
    id: "seeder-hn-algolia",
    name: "HN Algolia Delta Seeder",
    triggers: [{ cron: "0 0 * * *" }],
  },
  async ({ step }) => {
    // Only run during the first 7 days of each month — the HN "Who is hiring"
    // thread is posted on the 1st and most comments appear within the first
    // week. After that, the thread is effectively dead and re-fetching would
    // be a waste of API calls.
    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    if (dayOfMonth > 7) {
      return {
        skipped: true,
        reason: `Day ${dayOfMonth} — outside first-7-days window`,
      };
    }
    const { runHnAlgoliaSeeder } = await import(
      "@/lib/jobs/seeders/hn-algolia"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-insert", async () => {
      return runHnAlgoliaSeeder(fetch);
    });

    // Write ingestion log for observability.
    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.commentsProcessed,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    // Emit event for custom URL resolution (Phase 2)
    if (result.customUrls.length > 0) {
      await step.sendEvent("emit-custom-url-resolution", {
        name: "seeder/resolve-custom-url",
        data: {
          urls: result.customUrls,
          source: "hn_algolia",
        },
      });
    }

    // Bootstrap poll: immediately emit poll-company events for newly inserted
    // companies so they're polled within minutes, not waiting for the weekly
    // dormant fan-out (Culprit #4 fix — eliminates 7-day cold-start delay).
    if (result.insertResult.insertedCompanies.length > 0) {
      await step.sendEvent(
        "emit-bootstrap-poll",
        result.insertResult.insertedCompanies.map((c) => ({
          id: `poll-company-${c.id}-${Date.now()}`,
          name: "poller/poll-company",
          data: {
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
          },
        })),
      );
    }

    return result;
  },
);

/**
 * Custom URL Resolver — CNAME + slug probe for non-ATS URLs.
 *
 * Triggered by: `seeder/resolve-custom-url` event
 * Domain logic: src/lib/jobs/seeders/resolve-custom-url.ts
 *
 * Stage 1: DNS CNAME check against known ATS hosts.
 * Stage 2: If CNAME fails, probe ATS APIs with inferred slug.
 * If both fail: URL is discarded (no manual review queue).
 *
 * TDD reference: §4.1.2
 */
export const customUrlResolver = inngest.createFunction(
  {
    id: "seeder-resolve-custom-url",
    name: "Custom URL Resolver",
    triggers: [{ event: "seeder/resolve-custom-url" }],
  },
  async ({ event, step }) => {
    const { resolveCustomUrls } = await import(
      "@/lib/jobs/seeders/resolve-custom-url"
    );
    const { insertDiscoveredCompanies } = await import(
      "@/lib/jobs/seeders/company-repository"
    );

    const { resolved, failed } = await step.run("resolve-batch", async () => {
      return resolveCustomUrls(event.data.urls);
    });

    let insertResult: {
      inserted: number;
      skipped: number;
      rejected: unknown[];
      insertedCompanies: { id: string; atsSource: string; atsSlug: string }[];
    } = {
      inserted: 0,
      skipped: 0,
      rejected: [],
      insertedCompanies: [],
    };

    if (resolved.length > 0) {
      insertResult = await step.run("insert-resolved", async () => {
        return insertDiscoveredCompanies(resolved);
      });
    }

    // Bootstrap poll for newly resolved companies (Culprit #4 fix)
    if (insertResult.insertedCompanies.length > 0) {
      await step.sendEvent(
        "emit-bootstrap-poll-resolved",
        insertResult.insertedCompanies.map((c) => ({
          id: `poll-company-${c.id}-${Date.now()}`,
          name: "poller/poll-company",
          data: {
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
          },
        })),
      );
    }

    return {
      resolvedCount: resolved.length,
      failedCount: failed.length,
      inserted: insertResult.inserted,
    };
  },
);

/**
 * BigQuery Volume Seeder — monthly bulk discovery from HTTP Archive.
 *
 * Triggers: cron "0 0 1 * *" (1st of month, 00:00 UTC)
 * Domain logic: src/lib/jobs/seeders/bigquery-seeder.ts
 *
 * Queries the public HTTP Archive BigQuery dataset for domains running target
 * tech stacks (Next.js, React, Vue, etc.) that also contain ATS script URLs
 * in their homepage payload. Extracts ATS slugs (directly from payload or via
 * slug probe) and inserts new companies.
 *
 * Can also be run as a manual script: `npx tsx scripts/seed-bigquery.ts`
 *
 * TDD reference: §4.1.1
 */
export const bigQuerySeeder = inngest.createFunction(
  {
    id: "seeder-bigquery",
    name: "BigQuery Volume Seeder",
    triggers: [{ cron: "0 0 1 * *" }],
  },
  async ({ step }) => {
    const { runBigQuerySeeder, createDefaultBigQueryFn, generateCrawlDates } =
      await import("@/lib/jobs/seeders/bigquery-seeder");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    // Multi-partition scan: query the last 3 monthly crawl dates to catch
    // companies added between crawls. Each partition costs ~15 GB, so 3
    // partitions = ~45 GB — well within the 1 TB/month free tier.
    // The DISTINCT clause deduplicates root_page across partitions.
    const crawlDates = generateCrawlDates(3);

    const queryFn = await step.run("create-bq-client", async () => {
      return createDefaultBigQueryFn();
    });

    const result = await step.run("query-and-insert", async () => {
      return runBigQuerySeeder(crawlDates, queryFn, undefined, fetch);
    });

    // Write ingestion log for observability.
    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "httparchive",
        itemsProcessed: result.domainsFound,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        errorDetails: result.error ? { crawlDates } : undefined,
        startedAt,
        finishedAt: new Date(),
      });
    });

    // Bootstrap poll: immediately emit poll-company events for newly inserted
    // companies (Culprit #4 fix — eliminates 7-day cold-start delay).
    if (result.insertResult.insertedCompanies.length > 0) {
      await step.sendEvent(
        "emit-bootstrap-poll-bq",
        result.insertResult.insertedCompanies.map((c) => ({
          id: `poll-company-${c.id}-${Date.now()}`,
          name: "poller/poll-company",
          data: {
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
          },
        })),
      );
    }

    return result;
  },
);

// ── Phalanx Poller Functions ────────────────────────────────────────────────

/**
 * Per-Company Poller — polls a single company's ATS API.
 *
 * Triggered by: `poller/poll-company` event (emitted by tier fan-out functions)
 * Domain logic: src/lib/jobs/poller/phalanx-poller.ts
 *
 * This is the fan-out target. Each event triggers a separate function instance
 * that polls one company. Inngest's concurrency cap naturally limits
 * simultaneous polls.
 *
 * Flow: fetch → Zod validate → Gate 0 filter → upsert → emit job/ingested
 *
 * TDD reference: §4.4
 *
 * Concurrency note: Originally 50 (TDD §4.4), lowered to 5 to match the
 * Inngest free plan concurrency cap. The protective intent (limiting
 * simultaneous polls to protect Hetzner CPU/RAM and the Neon pooler) is
 * preserved — 5 is even more conservative. Upgrade the Inngest plan and
 * raise this limit if higher throughput is needed post-MVP.
 */
export const pollCompanyFn = inngest.createFunction(
  {
    id: "poller-poll-company",
    name: "Per-Company Poller",
    triggers: [{ event: "poller/poll-company" }],
    // Concurrency cap — max 5 simultaneous polls (Inngest free plan limit)
    concurrency: {
      limit: 5,
    },
  },
  async ({ event, step }) => {
    const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");
    const { pollCompanyEventSchema } = await import(
      "@/lib/jobs/poller/schemas"
    );

    // Validate the event payload
    const parsed = pollCompanyEventSchema.safeParse(event.data);
    if (!parsed.success) {
      return { error: `Invalid event payload: ${parsed.error.message}` };
    }

    const { companyId, atsSource, atsSlug } = parsed.data;

    const result = await step.run("poll-company", async () => {
      return pollCompany(companyId, atsSource, atsSlug, fetch);
    });

    // Emit job/ingested events for genuinely new jobs (B→C handoff)
    if (result.newJobIds.length > 0) {
      await step.sendEvent(
        "emit-job-ingested",
        result.newJobIds.map((jobId) => ({
          id: `job-ingested-${jobId}-${Date.now()}`,
          name: "job/ingested",
          data: {
            jobId,
            atsSource: result.atsSource,
            atsSlug: result.atsSlug,
            // externalJobId and title are omitted — the jobIngestedHandler
            // (Module C) fetches the full job from DB by jobId.
            isNew: true,
          },
        })),
      );
    }

    return result;
  },
);

/**
 * Tier A Fan-Out — emits poll-company events for all active-tier companies.
 *
 * Triggers: cron "0 0/12 * * *" (every 12 hours)
 *
 * Queries all Tier A (active) companies and emits a `poller/poll-company`
 * event for each. Each event triggers a separate pollCompanyFn instance.
 *
 * TDD reference: §4.4.1 (fan-out pattern)
 */
export const tierActiveFanOut = inngest.createFunction(
  {
    id: "poller-tier-active-fanout",
    name: "Tier A Active Fan-Out",
    triggers: [{ cron: "0 */12 * * *" }],
  },
  async ({ step }) => {
    const { getActiveTierCompanies } = await import(
      "@/lib/jobs/poller/tier-queries"
    );

    const companies = await step.run("get-active-companies", async () => {
      return getActiveTierCompanies();
    });

    if (companies.length > 0) {
      await step.sendEvent(
        "emit-poll-company-active",
        companies.map((c) => ({
          id: `poll-company-${c.id}-${Date.now()}`,
          name: "poller/poll-company",
          data: {
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
          },
        })),
      );
    }

    return { companiesQueued: companies.length };
  },
);

/**
 * Tier B Fan-Out — emits poll-company events for all dormant-tier companies.
 *
 * Triggers: cron "0 0 * * 0" (weekly on Sunday at 00:00 UTC)
 *
 * TDD reference: §4.4.1 (fan-out pattern)
 */
export const tierDormantFanOut = inngest.createFunction(
  {
    id: "poller-tier-dormant-fanout",
    name: "Tier B Dormant Fan-Out",
    triggers: [{ cron: "0 0 * * 0" }],
  },
  async ({ step }) => {
    const { getDormantTierCompanies } = await import(
      "@/lib/jobs/poller/tier-queries"
    );

    const companies = await step.run("get-dormant-companies", async () => {
      return getDormantTierCompanies();
    });

    if (companies.length > 0) {
      await step.sendEvent(
        "emit-poll-company-dormant",
        companies.map((c) => ({
          id: `poll-company-${c.id}-${Date.now()}`,
          name: "poller/poll-company",
          data: {
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
          },
        })),
      );
    }

    return { companiesQueued: companies.length };
  },
);

/**
 * Manual Poll Trigger — polls a single company by ID (for admin/testing).
 *
 * Triggered by: `poller/run` event with a companyId
 *
 * TDD reference: §4.4
 */
export const phalanxPoller = inngest.createFunction(
  {
    id: "phalanx-poller",
    name: "Phalanx Poller (Manual)",
    triggers: [{ event: "poller/run" }],
  },
  async ({ event, step }) => {
    const { getCompanyById } = await import("@/lib/jobs/poller/tier-queries");
    const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");

    if (!event.data.companyId) {
      return { error: "companyId is required for manual poll" };
    }

    const company = await step.run("get-company", async () => {
      return getCompanyById(event.data.companyId);
    });

    if (!company) {
      return { error: "Company not found" };
    }

    const result = await step.run("poll-company", async () => {
      return pollCompany(company.id, company.atsSource, company.atsSlug, fetch);
    });

    // Emit job/ingested events for new jobs
    if (result.newJobIds.length > 0) {
      await step.sendEvent(
        "emit-job-ingested",
        result.newJobIds.map((jobId) => ({
          id: `job-ingested-${jobId}-${Date.now()}`,
          name: "job/ingested",
          data: {
            jobId,
            atsSource: result.atsSource,
            atsSlug: result.atsSlug,
            // externalJobId and title omitted — handler fetches from DB.
            isNew: true,
          },
        })),
      );
    }

    return result;
  },
);

/**
 * Tier Recalculation — daily rebucket of companies by activity.
 *
 * Triggers: cron "0 4 * * *" (daily at 04:00 UTC)
 *
 * Tier A (active):   lastJobPostedAt within 14 days → poll every 12h
 * Tier B (dormant):  lastJobPostedAt older than 14 days → poll weekly
 * Tier C (dead):     health = dead OR consecutiveFailures >= 3 → stop polling
 *
 * TDD reference: §4.4.1 (Decay Polling)
 */
export const tierRecalc = inngest.createFunction(
  {
    id: "poller-tier-recalc",
    name: "Tier Recalculation",
    triggers: [{ cron: "0 4 * * *" }],
  },
  async ({ step }) => {
    const { recalculateTiers } = await import("@/lib/jobs/poller/tier-queries");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const updated = await step.run("recalculate-tiers", async () => {
      return recalculateTiers();
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        status: "success",
        itemsProcessed: updated,
        itemsInserted: 0,
        itemsUpdated: updated,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return { updated };
  },
);

/**
 * Stale Job Cleanup — mark jobs as stale/gone based on last-seen age.
 *
 * Triggers: cron "0 3 * * *" (daily at 03:00 UTC)
 *
 * Rules:
 *   not seen in 7 days  → status = 'stale'
 *   not seen in 30 days → status = 'gone'
 *
 * Only jobs with status = 'active' are matched by Module C.
 *
 * TDD reference: §4.4.4
 */
export const staleCleanup = inngest.createFunction(
  {
    id: "poller-stale-cleanup",
    name: "Stale Job Cleanup",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const { markStaleJobs } = await import("@/lib/jobs/poller/job-repository");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("mark-stale", async () => {
      return markStaleJobs();
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "stale_cleanup",
        status: "success",
        itemsProcessed: result.staleMarked + result.goneMarked,
        itemsInserted: 0,
        itemsUpdated: result.staleMarked + result.goneMarked,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * Company Revival Sweep — re-enables polling for transiently-dead companies.
 *
 * Triggers: cron "0 5 * * *" (daily at 05:00 UTC)
 *
 * After 3 consecutive failures, a company is marked `health = "dead"` and
 * `pollingEnabled = false`. The tier recalculation only updates companies
 * where `pollingEnabled = true`, so dead companies are never reconsidered —
 * they're permanently stuck.
 *
 * This function re-enables polling for dead companies after a 7-day cooldown.
 * The 7-day period is long enough for transient issues (rate limits, server
 * outages) to resolve, and short enough that companies that migrated to a
 * new ATS are re-tested within a reasonable timeframe.
 *
 * TDD reference: §4.4.1 (Decay Polling) — extends the tier system with
 * automatic recovery.
 */
export const companyRevivalSweep = inngest.createFunction(
  {
    id: "poller-company-revival",
    name: "Company Revival Sweep",
    triggers: [{ cron: "0 5 * * *" }],
  },
  async ({ step }) => {
    const { sql } = await import("drizzle-orm");
    const { db } = await import("@/db/db");
    const { company } = await import("@/db/schemas/jobs/company");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const revived = await step.run("revive-dead-companies", async () => {
      // Re-enable companies that have been dead for 7+ days.
      // Reset consecutiveFailures and health so the tier recalculation can
      // promote them back to active/dormant based on their next poll result.
      const result = await db
        .update(company)
        .set({
          pollingEnabled: true,
          health: "healthy",
          consecutiveFailures: 0,
        })
        .where(
          sql`${company.health} = 'dead' AND ${company.pollingEnabled} = false AND ${company.lastPolledAt} < NOW() - INTERVAL '7 days'`,
        )
        .returning({
          id: company.id,
          atsSource: company.atsSource,
          atsSlug: company.atsSlug,
        });

      return result;
    });

    // Bootstrap poll for revived companies — emit poll events so they're
    // immediately re-tested.
    if (revived.length > 0) {
      await step.sendEvent(
        "emit-revival-poll",
        revived.map((c) => ({
          id: `poll-company-revival-${c.id}-${Date.now()}`,
          name: "poller/poll-company",
          data: {
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
          },
        })),
      );
    }

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        status: "success",
        source: "revival_sweep",
        itemsProcessed: revived.length,
        itemsInserted: 0,
        itemsUpdated: revived.length,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return { revived: revived.length };
  },
);

/**
 * Normalization Retry Sweep — re-processes jobs with normalization_failed status.
 *
 * Triggers: cron "0 6 * * *" (daily at 06:00 UTC)
 *
 * Jobs with `status = "normalization_failed"` have no `normalizedAt` (by design
 * — they're retryable). The `jobIngestedHandler` idempotency guard will re-process
 * them if a `job/ingested` event fires again. But there's no scheduled function
 * that re-emits `job/ingested` events for failed jobs — they're stuck forever.
 *
 * This function selects up to 50 `normalization_failed` jobs per run and re-emits
 * `job/ingested` events for them. The `jobIngestedHandler` will re-normalize and
 * re-embed them. If the failure was transient (OpenAI timeout), the retry will
 * succeed. If the failure is persistent (malformed job data), the job will fail
 * again and be retried the next day.
 *
 * TDD reference: §4.6 (Idempotency Decision Tree) — leverages the retryable
 * nature of normalization_failed jobs.
 */
export const normalizationRetrySweep = inngest.createFunction(
  {
    id: "poller-normalization-retry",
    name: "Normalization Retry Sweep",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }) => {
    const { sql } = await import("drizzle-orm");
    const { db } = await import("@/db/db");
    const { job } = await import("@/db/schemas/jobs/job");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const failedJobs = await step.run("get-failed-jobs", async () => {
      // Select up to 50 normalization_failed jobs, prioritizing the oldest
      // ones (they've been waiting the longest). The normalizedAt IS NULL
      // check is technically redundant (normalization_failed implies no
      // normalizedAt) but is explicit for safety.
      const result = await db
        .select({
          id: job.id,
          atsSource: job.atsSource,
          atsSlug: job.atsSlug,
        })
        .from(job)
        .where(
          sql`${job.status} = 'normalization_failed' AND ${job.normalizedAt} IS NULL`,
        )
        .orderBy(job.detectedAt)
        .limit(50);

      return result;
    });

    if (failedJobs.length > 0) {
      await step.sendEvent(
        "retry-normalization",
        failedJobs.map((j) => ({
          id: `job-ingested-retry-${j.id}-${Date.now()}`,
          name: "job/ingested",
          data: {
            jobId: j.id,
            atsSource: j.atsSource,
            atsSlug: j.atsSlug,
            isNew: false,
          },
        })),
      );
    }

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        status: "success",
        source: "normalization_retry",
        itemsProcessed: failedJobs.length,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return { retried: failedJobs.length };
  },
);

// ── Module C Trigger (Event-Driven) ─────────────────────────────────────────

/**
 * Job Ingestion Handler — triggers the 3-Gate funnel when a new job arrives.
 *
 * Triggered by: `job/ingested` event (emitted by Phalanx Poller)
 *
 * This is the boundary between Module B (ingestion) and Module C (routing).
 * When a new job is ingested, this function:
 *   1. Fetches the job + idempotency decision tree (§4.6)
 *   2. Normalizes: ATS-source-aware extraction → regex tag scan → LLM fallback
 *      → rejection/normalization_failed decision (§4)
 *   3. Embeds: generates text-embedding-3-small from cleaned fullText (§4.4)
 *   4. Writes normalization results to the job row
 *   [C2] 5. Gate 1+2 SQL router → insert candidates into matchQueue
 *   [C3] 6. Fan out match/gate-3-evaluate events for each candidate
 *
 * Concurrency limit 15 (§4.5): prevents OpenAI rate limit exhaustion when
 * Module B ingests many jobs at once. Each handler instance is mostly waiting
 * for I/O (LLM call ~2-3s, embedding ~200ms), not holding DB connections.
 *
 * TDD reference: §5.2 (superseded by MODULE_C_DECISIONS.md §4)
 */
export const jobIngestedHandler = inngest.createFunction(
  {
    id: "job-ingested-handler",
    name: "Job Ingested — Trigger 3-Gate Funnel",
    triggers: [{ event: "job/ingested" }],
    // §4.5 — concurrency 5 prevents OpenAI rate limit exhaustion under
    // Module B's poller fan-out. Originally 15, lowered to 5 to match the
    // Inngest free plan concurrency cap.
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const { jobId } = event.data;

    // ── Step 1: Fetch job + idempotency decision tree (§4.6) ───────────────
    // The decision tree determines whether to normalize, skip (already
    // processed), or retry (normalization_failed). DB connection is acquired
    // and released within this step (stateless pattern, §6.4).
    const decision = await step.run("fetch-job", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { eq } = await import("drizzle-orm");
      const { decideNormalizationAction } = await import(
        "@/lib/jobs/job-normalizer"
      );

      const rows = await db
        .select({
          id: job.id,
          atsSource: job.atsSource,
          title: job.title,
          rawJson: job.rawJson,
          status: job.status,
          normalizedAt: job.normalizedAt,
        })
        .from(job)
        .where(eq(job.id, jobId))
        .limit(1);

      if (rows.length === 0) {
        return { action: "skip" as const, reason: "Job not found in DB" };
      }

      const jobRow = rows[0];
      const idempotencyDecision = decideNormalizationAction({
        status: jobRow.status,
        normalizedAt: jobRow.normalizedAt,
      });

      if (idempotencyDecision.action === "skip") {
        return {
          action: "skip" as const,
          reason: idempotencyDecision.reason,
        };
      }

      return { action: "normalize" as const, job: jobRow };
    });

    if (decision.action === "skip") {
      return { skipped: true, reason: decision.reason, jobId };
    }

    // ── Step 2: Normalize (§4 — extraction + regex + LLM fallback) ────────
    // normalizeJob is pure computation + optional LLM call. No DB connection
    // held. The LLM call (if triggered) is inside this step.run() boundary,
    // satisfying §11.5 (all AI SDK calls wrapped in step.run or step.ai.wrap).
    const normalization = await step.run("normalize", async () => {
      const { normalizeJob } = await import("@/lib/jobs/job-normalizer");
      return normalizeJob(
        decision.job.atsSource,
        decision.job.rawJson,
        decision.job.title,
      );
    });

    // ── Step 3: Embed (§4.4 — only if normalized) ──────────────────────────
    // Generate the job embedding from the cleaned fullText. Only runs for
    // 'normalized' jobs — rejected/failed jobs don't need an embedding.
    let embedding: number[] | null = null;
    if (normalization.status === "normalized") {
      embedding = await step.run("embed", async () => {
        const { embedJob } = await import("@/lib/jobs/job-embedder");
        return embedJob(normalization.fullText);
      });
    }

    // ── Step 4: Write normalization results to DB ─────────────────────────
    // DB connection acquired and released within this step.
    // normalizedAt is set ONLY on terminal outcomes (normalized or rejected),
    // NEVER on normalization_failed (§4.3, §4.6).
    await step.run("write-normalization", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { eq } = await import("drizzle-orm");

      if (normalization.status === "normalized") {
        await db
          .update(job)
          .set({
            extractedTags: normalization.tags,
            jobEmbedding: embedding,
            normalizedAt: new Date(),
            // status stays 'active' — normalizedAt indicates normalization done
          })
          .where(eq(job.id, jobId));
      } else if (normalization.status === "rejected") {
        await db
          .update(job)
          .set({
            status: "rejected",
            extractedTags: normalization.tags,
            // No embedding — rejected jobs are tombstones
            normalizedAt: new Date(),
          })
          .where(eq(job.id, jobId));
      } else {
        // normalization_failed — NO normalizedAt (must remain retryable)
        await db
          .update(job)
          .set({
            status: "normalization_failed",
            extractedTags: normalization.tags,
          })
          .where(eq(job.id, jobId));
      }
    });

    // If normalization didn't succeed, stop here — no Gate 1+2 or Gate 3.
    if (normalization.status !== "normalized") {
      return {
        jobId,
        normalizationStatus: normalization.status,
        error: normalization.error,
        queued: 0,
      };
    }

    // ── Step 5: Gate 1+2 SQL router → matchQueue (§5) ──────────────────────
    // Runs the combined GIN overlap + HNSW cosine distance query, inserts
    // candidate rows into matchQueue, and returns them for Gate 3 fan-out.
    // DB connection acquired and released within this step (stateless pattern).
    const candidates = await step.run("gate-1-2-router", async () => {
      const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
      return runGateSQLRouter(jobId, normalization.tags, embedding ?? []);
    });

    // If no candidates passed Gates 1+2, the funnel ends here — no Gate 3.
    if (candidates.length === 0) {
      return {
        jobId,
        normalizationStatus: "normalized",
        tagsFound: normalization.tags.length,
        candidates: 0,
        queued: 0,
      };
    }

    // ── Step 6: Fan out match/gate-3-evaluate events (§3.1) ───────────────
    // One event per candidate → one gate3Evaluator function instance per
    // candidate (maximum parallelism, maximum failure isolation).
    // Inngest's per-function concurrency cap (15) naturally limits
    // simultaneous LLM calls.
    if (candidates.length > 0) {
      await step.sendEvent(
        "fan-out-gate-3",
        candidates.map((c) => ({
          id: `gate-3-${c.matchQueueId}`,
          name: "match/gate-3-evaluate",
          data: {
            matchQueueId: c.matchQueueId,
            jobId,
            personaId: c.personaId,
            applicantId: c.applicantId,
          },
        })),
      );
    }

    return {
      jobId,
      normalizationStatus: "normalized",
      tagsFound: normalization.tags.length,
      candidates: candidates.length,
      queued: candidates.length,
    };
  },
);

// ── Module C Gate 3 — LLM Candidate Evaluation ──────────────────────────────

/**
 * Gate 3 Evaluator — the LLM arbiter for the 3-Gate funnel.
 *
 * Triggered by: `match/gate-3-evaluate` event (emitted by jobIngestedHandler
 * after Gate 1+2 inserts candidate rows into matchQueue).
 *
 * One event per candidate row → one function instance per candidate (maximum
 * parallelism, maximum failure isolation). Concurrency limit 15 (§6.1).
 *
 * Step structure (§6.4 — stateless DB pattern):
 *   1. fetch-context  → read job + persona + applicant from DB, release conn
 *   2. evaluate       → step.ai.wrap LLM call (gpt-4o-mini), NO DB conn held
 *   3. write-verdict  → update matchQueue row (verdict, reasoning, model,
 *                        evaluatedAt, status), release conn
 *   4. emit-approved  → if approved, emit match/approved (fire-and-forget)
 *
 * Idempotency: if matchQueue.status !== 'pending', skip (already evaluated).
 * This handles Inngest retries safely — a retried event for an already-
 * evaluated candidate is a no-op.
 *
 * TDD reference: §5.3 (superseded by MODULE_C_DECISIONS.md §6)
 */
export const gate3Evaluator = inngest.createFunction(
  {
    id: "match-gate-3-evaluator",
    name: "Gate 3 — LLM Candidate Evaluation",
    triggers: [{ event: "match/gate-3-evaluate" }],
    // §6.1 — concurrency 5 prevents Neon pooler exhaustion under fan-out.
    // Originally 15, lowered to 5 to match the Inngest free plan concurrency
    // cap. At 5 concurrent evaluations, each holding a DB connection for
    // ~100ms (read) + ~100ms (write) around a ~3-5s LLM call, the pooler
    // sees ~10 short-lived acquisitions per second — well within PgBouncer's
    // budget.
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const { matchQueueId, jobId, personaId, applicantId } = event.data;

    // ── Step 1: Fetch context + idempotency check (§6.4) ───────────────────
    // DB connection acquired and released within this step.
    const context = await step.run("fetch-context", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { persona } = await import("@/db/schemas/jobs/persona");
      const { applicant } = await import("@/db/schemas/jobs/applicant");
      const { matchQueue } = await import("@/db/schemas/jobs/matchQueue");
      const { eq } = await import("drizzle-orm");
      const { extractJobContent } = await import("@/lib/jobs/job-normalizer");

      // Idempotency: check if this matchQueue row is still pending.
      // If it's already evaluated (approved/rejected/error), skip — this is
      // a retried event for an already-processed candidate.
      const mqRows = await db
        .select({ status: matchQueue.status })
        .from(matchQueue)
        .where(eq(matchQueue.id, matchQueueId))
        .limit(1);

      if (mqRows.length === 0) {
        return { skip: true as const, reason: "matchQueue row not found" };
      }
      if (mqRows[0].status !== "pending") {
        return {
          skip: true as const,
          reason: `Already evaluated (status=${mqRows[0].status})`,
        };
      }

      // Fetch job, persona, and applicant in parallel.
      const [jobRows, personaRows, applicantRows] = await Promise.all([
        db
          .select({
            title: job.title,
            rawJson: job.rawJson,
            atsSource: job.atsSource,
            extractedTags: job.extractedTags,
            workplaceType: job.workplaceType,
            locationName: job.locationName,
            employmentType: job.employmentType,
          })
          .from(job)
          .where(eq(job.id, jobId))
          .limit(1),
        db
          .select({
            personaLabel: persona.personaLabel,
            embeddingSummary: persona.embeddingSummary,
            mustHaveTags: persona.mustHaveTags,
            blocklistTags: persona.blocklistTags,
          })
          .from(persona)
          .where(eq(persona.id, personaId))
          .limit(1),
        db
          .select({
            allTags: applicant.allTags,
            country: applicant.country,
            canWorkUsHours: applicant.canWorkUsHours,
            preferredCompliance: applicant.preferredCompliance,
            modalities: applicant.modalities,
            assignmentTypes: applicant.assignmentTypes,
          })
          .from(applicant)
          .where(eq(applicant.userId, applicantId))
          .limit(1),
      ]);

      if (
        jobRows.length === 0 ||
        personaRows.length === 0 ||
        applicantRows.length === 0
      ) {
        return {
          skip: true as const,
          reason: "Missing job/persona/applicant context",
        };
      }

      // Extract cleaned description from rawJson (ATS-source-aware).
      const extracted = extractJobContent(
        jobRows[0].atsSource,
        jobRows[0].rawJson,
        jobRows[0].title,
      );

      return {
        skip: false as const,
        context: {
          job: {
            title: jobRows[0].title,
            description: extracted.description,
            extractedTags: jobRows[0].extractedTags ?? [],
            workplaceType: jobRows[0].workplaceType,
            locationName: jobRows[0].locationName,
            employmentType: jobRows[0].employmentType,
          },
          persona: {
            personaLabel: personaRows[0].personaLabel,
            embeddingSummary: personaRows[0].embeddingSummary,
            mustHaveTags: personaRows[0].mustHaveTags,
            blocklistTags: personaRows[0].blocklistTags,
          },
          applicant: {
            allTags: applicantRows[0].allTags,
            country: applicantRows[0].country,
            canWorkUsHours: applicantRows[0].canWorkUsHours,
            preferredCompliance: applicantRows[0].preferredCompliance ?? [],
            modalities: applicantRows[0].modalities ?? [],
            assignmentTypes: applicantRows[0].assignmentTypes ?? [],
          },
        },
      };
    });

    if (context.skip) {
      return { matchQueueId, skipped: true, reason: context.reason };
    }

    // ── Step 2: LLM evaluation via step.ai.wrap (§6.2) ─────────────────────
    // NO DB connection held during the LLM call (~3-5s).
    // step.ai.wrap adds observability (prompts, tokens, latency in Inngest
    // dashboard) without routing traffic through Inngest's proxy.
    const verdict = await step.ai.wrap(
      "gate-3-evaluate",
      async (ctx: Gate3Context) => {
        const { evaluateGate3 } = await import("@/lib/jobs/gate-3");
        return evaluateGate3(ctx);
      },
      context.context,
    );

    // ── Step 3: Write verdict to DB (§6.4) ─────────────────────────────────
    // DB connection acquired and released within this step.
    await step.run("write-verdict", async () => {
      const { db } = await import("@/db/db");
      const { matchQueue } = await import("@/db/schemas/jobs/matchQueue");
      const { eq } = await import("drizzle-orm");
      const { mapVerdict } = await import("@/lib/jobs/gate-3");

      const verdictString = mapVerdict(verdict);

      await db
        .update(matchQueue)
        .set({
          status: verdictString,
          llmVerdict: verdictString,
          llmReasoning: verdict.matchReasoning,
          llmConfidence: verdict.matchConfidence,
          llmBlockers: verdict.blockers,
          llmModel: "gpt-4o-mini",
          evaluatedAt: new Date(),
        })
        .where(eq(matchQueue.id, matchQueueId));
    });

    // ── Step 4: Emit match/approved if approved (§3.2) ─────────────────────
    // Fire-and-forget — no listener for MVP. Module D (cold email) will
    // consume this event post-MVP.
    if (verdict.approved) {
      await step.sendEvent(`match-approved-${matchQueueId}`, {
        name: "match/approved",
        data: {
          matchQueueId,
          jobId,
          applicantId,
          personaId,
        },
      });
    }

    return {
      matchQueueId,
      verdict: verdict.approved ? "approved" : "rejected",
      confidence: verdict.matchConfidence,
      reasoning: verdict.matchReasoning,
    };
  },
);

// ── Module A: Onboarding Cleanup ─────────────────────────────────────────────

/**
 * Orphaned CV Upload Cleanup — daily cleanup of abandoned cvUpload rows.
 *
 * Triggers: cron "0 3 * * *" (03:00 UTC daily)
 *
 * Removes two classes of abandoned rows to keep the cv_upload table bounded:
 *   1. Stuck "processing" uploads — older than 24h, meaning the LLM call or
 *      the action that created the row failed and never updated the status.
 *   2. Orphan uploads — rows with no working_history children and older than
 *      7 days, meaning the user abandoned the onboarding before finalizing.
 *
 * TDD reference: Module A §A4
 */
export const cleanupOrphanedCvUploads = inngest.createFunction(
  {
    id: "cleanup-orphaned-cv-uploads",
    name: "Cleanup Orphaned CV Uploads",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const result = await step.run("delete-abandoned-uploads", async () => {
      const { cleanupOrphanedCvUploads } = await import(
        "@/lib/onboarding/cleanup-cv-uploads"
      );
      return cleanupOrphanedCvUploads(
        24 * 60 * 60 * 1000,
        7 * 24 * 60 * 60 * 1000,
      );
    });

    return result;
  },
);
