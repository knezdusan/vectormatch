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
import { runSourceFunction } from "./source-helpers";

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
 * Used at line 340 and tested in src/lib/jobs/poller/__tests__/batch-poll.test.ts.
 * fallow reports it as unused because it is used in the same module and tests.
 */
// fallow-ignore-next-line unused-export
export function cronToTier(cron: string): "active_hot" | "active" | "dormant" {
  switch (cron) {
    case "0 */2 * * *":
      return "active_hot"; // every 2h — hot tier (G1)
    case "0 */12 * * *":
      return "active"; // every 12h — standard tier
    case "0 3 * * 1":
      return "dormant"; // weekly Monday 3am — dormant tier
    default:
      throw new Error(`Unknown cron trigger: ${cron}`);
  }
}

/**
 * Batch size — companies per batchPollTier function run (G5 TDD §1.2).
 *
 * Increased from 100 to 500 (July 2026) to reduce the active_hot polling
 * cycle from ~52h to ~10.5h. With 1,752 active_hot companies and a 2h cron,
 * the full cycle is now ~3.5h. The Greenhouse rate limiter (2 req/s) means
 * ~350 Greenhouse companies per batch take ~175s — well under the 300s route
 * maxDuration. POLL_CHUNK_SIZE=10 ensures checkpointed progress.
 */
const BATCH_SIZE = 500;

/**
 * Poll chunk size — companies per step.run() call within a batchPollTier run
 * (Sprint 7 healthcheck fix). Each chunk is a separate Inngest step so
 * progress is checkpointed: if a chunk stalls (e.g. a hanging ATS endpoint)
 * and the step times out, only that chunk is retried — previously completed
 * chunks are not redone. 10 companies/chunk × up to ~10s per request
 * (fetchWithTimeout) keeps a single chunk's worst case well under Inngest's
 * step/function time budget even for SmartRecruiters companies that trigger
 * multiple detail fetches.
 */
const POLL_CHUNK_SIZE = 10;

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
 *   - every 2h cron   → active_hot  (G1 tier, companies with recent approved matches)
 *   - every 12h cron  → active      (standard tier, companies with recent job posts)
 *   - weekly Mon 3am  → dormant     (dormant tier, companies with no recent activity)
 *
 * Flow:
 *   1. get-batch:          Query up to 100 companies for the tier, ordered by
 *                          lastPolledAt ASC NULLS FIRST (fairest scheduling).
 *   2. poll-batch:         Poll each company sequentially (phalanx-poller already
 *                          enforces 2 req/s per ATS via Bottleneck). Error isolation:
 *                          one company's failure doesn't stop the batch.
 *   3. find-unnormalized:  Query the DB for unnormalized jobs from the polled
 *                          companies. This is a DB-based fallback that works
 *                          even when the poll-batch step timed out and retried
 *                          (on retry, pollCompany returns newJobIds: [] because
 *                          the jobs already exist, but the DB query still finds
 *                          them as unnormalized).
 *   4. emit-job-ingested:  Emit `job/ingested` events for all unnormalized jobs.
 *                          The `jobIngestedHandler` handles normalization +
 *                          embedding + Gate 1+2 + Gate 3 fan-out. This provides:
 *                          - Automatic retry via Inngest's built-in retry mechanism
 *                          - Better observability (each job is a separate run)
 *                          - Consistent normalization path (both manual and
 *                            batch polls use the same handler)
 *   5. write-log:          Write an ingestion_log entry for observability.
 *
 * Sprint 7 change: Previously, this function did inline normalization + Gate
 * 1+2 + Gate 3 fan-out. This was fragile: if the `poll-batch` step timed out
 * and retried, `allNewJobIds` was empty (jobs already in DB) → no normalization
 * → jobs stuck as `active` + `normalized_at IS NULL` forever. The event-driven
 * approach with a DB query is robust against this failure mode.
 *
 * Concurrency: limit 5. Multiple batchPollTier instances can run concurrently
 * if triggered by different crons, but no more than 5 at once.
 *
 * TDD reference: CORPUS_EXPANSION_TDD §1.2 (replaces TDD §4.4 fan-out pattern)
 */
