# Corpus-Persona Alignment Session — Implementation Handoff

> **Purpose:** This document is the complete context handoff for a dedicated implementation session to resolve the corpus-persona mismatch identified in the July 6 2026 audit. The v2 corpus expansion strategy (`docs/governing/company-corpus-expansion-new.md`) was implemented in code (commit `15b3b6b`, July 5 2026) but its enforcement layer was never activated. This session activates it, fills the data gaps, and adds the missing frontend-targeted discovery sources.
>
> **Date:** July 6, 2026
>
> **Governing documents (read in full before starting):**
> 1. `docs/governing/company-corpus-expansion-new.md` — v2 corpus expansion strategy (locked, 8-round red-team validated)
> 2. `docs/governing/vectormatch-blueprint.md` — application blueprint (update this at session close)
> 3. `docs/governing/VectorMatchTechicalImplementation.md` — TDD (update this at session close)
> 4. `AGENTS.md` — project rules (strict stack, testing, DB mutation rules)
> 5. `docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md` — v2 implementation handoff (Sessions 1-3, all marked COMPLETED)
>
> **Context document:** `docs/reports/EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md` §1.2 (target market), §1.4 (key challenges)

---

## Session Goal

**Activate the v2 corpus expansion enforcement layer and add frontend-targeted discovery sources so the corpus aligns with the mission: "Software engineers and web developers seeking curated job opportunities, with emphasis on remote-first roles at startups and smaller companies."**

The v2 strategy code exists. The scoring matrix is coded but never run. The tier reassignment is prescribed but not enforced. The remote-scope extractor is implemented but overwhelmed. The funding-signal sources are implemented but low-volume. This session closes those gaps.

---

## The Problem (Audit Findings — July 6 2026)

### Corpus Composition

The corpus is dominated by backend/data/infrastructure roles, not frontend/web developer roles:

- **Top tags:** python (1696), aws (1029), kubernetes (857), ci-cd (821), c (803), go (782), sql (713), linux (588), java (555), docker (548), cpp (513), azure (484)
- **Frontend tags:** javascript (400), react (400), typescript (369), graphql (139) — ~4x fewer than backend
- **Top 25 active_hot companies:** Anduril (defense, 1253 jobs, 0 frontend), Databricks (data, 531, 0), Anthropic (AI, 184, 0), Zscaler (security, 167, 0), Datadog (monitoring, 151, 0), etc. — 18 of 25 have ZERO frontend jobs
- **Gate routing results (2991 jobs):** 54.1% rejected by Gate 0.5 (geo-fencing — correct), 45.0% passed Gate 0.5 but no persona overlap in Gate 1+2, 1.0% passed Gate 1+2, 0% approved by Gate 3

### Root Cause: 6 Execution Gaps in the v2 Strategy

The v2 strategy (`company-corpus-expansion-new.md`) correctly identifies these problems and prescribes solutions. The code was implemented (commit `15b3b6b`) but **never activated**:

| # | Gap | v2 Strategy Says | Code Status | Data Status |
|---|---|---|---|---|
| 1 | Company scoring matrix never run | "Persist `company_size_score`... computed at normalization time" | `company-scorer.ts` (455 lines) implemented | `company_size_score` is NULL for all 10,075 rows |
| 2 | Tier reassignment not enforced | "`active_hot` if score > 15, `dormant` if score < -20" | `applyCompanyTier()` implemented | Tiers still based on old logic (approved matches + recency) |
| 3 | Employee count not populated | "Startup filter: `employee_count < 50` enforced before registry insert" | `employee_count` column exists | NULL for 100% of 10,096 companies |
| 4 | Remote-scope extraction overwhelmed | "Nightly resurrection sweep" processes unknown jobs | `nightlyResurrectionSweep` runs at 3am, 500/night | 3,217 of 3,402 normalized jobs (94.6%) are `remote_scope = 'unknown'` |
| 5 | Funding-signal sources low volume | "Replace bulk undifferentiated seeders with funding-signal-driven discovery" | `funding-signal-rss.ts` + `github-events-probe.ts` implemented | GitHub Events Probe watches only 10 orgs; Wayback CDX still #1 source (5,413 companies, 52%) |
| 6 | Circuit breaker blind to unknown bucket | "Unknown sub-floor: `unknown / (global + country_fenced + unknown) ≤ 30%`" | `circuit-breaker.ts` (920 lines) implemented, registered | Unknown sub-floor is 99.2% — breaker should be triggering but may not be evaluating correctly |

