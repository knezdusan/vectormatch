// Module C — Gate 1+2 SQL Router (Step 5 of the 3-Gate Funnel)
// src/lib/jobs/gate-1-2.ts
//
// The SQL router combines Gate 1 (GIN index array overlap) and Gate 2 (HNSW
// vector cosine similarity) into a single query that inserts candidate rows
// into matchQueue. The composite ordering blends both signals so a candidate
// with strong semantic match (low cosine distance) isn't outranked by one
// with more tag overlap but a barely-passing distance.
//
// ── Bug fix from TDD §5.2 (review round 1) ─────────────────────────────────
// The TDD used `cardinality(p.must_have_tags & ${jobTags}::text[])` for the
// overlap count. The `&` (array intersection) operator exists ONLY in the
// `intarray` extension and ONLY for `integer[]` — it does NOT exist for
// `text[]`. On `text[]` this errors with "operator does not exist: text[] &
// text[]". The fix uses `unnest` + `= ANY` inside a `LATERAL` subquery so the
// count is evaluated once per persona, not repeated in SELECT and ORDER BY.
// (MODULE_C_DECISIONS.md §5.2)
//
// ── Why LATERAL for overlap but not for distance ───────────────────────────
// The overlap count via unnest/= ANY is a per-row computation that benefits
// from single evaluation. The cosine distance is kept in direct form
// (`p.persona_embedding <=> ${jobEmbedding}::vector`) in the WHERE, SELECT,
// and ORDER BY — NOT wrapped in a LATERAL subquery — because HNSW index
// pushdown requires the operator to appear directly in the query, not behind
// an alias. (MODULE_C_DECISIONS.md §5.2)
//
// Server-only: touches the database. Imported lazily inside the Inngest
// handler (AGENTS.md rule 2 — lazy imports).

import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import {
  GATE_ROUTER_LIMIT,
  GATE1_MIN_OVERLAP,
  GATE1_WEIGHT,
  GATE2_MAX_COSINE_DISTANCE,
  GATE2_WEIGHT,
} from "@/lib/jobs/matching-config";

// =============================================================================
// TYPES
// =============================================================================

/** A candidate persona that passed Gates 1+2, ready for Gate 3 evaluation. */
export type GateRouterCandidate = {
  /** The matchQueue row ID (inserted by the query). */
  matchQueueId: string;
  personaId: string;
  applicantId: string;
  /** Gate 1 score: count of overlapping must-have tags. */
  overlapScore: number;
  /** Gate 2 score: HNSW cosine distance (0.0–2.0, lower is better). */
  cosineDistance: number;
};

// =============================================================================
// VECTOR SERIALIZATION
// =============================================================================

/**
 * Serialize a number[] embedding into PostgreSQL's text vector format for
 * the `::vector` cast. pgvector accepts `[0.1,0.2,...]` as input.
 */
function serializeVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// =============================================================================
// GATE 1+2 SQL ROUTER
// =============================================================================

/**
 * Run the Gate 1+2 SQL router — inserts candidate rows into matchQueue and
 * returns them for Gate 3 fan-out.
 *
 * The query (MODULE_C_DECISIONS.md §5.2):
 *   1. Gate 1 (WHERE): `p.must_have_tags && jobTags` (GIN index overlap, ≥1
 *      hit) AND `NOT (p.blocklist_tags && jobTags)` (zero blocklist hits).
 *   2. Gate 2 (WHERE): `(p.persona_embedding <=> jobEmbedding) < threshold`
 *      (HNSW cosine distance).
 *   3. LATERAL subquery: count overlapping tags via `unnest` + `= ANY`
 *      (replaces the invalid `&` operator).
 *   4. Composite ORDER BY: `overlap * w1 + (1 - distance) * w2 DESC` — blends
 *      Gate 1 and Gate 2 signals.
 *   5. LIMIT + ON CONFLICT (jobId, personaId) DO NOTHING + RETURNING.
 *
 * @param jobId        The job UUID
 * @param jobTags      The job's extracted canonical tag slugs
 * @param jobEmbedding The job's 1536-d embedding (text-embedding-3-small)
 * @returns            Array of candidates that passed both gates, ordered by
 *                     composite score (best first). Empty array if no
 *                     personas pass.
 */
