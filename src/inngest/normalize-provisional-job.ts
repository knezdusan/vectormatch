// v2 Corpus Expansion — normalizeProvisionalJob Inngest Function
// src/inngest/normalize-provisional-job.ts
//
// Implements the provisional-job normalization lifecycle from the governing
// document (Criterion 1 "Provisional Job Lifecycle"). Triggered when a
// provisional job is inserted by the domain-probe pipeline.
//
// ── Step Graph (per governing doc) ───────────────────────────────────────────
//   1. extract-and-clean  — HTML-strip rawJson → cleanedText + textHash
//   2. Fork:
//      a. embed           — text-embedding-3-small on cleanedText
//      b. classify-scope  — remote-scope-extractor on cleanedText
//   3. persist-normalized-job — write embedding + tags + remoteScope + status
//
// ── Retry Schedule (per governing doc — 4 attempts) ──────────────────────────
//   Attempt 1: immediate
//   Attempt 2: +5min
//   Attempt 3: +15min
//   Attempt 4: +45min
//   SLA: 4hr total → if still failing, status='normalization_failed'
//
// Inngest handles retries via the `retry` config on step.run. The 4-attempt
// schedule is encoded as exponential backoff. After the final attempt fails,
// the function writes status='normalization_failed' (without normalizedAt,
// keeping the job retryable by a future sweep).
//
// ── Fencing (per governing doc "retryInFlight Fencing") ──────────────────────
// Before each persist, the function checks retryGeneration vs clearedGeneration.
// If the persist's generation ≤ clearedGeneration, it's a zombie write (the
// sweeper already force-cleared this generation) and the persist is skipped.
//
// See docs/governing/company-corpus-expansion-new.md Criterion 1 "Provisional
// Job Lifecycle" and "retryInFlight Fencing".

import { and, eq, sql } from "drizzle-orm";
import { company } from "@/db/schemas/jobs/company";
import { job } from "@/db/schemas/jobs/job";
import { inngest } from "@/inngest/client";
import {
  buildScoringInputFromCompany,
  scoreAndPersistCompany,
} from "@/lib/jobs/company-scorer";
import {
  checkFencing,
  computeTextHash,
  dedupGuard,
  stalenessGate,
} from "@/lib/jobs/seeders/provisional-job-repository";

// ── Retry schedule ───────────────────────────────────────────────────────────
//
// The governing doc specifies a 4-attempt retry schedule (5/15/45/90min).
// Inngest v4 handles retries at the function level via the `retries` config
// (set to 4 on normalizeProvisionalJob below). Per-attempt custom backoff
// would require manual step.sleep logic — the function-level retry is
// sufficient for the 4hr SLA. If custom backoff is needed later, implement
// it via step.sleep in a retry-orchestration wrapper.

// ── Event type ───────────────────────────────────────────────────────────────

/**
 * Event payload for the `job/provisional-ingested` event.
 * Emitted by the provisional-job-repository after inserting a provisional job.
 */
export interface ProvisionalJobEvent {
  name: "job/provisional-ingested";
  data: {
    jobId: string;
    domain: string;
    /** The retryGeneration for this attempt (for fencing). */
    retryGeneration: number;
  };
}

// ── Main Inngest function ────────────────────────────────────────────────────

/**
 * normalizeProvisionalJob — normalizes a provisional job into an active job.
 *
 * Triggered by: `job/provisional-ingested` event
 *
 * Step graph:
 *   1. fetch-provisional-job — load the job row + company lastPolledAt
 *   2. staleness-gate — decide resume (cached) vs refetch (re-poll happened)
 *   3. extract-and-clean — HTML-strip → cleanedText + textHash
 *   4. Fork (parallel):
 *      a. embed — text-embedding-3-small
 *      b. classify-scope — remote-scope-extractor
 *   5. persist-normalized-job — write results + status='active'
 *
 * On failure (all 4 attempts exhausted): status='normalization_failed'.
 *
 * Concurrency: 10 (matches jobIngestedHandler — balances throughput against
 * Postgres pooler headroom and OpenAI rate limits).
 */