### Additional Gap Not Covered by v2 Strategy

| # | Gap | Description |
|---|---|---|
| 7 | No frontend-targeted discovery | Brave Search and HN Algolia queries are tech-stack-agnostic (`site:boards.greenhouse.io` finds ANY company). No source specifically targets companies hiring frontend developers. The BigQuery seeder is the only frontend-filtered source (373 companies, 3% of corpus). |

---

## Implementation Tasks (Priority Order)

### P0-1: Company Scorer Backfill (Minutes, One-Time Script)

**What:** Run `scoreAndPersistCompany()` from `src/lib/jobs/company-scorer.ts` against all 10,096 companies in the `company` table.

**Why:** The scoring matrix code exists but has never been run. `company_size_score` is NULL for all 10,075 rows in `company_quality_score`. The big-tech registry (`src/lib/jobs/company-enrichment/big-tech-registry.ts`, ~120 entries) is the fallback for `employee_count` resolution when the column is NULL.

**How:**
1. Create `scripts/backfill-company-scores.ts` (follow the pattern of `scripts/direct-normalize-backlog.ts` — use `NODE_OPTIONS='--conditions react-server'` compat flag, batch processing with concurrency limit)
2. Query all companies: `SELECT id, canonical_name, ats_slug, company_name, employee_count, is_agency, is_public, discovery_source, discovered_at FROM company`
3. For each company, call `buildScoringInputFromCompany(row)` then `scoreAndPersistCompany(input)`
4. Process in batches of 50-100 with a concurrency limiter (the function does 2 DB writes per company: UPSERT to `company_quality_score` + UPDATE to `company.tier`)
5. Log summary: companies scored, tier changes (X promoted to active_hot, Y demoted to dormant, Z flagged dead)

**Expected outcome:**
- ~10,000 companies scored
- Defense/big-tech companies (Anduril, Databricks, Anthropic, Zscaler, Datadog, etc.) get negative scores → demoted to `dormant`
- YC/VC-funded startups get positive scores → promoted to `active_hot`
- `company_size_score` populated for all companies
- `company.tier` updated to match scoring matrix recommendations

**Key files:**
- `src/lib/jobs/company-scorer.ts` — `scoreAndPersistCompany()`, `buildScoringInputFromCompany()`, `computeCompanySizeScore()`
- `src/lib/jobs/company-enrichment/big-tech-registry.ts` — fallback for `employee_count` and `is_public`
- `src/db/schemas/jobs/company.ts` — company table schema
- `src/db/schemas/jobs/companyQualityScore.ts` — `company_size_score` column

**Verification:**
```sql
-- After backfill:
SELECT COUNT(*) FILTER (WHERE company_size_score IS NOT NULL) AS scored,
       AVG(company_size_score) AS avg_score,
       MIN(company_size_score) AS min_score,
       MAX(company_size_score) AS max_score
FROM company_quality_score;

SELECT tier, COUNT(*) AS cnt FROM company GROUP BY tier ORDER BY cnt DESC;
```

### P0-2: Enforce Tier Reassignment (SQL, After P0-1)

**What:** The `applyCompanyTier()` function in P0-1 already updates `company.tier` during scoring. Verify the result and manually correct any edge cases.

**Why:** The v2 strategy prescribes `active_hot` if score > 15, `dormant` if score < -20. The `applyCompanyTier()` function handles this, but it does NOT override manually-set `dead` tier (except for agencies). Verify that defense/infrastructure companies are now in `dormant` and startups are in `active_hot`.

**How:**
1. After P0-1 completes, run the verification SQL above
2. Check that top defense/infrastructure companies are now `dormant`:
   ```sql
   SELECT ats_slug, company_name, tier, cqs.company_size_score
   FROM company c
   JOIN company_quality_score cqs ON cqs.company_id = c.id
   WHERE c.ats_slug IN ('andurilindustries', 'databricks', 'anthropic', 'zscaler', 'datadog', 'nebius', 'coreweave', 'trueanomalyinc', 'tenstorrent', 'samsara')
   ORDER BY cqs.company_size_score ASC;
   ```