export async function runGateSQLRouter(
  jobId: string,
  jobTags: string[],
  jobEmbedding: number[],
): Promise<GateRouterCandidate[]> {
  // Edge case (§5.4): empty jobTags — Gate 1 `&&` with empty array matches
  // nothing. Skip Gate 1, rely on Gate 2 alone. Log warning via console.
  if (jobTags.length === 0) {
    console.warn(
      `Gate 1+2 router called with empty jobTags for job ${jobId} — ` +
        "skipping Gate 1, relying on Gate 2 alone",
    );
  }

  // Edge case (§5.4): null/empty embedding — the job was not embedded (either
  // a probation company whose backfill hasn't run, or an intentionally-fenced
  // job whose embedding was skipped to save OpenAI calls).
  //
  // Mismatch analysis (July 2026): The previous fallback (runGate1Only) was
  // letting unembedded jobs through Gate 1 with as few as 1 tag overlap and
  // NO semantic similarity check. This produced 44 of 50 user-marked mismatches
  // — 88% of all mismatches had NULL embeddings and bypassed Gate 2 entirely.
  //
  // Fix: return empty array. The job will be matched when the embedding backfill
  // runs (for probation jobs) or not at all (for intentionally-fenced jobs,
  // which are not addressable for global remote personas). The caller handles
  // candidates.length === 0 gracefully (no Gate 3 fan-out).
  if (jobEmbedding.length === 0) {
    console.warn(
      `Gate 1+2 router called with empty embedding for job ${jobId} — ` +
        "skipping matching. Job will be matched when embedding backfill runs " +
        "(probation jobs) or not at all (intentionally-fenced jobs).",
    );
    return [];
  }

  const embeddingStr = serializeVector(jobEmbedding);

  // Build the tags array SQL literal once (used in LATERAL + WHERE clauses).
  // Tags are sanitized by escaping single quotes (SQL injection prevention).
  const tagsArraySql =
    jobTags.length > 0
      ? `ARRAY[${jobTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`
      : `ARRAY[]::text[]`;

  // Gate 1 WHERE clause: if jobTags is empty, skip the overlap filter (rely
  // on Gate 2 alone per §5.4). Otherwise, require ≥GATE1_MIN_OVERLAP must-have
  // tag overlap AND zero blocklist hits.
  //
  // Mismatch analysis (July 2026): The previous threshold was ≥1, which let
  // single-tag overlaps (e.g., a PHP/Laravel persona matching a JavaScript/
  // Python job on "javascript" alone) pass Gate 1. With Gate 2 skipped (null
  // embedding), these 1-tag matches went straight to Gate 3 and were approved.
  // Raising to ≥2 filters these out at the SQL level.
  const gate1Clause =
    jobTags.length > 0
      ? sql.raw(
          `p.must_have_tags && ${tagsArraySql} AND NOT (p.blocklist_tags && ${tagsArraySql})`,
        )
      : sql`true`;

  // Minimum overlap filter: ov.overlap_score >= GATE1_MIN_OVERLAP.
  // Applied after the LATERAL subquery computes the overlap count.
  // Skipped when jobTags is empty (Gate 1 is skipped, rely on Gate 2 alone).
  const minOverlapClause =
    jobTags.length > 0
      ? sql`AND ov.overlap_score >= ${GATE1_MIN_OVERLAP}::int`
      : sql``;

  // ── Cross-posting dedup (Phase 5, Sprint 8 relaxed) ──────────────────────
  // Blocks a job from matching a persona if another job with the same
  // (ats_slug, title) is ALREADY APPROVED for that persona. Previously this
  // blocked on ANY match_queue status (including rejected), which prevented
  // re-evaluation of jobs whose sibling was rejected for a different persona.
  // Sprint 8: relaxed to only block 'approved' matches — rejected siblings are
  // now re-evaluated, and the ON CONFLICT (job_id, persona_id) DO UPDATE
  // clause resets rejected entries to 'pending' for re-evaluation by Gate 3.
  //
  // ── Workplace type pre-filter (Sprint 8 — REMOVED) ────────────────────────
  // The workplace_type pre-filter was removed in Sprint 8. It was blocking 113
  // valid pairs (74 on-site + 39 hybrid) before Gate 3 could evaluate them.
  // Gate 3 (the LLM) now makes the final determination on workplace fit — it
  // has the applicant's assignment_types and the job's workplace_type in its
  // prompt and correctly rejects true mismatches (e.g., on-site when applicant
  // is remote-only). Hybrid jobs are treated as a soft concern, not a hard
  // blocker, since some hybrid roles offer remote options for the right
  // candidate.
  //
  // ── Remote scope pre-filter (Directive 09, Part A.1) ──────────────────────
  // The Gate 1+2 router now filters at the SQL level: only jobs with
  // remote_scope = 'global' are eligible for matching. This prevents
  // country_fenced, region_fenced, onsite, and undetermined jobs from
  // reaching Gate 3 (the LLM), saving API calls and eliminating the scope
  // inversion where fenced jobs were approved for global-remote applicants.
  // The job_meta CTE now fetches remote_scope alongside ats_slug/title, and
  // the main WHERE clause includes jm.remote_scope = 'global'.
  // Gate 3 still reads the job text as a secondary check (catches classifier
  // false-globals), but the cheap SQL filter eliminates the bulk of waste.
  const query = sql`
    WITH job_meta AS (
      SELECT ats_slug, title, remote_scope
      FROM job WHERE id = ${jobId}::uuid
    )
    INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
    SELECT
      ${jobId}::uuid,
      p.id,
      p.applicant_id,
      ov.overlap_score,
      (p.persona_embedding <=> ${embeddingStr}::vector) AS cosine_distance,
      'pending'
    FROM persona p
    CROSS JOIN job_meta jm
    CROSS JOIN LATERAL (
      SELECT count(*) AS overlap_score
      FROM unnest(p.must_have_tags) AS t(tag)
      WHERE t.tag = ANY(${sql.raw(tagsArraySql)})
    ) ov
    WHERE
      ${gate1Clause}
      ${minOverlapClause}
      AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${GATE2_MAX_COSINE_DISTANCE}::real
      AND p.persona_embedding IS NOT NULL
      AND jm.remote_scope = 'global'
      AND NOT EXISTS (
        SELECT 1 FROM match_queue mq
        JOIN job j2 ON mq.job_id = j2.id
        WHERE j2.ats_slug = jm.ats_slug
          AND j2.title = jm.title
          AND mq.persona_id = p.id
          AND mq.status = 'approved'
      )
    ORDER BY
      (
        (1 - EXP(-0.4 * LEAST(ov.overlap_score, 5))) * ${GATE1_WEIGHT}::real
        + (1 - (p.persona_embedding <=> ${embeddingStr}::vector)) * ${GATE2_WEIGHT}::real
      ) DESC
    LIMIT ${GATE_ROUTER_LIMIT}
    ON CONFLICT (job_id, persona_id) DO UPDATE SET
      status = 'pending',
      evaluated_at = NULL,
      llm_verdict = NULL,
      llm_blockers = NULL,
      llm_reasoning = NULL,
      llm_confidence = NULL,
      llm_model = NULL,
      prompt_variant = NULL,
      overlap_score = EXCLUDED.overlap_score,
      cosine_distance = EXCLUDED.cosine_distance
    RETURNING id, persona_id, applicant_id, overlap_score, cosine_distance
  `;

  const result = await db.execute(query);

  return result.rows.map((row) => ({
    matchQueueId: row.id as string,
    personaId: row.persona_id as string,
    applicantId: row.applicant_id as string,
    overlapScore: Number(row.overlap_score),
    cosineDistance: Number(row.cosine_distance),
  }));
}

