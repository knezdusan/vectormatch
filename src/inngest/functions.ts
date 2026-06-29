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
 * Phase 3 (bootstrap poll): retired with G5 — the batchPollTier cron polls
 * newly inserted companies on the next cycle (within 3-12h).
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

    // Note: The old bootstrap poll emitted `poller/poll-company` events for
    // newly inserted companies (Culprit #4 fix). With G5 batch polling, the
    // `poller/poll-company` event is removed — newly discovered companies are
    // polled on the next batchPollTier cron run (within 3-12h for active tier).
    // Q4 (item 38) will add hourly bootstrap polling for new companies.

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

    // Note: Bootstrap poll removed (G5 — poller/poll-company event retired).
    // Newly resolved companies are polled on the next batchPollTier cron.

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

    // Multi-partition scan: query the last 6 monthly crawl dates to catch
    // companies added between crawls. Each partition costs ~15 GB, so 6
    // partitions = ~90 GB — well within the 1 TB/month free tier.
    // The DISTINCT clause deduplicates root_page across partitions.
    const crawlDates = generateCrawlDates(6);

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

    // Note: Bootstrap poll removed (G5 — poller/poll-company event retired).
    // Newly discovered companies are polled on the next batchPollTier cron.

    return result;
  },
);

// ── Phalanx Poller Functions ────────────────────────────────────────────────

/**
 * Maps the cron string that triggered the function to the company tier to poll.
 * (G5 — CORPUS_EXPANSION_TDD §1.2)
 *
 * Inngest v4 cron triggers expose the cron string at event.data.cron
 * (event name is "inngest/scheduled.timer").
 */
export function cronToTier(cron: string): "active_hot" | "active" | "dormant" {
  switch (cron) {
    case "0 */3 * * *":
      return "active_hot"; // every 3h — hot tier (G1)
    case "0 */12 * * *":
      return "active"; // every 12h — standard tier
    case "0 3 * * 1":
      return "dormant"; // weekly Monday 3am — dormant tier
    default:
      throw new Error(`Unknown cron trigger: ${cron}`);
  }
}

/** Batch size — companies per batchPollTier function run (G5 TDD §1.2). */
export const BATCH_SIZE = 100;

/**
 * Batch Poll Tier — polls N companies in a single Inngest function run.
 * (G5 — CORPUS_EXPANSION_TDD §1.2: Batch Polling Architecture)
 *
 * Replaces the old per-company fan-out architecture (pollCompanyFn +
 * tierActiveFanOut + tierDormantFanOut). Instead of 1 Inngest function per
 * company poll, this function polls 100 companies per run, reducing execution
 * count by 50-100x — making 5,000 companies viable on the 50K/month Hobby plan.
 *
 * Three cron triggers map to three tiers via cronToTier():
 *   - every 3h cron   → active_hot  (G1 tier, companies with recent approved matches)
 *   - every 12h cron  → active      (standard tier, companies with recent job posts)
 *   - weekly Mon 3am  → dormant     (dormant tier, companies with no recent activity)
 *
 * Flow:
 *   1. get-batch:     Query up to 100 companies for the tier, ordered by
 *                     lastPolledAt ASC NULLS FIRST (fairest scheduling).
 *   2. poll-batch:    Poll each company sequentially (phalanx-poller already
 *                     enforces 2 req/s per ATS via Bottleneck). Error isolation:
 *                     one company's failure doesn't stop the batch.
 *   3. normalize-N:   Normalize + embed new jobs in sub-batches of 50 (G6).
 *                     Each sub-batch is a separate step.run() for durability.
 *                     G7: writes normalizedText, NULLs rawJson for
 *                     normalized/rejected jobs. Keeps rawJson for
 *                     normalization_failed (retryable).
 *   4. gate-1-2-batch: Run Gate 1+2 SQL router for all new jobs (G6).
 *   5. gate-3-fanout:  Fan out Gate 3 events for surviving candidates (~6%).
 *
 * Concurrency: limit 5 (Hobby plan max). Multiple batchPollTier instances can
 * run concurrently if triggered by different crons, but no more than 5 at once.
 *
 * TDD reference: CORPUS_EXPANSION_TDD §1.2 (replaces TDD §4.4 fan-out pattern)
 */