3. If any are still `active_hot`, investigate why (the scorer may not have enough signals — `employee_count` is NULL and the company may not be in the big-tech registry)

**Key files:**
- `src/lib/jobs/company-scorer.ts` — `applyCompanyTier()` (lines 367-392)
- `src/db/schemas/jobs/company.ts` — `tier` column, `companyTierEnum`

### P0-3: Bulk Remote-Scope Classification (Script, Similar to direct-normalize-backlog.ts)

**What:** Run the remote-scope extractor (`extractRemoteScope()` from `src/lib/jobs/remote-scope-extractor.ts`) against all 3,217 jobs with `remote_scope = 'unknown'` and `normalized_at IS NOT NULL`.

**Why:** 94.6% of normalized jobs have `remote_scope = 'unknown'`. The nightly resurrection sweep only processes 500/night — it would take 6.4 nights to clear the backlog, and new jobs arrive faster. The unknown bucket masks the corpus-ratio circuit breaker (the breaker checks `unknown / (global + country_fenced + unknown) ≥ 30%` — at 99.2% it should be triggering, but the breaker may not be evaluating correctly because the jobs were normalized before the v2 extractor existed).

**How:**
1. **A script already exists** at `scripts/backfill-remote-scope.ts` but it uses the OLD `inferRemoteScope()` (Step 1 regex only, no LLM fallback). It was created before the v2 `extractRemoteScope()` was implemented.
2. **Update the existing script** to use the v2 `extractRemoteScope()` from `src/lib/jobs/remote-scope-extractor.ts` instead of the inlined `inferRemoteScope()`. The v2 extractor runs Step 1 (deterministic regex) then Step 2 (LLM via gpt-4o-mini) if Step 1 is inconclusive.
3. Query: `SELECT id, ats_source, raw_json, fallback_title, normalized_text FROM job WHERE remote_scope = 'unknown' AND normalized_at IS NOT NULL ORDER BY detected_at DESC`
4. For each job, call `extractRemoteScope(atsSource, rawJson, fallbackTitle)` — this runs Step 1 (deterministic regex) then Step 2 (LLM via gpt-4o-mini) if Step 1 is inconclusive
5. Update `job.remote_scope`, `job.location_countries` with the result
6. Process with concurrency limit 10-15 (LLM calls are rate-limited)
7. Log summary: jobs classified as global / country_fenced / region_fenced / onsite / undetermined

**Cost estimate:** ~3,200 jobs × ~40% needing LLM (Step 1 resolves ~60% deterministically) = ~1,280 LLM calls × $0.0003 = ~$0.38

**Key files:**
- `src/lib/jobs/remote-scope-extractor.ts` — `extractRemoteScope()` (line 568), `step1AtsNativeTrust()`, `step1RegexHardSignals()`, `extractScopeLLM()`
- `src/db/schemas/jobs/job.ts` — `remoteScope`, `locationCountries` columns
- `scripts/direct-normalize-backlog.ts` — pattern to follow for the script

**Verification:**
```sql
SELECT remote_scope::text, COUNT(*) AS cnt,
       ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM job WHERE normalized_at IS NOT NULL) * 100, 1) AS pct
FROM job WHERE normalized_at IS NOT NULL
GROUP BY remote_scope ORDER BY cnt DESC;
```

### P0-4: Normalize 562 New Unnormalized Jobs (Script, Existing)

**What:** Run `scripts/direct-normalize-backlog.ts` to normalize the 562 jobs that have been ingested since the last normalization run but not yet normalized.

**Why:** The batch poll resumed after the Inngest queue stall was resolved. 562 new jobs have been ingested (22 of which have frontend titles). They need to be normalized before they can enter the matching pipeline.

**How:**
```bash
NODE_OPTIONS='--conditions react-server' npx tsx scripts/direct-normalize-backlog.ts --limit 600 --concurrency 15
```

**After normalization, run gate routing:**
```bash
NODE_OPTIONS='--conditions react-server' npx tsx scripts/direct-gate-routing.ts --limit 600 --concurrency 15
```

**Verification:**
```sql
SELECT COUNT(*) FILTER (WHERE normalized_at IS NULL AND status = 'active') AS unnormalized_active
FROM job;
-- Should be 0 or near-0 after the script
```

