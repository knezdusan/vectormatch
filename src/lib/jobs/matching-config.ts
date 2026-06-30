// Module C — Matching Engine Configuration
// src/lib/jobs/matching-config.ts
//
// Single source of truth for all tunable thresholds and weights in the 3-Gate
// funnel. Every magic number in Module C is a config value here, not a literal
// scattered across gate-1-2.ts / gate-3-evaluator.ts / job-normalizer.ts.
//
// All values are UNCALIBRATED GUESSES until Feature C6 (calibration &
// observability) benchmarks them against 20–30 real job/persona pairs. C6 is
// launch-blocking: no real user sees Module C output until it completes.
// (MODULE_C_DECISIONS.md §5.3, §13)
//
// Do NOT enshrine these as final — they are starting points for empirical
// tuning. Each constant documents its calibration status so future tuners
// know what is evidence-based vs. guesswork.

/**
 * Gate 2 HNSW cosine distance threshold.
 *
 * `< GATE2_MAX_COSINE_DISTANCE` = cosine similarity `> 1 - GATE2_MAX_COSINE_DISTANCE`
 * (0.50 → similarity > 0.50). Lower distance = more similar.
 *
 * Calibration status: CALIBRATED AGAINST REAL DATA (June 2026, C6-real).
 * Initial value 0.35 was an uncalibrated guess that rejected 100% of real
 * job-persona pairs — real embeddings have much wider variance (0.45–0.74)
 * than synthetic data (0.18–0.21). Raised to 0.55 based on real-data
 * distribution analysis: min distance 0.45, avg 0.61, max 0.74.
 *
 * Tightened from 0.55 → 0.48 after yield analysis showed that 77% of
 * candidates (124/160) had cosine distance > 0.45 (weak semantic matches)
 * and the 0.50–0.55 bucket had only a 2.9% approval rate (likely false
 * positives). At 0.48, ~65% of borderline candidates are filtered before
 * the LLM, cutting Gate 3 costs while retaining strong matches. The 0.31–0.45
 * bucket had a 33% approval rate — those are the high-signal candidates we
 * want to keep.
 * See docs/reports/calibration-report.md §8 for the real-data analysis.
 */
// Env-configurable via `GATE2_MAX_COSINE_DISTANCE` so the threshold can be
// tuned in production without a code redeploy. Set the env var to a number
// (e.g. `GATE2_MAX_COSINE_DISTANCE=0.52`) to override the default below.
//
// Sprint 3 (June 30 2026): Loosened from 0.48 → 0.50 to lift the approval
// rate from 1.6% (1/62) toward the TDD target of 2–4%. The 0.48 threshold
// was over-filtering borderline-but-acceptable matches. Made env-configurable
// so further tuning does not require a redeploy.
export const GATE2_MAX_COSINE_DISTANCE = Number(
  process.env.GATE2_MAX_COSINE_DISTANCE ?? 0.5,
);

/**
 * Maximum number of candidates Gate 1+2 inserts into matchQueue per job
 * (the `LIMIT` in the SQL router query).
 *
 * Calibration status: UNCALIBRATED GUESS. If all candidates fail Gate 3, there
 * is no re-run with a wider net in MVP (post-MVP: dynamic widening, §14 Q4).
 */
export const GATE_ROUTER_LIMIT = 8;

/**
 * Weight of Gate 1 (tag overlap) in the composite ordering score.
 *
 * `compositeScore = overlapScore * GATE1_WEIGHT + similarity * GATE2_WEIGHT`
 * where `similarity = 1 - cosineDistance`. Higher composite score ranks first.
 *
 * Calibration status: UNCALIBRATED GUESS. `GATE1_WEIGHT + GATE2_WEIGHT` MUST
 * equal 1.0 — enforced by the composite formula, not a runtime check.
 */
export const GATE1_WEIGHT = 0.6;

/**
 * Weight of Gate 2 (vector similarity) in the composite ordering score.
 *
 * Calibration status: UNCALIBRATED GUESS. `GATE1_WEIGHT + GATE2_WEIGHT = 1.0`.
 */
export const GATE2_WEIGHT = 0.4;

/**
 * Minimum number of `persona_defining` tags a job must yield during
 * normalization to avoid rejection.
 *
 * Why `persona_defining` (not any tag): supporting tags like `css`, `git`,
 * `html` appear in non-engineering job descriptions (design, QA, marketing
 * tech). A `persona_defining` tag (`react`, `python`, `kubernetes`, `aws`)
 * unambiguously indicates a developer role. Mirrors Module A's Layer 2 refine
 * (≥1 `persona_defining` tag in `canonical_skills_detected`).
 *
 * Flow (MODULE_C_DECISIONS.md §4.3):
 *   1. Phase 1 regex scan → extractedTags.
 *   2. Count persona_defining tags in extractedTags.
 *   3. If count ≥ GATE_NORMALIZATION_MIN_PERSONA_TAGS → proceed to embedding.
 *   4. If count < threshold → run Phase 2 LLM fallback.
 *   5. After Phase 2, recount. If still < threshold → status = 'rejected',
 *      normalizedAt = NOW(). Tombstone.
 *   6. If Phase 2 LLM call fails → status = 'normalization_failed'
 *      (do NOT set normalizedAt — must remain retryable).
 */
export const GATE_NORMALIZATION_MIN_PERSONA_TAGS = 1;
