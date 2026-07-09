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
import { shouldSkipEmergencyPurge } from "@/lib/jobs/storage-check";
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

    // Sprint 8 storage guard: check storage and backlog before polling. If the
    // database is near the Neon limit or the normalizer is behind, skip this
    // entire poll cycle to avoid adding more unnormalized jobs.
    const storage = await step.run("check-storage", async () => {
      const { isStorageSafeForIngestion } = await import(
        "@/lib/jobs/storage-check"
      );
      return isStorageSafeForIngestion();
    });
    if (!storage.allow) {
      console.warn(
        `[storage guard] batchPollTier ${tier} skipped: ${storage.reason}`,
      );
      await step.run("write-log-storage-blocked", async () => {
        return writeIngestionLog({
          type: "batch_poll",
          status: "partial",
          source: `batch_poll_${tier}`,
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage: storage.reason,
          startedAt,
          finishedAt: new Date(),
        });
      });
      return {
        tier,
        polled: 0,
        newJobs: 0,
        eventsEmitted: 0,
        storageBlocked: true,
      };
    }

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
 * Backlog Sweeper Batch Size — companies per pollBacklogSweeper run.
 *
 * Matches BATCH_SIZE (500). At 500/hour the 6,516 never-polled backlog clears
 * in ~13 hours. Each company poll is rate-limited per ATS via Bottleneck
 * (2 req/s), so 500 companies × ~0.5s ≈ 250s — under the 300s route
 * maxDuration. POLL_CHUNK_SIZE=10 ensures checkpointed progress.
 */
const BACKLOG_BATCH_SIZE = 500;

/**
 * Poll Backlog Sweeper — dedicated hourly cron that targets companies which
 * have NEVER been polled (WI2 — Polling Bottleneck fix).
 *
 * Problem: `batchPollTier` polls 500 companies per run, but the active tier
 * (9,127 companies) only completes ~288-566 per 12h run due to chunk timeouts
 * and slow ATS endpoints. At that rate, the 6,516 never-polled backlog takes
 * ~11 days to clear. This sweeper runs hourly and queries exclusively
 * `last_polled_at IS NULL` companies, clearing the backlog in ~13 hours.
 *
 * The `getNeverPolledBatch` query excludes the `dead` tier and orders by
 * `discoveredAt ASC` (oldest discoveries first). Once the backlog is cleared,
 * this function becomes a no-op (returns 0 companies) and costs nothing.
 *
 * Concurrency: limit 1. The per-ATS Bottleneck rate limiter (2 req/s) is
 * shared with `batchPollTier`, so concurrent execution is safe but we cap at
 * 1 to avoid doubling total HTTP load when both functions fire simultaneously.
 *
 * Reuses the same chunked polling + event-driven normalization pattern as
 * `batchPollTier` (Sprint 7 healthcheck fix): each POLL_CHUNK_SIZE chunk is
 * a separate step.run() so progress is checkpointed monotonically.
 */