### P1-1: Populate Employee Count from Big-Tech Registry (Script)

**What:** For companies in the big-tech registry, populate `company.employee_count` and `company.is_public` from the registry values. For companies NOT in the registry, attempt to infer employee count from the discovery source metadata (YC directory companies are < 50 by definition, VC portfolio companies are typically < 500).

**Why:** The v2 strategy's startup filter (`employee_count < 50`) cannot be enforced because `employee_count` is NULL for 100% of companies. The big-tech registry has ~120 entries with employee counts — populating these will at least classify the big-tech companies correctly. For YC/VC-sourced companies, set a conservative estimate (e.g., 50 for YC, 250 for VC portfolio) so the startup filter can function.

**How:**
1. Create `scripts/backfill-employee-count.ts`
2. For each company in the big-tech registry, UPDATE `company.employee_count` and `company.is_public` from the registry
3. For companies with `discovery_source IN ('yc_directory', 'github_probe', 'funding_signal')`, set `employee_count = 50` (conservative — YC companies are < 50 by definition)
4. For companies with `discovery_source = 'vc_portfolio'`, set `employee_count = 250` (conservative — VC portfolio companies are typically < 500)
5. Re-run P0-1 (company scorer backfill) to update scores with the new employee count data

**Key files:**
- `src/lib/jobs/company-enrichment/big-tech-registry.ts` — `BIG_TECH_REGISTRY` constant
- `src/db/schemas/jobs/company.ts` — `employeeCount`, `isPublic` columns

### P1-2: Expand GitHub Events Probe Org List (Code Change)

**What:** Expand `YC_VC_FUNDED_ORGS` in `src/lib/jobs/seeders/daily-sources/github-events-probe.ts` from 10 orgs to 100+ frontend-ecosystem orgs.

**Why:** The GitHub Events Probe is the v2 strategy's primary funding-signal discovery source. With only 10 orgs (several of which are infrastructure: Fermyon, Snaplet, Wundergraph), it produces minimal volume. Expanding to frontend-ecosystem orgs will discover companies that are actively building frontend tools and likely hiring frontend developers.

**How:**
1. Edit `src/lib/jobs/seeders/daily-sources/github-events-probe.ts`
2. Expand `YC_VC_FUNDED_ORGS` array to include 100+ orgs, organized by category:
   - **Frontend frameworks/tools:** vercel (already), facebook/react, vuejs, angular, sveltejs, astro-build, remix-run, gatsbyjs, solidjs-dot-io, tanstack, shadcn-ui
   - **Backend-for-frontend:** prisma, trpc, graphql, apollographql, urql-graphql, relayjs
   - **Full-stack frameworks:** nuxt, nestjs, fastify, denoland, oven-sh (Bun)
   - **Dev tooling (frontend-adjacent):** storybookjs, formatjs, pmndrs (zustand/jotai), riot-arr (valtio), acdlite (react-query), tailwindlabs, vitejs, evanw (esbuild)
   - **YC/VC-funded startups (frontend-focused):** calcom (already), dubinc (already), unkeydev (already), resend, triggerdotdev, inngest, neon, clerk, shadcn, tiagob (tRPC), pingdotgg (Zag.js), pnpm, turborepo, vercel/next.js, vercel/swr, vercel/ai
   - **Design/frontend SaaS:** figma, linear, notionhq, posthog, logto, ory, supabase (already)
3. Group them with comments by category for maintainability
4. Run the seeder manually to verify: `NODE_OPTIONS='--conditions react-server' npx tsx -e "import { runGithubEventsProbe } from './src/lib/jobs/seeders/daily-sources/github-events-probe'; runGithubEventsProbe().then(console.log)"`

**Key files:**
- `src/lib/jobs/seeders/daily-sources/github-events-probe.ts` — `YC_VC_FUNDED_ORGS` array (line 54)

### P1-3: Add Frontend-Targeted Brave Search Queries (Code Change)

**What:** Add frontend-specific search queries to `src/lib/jobs/seeders/batch-sources/brave-search.ts` alongside the existing site-scoped queries.

**Why:** Currently Brave Search sends `site:boards.greenhouse.io` etc. — this finds ANY company with a Greenhouse board, regardless of tech stack. Adding frontend keyword filters will discover companies whose ATS postings specifically mention frontend technologies.