export const batchPollTier = inngest.createFunction(
  {
    id: "poller-batch-poll-tier",
    name: "Batch Poll Tier",
    triggers: [
      { cron: "0 */3 * * *" }, // every 3h — hot tier
      { cron: "0 */12 * * *" }, // every 12h — standard tier
      { cron: "0 3 * * 1" }, // weekly Monday 3am — dormant tier
    ],
    concurrency: { limit: 5 }, // Hobby plan: 5 concurrent steps max
  },
  async ({ event, step }) => {
    // Determine tier from the cron string that triggered this run.
    // Inngest v4 cron triggers expose the cron string at event.data.cron
    // (event name is "inngest/scheduled.timer"). The type isn't included
    // in the default Inngest client types, so we cast safely.
    const tier = cronToTier((event.data as { cron?: string }).cron ?? "");

    // Step 1: Get batch of companies for this tier
    const companies = await step.run("get-batch", async () => {
      const { getBatchForTier } = await import(
        "@/lib/jobs/poller/tier-queries"
      );
      return getBatchForTier(tier, BATCH_SIZE);
    });

    if (companies.length === 0) {
      return { tier, polled: 0, newJobs: 0 };
    }

    // Step 2: Poll all companies in this batch (sequential, rate-limited per ATS)
    const pollResults = await step.run("poll-batch", async () => {
      const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");
      const results: Array<{
        companyId: string;
        atsSource: string;
        atsSlug: string;
        newJobIds: string[];
        error?: string;
      }> = [];
      for (const c of companies) {
        try {
          const result = await pollCompany(c.id, c.atsSource, c.atsSlug, fetch);
          results.push({
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
            newJobIds: result.newJobIds,
          });
        } catch (e) {
          // Log failure, continue with next company (error isolation)
          results.push({
            companyId: c.id,
            atsSource: c.atsSource,
            atsSlug: c.atsSlug,
            newJobIds: [],
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return results;
    });

    // Collect all new job IDs across the batch (G6 — CORPUS_EXPANSION_TDD §1.3)
    const allNewJobIds = pollResults.flatMap((r) => r.newJobIds);

    if (allNewJobIds.length === 0) {
      return {
        tier,
        polled: companies.length,
        newJobs: 0,
        errors: pollResults.filter((r) => r.error).length,
      };
    }

    // ── G6 Step 3: Normalize + embed new jobs in sub-batches of 50 ──────────
    // Each sub-batch is a separate step.run() for durability. Sub-batch sizing:
    // 50 jobs × ~460ms avg (regex + embedding + 10% LLM fallback) = ~23s per
    // step, well within Inngest's 300s limit.
    const SUB_BATCH = 50;
    const normalizeStepCount = Math.ceil(allNewJobIds.length / SUB_BATCH);

    for (let i = 0; i < allNewJobIds.length; i += SUB_BATCH) {
      const chunk = allNewJobIds.slice(i, i + SUB_BATCH);
      const stepName = `normalize-${Math.floor(i / SUB_BATCH) + 1}`;

      await step.run(stepName, async () => {
        const { normalizeJob } = await import("@/lib/jobs/job-normalizer");
        const { embedJob } = await import("@/lib/jobs/job-embedder");
        const { db } = await import("@/db/db");
        const { job } = await import("@/db/schemas/jobs/job");
        const { eq, inArray } = await import("drizzle-orm");

        // Fetch job rows for this chunk
        const jobs = await db
          .select({
            id: job.id,
            atsSource: job.atsSource,
            title: job.title,
            rawJson: job.rawJson,
          })
          .from(job)
          .where(inArray(job.id, chunk));

        for (const j of jobs) {
          try {
            const normalization = await normalizeJob(
              j.atsSource,
              j.rawJson,
              j.title,
            );
            let embedding: number[] | null = null;
            if (normalization.status === "normalized") {
              embedding = await embedJob(normalization.fullText);
            }

            // Write results + prune rawJson (G7). Note: normalizedAt is set
            // ONLY on terminal outcomes (normalized or rejected), NEVER on
            // normalization_failed (must remain retryable — §4.6). rawJson is
            // kept for normalization_failed (needed for retry).
            if (normalization.status === "normalized") {
              await db
                .update(job)
                .set({
                  extractedTags: normalization.tags,
                  jobEmbedding: embedding,
                  normalizedText: normalization.fullText,
                  rawJson: null, // G7: reclaim storage
                  normalizedAt: new Date(),
                  // status stays 'active'
                })
                .where(eq(job.id, j.id));
            } else if (normalization.status === "rejected") {
              await db
                .update(job)
                .set({
                  status: "rejected",
                  extractedTags: normalization.tags,
                  normalizedText: normalization.fullText,
                  rawJson: null, // G7: reclaim storage from garbage jobs
                  normalizedAt: new Date(),
                })
                .where(eq(job.id, j.id));
            } else {
              // normalization_failed — NO normalizedAt, KEEP rawJson (retryable)
              await db
                .update(job)
                .set({
                  status: "normalization_failed",
                  extractedTags: normalization.tags,
                })
                .where(eq(job.id, j.id));
            }
          } catch {
            // System failure (DB error, unexpected exception) — mark as
            // normalization_failed without touching rawJson (retryable).
            await db
              .update(job)
              .set({ status: "normalization_failed" })
              .where(eq(job.id, j.id));
          }
        }
        return { processed: jobs.length };
      });
    }

    // ── G6 Step 4: Gate 1+2 for all new jobs in batch ───────────────────────
    const candidates = await step.run("gate-1-2-batch", async () => {
      const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { eq } = await import("drizzle-orm");

      // Run Gate 1+2 for each new job. Only 'active' jobs with embeddings
      // pass through (rejected/normalization_failed are skipped).
      const allCandidates: Array<{
        matchQueueId: string;
        jobId: string;
        personaId: string;
        applicantId: string;
      }> = [];

      for (const jobId of allNewJobIds) {
        const j = await db
          .select({
            extractedTags: job.extractedTags,
            jobEmbedding: job.jobEmbedding,
            status: job.status,
          })
          .from(job)
          .where(eq(job.id, jobId))
          .limit(1);

        // Skip jobs that aren't active or don't have an embedding
        if (j[0]?.status !== "active" || !j[0].jobEmbedding) continue;

        const cands = await runGateSQLRouter(
          jobId,
          j[0].extractedTags,
          j[0].jobEmbedding,
        );
        // Augment with jobId (GateRouterCandidate doesn't include it)
        for (const c of cands) {
          allCandidates.push({
            matchQueueId: c.matchQueueId,
            jobId,
            personaId: c.personaId,
            applicantId: c.applicantId,
          });
        }
      }
      return allCandidates;
    });

    // ── G6 Step 5: Fan out Gate 3 evaluations (small numbers, ~6% of jobs) ──
    // Gate 3 remains fan-out per TDD §1.3 — only ~20 candidates/day reach
    // Gate 3, so fan-out is ~100 executions/day = 3K/month (negligible).
    if (candidates.length > 0) {
      await step.sendEvent(
        "gate-3-fanout",
        candidates.map((c) => ({
          id: `gate-3-${c.matchQueueId}`,
          name: "match/gate-3-evaluate",
          data: {
            matchQueueId: c.matchQueueId,
            jobId: c.jobId,
            personaId: c.personaId,
            applicantId: c.applicantId,
          },
        })),
      );
    }

    return {
      tier,
      polled: companies.length,
      newJobs: allNewJobIds.length,
      normalized: normalizeStepCount,
      gateCandidates: candidates.length,
      errors: pollResults.filter((r) => r.error).length,
    };
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

    // Note: Bootstrap poll removed (G5 — poller/poll-company event retired).
    // Revived companies are polled on the next batchPollTier cron.

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
            // G7: store cleaned text in normalizedText, NULL rawJson to
            // reclaim storage (~15KB → ~3KB). Gate 3 reads normalizedText.
            normalizedText: normalization.fullText,
            rawJson: null,
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
            // G7: reclaim storage from garbage jobs too. Keep normalizedText
            // for debugging why the job was rejected.
            normalizedText: normalization.fullText,
            rawJson: null,
            normalizedAt: new Date(),
          })
          .where(eq(job.id, jobId));
      } else {
        // normalization_failed — NO normalizedAt (must remain retryable).
        // G7: do NOT null rawJson here — the retry sweep needs it to
        // re-extract content. Storage is reclaimed when the retry succeeds
        // (normalized) or the job is finally rejected.
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
      // G7: select normalizedText (primary) and rawJson (fallback for legacy
      // jobs pre-backfill). extractJobContent uses normalizedText when
      // available, falling back to rawJson parsing otherwise.
      const [jobRows, personaRows, applicantRows] = await Promise.all([
        db
          .select({
            title: job.title,
            rawJson: job.rawJson,
            normalizedText: job.normalizedText,
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
            seniorityLevels: persona.seniorityLevels,
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

      // Extract cleaned description — G7: prefer normalizedText (already
      // HTML-stripped) over rawJson. extractJobContent handles the fallback
      // to rawJson parsing for legacy jobs pre-backfill.
      const extracted = extractJobContent(
        jobRows[0].atsSource,
        jobRows[0].rawJson,
        jobRows[0].title,
        jobRows[0].normalizedText,
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
            seniorityLevels: personaRows[0].seniorityLevels ?? [],
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
    //
    // A/B test: randomly assign a prompt variant per candidate. The variant
    // is stored in matchQueue.promptVariant for later analysis.
    const promptVariant = await step.run("pick-variant", async () => {
      const { pickPromptVariant } = await import("@/lib/jobs/gate-3");
      return pickPromptVariant();
    });

    const verdict = await step.ai.wrap(
      "gate-3-evaluate",
      async (ctx: Gate3Context) => {
        const { evaluateGate3 } = await import("@/lib/jobs/gate-3");
        return evaluateGate3(ctx, promptVariant);
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
          promptVariant: promptVariant,
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

// ── Module C: Pending Queue Sweep ────────────────────────────────────────────

/**
 * Pending Queue Sweep — picks up match_queue rows stuck in 'pending' status.
 *
 * Triggers: cron every 15 minutes ("0,15,30,45 * * * *")
 *
 * When match_queue rows are inserted by Gate 1+2 but the Gate 3 event was not
 * emitted (e.g. script ran without Inngest event key, or an event was lost),
 * these rows sit in 'pending' forever. This sweep finds them and emits
 * match/gate-3-evaluate events so they get evaluated.
 *
 * Also handles rows that have been pending for >10 minutes (the normal Gate 3
 * evaluation takes ~5s, so 10 minutes is a generous timeout for a retried event).
 */
export const pendingQueueSweep = inngest.createFunction(
  {
    id: "pending-queue-sweep",
    name: "Pending Queue Sweep",
    triggers: [{ cron: "0,15,30,45 * * * *" }],
  },
  async ({ step }) => {
    const result = await step.run("find-pending", async () => {
      const { db } = await import("@/db/db");
      const { sql } = await import("drizzle-orm");

      // Find pending rows older than 10 minutes (excludes freshly inserted
      // rows that are still being processed by their original Gate 3 event).
      const pendingRows = await db.execute(sql`
        SELECT id, job_id, persona_id, applicant_id
        FROM match_queue
        WHERE status = 'pending'
          AND created_at < NOW() - INTERVAL '10 minutes'
        LIMIT 50
      `);

      return pendingRows.rows as {
        id: string;
        job_id: string;
        persona_id: string;
        applicant_id: string;
      }[];
    });

    if (result.length === 0) {
      return { swept: 0 };
    }

    // Emit Gate 3 events for each pending row.
    await step.sendEvent(
      "sweep-fan-out",
      result.map((row) => ({
        id: `gate-3-sweep-${row.id}`,
        name: "match/gate-3-evaluate" as const,
        data: {
          matchQueueId: row.id,
          jobId: row.job_id,
          personaId: row.persona_id,
          applicantId: row.applicant_id,
        },
      })),
    );

    return { swept: result.length };
  },
);

// ── Module C: Persona Updated — Gate 3 Feedback Loop ─────────────────────────

/**
 * Persona Updated — re-evaluates rejected match_queue rows when a persona's
 * tags or embedding summary change.
 *
 * Triggered by: `persona/updated` event (emitted by updatePersonasAction when
 * must_have_tags, blocklist_tags, or embedding_summary change).
 *
 * When a user updates their persona (e.g., adds a new must-have tag, removes
 * a blocklist tag, or changes their embedding summary), previously rejected
 * jobs may now be a match. This function:
 *   1. Finds all match_queue rows with status='rejected' for the updated persona
 *   2. Resets them to 'pending'
 *   3. Emits match/gate-3-evaluate events for each
 *
 * Limits to 50 re-evaluations per persona update to control LLM costs.
 * Only re-evaluates rows for jobs that are still active.
 */
export const personaUpdatedHandler = inngest.createFunction(
  {
    id: "persona-updated-feedback",
    name: "Persona Updated — Gate 3 Feedback Loop",
    triggers: [{ event: "persona/updated" }],
  },
  async ({ event, step }) => {
    const { personaId } = event.data;

    const result = await step.run("find-rejected", async () => {
      const { db } = await import("@/db/db");
      const { matchQueue, job } = await import("@/db/schemas");
      const { eq, and } = await import("drizzle-orm");

      // Find rejected match_queue rows for this persona where the job is
      // still active. Limit to 50 to control LLM costs.
      const rejectedRows = await db
        .select({
          id: matchQueue.id,
          jobId: matchQueue.jobId,
          applicantId: matchQueue.applicantId,
          personaId: matchQueue.personaId,
        })
        .from(matchQueue)
        .innerJoin(job, eq(matchQueue.jobId, job.id))
        .where(
          and(
            eq(matchQueue.personaId, personaId),
            eq(matchQueue.status, "rejected"),
            eq(job.status, "active"),
          ),
        )
        .limit(50);

      if (rejectedRows.length === 0) {
        return { count: 0, rows: [] as typeof rejectedRows };
      }

      // Reset these rows to 'pending' so Gate 3 can re-evaluate them.
      const { inArray } = await import("drizzle-orm");
      await db
        .update(matchQueue)
        .set({
          status: "pending",
          llmVerdict: null,
          llmReasoning: null,
          llmConfidence: null,
          llmBlockers: null,
          evaluatedAt: null,
        })
        .where(
          and(
            eq(matchQueue.personaId, personaId),
            inArray(
              matchQueue.id,
              rejectedRows.map((r) => r.id),
            ),
          ),
        );

      return { count: rejectedRows.length, rows: rejectedRows };
    });

    if (result.count === 0) {
      return { personaId, reEvaluated: 0 };
    }

    // Emit Gate 3 events for each re-evaluated row.
    await step.sendEvent(
      "feedback-fan-out",
      result.rows.map((row) => ({
        id: `gate-3-feedback-${row.id}`,
        name: "match/gate-3-evaluate" as const,
        data: {
          matchQueueId: row.id,
          jobId: row.jobId,
          personaId: row.personaId,
          applicantId: row.applicantId,
        },
      })),
    );

    return { personaId, reEvaluated: result.count };
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

/**
 * Stale Job Verifier — G4 (TDD §1.6)
 *
 * Triggers: cron "0 6 * * *" (daily at 06:00 UTC)
 *
 * Daily sweep that re-checks dashboard-displayed approved matches against
 * their ATS endpoint. If a job no longer exists at the ATS (was closed,
 * unpublished, or the company left the ATS entirely), the match is marked
 * as "stale" and excluded from the dashboard.
 *
 * Steps:
 *   1. Get all approved matches from the last 30 days (joined with job ATS
 *      coordinates)
 *   2. For each match, re-fetch the ATS job list and check if the
 *      externalJobId is still present
 *   3. Mark stale matches (job no longer exists) as status='stale'
 *
 * Dashboard impact: The /dashboard/jobs query filters by status='approved'.
 * Stale matches are excluded automatically. No UI changes needed.
 *
 * TDD reference: CORPUS_EXPANSION_TDD §1.6
 */
export const staleJobVerifier = inngest.createFunction(
  {
    id: "stale-job-verifier",
    name: "Stale Job Verifier",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }) => {
    // Step 1: Get all approved matches from the last 30 days
    const approvedMatches = await step.run("get-approved", async () => {
      const { getApprovedMatchesForVerification } = await import(
        "@/lib/jobs/stale-job-queries"
      );
      return getApprovedMatchesForVerification(30);
    });

    if (approvedMatches.length === 0) {
      return { verified: 0, stale: 0, errors: 0 };
    }

    // Step 2: For each, re-fetch the job from ATS and check if it still exists
    const verifyResults = await step.run("verify-batch", async () => {
      const { verifyJobExists } = await import("@/lib/jobs/verify-job-exists");
      const results: {
        matchId: string;
        status: "stale" | "exists" | "error";
        error?: string;
      }[] = [];

      for (const match of approvedMatches) {
        try {
          const result = await verifyJobExists(
            match.atsSource as
              | "greenhouse"
              | "lever"
              | "ashby"
              | "smartrecruiters"
              | "workable"
              | "recruitee",
            match.atsSlug,
            match.externalJobId,
          );
          if (
            result.reason === "not_found" ||
            result.reason === "company_gone"
          ) {
            results.push({ matchId: match.matchId, status: "stale" });
          } else if (result.reason === "error") {
            results.push({
              matchId: match.matchId,
              status: "error",
              error: result.error,
            });
          } else {
            results.push({ matchId: match.matchId, status: "exists" });
          }
        } catch (e) {
          // ATS API error — don't mark as stale, just log
          results.push({
            matchId: match.matchId,
            status: "error",
            error: String(e),
          });
        }
      }
      return results;
    });

    // Step 3: Mark stale matches as status='stale'
    const staleIds = verifyResults
      .filter((r) => r.status === "stale")
      .map((r) => r.matchId);

    if (staleIds.length > 0) {
      await step.run("mark-stale", async () => {
        const { markMatchesStale } = await import(
          "@/lib/jobs/stale-job-queries"
        );
        return markMatchesStale(staleIds);
      });
    }

    // Step 4: Write ingestion log
    await step.run("write-log", async () => {
      const { writeIngestionLog } = await import(
        "@/lib/jobs/poller/ingestion-log"
      );
      return writeIngestionLog({
        type: "stale_cleanup",
        status: "success",
        itemsProcessed: approvedMatches.length,
        itemsInserted: 0,
        itemsUpdated: staleIds.length,
        itemsRejected: 0,
        itemsSkipped: verifyResults.filter((r) => r.status === "error").length,
        startedAt: new Date(),
        finishedAt: new Date(),
      });
    });

    return {
      verified: approvedMatches.length,
      stale: staleIds.length,
      errors: verifyResults.filter((r) => r.status === "error").length,
    };
  },
);

/**
 * Aggregator Job Handler — G3 (TDD §1.7)
 *
 * Triggered by: `job/aggregator-ingested` event
 *
 * Processes aggregator-sourced jobs (Remote OK, Remotive, Himalayas, WWR,
 * Jobicy, HN comments, Reddit, newsletters) through the same Gate 1+2+3
 * pipeline as ATS-sourced jobs. The key difference is that aggregator jobs
 * are ingested immediately (near-zero latency) — they don't go through the
 * poller → job/ingested → jobIngestedHandler flow.
 *
 * Steps:
 *   1. Normalize (strip HTML, extract tags, Gate 0 check)
 *   2. Embed (text-embedding-3-small)
 *   3. Insert into job table with synthetic atsSource="aggregator"
 *   4. Gate 1+2 (GIN + HNSW)
 *   5. Fan out Gate 3 events for each candidate
 *   6. Slugger resolve (try to find the company's ATS for future polling)
 *
 * Deduplication: The job table's unique index on (atsSource, atsSlug,
 * externalJobId) prevents duplicates. Aggregator jobs use atsSource="aggregator"
 * and atsSlug=source_name (e.g. "remoteok").
 *
 * TDD reference: CORPUS_EXPANSION_TDD §1.7
 */
export const aggregatorJobHandler = inngest.createFunction(
  {
    id: "aggregator-job-handler",
    name: "Aggregator Job Handler",
    triggers: [{ event: "job/aggregator-ingested" }],
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const jobData = event.data as {
      source: string;
      externalJobId: string;
      company: string;
      title: string;
      description: string;
      location?: string;
      tags?: string[];
      applyUrl?: string;
      publishedAt?: string;
    };

    // Step 1: Normalize (strip HTML, extract tags, Gate 0 check)
    const normalization = await step.run("normalize", async () => {
      const { normalizeAggregatorJob } = await import(
        "@/lib/jobs/job-normalizer"
      );
      return normalizeAggregatorJob({
        source: jobData.source as
          | "remoteok"
          | "remotive"
          | "himalayas"
          | "wwr"
          | "jobicy"
          | "hn_comment"
          | "reddit"
          | "newsletter",
        externalJobId: jobData.externalJobId,
        company: jobData.company,
        title: jobData.title,
        description: jobData.description,
        location: jobData.location,
        tags: jobData.tags,
        applyUrl: jobData.applyUrl,
        publishedAt: jobData.publishedAt
          ? new Date(jobData.publishedAt)
          : undefined,
      });
    });

    if (normalization.status !== "normalized") {
      return { skipped: true, reason: "Gate 0 rejected" };
    }

    // Step 2: Embed
    const embedding = await step.run("embed", async () => {
      const { embedJob } = await import("@/lib/jobs/job-embedder");
      return embedJob(normalization.fullText);
    });

    // Step 3: Insert into job table with synthetic atsSource="aggregator"
    const jobId = await step.run("insert-job", async () => {
      const { insertAggregatorJob } = await import(
        "@/lib/jobs/poller/job-repository"
      );
      return insertAggregatorJob(
        {
          source: jobData.source,
          externalJobId: jobData.externalJobId,
          title: jobData.title,
          applyUrl: jobData.applyUrl,
          publishedAt: jobData.publishedAt
            ? new Date(jobData.publishedAt)
            : undefined,
        },
        normalization,
        embedding,
      );
    });

    // Duplicate job (already ingested) — skip Gate 1+2
    if (!jobId) {
      return { skipped: true, reason: "Duplicate job" };
    }

    // Step 4: Gate 1+2
    const candidates = await step.run("gate-1-2", async () => {
      const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
      return runGateSQLRouter(jobId, normalization.tags, embedding);
    });

    // Step 5: Fan out Gate 3 events for each candidate
    if (candidates.length > 0) {
      await step.sendEvent(
        "gate-3-fanout",
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

    // Step 6: Slugger resolve — try to find the company's ATS for future polling
    await step.run("slugger-resolve", async () => {
      const { resolveSlugger } = await import("@/lib/jobs/seeders/slugger");
      return resolveSlugger(
        { companyName: jobData.company },
        { addToRetryOnFailure: false },
      );
    });

    return { jobId, candidates: candidates.length };
  },
);

// ── Daily Source Functions (TDD §2.2 — staggered cron schedule) ──────────────
//
// Each daily source runs on a staggered cron schedule to avoid concurrent
// execution contention with Inngest's 5-step limit on the Hobby plan.
// See CORPUS_EXPANSION_TDD §2.2 for the full schedule table.

/**
 * D1: Google CSE Date-Restricted Daily — direct slug extraction.
 * Runs at 00:00 and 14:00 UTC.
 */
export const dailySourceD1GoogleCse = inngest.createFunction(
  {
    id: "daily-source-google-cse",
    name: "Daily Source — Google CSE",
    triggers: [{ cron: "0 0,14 * * *" }],
  },
  async ({ step }) => {
    const { runGoogleCseDaily } = await import(
      "@/lib/jobs/seeders/batch-sources/google-cse"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_CSE_ID;

    if (!apiKey || !cseId) {
      await step.run("write-log", async () => {
        return writeIngestionLog({
          type: "seed",
          status: "failed",
          source: "google_cse",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage:
            "GOOGLE_CSE_API_KEY or GOOGLE_CSE_CSE_ID not configured",
          startedAt,
          finishedAt: new Date(),
        });
      });
      return { error: "Google CSE credentials not configured" };
    }

    const result = await step.run("fetch-and-process", async () => {
      return runGoogleCseDaily({ apiKey, cseId }, fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "google_cse",
        itemsProcessed: result.totalResultsFound,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D2: HN Algolia Daily ATS Link Mining — direct slug extraction.
 * Runs at 01:00 and 16:00 UTC.
 */
export const dailySourceD2HnAlgolia = inngest.createFunction(
  {
    id: "daily-source-hn-algolia",
    name: "Daily Source — HN Algolia",
    triggers: [{ cron: "0 1,16 * * *" }],
  },
  async ({ step }) => {
    const { runHnAlgoliaDailySeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/hn-algolia-daily"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runHnAlgoliaDailySeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalComments,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D3: Reddit RSS Hiring Feeds — direct slug extraction.
 * Runs at 02:00 and 18:00 UTC.
 */
export const dailySourceD3RedditRss = inngest.createFunction(
  {
    id: "daily-source-reddit-rss",
    name: "Daily Source — Reddit RSS",
    triggers: [{ cron: "0 2,18 * * *" }],
  },
  async ({ step }) => {
    const { runRedditRssSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/reddit-rss"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runRedditRssSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalPosts,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D4: Remote OK + Remotive + Himalayas — G3 job-level ingestion + Slugger.
 * Runs at 03:00 UTC.
 */
export const dailySourceD4RemoteJobBoards = inngest.createFunction(
  {
    id: "daily-source-remote-job-boards",
    name: "Daily Source — Remote Job Boards",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const { runRemoteJobBoardsSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/remote-job-boards"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runRemoteJobBoardsSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalJobs,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D5: We Work Remotely + Jobicy RSS — G3 job-level ingestion + Slugger.
 * Runs at 04:00 UTC.
 */
export const dailySourceD5WwrRss = inngest.createFunction(
  {
    id: "daily-source-wwr-rss",
    name: "Daily Source — We Work Remotely RSS",
    triggers: [{ cron: "0 4 * * *" }],
  },
  async ({ step }) => {
    const { runWwrRssSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/weworkremotely-rss"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runWwrRssSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalPosts,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D6: CertStream batch processing — Slugger (CT log domain matches).
 * Runs at 10:00 UTC.
 */
export const dailySourceD6CertStream = inngest.createFunction(
  {
    id: "daily-source-certstream",
    name: "Daily Source — CertStream",
    triggers: [{ cron: "0 10 * * *" }],
  },
  async ({ step }) => {
    const { runCertStreamProcessor } = await import(
      "@/lib/jobs/seeders/daily-sources/certstream-processor"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("collect-and-process", async () => {
      return runCertStreamProcessor(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalCertificates,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D7: Funding Signal Seeder — Slugger + retry queue.
 * Runs at 11:00 UTC.
 */
export const dailySourceD7FundingSignal = inngest.createFunction(
  {
    id: "daily-source-funding-signal",
    name: "Daily Source — Funding Signal",
    triggers: [{ cron: "0 11 * * *" }],
  },
  async ({ step }) => {
    const { runFundingSignalSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/funding-signal"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("process-retry-queue", async () => {
      return runFundingSignalSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalRetried,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D8: Product Hunt Daily Launches — Slugger (company names → ATS).
 * Runs at 05:00 UTC.
 */
export const dailySourceD8ProductHunt = inngest.createFunction(
  {
    id: "daily-source-producthunt",
    name: "Daily Source — Product Hunt",
    triggers: [{ cron: "0 5 * * *" }],
  },
  async ({ step }) => {
    const { runProductHuntDailySeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/producthunt-daily"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runProductHuntDailySeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalProducts,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D9: Company Engineering Blog RSS — Slugger (hiring mentions → ATS).
 * Runs at 06:00 UTC.
 */
export const dailySourceD9EngineeringBlogs = inngest.createFunction(
  {
    id: "daily-source-engineering-blogs",
    name: "Daily Source — Engineering Blogs RSS",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step }) => {
    const { runEngineeringBlogsRssSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/engineering-blogs-rss"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runEngineeringBlogsRssSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalPosts,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D10: GitHub Trending + CONTRIBUTING.md — Slugger (org → website → ATS).
 * Runs at 07:00 UTC.
 */
export const dailySourceD10GithubTrending = inngest.createFunction(
  {
    id: "daily-source-github-trending",
    name: "Daily Source — GitHub Trending",
    triggers: [{ cron: "0 7 * * *" }],
  },
  async ({ step }) => {
    const { runGithubTrendingSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/github-trending"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runGithubTrendingSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalRepos,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D11: Tech News RSS + LLM Extraction — Slugger (funding/hiring signals).
 * Runs at 08:00 UTC.
 */
export const dailySourceD11TechNewsRss = inngest.createFunction(
  {
    id: "daily-source-tech-news-rss",
    name: "Daily Source — Tech News RSS",
    triggers: [{ cron: "0 8 * * *" }],
  },
  async ({ step }) => {
    const { runTechNewsRssSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/tech-news-rss"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runTechNewsRssSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalArticles,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D12: NPM Registry New Packages — Slugger (org-scoped packages).
 * Runs at 09:00 UTC.
 */
export const dailySourceD12NpmRegistry = inngest.createFunction(
  {
    id: "daily-source-npm-registry",
    name: "Daily Source — NPM Registry",
    triggers: [{ cron: "0 9 * * *" }],
  },
  async ({ step }) => {
    const { runNpmRegistrySeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/npm-registry"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runNpmRegistrySeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalPackages,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * D13: Meta Ads Library — Slugger (employment ad companies).
 * Runs at 12:00 UTC.
 */
export const dailySourceD13MetaAds = inngest.createFunction(
  {
    id: "daily-source-meta-ads",
    name: "Daily Source — Meta Ads Library",
    triggers: [{ cron: "0 12 * * *" }],
  },
  async ({ step }) => {
    const { runMetaAdsSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/meta-ads"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runMetaAdsSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "hn_algolia",
        itemsProcessed: result.totalAds,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

// ── Batch Source Functions (TDD §2.1 — event-triggered for one-time flush) ───
//
// Batch sources are triggered manually via `inngest.send()` or the Inngest
// dashboard for the one-time flush (TDD Item 20). They can also be re-triggered
// for periodic refresh (monthly/quarterly).

/**
 * B1: Workable Meta-Search — direct slug extraction from Workable API.
 */
export const batchSourceB1Workable = inngest.createFunction(
  {
    id: "batch-source-workable-meta-search",
    name: "Batch Source — Workable Meta-Search",
    triggers: [{ event: "batch/workable-meta-search" }],
  },
  async ({ step }) => {
    const { runWorkableMetaSearch } = await import(
      "@/lib/jobs/seeders/batch-sources/workable-meta-search"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runWorkableMetaSearch(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "workable_meta_search",
        itemsProcessed: result.totalJobsFound,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B2: Google CSE Batch Sweep — direct slug extraction from Google CSE.
 */
export const batchSourceB2GoogleCse = inngest.createFunction(
  {
    id: "batch-source-google-cse",
    name: "Batch Source — Google CSE",
    triggers: [{ event: "batch/google-cse" }],
  },
  async ({ step }) => {
    const { runGoogleCseBatch } = await import(
      "@/lib/jobs/seeders/batch-sources/google-cse"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_CSE_ID;

    if (!apiKey || !cseId) {
      await step.run("write-log", async () => {
        return writeIngestionLog({
          type: "seed",
          status: "failed",
          source: "google_cse",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage:
            "GOOGLE_CSE_API_KEY or GOOGLE_CSE_CSE_ID not configured",
          startedAt,
          finishedAt: new Date(),
        });
      });
      return { error: "Google CSE credentials not configured" };
    }

    const result = await step.run("fetch-and-process", async () => {
      return runGoogleCseBatch({ apiKey, cseId }, fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "google_cse",
        itemsProcessed: result.totalResultsFound,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B3: YC Directory — Slugger (company names + websites → ATS).
 */
export const batchSourceB3YcDirectory = inngest.createFunction(
  {
    id: "batch-source-yc-directory",
    name: "Batch Source — YC Directory",
    triggers: [{ event: "batch/yc-directory" }],
  },
  async ({ step }) => {
    const { runYcDirectorySeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/yc-directory"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runYcDirectorySeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "yc_directory",
        itemsProcessed: result.totalHiringCompanies,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B4: VC Portfolio Mining — Slugger (company names from portfolio pages).
 */
export const batchSourceB4VcPortfolios = inngest.createFunction(
  {
    id: "batch-source-vc-portfolios",
    name: "Batch Source — VC Portfolios",
    triggers: [{ event: "batch/vc-portfolios" }],
  },
  async ({ step }) => {
    const { runVcPortfolioSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/vc-portfolios"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runVcPortfolioSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "vc_portfolio",
        itemsProcessed: result.totalCompaniesExtracted,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B5: Developer Newsletter Archives — direct slug extraction + Slugger.
 */
export const batchSourceB5NewsletterArchives = inngest.createFunction(
  {
    id: "batch-source-newsletter-archives",
    name: "Batch Source — Newsletter Archives",
    triggers: [{ event: "batch/newsletter-archives" }],
  },
  async ({ step }) => {
    const { runNewsletterArchiveSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/newsletter-archives"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runNewsletterArchiveSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "newsletter_archive",
        itemsProcessed: result.issuesCrawled,
        itemsInserted: result.directSlugInserts + result.sluggerResolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.sluggerUnresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B7: Wayback Machine CDX — direct slug extraction from archived URLs.
 */
export const batchSourceB7WaybackCdx = inngest.createFunction(
  {
    id: "batch-source-wayback-cdx",
    name: "Batch Source — Wayback CDX",
    triggers: [{ event: "batch/wayback-cdx" }],
  },
  async ({ step }) => {
    const { runWaybackCdxSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/wayback-cdx"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("fetch-and-process", async () => {
      return runWaybackCdxSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "wayback_cdx",
        itemsProcessed: result.totalRows,
        itemsInserted: result.insertResult.inserted,
        itemsUpdated: 0,
        itemsRejected: result.insertResult.rejected.length,
        itemsSkipped: result.insertResult.skipped,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B8: Rapid7 FDNS v2 CNAME Reversal — Slugger (CNAME → company domain).
 * Requires a local file path to the Rapid7 FDNS CNAME dataset.
 * The file path can be provided via event data or the RAPID7_FDNS_FILE_PATH
 * environment variable.
 */
export const batchSourceB8Rapid7Fdns = inngest.createFunction(
  {
    id: "batch-source-rapid7-fdns",
    name: "Batch Source — Rapid7 FDNS",
    triggers: [{ event: "batch/rapid7-fdns" }],
  },
  async ({ event, step }) => {
    const { runRapid7CnameSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/rapid7-cname"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();
    const filePath =
      (event.data as { filePath?: string })?.filePath ??
      process.env.RAPID7_FDNS_FILE_PATH;

    if (!filePath) {
      await step.run("write-log", async () => {
        return writeIngestionLog({
          type: "seed",
          status: "failed",
          source: "rapid7_fdns",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage:
            "RAPID7_FDNS_FILE_PATH not configured and no filePath in event data",
          startedAt,
          finishedAt: new Date(),
        });
      });
      return { error: "Rapid7 FDNS file path not configured" };
    }

    const result = await step.run("stream-and-process", async () => {
      return runRapid7CnameSeeder(filePath, fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "rapid7_fdns",
        itemsProcessed: result.totalRecords,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B9: Cross-Pollination from Job Descriptions — Slugger (company names from
 * existing job descriptions in the DB).
 */
export const batchSourceB9CrossPollination = inngest.createFunction(
  {
    id: "batch-source-cross-pollination",
    name: "Batch Source — Cross-Pollination",
    triggers: [{ event: "batch/cross-pollination" }],
  },
  async ({ step }) => {
    const { runCrossPollinationSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/cross-pollination"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("process-existing-jobs", async () => {
      return runCrossPollinationSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "cross_pollination",
        itemsProcessed: result.totalCompanyNames,
        itemsInserted: result.resolved,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.unresolved,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * B10: Sitemap.xml Probing — rescues companies where Slugger failed by probing
 * sitemap.xml, jobs/sitemap.xml, careers/sitemap.xml for ATS-powered links.
 */
export const batchSourceB10SitemapProbe = inngest.createFunction(
  {
    id: "batch-source-sitemap-probe",
    name: "Batch Source — Sitemap Probe",
    triggers: [{ event: "batch/sitemap-probe" }],
  },
  async ({ step }) => {
    const { runSitemapProbeSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/sitemap-probe"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("probe-sitemaps", async () => {
      return runSitemapProbeSeeder(fetch);
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.error ? "failed" : "success",
        source: "sitemap_probe",
        itemsProcessed: result.companiesProbed,
        itemsInserted: result.companiesInserted,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        errorMessage: result.error,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);
