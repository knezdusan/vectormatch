# Matching Score Calibration Session — July 2026

**Session focus:** Improve the dashboard match score so it better reflects the real reasons the LLM rejects candidates, and document all strategic decisions in the governing project docs.

**Outcome:**
- Added three negative mismatch signals to the display score formula.
- Tuned the weights empirically against live `match_queue` data.
- Fixed a runtime SQL bug in the dashboard query.
- Updated all governing documents (TDD, blueprint, `MODULE_C_DECISIONS.md`, `calibration-report.md`).

---

## 1. Strategic Context

The dashboard originally showed raw Gate 1/2 signals (cosine distance, overlap score) and LLM confidence. These numbers are not directly comparable and do not explain why the LLM rejected a candidate. A single, calibrated 0–100 match score was needed to:

1. Rank matches in a way that aligns with the LLM verdict.
2. Surface mismatch components in the detail view.
3. Give users a clear quality signal instead of raw technical inputs.

The display score is intentionally separate from the Gate 1+2 router's composite ordering score (used only to select the top 8 candidates). The router score is for recall; the display score is for user-facing precision.

---

## 2. Final Display Score Formula

Implemented in `src/lib/jobs/dashboard-queries.ts`.

```text
score = clamp(
  similarity * 0.25
  + overlapNormalized * 0.30
  + workplaceMatch * 0.12
  + locationMatch * 0.08
  + seniorityMatch * 0.08
  + companyQuality * 0.17
  - blocklistPenalty * 0.10
  - coverageGap * 0.10
  - secondaryDomainMismatch * 0.08,
  0, 1
) * 100
```

| Signal | Computation | Weight | Direction |
|---|---|---|---|
| Semantic similarity | `1 - cosineDistance` | 0.25 | Positive |
| Tag overlap | `1 - exp(-0.4 * min(overlapScore, 5))` | 0.30 | Positive |
| Workplace alignment | `assignmentTypes` vs. `job.workplaceType` | 0.12 | Positive |
| Location alignment | `applicant.country` vs. `job.locationName` | 0.08 | Positive |
| Seniority alignment | `job.title` regex vs. `persona.seniorityLevels` | 0.08 | Positive |
| Company quality | `companyQualityScore / 100` (default 50) | 0.17 | Positive |
| Blocklist penalty | `1.0` if `blocklistTags && extractedTags` | 0.10 | Negative |
| Coverage gap | `1 - overlapScore / min(mustHaveCount, jobTagCount)` | 0.10 | Negative |
| Secondary domain mismatch | `min(count / 3, 1.0)` for alternative framework/language tags not in must-haves | 0.08 | Negative |

### 2.1 Negative signal design decisions

**Blocklist penalty (flat):**
- If any persona `blocklistTags` appears in the job's `extractedTags`, subtract 10 points.
- Current personas have empty blocklists, so this is a future-proof guard.

**Coverage gap:**
- Penalizes the fraction of persona must-have tags missing from the job.
- A 5-tag persona matching only 1 tag gets a 0.8 gap (≈ 8-point score drop).
- A 5-tag persona matching 4 tags gets a 0.2 gap (≈ 2-point drop).
- This directly encodes missing critical skills.

**Secondary domain mismatch:**
- Penalizes jobs that require an alternative framework/language stack outside the persona's focus.
- Tracked tags: `wordpress`, `vue`, `nuxt`, `angular`, `svelte`, `solidjs`, `php`, `laravel`, `ruby`, `rails`, `csharp`, `dotnet`, `aspnet`, `swift`, `kotlin`, `flutter`, `ios`, `android`.
- Count of tracked tags not in `mustHaveTags` is divided by 3 and capped at 1.0, then multiplied by 8%.
- **Excluded intentionally:** `python`, `go`, `golang`, `rust`, `java`, `spring`, `spring-boot`, `django`, `flask`, `fastapi`. These general-purpose languages are common secondary skills in AI/full-stack roles; penalizing them produced false negatives against legitimate matches.

### 2.2 Why this weighting

