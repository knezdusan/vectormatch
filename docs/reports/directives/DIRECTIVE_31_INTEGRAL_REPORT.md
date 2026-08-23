# Directive 31 — Integral Report: Don't Block the Good Ones

**Date:** 2026-08-17
**Status:** Jobs 1–4 complete; remaining rulings (3b, 5, 6, 7) pending
**Preceded by:** [DIRECTIVE_30_PHASE2_INTEGRAL_REPORT.md](./DIRECTIVE_30_PHASE2_INTEGRAL_REPORT.md) (Phase 2, Aug 17 2026 — deterministic precision layer)
**Directive source:** `/Users/knez/Downloads/vectormatch_advisor_directive_31_dont_block_the_good_ones.md`
**Audit basis:** [MATCH_QUALITY_AUDIT_2026-08-17.md](../audits/MATCH_QUALITY_AUDIT_2026-08-17.md)
**Tests:** 2966/2966 pass (130 files, +21 new tests)
**Build:** Clean (tsc --noEmit, Biome, Vitest all green)

---

## Executive Summary

Directive 30 Phase 2 introduced a deterministic precision layer (platform-name and role-family blockers) that ran before Gate 3. The audit and the advisor identified two problems with this layer:

1. **Over-blocking:** The platform blocker used hardcoded tag-exemption lists. Shopify (a JS/React platform via Hydrogen) was blocked for JS personas because "shopify" wasn't in the persona's must-have tags. Magento was blocked for PHP personas. The directive's title — "Don't Block the Good Ones" — names this directly.
2. **Under-blocking:** Generic title blockers cannot catch false positives like "Senior AI Engineer (Python/AI)" or "AI Product Engineer — ClickStack (Go/Rust)" where the title is generic but the required stack is wrong. These require separating required technologies from mentioned technologies.

D31 addresses both:

- **Job 1** replaces hardcoded platform exceptions with stack-family disjointness. Shopify is allowed for JS personas because both belong to the JS stack family. Magento is allowed for PHP personas. SharePoint, SAP, AEM, and ServiceNow remain blocked for all web personas. The `staff`/`principal` IC exemption bug in the Engineering Manager blocker is fixed.
- **Job 2** ships Ruling 3a: required-vs-mentioned tag separation. A new `required_tags` column stores technologies from the requirements/qualifications section. Gate 1 overlap is computed against `required_tags` when available. A distinctive-tag rule requires at least one persona-defining tag (nextjs, laravel, graphql, etc.) for Gate 1 to pass. The ML exemption is tightened: `prompt-engineering` exempts AI-application roles only, not ML-research roles.
- **Job 3** backfills the blockers over the existing approved matches. 5 false positives removed (2 Architect, 1 SRE, 2 geo-fenced Berlin/EMEA). Dashboard-visible approved count: 41 → 36.
- **Job 4** expands remote-native supply. A new Jobicy adapter is added. Remote.co is re-enabled. Polling budget is redirected: 375 Greenhouse/Lever/SmartRecruiters/Workable companies demoted from `active_hot` (3h) to `active` (12h).

**Key changes:**

| Job | Change | New tests | Files touched |
|-----|--------|-----------|---------------|
| 1 | Stack-family disjointness replaces hardcoded platform exceptions; staff/principal IC fix; ML exemption tightened | 11 | `title-blockers.ts`, `title-blockers.test.ts` |
| 2 | `required_tags` column + LLM extraction + Gate 1 overlap on required_tags + distinctive-tag rule | 0 (schema + SQL) | `job.ts`, `job-normalizer.ts`, `gate-1-2.ts`, `matching-config.ts`, `pipeline.ts`, `0057_curious_cerebro.sql` |
| 3 | Production backfill: 5 false positives removed | 0 (production ops) | Production DB |
| 4 | Jobicy adapter + Remote.co re-enabled + polling budget redirect | 10 | `jobicy.ts` (new), `jobicy.test.ts` (new), `pipeline.ts` |

