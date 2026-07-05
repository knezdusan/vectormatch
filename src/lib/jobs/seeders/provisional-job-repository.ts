// v2 Corpus Expansion — Provisional Job Repository
// src/lib/jobs/seeders/provisional-job-repository.ts
//
// Inserts provisional job rows discovered by the domain-probe pipeline (Step 3
// JSON-LD, Step 4 static HTML, Step 5 RSS) into the `job` table with
// `status = 'provisional'`. This is the v2 alternative to the ATS-API-only
// poller — provisional jobs are later normalized by the
// `normalizeProvisionalJob` Inngest function into active jobs.
//
// ── Provisional Job Lifecycle (per governing doc Criterion 1) ────────────────
//   1. Discovery (domain-probe.ts) → ProvisionalJobSeed
//   2. Insert (this module) → job row with status='provisional'
//   3. normalizeProvisionalJob (Inngest) → extract-and-clean → embed +
//      classify-scope → persist-normalized-job → status='active'
//   4. On failure (4 attempts) → status='normalization_failed' at 4hr SLA
//
// ── Dedup ────────────────────────────────────────────────────────────────────
// The `job` table has a unique index on (atsSource, atsSlug, externalJobId).
// For provisional jobs from the domain probe:
//   - atsSource = "domain_probe" (a synthetic ATS source for non-ATS jobs)
//   - atsSlug = the company domain (e.g. "acme.com")
//   - externalJobId = SHA-256 hash of the source URL (stable across re-probes)
// This ensures re-probing the same domain doesn't create duplicate job rows.
//
// ── textHash ─────────────────────────────────────────────────────────────────
// The SHA-256 hash of the cleaned JD text is stored in `job.textHash` at insert
// time. The staleness gate and content-drift guard use this to detect whether
// a re-probe found the same job (skip re-normalization) or a changed job
// (trigger full re-normalization with jobVersion++).
//
// See docs/governing/company-corpus-expansion-new.md Criterion 1 "Provisional
// Job Lifecycle" and "Insert".

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import type { ProvisionalJobSeed } from "@/lib/jobs/seeders/domain-probe";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Synthetic ATS source for jobs discovered by the domain-probe pipeline (not
 * from a real ATS API). Used in the (atsSource, atsSlug, externalJobId) dedup
 * anchor.
 */
export const DOMAIN_PROBE_ATS_SOURCE = "domain_probe";

// ── Types ────────────────────────────────────────────────────────────────────