export const batchPollTier = inngest.createFunction(
  {
    id: "poller-batch-poll-tier",
    name: "Batch Poll Tier",
    triggers: [
      { cron: "0 */2 * * *" }, // every 2h — hot tier
      { cron: "0 */12 * * *" }, // every 12h — standard tier
      { cron: "0 3 * * 1" }, // weekly Monday 3am — dormant tier
    ],
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    // Determine tier from the cron string that triggered this run.
    const tier = cronToTier((event.data as { cron?: string }).cron ?? "");
    const startedAt = new Date();

    // Step 1: Get batch of companies for this tier
    const companies = await step.run("get-batch", async () => {
      const { getBatchForTier } = await import(
        "@/lib/jobs/poller/tier-queries"
      );
      return getBatchForTier(tier, BATCH_SIZE);
    });

    if (companies.length === 0) {
      await step.run("write-log-empty", async () => {
        return writeIngestionLog({
          type: "batch_poll",
          status: "success",
          source: `batch_poll_${tier}`,
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          startedAt,
          finishedAt: new Date(),
        });
      });
      return { tier, polled: 0, newJobs: 0, eventsEmitted: 0 };
    }

    // Step 2: Poll companies in small chunks (rate-limited per ATS).
    //
    // Sprint 7 healthcheck finding: this was previously ONE monolithic
    // step.run() looping over all 100 companies sequentially. Production
    // evidence showed only ~3-6 companies were actually being polled per 3h
    // cron cycle (vs. the 100 target) — the step was stalling (likely on a
    // slow/hanging ATS endpoint, see fetchWithTimeout fix) and never
    // completing, so Inngest kept retrying the ENTIRE step from scratch,
    // making near-zero net progress.
    //
    // Fix: split into POLL_CHUNK_SIZE-sized sub-batches, each its own
    // step.run() call (same pattern as the normalize-N sub-batching below).
    // Inngest checkpoints each completed step — if a later chunk times out
    // and the function retries, already-completed chunks are NOT re-run,
    // so progress accumulates monotonically instead of resetting to zero.
    const pollResults: Array<{
      companyId: string;
      atsSource: string;
      atsSlug: string;
      newJobIds: string[];
      error?: string;
    }> = [];

    for (let i = 0; i < companies.length; i += POLL_CHUNK_SIZE) {
      const chunk = companies.slice(i, i + POLL_CHUNK_SIZE);
      const stepName = `poll-chunk-${Math.floor(i / POLL_CHUNK_SIZE) + 1}`;

      const chunkResults = await step.run(stepName, async () => {
        const { pollCompany } = await import(
          "@/lib/jobs/poller/phalanx-poller"
        );
        const results: typeof pollResults = [];
        for (const c of chunk) {
          try {
            const result = await pollCompany(
              c.id,
              c.atsSource,
              c.atsSlug,
              fetch,
            );
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

      pollResults.push(...chunkResults);
    }

    // Collect new job IDs from the poll (for metrics). This may be empty if
    // a chunk timed out and retried (jobs already in DB).
    const allNewJobIds = pollResults.flatMap((r) => r.newJobIds);
    const errorCount = pollResults.filter((r) => r.error).length;

    // Step 3: Find unnormalized jobs from the polled companies via DB query.
    // This is the robust fallback: even if allNewJobIds is empty (retry case),
    // the DB query finds jobs that were inserted but never normalized.
    // We query by the polled companies' atsSource + atsSlug values.
    const unnormalizedJobs = await step.run("find-unnormalized", async () => {
      const { sql, inArray } = await import("drizzle-orm");
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");

      const polledSlugs = companies.map((c) => c.atsSlug);
      const polledSources = [...new Set(companies.map((c) => c.atsSource))];

      // Query unnormalized jobs from the polled companies. A job needs
      // normalization if:
      //   - status = 'active' AND normalizedAt IS NULL (never normalized)
      //   - OR status = 'normalization_failed' (retryable failure)
      // AND rawJson IS NOT NULL (the normalizer needs it to extract content).
      // The inArray filters on atsSource and atsSlug are parameterized (safe
      // from injection). They may match a few cross-source slug collisions,
      // but the jobIngestedHandler idempotency guard makes this harmless.
      // Limit to 500 per run to avoid overwhelming the jobIngestedHandler.
      const result = await db
        .select({
          id: job.id,
          atsSource: job.atsSource,
          atsSlug: job.atsSlug,
        })
        .from(job)
        .where(
          sql`(${job.status} = 'normalization_failed'
               OR (${job.status} = 'active' AND ${job.normalizedAt} IS NULL))
              AND ${job.rawJson} IS NOT NULL
              AND ${inArray(job.atsSource, polledSources)}
              AND ${inArray(job.atsSlug, polledSlugs)}`,
        )
        .orderBy(job.detectedAt)
        .limit(500);

      return result;
    });

    // Step 4: Emit job/ingested events for all unnormalized jobs.
    // The jobIngestedHandler handles normalization + embedding + Gate 1+2 +
    // Gate 3 fan-out. Its idempotency guard (§4.6) ensures already-normalized
    // jobs are skipped, so duplicate events are safe.
    if (unnormalizedJobs.length > 0) {
      await step.sendEvent(
        "emit-job-ingested",
        unnormalizedJobs.map((j) => ({
          id: `job-ingested-batch-${j.id}-${Date.now()}`,
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

    // Step 5: Write ingestion log for observability.
    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "batch_poll",
        status: errorCount > 0 ? "partial" : "success",
        source: `batch_poll_${tier}`,
        itemsProcessed: companies.length,
        itemsInserted: allNewJobIds.length,
        itemsUpdated: 0,
        itemsRejected: errorCount,
        itemsSkipped:
          companies.length -
          pollResults.filter((r) => r.newJobIds.length > 0).length,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return {
      tier,
      polled: companies.length,
      newJobs: allNewJobIds.length,
      eventsEmitted: unnormalizedJobs.length,
      errors: errorCount,
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
 * Quality Flywheel Recalculation — Q2 (CORPUS_EXPANSION_TDD §3.2)
 *
 * Triggers: cron "0 4 * * *" (daily at 04:00 UTC, after tier recalc)
 *
 * Recalculates per-company quality scores from match_queue data and
 * promotes/demotes company tiers:
 *   - score > 50 AND approvedMatches > 3 → promote to active_hot
 *   - score < 10 AND totalJobsProcessed > 20 → demote to dormant
 *   - 0 approved in 90 days → purge candidate (logged, not auto-deleted)
 */
export const qualityFlywheelRecalc = inngest.createFunction(
  {
    id: "quality-flywheel-recalc",
    name: "Quality Flywheel Recalculation",
    // Sprint 3 Task 8: staggered to 04:30 UTC (30 min after tierRecalc at
    // 04:00) to avoid race conditions on the company.tier column — both
    // functions read/write tier and concurrent execution caused
    // non-deterministic final state.
    triggers: [{ cron: "30 4 * * *" }],
  },
  async ({ step }) => {
    const { recalculateQualityScores } = await import(
      "@/lib/jobs/quality/quality-flywheel"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("recalculate-quality-scores", async () => {
      return recalculateQualityScores();
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        source: "quality_flywheel",
        status: "success",
        itemsProcessed: result.companiesScored,
        itemsInserted: 0,
        itemsUpdated: result.promoted + result.demoted,
        itemsRejected: 0,
        itemsSkipped: result.purgeCandidates,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
  },
);

/**
 * Layoff Signal Checker — Q3 (CORPUS_EXPANSION_TDD §3.3)
 *
 * Triggers: cron "0 5 * * *" (daily at 05:00 UTC, after tier recalc + quality flywheel)
 *
 * Fetches Layoffs.fyi RSS feed, matches company names against the corpus,
 * and demotes affected companies from active_hot to active (reduced polling
 * frequency — they may still have open roles).
 */
export const layoffSignalChecker = inngest.createFunction(
  {
    id: "layoff-signal-checker",
    name: "Layoff Signal Checker",
    triggers: [{ cron: "0 5 * * *" }],
  },
  async ({ step }) => {
    const { checkLayoffSignals } = await import(
      "@/lib/jobs/quality/layoff-signals"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("check-layoff-signals", async () => {
      return checkLayoffSignals();
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        source: "layoff_signal_checker",
        status: "success",
        itemsProcessed: result.layoffsParsed,
        itemsInserted: 0,
        itemsUpdated: result.companiesDemoted,
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
 * G8 — Aggressive Job Cleanup + Retention Policies.
 *
 * Triggers: cron "0 2 * * *" (daily at 02:00 UTC — runs BEFORE staleCleanup
 * at 03:00 so the stale-marker pass operates on a pruned corpus).
 *
 * Deletes terminal-state rows from the high-growth tables to keep the database
 * within the Neon Free 512MB storage tier:
 *   1. rejected / gone / normalization_failed jobs (1d / 7d / 7d retention)
 *   2. approved/rejected match_queue rows (90d retention)
 *   3. ingestion_log entries (30d retention)
 *   4. exhausted slugger_retry rows (30d past next_retry_at + retry_count >= 3)
 *
 * The `job` table has `ON DELETE CASCADE` from `match_queue`, so deleting jobs
 * automatically reclaims their match_queue rows — no separate cleanup needed
 * for matches belonging to deleted jobs.
 *
 * TDD reference: CORPUS_EXPANSION_TDD §1.8 (G8).
 */
export const aggressiveCleanup = inngest.createFunction(
  {
    id: "aggressive-cleanup",
    name: "Aggressive Cleanup (G8)",
    triggers: [{ cron: "0 2 * * *" }],
  },
  async ({ step }) => {
    const {
      deleteExhaustedSluggerRetries,
      deleteGoneJobs,
      deleteNormalizationFailedJobs,
      deleteOldIngestionLogs,
      deleteOldTerminalMatches,
      deleteRejectedJobs,
    } = await import("@/lib/jobs/poller/cleanup-queries");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const rejected = await step.run("delete-rejected-jobs", async () => {
      return deleteRejectedJobs();
    });
    const gone = await step.run("delete-gone-jobs", async () => {
      return deleteGoneJobs();
    });
    const failed = await step.run(
      "delete-normalization-failed-jobs",
      async () => {
        return deleteNormalizationFailedJobs();
      },
    );
    const matches = await step.run("delete-old-terminal-matches", async () => {
      return deleteOldTerminalMatches();
    });
    const logs = await step.run("delete-old-ingestion-logs", async () => {
      return deleteOldIngestionLogs();
    });
    const retries = await step.run(
      "delete-exhausted-slugger-retries",
      async () => {
        return deleteExhaustedSluggerRetries();
      },
    );

    const totalDeleted =
      rejected.deletedCount +
      gone.deletedCount +
      failed.deletedCount +
      matches.deletedCount +
      logs.deletedCount +
      retries.deletedCount;

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "stale_cleanup",
        status: "success",
        source: "aggressive_cleanup",
        itemsProcessed: totalDeleted,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        errorDetails: {
          rejectedJobs: rejected.deletedCount,
          goneJobs: gone.deletedCount,
          normalizationFailedJobs: failed.deletedCount,
          terminalMatches: matches.deletedCount,
          ingestionLogs: logs.deletedCount,
          sluggerRetries: retries.deletedCount,
        },
        startedAt,
        finishedAt: new Date(),
      });
    });

    return {
      rejectedJobs: rejected.deletedCount,
      goneJobs: gone.deletedCount,
      normalizationFailedJobs: failed.deletedCount,
      terminalMatches: matches.deletedCount,
      ingestionLogs: logs.deletedCount,
      sluggerRetries: retries.deletedCount,
      totalDeleted,
    };
  },
);

/**
 * Weekly VACUUM ANALYZE — reclaims space from dead tuples left by the daily
 * G8 DELETEs. Runs Sunday 02:00 UTC (off-peak).
 *
 * Uses `VACUUM ANALYZE` (not `VACUUM FULL`) — no exclusive lock, safe during
 * normal traffic. `VACUUM FULL` should only be run manually if storage
 * exceeds 480MB and during a maintenance window.
 *
 * TDD reference: CORPUS_EXPANSION_TDD §1.8 (G8) — weekly maintenance.
 */
export const vacuumAnalyze = inngest.createFunction(
  {
    id: "vacuum-analyze",
    name: "Weekly VACUUM ANALYZE",
    triggers: [{ cron: "0 2 * * 0" }],
  },
  async ({ step }) => {
    const { vacuumAnalyze: runVacuumAnalyze } = await import(
      "@/lib/jobs/poller/cleanup-queries"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    await step.run("vacuum-analyze", async () => {
      return runVacuumAnalyze();
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "stale_cleanup",
        status: "success",
        source: "vacuum_analyze",
        itemsProcessed: 0,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return { vacuumed: true };
  },
);

/**
 * Slugger Retry Queue Processor — Sprint 3 Task 6.
 *
 * Triggers: cron "0 0 * * 1" (weekly, Monday 00:00 UTC).
 *
 * Re-runs the Slugger for companies that failed initial resolution and were
 * added to the `slugger_retry` queue. On success, the retry entry is deleted
 * (the company is now in the corpus). On failure, the retry count is
 * incremented with exponential backoff (7d → 14d → 28d). After 3 failures the
 * entry stays for manual review until G8 cleanup reclaims it after 30 days.
 */
export const sluggerRetryProcessor = inngest.createFunction(
  {
    id: "slugger-retry-processor",
    name: "Slugger Retry Queue Processor",
    triggers: [{ cron: "0 0 * * 1" }],
  },
  async ({ step }) => {
    const { processRetryQueue } = await import(
      "@/lib/jobs/seeders/slugger-retry-processor"
    );
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const result = await step.run("process-retry-queue", async () => {
      return processRetryQueue();
    });

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "seed",
        status: result.errors.length > 0 ? "partial" : "success",
        source: "slugger_retry_processor",
        itemsProcessed: result.processed,
        itemsInserted: result.succeeded,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: result.failed,
        errorMessage:
          result.errors.length > 0 ? result.errors.join("; ") : undefined,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return result;
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
 * Normalization Retry Sweep — re-processes stuck jobs (normalization_failed OR
 * active-but-never-normalized).
 *
 * Triggers: cron "0 6 * * *" (daily at 06:00 UTC)
 *
 * Two categories of stuck jobs are re-processed:
 *
 * 1. `status = "normalization_failed"` — jobs where the normalizer or LLM
 *    fallback threw an error (OpenAI timeout, rate limit, malformed data).
 *    These have no `normalizedAt` (by design — they're retryable).
 *
 * 2. `status = "active" AND normalizedAt IS NULL` — jobs that were detected
 *    and inserted but NEVER entered the normalization loop. This happens when
 *    `batchPollTier`'s `poll-batch` step times out and retries: on retry,
 *    `upsertJobs` finds the jobs already exist → `newJobIds = []` → the
 *    function returns early without normalizing. These jobs remain `active`
 *    with `normalizedAt IS NULL` indefinitely without this sweep.
 *
 * Both categories are re-emitted as `job/ingested` events. The
 * `jobIngestedHandler` idempotency guard (§4.6) ensures safe re-processing:
 *   - `normalization_failed` → re-normalizes (retry)
 *   - `active` + `normalizedAt IS NULL` → normalizes for the first time
 *   - Already-normalized jobs → skipped (normalizedAt IS NOT NULL)
 *
 * Limit: 200 jobs per run (increased from 50 to handle backlog of stuck jobs).
 * At ~2s per job (LLM fallback + embedding), 200 jobs = ~400s, within the
 * Inngest step timeout. The `jobIngestedHandler` concurrency cap (10) limits
 * parallel OpenAI calls.
 *
 * TDD reference: §4.6 (Idempotency Decision Tree) — leverages the retryable
 * nature of normalization_failed and unnormalized jobs.
 */
export const normalizationRetrySweep = inngest.createFunction(
  {
    id: "poller-normalization-retry",
    name: "Normalization Retry Sweep",
    // Every 4 hours — the daily schedule (0 6 * * *) was too slow to clear
    // normalization backlogs. With a 2000-job limit per run and 4h cadence,
    // throughput is 12000/day (6 runs × 2000), enough to keep up with peak
    // ingestion bursts (e.g. 3634 jobs from a single Greenhouse poll).
    triggers: [{ cron: "0 */4 * * *" }],
  },
  async ({ step }) => {
    const { sql } = await import("drizzle-orm");
    const { db } = await import("@/db/db");
    const { job } = await import("@/db/schemas/jobs/job");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    const stuckJobs = await step.run("get-stuck-jobs", async () => {
      // Select up to 2000 jobs that need (re-)normalization, prioritizing the
      // oldest ones (they've been waiting the longest). Two categories:
      //   1. normalization_failed (retryable — LLM/transient error)
      //   2. active + normalizedAt IS NULL (never normalized — batchPollTier
      //      poll-batch step timeout/retry left them unprocessed)
      // Both must have rawJson IS NOT NULL — the normalizer needs it to
      // extract content. Jobs with rawJson = NULL have already been
      // normalized (G7 prunes rawJson after normalization) and should have
      // normalizedAt set, so this filter is a safety net.
      //
      // Limit raised from 500 → 2000 to clear backlogs faster. The
      // jobIngestedHandler has concurrency 10, so 2000 events are processed
      // in ~10 minutes (2000/10 × ~3s per LLM call). The 4h cron cadence
      // gives 6 runs/day = 12000 jobs/day max throughput.
      const result = await db
        .select({
          id: job.id,
          atsSource: job.atsSource,
          atsSlug: job.atsSlug,
        })
        .from(job)
        .where(
          sql`(${job.status} = 'normalization_failed' OR (${job.status} = 'active' AND ${job.normalizedAt} IS NULL)) AND ${job.rawJson} IS NOT NULL`,
        )
        .orderBy(job.detectedAt)
        .limit(2000);

      return result;
    });

    if (stuckJobs.length > 0) {
      await step.sendEvent(
        "retry-normalization",
        stuckJobs.map((j) => ({
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
        itemsProcessed: stuckJobs.length,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return { retried: stuckJobs.length };
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
    // §4.5 — concurrency 10 balances throughput against Neon pooler
    // headroom (max: 20). Originally 15, lowered to 5 under the Inngest
    // free plan concurrency cap; raised to 10 after Sprint 5 self-hosting
    // migration removed the Cloud concurrency limit.
    concurrency: { limit: 10 },
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
            // AI-generated candidate-facing summary (added July 2026).
            shortDescription: normalization.summary,
            // status stays 'active' — normalizedAt indicates normalization done
          })
          .where(eq(job.id, jobId));
      } else if (normalization.status === "rejected") {
        // Title-only degradation observability — log when a job is rejected
        // because its content was too short (< 100 chars). This indicates
        // either a failed detail fetch or an ATS source with no detail
        // endpoint. Tracking these helps identify which ATS sources need
        // detail fetch fallbacks.
        if (normalization.rejectionReason === "title_only") {
          console.warn(
            `[jobIngestedHandler] Title-only rejection for job ${jobId} (atsSource=${decision.job.atsSource}, fullTextLen=${normalization.fullText.length}): content too short for quality embedding`,
          );
        }
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
        // Sprint 7: Log the error for observability — the previous code
        // silently swallowed normalization errors, making it impossible to
        // diagnose why jobs were failing (e.g. OpenAI API key not set,
        // rate limiting, malformed SmartRecruiters detail data).
        console.error(
          `[jobIngestedHandler] Normalization failed for job ${jobId} (atsSource=${decision.job.atsSource}):`,
          normalization.error ?? "unknown error",
        );
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
    // Inngest's per-function concurrency cap (10) naturally limits
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

// ── Job Summary Backfill (added July 2026) ───────────────────────────────────

/**
 * Job Summary Backfill Sweep — finds active jobs without an AI-generated
 * shortDescription and emits `job/summarize` events for them.
 *
 * Trigger: cron every 6 hours (4x/day). Once all jobs are backfilled, the
 * query returns 0 rows and the function becomes a cheap no-op.
 *
 * Uses event fan-out so the per-job handler respects the concurrency limit
 * and avoids OpenAI rate limits.
 */
export const jobSummaryBackfill = inngest.createFunction(
  {
    id: "job-summary-backfill",
    name: "Job Summary Backfill Sweep",
    triggers: [{ cron: "0 */6 * * *" }],
  },
  async ({ step }) => {
    const jobs = await step.run("find-jobs-without-summary", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { sql } = await import("drizzle-orm");

      return await db
        .select({ id: job.id })
        .from(job)
        .where(
          sql`${job.status} = 'active' AND ${job.shortDescription} IS NULL AND ${job.normalizedAt} IS NOT NULL`,
        )
        .limit(200);
    });

    if (jobs.length === 0) {
      return { queued: 0 };
    }

    await step.sendEvent(
      "summarize-fan-out",
      jobs.map((j) => ({
        id: `job-summarize-${j.id}-${Date.now()}`,
        name: "job/summarize",
        data: { jobId: j.id },
      })),
    );

    return { queued: jobs.length };
  },
);

/**
 * Job Summarize Handler — generates one AI summary and writes it to the job row.
 *
 * Triggered by: `job/summarize` event (emitted by jobSummaryBackfill).
 * Concurrency limit 10 matches the existing normalization handler to avoid
 * OpenAI rate limit exhaustion.
 */
export const jobSummarizeHandler = inngest.createFunction(
  {
    id: "job-summarize-handler",
    name: "Job Summarize — Backfill One Job",
    triggers: [{ event: "job/summarize" }],
    concurrency: { limit: 10 },
  },
  async ({ event, step }) => {
    const { jobId } = event.data;

    const jobRow = await step.run("fetch-job", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { eq } = await import("drizzle-orm");

      const rows = await db
        .select({
          id: job.id,
          atsSource: job.atsSource,
          title: job.title,
          rawJson: job.rawJson,
          normalizedText: job.normalizedText,
          shortDescription: job.shortDescription,
          normalizedAt: job.normalizedAt,
        })
        .from(job)
        .where(eq(job.id, jobId))
        .limit(1);

      return rows[0] ?? null;
    });

    if (!jobRow || jobRow.shortDescription || !jobRow.normalizedAt) {
      return { skipped: true, reason: "already summarized or not normalized" };
    }

    const summary = await step.run("summarize", async () => {
      const { extractJobContent, summarizeJobLLM } = await import(
        "@/lib/jobs/job-normalizer"
      );
      const { fullText, title } = extractJobContent(
        jobRow.atsSource,
        jobRow.rawJson,
        jobRow.title,
        jobRow.normalizedText,
      );
      if (fullText.length < 100) return null;
      return await summarizeJobLLM(fullText, title);
    });

    if (!summary) {
      return { skipped: true, reason: "summary generation returned empty" };
    }

    await step.run("write-summary", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { eq } = await import("drizzle-orm");

      await db
        .update(job)
        .set({ shortDescription: summary })
        .where(eq(job.id, jobId));
    });

    return { summarized: true };
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
    // §6.1 — concurrency 10 balances OpenAI 500 RPM (~8 concurrent
    // evaluations) against Neon pooler headroom (max: 20). Originally 15,
    // lowered to 5 under the Inngest free plan concurrency cap; raised to
    // 10 after Sprint 5 self-hosting migration removed the Cloud concurrency
    // limit. At 10 concurrent evaluations, each holding a DB connection for
    // ~100ms (read) + ~100ms (write) around a ~3-5s LLM call, the pooler
    // sees ~20 short-lived acquisitions per second — within PgBouncer's
    // budget.
    concurrency: { limit: 10 },
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
    // Sprint 3 Task 9: reduced from every 15 min (2,880 runs/month) to every
    // 30 min (1,440 runs/month) — halves Inngest execution cost. Users check
    // daily, not hourly; a 30-min feedback delay is acceptable.
    triggers: [{ cron: "0,30 * * * *" }],
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
    // Use a timestamp suffix on the event ID so each sweep run produces unique
    // events. A deterministic ID (e.g. `gate-3-sweep-${row.id}`) would be
    // deduplicated by Inngest if the first Gate 3 run failed or skipped —
    // leaving the row stuck pending forever.
    const sweepTs = Date.now();
    await step.sendEvent(
      "sweep-fan-out",
      result.map((row) => ({
        id: `gate-3-sweep-${row.id}-${sweepTs}`,
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

    // ── Step 1: Re-evaluate rejected matches (existing behavior) ───────────
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

    // Emit Gate 3 events for each re-evaluated rejected row.
    // Use a timestamp suffix so repeated persona updates produce unique events
    // (see pending-queue-sweep for the same deduplication rationale).
    if (result.count > 0) {
      const feedbackTs = Date.now();
      await step.sendEvent(
        "feedback-fan-out",
        result.rows.map((row) => ({
          id: `gate-3-feedback-${row.id}-${feedbackTs}`,
          name: "match/gate-3-evaluate" as const,
          data: {
            matchQueueId: row.id,
            jobId: row.jobId,
            personaId: row.personaId,
            applicantId: row.applicantId,
          },
        })),
      );
    }

    // ── Step 2 (Sprint 8): Match NEW jobs that were never evaluated ────────
    // When a persona is created or updated, find active+embedded jobs that
    // have tag overlap with this persona but are NOT in match_queue. These
    // jobs were never matched (e.g., they existed before the persona was
    // created, or were missed by the matching pipeline). Trigger bulk
    // reprocess for this persona to evaluate them.
    const newJobsCount = await step.run("find-new-jobs-count", async () => {
      const { db } = await import("@/db/db");
      const { sql } = await import("drizzle-orm");

      const result = await db.execute(sql`
        SELECT count(*)::int AS cnt
        FROM job j, persona p
        WHERE p.id = ${personaId}::uuid
          AND j.status = 'active'
          AND j.job_embedding IS NOT NULL
          AND j.extracted_tags && p.must_have_tags
          AND NOT EXISTS (
            SELECT 1 FROM match_queue mq
            WHERE mq.job_id = j.id AND mq.persona_id = p.id
          )
      `);
      return Number(result.rows[0]?.cnt ?? 0);
    });

    // If there are unmatched jobs, trigger bulk reprocess for this persona
    if (newJobsCount > 0) {
      await step.sendEvent(
        `match-bulk-reprocess-persona-${personaId}-${Date.now()}`,
        {
          name: "match/bulk-reprocess",
          data: {
            personaId,
            includeRejected: false,
          },
        },
      );
    }

    return {
      personaId,
      reEvaluated: result.count,
      newJobsTriggered: newJobsCount,
    };
  },
);

// ── Sprint 8: Bulk Reprocessing ──────────────────────────────────────────────

/**
 * Match Bulk Reprocess — re-evaluates ALL active+embedded jobs against ALL
 * personas (or a specific persona). This is the key mechanism for retroactively
 * matching existing jobs when personas are created/updated, when filters are
 * relaxed, or when jobs were missed by the normal matching pipeline.
 *
 * Triggered by: `match/bulk-reprocess` event (manual trigger from admin dashboard)
 *
 * This function bypasses the `jobIngestedHandler` idempotency check (which skips
 * already-normalized jobs) and runs Gate 1+2 directly on jobs that are already
 * normalized+embedded but NOT in match_queue for the target persona(s).
 *
 * The cross-posting dedup and workplace pre-filter have been relaxed in Sprint 8,
 * so `runGateSQLRouter` now allows re-evaluation of jobs whose siblings were
 * rejected and lets Gate 3 decide on hybrid/on-site workplace fit.
 *
 * Processing is batched (50 jobs per step) to control DB load and OpenAI API
 * rate limits. Each batch runs Gate 1+2 for all jobs, then fans out Gate 3
 * events for the resulting candidates.
 */
export const matchBulkReprocess = inngest.createFunction(
  {
    id: "match-bulk-reprocess",
    name: "Match Bulk Reprocess",
    triggers: [{ event: "match/bulk-reprocess" }],
    // Only one bulk reprocess at a time — this is a heavy operation
    concurrency: { limit: 1 },
  },
  async ({ event, step }) => {
    const personaId: string | null = event.data.personaId ?? null;
    const includeRejected: boolean = event.data.includeRejected ?? false;

    // Step 1: Get active+embedded job IDs that are NOT in match_queue for the
    // target persona(s). We fetch ONLY job IDs here — not embeddings — to keep
    // the step response body small. Even job IDs add up: 5000 UUIDs is ~180KB,
    // and the whole function response body must stay under Inngest's 1MB limit.
    // 1000 IDs (~36KB) is safe. The function can be re-run to process the rest.
    //
    // When personaId is null (sweep mode), we JOIN with persona and check
    // per-persona: a job is included if it has tag overlap with a persona AND
    // no match_queue entry for THAT persona. This ensures jobs that have
    // entries for persona A but not persona B are still processed. The
    // runGateSQLRouter's ON CONFLICT (job_id, persona_id) DO UPDATE handles
    // any duplicates safely.
    const jobIds = await step.run("get-unmatched-jobs", async () => {
      const { db } = await import("@/db/db");
      const { sql } = await import("drizzle-orm");

      const result = await db.execute(sql`
        SELECT DISTINCT ON (j.id) j.id, j.detected_at
        FROM job j
        ${personaId ? sql`` : sql`JOIN persona p ON (j.extracted_tags && p.must_have_tags)`}
        WHERE j.status = 'active'
          AND j.job_embedding IS NOT NULL
          AND j.extracted_tags IS NOT NULL
          AND cardinality(j.extracted_tags) > 0
          ${personaId ? sql`AND EXISTS (SELECT 1 FROM persona p WHERE p.id = ${personaId}::uuid AND j.extracted_tags && p.must_have_tags)` : sql`AND p.persona_embedding IS NOT NULL`}
          AND NOT EXISTS (
            SELECT 1 FROM match_queue mq
            WHERE mq.job_id = j.id
            ${personaId ? sql`AND mq.persona_id = ${personaId}::uuid` : sql`AND mq.persona_id = p.id`}
            ${includeRejected ? sql`AND mq.status = 'approved'` : sql``}
          )
        ORDER BY j.id, j.detected_at DESC
        LIMIT 1000
      `);

      return result.rows.map((row) => row.id as string);
    });

    if (jobIds.length === 0) {
      return {
        reprocessed: 0,
        candidates: 0,
        reason: "No unmatched jobs found",
      };
    }

    // Step 2: Process jobs in batches of 25, loading tags + embeddings per
    // batch and running Gate 1+2 + Gate 3 fan-out INSIDE the step. Keeping
    // batches small avoids Inngest's response size limit:
    //   - Each batch step returns only { count } (tiny response)
    //   - Each batch loads at most 25 embeddings (~25 × 12KB = 300KB), well
    //     under the 1MB response size limit
    const BATCH = 25;
    let totalCandidates = 0;

    for (let i = 0; i < jobIds.length; i += BATCH) {
      const batchIds = jobIds.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      const stepName = `reprocess-batch-${batchNum}`;

      const batchResult = await step.run(stepName, async () => {
        const { db } = await import("@/db/db");
        const { sql } = await import("drizzle-orm");
        const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");

        // Build a UUID array literal for the WHERE clause.
        // Drizzle's parameterized array binding doesn't work with ANY() —
        // it expands to ($1, $2, ...) which Postgres treats as a record,
        // not an array. Using a raw array literal avoids this issue.
        // UUIDs are safe to interpolate (validated by the DB in the prior query).
        const uuidArraySql = `ARRAY[${batchIds.map((id) => `'${id}'`).join(",")}]::uuid[]`;

        // Load tags + embeddings for this batch only.
        // Re-check status = 'active' and job_embedding IS NOT NULL in case the
        // job was deactivated or re-normalized between step 1 and this batch.
        const result = await db.execute(sql`
          SELECT
            j.id,
            j.extracted_tags,
            j.job_embedding::text AS job_embedding_str
          FROM job j
          WHERE j.id = ANY(${sql.raw(uuidArraySql)})
            AND j.status = 'active'
            AND j.job_embedding IS NOT NULL
        `);

        const jobs = result.rows.map((row) => ({
          id: row.id as string,
          extractedTags: (row.extracted_tags as string[]) ?? [],
          jobEmbedding: parseVectorString(row.job_embedding_str as string),
        }));

        const candidates: {
          matchQueueId: string;
          jobId: string;
          personaId: string;
          applicantId: string;
        }[] = [];

        // Run Gate 1+2 for all jobs in the batch in parallel.
        // Sequential processing (25 jobs × ~3s each = 75s per batch) was the
        // bottleneck causing 41+ minute runs. Parallelizing with Promise.all
        // cuts each batch to ~3-5s (limited by DB connection pool concurrency).
        const batchResults = await Promise.all(
          jobs.map((j) =>
            runGateSQLRouter(j.id, j.extractedTags, j.jobEmbedding).then(
              (jobCandidates) =>
                jobCandidates.map((c) => ({
                  matchQueueId: c.matchQueueId,
                  jobId: j.id,
                  personaId: c.personaId,
                  applicantId: c.applicantId,
                })),
            ),
          ),
        );
        for (const jobCandidates of batchResults) {
          candidates.push(...jobCandidates);
        }

        // Fan out Gate 3 events inside the step — avoid returning the full
        // candidate array in the step response body.
        if (candidates.length > 0) {
          await step.sendEvent(
            `fan-out-gate-3-bulk-batch-${batchNum}`,
            candidates.map((c) => ({
              id: `gate-3-bulk-${c.matchQueueId}`,
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

        return { count: candidates.length };
      });

      totalCandidates += batchResult.count;
    }

    return {
      reprocessed: jobIds.length,
      candidates: totalCandidates,
      personaId,
      includeRejected,
    };
  },
);

/**
 * Parse a pgvector text string "[0.1,0.2,...]" into a number[].
 * Returns empty array if the input is null/empty/malformed.
 *
 * Exported for unit tests (src/inngest/__tests__/parse-vector.test.ts).
 * fallow sees it as unused because it is only imported by tests.
 */
// fallow-ignore-next-line unused-export
export function parseVectorString(str: string | null | undefined): number[] {
  if (!str || typeof str !== "string") return [];
  // pgvector format: [0.1,0.2,...]
  const trimmed = str.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return [];
  const inner = trimmed.slice(1, -1);
  if (!inner) return [];
  return inner.split(",").map((n) => Number.parseFloat(n.trim()));
}

// ── Sprint 8: Periodic Re-Matching Sweep ─────────────────────────────────────

/**
 * Match Retry Sweep — periodic sweep that catches any jobs missed by the normal
 * matching pipeline. Runs every 6 hours (cron "0 \u002A/6 * * *"), after the
 * normalization retry sweep (every 4h), so newly-normalized jobs are included.
 *
 * Finds active+embedded jobs that:
 *   - Have tag overlap with any persona (Gate 1 eligible)
 *   - Pass Gate 2 (cosine distance < threshold) for at least one persona
 *   - Are NOT in match_queue for any persona
 *
 * No time filter — the NOT EXISTS check against match_queue prevents duplicates,
 * and freshly inserted jobs are handled by jobIngestedHandler. This matches the
 * countUnmatchedEmbeddedJobs health monitor query (which also has no time filter).
 *
 * Triggers `match/bulk-reprocess` event, which runs Gate 1+2 + Gate 3 fan-out
 * for the unmatched jobs.
 */
export const matchRetrySweep = inngest.createFunction(
  {
    id: "match-retry-sweep",
    name: "Match Retry Sweep",
    // Every 6 hours — the daily schedule (0 7 * * *) was too infrequent to
    // catch jobs missed by the matching pipeline. With 4 runs/day, the
    // bulk reprocess can process up to 4000 unmatched jobs/day (4 × 1000).
    triggers: [{ cron: "0 */6 * * *" }],
  },
  async ({ step }) => {
    // Step 1: Find unmatched active+embedded jobs that pass Gate 1 (tag
    // overlap) AND Gate 2 (cosine distance) for some persona but have no
    // match_queue entry for that persona. The Gate 2 check avoids counting
    // jobs that were correctly filtered by cosine distance — those are not
    // "missed" by the pipeline.
    //
    // No time filter (previously had `detected_at < NOW() - 1h`): the NOT
    // EXISTS check against match_queue already prevents duplicate processing,
    // and freshly inserted jobs are handled by jobIngestedHandler. Removing
    // the time filter ensures the sweep catches all unmatched jobs, matching
    // the countUnmatchedEmbeddedJobs health monitor query (which has no time
    // filter). This fixes the discrepancy where health reported 66 unmatched
    // jobs but the sweep missed recently-ingested ones.
    const unmatchedJobs = await step.run("find-unmatched", async () => {
      const { db } = await import("@/db/db");
      const { sql } = await import("drizzle-orm");
      const { GATE2_MAX_COSINE_DISTANCE } = await import(
        "@/lib/jobs/matching-config"
      );

      const result = await db.execute(sql`
        SELECT DISTINCT j.id, j.detected_at
        FROM job j
        JOIN persona p ON (j.extracted_tags && p.must_have_tags)
        WHERE j.status = 'active'
          AND j.job_embedding IS NOT NULL
          AND j.extracted_tags IS NOT NULL
          AND cardinality(j.extracted_tags) > 0
          AND p.persona_embedding IS NOT NULL
          AND (p.persona_embedding <=> j.job_embedding) < ${GATE2_MAX_COSINE_DISTANCE}::real
          AND NOT EXISTS (
            SELECT 1 FROM match_queue mq
            WHERE mq.job_id = j.id AND mq.persona_id = p.id
          )
        ORDER BY j.detected_at DESC
        LIMIT 500
      `);
      return result.rows as { id: string; detected_at: Date }[];
    });

    if (unmatchedJobs.length === 0) {
      // Write ingestion log even when nothing to do
      await step.run("write-log-empty", async () => {
        const { writeIngestionLog } = await import(
          "@/lib/jobs/poller/ingestion-log"
        );
        return writeIngestionLog({
          type: "tier_recalc",
          status: "success",
          source: "match_retry_sweep",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          startedAt: new Date(),
          finishedAt: new Date(),
        });
      });
      return { retried: 0 };
    }

    // Step 2: Trigger bulk reprocess for these jobs
    // We send a match/bulk-reprocess event that triggers the bulk reprocess
    // function, which handles Gate 1+2 + Gate 3 fan-out.
    await step.sendEvent(`match-bulk-reprocess-sweep-${Date.now()}`, {
      name: "match/bulk-reprocess",
      data: {
        personaId: null,
        includeRejected: false,
      },
    });

    // Step 3: Write ingestion log
    await step.run("write-log", async () => {
      const { writeIngestionLog } = await import(
        "@/lib/jobs/poller/ingestion-log"
      );
      return writeIngestionLog({
        type: "tier_recalc",
        status: "success",
        source: "match_retry_sweep",
        itemsProcessed: unmatchedJobs.length,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt: new Date(),
        finishedAt: new Date(),
      });
    });

    return { retried: unmatchedJobs.length };
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
 * D1: Brave Search Fresh Daily — direct slug extraction.
 * Sprint 3 Task 7: Replaced Google CSE with Brave Search API.
 * Runs at 00:00 and 14:00 UTC.
 */
export const dailySourceD1BraveSearch = inngest.createFunction(
  {
    id: "daily-source-brave-search",
    name: "Daily Source — Brave Search",
    triggers: [{ cron: "0 0,14 * * *" }],
  },
  async ({ step }) => {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      const { writeIngestionLog } = await import(
        "@/lib/jobs/poller/ingestion-log"
      );
      await step.run("write-log", async () => {
        return writeIngestionLog({
          type: "seed",
          status: "failed",
          source: "brave_search",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage: "BRAVE_SEARCH_API_KEY not configured",
          startedAt: new Date(),
          finishedAt: new Date(),
        });
      });
      return { skipped: true, reason: "credentials-not-configured" };
    }
    const { runBraveSearchDaily } = await import(
      "@/lib/jobs/seeders/batch-sources/brave-search"
    );
    return runSourceFunction({
      step,
      sourceName: "daily-source-brave-search",
      logSource: "brave_search",
      execute: () =>
        step.run("fetch-and-process", async () =>
          runBraveSearchDaily({ apiKey }, fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalResultsFound,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-hn-algolia",
      logSource: "hn_algolia",
      execute: () =>
        step.run("fetch-and-process", async () =>
          runHnAlgoliaDailySeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalComments,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-reddit-rss",
      logSource: "reddit_rss",
      execute: () =>
        step.run("fetch-and-process", async () => runRedditRssSeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalPosts,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-remote-job-boards",
      logSource: "remote_job_boards",
      execute: () =>
        step.run("fetch-and-process", async () =>
          runRemoteJobBoardsSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalJobs,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-wwr-rss",
      logSource: "wwr_rss",
      execute: () =>
        step.run("fetch-and-process", async () => runWwrRssSeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalPosts,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-certstream",
      logSource: "certstream",
      execute: () =>
        step.run("collect-and-process", async () =>
          runCertStreamProcessor(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalCertificates,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-funding-signal",
      logSource: "funding_signal",
      execute: () =>
        step.run("process-retry-queue", async () =>
          runFundingSignalSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalRetried,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-producthunt",
      logSource: "product_hunt",
      execute: () =>
        step.run("fetch-and-process", async () =>
          runProductHuntDailySeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalProducts,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-engineering-blogs",
      logSource: "engineering_blogs",
      execute: () =>
        step.run("fetch-and-process", async () =>
          runEngineeringBlogsRssSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalPosts,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-github-trending",
      logSource: "github_trending",
      execute: () =>
        step.run("fetch-and-process", async () =>
          runGithubTrendingSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalRepos,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-tech-news-rss",
      logSource: "tech_news_rss",
      execute: () =>
        step.run("fetch-and-process", async () => runTechNewsRssSeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalArticles,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-npm-registry",
      logSource: "npm_registry",
      execute: () =>
        step.run("fetch-and-process", async () => runNpmRegistrySeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalPackages,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    return runSourceFunction({
      step,
      sourceName: "daily-source-meta-ads",
      logSource: "meta_ads",
      execute: () =>
        step.run("fetch-and-process", async () => runMetaAdsSeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalAds,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    triggers: [{ event: "batch/workable-meta-search" }, { cron: "0 0 1 * *" }],
  },
  async ({ step }) => {
    const { runWorkableMetaSearch } = await import(
      "@/lib/jobs/seeders/batch-sources/workable-meta-search"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-workable-meta-search",
      logSource: "workable_meta_search",
      checkStorage: true,
      execute: () =>
        step.run("fetch-and-process", async () => runWorkableMetaSearch(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalJobsFound,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });
  },
);

/**
 * B2: Brave Search Batch Sweep — direct slug extraction from Brave Search.
 * Sprint 3 Task 7: Replaced Google CSE with Brave Search API.
 */
export const batchSourceB2BraveSearch = inngest.createFunction(
  {
    id: "batch-source-brave-search",
    name: "Batch Source — Brave Search",
    triggers: [{ event: "batch/brave-search" }, { cron: "0 0 1 * *" }],
  },
  async ({ step }) => {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) {
      const { writeIngestionLog } = await import(
        "@/lib/jobs/poller/ingestion-log"
      );
      await step.run("write-log", async () => {
        return writeIngestionLog({
          type: "seed",
          status: "failed",
          source: "brave_search",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage: "BRAVE_SEARCH_API_KEY not configured",
          startedAt: new Date(),
          finishedAt: new Date(),
        });
      });
      return { skipped: true, reason: "credentials-not-configured" };
    }
    const { runBraveSearchBatch } = await import(
      "@/lib/jobs/seeders/batch-sources/brave-search"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-brave-search",
      logSource: "brave_search",
      checkStorage: true,
      execute: () =>
        step.run("fetch-and-process", async () =>
          runBraveSearchBatch({ apiKey }, fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalResultsFound,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });
  },
);

/**
 * B3: YC Directory — Slugger (company names + websites → ATS).
 */
export const batchSourceB3YcDirectory = inngest.createFunction(
  {
    id: "batch-source-yc-directory",
    name: "Batch Source — YC Directory",
    triggers: [{ event: "batch/yc-directory" }, { cron: "0 0 1 */3 *" }],
  },
  async ({ step }) => {
    const { runYcDirectorySeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/yc-directory"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-yc-directory",
      logSource: "yc_directory",
      checkStorage: true,
      execute: () =>
        step.run("fetch-and-process", async () => runYcDirectorySeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalHiringCompanies,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
  },
);

/**
 * B4: VC Portfolio Mining — Slugger (company names from portfolio pages).
 */
export const batchSourceB4VcPortfolios = inngest.createFunction(
  {
    id: "batch-source-vc-portfolios",
    name: "Batch Source — VC Portfolios",
    triggers: [{ event: "batch/vc-portfolios" }, { cron: "0 0 1 * *" }],
  },
  async ({ step }) => {
    const { runVcPortfolioSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/vc-portfolios"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-vc-portfolios",
      logSource: "vc_portfolio",
      checkStorage: true,
      execute: () =>
        step.run("fetch-and-process", async () => runVcPortfolioSeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalCompaniesExtracted,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
  },
);

/**
 * B5: Developer Newsletter Archives — direct slug extraction + Slugger.
 */
export const batchSourceB5NewsletterArchives = inngest.createFunction(
  {
    id: "batch-source-newsletter-archives",
    name: "Batch Source — Newsletter Archives",
    triggers: [{ event: "batch/newsletter-archives" }, { cron: "0 0 1 * *" }],
  },
  async ({ step }) => {
    const { runNewsletterArchiveSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/newsletter-archives"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-newsletter-archives",
      logSource: "newsletter_archive",
      checkStorage: true,
      execute: () =>
        step.run("fetch-and-process", async () =>
          runNewsletterArchiveSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.issuesCrawled,
        itemsInserted: r.directSlugInserts + r.sluggerResolved,
        itemsRejected: 0,
        itemsSkipped: r.sluggerUnresolved,
      }),
    });
  },
);

/**
 * B7: Wayback Machine CDX — direct slug extraction from archived URLs.
 */
export const batchSourceB7WaybackCdx = inngest.createFunction(
  {
    id: "batch-source-wayback-cdx",
    name: "Batch Source — Wayback CDX",
    triggers: [{ event: "batch/wayback-cdx" }, { cron: "0 0 1 */3 *" }],
  },
  async ({ step }) => {
    const { runWaybackCdxSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/wayback-cdx"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-wayback-cdx",
      logSource: "wayback_cdx",
      checkStorage: true,
      execute: () =>
        step.run("fetch-and-process", async () => runWaybackCdxSeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalRows,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });
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
    const filePath =
      (event.data as { filePath?: string })?.filePath ??
      process.env.RAPID7_FDNS_FILE_PATH;
    if (!filePath) {
      const { writeIngestionLog } = await import(
        "@/lib/jobs/poller/ingestion-log"
      );
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
          startedAt: new Date(),
          finishedAt: new Date(),
        });
      });
      return { skipped: true, reason: "credentials-not-configured" };
    }
    const { runRapid7CnameSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/rapid7-cname"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-rapid7-fdns",
      logSource: "rapid7_fdns",
      execute: () =>
        step.run("stream-and-process", async () =>
          runRapid7CnameSeeder(filePath, fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalRecords,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    triggers: [{ event: "batch/cross-pollination" }, { cron: "0 0 1 * *" }],
  },
  async ({ step }) => {
    const { runCrossPollinationSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/cross-pollination"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-cross-pollination",
      logSource: "cross_pollination",
      checkStorage: true,
      execute: () =>
        step.run("process-existing-jobs", async () =>
          runCrossPollinationSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalCompanyNames,
        itemsInserted: r.resolved,
        itemsRejected: 0,
        itemsSkipped: r.unresolved,
      }),
    });
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
    triggers: [{ event: "batch/sitemap-probe" }, { cron: "0 0 * * 1" }],
  },
  async ({ step }) => {
    const { runSitemapProbeSeeder } = await import(
      "@/lib/jobs/seeders/batch-sources/sitemap-probe"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-sitemap-probe",
      logSource: "sitemap_probe",
      checkStorage: true,
      execute: () =>
        step.run("probe-sitemaps", async () => runSitemapProbeSeeder(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.companiesProbed,
        itemsInserted: r.companiesInserted,
        itemsRejected: 0,
        itemsSkipped: 0,
      }),
    });
  },
);

/**
 * B8: crt.sh Certificate Transparency — direct slug extraction from historical
 * TLS certificates. Restores the coverage lost when Rapid7 FDNS (commercial)
 * was disabled. Free, no-auth, wildcard queries against CT logs.
 * Sprint 4 Task 2.
 */
export const batchSourceB8CrtSh = inngest.createFunction(
  {
    id: "batch-source-crt-sh",
    name: "Batch Source — crt.sh Certificate Transparency",
    triggers: [{ event: "batch/crt-sh" }, { cron: "0 0 1 * *" }],
  },
  async ({ step }) => {
    const { runCrtShBatch } = await import(
      "@/lib/jobs/seeders/batch-sources/crt-sh"
    );
    return runSourceFunction({
      step,
      sourceName: "batch-source-crt-sh",
      logSource: "crt_sh",
      checkStorage: true,
      execute: () =>
        step.run("fetch-and-process", async () => runCrtShBatch(fetch)),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalRows,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });
  },
);

// ── Daily Health Check (Sprint 4 Task 8) ─────────────────────────────────────
// Runs daily at 06:00 UTC to check storage and schema validation health,
// creating/resolving alerts as needed. Non-fatal — failures are logged but
// don't crash the function.
export const dailyHealthCheck = inngest.createFunction(
  {
    id: "daily-health-check",
    name: "Daily Health Check — Storage & Schema Validation Alerts",
    triggers: [{ cron: "0 6 * * *" }],
  },
  async ({ step, logger }) => {
    // Step 1: Check storage and create/resolve alerts
    await step.run("check-storage-alerts", async () => {
      const { checkStorageAlerts } = await import("@/lib/jobs/alerting");
      await checkStorageAlerts();
      return { checked: true };
    });

    // Step 2: Check schema validation failure rates
    await step.run("check-schema-validation-alerts", async () => {
      const { checkSchemaValidationAlerts } = await import(
        "@/lib/jobs/alerting"
      );
      await checkSchemaValidationAlerts();
      return { checked: true };
    });

    logger.info("Daily health check completed");
    return { completed: true };
  },
);

// ── Pipeline Health Monitor (Sprint 7 Task 6) ────────────────────────────────
// Runs every 30 minutes to check critical pipeline parameters and create alerts
// when thresholds are breached. This is the monitoring guardrail that prevents
// the silent pipeline failures that caused the Sprint 7 stagnation (2,006 jobs
// detected but 0 normalized for 32+ hours).
//
// Metrics checked:
//   1. Unnormalized jobs (>1h old, active, normalized_at IS NULL)
//   2. Unembedded jobs (normalized but no embedding)
//   3. Stale poller (no companies polled in 4h)
//   4. Match generation rate (matches in last 24h)
//   5. Source health coverage (source_health table rows)
//   6. DB storage usage
//   7. Pending matches backlog (>30min old)
//   8. Normalization failed jobs (retryable)
//
// Alerts are deduplicated by hasActiveAlert — only one active pipeline_health
// alert exists at a time. When all metrics return to healthy ranges, the
// existing alert is auto-resolved.
export const pipelineHealthMonitor = inngest.createFunction(
  {
    id: "pipeline-health-monitor",
    name: "Pipeline Health Monitor",
    triggers: [{ cron: "*/30 * * * *" }], // every 30 min
  },
  async ({ step, logger }) => {
    // Step 1: Collect all pipeline health metrics
    const metrics = await step.run("collect-metrics", async () => {
      const { getPipelineHealthMetrics } = await import(
        "@/lib/jobs/pipeline-health"
      );
      return getPipelineHealthMetrics();
    });

    // Step 2: Evaluate thresholds
    const alerts = await step.run("evaluate-alerts", async () => {
      const { evaluateAlerts } = await import("@/lib/jobs/pipeline-health");
      return evaluateAlerts(metrics);
    });

    // Step 3: Create or resolve alerts
    await step.run("manage-alerts", async () => {
      const { createAlert, hasActiveAlert, resolveAlertsByType } = await import(
        "@/lib/jobs/alerting"
      );

      if (alerts.length > 0) {
        // Only create one pipeline_health alert (deduplicated)
        if (!(await hasActiveAlert("pipeline_health"))) {
          await createAlert({
            type: "pipeline_health",
            severity: "warning",
            message: alerts.join(" | "),
            details: JSON.stringify(metrics),
          });
          logger.info(
            `Pipeline health alert created: ${alerts.length} issues detected`,
          );
        } else {
          // Update the existing alert's message by resolving and recreating
          await resolveAlertsByType("pipeline_health");
          await createAlert({
            type: "pipeline_health",
            severity: "warning",
            message: alerts.join(" | "),
            details: JSON.stringify(metrics),
          });
        }
      } else {
        // All metrics healthy — resolve any existing pipeline_health alert
        const resolved = await resolveAlertsByType("pipeline_health");
        if (resolved > 0) {
          logger.info("Pipeline health recovered — alert resolved");
        }
      }
      return { alertsCreated: alerts.length > 0 ? 1 : 0, alertsResolved: 0 };
    });

    logger.info("Pipeline health monitor completed", { metrics, alerts });

    return {
      timestamp: new Date().toISOString(),
      ...metrics,
      alerts,
    };
  },
);