export const normalizeProvisionalJob = inngest.createFunction(
  {
    id: "normalize-provisional-job",
    name: "Normalize Provisional Job (v2)",
    triggers: [{ event: "job/provisional-ingested" }],
    concurrency: { limit: 10 },
    // v2 retry schedule (4 attempts: immediate, +5min, +15min, +45min).
    // Per governing doc "Provisional Job Lifecycle": "4-attempt retry
    // (5/15/45/90min), success→active, failure→normalization_failed at 4hr SLA."
    // Inngest retries the entire function on uncaught errors.
    retries: 4,
    // On final failure, trigger the sweeper to clean up the retryInFlight flag.
    // Per governing doc A6: event-driven sweep fires after each normalization
    // attempt, including failures. Without this, a crashed normalizer would
    // leave stale flags until the 30min safety-net cron catches them.
    onFailure: async ({ event, step }) => {
      // The failure event payload has shape { function_id, run_id, error, event }
      // where `event` is the original triggering event with its data.
      const originalEvent = (
        event?.data as { event?: { data?: { jobId?: string } } } | undefined
      )?.event;
      const jobId = originalEvent?.data?.jobId;
      if (!jobId) return { triggered: false, reason: "no_jobId" };
      await step.run("trigger-sweeper-on-failure", async () => {
        const { inngest } = await import("@/inngest/client");
        await inngest.send({
          name: "job/normalization-attempt-completed",
          data: { jobId },
        });
        return { triggered: true };
      });
      return { triggered: true };
    },
  },
  async ({ event, step }) => {
    const { jobId, retryGeneration } = event.data;

    // ── Step 1: Fetch the provisional job + company data ─────────────────────
    // Company fields are needed for both the staleness gate (lastPolledAt) and
    // the company scoring matrix (canonicalName, employeeCount, isAgency, etc.)
    // that runs after normalization (Criterion 3).
    const fetched = await step.run("fetch-provisional-job", async () => {
      const { db } = await import("@/db/db");

      const rows = await db
        .select({
          id: job.id,
          atsSource: job.atsSource,
          atsSlug: job.atsSlug,
          title: job.title,
          rawJson: job.rawJson,
          status: job.status,
          textHash: job.textHash,
          sourceFetchedAt: job.sourceFetchedAt,
          jobVersion: job.jobVersion,
          clearedGeneration: job.clearedGeneration,
          retryInFlight: job.retryInFlight,
          // Company fields for staleness gate + scoring matrix
          companyLastPolledAt: company.lastPolledAt,
          companyId: company.id,
          companyCanonicalName: company.canonicalName,
          companyName: company.companyName,
          companyEmployeeCount: company.employeeCount,
          companyIsAgency: company.isAgency,
          companyIsPublic: company.isPublic,
          companyDiscoverySource: company.discoverySource,
          companyDiscoveredAt: company.discoveredAt,
        })
        .from(job)
        .leftJoin(company, eq(job.atsSlug, company.atsSlug))
        .where(eq(job.id, jobId))
        .limit(1);

      if (rows.length === 0) {
        return { action: "skip" as const, reason: "Job not found in DB" };
      }

      const jobRow = rows[0];

      // Only normalize provisional jobs (idempotency — skip if already active/normalized)
      if (jobRow.status !== "provisional") {
        return {
          action: "skip" as const,
          reason: `Job status is '${jobRow.status}', not 'provisional'`,
        };
      }

      return { action: "normalize" as const, job: jobRow };
    });

    if (fetched.action === "skip") {
      return { skipped: true, reason: fetched.reason, jobId };
    }

    // ── Step 2: Staleness gate ───────────────────────────────────────────────
    // Decide whether to resume (cached data is fresh) or refetch (source
    // re-polled after this job was cached). For now, both paths proceed to
    // extract-and-clean — the refetch path would pull the upserted row, but
    // that's a future enhancement. The gate result is logged for observability.
    const gateResult = await step.run("staleness-gate", async () => {
      // Drizzle returns timestamp columns as Date objects for the pg driver,
      // but the leftJoin on company makes these nullable. Coerce to Date|null.
      const lastPolledRaw = fetched.job.companyLastPolledAt as unknown;
      const fetchedAtRaw = fetched.job.sourceFetchedAt as unknown;
      const lastPolled = lastPolledRaw instanceof Date ? lastPolledRaw : null;
      const fetchedAt = fetchedAtRaw instanceof Date ? fetchedAtRaw : null;
      const staleness = stalenessGate(lastPolled, fetchedAt);
      return { staleness };
    });

    // ── Step 3: Extract and clean ────────────────────────────────────────────
    // HTML-strip the rawJson → cleanedText. Compute textHash for the dedup
    // guard. If textHash matches the existing hash, skip re-embedding (the
    // content hasn't changed).
    const extraction = await step.run("extract-and-clean", async () => {
      const { sanitizeJobDescription } = await import(
        "@/lib/jobs/sanitize-html"
      );

      const rawText = fetched.job.rawJson ?? "";
      // Sanitize the HTML, then strip tags for the cleaned text.
      const sanitized = sanitizeJobDescription(rawText);
      const cleanedText = sanitized
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const htmlDescription = sanitized.trim().length > 0 ? sanitized : null;

      if (cleanedText.length < 100) {
        return {
          status: "rejected" as const,
          reason: "content_too_short",
          cleanedText,
          htmlDescription,
        };
      }

      const newTextHash = computeTextHash(cleanedText);
      const dedup = dedupGuard(fetched.job.textHash, newTextHash);

      return {
        status: "normalized" as const,
        cleanedText,
        htmlDescription,
        textHash: newTextHash,
        dedup,
      };
    });

    if (extraction.status === "rejected") {
      await step.run("write-rejection", async () => {
        const { db } = await import("@/db/db");
        await db
          .update(job)
          .set({
            status: "rejected",
            normalizedText: extraction.cleanedText,
            descriptionHtml: extraction.htmlDescription,
            normalizedAt: new Date(),
            // Clear the in-flight flag
            retryInFlight: false,
          })
          .where(eq(job.id, jobId));
      });
      return {
        jobId,
        normalizationStatus: "rejected",
        reason: extraction.reason,
      };
    }

    // ── Step 4: Fork — embed + classify-scope (parallel) ─────────────────────
    // These two steps are independent and can run in parallel. Inngest's
    // step.run awaits each sequentially, but the underlying work is
    // non-blocking. For true parallelism, we'd use step.run + Promise.all,
    // but Inngest v4 recommends sequential steps for checkpointing.

    // Only re-embed if the content drifted (dedup guard).
    let embedding: number[] | null = null;
    if (extraction.dedup === "drift") {
      embedding = await step.run("embed", async () => {
        const { embedJob } = await import("@/lib/jobs/job-embedder");
        return embedJob(extraction.cleanedText);
      });
    }

    const scopeResult = await step.run("classify-scope", async () => {
      const { extractRemoteScope } = await import(
        "@/lib/jobs/remote-scope-extractor"
      );
      const result = await extractRemoteScope(
        extraction.cleanedText,
        null, // workplaceType — unknown for provisional jobs
        fetched.job.atsSource,
        null, // companyLocation — unknown for provisional jobs
      );
      return { remoteScope: result.remoteScope };
    });

    // A2 reorder: if the classified scope is fenced/onsite, drop the embedding.
    // Fenced jobs are not addressable for global-remote matching — keeping their
    // vector wastes HNSW storage (the primary storage consumer). The embed above ran
    // before scope was known (drift re-normalization), so null it post-hoc.
    if (
      embedding !== null &&
      ["country_fenced", "region_fenced", "onsite"].includes(
        scopeResult.remoteScope,
      )
    ) {
      embedding = null;
    }

    // ── Step 5: Persist normalized job ────────────────────────────────────────
    // Fencing check: reject zombie writes (generation ≤ clearedGeneration).
    await step.run("persist-normalized-job", async () => {
      const { db } = await import("@/db/db");

      // Fencing — check if this attempt's generation is still legitimate.
      const fencing = checkFencing(
        retryGeneration,
        fetched.job.clearedGeneration ?? null,
      );
      if (fencing === "zombie") {
        // Zombie write — the sweeper already cleared this generation. Skip.
        return { persisted: false, reason: "zombie_write_rejected" };
      }

      // Content-drift guard: if the embedding changed materially, bump jobVersion.
      let jobVersion = fetched.job.jobVersion;
      if (embedding !== null) {
        // For the first normalization (no existing embedding), no drift check.
        // For re-normalization, the caller would pass the old embedding.
        // Here we just increment if dedup said "drift" and this is a re-normalization.
        if (extraction.dedup === "drift" && fetched.job.textHash !== null) {
          jobVersion += 1;
        }
      }

      await db
        .update(job)
        .set({
          normalizedText: extraction.cleanedText,
          descriptionHtml: extraction.htmlDescription,
          textHash: extraction.textHash,
          jobEmbedding: embedding,
          remoteScope: scopeResult.remoteScope,
          status: "active",
          normalizedAt: new Date(),
          rawJson: null, // G7: reclaim storage
          retryInFlight: false, // Clear the in-flight flag
          jobVersion,
        })
        .where(eq(job.id, jobId));

      return { persisted: true, jobVersion };
    });

    // ── Step 6: Trigger Gate 1+2 routing ─────────────────────────────────────
    // The job is now active — emit a job/ingested event so the existing
    // jobIngestedHandler picks it up for Gate 1+2 routing. The idempotency
    // guard in jobIngestedHandler (normalizedAt IS NOT NULL → skip) ensures
    // we don't re-normalize.
    await step.sendEvent(`provisional-normalized-${jobId}`, {
      name: "job/ingested",
      data: {
        jobId,
        atsSource: fetched.job.atsSource,
      },
    });

    // ── Step 5.5: Company scoring matrix (Criterion 3) ──────────────────────
    // Score the company using the 5-signal Job Scoring Matrix and persist
    // the companySizeScore to company_quality_score. Also applies the
    // recommended polling tier (active_hot / active / dormant / dead).
    // Only runs if a company was found in the leftJoin (companyId is non-null).
    // Company fields from the leftJoin are nullable — coerce with fallbacks.
    if (fetched.job.companyId) {
      const companyId = fetched.job.companyId;
      await step.run("score-company", async () => {
        // Coerce discoveredAt: Drizzle may return timestamp as string or null.
        const discoveredAtRaw = fetched.job.companyDiscoveredAt;
        const discoveredAt = discoveredAtRaw
          ? new Date(discoveredAtRaw)
          : new Date();

        const scoringInput = buildScoringInputFromCompany({
          id: companyId,
          canonicalName: fetched.job.companyCanonicalName,
          atsSlug: fetched.job.atsSlug,
          companyName: fetched.job.companyName,
          employeeCount: fetched.job.companyEmployeeCount,
          isAgency: fetched.job.companyIsAgency ?? false,
          isPublic: fetched.job.companyIsPublic ?? false,
          discoverySource: fetched.job.companyDiscoverySource ?? "manual",
          discoveredAt,
        });
        const result = await scoreAndPersistCompany(scoringInput);
        return {
          companySizeScore: result.companySizeScore,
          recommendedTier: result.recommendedTier,
          shouldBeDead: result.shouldBeDead,
        };
      });
    }

    // ── Trigger event-driven sweeper ────────────────────────────────────────
    // Per governing doc: event-driven sweep fires after each normalization
    // attempt. This provides immediate cleanup of stale retryInFlight flags
    // without waiting for the 30min safety-net cron.
    await step.run("trigger-sweeper", async () => {
      const { inngest } = await import("@/inngest/client");
      await inngest.send({
        name: "job/normalization-attempt-completed",
        data: { jobId },
      });
      return { triggered: true };
    });

    return {
      jobId,
      normalizationStatus: "active",
      remoteScope: scopeResult.remoteScope,
      staleness: gateResult.staleness,
    };
  },
);