/** The result of inserting provisional jobs for a single domain. */
export interface ProvisionalInsertResult {
  /** The company domain that was probed. */
  domain: string;
  /** Total provisional job seeds received from the probe. */
  totalSeeds: number;
  /** New job rows inserted. */
  inserted: number;
  /** Existing job rows skipped (dedup hit on externalJobId). */
  skipped: number;
  /** Job rows that failed to insert (DB error). */
  failed: number;
  /** Inserted job IDs (for triggering normalizeProvisionalJob events). */
  insertedJobIds: string[];
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: compute externalJobId from source URL ─────────────────────

/**
 * Compute a stable externalJobId for a provisional job from its source URL.
 * Uses SHA-256 hash of the URL — stable across re-probes so the dedup index
 * prevents duplicate job rows.
 *
 * @param sourceUrl  The URL where the job listing was found
 * @returns          A 64-char hex SHA-256 hash (the externalJobId)
 */
export function computeExternalJobId(sourceUrl: string): string {
  return createHash("sha256").update(sourceUrl).digest("hex");
}

// ── Pure function: compute textHash from cleaned text ────────────────────────

/**
 * Compute the SHA-256 hash of the cleaned JD text. Stored in `job.textHash`
 * and used by the staleness gate + content-drift guard.
 *
 * @param cleanedText  The cleaned (HTML-stripped) job description text
 * @returns            A 64-char hex SHA-256 hash
 */
export function computeTextHash(cleanedText: string): string {
  return createHash("sha256").update(cleanedText).digest("hex");
}

// ── Main insert function ─────────────────────────────────────────────────────

/**
 * Insert provisional job rows for a single company domain. Each
 * ProvisionalJobSeed from the domain-probe pipeline becomes a `job` row with:
 *   - status = 'provisional'
 *   - atsSource = "domain_probe"
 *   - atsSlug = the company domain
 *   - externalJobId = SHA-256(sourceUrl)
 *   - textHash = SHA-256(cleanedText)
 *   - sourceFetchedAt = now()
 *   - rawJson = the HTML snippet (capped at 15KB)
 *
 * Dedup: the unique index on (atsSource, atsSlug, externalJobId) prevents
 * duplicate rows on re-probe. `onConflictDoNothing` skips already-existing
 * rows.
 *
 * @param domain  The company domain (e.g. "acme.com")
 * @param seeds   The provisional job seeds from the domain probe
 * @returns       Insert result with counts and inserted job IDs
 */
export async function insertProvisionalJobs(
  domain: string,
  seeds: ProvisionalJobSeed[],
): Promise<ProvisionalInsertResult> {
  const totalSeeds = seeds.length;
  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const insertedJobIds: string[] = [];
  let error: string | undefined;

  if (seeds.length === 0) {
    return {
      domain,
      totalSeeds: 0,
      inserted: 0,
      skipped: 0,
      failed: 0,
      insertedJobIds: [],
    };
  }

  try {
    const now = new Date();
    const rows = seeds.map((seed) => ({
      atsSource: DOMAIN_PROBE_ATS_SOURCE,
      atsSlug: domain,
      externalJobId: computeExternalJobId(seed.sourceUrl),
      title: seed.title,
      rawJson: seed.htmlSnippet.slice(0, 15000), // cap at 15KB
      normalizedText: null, // populated by normalizeProvisionalJob
      extractedTags: [] as string[],
      status: "provisional" as const,
      lastSeenAt: now,
      detectedAt: now,
      sourceFetchedAt: now,
      textHash: computeTextHash(seed.cleanedText),
      // v2 fencing fields — defaults from the schema.
      retryInFlight: false,
      retryGeneration: 0,
      jobVersion: 1,
    }));

    const insertedRows = await db
      .insert(job)
      .values(rows)
      .onConflictDoNothing({
        target: [job.atsSource, job.atsSlug, job.externalJobId],
      })
      .returning({ id: job.id });

    inserted = insertedRows.length;
    skipped = seeds.length - inserted;
    for (const row of insertedRows) {
      insertedJobIds.push(row.id);
    }

    return {
      domain,
      totalSeeds,
      inserted,
      skipped,
      failed,
      insertedJobIds,
      error,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    failed = seeds.length;
    return {
      domain,
      totalSeeds,
      inserted: 0,
      skipped: 0,
      failed,
      insertedJobIds: [],
      error,
    };
  }
}

// ── Staleness gate: check if a re-probe should resume or re-fetch ────────────

/**
 * Check whether a provisional job's cached data is still fresh enough to
 * resume a single-step retry, or whether the source has been re-polled since
 * the job was fetched (requiring a full re-normalization).
 *
 * Per governing doc "Staleness Gate":
 *   - If company.lastPolledAt <= job.sourceFetchedAt → resume single-step
 *     (the cached data is still the latest).
 *   - If company.lastPolledAt > job.sourceFetchedAt → the source was re-polled
 *     after this job was cached. Pull the upserted row (zero HTTP) and compare
 *     textHash. If textHash matches → skip (no change). If textHash differs →
 *     full re-normalization with jobVersion++.
 *
 * @param lastPolledAt     The company's lastPolledAt timestamp (null if never polled)
 * @param sourceFetchedAt  The job's sourceFetchedAt timestamp
 * @returns                'resume' (cached data is fresh) or 'refetch' (source re-polled)
 */
export function stalenessGate(
  lastPolledAt: Date | null,
  sourceFetchedAt: Date | null,
): "resume" | "refetch" {
  if (lastPolledAt === null || sourceFetchedAt === null) {
    // No poll history or no fetch timestamp — safe to resume (no newer data).
    return "resume";
  }
  return lastPolledAt > sourceFetchedAt ? "refetch" : "resume";
}

// ── Dedup guard: check if textHash matches (skip re-embedding) ───────────────

/**
 * Check whether a re-probe found the same job content (textHash matches) or
 * changed content (textHash differs).
 *
 * Per governing doc "Dedup Guard":
 *   - textHash match → skip re-embedding, retry only the failed step.
 *   - textHash differs → full re-normalization with jobVersion++.
 *
 * @param existingTextHash  The textHash stored on the existing job row
 * @param newTextHash       The textHash computed from the re-probed content
 * @returns                 'skip' (identical content) or 'drift' (content changed)
 */
export function dedupGuard(
  existingTextHash: string | null,
  newTextHash: string,
): "skip" | "drift" {
  if (existingTextHash === null) {
    // No existing hash — first normalization, treat as drift (full run).
    return "drift";
  }
  return existingTextHash === newTextHash ? "skip" : "drift";
}

// ── Content-drift guard: cosine-distance check ───────────────────────────────

/**
 * Cosine distance threshold for content-drift detection. If the cosine
 * distance between the old and new embeddings exceeds this threshold, the
 * content is considered materially drifted → jobVersion++.
 *
 * Per governing doc "Content-Drift Guard": "cosine-distance above threshold
 * on re-normalization triggers a fresh Gate 1–3 run."
 *
 * 0.15 is a conservative threshold — small edits (fixing a typo) won't
 * trigger a version bump, but a substantive rewrite (new responsibilities,
 * changed seniority) will.
 */
export const CONTENT_DRIFT_COSINE_THRESHOLD = 0.15;

/**
 * Compute the cosine distance between two embedding vectors.
 * Returns 0 for identical vectors, 2 for opposite vectors.
 *
 * @param a  First embedding vector
 * @param b  Second embedding vector
 * @returns  Cosine distance (1 - cosine similarity), or 1 if either is empty
 */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 1;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

/**
 * Check whether the content drift between two embeddings exceeds the threshold.
 *
 * @param oldEmbedding  The existing job embedding
 * @param newEmbedding  The re-normalized embedding
 * @returns             true if material drift detected (jobVersion should increment)
 */
export function isMaterialContentDrift(
  oldEmbedding: number[],
  newEmbedding: number[],
): boolean {
  return (
    cosineDistance(oldEmbedding, newEmbedding) > CONTENT_DRIFT_COSINE_THRESHOLD
  );
}

// ── retryInFlight fencing helpers ────────────────────────────────────────────

/**
 * Result of a fencing check — whether a persist attempt is legitimate or a
 * zombie write that should be rejected.
 */
export type FencingCheckResult = "legitimate" | "zombie";

/**
 * Check whether a persist attempt is legitimate or a zombie write.
 *
 * Per governing doc "retryInFlight Fencing":
 *   - Any persist carrying generation ≤ clearedGeneration is rejected as a
 *     zombie write.
 *   - Only generation > clearedGeneration counts as legitimate.
 *
 * @param retryGeneration    The generation of the persist attempt
 * @param clearedGeneration  The last generation force-cleared by the sweeper
 * @returns                  'legitimate' if the persist should proceed, 'zombie' if rejected
 */
export function checkFencing(
  retryGeneration: number,
  clearedGeneration: number | null,
): FencingCheckResult {
  if (clearedGeneration === null) {
    // No generations have been cleared — all writes are legitimate.
    return "legitimate";
  }
  return retryGeneration <= clearedGeneration ? "zombie" : "legitimate";
}

// ── Query: find stale retryInFlight flags for the sweeper ────────────────────

/**
 * SQL fragment for the retryInFlightSweeper query. Finds rows where
 * retry_in_flight = true AND updated_at < now() - 10 minutes.
 *
 * Exposed for testing and for the sweeper Inngest function to use directly.
 */
export const STALE_RETRY_IN_FLIGHT_WHERE = sql`retry_in_flight = true AND updated_at < NOW() - INTERVAL '10 minutes'`;
