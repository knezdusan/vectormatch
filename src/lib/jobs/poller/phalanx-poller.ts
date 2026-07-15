// Phalanx Poller — Core Polling Orchestrator (TDD §4.4)
// src/lib/jobs/poller/phalanx-poller.ts
//
// The main ingestion worker. For a single company:
//   1. Fetch jobs from the ATS API (rate-limited via bottleneck)
//   2. Validate with Zod (safeParse — never crashes on bad data)
//   3. Apply Gate 0 title filter (regex — fast, synchronous)
//   4. Upsert into the job table (onConflictDoUpdate)
//   5. Emit `job/ingested` events for genuinely new jobs (B→C handoff)
//   6. Update company state (lastPolledAt, health, consecutiveFailures)
//
// ── Architecture (G5 — CORPUS_EXPANSION_TDD §1.2) ───────────────────────────
// The poller is called directly by the batchPollTier Inngest function, which
// polls up to 100 companies per run. The old per-company fan-out pattern
// (poller/poll-company events) is retired. pollCompany() is also called by
// the manual phalanxPoller function for admin/testing.
//
// ── Injectable fetch ─────────────────────────────────────────────────────────
// The fetch function is injectable for testing. In production, the global
// `fetch()` is used (wrapped by the bottleneck rate limiter in ats-adapters).
//
// See TDD §4.4 for the full specification.

import { passesGateZero, passesGateZeroWebDev } from "@/lib/jobs/gate-zero";
import type { FetchFn } from "@/lib/jobs/types";
import { fetchJobsFromAts } from "./ats-adapters";
import type { CompanyHealth } from "./company-state";
import {
  healthFromHttpError,
  healthFromNetworkError,
  healthFromValidationError,
  updateCompanyState,
} from "./company-state";
import { writeIngestionLog } from "./ingestion-log";
import { countActiveJobs, upsertJobs } from "./job-repository";

// ── Configuration ─────────────────────────────────────────────────────────────

/**
 * Maximum age at which a job may be INGESTED. Jobs with a publishedAt older
 * than this are rejected outright and never enter the database. This is the
 * hard freshness gate at ingestion time.
 *
 * Default: 60 days. Override with MAX_JOB_INJECTION_AGE_DAYS env var.
 * Raised from 30→60 to align with the user-facing freshness window (the /jobs
 * page only shows jobs ≤60 days old). The 90-day cleanup sweep provides a
 * 30-day buffer beyond this for analytics.
 */
const DEFAULT_MAX_JOB_INJECTION_AGE_DAYS = 60;

function getMaxJobInjectionAgeDays(): number {
  const envValue = process.env.MAX_JOB_INJECTION_AGE_DAYS;
  if (!envValue) return DEFAULT_MAX_JOB_INJECTION_AGE_DAYS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isNaN(parsed) || parsed <= 0
    ? DEFAULT_MAX_JOB_INJECTION_AGE_DAYS
    : parsed;
}

/**
 * Maximum age a job may remain ACTIVE in the database. Jobs older than this
 * are marked stale by the backfill script and daily stale cleanup.
 *
 * Default: 60 days. Override with MAX_JOB_AGE_DAYS env var.
 */
const DEFAULT_MAX_JOB_AGE_DAYS = 60;

function getMaxJobAgeDays(): number {
  const envValue = process.env.MAX_JOB_AGE_DAYS;
  if (!envValue) return DEFAULT_MAX_JOB_AGE_DAYS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isNaN(parsed) || parsed <= 0
    ? DEFAULT_MAX_JOB_AGE_DAYS
    : parsed;
}

export function isJobFreshForInjection(publishedAt: Date | null): boolean {
  // Jobs without a publish date cannot be freshness-gated at ingestion time.
  // All supported ATS sources currently provide a publish date, so treat a
  // missing date as unverified/stale and reject it from the corpus.
  if (!publishedAt) return false;
  const maxAgeMs = getMaxJobInjectionAgeDays() * 24 * 60 * 60 * 1000;
  return Date.now() - new Date(publishedAt).getTime() <= maxAgeMs;
}

// ── Types ────────────────────────────────────────────────────────────────────

