// Direct Ingestion Upsert
// src/lib/jobs/direct-ingestion/upsert.ts
//
// Upserts DirectIngestionJob objects into the job table, setting structured
// fields directly (extractedTags, normalizedText, workplaceType, remoteScope,
// compensation, etc.) and generating embeddings via text-embedding-3-small.
//
// Unlike the ATS poller's upsertJobs (which sets extractedTags=[] and leaves
// normalization to the jobIngestedHandler), this upsert:
//   1. Sets extractedTags directly from the board's structured tags
//   2. Sets normalizedText from the board's description (no LLM)
//   3. Sets normalizedAt = now (marks as normalized — prevents re-processing)
//   4. Generates jobEmbedding via text-embedding-3-small
//   5. Does NOT set rawJson (no raw payload to store — structured fields suffice)
//
// The jobIngestedHandler skips jobs where normalizedAt IS NOT NULL, so no
// job/ingested events are emitted. Gate routing happens separately via
// direct-gate-routing.ts (WI3 Step 7).

import { createHash } from "node:crypto";
import { inArray, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import { isJobFreshForInjection } from "@/lib/jobs/poller/phalanx-poller";
import type { DirectBoardSource, DirectIngestionJob } from "./types";

/**
 * Compute a SHA-256 hash of the normalized text for dedup.
 * Same algorithm as computeTextHash in provisional-job-repository.ts.
 * Used by the direct-ingestion upsert to set textHash on every job, enabling
 * the dedup guard to detect re-ingestion of identical content (B3.3).
 */
function computeTextHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export interface DirectUpsertResult {
  totalUpserted: number;
  newJobIds: string[];
  updatedCount: number;
  embeddedCount: number;
  embeddingErrors: number;
  /** Jobs rejected by the injection freshness gate (publishedAt too old). */
  rejectedTooOld: number;
}

/**
 * Upsert a batch of direct-ingested jobs into the job table.
 *
 * Uses ON CONFLICT (atsSource, atsSlug, externalJobId) for dedup — the same
 * unique index as the ATS poller. For direct boards, atsSlug is set to the
 * board source name (e.g. "himalayas_direct") so all jobs from a board share
 * the same slug.
 *
 * Embeddings are generated in batches to respect OpenAI rate limits. If an
 * embedding fails, the job is still upserted (with jobEmbedding=null) — Gate 2
 * vector search won't find it, but Gate 1 (GIN tag overlap) still works.
 *
 * @param source    The direct board source (used as ats_source)
 * @param slug      The ats_slug (set to the board source name for direct boards)
 * @param jobs      DirectIngestionJob objects to upsert
 * @param embedFn   Injectable embedding function (defaults to real OpenAI call)
 * @returns         DirectUpsertResult with new job IDs and counts
 */
export async function upsertDirectJobs(
  source: DirectBoardSource,
  slug: string,
  jobs: DirectIngestionJob[],
  embedFn?: (text: string) => Promise<number[]>,
): Promise<DirectUpsertResult> {
  if (jobs.length === 0) {
    return {
      totalUpserted: 0,
      newJobIds: [],
      updatedCount: 0,
      embeddedCount: 0,
      embeddingErrors: 0,
      rejectedTooOld: 0,
    };
  }

  // D29 fix: Deduplicate by externalJobId BEFORE any DB operation.
  // Some boards (notably WeWorkRemotely) return the same job multiple times
  // with different location text (e.g., "Remote - US" and "Remote - Canada"
  // variants of the same posting). Without dedup, the ON CONFLICT DO UPDATE
  // clause matches the same row twice in a single INSERT, raising
  // SQLSTATE 21000 ("cannot affect row a second time") and aborting the
  // entire batch — causing the whole board to produce 0 new jobs.
  const seenExternalIds = new Set<string>();
  const dedupedJobs = jobs.filter((j) => {
    if (seenExternalIds.has(j.externalJobId)) return false;
    seenExternalIds.add(j.externalJobId);
    return true;
  });
  const rejectedDuplicates = jobs.length - dedupedJobs.length;

  // Injection freshness gate — reject jobs with publishedAt older than
  // MAX_JOB_INJECTION_AGE_DAYS (default 60). This mirrors the ATS poller's
  // gate and prevents stale legacy postings from entering the corpus via
  // direct boards.
  const freshJobs = dedupedJobs.filter((j) =>
    isJobFreshForInjection(j.publishedAt),
  );
  const rejectedTooOld = dedupedJobs.length - freshJobs.length;

  if (freshJobs.length === 0) {
    return {
      totalUpserted: 0,
      newJobIds: [],
      updatedCount: 0,
      embeddedCount: 0,
      embeddingErrors: 0,
      rejectedTooOld,
    };
  }

  // Use the filtered list for all subsequent operations
  const jobsToProcess = freshJobs;

  // Check which externalJobIds already exist (to detect new jobs)
  const externalJobIds = jobsToProcess.map((j) => j.externalJobId);
  const existingRows = await db
    .select({ externalJobId: job.externalJobId, id: job.id })
    .from(job)
    .where(
      sql`${job.atsSource} = ${source} AND ${job.atsSlug} = ${slug} AND ${inArray(job.externalJobId, externalJobIds)}`,
    );

  const existingIds = new Set(existingRows.map((e) => e.externalJobId));

  // Generate embeddings for all jobs (batch — each job's normalizedText)
  const embeddings: (number[] | null)[] = [];
  let embeddedCount = 0;
  let embeddingErrors = 0;

  if (embedFn) {
    // Fenced/onsite jobs are not addressable for global-remote matching — skip
    // embedding to save OpenAI calls + HNSW vector storage (A2 reorder). Only
    // global/unknown/undetermined jobs need a vector (Gate 2 / Gate 3 scope
    // adjudication). Consistent with the jobIngestedHandler fence-skip.
    const FENCED_SCOPES = new Set([
      "country_fenced",
      "region_fenced",
      "onsite",
    ]);
    for (const j of jobsToProcess) {
      if (FENCED_SCOPES.has(j.remoteScope ?? "unknown")) {
        embeddings.push(null);
        continue;
      }
      try {
        const embedding = await embedFn(j.normalizedText);
        embeddings.push(embedding);
        embeddedCount++;
      } catch (e) {
        console.error(
          `[direct-ingestion] Embedding failed for job "${j.title}":`,
          e instanceof Error ? e.message : e,
        );
        embeddings.push(null);
        embeddingErrors++;
      }
    }
  } else {
    // No embedFn provided — jobs will be upserted without embeddings
    embeddings.fill(null, 0, jobsToProcess.length);
  }

  const now = new Date();
  const upsertedRows = await db
    .insert(job)
    .values(
      jobsToProcess.map((j, i) => ({
        atsSource: source,
        atsSlug: slug,
        externalJobId: j.externalJobId,
        title: j.title,
        rawJson: null, // No raw payload — structured fields are the source of truth
        normalizedText: j.normalizedText,
        extractedTags: j.extractedTags,
        jobEmbedding: embeddings[i] ?? null,
        lastSeenAt: now,
        status: "active",
        // Structured metadata from the board
        workplaceType: j.workplaceType,
        employmentType: j.employmentType,
        locationName: j.locationName,
        applyUrl: j.applyUrl,
        jobUrl: j.jobUrl ?? j.applyUrl ?? null,
        publishedAt: j.publishedAt,
        companyName: j.companyName,
        // Gate 0.5 metadata
        titleRegionTag: null, // Direct boards don't use title region tags
        locationCountries: j.locationCountries ?? null,
        experienceMinYears: j.experienceMinYears,
        experienceMaxYears: j.experienceMaxYears,
        compensationMin:
          j.compensationMin !== null ? String(j.compensationMin) : null,
        compensationMax:
          j.compensationMax !== null ? String(j.compensationMax) : null,
        compensationCurrency: j.compensationCurrency,
        // Remote scope — direct boards are remote-first
        remoteScope: j.remoteScope,
        // Mark as normalized — prevents jobIngestedHandler from re-processing
        normalizedAt: now,
        // B3.3: Set textHash for dedup — enables detection of re-ingested
        // identical content (nofluffjobs/justjoin re-polling same jobs)
        textHash: computeTextHash(j.normalizedText),
      })),
    )
    .onConflictDoUpdate({
      target: [job.atsSource, job.atsSlug, job.externalJobId],
      set: {
        title: sql`excluded.title`,
        normalizedText: sql`excluded.normalized_text`,
        extractedTags: sql`excluded.extracted_tags`,
        // Update embedding only if the new one is non-null
        jobEmbedding: sql`COALESCE(excluded.job_embedding, ${job.jobEmbedding})`,
        lastSeenAt: now,
        status: sql`CASE WHEN ${job.status} IN ('stale', 'gone') THEN 'active' ELSE ${job.status} END`,
        // Refresh structured metadata on re-ingestion
        workplaceType: sql`excluded.workplace_type`,
        employmentType: sql`excluded.employment_type`,
        locationName: sql`excluded.location_name`,
        applyUrl: sql`excluded.apply_url`,
        jobUrl: sql`COALESCE(excluded.job_url, excluded.apply_url, ${job.jobUrl})`,
        publishedAt: sql`excluded.published_at`,
        companyName: sql`excluded.company_name`,
        experienceMinYears: sql`excluded.experience_min_years`,
        experienceMaxYears: sql`excluded.experience_max_years`,
        compensationMin: sql`excluded.compensation_min`,
        compensationMax: sql`excluded.compensation_max`,
        compensationCurrency: sql`excluded.compensation_currency`,
        remoteScope: sql`excluded.remote_scope`,
        locationCountries: sql`excluded.location_countries`,
        // Keep normalizedAt set — don't reset
        normalizedAt: sql`GREATEST(${job.normalizedAt}, excluded.normalized_at)`,
        // B3.3: Update textHash on re-ingestion to detect content drift
        textHash: sql`excluded.text_hash`,
      },
    })
    .returning({ id: job.id, externalJobId: job.externalJobId });

  // Identify genuinely new jobs (not in existingIds)
  const newJobIds = upsertedRows
    .filter((r) => !existingIds.has(r.externalJobId))
    .map((r) => r.id);

  return {
    totalUpserted: upsertedRows.length,
    newJobIds,
    updatedCount: upsertedRows.length - newJobIds.length,
    embeddedCount,
    embeddingErrors,
    rejectedTooOld,
  };
}