- Tag overlap (30%) and semantic similarity (25%) remain the dominant positive signals because they capture the core match.
- Workplace/location/seniority (28% combined) encode the hard constraints that the LLM already evaluates.
- Company quality (17%) rewards historically high-quality companies without overwhelming the match signal.
- The three negative signals total 28%, enough to pull down mismatched jobs without collapsing the score of borderline-but-approved matches.

---

## 3. Calibration Results

Measured against live `match_queue` data (July 2026).

| Metric | Value |
|---|---|
| Approved matches | 32 |
| Approved average score | 54.1/100 |
| Approved score range | 33 – 75 |
| Rejected matches | 298 |
| Rejected average score | 39.9/100 |
| Rejected score range | 19 – 60 |
| Approved/rejected gap | 14.2 points |
| Rejected matches ≥ approved average | 8 |

### 3.1 WordPress / Vue case study

The gohighlevel WordPress-heavy roles were used as a sanity check.

| Role | Persona | Before negative signals | After negative signals |
|---|---|---|---|
| Lead Engineer - Wordpress | Next.js / AI Full-Stack | 51 | 43 |
| Lead Engineer - Wordpress | Senior React / GraphQL | 42 | 34 |
| SDE III - Fullstack | Next.js / AI Full-Stack | 56 | 48 |
| SDE III - Fullstack | Senior React / GraphQL | 56 | 47 |
| Lead Engineer - Wordpress | PHP/Laravel Full-Stack | 52 | 47 |

**Interpretation:** React/Next.js personas on WordPress/Vue-heavy roles dropped by 8–10 points, while the PHP/Laravel persona on the dedicated WordPress role dropped by only 5 points. The signal correctly distinguishes persona-aligned tags from off-domain tags.

### 3.2 Top remaining false negatives

These rejected matches still score above the rejected mean because their rejection reasons are not yet captured by the formula:

1. **Senior Forward Deployed Engineer (DevRev)** — 60/100. Rejected for employment-type/contractor language.
2. **Principal Full Stack Developer with React (Remote, Global)** — 59/100. Rejected for 8+ years experience vs. persona's 7+ years.
3. **Senior Software Engineer, Trading Platform GUI (DRW)** — 56/100. Rejected for London on-site location.
4. **Forward Deployed Engineer - Applied AI (DevRev)** — 56/100. Rejected for Japan-only location.

**Strategic takeaway:** The next highest-impact signal is an **experience gap** (extract `min_experience_years` from job descriptions). Location and employment-type refinements are secondary priorities.

---

## 4. Runtime Bug Fix

A SQL syntax error in `src/lib/jobs/dashboard-queries.ts` caused the dashboard page to fail with:

```
Failed query: ... select "match_queue".id" ...
```

### Root cause

The blocklist-penalty CASE condition was missing `= 0` on the second clause:

```sql
-- Broken
WHEN COALESCE(array_length("persona"."blocklist_tags", 1), 0) = 0
  OR COALESCE(array_length("job"."extracted_tags", 1), 0) THEN 0.0

-- Fixed
WHEN COALESCE(array_length("persona"."blocklist_tags", 1), 0) = 0
  OR COALESCE(array_length("job"."extracted_tags", 1), 0) = 0 THEN 0.0
```

The second `COALESCE` returned an integer, which cannot be used as a boolean operand in the `OR` expression.

### Why it only broke the dashboard page

The analysis scripts (`analyze-approved-matches.ts`, `analyze-rejected-matches.ts`, `investigate-wordpress-matching.ts`) had the correct SQL syntax. Only the inline Drizzle expression in `dashboard-queries.ts` had the typo.

### Verification

- Raw SQL smoke test against the dashboard query shape returned valid results.
- Dashboard page query now executes successfully.

---

## 5. Tools Created

| Script | Purpose |
|---|---|
| `scripts/analyze-approved-matches.ts` | Per-match score breakdown, SQL-vs-manual verification, approved-match distribution, high-confidence/low-score outliers. |
| `scripts/analyze-rejected-matches.ts` | Rejected-match distribution, overlap with approved scores, top false negatives. |
| `scripts/investigate-wordpress-matching.ts` | Targeted case study for WordPress/Vue secondary-domain mismatch behavior. |