/** Result of polling a single company — for ingestionLog metrics. */
export interface PollResult {
  companyId: string;
  atsSource: string;
  atsSlug: string;
  /** Total jobs fetched from the ATS API. */
  jobsFetched: number;
  /** Jobs that passed Gate 0 (engineering-relevant titles). */
  jobsPassedGate0: number;
  /** Jobs that were rejected by Gate 0 (non-engineering titles). */
  jobsRejectedByGate0: number;
  /** Jobs that passed Gate 0 but were explicitly marked inactive by the source. */
  jobsInactive: number;
  /** Jobs that passed Gate 0 but were skipped because they are too old for injection. */
  jobsTooOld: number;
  /** Jobs upserted into the database (new + existing). */
  jobsUpserted: number;
  /** Genuinely new job IDs (for the B→C handoff event). */
  newJobIds: string[];
  /** Company health after this poll. */
  health: CompanyHealth;
  /** Error message if the poll failed. */
  error?: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Poll a single company: fetch jobs from its ATS API, apply Gate 0, upsert
 * into the job table, and update company state. Returns a PollResult with
 * metrics and new job IDs for the B→C handoff.
 *
 * This function never throws — all errors are caught and returned in the
 * PollResult. The caller (Inngest function) can retry based on the error.
 *
 * @param companyId  The company UUID
 * @param atsSource  The ATS platform ("greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee")
 * @param atsSlug    The company's ATS slug
 * @param fetchFn    Injectable fetch (defaults to global fetch)
 */
export async function pollCompany(
  companyId: string,
  atsSource: string,
  atsSlug: string,
  fetchFn: FetchFn = fetch,
): Promise<PollResult> {
  const startedAt = new Date();
  const baseResult: PollResult = {
    companyId,
    atsSource,
    atsSlug,
    jobsFetched: 0,
    jobsPassedGate0: 0,
    jobsRejectedByGate0: 0,
    jobsInactive: 0,
    jobsTooOld: 0,
    jobsUpserted: 0,
    newJobIds: [],
    health: "healthy",
  };

  // Step 1: Fetch jobs from the ATS API (rate-limited + Zod validated).
  const fetchResult = await fetchJobsFromAts(
    atsSource as
      | "greenhouse"
      | "lever"
      | "ashby"
      | "smartrecruiters"
      | "workable"
      | "recruitee",
    atsSlug,
    fetchFn,
  );

  if (!fetchResult.success) {
    // Fetch failed — update company state and return.
    let health: CompanyHealth;
    if (fetchResult.kind === "http") {
      health = healthFromHttpError(
        Number.parseInt(fetchResult.error.match(/\d+/)?.[0] ?? "0", 10),
      );
    } else if (fetchResult.kind === "validation") {
      health = healthFromValidationError();
    } else {
      health = healthFromNetworkError();
    }

    await updateCompanyState(companyId, {
      health,
      lastErrorMessage: fetchResult.error,
      success: false,
    });

    // Write ingestion log for the failed poll.
    await writeIngestionLog({
      type: "poll",
      status: "failed",
      companyId,
      source: atsSource,
      itemsProcessed: 0,
      itemsInserted: 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: 0,
      errorMessage: fetchResult.error,
      errorDetails: { kind: fetchResult.kind },
      startedAt,
      finishedAt: new Date(),
    });

    return { ...baseResult, health, error: fetchResult.error };
  }

  // Step 2: Apply Gate 0 title filter (fast synchronous regex).
  // D7: Role-scoped ingestion — use the web-dev-specific Gate 0 to prevent
  // non-web-dev engineering jobs (Data Engineer, ML Engineer, DevOps, iOS,
  // Android, Security) from entering the database. This is the cheapest
  // filter: it runs before DB insertion, embedding, and all downstream gates.
  // The broad Gate 0 (passesGateZero) is kept for backward compatibility.
  const allJobs = fetchResult.jobs;
  const gateFilter =
    process.env.ROLE_SCOPED_INGESTION === "true"
      ? passesGateZeroWebDev
      : passesGateZero;
  const filteredJobs = allJobs.filter((job) => gateFilter(job.title));
  const rejectedCount = allJobs.length - filteredJobs.length;

  // Step 2a: Selective Tier 2 detail fetch for ATS sources that need it.
  // For jobs where the Tier 1 content is too short for a good embedding
  // (< MIN_FULLTEXT_LENGTH chars), fetch the detail endpoint to get the full
  // job description. This is best-effort — failures are non-fatal (Tier 1 data
  // is kept). Runs AFTER Gate 0 to avoid wasting detail fetches on jobs that
  // will be rejected by the title filter.
  //
  // SmartRecruiters: list endpoint has no description field at all.
  // Greenhouse: list endpoint includes ?content=true but some boards return
  //   empty content. Detail endpoint may return fuller content.
  let enrichedJobs = filteredJobs;
  let enrichmentInactiveDropped = 0;
  if (atsSource === "smartrecruiters" && filteredJobs.length > 0) {
    try {
      const { enrichSmartRecruitersJobs } = await import(
        "@/lib/jobs/poller/smartrecruiters-detail"
      );
      const enrichment = await enrichSmartRecruitersJobs(
        filteredJobs,
        atsSlug,
        fetchFn,
      );
      // Replace enrichedJobs with enriched + unchanged (order preserved by concat)
      enrichedJobs = [...enrichment.unchanged, ...enrichment.enriched];
      enrichmentInactiveDropped = enrichment.droppedInactive;
    } catch {
      // Non-fatal: if enrichment fails, proceed with Tier 1 data only
    }
  } else if (atsSource === "greenhouse" && filteredJobs.length > 0) {
    try {
      const { enrichGreenhouseJobs } = await import(
        "@/lib/jobs/poller/greenhouse-detail"
      );
      const enrichment = await enrichGreenhouseJobs(
        filteredJobs,
        atsSlug,
        fetchFn,
      );
      enrichedJobs = [...enrichment.unchanged, ...enrichment.enriched];
      enrichmentInactiveDropped = enrichment.droppedInactive;
    } catch {
      // Non-fatal: if enrichment fails, proceed with Tier 1 data only
    }
  }

  // Step 2b: Active-status gate — drop jobs explicitly marked closed by the
  // source (currently Recruitee/SmartRecruiters). Greenhouse, Lever, Ashby,
  // and Workable public APIs only return live postings by contract, so they
  // skip this check.
  const activeJobs = enrichedJobs.filter((j) => j.metadata.isActive);
  const inactiveCount =
    enrichedJobs.length - activeJobs.length + enrichmentInactiveDropped;

  // Step 2c: Injection freshness gate — hard cap on how old a job may be when
  // it first enters the database. A 30-day cap prevents stale legacy postings
  // (e.g. 2014 listings) from ever polluting the corpus. Jobs already in the
  // DB are not affected by this gate; they age out via MAX_JOB_AGE_DAYS.
  const maxInjectionAgeDays = getMaxJobInjectionAgeDays();
  const injectableJobs = activeJobs.filter((j) =>
    isJobFreshForInjection(j.metadata.publishedAt),
  );
  const tooOldForInjectionCount = activeJobs.length - injectableJobs.length;

  // Step 3: Upsert filtered (and possibly enriched) jobs into the job table.
  const upsertResult = await upsertJobs(atsSource, atsSlug, injectableJobs);

  // Step 4: Count active jobs and update company state.
  const activeJobCount = await countActiveJobs(atsSource, atsSlug);
  const now = new Date();

  // A successful fetch is "healthy" regardless of job count — a company with
  // zero open jobs is healthy, just not hiring right now. Zod validation
  // failures are caught earlier in fetchJobsFromAts and return a degraded
  // error result, so if we reach here, the response was valid.
  const health: CompanyHealth = "healthy";

  await updateCompanyState(companyId, {
    health,
    success: true,
    lastJobPostedAt: now,
    activeJobCount,
  });

  // Write ingestion log for the successful poll.
  await writeIngestionLog({
    type: "poll",
    status: "success",
    companyId,
    source: atsSource,
    itemsProcessed: allJobs.length,
    itemsInserted: upsertResult.newJobIds.length,
    itemsUpdated: upsertResult.updatedCount,
    itemsRejected: rejectedCount,
    itemsSkipped: tooOldForInjectionCount + inactiveCount,
    errorDetails: {
      maxInjectionAgeDays,
      maxAgeDays: getMaxJobAgeDays(),
      tooOldForInjectionCount,
      inactiveCount,
    },
    startedAt,
    finishedAt: new Date(),
  });

  return {
    ...baseResult,
    jobsFetched: allJobs.length,
    jobsPassedGate0: filteredJobs.length,
    jobsRejectedByGate0: rejectedCount,
    jobsInactive: inactiveCount,
    jobsTooOld: tooOldForInjectionCount,
    jobsUpserted: upsertResult.totalUpserted,
    newJobIds: upsertResult.newJobIds,
    health,
  };
}