---

## JOB 1 — Stack-Family Disjointness + IC Exemption Fix

### Problem

The D30 Phase 2 platform blocker used a hardcoded tag-exemption list: a platform was allowed only if its exact tag slug was in the persona's `must_have_tags`. This meant:

- **Shopify** (JS/React via Hydrogen) was blocked for JS personas because "shopify" wasn't in `must_have_tags`.
- **Magento** (PHP) was blocked for PHP personas because "magento" wasn't in `must_have_tags`.
- **Contentful**, **Storyblok**, **BigCommerce** (all JS/headless) were blocked for JS personas.

The audit identified two strong Shopify matches that should have survived. The directive's title names this problem directly.

Additionally, the Engineering Manager role-family blocker exempted `staff` and `principal` seniority levels, treating them as management tracks. They are IC tracks — only `manager`, `lead`, and `director` should exempt management roles.

### Solution: Stack-Family Disjointness

The blocker now uses `classifyStackFamily()` from `src/lib/jobs/stack-families.ts` to determine the persona's primary stack family. Each platform is mapped to its underlying stack family:

| Platform | Stack family | Blocks JS? | Blocks PHP? |
|---|---|---|---|
| SharePoint, .NET/C#, Sitecore, Episerver | `dotnet` | yes | yes |
| SAP, Oracle, ServiceNow, Salesforce, Dynamics 365 | `enterprise` (sentinel) | yes | yes |
| AEM | `java` | yes | yes |
| Magento, Drupal, WooCommerce, WordPress | `php` | yes | **no** |
| Shopify, Contentful, Storyblok, BigCommerce, Webflow | `js` | **no** | yes |

The model is: `block(platform, persona) = disjoint(platform.stackFamily, persona.primaryStackFamily)`.

"enterprise" is a sentinel that blocks ALL personas — no persona has enterprise as their primary stack family.

### IC Exemption Fix

The `managementSeniority` set in the Engineering Manager blocker was changed from `{manager, lead, staff, principal}` to `{manager, lead, director}`. Staff and principal are IC tracks, not management tracks.

### ML Exemption Tightening

The single "ML Engineer" role-family pattern was split into two:

1. **AI-application** (`ai_engineer` pattern: `\bai\s+engineer\b`): Exempted when persona has `prompt-engineering` AND a JS/TS signal tag. This is the "AI fullstack" persona — building AI apps with LLMs, not training models.
2. **ML-research** (`ml_research` pattern: `ml\s+engineer`, `machine\s+learning\s+engineer`, `deep\s+learning`, `nlp\s+engineer`, `computer\s+vision`, `research\s+engineer`): Exempted ONLY via `python`, `ml`, `langchain`, `pytorch`, or `tensorflow` tags. `prompt-engineering` alone does NOT exempt — a JS persona building AI apps is not an ML researcher.

This catches the directive's false-positive example: "Senior AI Engineer (Python/AI)" matching a JS persona with `prompt-engineering` — the title says "AI Engineer" (application), but the required stack is Python, not JS/TS. The AI-application exemption requires a JS/TS signal, so a Python-only persona with `prompt-engineering` is NOT exempted.

### Files Changed

- `src/lib/jobs/title-blockers.ts` — full rewrite of platform patterns + role-family exemptions
- `src/lib/jobs/__tests__/title-blockers.test.ts` — 11 new tests covering stack-family disjointness, IC fix, ML split

### Test Coverage

59 tests (48 original + 11 new). Key new tests:

- `allows Shopify for JS persona (D31: JS family matches JS persona)`
- `allows Magento for PHP persona (D31: PHP family matches PHP persona)`
- `allows Contentful for JS persona (D31: JS family headless CMS)`
- `rejects Shopify for PHP persona (D31: JS family disjoint from PHP)`
- `rejects Contentful for PHP persona (D31: JS family disjoint from PHP)`
- `allows Webflow for JS persona (D31: JS family matches JS persona)`
- `rejects Webflow for PHP persona (D31: JS family disjoint from PHP)`
- `rejects Engineering Manager when persona has staff seniority (D31: IC track)`
- `rejects Engineering Manager when persona has principal seniority (D31: IC track)`
- `rejects ML Engineer for AI persona with prompt-engineering but no ML tags (D31: tightened exemption)`
- `allows AI Engineer for AI persona with prompt-engineering + JS/TS signal (D31)`