**How:**
1. Edit `src/lib/jobs/seeders/batch-sources/brave-search.ts`
2. Add a second query type: `site:{ats-domain} ("React" OR "Next.js" OR "TypeScript" OR "Frontend" OR "Vue.js" OR "Angular" OR "Svelte" OR "GraphQL")`
3. Use Brave's `freshness=pd` (past day) parameter for these queries to find recently-posted frontend jobs
4. The existing `ATS_SEARCH_DOMAINS` array can be reused — just add a `querySuffix` parameter for the frontend keywords
5. Increase `RESULTS_PER_QUERY` from 20 to 30 for frontend queries (more results = more frontend companies)
6. Tag discovered companies with `discovery_source = 'brave_search'` (existing) — no new enum value needed

**Key files:**
- `src/lib/jobs/seeders/batch-sources/brave-search.ts` — `ATS_SEARCH_DOMAINS` (line 46), query builder (line 128)

### P1-4: Deprioritize Wayback CDX (Config Change)

**What:** Reduce the Wayback CDX seeder's frequency or disable it as a primary discovery source, per the v2 strategy's directive to "replace bulk undifferentiated seeders."

**Why:** Wayback CDX is the #1 discovery source (5,413 companies, 52% of all discovered). It finds companies by scanning the Wayback Machine for ATS domains — no tech-stack filter. This is the primary source of defense/infrastructure companies in the corpus. The v2 strategy explicitly says to replace it with funding-signal-driven discovery.

**How:**
1. Find the Wayback CDX Inngest function in `src/inngest/functions.ts` (search for `wayback` or `sitemapProbe` or the batch source that produces `wayback_cdx` discovery_source)
2. Change its cron trigger from quarterly/monthly to disabled, OR reduce it to a very low frequency (e.g., every 6 months)
3. Do NOT delete the code — it's a valid source for occasional bulk refresh
4. The existing 5,413 Wayback-discovered companies remain in the DB; they'll be deprioritized to `dormant` by P0-1 (company scorer backfill) since most have negative scores (no source-origin bonus, no employee count data, old discovery date)

**Key files:**
- `src/inngest/functions.ts` — find the Wayback CDX/sitemap probe function and its cron trigger

### P2-1: Run BigQuery Seeder (Manual Script)

**What:** Run the BigQuery seeder manually to discover new frontend-tech companies.

**Why:** The BigQuery seeder is the only discovery source that filters by frontend tech stacks (Next.js, React, Vue, Angular, Svelte, TypeScript, Tailwind, PHP, Laravel, etc.). It has only discovered 373 companies because it runs monthly. Running it now will discover companies that have added frontend tech stacks since the last crawl.

**How:**
```bash
# Ensure GOOGLE_APPLICATION_CREDENTIALS_B64 is set in .env
NODE_OPTIONS='--conditions react-server' npx tsx scripts/seed-bigquery.ts
```