These scripts are intended for repeated empirical tuning, not one-time use.

---

## 6. Documentation Updates

All governing documents were updated to reflect the current state.

### 6.1 `docs/governing/VectorMatchTechicalImplementation.md`

- §5.4 Dashboard Query Layer now documents the composite 0–100 score, its 9 signals, and the weights.
- Dashboard list and detail views explicitly mention the score and component breakdown.
- §5.5 Calibration status updated to "Funnel Thresholds Calibrated; Display Score Calibration In Progress."
- Added new "Key findings (display score calibration, July 2026)" subsection.

### 6.2 `docs/governing/vectormatch-blueprint.md`

- Build Sequence item 10 C4 updated to mention the display match score.
- C6 updated to mention the new analysis scripts and current approved/rejected gap.
- Completion summary line now includes "display score + negative signals July 2026."

### 6.3 `docs/reports/MODULE_C_DECISIONS.md`

- Inserted a new **§12 Display Match Score** with the full formula, rationale, and calibration status.
- Renumbered former §12→§13, §13→§14, §14→§15.
- Updated the C6 feature table and Open Questions list to include the next targeted signal (experience gap).
- Updated source/test comments that referenced `§13` to `§14`.

### 6.4 `docs/reports/calibration-report.md`

- Updated header status to reflect funnel calibration completion.
- Added new **§9 Display Score Calibration** with formula, negative signal design, empirical results, case study, and remaining work.

---

## 7. Files Changed

### Code

- `src/lib/jobs/dashboard-queries.ts` — display score formula with negative signals; bug fix for blocklist CASE condition.
- `scripts/analyze-approved-matches.ts` — added `SECONDARY_DOMAIN_TAGS` and `computeSecondaryDomainMismatch`.
- `scripts/analyze-rejected-matches.ts` — updated SQL score expression.
- `scripts/investigate-wordpress-matching.ts` — updated scoring output and SQL.
- `src/lib/jobs/__tests__/gate-1-2.test.ts` — updated `MODULE_C_DECISIONS.md` reference.
- `src/lib/jobs/__tests__/dashboard-queries.test.ts` — updated `MODULE_C_DECISIONS.md` reference.
- `src/lib/jobs/__tests__/gate-3.test.ts` — updated `MODULE_C_DECISIONS.md` reference.
- `src/lib/jobs/__tests__/job-normalizer.test.ts` — updated `MODULE_C_DECISIONS.md` reference.
- `scripts/calibrate-routing-engine.ts` — updated `MODULE_C_DECISIONS.md` reference.

### Docs

- `docs/governing/VectorMatchTechicalImplementation.md`
- `docs/governing/vectormatch-blueprint.md`
- `docs/reports/MODULE_C_DECISIONS.md`
- `docs/reports/calibration-report.md`
- `docs/reports/matching-score-calibration-session.md` (this document)

---

## 8. Verification Performed

- `npx tsc --noEmit` passes.
- `npx vitest run` on affected job tests: 251 passed.
- Raw SQL smoke test against dashboard query shape: successful.
- Analysis scripts (`analyze-approved-matches.ts`, `analyze-rejected-matches.ts`, `investigate-wordpress-matching.ts`) run successfully against live data.

---

## 9. Open Questions / Next Steps

1. **Experience gap signal:** Extract `min_experience_years` from job descriptions and compare to persona-inferred experience. This would catch the Principal Full Stack case (8+ years required) and similar rejections.
2. **Location refinement:** Better detection of country-specific restrictions (e.g., "Japan only", "London on-site") and employment-type restrictions (e.g., "no contractors").
3. **Continuous tuning:** As the corpus grows and personas are adjusted, re-run the analysis scripts to verify the approved/rejected gap remains stable.

---

## 10. Status

- **Funnel routing thresholds:** Calibrated against live data. Safe for matching pipeline.
- **Display score:** Implemented and empirically tuned. Suitable for internal/developer use.
- **Launch-blocking for public users:** The display score still needs the experience-gap signal before it can be considered final. Until then, public access should remain gated behind the existing C6 launch-blocking rule.
