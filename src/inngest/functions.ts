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
// See docs/inngest-agent-resources.md for patterns and debugging.

import { inngest } from "./client";

// ── Seeder Functions ──────────────────────────────────────────────────────────

/**
 * HN Algolia Delta Seeder — weekly discovery of new companies.
 *
 * Triggers: cron "0 0 * * 1" (Monday 00:00 UTC)
 * Domain logic: src/lib/jobs/seeders/hn-algolia.ts
 *
 * Phase 1: Fetch "Ask HN: Who is hiring" comments → extract ATS URLs →
 * insert new companies into the company table.
 * Phase 2 (event-driven): emits `seeder/resolve-custom-url` for non-ATS URLs.
 *
 * TDD reference: §4.1.2
 */
export const hnAlgoliaSeeder = inngest.createFunction(
  {
    id: "seeder-hn-algolia",
    name: "HN Algolia Delta Seeder",
    triggers: [{ cron: "0 0 * * 1" }],
  },
  async ({ step }) => {
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

    if (resolved.length > 0) {
      await step.run("insert-resolved", async () => {
        return insertDiscoveredCompanies(resolved);
      });
    }

    return { resolvedCount: resolved.length, failedCount: failed.length };
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
    const { runBigQuerySeeder, createDefaultBigQueryFn } = await import(
      "@/lib/jobs/seeders/bigquery-seeder"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    // Determine the crawl date — first of the current month.
    // HTTPArchive crawls happen monthly, typically on the 1st.
    const crawlDate = new Date(startedAt.getFullYear(), startedAt.getMonth(), 1)
      .toISOString()
      .slice(0, 10);

    const queryFn = await step.run("create-bq-client", async () => {
      return createDefaultBigQueryFn();
    });

    const result = await step.run("query-and-insert", async () => {
      return runBigQuerySeeder(crawlDate, queryFn, undefined, fetch);
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
        errorDetails: result.error ? { crawlDate } : undefined,
        startedAt,
        finishedAt: new Date(),
      });
    });

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
 * that polls one company. Inngest's concurrency cap (50) naturally limits
 * simultaneous polls.
 *
 * Flow: fetch → Zod validate → Gate 0 filter → upsert → emit job/ingested
 *
 * TDD reference: §4.4
 */
export const pollCompanyFn = inngest.createFunction(
  {
    id: "poller-poll-company",
    name: "Per-Company Poller",
    triggers: [{ event: "poller/poll-company" }],
    // Concurrency cap — max 50 simultaneous polls (Inngest default)
    concurrency: {
      limit: 50,
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

// ── Module C Trigger (Event-Driven) ─────────────────────────────────────────

/**
 * Job Ingestion Handler — triggers the 3-Gate funnel when a new job arrives.
 *
 * Triggered by: `job/ingested` event (emitted by Phalanx Poller)
 *
 * This is the boundary between Module B (ingestion) and Module C (routing).
 * When a new job is ingested, this function:
 *   1. Generates job embedding (text-embedding-3-small)
 *   2. Runs Gate 1 (GIN overlap) + Gate 2 (HNSW similarity)
 *   3. Enqueues Gate 3 candidates in matchQueue
 *
 * TDD reference: §5.2
 */
export const jobIngestedHandler = inngest.createFunction(
  {
    id: "job-ingested-handler",
    name: "Job Ingested — Trigger 3-Gate Funnel",
    triggers: [{ event: "job/ingested" }],
  },
  async ({ event, step }) => {
    // TODO(Module C): Implement 3-Gate routing logic.
    //   1. Generate embedding for the job
    //   2. Gate 1: GIN index overlap on mustHaveTags / blocklistTags
    //   3. Gate 2: HNSW cosine similarity on persona embeddings
    //   4. Gate 3: LLM arbitration for high-confidence matches
    //   5. Insert into matchQueue
    await step.run("placeholder", async () => {
      return {
        status: "not-implemented",
        note: "Awaiting Module C 3-Gate implementation",
        jobId: event.data.jobId,
      };
    });

    return { queued: 0 };
  },
);