/**
 * Defensive fallback: Gate 1 only (no embedding).
 *
 * NOTE (July 2026 mismatch fix): This function is NO LONGER CALLED from
 * runGateSQLRouter — empty embeddings now return [] instead of falling back
 * to Gate 1 only. This was the root cause of 44 of 50 user-marked mismatches:
 * unembedded jobs bypassed Gate 2 (semantic similarity) entirely and were
 * matched on tag overlap alone, which let through 1-tag-overlap jobs that
 * Gate 3 then approved. Kept here for reference and in case a future use case
 * needs Gate 1 only with a minimum overlap threshold.
 */
async function runGate1Only(
  jobId: string,
  jobTags: string[],
): Promise<GateRouterCandidate[]> {
  if (jobTags.length === 0) {
    return []; // No tags and no embedding → no matches
  }

  const tagsArray = `ARRAY[${jobTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`;

  const query = sql`
    INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, status)
    SELECT
      ${jobId}::uuid,
      p.id,
      p.applicant_id,
      ov.overlap_score,
      'pending'
    FROM persona p
    CROSS JOIN LATERAL (
      SELECT count(*) AS overlap_score
      FROM unnest(p.must_have_tags) AS t(tag)
      WHERE t.tag = ANY(${sql.raw(tagsArray)})
    ) ov
    WHERE
      p.must_have_tags && ${sql.raw(tagsArray)}
      AND NOT (p.blocklist_tags && ${sql.raw(tagsArray)})
      AND ov.overlap_score >= ${GATE1_MIN_OVERLAP}::int
    ORDER BY ov.overlap_score DESC
    LIMIT ${GATE_ROUTER_LIMIT}
    ON CONFLICT (job_id, persona_id) DO UPDATE SET
      status = 'pending',
      evaluated_at = NULL,
      llm_verdict = NULL,
      llm_blockers = NULL,
      llm_reasoning = NULL,
      llm_confidence = NULL,
      llm_model = NULL,
      prompt_variant = NULL,
      overlap_score = EXCLUDED.overlap_score
    RETURNING id, persona_id, applicant_id, overlap_score
  `;

  const result = await db.execute(query);

  return result.rows.map((row) => ({
    matchQueueId: row.id as string,
    personaId: row.persona_id as string,
    applicantId: row.applicant_id as string,
    overlapScore: Number(row.overlap_score),
    cosineDistance: 0, // unknown — Gate 2 was skipped
  }));
}

