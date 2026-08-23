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
//
// D16 G2 (July 17 2026): Loosened from 0.50 → 0.55 based on threshold
// simulation. At 0.50, only 3 matches from 347 global+embedded jobs × 3
// personas. At 0.55, 20 matches (6.7x increase) — all high-quality web-dev
// roles (Node, Full-stack, Frontend, AI Engineer) matching TS/React/Next
// personas. The 0.50→0.55 bucket contains genuinely relevant roles that
// were being over-filtered. Founder-approved.
export const GATE2_MAX_COSINE_DISTANCE = Number(
  process.env.GATE2_MAX_COSINE_DISTANCE ?? 0.55,
);

/**
 * D18 Gate Re-architecture: When true, Gate 2 (cosine distance) becomes a
 * RANK signal instead of a GATE (exclusion). Jobs that pass hard filters
 * (scope, fence, natsec, qa) + stack match (tag overlap + stack-disjoint)
 * are ALL inserted into match_queue, ordered by semantic distance.
 *
 * This eliminates the "cosine cliff" problem where perfect matches at
 * distance 0.5036 were rejected for being 0.0036 over the threshold.
 * The threshold becomes a soft ceiling for Gate 3 prioritization, not
 * a hard exclusion.
 *
 * The GATE2_MAX_COSINE_DISTANCE still serves as a wide safety net —
 * jobs above GATE2_HARD_CEILING (default 0.75) are excluded even in
 * rank-only mode, to prevent truly unrelated jobs from entering the queue.
 */
export const GATE2_RANK_ONLY = process.env.GATE2_RANK_ONLY !== "false";

/**
 * Hard ceiling for cosine distance — even in rank-only mode, jobs above
 * this distance are excluded. This prevents truly unrelated jobs from
 * entering the queue. 0.75 = similarity > 0.25, which is a very permissive
 * floor that still excludes completely unrelated content.
 */
export const GATE2_HARD_CEILING = Number(
  process.env.GATE2_HARD_CEILING ?? 0.75,
);

/**
 * Minimum number of must-have tag overlaps required for a job to pass Gate 1.
 *
 * A persona with must_have_tags = [typescript, nextjs, react, nodejs, prompt-engineering]
 * should not match a job whose only overlapping tag is "javascript" (overlap=1).
 * Without a minimum, any single shared tag (e.g., "react" appearing in a Java+React
 * backend role) passes Gate 1, and if Gate 2 is skipped (null embedding), the job
 * goes straight to Gate 3 with a weak signal.
 *
 * Set to 2 based on mismatch analysis (July 2026): 16 of 50 user-marked mismatches
 * had overlap_score = 1 — a single tag overlap that Gate 3 then approved because the
 * "missing tags are a soft signal" prompt rule is too permissive. A minimum of 2
 * filters these out at the SQL level before the LLM ever sees them.
 *
 * Calibration status: CALIBRATED AGAINST REAL MISMATCH DATA (July 2026).
 * Env-configurable via `GATE1_MIN_OVERLAP` so the threshold can be tuned in
 * production without a code redeploy.
 */
export const GATE1_MIN_OVERLAP = Number(process.env.GATE1_MIN_OVERLAP ?? 2);

/**
 * D31 Job 2: Distinctive tags — tags that unambiguously indicate a specific
 * tech stack. At least one of these must appear in the job's required tags
 * (or extracted tags when required tags are not available) for a candidate
 * to pass Gate 1. This prevents generic overlap (typescript + javascript)
 * from matching a persona when the job's actual stack is different.
 *
 * The list is intentionally short — only tags that are "persona-defining"
 * in the sense that they indicate a specific primary stack, not generic
 * web technologies.
 */
export const DISTINCTIVE_TAGS = [
  // JS/React ecosystem
  "nextjs",
  "react",
  "vue",
  "nuxt",
  "svelte",
  "sveltekit",
  "remix",
  "astro",
  "nestjs",
  "graphql",
  "tailwindcss",
  // PHP ecosystem
  "laravel",
  "wordpress",
  "drupal",
  "magento",
  "symfony",
  // AI/ML
  "prompt-engineering",
  "langchain",
  // Python
  "django",
  "fastapi",
  // Go
  "golang",
  // Rust
  "rust",
] as const;

/**
 * D31 Job 2: Whether to require ≥1 distinctive tag for Gate 1 to pass.
 * When true, at least one of the DISTINCTIVE_TAGS must be present in the
 * job's tags (required_tags if available, otherwise extracted_tags) for
 * a candidate to be inserted into match_queue.
 *
 * Env-configurable via GATE1_REQUIRE_DISTINCTIVE_TAG=true|false.
 */
export const GATE1_REQUIRE_DISTINCTIVE_TAG =
  process.env.GATE1_REQUIRE_DISTINCTIVE_TAG !== "false";

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
 * `compositeScore = weightedOverlap(overlapScore) * GATE1_WEIGHT + similarity * GATE2_WEIGHT`
 * where `similarity = 1 - cosineDistance` and
 * `weightedOverlap(x) = 1 - exp(-0.4 * min(x, 5))`. Higher composite score
 * ranks first.
 *
 * The non-linear overlap gives the first matching must-have tags more weight
 * than marginal ones, matching the display scoring formula in
 * `src/lib/jobs/dashboard-queries.ts`.
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