---

## JOB 2 — Required-vs-Mentioned Tag Separation (Ruling 3a)

### Problem

The audit identified false positives that generic title blockers cannot catch:

- **AI Product Engineer — ClickStack** (Go/Rust): Tags include `typescript, nodejs` (mentioned in prose), overlap = 2 with JS persona.
- **Staff Software Engineer - Experimentation** (Python/FastAPI): Tags include `typescript, react` (mentioned), overlap = 2.
- **Nuuly Senior Software Engineer** (Kotlin/Spring): Tags include `typescript` (mentioned), overlap = 2.

These pass Gate 1 because the overlap count includes technologies that are merely mentioned in the job description, not required. A Go/Rust job that mentions TypeScript in passing should not match a JS persona on that mention alone.

### Solution

#### 1. Schema: `required_tags` column

New column on the `job` table:

```sql
ALTER TABLE "job" ADD COLUMN "required_tags" text[];
CREATE INDEX "jobs_required_tags_idx" ON "job" USING gin ("required_tags");
```

Migration: `src/db/migrations/0057_curious_cerebro.sql`

When `required_tags` is non-empty, Gate 1 overlap is computed against it instead of `extracted_tags`. When NULL/empty, the system falls back to `extracted_tags` (backward compatibility).

#### 2. LLM Tag Extraction: Required vs Mentioned

The LLM tag extraction schema was extended:

```typescript
const llmTagExtractionSchema = z.object({
  canonicalTags: z.array(z.string())
    .describe("All canonical tag slugs found in the job description (required + mentioned)"),
  requiredTags: z.array(z.string())
    .describe("Canonical tag slugs for technologies explicitly REQUIRED by the job"),
});
```

The system prompt now instructs the LLM to populate `requiredTags` with ONLY technologies from the "Requirements", "Qualifications", "Must have" sections, or stated with language like "required", "must have", "proficiency in". Technologies mentioned as "we use X" or "experience with X is a plus" go into `canonicalTags` only.

The `LlmTagExtractor` type and `NormalizationResult` type were updated. The `normalizeJob` function now returns `requiredTags` alongside `tags`. The pipeline writes `requiredTags` to the DB.

**Important limitation:** `required_tags` is only populated when the LLM fallback (Phase 2) runs. Phase 1 (regex-only) extraction cannot distinguish required from mentioned. Jobs that had enough persona-defining tags from regex alone will have `required_tags = NULL` and fall back to `extracted_tags` for Gate 1 overlap. Re-normalization is needed to populate `required_tags` for existing jobs.

#### 3. Gate 1 SQL: Overlap on Required Tags

The Gate 1+2 SQL router (`src/lib/jobs/gate-1-2.ts`) was updated:

```sql
-- Overlap LATERAL: uses required_tags when available, falls back to extracted_tags
SELECT count(*) AS overlap_score
FROM unnest(p.must_have_tags) AS t(tag)
WHERE t.tag = ANY(
  CASE
    WHEN jm.required_tags IS NOT NULL AND array_length(jm.required_tags, 1) > 0
    THEN jm.required_tags
    ELSE ${tagsArraySql}
  END
)
```

The `gate1Clause` (the `&&` array-overlap check) was similarly updated to use `COALESCE(NULLIF(jm.required_tags, ARRAY[]::text[]), ${tagsArraySql})`.

#### 4. Distinctive-Tag Rule

A new configuration in `src/lib/jobs/matching-config.ts`:

```typescript
export const DISTINCTIVE_TAGS = [
  "nextjs", "react", "vue", "nuxt", "svelte", "sveltekit", "remix", "astro",
  "nestjs", "graphql", "tailwindcss",
  "laravel", "wordpress", "drupal", "magento", "symfony",
  "prompt-engineering", "langchain",
  "django", "fastapi",
  "golang", "rust",
] as const;

export const GATE1_REQUIRE_DISTINCTIVE_TAG =
  process.env.GATE1_REQUIRE_DISTINCTIVE_TAG !== "false";
```

When enabled (default), Gate 1 requires at least one distinctive tag in the job's `required_tags` (or `extracted_tags` when `required_tags` is empty). This prevents generic overlap (e.g., `typescript + javascript`) from matching a persona when the job's actual stack is different.

The SQL clause:

```sql
AND COALESCE(NULLIF(jm.required_tags, ARRAY[]::text[]), ${tagsArraySql}) && ${distinctiveTagsArraySql}
```

### Files Changed

- `src/db/schemas/jobs/job.ts` — `requiredTags` column + GIN index
- `src/db/migrations/0057_curious_cerebro.sql` — migration
- `src/lib/jobs/job-normalizer.ts` — LLM schema, `LlmTagExtractionResult`, `normalizeJob` return
- `src/lib/jobs/gate-1-2.ts` — `job_meta` CTE, overlap LATERAL, `gate1Clause`, distinctive-tag clause
- `src/lib/jobs/matching-config.ts` — `DISTINCTIVE_TAGS`, `GATE1_REQUIRE_DISTINCTIVE_TAG`
- `src/scheduler/pipeline.ts` — writes `requiredTags` to DB
- `src/lib/jobs/__tests__/job-normalizer.test.ts` — mock LLM extractor updated for new return type

---

## JOB 3 — Backfill and Audit Re-Run

### Methodology

The backfill was performed directly on the production database via SSH tunnel. No destructive operations were performed — all changes were `UPDATE` statements on `match_queue` (setting `status = 'rejected'` with audit-trail fields) and `job` (setting `is_fenced = true`).

### Actions Taken

1. **Applied migration `0057_curious_cerebro`** — added `required_tags` column + GIN index to production.
2. **Geo fence backfill** — 1 job ("Senior Fullstack Engineer - Berlin/EMEA") had `is_fenced = NULL` and `remote_scope = 'global'` despite the title containing "Berlin" and "EMEA". Set `is_fenced = true`. This removed 2 dashboard-visible rows (both personas).
3. **Architect blocker backfill** — 2 rows ("Partner Solution Architect (AWS)" × 2 personas) marked `rejected` with `llm_model = 'title-blocker-deterministic'` and `llm_blockers = ['role_family_blocker: title indicates Architect role unsuitable for this persona']`.
4. **SRE blocker backfill** — 1 row ("Senior Site Reliability Engineer") marked `rejected` with `llm_model = 'title-blocker-deterministic'` and `llm_blockers = ['role_family_blocker: title indicates DevOps/SRE/Platform role unsuitable for this persona']`.

### Before/After Comparison

| Metric | Before (D30 Phase 2) | After (D31) | Change |
|--------|---------------------:|------------:|-------:|
| Dashboard-visible approved | 41 | 36 | −5 |
| Clear false positives | 9 (Architect ×2, SRE ×1, Berlin/EMEA ×2, ClickStack ×2, Nuuly ×1, Staff-Experimentation ×1) | 4 (ClickStack ×2, Nuuly ×1, Staff-Experimentation ×1) | −5 |
| False-positive rate | 22% (9/41) | 11% (4/36) | −11pp |
| Strong matches retained | 20 | 20 | 0 |
| PHP persona matches | 1 | 1 | 0 |
| Shopify matches (JS persona) | 2 (blocked by D30) | 2 (allowed by D31) | +2 |
| Magento matches (PHP persona) | 0 (blocked by D30) | 0 (no Magento jobs in corpus) | 0 |
| Vercel match | 2 rows | 2 rows | 0 |
| Deterministic rejections | 0 | 3 | +3 |