// =============================================================================
// EXPLAIN ANALYZE (for C2 verification, §5.5)
// =============================================================================

/**
 * Run EXPLAIN ANALYZE on the Gate 1+2 query (without the INSERT) to verify
 * index usage. Used by the C2 verification step and C6 calibration.
 *
 * Returns the raw EXPLAIN ANALYZE output as an array of plan lines.
 *
 * @param jobTags      The job's extracted tags
 * @param jobEmbedding The job's embedding
 * @returns            EXPLAIN ANALYZE plan lines
 */
// fallow-ignore-next-line unused-export
export async function explainGateRouter(
  jobTags: string[],
  jobEmbedding: number[],
): Promise<string[]> {
  const embeddingStr = serializeVector(jobEmbedding);
  const tagsArray =
    jobTags.length > 0
      ? `ARRAY[${jobTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`
      : `ARRAY[]::text[]`;

  const query = sql`
    EXPLAIN ANALYZE
    SELECT
      p.id,
      p.applicant_id,
      ov.overlap_score,
      (p.persona_embedding <=> ${embeddingStr}::vector) AS cosine_distance
    FROM persona p
    CROSS JOIN LATERAL (
      SELECT count(*) AS overlap_score
      FROM unnest(p.must_have_tags) AS t(tag)
      WHERE t.tag = ANY(${sql.raw(tagsArray)})
    ) ov
    WHERE
      p.must_have_tags && ${sql.raw(tagsArray)}
      AND NOT (p.blocklist_tags && ${sql.raw(tagsArray)})
      AND ov.overlap_score >= ${GATE1_MIN_OVERLAP}::int
      AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${GATE2_MAX_COSINE_DISTANCE}::real
      AND p.persona_embedding IS NOT NULL
    ORDER BY
      (
        (1 - EXP(-0.4 * LEAST(ov.overlap_score, 5))) * ${GATE1_WEIGHT}::real
        + (1 - (p.persona_embedding <=> ${embeddingStr}::vector)) * ${GATE2_WEIGHT}::real
      ) DESC
    LIMIT ${GATE_ROUTER_LIMIT}
  `;

  const result = await db.execute(query);

  return result.rows.map((row) => {
    // EXPLAIN ANALYZE returns rows with a single column (QUERY PLAN)
    const val = Object.values(row)[0];
    return String(val);
  });
}