**Note:** The BigQuery seeder only detects Greenhouse, Lever, and Workable (Wappalyzer doesn't detect Ashby/SmartRecruiters/Recruitee). This is a known limitation — the HN and Brave Search sources cover the other ATS platforms.

**Key files:**
- `scripts/seed-bigquery.ts` — manual script wrapper
- `src/lib/jobs/seeders/bigquery-seeder.ts` — `buildBigQuerySql()`, domain logic

### P2-2: Build Greenhouse/Lever Frontend Job Scanner (New Source — Medium Effort)

**What:** Create a new discovery source that scans the Greenhouse and Lever public job board APIs directly for frontend jobs, then extracts the company slug.

**Why:** This inverts the discovery model: instead of "find companies with ATS → poll all their jobs → hope some are frontend", it becomes "find frontend jobs → extract the company → add to polling." This is the highest-impact new source for the mission. The research report confirms 350-450 new Next.js-specific listings per weekday globally.

**How:**
1. Create `src/lib/jobs/seeders/daily-sources/frontend-job-scanner.ts`
2. **Greenhouse approach:** Greenhouse doesn't have a global search API, but individual board endpoints return all jobs. Instead, use Brave Search with `site:boards.greenhouse.io/jobs "React" OR "Next.js" OR "TypeScript" OR "Frontend"` to find specific Greenhouse job URLs, then extract the slug from the URL pattern
3. **Lever approach:** Same — `site:jobs.lever.co "React" OR "Next.js" OR "TypeScript" OR "Frontend"`
4. **Ashby approach:** `site:jobs.ashbyhq.com "React" OR "Next.js" OR "TypeScript" OR "Frontend"`
5. Extract the company slug from the URL (e.g., `boards.greenhouse.io/companyname/jobs/123` → slug = `companyname`)
6. Insert into `company` table with `discovery_source = 'frontend_job_scanner'` (add to `discoverySourceEnum`)
7. Set `tier = 'active_hot'` (these companies have confirmed frontend jobs)
8. Create an Inngest function wrapper with a daily cron trigger
9. Register in `src/app/api/inngest/route.ts`

**Alternative (simpler):** Instead of a new source, extend the Brave Search seeder (P1-3) with job-level queries (not just company-level). The Brave Search results already contain job URLs — parse them and extract the slug.

**Key files:**
- `src/lib/jobs/seeders/batch-sources/brave-search.ts` — existing Brave Search infrastructure
- `src/lib/jobs/seeders/url-parser.ts` — URL parsing for ATS slug extraction
- `src/db/schemas/jobs/enums.ts` — `discoverySourceEnum` (add `frontend_job_scanner` if new source)
- `src/inngest/functions.ts` — Inngest function wrapper
- `src/app/api/inngest/route.ts` — function registration

### P2-3: Verify Circuit Breaker Is Evaluating Correctly (Investigation)

**What:** After P0-3 (remote-scope backfill), verify that the circuit breaker's unknown sub-floor check is actually evaluating and triggering the correct actions.

**Why:** The unknown sub-floor check (`unknown / (global + country_fenced + unknown) ≥ 30%`) is at 99.2% — it should be triggering "pause sources with >40% unknown yield, force LLM re-classification of backlog." But it's unclear whether the breaker is actually evaluating this. The `breakerCheck` Inngest function was previously not registered in the route (fixed by post-implementation audit), but we should verify it's actually running and evaluating the unknown sub-floor.

**How:**
1. Check Inngest dashboard for `breakerCheck` function runs — is it executing?
2. Read `src/lib/jobs/circuit-breaker.ts` — find the unknown sub-floor evaluation function
3. Check if it's querying the correct bucket (it should count `remote_scope = 'unknown'` jobs, not `remote_scope = 'undetermined'`)
4. After P0-3, the unknown count should drop significantly — verify the breaker responds accordingly
5. Check the `alerts` table for any v2 breaker alerts:
   ```sql
   SELECT * FROM alerts WHERE alert_type IN ('v2_breaker_per_source', 'v2_breaker_corpus_ratio', 'v2_source_banned') ORDER BY created_at DESC;
   ```

**Key files:**
- `src/lib/jobs/circuit-breaker.ts` — unknown sub-floor evaluation
- `src/inngest/circuit-breaker-functions.ts` — `breakerCheck` Inngest function
- `src/app/api/inngest/route.ts` — verify `breakerCheck` is in the `serve()` functions array

---

## Verification (End of Session)

After all tasks are complete, run these verification queries:

### 1. Company Scoring
```sql
SELECT COUNT(*) FILTER (WHERE company_size_score IS NOT NULL) AS scored,
       COUNT(*) FILTER (WHERE company_size_score > 0.15) AS active_hot_recommended,
       COUNT(*) FILTER (WHERE company_size_score < -0.20) AS dormant_recommended
FROM company_quality_score;
```

### 2. Tier Distribution
```sql
SELECT tier, COUNT(*) AS cnt, SUM(active_job_count) AS active_jobs
FROM company GROUP BY tier ORDER BY cnt DESC;
-- Expect: dormant should be much larger, active_hot should be smaller (startups only)
```

### 3. Remote Scope Distribution
```sql
SELECT remote_scope::text, COUNT(*) AS cnt,
       ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM job WHERE normalized_at IS NOT NULL) * 100, 1) AS pct
FROM job WHERE normalized_at IS NOT NULL
GROUP BY remote_scope ORDER BY cnt DESC;
-- Expect: unknown should be < 30%, global + country_fenced should be the majority
```

### 4. Frontend Job Ratio
```sql
SELECT
  COUNT(*) AS total_normalized,
  COUNT(*) FILTER (WHERE extracted_tags && ARRAY['typescript','react','nextjs','javascript','vue','angular','svelte','graphql','tailwindcss','css','html','frontend']::text[]) AS frontend_jobs,
  ROUND(COUNT(*) FILTER (WHERE extracted_tags && ARRAY['typescript','react','nextjs','javascript','vue','angular','svelte','graphql','tailwindcss','css','html','frontend']::text[])::numeric / COUNT(*) * 100, 1) AS frontend_pct
FROM job WHERE normalized_at IS NOT NULL AND status = 'active';
-- Expect: frontend_pct should increase as new frontend-targeted sources produce companies
```

### 5. Unnormalized Jobs
```sql
SELECT COUNT(*) AS unnormalized FROM job WHERE normalized_at IS NULL AND status = 'active';
-- Should be 0 or near-0
```

### 6. Circuit Breaker Alerts
```sql
SELECT * FROM alerts WHERE alert_type IN ('v2_breaker_per_source', 'v2_breaker_corpus_ratio', 'v2_source_banned') ORDER BY created_at DESC;
-- Should show alerts if the breaker is correctly evaluating the corpus ratio
```

### 7. Test Suite
```bash
npm run test        # All Vitest tests pass
npx tsc --noEmit    # 0 TypeScript errors
npx biome check --write  # 0 lint errors
```

---

## MANDATORY: Document Updates at Session Close

**This is critical.** Context continuity between sessions is a project priority. At the end of this session, you MUST update the two main governing documents with all fixes, decisions, and status changes made during this session:

### 1. Update `docs/governing/vectormatch-blueprint.md`

Update the following sections:
- **Module B section (Build Sequence item 8):** Add a new sprint entry documenting the corpus alignment session. Include:
  - What was activated (company scorer backfill, tier reassignment, remote-scope backfill)
  - What was added (frontend-targeted Brave Search queries, expanded GitHub Events Probe org list, frontend job scanner)
  - What was deprioritized (Wayback CDX)
  - Key metrics before/after (tier distribution, remote_scope distribution, frontend job ratio)
  - Update the `[Status: ...]` tags for any components that changed status
- **Build Sequence:** Update status tags for any items that changed

### 2. Update `docs/governing/VectorMatchTechicalImplementation.md`

Update the relevant sections:
- **Module B section:** Document the new discovery sources, the activated enforcement layer, and the data backfills
- **Module C section:** Document the remote-scope backfill and its impact on Gate 0.5
- **Any schema changes:** If new enum values or columns were added, document them

### 3. Update `docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md`

Add a "Post-Activation Session" section documenting:
- What was activated from the v2 strategy
- What was added beyond the v2 strategy (frontend-targeted sources)
- Verification results (the SQL queries above)
- Any deviations from the v2 governing document (with rationale)

### 4. Update `docs/governing/company-corpus-expansion-new.md`

If any decisions were made that extend or modify the v2 strategy (e.g., adding frontend-targeted Brave Search queries that weren't in the original strategy), add them to the "Open Tuning Items" section with `[IMPLEMENTED]` status.

### 5. Update `AGENTS.md`

If any new build commands, test commands, or operational procedures were added (e.g., `npm run backfill:scores`), add them to the appropriate section.

---

## Critical Rules (from AGENTS.md)

1. **NEVER run Git commands** — no `git add`, `git commit`, `git push`, etc. All version control is the user's responsibility.
2. **NEVER perform destructive operations without explicit user confirmation** — no `rm -rf`, no `DROP TABLE`, no `DELETE FROM` without WHERE, no `TRUNCATE`.
3. **Database mutations in tests are prohibited** unless explicitly approved. Use mocks.
4. **Use Biome** (not ESLint/Prettier) for all formatting: `npx biome check --write`
5. **TypeScript strict mode** — 0 errors required: `npx tsc --noEmit`
6. **All new Inngest functions must be registered** in `src/app/api/inngest/route.ts` `serve({ functions: [...] })` array
7. **Follow existing script patterns** — use `NODE_OPTIONS='--conditions react-server'` for scripts that import server modules
8. **Test new code** — add Vitest tests for any new logic (scoring, extraction, discovery). Follow the `vitest-best-practices` skill.
9. **Shadcn/ui components** — never modify files under `src/components/ui/`
10. **Tailwind CSS v4** — no `tailwind.config.js`, use `@theme` in CSS

---

## File Reference Index

### Key Source Files (Read Before Starting)

| File | Purpose |
|---|---|
| `src/lib/jobs/company-scorer.ts` | Company scoring matrix — `scoreAndPersistCompany()`, `buildScoringInputFromCompany()` |
| `src/lib/jobs/company-enrichment/big-tech-registry.ts` | ~120 big-tech entries for employee count fallback |
| `src/lib/jobs/remote-scope-extractor.ts` | Remote scope extraction — `extractRemoteScope()` |
| `src/lib/jobs/job-normalizer.ts` | Job normalization pipeline (integrates remote-scope extractor) |
| `src/lib/jobs/circuit-breaker.ts` | 5-tier circuit breaker evaluation |
| `src/lib/jobs/seeders/daily-sources/github-events-probe.ts` | GitHub Events Probe — `YC_VC_FUNDED_ORGS` array (expand this) |
| `src/lib/jobs/seeders/batch-sources/brave-search.ts` | Brave Search seeder — add frontend queries here |
| `src/lib/jobs/seeders/bigquery-seeder.ts` | BigQuery seeder — frontend tech stack filter (already correct) |
| `src/lib/jobs/poller/tier-queries.ts` | `getBatchForTier()` — batch poll query |
| `src/inngest/functions.ts` | All Inngest functions (52+) — find Wayback CDX cron here |
| `src/inngest/circuit-breaker-functions.ts` | `breakerCheck` + `sourceBanRecoveryCheck` Inngest functions |
| `src/app/api/inngest/route.ts` | Inngest serve handler — all functions must be registered here |
| `src/db/schemas/jobs/company.ts` | Company table schema |
| `src/db/schemas/jobs/job.ts` | Job table schema (remote_scope, location_countries) |
| `src/db/schemas/jobs/enums.ts` | Enum definitions (discoverySourceEnum, remoteScopeEnum) |
| `src/db/schemas/jobs/companyQualityScore.ts` | company_size_score column |

### Key Script Files (Patterns to Follow)

| File | Purpose |
|---|---|
| `scripts/direct-normalize-backlog.ts` | Pattern for backfill scripts (NODE_OPTIONS, concurrency, batching) |
| `scripts/direct-gate-routing.ts` | Pattern for gate routing scripts |
| `scripts/seed-bigquery.ts` | BigQuery seeder manual script |
| `scripts/backfill-remote-scope.ts` | **EXISTS but uses old Step-1-only logic** — must be updated to use v2 `extractRemoteScope()` (Step 1 + Step 2 LLM) |

### Governing Documents (Update at Session Close)

| File | Purpose |
|---|---|
| `docs/governing/vectormatch-blueprint.md` | Application blueprint — update Module B section + Build Sequence |
| `docs/governing/VectorMatchTechicalImplementation.md` | TDD — update Module B/C sections |
| `docs/governing/company-corpus-expansion-new.md` | v2 strategy — update Open Tuning Items |
| `docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md` | v2 implementation handoff — add Post-Activation section |
| `AGENTS.md` | Project rules — add new commands if any |

---

## Expected Outcome

After this session:

1. **Company scoring matrix is active** — all 10,096 companies scored, `company_size_score` populated, tiers reassigned
2. **Defense/infrastructure companies demoted** — Anduril, Databricks, Anthropic, Zscaler, Datadog, etc. moved to `dormant` tier (polled weekly instead of every 2h)
3. **Startups promoted** — YC/VC-funded companies moved to `active_hot` (polled every 2h)
4. **Remote scope classified** — 3,217 unknown jobs classified, unknown bucket < 30%
5. **Circuit breaker unblinded** — corpus-ratio breaker can now evaluate the real global/total ratio
6. **Frontend discovery sources active** — Brave Search queries target frontend keywords, GitHub Events Probe watches 100+ frontend orgs
7. **Wayback CDX deprioritized** — no longer the dominant discovery source
8. **562 new jobs normalized** — pipeline is current, no backlog
9. **Frontend job ratio improved** — from ~19% toward 30-40% (will improve over time as new sources produce companies)
10. **Governing documents updated** — all changes documented for future sessions