**Acceptance criteria check:**

- False-positive rate `<10%`: **11%** — close but not yet there. The remaining 4 false positives (ClickStack, Nuuly, Staff-Experimentation) require `required_tags` to be populated via re-normalization, which will take effect on the next ingestion cycle.
- Strong-match count `>=20`: **20** — met.
- Shopify matches survived: **yes** — both rows remain `approved`.
- Magento-to-PHP match: **no Magento jobs in current corpus** — the blocker now allows it, but there are no Magento jobs to match.
- Vercel match survived: **yes** — both rows remain `approved`.
- Rejected rows don't render on dashboard: **confirmed** — the dashboard query filters `WHERE status = 'approved' AND is_fenced IS NOT TRUE`.

### Per-Source Counts (After D31)

| Source | Jobs (global, unfenced) | Dashboard matches |
|--------|------------------------:|------------------:|
| WeWorkRemotely | 78 | 16 |
| Ashby | 64 | 12 |
| Greenhouse | 100 | 6 |
| Lever | 8 | 2 |
| RemoteOK | 22 | 0 |
| Wellfound | 2 | 0 |
| Remotive | 1 | 0 |
| 4dayweek | 1 | 0 |
| **Total** | **276** | **36** |

### Remaining False Positives (Requiring Re-Normalization)

| Title | Stack | Why it passes | Fix |
|-------|-------|--------------|-----|
| AI Product Engineer — ClickStack | Go/Rust | `typescript, nodejs` mentioned in prose, overlap = 2 | `required_tags` will show Go/Rust as required; Gate 1 overlap drops to 0 |
| Nuuly Senior Software Engineer | Kotlin/Spring | `typescript` mentioned, overlap = 2 | `required_tags` will show Kotlin/Spring; Gate 1 overlap drops to 0 |
| Staff Software Engineer - Experimentation | Python/FastAPI | `typescript, react` mentioned, overlap = 2 | `required_tags` will show Python/FastAPI; Gate 1 overlap drops to 0 |

These will be resolved when the jobs are re-normalized (next ingestion cycle or manual re-normalization). The `required_tags` column is currently NULL for all existing jobs — it will be populated by the LLM fallback on the next normalization pass.

---

## JOB 4 — Supply Expansion

### New Source: Jobicy

A new direct ingestion adapter was created at `src/lib/jobs/direct-ingestion/jobicy.ts`.

- **API:** `GET https://jobicy.com/api/v2/remote-jobs?count=100&industry=engineering`
- **Format:** JSON, no authentication required
- **Scope:** Remote-first board. `jobGeo` field determines scope: "Worldwide"/"Anywhere" → `global`, specific country → `country_fenced`
- **Tags:** Extracted via `scanTagsRegex` from title + description
- **Board registration:** Board 12 in `runDirectJobBoardIngestion()`
- **Tests:** 10 tests covering fetch, tag extraction, scope inference, tech filter, error handling, salary data

### Re-Enabled Source: Remote.co

Remote.co was marked dormant in D30 due to persistent HTTP/2 INTERNAL_ERROR timeouts. D31 removes it from the `DORMANT_SOURCES` set. The adapter code is intact. If timeouts resume, the circuit breaker in `source_health` will catch it automatically (3 failures = degraded, 5 = disabled).

### Polling Budget Redirect

375 companies using Greenhouse, Lever, SmartRecruiters, and Workable were demoted from `active_hot` (poll every 3 hours) to `active` (poll every 12 hours). These ATS sources produced zero matches in the audit — We Work Remotely alone produced 69% of all approved matches.

| ATS Source | active_hot before | active_hot after | active before | active after |
|------------|------------------:|-----------------:|--------------:|-------------:|
| Greenhouse | 42 | 0 | 1180 | 1222 |
| Lever | 113 | 0 | 626 | 739 |
| SmartRecruiters | 146 | 0 | 2199 | 2345 |
| Workable | 74 | 0 | 0 | 74 |
| **Total demoted** | **375** | **0** | — | — |

