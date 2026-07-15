// Job Repository — Upsert + New Job Detection + Stale Marking
// src/lib/jobs/poller/job-repository.ts
//
// Handles all database operations for the `job` table during polling:
//   1. Upsert jobs (onConflictDoUpdate on atsSource+atsSlug+externalJobId)
//   2. Detect which jobs are genuinely new (for the B→C handoff event)
//   3. Mark jobs not seen in this poll as stale (Phase 1 stale detection)
//
// See TDD §4.0c (job table), §4.4.4 (stale job problem), §4.5 (B→C handoff).

import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import { isStorageSafeForIngestion } from "@/lib/jobs/storage-check";
import type { NormalizedJob } from "./ats-adapters";

// ── Content-hash dedup (Directive 11, Fix 4) ────────────────────────────────
// Computes a SHA-256 hash of (company_name + normalized_title + location_name)
// to detect cross-source duplicates — the same job posted on different ATS
// platforms (e.g., Canva on greenhouse vs canva on lever).
//
// The hash is case-insensitive (company names and titles are lowercased) and
// whitespace-normalized to catch "Senior Software Engineer" vs "senior software engineer".
function computeContentHash(
  companyName: string | null,
  title: string,
  locationName: string | null,
): string {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
  const company = normalize(companyName ?? "");
  const ttl = normalize(title ?? "");
  const loc = normalize(locationName ?? "");
  return createHash("sha256").update(`${company}|${ttl}|${loc}`).digest("hex");
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UpsertResult {
  /** All jobs that were upserted (new + existing). */
  totalUpserted: number;
  /** Job IDs that are genuinely new (not previously in the DB). These trigger
   * the `job/ingested` Inngest event for Module C. */
  newJobIds: string[];
  /** Jobs that already existed (updated lastSeenAt + title + rawJson). */
  updatedCount: number;
  /** True when the storage/backlog guard prevented any writes. */
  storageBlocked?: boolean;
  /** Human-readable reason when storageBlocked is true. */
  storageReason?: string;
}

// ── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Upsert a batch of jobs for a single company. Uses `onConflictDoUpdate` on
 * the `(atsSource, atsSlug, externalJobId)` unique index.
 *
 * For each job:
 *   - NEW job: inserted with `status = "active"`, `extractedTags = []`,
 *     `jobEmbedding = null`. The returned `id` is collected for the
 *     `job/ingested` event.
 *   - EXISTING job: `lastSeenAt = now()`, `title` and `rawJson` refreshed,
 *     `status` resurrected to `"active"` ONLY if it was stale/gone.
 *     Rejected and normalization_failed jobs are NOT resurrected — their
 *     terminal/failed status is preserved to avoid re-processing garbage.
 *
 * @param atsSource  The ATS platform
 * @param atsSlug    The company's ATS slug
 * @param jobs       Normalized jobs from the ATS API
 * @returns          UpsertResult with new job IDs for the B→C handoff
 */
export async function upsertJobs(
  atsSource: string,
  atsSlug: string,
  jobs: NormalizedJob[],
): Promise<UpsertResult> {
  if (jobs.length === 0) {
    return { totalUpserted: 0, newJobIds: [], updatedCount: 0 };
  }

  // Sprint 8 storage guard: pause new job ingestion when the database is near
  // the Neon Free tier limit or when the normalizer backlog is too large. This
  // prevents a sudden burst of job discovery from filling the DB before
  // normalization can reclaim raw_json storage. FORCE_INGESTION=1 overrides.
  const storage = await isStorageSafeForIngestion();
  if (!storage.allow) {
    console.warn(
      `[storage guard] blocked upsert for ${atsSource}/${atsSlug}: ${storage.reason}`,
    );
    return {
      totalUpserted: 0,
      newJobIds: [],
      updatedCount: 0,
      storageBlocked: true,
      storageReason: storage.reason,
    };
  }

  // Check which externalJobIds already exist (to detect new jobs).
  // Uses Drizzle's inArray() for parameterized queries — no raw SQL, no
  // injection risk.
  const externalJobIds = jobs.map((j) => j.externalJobId);
  const existing = await db
    .select({ externalJobId: job.externalJobId })
    .from(job)
    .where(
      sql`${job.atsSource} = ${atsSource} AND ${job.atsSlug} = ${atsSlug} AND ${inArray(job.externalJobId, externalJobIds)}`,
    );

  const existingIds = new Set(existing.map((e) => e.externalJobId));

  // Upsert all jobs. The `returning()` clause gives us the IDs of all rows
  // (both inserted and updated), so we can identify the new ones.
  //
  // Race condition note: If a concurrent poll inserts the same job between
  // our SELECT and INSERT, the ON CONFLICT will update that row instead of
  // inserting a duplicate. The job will appear in `existingIds` from our
  // earlier SELECT, so we won't emit a duplicate `job/ingested` event — but
  // we also won't emit the event for the genuinely new job. This is an
  // acceptable trade-off: the same company is rarely polled concurrently
  // (the fan-out emits one event per company), and missing one event for
  // one job is self-correcting (the job will be picked up on the next poll
  // cycle if it's still active, or Module C can backfill from the job table).
  const now = new Date();
  const upsertedRows = await db
    .insert(job)
    .values(
      jobs.map((j) => ({
        atsSource,
        atsSlug,
        externalJobId: j.externalJobId,
        title: j.title,
        rawJson: j.rawJson,
        extractedTags: [],
        jobEmbedding: null,
        lastSeenAt: now,
        status: "active",
        // Extracted metadata (Phase 2 schema extension)
        workplaceType: j.metadata.workplaceType,
        employmentType: j.metadata.employmentType,
        locationName: j.metadata.locationName,
        department: j.metadata.department,
        team: j.metadata.team,
        applyUrl: j.metadata.applyUrl,
        jobUrl: j.url,
        publishedAt: j.metadata.publishedAt,
        companyName: j.metadata.companyName,
        // Gate 0.5 metadata (added July 2026)
        titleRegionTag: j.metadata.titleRegionTag,
        locationCountries: j.metadata.locationCountries,
        experienceMinYears: j.metadata.experienceMinYears,
        experienceMaxYears: j.metadata.experienceMaxYears,
        // numeric columns expect strings — convert from number | null
        compensationMin:
          j.metadata.compensationMin !== null
            ? String(j.metadata.compensationMin)
            : null,
        compensationMax:
          j.metadata.compensationMax !== null
            ? String(j.metadata.compensationMax)
            : null,
        compensationCurrency: j.metadata.compensationCurrency,
        // Remote scope (added July 2026 — zero-match fix)
        remoteScope: j.metadata.remoteScope,
        // Content-hash for cross-source dedup (Directive 11, Fix 4)
        textHash: computeContentHash(
          j.metadata.companyName,
          j.title,
          j.metadata.locationName,
        ),
      })),
    )
    .onConflictDoUpdate({
      target: [job.atsSource, job.atsSlug, job.externalJobId],
      set: {
        title: sql`excluded.title`,
        // G7: only refresh rawJson if the job hasn't been normalized yet
        // (normalizedAt IS NULL). After normalization, rawJson is NULLed to
        // reclaim storage and normalizedText holds the cleaned text. Over-
        // writing rawJson on re-poll would undo the storage reclamation
        // (~15KB back per job). The normalizer's idempotency guard skips
        // already-normalized jobs, so the stale rawJson is never needed again.
        rawJson: sql`CASE WHEN ${job.normalizedAt} IS NULL THEN excluded.raw_json ELSE ${job.rawJson} END`,
        lastSeenAt: now,
        // Only resurrect stale/gone jobs back to active. Rejected and
        // normalization_failed jobs keep their status — re-polling should
        // NOT undo a normalizer rejection or mask a system failure.
        // The normalizer's idempotency guard (normalizedAt IS NOT NULL)
        // would skip them anyway, but keeping the correct status is important
        // for dashboard accuracy and the retry sweep (normalization_failed
        // jobs need to be re-processable, not silently resurrected).
        status: sql`CASE WHEN ${job.status} IN ('stale', 'gone') THEN 'active' ELSE ${job.status} END`,
        // Refresh metadata on re-poll (ATS may have updated these fields)
        workplaceType: sql`excluded.workplace_type`,
        employmentType: sql`excluded.employment_type`,
        locationName: sql`excluded.location_name`,
        department: sql`excluded.department`,
        team: sql`excluded.team`,
        applyUrl: sql`excluded.apply_url`,
        jobUrl: sql`excluded.job_url`,
        publishedAt: sql`excluded.published_at`,
        companyName: sql`excluded.company_name`,
        // Gate 0.5 metadata refresh on re-poll
        titleRegionTag: sql`excluded.title_region_tag`,
        locationCountries: sql`excluded.location_countries`,
        experienceMinYears: sql`excluded.experience_min_years`,
        experienceMaxYears: sql`excluded.experience_max_years`,
        compensationMin: sql`excluded.compensation_min`,
        compensationMax: sql`excluded.compensation_max`,
        compensationCurrency: sql`excluded.compensation_currency`,
        // Remote scope refresh on re-poll
        remoteScope: sql`excluded.remote_scope`,
      },
    })
    .returning({ id: job.id, externalJobId: job.externalJobId });

  // New jobs are those whose externalJobId was NOT in the existing set.
  const newJobIds = upsertedRows
    .filter((r) => !existingIds.has(r.externalJobId))
    .map((r) => r.id);

  return {
    totalUpserted: upsertedRows.length,
    newJobIds,
    updatedCount: upsertedRows.length - newJobIds.length,
  };
}

// ── Stale marking (Phase 1 — per-company after poll) ─────────────────────────

/**
 * Mark jobs for a company that were NOT in the current poll as stale.
 * This is Phase 1 of stale detection (TDD §4.4.4). Jobs not seen in this poll
 * have their status left unchanged — the daily stale cleanup function
 * (Phase 2) handles the 7-day → stale, 30-day → gone transitions.
 *
 * Actually, per the TDD, Phase 1 does NOT immediately mark jobs as stale.
 * It just leaves their `lastSeenAt` unchanged. The daily cleanup query
 * handles the status transitions based on `lastSeenAt` age. So this function
 * is a no-op for now — it exists for future use and documentation.
 *
 * @param atsSource       The ATS platform
 * @param atsSlug         The company's ATS slug
 * @param seenJobIds      The externalJobIds that were in this poll
 */
export async function markUnseenJobsStale(
  _atsSource: string,
  _atsSlug: string,
  _seenJobIds: string[],
): Promise<void> {
  // Per TDD §4.4.4, Phase 1 does not immediately mark jobs as stale.
  // The daily stale cleanup (Phase 2) handles status transitions based on
  // lastSeenAt age. This function is intentionally a no-op — it exists for
  // documentation and future use if the strategy changes.
  //
  // If we wanted immediate stale marking, the query would be:
  //   UPDATE job SET status = 'stale'
  //   WHERE atsSource = ? AND atsSlug = ?
  //     AND externalJobId NOT IN (seenJobIds)
  //     AND status = 'active'
  // But we don't do this — the 7-day grace period is intentional.
}

// ── Stale cleanup (Phase 2 — daily) ──────────────────────────────────────────

/**
 * Mark jobs as stale (not seen in 7 days, OR published >60 days ago) or gone
 * (not seen in 30 days). This is Phase 2 of stale detection (TDD §4.4.4), run
 * as a daily Inngest scheduled function.
 *
 * Two stale triggers:
 *   1. lastSeenAt-based: job hasn't been seen in the ATS feed for 7+ days
 *      (company stopped returning it, or the poller hasn't run).
 *   2. publishedAt-based: job's publish date is older than 60 days, even if
 *      the ATS still returns it. This catches long-tail postings that the
 *      company never takes down — they keep refreshing lastSeenAt on every
 *      poll, but the role is effectively closed.
 *
 * @returns  { staleMarked, goneMarked } — counts for ingestionLog metrics
 */
export async function markStaleJobs(): Promise<{
  staleMarked: number;
  goneMarked: number;
}> {
  // Mark active jobs as stale if EITHER:
  //   - not seen in 7 days (lastSeenAt-based), OR
  //   - published more than 60 days ago (publishedAt-based age gate)
  const staleResult = await db
    .update(job)
    .set({ status: "stale" })
    .where(
      sql`${job.status} = 'active' AND (
        ${job.lastSeenAt} < NOW() - INTERVAL '7 days'
        OR ${job.publishedAt} < NOW() - INTERVAL '60 days'
      )`,
    )
    .returning({ id: job.id });

  // Mark stale jobs not seen in 30 days as gone
  const goneResult = await db
    .update(job)
    .set({ status: "gone" })
    .where(
      sql`${job.status} = 'stale' AND ${job.lastSeenAt} < NOW() - INTERVAL '30 days'`,
    )
    .returning({ id: job.id });

  return {
    staleMarked: staleResult.length,
    goneMarked: goneResult.length,
  };
}

// ── Active job count ─────────────────────────────────────────────────────────

/**
 * Count active jobs for a company. Used by the poller to update
 * `company.activeJobCount` after each poll.
 */
export async function countActiveJobs(
  atsSource: string,
  atsSlug: string,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(job)
    .where(
      sql`${job.atsSource} = ${atsSource} AND ${job.atsSlug} = ${atsSlug} AND ${job.status} = 'active'`,
    );
  return result[0]?.count ?? 0;
}

// ── G3: Aggregator job insertion (CORPUS_EXPANSION_TDD §1.7) ──────────────────

/**
 * Insert an aggregator-sourced job into the job table. Aggregator jobs use
 * `atsSource = "aggregator"` and `atsSlug = source_name` (e.g. "remoteok").
 *
 * Per G7: rawJson is NULL (no ATS JSON to store), normalizedText is set to
 * the cleaned fullText. The job is inserted with `status = "active"` and
 * `normalizedAt = NOW()` (normalization is already complete — the aggregator
 * handler normalizes before inserting).
 *
 * Uses `onConflictDoNothing()` on the `(atsSource, atsSlug, externalJobId)`
 * unique index — if the same aggregator job is ingested twice (e.g. from a
 * retry), the duplicate is silently skipped.
 *
 * @returns  The job UUID if inserted, or null if it was a duplicate.
 */
export async function insertAggregatorJob(
  aggregatorJob: {
    source: string;
    externalJobId: string;
    title: string;
    applyUrl?: string;
    publishedAt?: Date;
  },
  normalization: { fullText: string; tags: string[]; jobUrl?: string | null },
  embedding: number[],
): Promise<string | null> {
  const embeddingStr = `[${embedding.join(",")}]`;

  const inserted = await db
    .insert(job)
    .values({
      atsSource: "aggregator",
      atsSlug: aggregatorJob.source,
      externalJobId: aggregatorJob.externalJobId,
      title: aggregatorJob.title,
      rawJson: null, // G7: no ATS JSON for aggregator jobs
      normalizedText: normalization.fullText, // G7: cleaned text
      extractedTags: normalization.tags,
      jobEmbedding: embeddingStr as never,
      status: "active",
      normalizedAt: new Date(),
      applyUrl: aggregatorJob.applyUrl ?? null,
      jobUrl: normalization.jobUrl ?? null,
      publishedAt: aggregatorJob.publishedAt ?? null,
    })
    .onConflictDoNothing({
      target: [job.atsSource, job.atsSlug, job.externalJobId],
    })
    .returning({ id: job.id });

  return inserted.length > 0 ? inserted[0].id : null;
}