export const pollBacklogSweeper = inngest.createFunction(
  {
    id: "poller-backlog-sweeper",
    name: "Poll Backlog Sweeper",
    triggers: [{ cron: "0 * * * *" }], // every hour
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    // Storage guard — same as batchPollTier. Skip if DB is near Neon limit or
    // the normalizer is behind, to avoid adding more unnormalized jobs.
    const storage = await step.run("check-storage", async () => {
      const { isStorageSafeForIngestion } = await import(
        "@/lib/jobs/storage-check"
      );
      return isStorageSafeForIngestion();
    });
    if (!storage.allow) {
      console.warn(
        `[storage guard] pollBacklogSweeper skipped: ${storage.reason}`,
      );
      await step.run("write-log-storage-blocked", async () => {
        return writeIngestionLog({
          type: "batch_poll",
          status: "partial",
          source: "backlog_sweeper",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage: storage.reason,
          startedAt,
          finishedAt: new Date(),
        });
      });
      return {
        polled: 0,
        newJobs: 0,
        eventsEmitted: 0,
        storageBlocked: true,
      };
    }

    // Step 1: Get never-polled companies (excludes dead tier).
    const companies = await step.run("get-never-polled-batch", async () => {
      const { getNeverPolledBatch } = await import(
        "@/lib/jobs/poller/tier-queries"
      );
      return getNeverPolledBatch(BACKLOG_BATCH_SIZE);
    });

    if (companies.length === 0) {
      await step.run("write-log-empty", async () => {
        return writeIngestionLog({
          type: "batch_poll",
          status: "success",
          source: "backlog_sweeper",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          startedAt,
          finishedAt: new Date(),
        });
      });
      return { polled: 0, newJobs: 0, eventsEmitted: 0, backlogCleared: true };
    }

    // Step 2: Poll companies in chunks (same pattern as batchPollTier).
    const pollResults: Array<{
      companyId: string;
      atsSource: string;
      atsSlug: string;
      newJobIds: string[];
      error?: string;
    }> = [];

    for (let i = 0; i < companies.length; i += POLL_CHUNK_SIZE) {
      const chunk = companies.slice(i, i + POLL_CHUNK_SIZE);
      const stepName = `backlog-poll-chunk-${Math.floor(i / POLL_CHUNK_SIZE) + 1}`;

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

    const allNewJobIds = pollResults.flatMap((r) => r.newJobIds);
    const errorCount = pollResults.filter((r) => r.error).length;

    // Step 3: Find unnormalized jobs from the polled companies (DB fallback).
    const unnormalizedJobs = await step.run("find-unnormalized", async () => {
      const { sql, inArray } = await import("drizzle-orm");
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");

      const polledSlugs = companies.map((c) => c.atsSlug);
      const polledSources = [...new Set(companies.map((c) => c.atsSource))];

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

    // Step 4: Emit job/ingested events for unnormalized jobs.
    if (unnormalizedJobs.length > 0) {
      await step.sendEvent(
        "emit-job-ingested",
        unnormalizedJobs.map((j) => ({
          id: `job-ingested-backlog-${j.id}-${Date.now()}`,
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

    // Step 5: Write ingestion log.
    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "batch_poll",
        status: errorCount > 0 ? "partial" : "success",
        source: "backlog_sweeper",
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
      deleteAncientJobs,
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
    const ancient = await step.run("delete-ancient-jobs", async () => {
      return deleteAncientJobs();
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
      ancient.deletedCount +
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
          ancientJobs: ancient.deletedCount,
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
      ancientJobs: ancient.deletedCount,
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

// ── WI3: Direct Job Board Ingestion ─────────────────────────────────────────

/**
 * Direct Job Board Ingestion — daily cron that fetches jobs from remote-first
 * job boards with structured APIs, bypassing the ATS poller entirely (WI3).
 *
 * Targets the tech-stack gap (frontend/PHP/Laravel) and the remote-scope
 * problem (every job on these boards is remote by definition). Direct
 * ingestion is 1 hop: API call → job record, with no LLM normalization.
 *
 * Phase 1 boards (WI3):
 *   - Himalayas:  GET https://himalayas.app/jobs/api (104K+ global remote jobs)
 *   - RemoteOK:   GET https://remoteok.com/api (2K+ global remote jobs)
 *   - NoFluffJobs: GET https://nofluffjobs.com/api/posting (~11K jobs, single response)
 *   - JustJoin:   GET (endpoint 404 as of July 2026 — skipped)
 *
 * Flow per board:
 *   1. Fetch jobs from the board API (paginated for Himalayas)
 *   2. Filter by persona tech-stack overlap (React/Next/TS/JS/Vue/PHP/Laravel)
 *   3. Upsert into the job table with structured fields set directly:
 *      - extractedTags from the board's tags (no LLM extraction)
 *      - workplaceType="remote", remoteScope="global" (remote-first boards)
 *      - compensationMin/Max from the board's salary fields
 *      - normalizedText from the board's description (no LLM summarization)
 *      - normalizedAt=now (marks as normalized — prevents jobIngestedHandler
 *        from re-processing via LLM)
 *   4. Generate embeddings via text-embedding-3-small for Gate 2 vector search
 *   5. Write ingestion log for observability
 *
 * Gate routing (Gate 0.5 + Gate 1+2 + Gate 3) is NOT done here — the
 * jobIngestedHandler skips jobs where normalizedAt IS NOT NULL. Instead, run
 * `direct-gate-routing.ts` after ingestion to route the new jobs through the
 * matching pipeline (WI3 Step 7).
 *
 * Concurrency: limit 1. Embedding API calls are sequential to respect OpenAI
 * rate limits. The daily cron gives ample time (24h between runs).
 *
 * Triggered by: cron "0 5 * * *" (daily at 05:00 UTC — after resurrection sweep).
 */
export const directJobBoardIngestion = inngest.createFunction(
  {
    id: "direct-job-board-ingestion",
    name: "Direct Job Board Ingestion",
    triggers: [{ cron: "0 5 * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );
    const startedAt = new Date();

    // Storage guard — skip if DB is near Neon limit.
    const storage = await step.run("check-storage", async () => {
      const { isStorageSafeForIngestion } = await import(
        "@/lib/jobs/storage-check"
      );
      return isStorageSafeForIngestion();
    });
    if (!storage.allow) {
      console.warn(
        `[storage guard] directJobBoardIngestion skipped: ${storage.reason}`,
      );
      await step.run("write-log-storage-blocked", async () => {
        return writeIngestionLog({
          type: "backfill",
          status: "partial",
          source: "direct_job_boards",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          errorMessage: storage.reason,
          startedAt,
          finishedAt: new Date(),
        });
      });
      return { storageBlocked: true, totalIngested: 0 };
    }

    // Import adapters + filter + upsert
    const { hasPersonaTechOverlap } = await import(
      "@/lib/jobs/direct-ingestion/filter"
    );
    const { fetchHimalayasJobs } = await import(
      "@/lib/jobs/direct-ingestion/himalayas"
    );
    const { fetchRemoteOKJobs } = await import(
      "@/lib/jobs/direct-ingestion/remoteok"
    );
    const { fetchNoFluffJobs } = await import(
      "@/lib/jobs/direct-ingestion/nofluffjobs"
    );
    const { fetchArbeitnowJobs } = await import(
      "@/lib/jobs/direct-ingestion/arbeitnow"
    );
    const { fetchRemotiveJobs } = await import(
      "@/lib/jobs/direct-ingestion/remotive"
    );
    const { fetchWeWorkRemotelyJobs } = await import(
      "@/lib/jobs/direct-ingestion/weworkremotely"
    );
    const { fetchJustJoinJobs } = await import(
      "@/lib/jobs/direct-ingestion/justjoin"
    );
    const { upsertDirectJobs } = await import(
      "@/lib/jobs/direct-ingestion/upsert"
    );
    const { findExcludedCountry } = await import(
      "@/lib/jobs/excluded-countries"
    );
    type DirectIngestionJob =
      import("@/lib/jobs/direct-ingestion/types").DirectIngestionJob;

    // Tech filter function — shared across all boards
    const techFilter = (j: {
      tags: string[];
      title: string;
      description: string;
    }) => hasPersonaTechOverlap(j.tags, j.title, j.description);

    // Embedding function — imported lazily to avoid loading OpenAI at module level
    const embedFn = async (text: string): Promise<number[]> => {
      const { embedJob } = await import("@/lib/jobs/job-embedder");
      return embedJob(text);
    };

    const boardResults: Array<{
      board: string;
      success: boolean;
      ingested: number;
      error: string | null;
    }> = [];

    // ── Excluded countries filter ───────────────────────────────────────────
    // Load the admin-managed excluded countries set once. Jobs located in or
    // mentioning these countries are filtered out before upsert — saving
    // embedding cost, DB writes, and all downstream gate processing.
    // Inngest runs outside the Next.js request lifecycle, so we use the
    // uncached read (Cache Components "use cache" doesn't apply here).
    const excludedSet = (await step.run("load-excluded-countries", async () => {
      const { getExcludedCountriesRaw } = await import(
        "@/lib/jobs/excluded-countries"
      );
      return getExcludedCountriesRaw();
    })) as unknown as Set<string>;

    /** Filter out jobs located in excluded countries. */
    const filterExcluded = (
      jobs: DirectIngestionJob[],
    ): DirectIngestionJob[] => {
      if (excludedSet.size === 0) return jobs;
      return jobs.filter(
        (j) =>
          !findExcludedCountry(
            j.locationCountries ?? null,
            j.locationName,
            excludedSet,
          ),
      );
    };

    // ── Board 1: Himalayas ──────────────────────────────────────────────────
    const himalayasResult = await step.run("fetch-himalayas", async () => {
      const result = await fetchHimalayasJobs(500, techFilter);
      if (!result.success) {
        return {
          success: false as const,
          jobs: [],
          error: result.error,
          totalAvailable: 0,
        };
      }
      return {
        success: true as const,
        jobs: result.jobs,
        error: null,
        totalAvailable: result.totalAvailable,
      };
    });

    if (himalayasResult.success && himalayasResult.jobs.length > 0) {
      // step.run() may serialize Date → string. Rebuild with proper Date types.
      const jobsForUpsert: DirectIngestionJob[] = filterExcluded(
        himalayasResult.jobs.map((j) => ({
          ...j,
          publishedAt: j.publishedAt
            ? new Date(j.publishedAt as unknown as string)
            : null,
        })),
      );
      const upsertResult = await step.run("upsert-himalayas", async () => {
        return upsertDirectJobs(
          "himalayas_direct",
          "himalayas_direct",
          jobsForUpsert,
          embedFn,
        );
      });
      boardResults.push({
        board: "Himalayas",
        success: true,
        ingested: upsertResult.totalUpserted,
        error: null,
      });
    } else if (!himalayasResult.success) {
      boardResults.push({
        board: "Himalayas",
        success: false,
        ingested: 0,
        error: himalayasResult.error,
      });
    }

    // ── Board 2: RemoteOK ───────────────────────────────────────────────────
    const remoteokResult = await step.run("fetch-remoteok", async () => {
      const result = await fetchRemoteOKJobs(500, techFilter);
      if (!result.success) {
        return {
          success: false as const,
          jobs: [],
          error: result.error,
          totalAvailable: 0,
        };
      }
      return {
        success: true as const,
        jobs: result.jobs,
        error: null,
        totalAvailable: result.totalAvailable,
      };
    });

    if (remoteokResult.success && remoteokResult.jobs.length > 0) {
      const jobsForUpsert: DirectIngestionJob[] = filterExcluded(
        remoteokResult.jobs.map((j) => ({
          ...j,
          publishedAt: j.publishedAt
            ? new Date(j.publishedAt as unknown as string)
            : null,
        })),
      );
      const upsertResult = await step.run("upsert-remoteok", async () => {
        return upsertDirectJobs(
          "remoteok_direct",
          "remoteok_direct",
          jobsForUpsert,
          embedFn,
        );
      });
      boardResults.push({
        board: "RemoteOK",
        success: true,
        ingested: upsertResult.totalUpserted,
        error: null,
      });
    } else if (!remoteokResult.success) {
      boardResults.push({
        board: "RemoteOK",
        success: false,
        ingested: 0,
        error: remoteokResult.error,
      });
    }

    // ── Board 3: NoFluffJobs ────────────────────────────────────────────────
    // Demoted from 1000→100: NoFluffJobs is overwhelmingly Poland-locked
    // (~95%+ of remote listings). With the country_fenced fix, these are
    // blocked at Gate 0.5 before reaching the LLM, but the embedding cost
    // (~$0.01/run at 1000 jobs) and transient DB rows are wasted. A low
    // volume still catches the rare multi-country CEE listings (5Blue-style)
    // that are worth routing to Gate 3.
    const nofluffResult = await step.run("fetch-nofluffjobs", async () => {
      const result = await fetchNoFluffJobs(100, techFilter);
      if (!result.success) {
        return {
          success: false as const,
          jobs: [],
          error: result.error,
          totalAvailable: 0,
        };
      }
      return {
        success: true as const,
        jobs: result.jobs,
        error: null,
        totalAvailable: result.totalAvailable,
      };
    });

    if (nofluffResult.success && nofluffResult.jobs.length > 0) {
      const jobsForUpsert: DirectIngestionJob[] = filterExcluded(
        nofluffResult.jobs.map((j) => ({
          ...j,
          publishedAt: j.publishedAt
            ? new Date(j.publishedAt as unknown as string)
            : null,
        })),
      );
      const upsertResult = await step.run("upsert-nofluffjobs", async () => {
        return upsertDirectJobs(
          "nofluffjobs",
          "nofluffjobs",
          jobsForUpsert,
          embedFn,
        );
      });
      boardResults.push({
        board: "NoFluffJobs",
        success: true,
        ingested: upsertResult.totalUpserted,
        error: null,
      });
    } else if (!nofluffResult.success) {
      boardResults.push({
        board: "NoFluffJobs",
        success: false,
        ingested: 0,
        error: nofluffResult.error,
      });
    }

    // ── Board 4: JustJoin ───────────────────────────────────────────────────
    // JustJoin uses a two-step fetch (list + per-offer detail), so it is slower
    // than the single-call boards. The pre-filter bounds detail calls to only
    // jobs matching the persona's tech stack by title/skills.
    const justjoinResult = await step.run("fetch-justjoin", async () => {
      const result = await fetchJustJoinJobs(500, techFilter);
      if (!result.success) {
        return {
          success: false as const,
          jobs: [],
          error: result.error,
          totalAvailable: 0,
        };
      }
      return {
        success: true as const,
        jobs: result.jobs,
        error: null,
        totalAvailable: result.totalAvailable,
      };
    });

    if (justjoinResult.success && justjoinResult.jobs.length > 0) {
      const jobsForUpsert: DirectIngestionJob[] = filterExcluded(
        justjoinResult.jobs.map((j) => ({
          ...j,
          publishedAt: j.publishedAt
            ? new Date(j.publishedAt as unknown as string)
            : null,
        })),
      );
      const upsertResult = await step.run("upsert-justjoin", async () => {
        return upsertDirectJobs("justjoin", "justjoin", jobsForUpsert, embedFn);
      });
      boardResults.push({
        board: "JustJoin",
        success: true,
        ingested: upsertResult.totalUpserted,
        error: null,
      });
    } else if (!justjoinResult.success) {
      boardResults.push({
        board: "JustJoin",
        success: false,
        ingested: 0,
        error: justjoinResult.error,
      });
    }

    // ── Board 5: Arbeitnow ──────────────────────────────────────────────────
    const arbeitnowResult = await step.run("fetch-arbeitnow", async () => {
      const result = await fetchArbeitnowJobs(500, techFilter);
      if (!result.success) {
        return {
          success: false as const,
          jobs: [],
          error: result.error,
          totalAvailable: 0,
        };
      }
      return {
        success: true as const,
        jobs: result.jobs,
        error: null,
        totalAvailable: result.totalAvailable,
      };
    });

    if (arbeitnowResult.success && arbeitnowResult.jobs.length > 0) {
      const jobsForUpsert: DirectIngestionJob[] = filterExcluded(
        arbeitnowResult.jobs.map((j) => ({
          ...j,
          publishedAt: j.publishedAt
            ? new Date(j.publishedAt as unknown as string)
            : null,
        })),
      );
      const upsertResult = await step.run("upsert-arbeitnow", async () => {
        return upsertDirectJobs(
          "arbeitnow",
          "arbeitnow",
          jobsForUpsert,
          embedFn,
        );
      });
      boardResults.push({
        board: "Arbeitnow",
        success: true,
        ingested: upsertResult.totalUpserted,
        error: null,
      });
    } else if (!arbeitnowResult.success) {
      boardResults.push({
        board: "Arbeitnow",
        success: false,
        ingested: 0,
        error: arbeitnowResult.error,
      });
    }

    // ── Board 6: Remotive ───────────────────────────────────────────────────
    const remotiveResult = await step.run("fetch-remotive", async () => {
      const result = await fetchRemotiveJobs(500, techFilter);
      if (!result.success) {
        return {
          success: false as const,
          jobs: [],
          error: result.error,
          totalAvailable: 0,
        };
      }
      return {
        success: true as const,
        jobs: result.jobs,
        error: null,
        totalAvailable: result.totalAvailable,
      };
    });

    if (remotiveResult.success && remotiveResult.jobs.length > 0) {
      const jobsForUpsert: DirectIngestionJob[] = filterExcluded(
        remotiveResult.jobs.map((j) => ({
          ...j,
          publishedAt: j.publishedAt
            ? new Date(j.publishedAt as unknown as string)
            : null,
        })),
      );
      const upsertResult = await step.run("upsert-remotive", async () => {
        return upsertDirectJobs("remotive", "remotive", jobsForUpsert, embedFn);
      });
      boardResults.push({
        board: "Remotive",
        success: true,
        ingested: upsertResult.totalUpserted,
        error: null,
      });
    } else if (!remotiveResult.success) {
      boardResults.push({
        board: "Remotive",
        success: false,
        ingested: 0,
        error: remotiveResult.error,
      });
    }

    // ── Board 7: WeWorkRemotely ─────────────────────────────────────────────
    const wwrResult = await step.run("fetch-weworkremotely", async () => {
      const result = await fetchWeWorkRemotelyJobs(200, techFilter);
      if (!result.success) {
        return {
          success: false as const,
          jobs: [],
          error: result.error,
          totalAvailable: 0,
        };
      }
      return {
        success: true as const,
        jobs: result.jobs,
        error: null,
        totalAvailable: result.totalAvailable,
      };
    });

    if (wwrResult.success && wwrResult.jobs.length > 0) {
      const jobsForUpsert: DirectIngestionJob[] = filterExcluded(
        wwrResult.jobs.map((j) => ({
          ...j,
          publishedAt: j.publishedAt
            ? new Date(j.publishedAt as unknown as string)
            : null,
        })),
      );
      const upsertResult = await step.run("upsert-weworkremotely", async () => {
        return upsertDirectJobs(
          "weworkremotely",
          "weworkremotely",
          jobsForUpsert,
          embedFn,
        );
      });
      boardResults.push({
        board: "WeWorkRemotely",
        success: true,
        ingested: upsertResult.totalUpserted,
        error: null,
      });
    } else if (!wwrResult.success) {
      boardResults.push({
        board: "WeWorkRemotely",
        success: false,
        ingested: 0,
        error: wwrResult.error,
      });
    }

    // ── Write ingestion log ─────────────────────────────────────────────────
    const totalIngested = boardResults.reduce((sum, r) => sum + r.ingested, 0);
    const anyErrors = boardResults.some((r) => !r.success);

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "backfill",
        status: anyErrors ? "partial" : "success",
        source: "direct_job_boards",
        itemsProcessed: totalIngested,
        itemsInserted: totalIngested,
        itemsUpdated: 0,
        itemsRejected: boardResults.filter((r) => !r.success).length,
        itemsSkipped: 0,
        errorMessage: anyErrors
          ? boardResults
              .filter((r) => !r.success)
              .map((r) => `${r.board}: ${r.error}`)
              .join("; ")
          : undefined,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return {
      boards: boardResults,
      totalIngested,
    };
  },
);

// ── v2 Corpus Expansion: Nightly Resurrection Sweep (Criterion 2) ───────────

/**
 * Nightly Resurrection Sweep — re-runs the v2 remote-scope extraction ladder
 * on jobs with `remoteScope = 'undetermined'` or `remoteScope = 'unknown'`.
 *
 * Per governing doc (company-corpus-expansion-new.md Criterion 2):
 * "Re-run Step 2 on undetermined / normalization_failed jobs when Gate 3
 * capacity allows. A single LLM miss should not cause permanent exclusion."
 *
 * Triggered by: cron "0 3 * * *" (daily at 03:00 UTC — low-traffic window).
 *
 * ── Bug fix (July 7 2026) ──────────────────────────────────────────────────
 * The previous implementation emitted `job/ingested` events for undetermined
 * jobs, expecting the `jobIngestedHandler` to re-normalize them. However,
 * `decideNormalizationAction` skips any job where `normalizedAt IS NOT NULL`
 * — and all undetermined jobs are already normalized. The events were emitted
 * but immediately skipped, making the sweep a complete no-op.
 *
 * The fix: directly call `extractRemoteScope` on each job and update
 * `job.remoteScope` + `job.locationCountries` in the DB, bypassing the
 * normalization pipeline entirely. This is a targeted remote-scope refresh,
 * not a full re-normalization.
 *
 * Limit: 500 jobs per run (bounded to stay within Inngest step time limits
 * and OpenAI rate limits). Prioritizes the oldest undetermined jobs first
 * — they've been waiting the longest for a second chance.
 */
export const nightlyResurrectionSweep = inngest.createFunction(
  {
    id: "nightly-resurrection-sweep",
    name: "Nightly Resurrection Sweep (v2 Remote-Scope)",
    triggers: [{ cron: "0 3 * * *" }],
  },
  async ({ step }) => {
    const { sql, eq } = await import("drizzle-orm");
    const { db } = await import("@/db/db");
    const { job } = await import("@/db/schemas/jobs/job");
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    // Step 1: Fetch ONLY job IDs with undetermined/unknown remoteScope.
    // We return only IDs (not full normalizedText/rawJson) to stay well
    // within Inngest's step output size limit (~256KB). The full metadata
    // is fetched inside each batch step where it's needed.
    const resurrectionCandidateIds = await step.run(
      "get-undetermined-jobs",
      async () => {
        const result = await db
          .select({ id: job.id })
          .from(job)
          .where(
            sql`(${job.remoteScope} = 'undetermined' OR ${job.remoteScope} = 'unknown') AND (${job.rawJson} IS NOT NULL OR ${job.normalizedText} IS NOT NULL) AND ${job.status} = 'active'`,
          )
          .orderBy(job.detectedAt)
          .limit(500);

        return result.map((r) => r.id);
      },
    );

    if (resurrectionCandidateIds.length === 0) {
      await step.run("write-log", async () => {
        return writeIngestionLog({
          type: "tier_recalc",
          status: "success",
          source: "nightly_resurrection_sweep",
          itemsProcessed: 0,
          itemsInserted: 0,
          itemsUpdated: 0,
          itemsRejected: 0,
          itemsSkipped: 0,
          startedAt,
          finishedAt: new Date(),
        });
      });
      return { resurrected: 0, updated: 0, stillUndetermined: 0 };
    }

    // Step 2: Run extractRemoteScope on each job in batches.
    // Process in batches of 25 with a concurrency limiter to respect
    // OpenAI rate limits (gpt-4o-mini: 500 RPM).
    const BATCH_SIZE = 25;
    const batches: string[][] = [];
    for (let i = 0; i < resurrectionCandidateIds.length; i += BATCH_SIZE) {
      batches.push(resurrectionCandidateIds.slice(i, i + BATCH_SIZE));
    }

    let updated = 0;
    let stillUndetermined = 0;

    for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
      const batchIds = batches[batchIdx];
      const result = await step.run(`extract-batch-${batchIdx}`, async () => {
        const { inArray } = await import("drizzle-orm");
        const { extractRemoteScope } = await import(
          "@/lib/jobs/remote-scope-extractor"
        );
        const { extractJobContent } = await import("@/lib/jobs/job-normalizer");

        // Fetch full metadata for this batch's jobs inside the step.
        // This keeps the step output small (only counts) while having
        // the content needed for extractRemoteScope.
        const batchRows = await db
          .select({
            id: job.id,
            atsSource: job.atsSource,
            workplaceType: job.workplaceType,
            locationName: job.locationName,
            normalizedText: job.normalizedText,
            rawJson: job.rawJson,
          })
          .from(job)
          .where(inArray(job.id, batchIds));

        let batchUpdated = 0;
        let batchStillUndetermined = 0;

        // Process sequentially within the batch to avoid overloading the
        // OpenAI API. The LLM call is ~1-3s per job, so a batch of 25
        // takes ~30-75s — well within Inngest's step time limit.
        for (const candidate of batchRows) {
          // Get the content for extraction: prefer normalizedText (G7 fast
          // path), fall back to rawJson parsing.
          const extracted = extractJobContent(
            candidate.atsSource,
            candidate.rawJson,
            "",
            candidate.normalizedText,
          );
          const content = extracted.fullText || extracted.description || null;

          try {
            const scopeResult = await extractRemoteScope(
              content,
              candidate.workplaceType as "remote" | "hybrid" | "on-site" | null,
              candidate.atsSource,
              candidate.locationName,
            );

            // Update the job's remoteScope and locationCountries
            await db
              .update(job)
              .set({
                remoteScope: scopeResult.remoteScope,
                locationCountries: scopeResult.allowedCountries,
              })
              .where(eq(job.id, candidate.id));

            if (scopeResult.remoteScope === "undetermined") {
              batchStillUndetermined++;
            } else {
              batchUpdated++;
            }
          } catch (error) {
            console.error(
              `[resurrection-sweep] Failed to extract remote scope for job ${candidate.id}:`,
              error instanceof Error ? error.message : error,
            );
            batchStillUndetermined++;
          }
        }

        return { batchUpdated, batchStillUndetermined };
      });

      updated += result.batchUpdated;
      stillUndetermined += result.batchStillUndetermined;
    }

    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        status: "success",
        source: "nightly_resurrection_sweep",
        itemsProcessed: resurrectionCandidateIds.length,
        itemsInserted: 0,
        itemsUpdated: updated,
        itemsRejected: 0,
        itemsSkipped: stillUndetermined,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return {
      resurrected: resurrectionCandidateIds.length,
      updated,
      stillUndetermined,
    };
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
    // §4.5 — concurrency 25 balances throughput against Neon pooler
    // headroom (max: 30). Originally 15, lowered to 5 under the Inngest
    // free plan concurrency cap; raised to 10 after Sprint 5 self-hosting
    // migration removed the Cloud concurrency limit.
    // Raised to 25 (July 2026) after queue wedge investigation revealed
    // concurrency=10 was the throughput bottleneck for backlog clearing.
    // Neon serverless pooler handles 30 concurrent connections; 25 leaves
    // headroom for the poller and dashboard queries.
    concurrency: { limit: 25 },
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
            // Persist the original listing URL before rawJson is nullified.
            jobUrl: normalization.jobUrl ?? null,
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
            // Persist the original listing URL before rawJson is nullified.
            jobUrl: normalization.jobUrl ?? null,
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
            // Persist the original listing URL for the retry path; rawJson is
            // intentionally left intact so retries can re-extract content.
            jobUrl: normalization.jobUrl ?? null,
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

    // ── Step 4.4: Remote-scope upgrade (v2 ladder for unknown jobs) ────────
    // The poller sets an initial remoteScope at insert time using the
    // regex-only inferRemoteScope (Step 1). Jobs that remain "unknown" after
    // Step 1 are upgraded here via the full v2 extractRemoteScope ladder
    // (Step 1 regex + Step 2 LLM fallback via gpt-4o-mini). This ensures new
    // jobs get accurate geo-classification before Gate 0.5, improving
    // pre-filter precision and preventing the unknown bucket from growing.
    // Jobs that already have a definitive scope (global, country_fenced,
    // region_fenced, onsite) are skipped — no need to re-run the ladder.
    await step.run("upgrade-remote-scope", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { eq } = await import("drizzle-orm");
      const { extractRemoteScope } = await import(
        "@/lib/jobs/remote-scope-extractor"
      );

      // Fetch the job's current remoteScope and metadata needed for extraction
      const rows = await db
        .select({
          remoteScope: job.remoteScope,
          workplaceType: job.workplaceType,
          atsSource: job.atsSource,
          locationName: job.locationName,
          normalizedText: job.normalizedText,
        })
        .from(job)
        .where(eq(job.id, jobId))
        .limit(1);

      if (rows.length === 0) return { upgraded: false, reason: "not-found" };

      const row = rows[0];

      // Only upgrade jobs that are still "unknown" — definitive scopes
      // (including "undetermined" from the resurrection sweep) are left as-is.
      if (row.remoteScope !== "unknown") {
        return { upgraded: false, reason: `scope=${row.remoteScope}` };
      }

      try {
        const scopeResult = await extractRemoteScope(
          row.normalizedText,
          row.workplaceType as "remote" | "hybrid" | "on-site" | null,
          row.atsSource,
          row.locationName,
        );

        await db
          .update(job)
          .set({
            remoteScope: scopeResult.remoteScope,
            locationCountries: scopeResult.allowedCountries,
          })
          .where(eq(job.id, jobId));

        return {
          upgraded: true,
          newScope: scopeResult.remoteScope,
          resolvedBy: scopeResult.resolvedBy,
        };
      } catch (error) {
        // Non-fatal: if the LLM call fails, the job keeps remoteScope="unknown"
        // and passes through Gate 0.5 to Gate 3 (which evaluates JD text).
        console.warn(
          `[jobIngestedHandler] Remote-scope upgrade failed for job ${jobId}:`,
          error instanceof Error ? error.message : error,
        );
        return { upgraded: false, reason: "extraction-failed" };
      }
    });

    // ── Step 4.5: Gate 0.5 hard-blocker pre-filter ─────────────────────────
    // Runs after normalization succeeds but before Gate 1+2 routing. Checks
    // for hard blockers (geo-fencing, compensation tier, experience band)
    // that make the job fundamentally ineligible regardless of tech match.
    // Jobs that fail are tombstoned (status='rejected') and never enter the
    // matching pipeline — saving Gate 1+2 query cost and Gate 3 LLM cost.
    // See docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md.
    const preFilterResult = await step.run("gate-0-5-pre-filter", async () => {
      const { db } = await import("@/db/db");
      const { job } = await import("@/db/schemas/jobs/job");
      const { applicant } = await import("@/db/schemas/jobs/applicant");
      const { eq } = await import("drizzle-orm");
      const { runHardBlockerPreFilter } = await import(
        "@/lib/jobs/gate-zero-pre-filter"
      );
      const { getExcludedCountriesRaw } = await import(
        "@/lib/jobs/excluded-countries"
      );

      // Load the admin-managed excluded countries set (uncached — Inngest
      // runs outside the Next.js request lifecycle, so Cache Components
      // "use cache" directives don't apply here).
      const excludedSet = await getExcludedCountriesRaw();

      // Fetch the job with Gate 0.5 metadata fields
      const jobRows = await db
        .select({
          title: job.title,
          locationName: job.locationName,
          workplaceType: job.workplaceType,
          normalizedText: job.normalizedText,
          titleRegionTag: job.titleRegionTag,
          locationCountries: job.locationCountries,
          experienceMinYears: job.experienceMinYears,
          experienceMaxYears: job.experienceMaxYears,
          compensationMin: job.compensationMin,
          compensationMax: job.compensationMax,
          compensationCurrency: job.compensationCurrency,
          remoteScope: job.remoteScope,
        })
        .from(job)
        .where(eq(job.id, jobId))
        .limit(1);

      if (jobRows.length === 0) {
        return {
          passes: true,
          blockers: [] as string[],
          patternDetected: null,
        };
      }

      // Fetch ALL applicants — Gate 0.5 is job-level, not persona-level.
      // The job passes if it passes for at least one applicant.
      const applicants = await db
        .select({
          country: applicant.country,
          assignmentTypes: applicant.assignmentTypes,
          preferredCompliance: applicant.preferredCompliance,
          expectedCompMin: applicant.expectedCompMin,
          yearsOfExperience: applicant.yearsOfExperience,
        })
        .from(applicant);

      if (applicants.length === 0) {
        return {
          passes: true,
          blockers: [] as string[],
          patternDetected: null,
        };
      }

      const jobRow = jobRows[0];

      // Check against all applicants. If any applicant passes, the job proceeds.
      const results = applicants.map((app) =>
        runHardBlockerPreFilter({
          job: {
            title: jobRow.title,
            locationName: jobRow.locationName,
            workplaceType: jobRow.workplaceType as
              | "remote"
              | "hybrid"
              | "on-site"
              | null,
            normalizedText: jobRow.normalizedText,
            titleRegionTag: jobRow.titleRegionTag,
            locationCountries: jobRow.locationCountries,
            experienceMinYears: jobRow.experienceMinYears,
            experienceMaxYears: jobRow.experienceMaxYears,
            // numeric columns return strings — parse to numbers
            compensationMin:
              jobRow.compensationMin !== null
                ? Number(jobRow.compensationMin)
                : null,
            compensationMax:
              jobRow.compensationMax !== null
                ? Number(jobRow.compensationMax)
                : null,
            compensationCurrency: jobRow.compensationCurrency,
            remoteScope: (jobRow.remoteScope ?? "unknown") as
              | "global"
              | "country_fenced"
              | "region_fenced"
              | "onsite"
              | "unknown"
              | "undetermined",
          },
          applicant: {
            country: app.country,
            assignmentTypes: app.assignmentTypes ?? [],
            preferredCompliance: app.preferredCompliance ?? [],
            expectedCompMin:
              app.expectedCompMin !== null ? Number(app.expectedCompMin) : null,
            yearsOfExperience: app.yearsOfExperience,
          },
          excludedCountries: excludedSet,
        }),
      );

      // If any applicant passes, the job proceeds to Gate 1+2
      const anyPass = results.some((r) => r.passes);
      if (anyPass) {
        return {
          passes: true,
          blockers: [] as string[],
          patternDetected: null,
        };
      }

      // All applicants failed — tombstone the job with the first failure's info
      const firstFailure = results.find((r) => !r.passes);
      if (!firstFailure) {
        // Defensive: should never happen since anyPass is false
        return {
          passes: true,
          blockers: [] as string[],
          patternDetected: null,
        };
      }

      await db
        .update(job)
        .set({
          status: "rejected",
          rejectionPattern: firstFailure.patternDetected,
          normalizedAt: new Date(), // Terminal state
        })
        .where(eq(job.id, jobId));

      return {
        passes: false,
        blockers: firstFailure.blockers,
        patternDetected: firstFailure.patternDetected,
      };
    });

    if (!preFilterResult.passes) {
      console.log(
        `[jobIngestedHandler] Gate 0.5 rejected job ${jobId}: ` +
          `${preFilterResult.patternDetected} — ${preFilterResult.blockers.join("; ")}`,
      );
      return {
        jobId,
        normalizationStatus: "normalized",
        gate05Rejected: true,
        pattern: preFilterResult.patternDetected,
        blockers: preFilterResult.blockers,
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
            remoteScope: job.remoteScope,
            locationCountries: job.locationCountries,
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
            workAuthorizations: applicant.workAuthorizations,
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
            remoteScope: jobRows[0].remoteScope as
              | "global"
              | "country_fenced"
              | "region_fenced"
              | "onsite"
              | "unknown"
              | "undetermined"
              | null,
            locationCountries: jobRows[0].locationCountries ?? null,
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
            workAuthorizations: applicantRows[0].workAuthorizations ?? [],
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
          workAuthRiskFlag: verdict.workAuthRiskFlag ?? false,
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
    let totalGate05Rejected = 0;

    for (let i = 0; i < jobIds.length; i += BATCH) {
      const batchIds = jobIds.slice(i, i + BATCH);
      const batchNum = Math.floor(i / BATCH) + 1;
      const stepName = `reprocess-batch-${batchNum}`;

      const batchResult = await step.run(stepName, async () => {
        const { db } = await import("@/db/db");
        const { sql, eq } = await import("drizzle-orm");
        const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
        const { runHardBlockerPreFilter } = await import(
          "@/lib/jobs/gate-zero-pre-filter"
        );
        const { getExcludedCountriesRaw } = await import(
          "@/lib/jobs/excluded-countries"
        );
        const { job: jobSchema } = await import("@/db/schemas/jobs/job");
        const { applicant: applicantSchema } = await import(
          "@/db/schemas/jobs/applicant"
        );

        // Build a UUID array literal for the WHERE clause.
        // Drizzle's parameterized array binding doesn't work with ANY() —
        // it expands to ($1, $2, ...) which Postgres treats as a record,
        // not an array. Using a raw array literal avoids this issue.
        // UUIDs are safe to interpolate (validated by the DB in the prior query).
        const uuidArraySql = `ARRAY[${batchIds.map((id) => `'${id}'`).join(",")}]::uuid[]`;

        // Load tags + embeddings + Gate 0.5 metadata for this batch only.
        // Re-check status = 'active' and job_embedding IS NOT NULL in case the
        // job was deactivated or re-normalized between step 1 and this batch.
        // Gate 0.5 metadata fields are needed to run the hard-blocker pre-filter
        // before Gate 1+2 — without this, country-fenced remote jobs from direct
        // ingestion boards bypass Gate 0.5 entirely (the root cause of the
        // NoFluffJobs Poland-locked mismatch bug).
        const result = await db.execute(sql`
          SELECT
            j.id,
            j.extracted_tags,
            j.job_embedding::text AS job_embedding_str,
            j.title,
            j.location_name,
            j.workplace_type,
            j.normalized_text,
            j.title_region_tag,
            j.location_countries,
            j.experience_min_years,
            j.experience_max_years,
            j.compensation_min,
            j.compensation_max,
            j.compensation_currency,
            j.remote_scope
          FROM job j
          WHERE j.id = ANY(${sql.raw(uuidArraySql)})
            AND j.status = 'active'
            AND j.job_embedding IS NOT NULL
        `);

        const jobs = result.rows.map((row) => ({
          id: row.id as string,
          extractedTags: (row.extracted_tags as string[]) ?? [],
          jobEmbedding: parseVectorString(row.job_embedding_str as string),
          // Gate 0.5 metadata
          title: row.title as string,
          locationName: row.location_name as string | null,
          workplaceType: row.workplace_type as
            | "remote"
            | "hybrid"
            | "on-site"
            | null,
          normalizedText: row.normalized_text as string | null,
          titleRegionTag: row.title_region_tag as string | null,
          locationCountries: row.location_countries as string[] | null,
          experienceMinYears: row.experience_min_years as number | null,
          experienceMaxYears: row.experience_max_years as number | null,
          compensationMin:
            row.compensation_min !== null ? Number(row.compensation_min) : null,
          compensationMax:
            row.compensation_max !== null ? Number(row.compensation_max) : null,
          compensationCurrency: row.compensation_currency as string | null,
          remoteScope: (row.remote_scope ?? "unknown") as
            | "global"
            | "country_fenced"
            | "region_fenced"
            | "onsite"
            | "unknown"
            | "undetermined",
        }));

        // ── Gate 0.5: Hard-blocker pre-filter ──────────────────────────────
        // Direct-ingested jobs (NoFluffJobs, JustJoin, etc.) bypass the
        // jobIngestedHandler (which contains Gate 0.5) because upsertDirectJobs
        // sets normalizedAt = now. This sweep picks them up and must run Gate 0.5
        // here — otherwise country-fenced remote jobs reach Gate 3, which
        // approves them (the root cause of the 13 mismatch rows).
        const excludedSet = await getExcludedCountriesRaw();

        const applicants = await db
          .select({
            country: applicantSchema.country,
            assignmentTypes: applicantSchema.assignmentTypes,
            preferredCompliance: applicantSchema.preferredCompliance,
            expectedCompMin: applicantSchema.expectedCompMin,
            yearsOfExperience: applicantSchema.yearsOfExperience,
          })
          .from(applicantSchema);

        let gate05Rejected = 0;
        const gate05Passed: typeof jobs = [];

        if (applicants.length > 0) {
          for (const j of jobs) {
            const results = applicants.map((app) =>
              runHardBlockerPreFilter({
                job: {
                  title: j.title,
                  locationName: j.locationName,
                  workplaceType: j.workplaceType,
                  normalizedText: j.normalizedText,
                  titleRegionTag: j.titleRegionTag,
                  locationCountries: j.locationCountries,
                  experienceMinYears: j.experienceMinYears,
                  experienceMaxYears: j.experienceMaxYears,
                  compensationMin: j.compensationMin,
                  compensationMax: j.compensationMax,
                  compensationCurrency: j.compensationCurrency,
                  remoteScope: j.remoteScope,
                },
                applicant: {
                  country: app.country,
                  assignmentTypes: app.assignmentTypes ?? [],
                  preferredCompliance: app.preferredCompliance ?? [],
                  expectedCompMin:
                    app.expectedCompMin !== null
                      ? Number(app.expectedCompMin)
                      : null,
                  yearsOfExperience: app.yearsOfExperience,
                },
                excludedCountries: excludedSet,
              }),
            );

            const anyPass = results.some((r) => r.passes);
            if (anyPass) {
              gate05Passed.push(j);
            } else {
              // All applicants failed Gate 0.5 — tombstone the job
              const firstFailure = results.find((r) => !r.passes);
              await db
                .update(jobSchema)
                .set({
                  status: "rejected",
                  rejectionPattern: firstFailure?.patternDetected ?? null,
                  normalizedAt: new Date(),
                })
                .where(eq(jobSchema.id, j.id));
              gate05Rejected++;
            }
          }
        } else {
          // No applicants — pass all through (defensive, same as jobIngestedHandler)
          gate05Passed.push(...jobs);
        }

        const candidates: {
          matchQueueId: string;
          jobId: string;
          personaId: string;
          applicantId: string;
        }[] = [];

        // Run Gate 1+2 for Gate 0.5-passed jobs in the batch in parallel.
        // Sequential processing (25 jobs × ~3s each = 75s per batch) was the
        // bottleneck causing 41+ minute runs. Parallelizing with Promise.all
        // cuts each batch to ~3-5s (limited by DB connection pool concurrency).
        const batchResults = await Promise.all(
          gate05Passed.map((j) =>
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

        return { count: candidates.length, gate05Rejected };
      });

      totalCandidates += batchResult.count;
      totalGate05Rejected += batchResult.gate05Rejected;
    }

    return {
      reprocessed: jobIds.length,
      candidates: totalCandidates,
      gate05Rejected: totalGate05Rejected,
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

// ── v2 Corpus Expansion: Funding-Signal Seeders (Criterion 1 Discovery Layer) ──
//
// These two seeders replace the v1 bulk-undifferentiated seeders with
// funding-signal-driven company discovery. They use the new
// `discoverySource` enum values `funding_signal` and `github_probe` (added
// in Phase 1) and populate the v2 scoring-signal fields (`employeeCount`,
// `isPublic`) on the company row.
//
// See docs/governing/company-corpus-expansion-new.md Criterion 1 "Discovery
// Layer" and docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md Session 2.

/**
 * v2 Funding-Signal RSS — parses RSS/Atom funding feeds (TechCrunch, etc.)
 * for funding-round announcements, estimates employee count from the stage,
 * applies the startup filter (< 50 employees), and inserts surviving
 * companies with `discoverySource = "funding_signal"`.
 *
 * Runs at 13:00 UTC (after D11 Tech News RSS at 08:00 — avoids overlap).
 */
export const v2FundingSignalRss = inngest.createFunction(
  {
    id: "v2-funding-signal-rss",
    name: "v2 Funding-Signal RSS Seeder",
    triggers: [{ cron: "0 13 * * *" }],
  },
  async ({ step }) => {
    const { runFundingSignalRssSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/funding-signal-rss"
    );
    return runSourceFunction({
      step,
      sourceName: "v2-funding-signal-rss",
      logSource: "funding_signal_rss",
      execute: () =>
        step.run("fetch-and-process", async () =>
          runFundingSignalRssSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.fundingArticles,
        itemsInserted: r.resolved,
        itemsRejected: r.filteredByStartupThreshold,
        itemsSkipped: r.unresolved,
      }),
    });
  },
);

/**
 * v2 GitHub Events Probe — polls the GitHub Events API for a curated list of
 * YC/VC-funded orgs, checks for recent activity, and inserts active orgs
 * with `discoverySource = "github_probe"`.
 *
 * Runs at 14:00 UTC (after the funding-signal RSS seeder at 13:00).
 */
export const v2GithubEventsProbe = inngest.createFunction(
  {
    id: "v2-github-events-probe",
    name: "v2 GitHub Events API Probe Seeder",
    triggers: [{ cron: "0 14 * * *" }],
  },
  async ({ step }) => {
    const { runGithubEventsProbeSeeder } = await import(
      "@/lib/jobs/seeders/daily-sources/github-events-probe"
    );
    return runSourceFunction({
      step,
      sourceName: "v2-github-events-probe",
      logSource: "github_events_probe",
      execute: () =>
        step.run("fetch-and-probe", async () =>
          runGithubEventsProbeSeeder(fetch),
        ),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalOrgs,
        itemsInserted: r.resolved,
        itemsRejected: r.inactiveOrgs,
        itemsSkipped: r.unresolved,
      }),
    });
  },
);

/**
 * v2 Frontend Job Scanner — P2-2 Discovery Layer
 *
 * Inverts the discovery model: searches for frontend jobs on ATS domains
 * (Greenhouse, Lever, Ashby) via Brave Search, then extracts the company
 * slug and adds it to the polling corpus.
 *
 * Requires BRAVE_SEARCH_API_KEY env var.
 * Cron: every 6 hours (4x/day for faster frontend company discovery).
 * 3 queries/run × 4 runs/day × 30 days = 360 queries/month, well within
 * the Brave Search free tier of 2,000 queries/month.
 *
 * ── Auto-poll enhancement (July 7 2026) ────────────────────────────────────
 * Newly discovered frontend companies are immediately polled via `poller/run`
 * events, rather than waiting for the next batch poll cycle (active_hot: 3h,
 * active: 12h). This dramatically reduces the time from "frontend company
 * discovered" to "frontend jobs in the matching funnel" — from hours to
 * minutes. The phalanx poller respects rate limits (maxConcurrent: 1,
 * minTime: 500ms per ATS source), so a burst of poll events is safe.
 */
export const v2FrontendJobScanner = inngest.createFunction(
  {
    id: "v2-frontend-job-scanner",
    name: "v2 Frontend Job Scanner",
    triggers: [{ cron: "0 */6 * * *" }],
  },
  async ({ step }) => {
    const { runFrontendJobScannerDaily } = await import(
      "@/lib/jobs/seeders/daily-sources/frontend-job-scanner"
    );
    const result = await runSourceFunction({
      step,
      sourceName: "v2-frontend-job-scanner",
      logSource: "frontend_job_scanner",
      execute: () =>
        step.run("scan-frontend-jobs", async () => {
          const apiKey = process.env.BRAVE_SEARCH_API_KEY;
          if (!apiKey) {
            throw new Error(
              "BRAVE_SEARCH_API_KEY is not set — frontend job scanner cannot run",
            );
          }
          return runFrontendJobScannerDaily({ apiKey }, fetch);
        }),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalResultsFound,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected.length,
        itemsSkipped: r.insertResult.skipped,
      }),
    });

    // Auto-poll newly discovered companies to get their frontend jobs into
    // the matching funnel immediately, rather than waiting for the next
    // batch poll cycle (which could be 3-12 hours depending on tier).
    // Guard: runSourceFunction may return a skip object (circuit-breaker or
    // storage-near-limit) which doesn't have insertResult — check first.
    if (
      result &&
      "insertResult" in result &&
      Array.isArray(result.insertResult?.insertedCompanies) &&
      result.insertResult.insertedCompanies.length > 0
    ) {
      const newCompanies = result.insertResult.insertedCompanies;
      await step.sendEvent(
        "poll-new-frontend-companies",
        newCompanies.map((c) => ({
          id: `poller-run-${c.id}-${Date.now()}`,
          name: "poller/run",
          data: { companyId: c.id },
        })),
      );
      console.log(
        `[v2FrontendJobScanner] Emitted ${newCompanies.length} poller/run events for newly discovered frontend companies`,
      );
    }

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

// ── Hourly Storage Monitor (Sprint 8) ───────────────────────────────────────
// Runs every hour to catch sudden storage spikes and normalization backlogs.
// It calls the same checkStorageAlerts logic used by the daily health check,
// so alerts are deduplicated and emails are only sent when the state changes.
export const storageMonitor = inngest.createFunction(
  {
    id: "storage-monitor",
    name: "Hourly Storage Monitor",
    triggers: [{ cron: "0 * * * *" }],
  },
  async ({ step, logger }) => {
    const status = await step.run("check-storage-alerts", async () => {
      const { checkStorageAlerts } = await import("@/lib/jobs/alerting");
      await checkStorageAlerts();
      const { isStorageSafeForIngestion } = await import(
        "@/lib/jobs/storage-check"
      );
      return isStorageSafeForIngestion();
    });

    logger.info("Storage monitor completed", {
      allow: status.allow,
      currentMb: status.currentMb,
      percentage: status.percentage,
      unnormalizedCount: status.unnormalizedCount,
      forced: status.forced,
    });

    return {
      allow: status.allow,
      currentMb: status.currentMb,
      percentage: status.percentage,
      unnormalizedCount: status.unnormalizedCount,
      forced: status.forced,
      reason: status.reason,
    };
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

// ── Emergency Storage Purge (Sprint 8) ───────────────────────────────────────
// Triggered automatically when storage crosses the 88% ingestion halt
// threshold, or manually via the admin dashboard.
//
// The auto-trigger is based on storage percentage only — a high unnormalized
// backlog blocks ingestion but does NOT run this purge. The purge is meant to
// reclaim space, and deleting unnormalized jobs would destroy data the
// normalizer is still processing.
//
// Runs a tiered purge that deletes jobs with zero matching impact first
// (normalization_failed → rejected → gone → stale), only touching the active
// corpus (FIFO by detected_at) as a last resort. Stops when storage drops
// below 75%. Sends an email alert with the purge summary.
//
// The `purge/event` trigger allows manual invocation from the admin dashboard
// without waiting for the cron to fire.
export const emergencyStoragePurge = inngest.createFunction(
  {
    id: "emergency-storage-purge",
    name: "Emergency Storage Purge — Tiered Job Deletion",
    triggers: [
      { event: "purge/emergency-storage" },
      { cron: "*/15 * * * *" }, // check every 15 min if purge is needed
    ],
  },
  async ({ event, step, logger }) => {
    const isManualTrigger = event.name === "purge/emergency-storage";

    // Step 1: Check if purge is needed (skip for manual trigger — always run)
    const storageStatus = await step.run("check-storage", async () => {
      const { isStorageSafeForIngestion } = await import(
        "@/lib/jobs/storage-check"
      );
      return isStorageSafeForIngestion();
    });

    if (shouldSkipEmergencyPurge(isManualTrigger, storageStatus.percentage)) {
      // Auto-trigger: storage is fine, no purge needed
      return {
        triggered: false,
        reason: "storage below halt threshold — no purge needed",
        currentMb: storageStatus.currentMb,
        percentage: storageStatus.percentage,
      };
    }

    logger.warn("Emergency storage purge triggered", {
      manual: isManualTrigger,
      currentMb: storageStatus.currentMb,
      percentage: storageStatus.percentage,
      reason: storageStatus.reason,
    });

    // Step 2: Run the tiered purge
    const purgeResult = await step.run("run-tiered-purge", async () => {
      const { runEmergencyPurge } = await import(
        "@/lib/jobs/poller/cleanup-queries"
      );
      const { getDatabaseSizeMb } = await import("@/lib/jobs/storage-check");
      return runEmergencyPurge(getDatabaseSizeMb);
    });

    // Step 3: Write an ingestion log entry
    await step.run("write-log", async () => {
      const { writeIngestionLog } = await import(
        "@/lib/jobs/poller/ingestion-log"
      );
      return writeIngestionLog({
        type: "stale_cleanup",
        status: "success",
        source: "emergency_storage_purge",
        itemsProcessed: purgeResult.totalDeleted,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        errorDetails: {
          tiers: purgeResult.tiers,
          storageBeforeMb: purgeResult.storageBeforeMb,
          storageAfterMb: purgeResult.storageAfterMb,
          recovered: purgeResult.recovered,
          stopReason: purgeResult.stopReason,
          manualTrigger: isManualTrigger,
        },
        startedAt: new Date(),
        finishedAt: new Date(),
      });
    });

    // Step 4: Send alert email with purge summary only when something actionable
    // happened. Skip the email when the auto-triggered purge deleted nothing and
    // storage was already below the recovery threshold — that scenario produces
    // noise and usually means the trigger condition itself was misconfigured.
    await step.run("send-purge-alert", async () => {
      const { sendStorageAlertEmail } = await import(
        "@/lib/jobs/storage-alert"
      );
      const { STORAGE_LIMIT_MB } = await import("@/lib/jobs/storage-check");

      const meaningfulRun =
        isManualTrigger ||
        purgeResult.totalDeleted > 0 ||
        !purgeResult.recovered ||
        purgeResult.walInflationDetected ||
        purgeResult.corpusGuardTriggered;

      if (!meaningfulRun) {
        return { sent: false, reason: "nothing to report — no jobs deleted" };
      }

      const tierSummary = purgeResult.tiers
        .map((t) => `${t.tier}: ${t.deletedCount}`)
        .join(", ");

      const reason = purgeResult.walInflationDetected
        ? `Emergency purge ABORTED due to WAL inflation — ${purgeResult.totalDeleted} jobs deleted (${tierSummary}). Storage: ${purgeResult.storageBeforeMb.toFixed(0)}MB → ${purgeResult.storageAfterMb.toFixed(0)}MB. ${purgeResult.stopReason} Manual intervention required: reduce Neon history retention or wait for WAL to age out.`
        : purgeResult.corpusGuardTriggered
          ? `Emergency purge ABORTED by corpus percentage guard — ${purgeResult.totalDeleted} jobs deleted (${tierSummary}). Storage: ${purgeResult.storageBeforeMb.toFixed(0)}MB → ${purgeResult.storageAfterMb.toFixed(0)}MB. ${purgeResult.stopReason}`
          : purgeResult.recovered
            ? `Emergency purge completed — ${purgeResult.totalDeleted} jobs deleted (${tierSummary}). Storage recovered from ${purgeResult.storageBeforeMb.toFixed(0)}MB to ${purgeResult.storageAfterMb.toFixed(0)}MB.`
            : `Emergency purge completed but storage still above recovery threshold — ${purgeResult.totalDeleted} jobs deleted (${tierSummary}). Storage: ${purgeResult.storageBeforeMb.toFixed(0)}MB → ${purgeResult.storageAfterMb.toFixed(0)}MB. Manual intervention required.`;

      await sendStorageAlertEmail({
        severity: purgeResult.recovered ? "warning" : "critical",
        currentMb: purgeResult.storageAfterMb,
        limitMb: STORAGE_LIMIT_MB,
        percentage: purgeResult.storageAfterMb / STORAGE_LIMIT_MB,
        reason,
        ingestionHalted: !purgeResult.recovered,
      });
      return { sent: true };
    });

    // Step 5: Resolve the storage_critical alert if recovered
    if (purgeResult.recovered) {
      await step.run("resolve-critical-alert", async () => {
        const { resolveAlertsByType } = await import("@/lib/jobs/alerting");
        return resolveAlertsByType("storage_critical");
      });
    }

    logger.info("Emergency storage purge completed", {
      totalDeleted: purgeResult.totalDeleted,
      storageBeforeMb: purgeResult.storageBeforeMb,
      storageAfterMb: purgeResult.storageAfterMb,
      recovered: purgeResult.recovered,
    });

    return {
      triggered: true,
      manualTrigger: isManualTrigger,
      ...purgeResult,
    };
  },
);

// ── Inngest Health Monitor (Sprint 9) ────────────────────────────────────────
// Runs every 5 minutes to check the Inngest server's health. This is a
// self-monitoring function — it checks whether the Inngest server itself is
// reachable, whether function runs are failing at a high rate, and whether
// the pipeline has stalled (no jobs normalized in 4h).
//
// When an issue is detected:
//   1. A critical alert is created in the alerts table (visible on the dashboard)
//   2. An email is sent to ADMIN_ALERT_EMAIL with full diagnostics and
//      acceptance criteria for resuming
//
// Alert types:
//   - inngest_server_down: Health check fails or Coolify shows stopped/exited
//   - inngest_function_failures: >50% ingestion run failure rate in 1h
//   - inngest_pipeline_stall: No jobs normalized in 4h
//
// Note: This function runs on the Inngest server itself, so if the server is
// down, this function won't run. The Coolify status check (via the Coolify
// API) is the fallback — it works even when the Inngest server is down because
// it's called from the Next.js server, not from Inngest. However, the cron
// trigger won't fire if Inngest is down. For full coverage, the admin
// dashboard's InngestStatusControl component also polls the Coolify API every
// 30 seconds when an admin is viewing the page.
export const inngestHealthMonitor = inngest.createFunction(
  {
    id: "inngest-health-monitor",
    name: "Inngest Health Monitor",
    triggers: [{ cron: "*/5 * * * *" }], // every 5 min
  },
  async ({ step, logger }) => {
    // Step 1: Get Coolify container status
    const coolifyStatus = await step.run("check-coolify-status", async () => {
      const { getInngestStatus } = await import("@/lib/coolify/client");
      return getInngestStatus();
    });

    // Step 2: Run health checks (HTTP + function failures + pipeline stall)
    const healthReport = await step.run("run-health-checks", async () => {
      const { getInngestHealthReport } = await import(
        "@/lib/coolify/inngest-health"
      );
      return getInngestHealthReport();
    });

    // Step 3: Determine alert reason (if any)
    const alertReason = await step.run("determine-alert", async () => {
      if (!coolifyStatus.isRunning || !healthReport.healthCheck.reachable) {
        return coolifyStatus.isPaused ? "server_paused" : "server_unreachable";
      }
      if (healthReport.functionFailures.thresholdExceeded) {
        return "function_failure_spike";
      }
      if (healthReport.pipelineStall.stalled) {
        return "pipeline_stall";
      }
      return null;
    });

    // Step 4: Create/resolve alerts and send email
    const alertResult = await step.run("manage-alerts-and-email", async () => {
      const { createAlert, hasActiveAlert, resolveAlertsByType } = await import(
        "@/lib/jobs/alerting"
      );
      const { sendInngestAlertEmail } = await import(
        "@/lib/coolify/inngest-alert-email"
      );

      let alertCreated = false;

      if (alertReason) {
        // Map reason to alert type
        const alertType =
          alertReason === "server_unreachable" ||
          alertReason === "server_paused"
            ? "inngest_server_down"
            : alertReason === "function_failure_spike"
              ? "inngest_function_failures"
              : "inngest_pipeline_stall";

        const severity =
          alertReason === "server_unreachable" ||
          alertReason === "server_paused"
            ? "critical"
            : "warning";

        // ── Stale alert resolution ───────────────────────────────────────────
        // Resolve alerts of OTHER types that are no longer the current reason.
        // Without this, a server_down alert stays active forever after the
        // server recovers but the pipeline is still stalled (the monitor only
        // reaches the "all healthy" resolution path when alertReason === null).
        if (alertReason === "pipeline_stall") {
          // Server is up (pipeline stall detected via DB query, not HTTP check).
          // Resolve any stale server_down alert from a prior outage.
          const resolved = await resolveAlertsByType("inngest_server_down");
          if (resolved > 0) {
            logger.info(
              "Resolved stale inngest_server_down alert — server recovered but pipeline still stalled",
            );
          }
        } else if (alertReason === "function_failure_spike") {
          // Server is up and pipeline is not stalled (stall check ran first).
          // Resolve stale server_down and pipeline_stall alerts.
          const resolved =
            (await resolveAlertsByType("inngest_server_down")) +
            (await resolveAlertsByType("inngest_pipeline_stall"));
          if (resolved > 0) {
            logger.info(
              `Resolved ${resolved} stale Inngest alert(s) — current issue is function failure spike`,
            );
          }
        }
        // If alertReason is "server_unreachable" or "server_paused", the server
        // is down — we cannot determine pipeline state, so don't resolve anything.

        // Create alert if not already active (deduplicated)
        if (!(await hasActiveAlert(alertType))) {
          await createAlert({
            type: alertType,
            severity,
            message: healthReport.alerts.join(" | "),
            details: JSON.stringify({
              reason: alertReason,
              coolifyStatus: coolifyStatus.coolifyStatus,
              healthCheck: healthReport.healthCheck,
              functionFailures: healthReport.functionFailures,
              pipelineStall: healthReport.pipelineStall,
            }),
          });
          alertCreated = true;
          logger.warn(
            `Inngest health alert created: ${alertReason} — ${healthReport.alerts.join(", ")}`,
          );
        }

        // Send email only if the alert was newly created (not on every check)
        if (alertCreated) {
          const dashboardUrl = process.env.NEXT_PUBLIC_SITE_URL
            ? `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/admin?tab=pipeline`
            : "/dashboard/admin?tab=pipeline";

          await sendInngestAlertEmail({
            reason: alertReason as
              | "server_unreachable"
              | "server_paused"
              | "function_failure_spike"
              | "pipeline_stall",
            healthReport,
            coolifyStatus,
            dashboardUrl,
          });
        }
      } else {
        // All healthy — resolve any existing Inngest alerts
        const resolved =
          (await resolveAlertsByType("inngest_server_down")) +
          (await resolveAlertsByType("inngest_function_failures")) +
          (await resolveAlertsByType("inngest_pipeline_stall"));
        if (resolved > 0) {
          logger.info(
            `Inngest health recovered — ${resolved} alert(s) resolved`,
          );
        }
      }

      return { alertReason, alertCreated };
    });

    // Step 5: Auto-restart Inngest on prolonged pipeline stall
    //
    // The Inngest self-hosted server (v1.34.0) has a known bug (GitHub issue
    // #3549) where the executor/queue processor becomes wedged after a burst
    // of concurrent executions — event-triggered runs stay stuck in QUEUED
    // while cron-triggered functions continue to work. The only recovery is
    // restarting the Inngest service.
    //
    // This safeguard automatically restarts the Inngest service when a pipeline
    // stall persists for longer than the cooldown period (indicating the queue
    // processor is wedged, not just temporarily slow). The cooldown prevents
    // restart loops: we check the existing inngest_pipeline_stall alert's
    // createdAt — if it's older than the cooldown, we restart and recreate the
    // alert (resetting the cooldown timer).
    //
    // Disabled by default in dev (INNGEST_DEV=1). Enable in production with
    // INNGEST_AUTO_RESTART_ON_STALL=true (default: true when not in dev mode).
    if (alertResult.alertReason === "pipeline_stall") {
      await step.run("auto-restart-on-stall", async () => {
        const autoRestartEnabled =
          process.env.INNGEST_AUTO_RESTART_ON_STALL !== "false" &&
          process.env.INNGEST_DEV !== "1";

        if (!autoRestartEnabled) {
          return { restarted: false, reason: "auto_restart_disabled" };
        }

        // Cooldown: only restart if the stall has persisted for >30 minutes.
        // We check the existing inngest_pipeline_stall alert's createdAt.
        const STALL_RESTART_COOLDOWN_MINUTES = 30;

        const { db } = await import("@/db/db");
        const { alerts } = await import("@/db/schemas/jobs/alerts");
        const { and, eq, desc } = await import("drizzle-orm");

        const existingAlerts = await db
          .select({ id: alerts.id, createdAt: alerts.createdAt })
          .from(alerts)
          .where(
            and(
              eq(alerts.type, "inngest_pipeline_stall"),
              eq(alerts.status, "active"),
            ),
          )
          .orderBy(desc(alerts.createdAt))
          .limit(1);

        if (existingAlerts.length === 0) {
          return { restarted: false, reason: "no_existing_stall_alert" };
        }

        const stallAlertAge =
          Date.now() - new Date(existingAlerts[0].createdAt).getTime();
        const cooldownMs = STALL_RESTART_COOLDOWN_MINUTES * 60 * 1000;

        if (stallAlertAge < cooldownMs) {
          logger.info(
            `Pipeline stall ongoing for ${Math.round(stallAlertAge / 1000 / 60)}min — waiting for ${STALL_RESTART_COOLDOWN_MINUTES}min cooldown before auto-restart`,
          );
          return {
            restarted: false,
            reason: "cooldown_active",
            stallAgeMinutes: Math.round(stallAlertAge / 1000 / 60),
            cooldownMinutes: STALL_RESTART_COOLDOWN_MINUTES,
          };
        }

        // Stall has persisted beyond cooldown — restart the Inngest service.
        logger.warn(
          `Pipeline stall persisted for ${Math.round(stallAlertAge / 1000 / 60)}min (>${STALL_RESTART_COOLDOWN_MINUTES}min cooldown) — auto-restarting Inngest service to clear wedged queue processor (Inngest bug #3549)`,
        );

        const { restartInngest } = await import("@/lib/coolify/client");
        const result = await restartInngest();

        if (result.success) {
          // Resolve and recreate the stall alert to reset the cooldown timer.
          // This prevents repeated restarts if the first restart doesn't fix it.
          const { resolveAlertsByType, createAlert } = await import(
            "@/lib/jobs/alerting"
          );
          await resolveAlertsByType("inngest_pipeline_stall");
          await createAlert({
            type: "inngest_pipeline_stall",
            severity: "warning",
            message: `INNGEST_PIPELINE_STALL: No jobs normalized in ${healthReport.pipelineStall.windowHours}h — auto-restart triggered to clear wedged queue`,
            details: JSON.stringify({
              reason: "pipeline_stall",
              autoRestart: true,
              restartResult: result,
              stallAgeMinutes: Math.round(stallAlertAge / 1000 / 60),
              coolifyStatus: coolifyStatus.coolifyStatus,
              pipelineStall: healthReport.pipelineStall,
            }),
          });
        }

        return {
          restarted: result.success,
          reason: result.success ? "restart_triggered" : "restart_failed",
          message: result.message,
          stallAgeMinutes: Math.round(stallAlertAge / 1000 / 60),
        };
      });
    }

    logger.info("Inngest health monitor completed", {
      coolifyStatus: coolifyStatus.label,
      healthCheckReachable: healthReport.healthCheck.reachable,
      overallHealthy: healthReport.overallHealthy,
      alertReason,
    });

    return {
      timestamp: new Date().toISOString(),
      coolifyStatus: coolifyStatus.label,
      healthCheck: healthReport.healthCheck,
      functionFailures: healthReport.functionFailures,
      pipelineStall: healthReport.pipelineStall,
      overallHealthy: healthReport.overallHealthy,
      alertReason,
    };
  },
);