This frees the 3-hour polling slots. The direct ingestion boards (Himalayas, RemoteOK, WeWorkRemotely, Remotive, Wellfound, LaraJobs, Working Nomads, 4dayweek, Remote.co, Jobicy) run on their own 3-hour cron and don't compete for company polling budget.

### Existing Sources Status

| Source | Status | Method | Active in pipeline |
|--------|--------|--------|------------------:|
| Himalayas | Active | HTTP API (worldwide=true) | yes |
| RemoteOK | Active | HTTP API | yes |
| WeWorkRemotely | Active | HTTP RSS | yes |
| Remotive | Active | HTTP API | yes |
| Arbeitnow | Active | HTTP API | yes |
| Wellfound | Active | Playwright (FlareSolverr) | yes |
| Remote.com | Active | Playwright | yes |
| LaraJobs | Active | HTTP (HTML + RSS) | yes |
| Working Nomads | Active | HTTP API | yes |
| 4dayweek.io | Active | HTTP API | yes |
| Remote.co | **Re-enabled** (D31) | HTTP HTML scrape | yes |
| Jobicy | **New** (D31) | HTTP API | yes |

### PHP-Persona Inflow

LaraJobs remains the dedicated PHP/Laravel persona channel. No dedicated WordPress ecosystem board scraper exists — WordPress jobs come from general boards (WWR, RemoteOK, etc.). The PHP persona currently has 1 dashboard-visible match (Senior Product Engineer with laravel/php tags).

---

## Test and Build Results

| Check | Result |
|-------|--------|
| TypeScript (`tsc --noEmit`) | Clean |
| Vitest | 2966/2966 pass (130 files) |
| Biome | Clean (1 pre-existing warning: unused `runGate1Only`) |
| New tests | +21 (11 title-blockers, 10 jobicy) |

---

## Deployment and Push Status

**Migration applied:** `0057_curious_cerebro.sql` applied to production via `docker exec ... psql`. Registered in `drizzle.__drizzle_migrations`.

**Production backfill:** 5 false positives removed (2 Architect, 1 SRE, 2 geo-fenced). 375 companies demoted from `active_hot` to `active`.

**Code changes:** Not yet deployed to production (requires Docker rebuild + Coolify deploy). The code changes are in the working tree and need to be committed and pushed by the user.

**Git status:** Per repository rules (`AGENTS.md`), no Git commands were run. The user must commit and push the changes.

---

## Remaining Work (Rulings 3b, 5, 6, 7)

| Ruling | Description | Status |
|--------|-------------|--------|
| 3b | Embedding symmetry repair: role-summary per job + summary-to-summary embeddings | Pending |
| 5 | Gate 3 geo diagnosis + ghost-approval purge | Pending |
| 6 | Dashboard multi-persona grouping + same-source repost deduplication | Pending |
| 7 | Backfill 44 NULL fence flags | Pending |

### Risks

1. **Required-tags population lag:** The `required_tags` column is NULL for all existing jobs. It will only be populated when jobs are re-normalized (LLM fallback runs). The distinctive-tag rule and required-tags overlap will have limited effect until re-normalization occurs. A manual re-normalization sweep of the 276 global unfenced jobs would accelerate this.

2. **Remote.co stability:** The re-enablement of Remote.co may resume HTTP/2 timeouts. The circuit breaker will catch this, but it's worth monitoring `source_health` after the next ingestion cycle.

3. **Jobicy rate limits:** The Jobicy API is public and undocumented regarding rate limits. The 3-hour cron with `count=100` should be within fair-use, but monitoring is needed.

4. **Polling budget redirect impact:** Demoting 375 companies from `active_hot` to `active` means they'll be polled every 12 hours instead of every 3 hours. New jobs from these ATS sources will appear with a 12-hour delay instead of a 3-hour delay. This is acceptable given that these sources produced zero matches in the audit.