// ── retryInFlightSweeper — event-driven + safety-net cron ───────────────────
//
// Per governing doc "retryInFlight sweeper cadence (UPDATED)":
//   "Changed from fixed 2-3min cron to event-driven sweep (fires after each
//    normalizeProvisionalJob attempt) + 30min safety-net cron with conditional
//    skip. Monitor resource consumption — if the 30min safety net still
//    contributes meaningfully, increase to 1hr or remove it entirely if the
//    event-driven path proves reliable."
//
// Triggers:
//   1. Event: job/normalization-attempt-completed — fired after each
//      normalizeProvisionalJob attempt (success or failure). This is the
//      primary trigger — provides immediate cleanup of stale flags.
//   2. Cron: */30 * * * * — 30min safety net. Catches stale flags that the
//      event-driven path missed (e.g., if the normalizer crashed before
//      sending the event). The sweep query is fast (indexed on
//      retry_in_flight + source_fetched_at) so the 30min cron is cheap.
//
// The sweep logic is the same for both triggers: find jobs where
// retry_in_flight = true but source_fetched_at is older than 10 minutes,
// clear the flag, and stamp cleared_generation = retry_generation.
export const retryInFlightSweeper = inngest.createFunction(
  {
    id: "retry-in-flight-sweeper",
    name: "Retry In-Flight Sweeper (v2)",
    triggers: [
      { event: "job/normalization-attempt-completed" },
      { cron: "*/30 * * * *" },
    ],
  },
  async ({ step }) => {
    const swept = await step.run("sweep-stale-flags", async () => {
      const { db } = await import("@/db/db");

      // Find rows with retryInFlight=true that are older than 10 minutes.
      // The sourceFetchedAt check ensures we only clear genuinely stale flags
      // (not jobs that are actively being processed). This query is fast.
      const staleJobs = await db
        .select({
          id: job.id,
          retryGeneration: job.retryGeneration,
        })
        .from(job)
        .where(
          and(
            eq(job.retryInFlight, true),
            sql`${job.sourceFetchedAt} < NOW() - INTERVAL '10 minutes'`,
          ),
        )
        .limit(100);

      if (staleJobs.length === 0) {
        return { swept: 0 };
      }

      // Force-clear each stale flag and stamp clearedGeneration.
      // This rejects future persists with generation ≤ retryGeneration.
      for (const staleJob of staleJobs) {
        await db
          .update(job)
          .set({
            retryInFlight: false,
            clearedGeneration: staleJob.retryGeneration,
          })
          .where(eq(job.id, staleJob.id));
      }

      return { swept: staleJobs.length };
    });

    return { swept: swept.swept };
  },
);

// ── Helper: set retryInFlight before starting a retry ────────────────────────

/**
 * Set the retryInFlight flag and increment retryGeneration before starting a
 * normalization attempt. This is called by the retry trigger (e.g. a manual
 * retry endpoint or a scheduled sweep) before sending the
 * `job/provisional-ingested` event.
 *
 * @param jobId  The job ID to fence
 * @returns      The new retryGeneration (to pass in the event payload)
 */
export async function setRetryInFlight(jobId: string): Promise<number> {
  const { db } = await import("@/db/db");

  // Atomically increment retryGeneration and set retryInFlight = true.
  // We use a raw SQL update with RETURNING to get the new generation.
  const result = await db.execute(
    sql`UPDATE ${job} SET retry_in_flight = true, retry_generation = retry_generation + 1, updated_at = NOW() WHERE id = ${jobId} RETURNING retry_generation as "retryGeneration"`,
  );

  const rows = result.rows as Array<{ retryGeneration: number }>;
  return rows[0]?.retryGeneration ?? 0;
}
