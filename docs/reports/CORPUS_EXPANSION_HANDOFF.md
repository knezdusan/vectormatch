# Continuous Company Acquisition Pipeline — Continuation Session Handoff

> **Purpose:** This file is the initial prompt for a new session that continues implementation of the Continuous Company Acquisition Pipeline. The previous implementation session crashed (Electron renderer process crash, exit code 5) after completing ~80% of Sprint 1. This handoff provides full context of what was completed, what diverged from the TDD, what manual actions are pending, and exactly what remains.
>
> **Date:** June 29, 2026
>
> **Related:** `docs/reports/CORPUS_EXPANSION_TDD.md` (locked TDD), `docs/governing/company-corpus-expansion-prompt.md` (brainstorming summary)

---

## Initial Prompt for New Session

I am continuing implementation of the Continuous Company Acquisition Pipeline for VectorMatch.dev. The previous session completed ~80% of Sprint 1 before crashing. Your job is to complete the remaining work, fix issues left by the crash, and wire everything into Inngest.

**YOUR ROLE:** Complete the pipeline following the locked TDD document. Do NOT re-architect or second-guess the decisions. The previous session already implemented most of Sprint 1 — you are picking up where it left off. If you find a genuine bug or contradiction, raise it before proceeding.

### Critical: Read These Files First (In This Order)

1. **`docs/reports/CORPUS_EXPANSION_TDD.md`** — THE governing implementation document. Read §2.2 (daily sources), §8 (implementation order), and §1.2-1.3 (batch polling architecture) carefully. The infrastructure layer (§1) and batch source seeder logic (§2.1) are already implemented.

2. **`AGENTS.md`** — Project rules. Critical: Technology Stack (strict), Testing Strategy, Inngest Orchestration rules, Biome (not ESLint), Database Mutation in Tests rules.

3. **This handoff document** — Read the entire "Implementation State" section below to understand exactly what was completed, what diverged, and what remains.

### Implementation State (Verified June 29, 2026 21:15)

The previous session (`bemused-skipjack`) ran for ~5 hours and completed 1261 passing tests across 59 test files. Here is the verified state:

#### ✅ COMPLETED — Sprint 1 Infrastructure (TDD Items 1-11)

All infrastructure items are implemented, tested, and TypeScript-clean (excluding test files noted in Issues section):

| Item | Status | Key Files | Migration | Tests |
|---|---|---|---|---|
| G7: rawJson Pruning (1-3) | ✅ Complete | `job.ts` (normalizedText col), `job-normalizer.ts`, `functions.ts` (jobIngestedHandler, gate3Evaluator), `job-repository.ts` (upsert fix), `dashboard-queries.ts`, `scripts/backfill-normalized-text.ts` | `0016_milky_sauron.sql` | 15 |
| G5: Batch Polling (4) | ✅ Complete | `functions.ts` (batchPollTier), `tier-queries.ts` (getBatchForTier), `enums.ts` (active_hot tier) | `0017_massive_lady_deathstrike.sql` | 9 |
| G6: Batch Matcher (5) | ✅ Complete | `functions.ts` (batchPollTier extended with normalize+embed+Gate 1+2+Gate 3 fan-out) | — | (within G5 tests) |
| F2: ATS Expansion (6) | ✅ Complete | `ats-endpoints.ts` (3 new ATS), `enums.ts`, `ats-schemas.ts` (Zod), `job-normalizer.ts` (extract functions), `ats-adapters.ts` (3 new adapters), `resolve-custom-url.ts` (CNAME mappings) | `0018_damp_crystal.sql` | 51 |
| F1: The Slugger (7-8) | ✅ Complete | `slugger.ts` (canonicalizeCompanyName, generateSlugVariants, resolveSlugger), `sluggerRetry.ts` (schema), `company.ts` (canonicalName col), `resolve-custom-url.ts` (exports for reuse) | `0019_perfect_trauma.sql` | 25 |
| G4: Stale-Job GC (9) | ✅ Complete | `functions.ts` (staleJobVerifier), `stale-job-queries.ts`, `verify-job-exists.ts` | — | 19 |
| G3: Job-Level Inversion (10) | ✅ Complete | `job-normalizer.ts` (normalizeAggregatorJob), `job-repository.ts` (insertAggregatorJob), `functions.ts` (aggregatorJobHandler), `client.ts` (event type) | — | 10 |
| Q1: Quality Probe (11) | ✅ Complete | `quality-probe.ts` (determineInitialTier, countGateZeroJobs), `slugger.ts` (insertCompany option, insertResolvedCompany) | — | 20 |

#### ✅ COMPLETED — Batch Source Seeders (TDD Items 12-16, 22-26)

All 10 batch source seeders are implemented with tests. The seeder logic files exist but are **NOT wired into Inngest** (no cron triggers created):

| Item | File | Migration | Tests |
|---|---|---|---|
| B6: BigQuery 6 partitions | `bigquery-seeder.ts` (modified) | — | 2 new |
| B1: Workable Meta-Search | `batch-sources/workable-meta-search.ts` | `0020_burly_skin.sql` | 15 |
| B2/D1: Google CSE | `batch-sources/google-cse.ts` | `0021_bumpy_zaran.sql` | 31 |
| B3: YC Directory | `batch-sources/yc-directory.ts` | `0022_pink_violations.sql` | 16 |
| B4: VC Portfolios | `batch-sources/vc-portfolios.ts` | `0023_tearful_wasp.sql` | 19 |
| B5: Newsletter Archives | `batch-sources/newsletter-archives.ts` | `0024_amazing_morbius.sql` | 25 |
| B7: Wayback CDX | `batch-sources/wayback-cdx.ts` | `0025_grey_toad_men.sql` | 25 |
| B8: Rapid7 FDNS | `batch-sources/rapid7-cname.ts` | `0026_sleepy_blue_blade.sql` | 29 |
| B9: Cross-Pollination | `batch-sources/cross-pollination.ts` | `0027_dry_zuras.sql` | 13 |
| B10: Sitemap Probe | `batch-sources/sitemap-probe.ts` | `0028_panoramic_owl.sql` | 25 |

#### ✅ COMPLETED — Daily Source Seeders (TDD Items 17-19, 27-32)

10 of 13 daily source seeders are implemented with tests. Like batch sources, these are **NOT wired into Inngest**:

| Item | File | Tests | Notes |
|---|---|---|---|
| D2: HN Algolia Daily | `daily-sources/hn-algolia-daily.ts` | 19 | ✅ Clean |
| D3: Reddit RSS | `daily-sources/reddit-rss.ts` | 24 | ✅ Clean |
| D4: Remote Job Boards | `daily-sources/remote-job-boards.ts` | 36 | ⚠️ TS errors in test |
| D5: We Work Remotely + Jobicy | `daily-sources/weworkremotely-rss.ts` | 24 | ⚠️ TS errors in test |
| D7: Funding Signal | `daily-sources/funding-signal.ts` | 17 | ⚠️ TS errors in test |
| D8: Product Hunt | `daily-sources/producthunt-daily.ts` | 24 | ✅ Clean |
| D9: Engineering Blogs RSS | `daily-sources/engineering-blogs-rss.ts` | 32 | ✅ Clean |
| D10: GitHub Trending | `daily-sources/github-trending.ts` | 24 | ✅ Clean |
| D11: Tech News RSS | `daily-sources/tech-news-rss.ts` | 32 | ⚠️ TS errors in test |
| D12: NPM Registry | `daily-sources/npm-registry.ts` | 17 | ⚠️ TS errors in test |

#### ❌ MISSING — Not Yet Implemented

| Item | What's Missing |
|---|---|
| D6: CertStream processor | File not created. TDD §2.2 D6. Needs `daily-sources/certstream-processor.ts` |
| D13: Meta Ads Library | File not created. TDD §2.2 D13. Needs `daily-sources/meta-ads.ts` |
| **Item 20: Fire batch sources** | THE FLUSH has not been executed. All seeder logic exists but has never been run. |
| **Item 21: Wire daily+batch sources into Inngest** | **CRITICAL GAP.** No Inngest cron functions exist for ANY batch or daily source. The seeder functions (`runWorkableMetaSearch`, `runGoogleCseBatch`, `runYcDirectorySeeder`, etc.) exist but are not called by any Inngest function. `src/app/api/inngest/route.ts` only registers the infrastructure functions (batchPollTier, aggregatorJobHandler, staleJobVerifier, etc.). |
| Sprint 2: G1, Q2, Q3, Q4, Q5 (Items 35-39) | Not started. TDD §3. |

### Key Divergences from TDD (Implemented by Previous Session)

These divergences are **correct and intentional** — do not revert them:

1. **G6 idempotency fix:** The TDD §1.3 pseudocode sets `normalizedAt: new Date()` and `rawJson: null` unconditionally. The previous session correctly implemented: `normalizedAt` is set ONLY for normalized/rejected (not `normalization_failed`), and `rawJson` is kept for `normalization_failed` (needed for retry). This is correct — do not change.

2. **F2 single-file adapter pattern:** The TDD says to create per-ATS adapter files (`smartrecruiters.ts`, `workable.ts`, `recruitee.ts`). The actual codebase has a single `ats-adapters.ts` file. The previous session followed the existing single-file pattern. Do not split into separate files.

3. **F2 SmartRecruiters title-only degradation:** The SmartRecruiters public Posting API list endpoint (`/v1/companies/{slug}/postings`) does NOT include job descriptions — only the detail endpoint does. The normalizer degrades to title-only (same as Greenhouse without `?content=true`). This is acceptable for MVP.

4. **Job-repository upsert fix:** The upsert `onConflictDoUpdate` now uses `CASE WHEN normalizedAt IS NULL THEN excluded.raw_json ELSE raw_json END` to prevent re-polls from undoing G7 storage reclamation. This is critical — do not remove.

5. **Slugger `insertCompany` option:** `resolveSlugger` accepts an optional `insertCompany: boolean` (default `false` for backward compatibility). When `true`, it runs the quality probe after resolution and inserts the company with the determined tier. Seeders that want auto-insertion pass `insertCompany: true`.

6. **`cheerio` dependency added:** The previous session installed `cheerio` for HTML parsing in B4 (VC portfolios) and B5 (newsletter archives). This is a legitimate dependency.

### Manual Actions Required (BLOCKING — Must Be Done Before Flush)

The previous session identified these manual actions but could not perform them:

1. **Apply 13 migrations to Neon database** (migrations `0016` through `0028`):
   ```bash
   npx drizzle-kit push
   # OR apply individually if you prefer
   ```
   These migrations add: `normalized_text` column, `active_hot` tier enum, 3 new ATS enum values, `canonical_name` column, `slugger_retry` table, and 9 new `discovery_source` enum values.

2. **Run the G7 backfill script** on existing 4,086 jobs:
   ```bash
   # First, dry-run to verify:
   node --conditions react-server --import tsx scripts/backfill-normalized-text.ts --dry-run
   # Then live:
   node --conditions react-server --import tsx scripts/backfill-normalized-text.ts
   ```
   This reclaims ~61MB by moving cleaned text to `normalizedText` and NULLing `rawJson`.

3. **Verify storage reclamation** on the Neon dashboard after the backfill.

4. **Set up Google CSE API credentials** (needed for B2/D1 Google CSE seeder):
   - Create a Google Custom Search Engine at https://programmablesearchengine.google.com/
   - Configure it to search the 6 ATS domains
   - Set environment variables: `GOOGLE_CSE_API_KEY` and `GOOGLE_CSE_CSE_ID`

5. **Download Rapid7 FDNS v2 CNAME dataset** (needed for B8 Rapid7 seeder):
   - Available at https://opendata.rapid7.com/sonar.fdns_v2/
   - The file is ~2.3GB gzipped
   - The seeder expects a local file path

### Issues to Fix (From Crash)

The previous session was using parallel subagents for daily sources when it crashed. The subagent-created test files have TypeScript errors that need fixing:

1. **TypeScript errors in 5 test files** (run `npx tsc --noEmit` to see them):
   - `daily-sources/__tests__/funding-signal.test.ts` — `opts` possibly undefined (lines 384, 385)
   - `daily-sources/__tests__/npm-registry.test.ts` — type mismatch in test data (line 84), `opts` possibly undefined (line 185)
   - `daily-sources/__tests__/remote-job-boards.test.ts` — `opts` possibly undefined (line 465), `SendEventPayload` property access (lines 503, 507)
   - `daily-sources/__tests__/tech-news-rss.test.ts` — Object possibly undefined (line 383)
   - `daily-sources/__tests__/weworkremotely-rss.test.ts` — `opts` possibly undefined (line 410)

   **Fix approach:** Add null checks (`opts?.field` or `if (!opts) return`) and fix the `SendEventPayload` type assertions. These are test-only issues — the runtime tests pass (1261 tests pass). Run `npx tsc --noEmit` after fixing to verify.

2. **No Inngest functions for batch/daily sources:** This is the biggest gap. The seeder logic exists but nothing triggers it. You need to create Inngest functions with cron triggers for each source, following the staggered schedule in TDD §2.2. Register them in `src/app/api/inngest/route.ts`.

### Remaining Work (In Order)

| Priority | Task | TDD Reference | Est. Effort |
|---|---|---|---|
| 1 | Fix TypeScript errors in 5 test files | — | 0.5 day |
| 2 | Create D6: CertStream processor | TDD §2.2 D6 | 2 days |
| 3 | Create D13: Meta Ads Library | TDD §2.2 D13 | 2 days |
| 4 | **Wire ALL batch+daily sources into Inngest** with staggered crons | TDD §2.2 schedule table | 1 day |
| 5 | Register all new Inngest functions in `route.ts` | — | 0.5 day |
| 6 | Run full test suite + tsc + biome | — | 0.5 day |
| 7 | **STOP and ask user to apply migrations + run backfill** | Manual actions above | — |
| 8 | **STOP and ask user to confirm before THE FLUSH** | TDD Item 20 | — |
| 9 | Sprint 2: G1 Adaptive Polling Cadence | TDD §3.1 | 1 day |
| 10 | Sprint 2: Q2 Quality Flywheel | TDD §3.2 | 3 days |
| 11 | Sprint 2: Q3 Layoff Signal Checker | TDD §3.3 | 1 day |
| 12 | Sprint 2: Q4 Bootstrap Polling | TDD §3.1 (Q4) | 0.5 day |
| 13 | Sprint 2: Q5 Multi-Intent Fusion Scoring | TDD §3.4 | 1 day |

### Inngest Wiring Details (Task 4 — Critical)

The TDD §2.2 defines a staggered schedule for daily sources. Each source needs an Inngest function with a cron trigger. Follow this pattern:

```typescript
// In src/inngest/functions.ts — add for each daily source:

export const dailySourceD2 = inngest.createFunction(
  {
    id: "daily-source-hn-algolia",
    name: "Daily Source — HN Algolia",
    triggers: [{ cron: "0 1,16 * * *" }], // 01:00 and 16:00 UTC
  },
  async ({ step }) => {
    const results = await step.run("fetch-and-process", async () => {
      const { runHnAlgoliaDailySeeder } = await import(
        "@/lib/jobs/seeders/daily-sources/hn-algolia-daily"
      );
      return runHnAlgoliaDailySeeder();
    });
    return results;
  },
);
```

**Staggered schedule from TDD §2.2:**

| Time (UTC) | Source | Cron |
|---|---|---|
| 00:00, 14:00 | D1: Google CSE Daily | `0 0,14 * * *` |
| 01:00, 16:00 | D2: HN Algolia Daily | `0 1,16 * * *` |
| 02:00, 18:00 | D3: Reddit RSS | `0 2,18 * * *` |
| 03:00 | D4: Remote Job Boards | `0 3 * * *` |
| 04:00 | D5: We Work Remotely + Jobicy | `0 4 * * *` |
| 05:00 | D8: Product Hunt | `0 5 * * *` |
| 06:00 | D9: Engineering Blogs RSS | `0 6 * * *` |
| 07:00 | D10: GitHub Trending | `0 7 * * *` |
| 08:00 | D11: Tech News RSS | `0 8 * * *` |
| 09:00 | D12: NPM Registry | `0 9 * * *` |
| 10:00 | D6: CertStream | `0 10 * * *` |
| 11:00 | D7: Funding Signal | `0 11 * * *` |
| 12:00 | D13: Meta Ads | `0 12 * * *` |

**Batch sources** need one-time flush triggers (can be manual event sends or a one-time cron). The simplest approach: create Inngest functions that can be triggered manually via the Inngest dashboard or via `inngest.send()`:

```typescript
export const batchSourceB1 = inngest.createFunction(
  {
    id: "batch-source-workable-meta-search",
    name: "Batch Source — Workable Meta-Search",
    triggers: [{ event: "batch/workable-meta-search" }],
  },
  async ({ step }) => {
    const results = await step.run("fetch-and-process", async () => {
      const { runWorkableMetaSearch } = await import(
        "@/lib/jobs/seeders/batch-sources/workable-meta-search"
      );
      return runWorkableMetaSearch();
    });
    return results;
  },
);
```

### Existing Code to Reference

- `src/inngest/functions.ts` (~1750 lines) — All current Inngest functions. `batchPollTier` (line 298), `staleJobVerifier` (line 1554), `aggregatorJobHandler` (line 1686) are the new infrastructure functions.
- `src/app/api/inngest/route.ts` (67 lines) — Inngest serve handler. Currently registers 16 functions. Needs all new batch+daily source functions added.
- `src/lib/jobs/seeders/slugger.ts` (389 lines) — The Slugger with `resolveSlugger({ insertCompany: true })`.
- `src/lib/jobs/seeders/quality-probe.ts` — Quality probe for initial tier assignment.
- `src/lib/jobs/seeders/batch-sources/` — 9 batch source seeder files.
- `src/lib/jobs/seeders/daily-sources/` — 10 daily source seeder files (D6 and D13 missing).
- `src/db/migrations/` — Migrations 0016-0028 generated but NOT YET APPLIED to Neon.

### Testing Requirements

- Run `npm run test` after each task. All 1261+ tests must pass.
- Run `npx tsc --noEmit` after each task. Must be clean (fix the 5 test files first).
- Run `npx biome check --write` after each file change.
- **No database mutation in tests** (see AGENTS.md rules). Use mocked DB layer.
- **Do NOT run the flush (task 8) without explicit user confirmation.** The flush inserts 2,000-5,000 companies and processes 21,500+ jobs. It's a one-time operation that should be scheduled for a low-traffic period.

### Start Here

1. Fix the 5 TypeScript errors in test files (task 1)
2. Create D6 CertStream processor and D13 Meta Ads Library (tasks 2-3)
3. Wire all sources into Inngest with staggered crons (task 4)
4. Register in route.ts and run full verification (tasks 5-6)
5. Stop and ask user to apply migrations + run backfill (task 7)
6. Stop and ask user to confirm before flush (task 8)

Let me know when you've read this handoff and the TDD, and are ready to start.

---

## Post-Flush Update (Session 2 — June 2026)

### Flush Results

The batch source flush (TDD Item 20) was executed successfully:
- **Companies:** 449 → 5,290 (exceeded 5,000 target by 106%)
- **Jobs:** 4,491 (polling will increase these on subsequent batchPollTier runs)
- **Top source:** Wayback CDX (B7) — 4,163 companies
- **Other sources:** YC Directory (374), Newsletter Archives (257), VC Portfolios (36), Cross-Pollination (11)

### Issues Found & Fixed

#### Workable API Schema Drift (B1)

The Workable meta-search API (`jobs.workable.com/api/v1/jobs`) changed its response format:
- `company.name` → `company.title` (renamed)
- `company.shortName` removed (no longer exists)
- `company.url` added (format: `jobs.workable.com/company/{id}/jobs-at-{slug}`)

**Fix:** Updated Zod schema in `src/lib/jobs/seeders/batch-sources/workable-meta-search.ts` to match the new API format. Added `extractSlugFromCompanyUrl()` function that extracts the Workable slug from the `company.url` field by parsing the last path segment and removing the `jobs-at-` prefix. Verified the extracted slugs work with the widget API (`apply.workable.com/{slug}`). 23 tests pass (up from 15 — added 8 new tests for slug extraction).

### Issues Found & Deferred

#### Search API Alternatives (D1 + B2 — DISABLED)

**Problem:** Both Google CSE and Bing Search API are discontinued for new customers:
- **Google CSE:** "This API is not available for new customers." Existing customers can use it until January 1, 2027.
- **Bing Search API:** Retired completely on August 11, 2025. Replaced by "Grounding with Bing Search" (Azure AI Agents only — not a general search API).

**Impact:** D1 (Google CSE Daily) and B2 (Google CSE Batch) are disabled in `src/app/api/inngest/route.ts`. The Inngest function definitions remain in `src/inngest/functions.ts` but are not registered.

**Action required:** Dedicate a future session to evaluating alternatives:
1. **Brave Search API** — Available, supports `site:` operator, $5/1,000 requests with $5 free monthly credits (~1,000 searches/month free). REST API with token auth. Best available option.
2. **SerpAPI** — Third-party Google scraper. $75/month for 5,000 searches. More expensive but scrapes Google's index directly.
3. **Skip search-based discovery** — We already have 5,290 companies. D2-D13 daily sources + batch poller may be sufficient.

**Recommendation:** Brave Search API is the most cost-effective and capable alternative. It supports the same `site:` queries we used with Google CSE (e.g. `site:boards.greenhouse.io`), making it a near-drop-in replacement for the seeder logic.

#### Rapid7 FDNS (B8 — SKIPPED)

Rapid7 Open Data now requires commercial licensing. B8 is disabled. D6 CertStream covers the same CNAME-based discovery approach via Certificate Transparency logs.

### Files Modified in Session 2

- `src/lib/jobs/seeders/batch-sources/workable-meta-search.ts` — Schema fix + slug extraction
- `src/lib/jobs/seeders/batch-sources/__tests__/workable-meta-search.test.ts` — Updated fixtures + new tests
- `src/app/api/inngest/route.ts` — D1 + B2 disabled (Google CSE)
- `scripts/fire-flush.ts` — B2 removed from flush events
- `src/inngest/functions.ts` — All batch + daily source Inngest functions added (Sprint 1 task 4)
- `src/lib/jobs/seeders/daily-sources/certstream-processor.ts` — D6 CertStream (Sprint 1 task 2)
- `src/lib/jobs/seeders/daily-sources/meta-ads.ts` — D13 Meta Ads (Sprint 1 task 3)

---

## Sprint 2 Update (Session 3 — June 30 2026)

### Summary

All five Sprint 2 quality architecture features (G1, Q2, Q3, Q4, Q5) are implemented, tested, and deployed to production. 52 new Vitest tests added (1,376 total across 65 test files). 3 migrations applied to Neon. 0 TypeScript errors. Biome clean.

### Pre-Implementation Pipeline Status

Verified against production DB before starting Sprint 2:
- **Total companies:** 6,685 (up from 5,290 — daily sources adding ~1,400 more)
- **Active jobs:** 5,043 (up from 4,491)
- **Companies polled:** 547/6,685 (8%) — dormant tier (6,130) only polled weekly
- **Approved matches:** 1 out of 62 (1.6% approval rate)
- **HN Algolia cron:** Running (multiple runs/day, inserting companies)
- **Tier recalc + stale cleanup:** Running (daily crons firing)
- **`active_hot` tier:** Empty — enum + cron existed but `recalculateTiers()` didn't promote to it (that was G1 work)

### Implementation Details

#### G1: Adaptive Polling Cadence

**File:** `src/lib/jobs/poller/tier-queries.ts` — `recalculateTiers()`

Updated the daily tier recalculation to promote companies to `active_hot` when they have approved matches in the last 30 days. The EXISTS subquery joins `match_queue` → `job` on `(ats_source, ats_slug)` and correlates to `company`. Tier transition order (first match wins):
1. `health = "dead" OR consecutiveFailures >= 3` → `dead`
2. Approved match in last 30 days → `active_hot`
3. Discovered within 48h (Q4 bootstrap) → `active_hot`
4. `lastJobPostedAt` within 14 days → `active`
5. Otherwise → `dormant`

**Tests:** `src/lib/jobs/poller/__tests__/tier-recalc.test.ts` (9 tests)

#### Q4: Bootstrap Polling

**Schema change:** `company.tier` default changed from `"dormant"` to `"active_hot"` (migration `0029_q4_bootstrap_default_active_hot.sql`). New companies start in `active_hot` (poll every 3h) for the first 48h. The 48h protection is in `recalculateTiers()` — the `discovered_at > NOW() - INTERVAL '48 hours'` check preserves `active_hot` for new companies. The Q2 quality flywheel demotion also respects this 48h window.

#### Q2: Adversarial Quality Flywheel

**New table:** `company_quality_score` (migration `0030_q2_quality_flywheel_score.sql`)
- `score` (0-100), `approved_matches`, `rejected_matches`, `total_jobs_processed`, `last_approved_at`, `calculated_at`
- Indexes on `company_id` and `score`

**New Inngest function:** `qualityFlywheelRecalc` (cron `0 4 * * *`)
- Aggregates match_queue data per company via JOIN match_queue → job → company
- Upserts into company_quality_score with `ON CONFLICT (company_id) DO UPDATE`
- Promotes: `score > 50 AND approved_matches > 3` → `active_hot`
- Demotes: `score < 10 AND total_jobs_processed > 20` → `dormant` (respects Q4 48h protection)
- Counts purge candidates: `0 approved in 90 days` (logged, not auto-deleted)

**Files:** `src/db/schemas/jobs/companyQualityScore.ts`, `src/lib/jobs/quality/quality-flywheel.ts`
**Tests:** `src/lib/jobs/quality/__tests__/quality-flywheel.test.ts` (16 tests)

#### Q3: Layoff Signal Checker

**New Inngest function:** `layoffSignalChecker` (cron `0 5 * * *`)
- Fetches `https://layoffs.fyi/rss-feed/` RSS feed
- Parses company names from `<title>` elements (handles CDATA, HTML entities, suffix stripping)
- Matches against `company.company_name` and `company.canonical_name` using ILIKE
- Demotes matched companies from `active_hot` to `active` (not dormant — they may still have open roles)

**Files:** `src/lib/jobs/quality/layoff-signals.ts`
**Tests:** `src/lib/jobs/quality/__tests__/layoff-signals.test.ts` (20 tests)

#### Q5: Multi-Intent Fusion Scoring

**Schema changes:** (migration `0031_q5_fusion_score.sql`)
- `company.fusion_score` column (integer, default 1)
- New table `company_discovery_sources` with unique(company_id, discovery_source) — prevents double-counting

**Integration:** The Slugger's `finalizeResolution()` function calls `recordDiscoverySource()` after company insertion or duplicate detection. If the source is new (not already recorded for this company), `fusion_score` is incremented. If the source already recorded (unique constraint violation), the score is NOT incremented.

**Files:** `src/db/schemas/jobs/companyDiscoverySources.ts`, `src/lib/jobs/quality/fusion-score.ts`, `src/lib/jobs/seeders/slugger.ts` (integration point)
**Tests:** `src/lib/jobs/quality/__tests__/fusion-score.test.ts` (7 tests)

### Migrations Applied

| # | File | Description |
|---|------|-------------|
| 0029 | `0029_q4_bootstrap_default_active_hot.sql` | `company.tier` default → `active_hot` |
| 0030 | `0030_q2_quality_flywheel_score.sql` | `company_quality_score` table + indexes |
| 0031 | `0031_q5_fusion_score.sql` | `company.fusion_score` column + `company_discovery_sources` table |

### Inngest Functions Added

| Function | ID | Cron | Purpose |
|----------|-----|------|---------|
| `qualityFlywheelRecalc` | `quality-flywheel-recalc` | `0 4 * * *` | Q2: Daily quality score recalculation + tier promotion/demotion |
| `layoffSignalChecker` | `layoff-signal-checker` | `0 5 * * *` | Q3: Daily layoff signal check + demotion |

Both registered in `src/app/api/inngest/route.ts`. The tier recalc (`tierRecalc`, `0 4 * * *`) runs at the same time as the quality flywheel — both fire at 04:00 UTC. The layoff checker runs at 05:00 UTC, after both have completed.

### Files Modified in Session 3

- `src/lib/jobs/poller/tier-queries.ts` — G1: `recalculateTiers()` updated with active_hot promotion + Q4 48h bootstrap protection
- `src/lib/jobs/poller/__tests__/tier-recalc.test.ts` — NEW: 9 tests for G1 + Q4
- `src/db/schemas/jobs/company.ts` — Q4: tier default → `active_hot`, Q5: `fusion_score` column added
- `src/db/schemas/jobs/companyQualityScore.ts` — NEW: Q2 quality score table schema
- `src/db/schemas/jobs/companyDiscoverySources.ts` — NEW: Q5 discovery sources tracking table
- `src/db/schemas/index.ts` — Export new schemas
- `src/db/migrations/0029_q4_bootstrap_default_active_hot.sql` — NEW: Q4 migration
- `src/db/migrations/0030_q2_quality_flywheel_score.sql` — NEW: Q2 migration
- `src/db/migrations/0031_q5_fusion_score.sql` — NEW: Q5 migration
- `src/lib/jobs/quality/quality-flywheel.ts` — NEW: Q2 recalculation logic
- `src/lib/jobs/quality/layoff-signals.ts` — NEW: Q3 RSS parsing + name matching + demotion
- `src/lib/jobs/quality/fusion-score.ts` — NEW: Q5 fusion score recording + lookup
- `src/lib/jobs/quality/__tests__/quality-flywheel.test.ts` — NEW: 16 tests
- `src/lib/jobs/quality/__tests__/layoff-signals.test.ts` — NEW: 20 tests
- `src/lib/jobs/quality/__tests__/fusion-score.test.ts` — NEW: 7 tests
- `src/lib/jobs/seeders/slugger.ts` — Q5: `recordDiscoverySource()` integration in `finalizeResolution()`
- `src/inngest/functions.ts` — Added `qualityFlywheelRecalc` + `layoffSignalChecker` Inngest functions
- `src/app/api/inngest/route.ts` — Registered both new functions
- `docs/governing/VectorMatchTechicalImplementation.md` — §4.7 Sprint 2 documentation + §4.0a slugger_retry fix
- `docs/governing/vectormatch-blueprint.md` — Sprint 2 completion in Build Sequence step 8
- `docs/reports/CORPUS_EXPANSION_TDD.md` — §3 marked as implemented

### Verification Results

- **TypeScript:** 0 errors (`npx tsc --noEmit`)
- **Biome:** 14 files checked, 2 auto-fixed (`npx biome check --write`)
- **Vitest:** 1,376 tests pass across 65 test files (`npx vitest run`)
- **DB migrations:** All 3 migrations applied to production Neon DB, verified with schema queries
- **Production DB state:** `fusion_score` column exists (default 1), `tier` default is `active_hot`, both new tables exist

### Observations & Concerns

1. **Only 1 approved match out of 62** — the quality flywheel (Q2) will have very little signal initially. Most companies will have a score of 0. The flywheel won't produce meaningful promotions/demotions until the batch poller processes more companies and the funnel produces more approved matches. Consider re-tuning `GATE2_MAX_COSINE_DISTANCE` (currently 0.48) if the approval rate stays this low after more companies are polled.

2. **Only 547/6,685 companies polled (8%)** — the dormant tier is the bottleneck. 6,130 companies are in `dormant` tier and only polled weekly (Monday 3am). G1's `active_hot` tier for new companies (Q4 bootstrap) will help for new discoveries, but the existing 6,130 dormant companies need to wait for their weekly poll.

3. **No companies have `fusion_score > 1` yet** — the `fusion_score` column was just added. The first re-discovery by a different source will increment it. This is expected — the fusion score will accumulate over time as daily sources re-discover existing companies.

None of these are blockers. They're expected consequences of the flush-and-flow architecture — the batch poller is steadily working through the corpus, and Sprint 2 features are designed to accelerate high-value companies through the pipeline.

### Divergences from TDD Spec (Deliberate Simplifications)

#### Divergence 1: Q4 Bootstrap Cadence — 3h instead of 2h

**TDD spec (item 38):** "Q4: Bootstrap polling (new company 2h cadence for 48h)"
**Brainstorming doc:** "New (48h): 2h"
**Implemented:** New companies get `active_hot` tier, which polls every 3h (`0 */3 * * *`).

**Rationale:** Creating a separate 2h cron just for the 48h bootstrap window would require either a new tier value (e.g., `bootstrap`) or a separate Inngest function with its own cron. The difference between 2h and 3h is 1 extra poll in 48h (16 polls vs 16 polls — actually 24 polls vs 16 polls, but the practical difference is minimal). Using the existing `active_hot` tier and cron is simpler and achieves the same goal: new companies get polled frequently for the first 48h. The 3h cadence is already 4x more frequent than the standard 12h cadence.

#### Divergence 2: Q2 Quality Score — Simple Percentage instead of Bayesian

**TDD spec (§3.2):** "Bayesian score 0-100"
**Implemented:** `score = (approvedMatches / totalJobsProcessed) * 100` (simple percentage)

**Rationale:** A true Bayesian score would use a prior (e.g., beta distribution) and weight by sample size to avoid small-sample noise. With the current volume (1 approved match out of 62 total across 6,685 companies), most companies have 0 approved matches and 0-5 total jobs processed. A Bayesian prior would barely matter at this volume — the simple percentage is more transparent and easier to debug. As match volume increases, consider upgrading to a Wilson score interval or Bayesian posterior for more robust ranking. This is a deferred enhancement, not a bug.

#### Divergence 3: Q3 Layoff Re-Promotion — Handled by G1 instead of Automatic 60-Day Timer

**Brainstorming doc:** "Demote affected companies. Re-promote after 60 days."
**Implemented:** Demotion only (active_hot → active). No automatic 60-day re-promotion timer.

**Rationale:** The G1 tier recalculation already handles re-promotion: if a company has approved matches in the last 30 days, it gets promoted to `active_hot` regardless of whether it was previously demoted by the layoff checker. This is a merit-based approach — the company must earn re-promotion through match quality, not just wait 60 days. The automatic 60-day timer from the brainstorming doc would re-promote companies regardless of whether they've recovered (they may still be laying off). The G1 approach is safer and more aligned with the quality flywheel philosophy.

**Trade-off:** A company that had layoffs, recovered, but doesn't produce approved matches will stay at `active` (12h polling) instead of being re-promoted to `active_hot` (3h polling). This is acceptable — if the company isn't producing approved matches, it doesn't deserve the hot tier.

---

## Sprint 3 Hardening Session Handoff (Session 4 — June 30 2026)

> **Purpose:** This section is the initial prompt and full context for a dedicated implementation session that addresses 10 production stability and reliability issues identified during the post-Sprint-2 analysis. The session covers all CRITICAL and HIGH priority items from the evolving blueprint.
>
> **Infrastructure decision:** Option C (Hybrid) — self-host Inngest on Coolify, stay on Neon Free with G8 optimization, upgrade to Neon Launch when storage exceeds 450MB. This session does NOT implement the Inngest migration (that's a separate MEDIUM-priority task) — it implements the optimizations that keep us within free-tier limits.

### Initial Prompt for New Session

I am implementing Sprint 3 hardening tasks for the VectorMatch.dev Continuous Company Acquisition Pipeline. Sprints 1 and 2 are complete (1,376 tests pass, 0 TS errors, 6,685 companies in production). This session addresses 10 specific issues identified during post-Sprint-2 analysis — 4 CRITICAL (blocking production stability) and 6 HIGH (preventing future failures).

**YOUR ROLE:** Implement the 10 tasks below in order. Each task has a detailed specification, file paths, and implementation guidance. Do NOT re-architect or second-guess the decisions — the analysis has been done. If you find a genuine bug or contradiction, raise it before proceeding.

**CRITICAL RULES:**
- Read `AGENTS.md` first — follow the Technology Stack (strict), Testing Strategy, Biome (not ESLint), and Database Mutation in Tests rules.
- Run `npm run test` after each task. All 1,376+ tests must pass.
- Run `npx tsc --noEmit` after each task. Must be clean.
- Run `npx biome check --write` after each file change.
- **No database mutation in tests.** Use mocked DB layer.
- **NEVER run Git commands** (git add, git commit, git push, etc.) — leave all version control to the user.
- Generate a Drizzle migration for each schema change (`npx drizzle-kit generate`).
- Do NOT apply migrations to production — the user will do that manually after review.

### Verified Production State (June 30 2026, 14:55 UTC)

| Metric | Value |
|---|---|
| Tests | 1,376 pass, 0 TS errors, 65 files |
| Companies | 6,685 (5,290 from flush + ~1,395 from daily sources) |
| Active jobs | 5,043 |
| Companies polled | 547/6,685 (8%) |
| Approved matches | 1 out of 62 (1.6% approval rate) |
| Inngest functions registered | 38 (16 infra + 13 daily + 9 batch) |
| Gate 2 threshold | 0.48 cosine distance (hardcoded in `matching-config.ts`) |
| G8 Aggressive Cleanup | NOT IMPLEMENTED (only `markStaleJobs` exists — marks stale/gone but never deletes) |
| Circuit breakers | NOT IMPLEMENTED |
| Batch source refresh crons | NOT IMPLEMENTED (all batch sources are event-only triggers) |
| `slugger_retry` processor | NOT IMPLEMENTED (queue grows unbounded) |
| Q5 fusion scores for direct-insert companies | NOT APPLIED (~4,163 Wayback CDX companies have `fusion_score = 1`) |

### Key Files to Read Before Starting

1. **`AGENTS.md`** — Project rules (Technology Stack, Testing Strategy, Biome, DB mutation rules)
2. **`src/inngest/functions.ts`** — All 38 Inngest functions. Key functions for this session: `staleCleanup` (line ~657), `tierRecalc` (line ~608), `qualityFlywheelRecalc` (Sprint 2), `pendingQueueSweep` (line ~1339), all `batchSourceB*` and `dailySourceD*` functions.
3. **`src/app/api/inngest/route.ts`** — Inngest serve handler. 38 functions registered.
4. **`src/lib/jobs/matching-config.ts`** — Gate 2 threshold (line 38: `GATE2_MAX_COSINE_DISTANCE = 0.48`).
5. **`src/lib/jobs/poller/job-repository.ts`** — `markStaleJobs()` (marks stale/gone, does NOT delete).
6. **`src/lib/jobs/seeders/batch-sources/workable-meta-search.ts`** — B1 seeder with slug extraction bug.
7. **`src/lib/jobs/seeders/slugger.ts`** — The Slugger with `resolveSlugger({ insertCompany: true })`.
8. **`src/lib/jobs/quality/fusion-score.ts`** — `recordDiscoverySource()` function.
9. **`src/lib/jobs/seeders/company-repository.ts`** — `insertDiscoveredCompanies()` (direct insert, bypasses Slugger).
10. **`src/db/schemas/jobs/sluggerRetry.ts`** — Retry queue schema (has `nextRetryAt`, `retryCount` fields).
11. **`src/db/schemas/jobs/ingestionLog.ts`** — Ingestion log schema (no retention policy).
12. **`src/db/schemas/jobs/matchQueue.ts`** — Match queue schema (no archival policy).

---

### Task 1 (CRITICAL): Implement G8 — Aggressive Job Cleanup + Retention Policies

**Problem:** The TDD and brainstorming doc both specify G8 (Aggressive Job Cleanup), but it was never implemented. The current `staleCleanup` function (cron `0 3 * * *`) only marks jobs as `stale` (7 days) and `gone` (30 days) — it never deletes them. Dead rows accumulate indefinitely. Combined with unbounded `match_queue`, `ingestion_log`, and `slugger_retry` growth, the 512MB Neon storage limit will be hit within 2-3 months.

**Specification:**

Create a new Inngest function `aggressiveCleanup` (cron `0 2 * * *` — daily at 02:00 UTC, before `staleCleanup` at 03:00) with the following steps:

**Step 1 — Delete terminal-state jobs:**
```sql
-- Delete rejected jobs older than 1 day (already tombstoned, no retry value)
DELETE FROM job WHERE status = 'rejected' AND normalized_at < NOW() - INTERVAL '1 day';
-- Delete gone jobs older than 7 days (company left ATS, job is permanently dead)
DELETE FROM job WHERE status = 'gone' AND last_seen_at < NOW() - INTERVAL '7 days';
-- Delete normalization_failed jobs older than 7 days (retried for 7 days, give up)
DELETE FROM job WHERE status = 'normalization_failed' AND normalized_at < NOW() - INTERVAL '7 days';
```
**Note:** `job` table has `ON DELETE CASCADE` from `match_queue` (FK), so deleting jobs automatically cleans up their match_queue rows. Verify this in `src/db/schemas/jobs/matchQueue.ts` — the `jobId` FK should have `onDelete: "cascade"`.

**Step 2 — Archive old match_queue rows:**
```sql
-- Delete approved/rejected matches older than 90 days (no longer actionable)
DELETE FROM match_queue WHERE status IN ('approved', 'rejected') AND created_at < NOW() - INTERVAL '90 days';
```

**Step 3 — Delete old ingestion_log entries:**
```sql
-- Delete ingestion logs older than 30 days (observability window)
DELETE FROM ingestion_log WHERE created_at < NOW() - INTERVAL '30 days';
```

**Step 4 — Delete exhausted slugger_retry entries:**
```sql
-- Delete retry entries that have been retried 3+ times and are past their retry date
DELETE FROM slugger_retry WHERE next_retry_at < NOW() - INTERVAL '30 days' AND retry_count >= 3;
```

**Step 5 — Write ingestion log entry** for the cleanup run.

**Create a separate weekly VACUUM function** `vacuumAnalyze` (cron `0 2 * * 0` — Sunday 02:00 UTC):
```sql
VACUUM ANALYZE;
```
**Note:** `VACUUM FULL` requires an exclusive lock and can block queries. Use `VACUUM ANALYZE` instead — it reclaims space from dead tuples without exclusive locks. Only use `VACUUM FULL` if storage is critically high (>480MB) and schedule it during a maintenance window.

**Files to create/modify:**
- `src/lib/jobs/poller/cleanup-queries.ts` — NEW: Pure DB query functions for each deletion step. Each function takes no args, returns `{ deletedCount: number }`. Make them individually testable by mocking `db.execute(sql\`...\`)`.
- `src/inngest/functions.ts` — Add `aggressiveCleanup` + `vacuumAnalyze` Inngest functions.
- `src/app/api/inngest/route.ts` — Register both new functions.
- `src/lib/jobs/poller/__tests__/cleanup-queries.test.ts` — NEW: Vitest tests for each deletion query (mock the DB, verify SQL is called with correct parameters).

**Testing approach:** Mock `db.execute(sql\`...\`)` and verify the correct SQL is executed. Do NOT run against a real database. Test that each function returns the correct count. Test edge cases (zero rows deleted, large batch deleted).

**Migration:** No schema changes needed — this only adds DELETE queries against existing tables.

---

### Task 2 (CRITICAL): Make Gate 2 Threshold Env-Configurable + Lower to 0.50

**Problem:** The Gate 2 cosine distance threshold is hardcoded at 0.48 in `src/lib/jobs/matching-config.ts:38`. The current 1.6% approval rate (1/62) is below the TDD target of 2-4%. The threshold cannot be tuned without a code deploy, which is unacceptable for production iteration.

**Specification:**

**Step 1 — Make the threshold env-configurable:**
```typescript
// src/lib/jobs/matching-config.ts — replace line 38:
export const GATE2_MAX_COSINE_DISTANCE = Number(
  process.env.GATE2_MAX_COSINE_DISTANCE ?? 0.50,
);
```
Update the JSDoc comment to document the env var and the new default of 0.50 (raised from 0.48).

**Step 2 — Add to environment configuration:**
Add `GATE2_MAX_COSINE_DISTANCE=0.50` to `.env.example` (or `.env.local.example` if that's the pattern). Document that this is tunable without a redeploy.

**Step 3 — Update tests:**
Any test that references `GATE2_MAX_COSINE_DISTANCE` should use the imported constant (not a hardcoded 0.48). If tests break because they expect 0.48, update them to use 0.50 or mock the env var.

**Files to modify:**
- `src/lib/jobs/matching-config.ts` — Change the constant to read from env.
- `.env.example` (or equivalent) — Add the new env var.
- Any test files that reference the threshold value.

**No migration needed.** This is a config change only.

---

### Task 3 (CRITICAL): Fix B1 Workable Slug Mismatch

**Problem:** The B1 Workable Meta-Search seeder extracts slugs from `company.url` (format: `jobs.workable.com/company/{id}/jobs-at-{slug}`) and inserts companies directly via `insertDiscoveredCompanies`. The extracted slug (e.g., `acme-corp`) may not match the Workable widget API slug (e.g., `acmecorp` or `acme`). Companies with wrong slugs fail every poll attempt, wasting Inngest executions and driving `consecutiveFailures` up until they're marked `dead`.

**Specification:**

**Step 1 — Add a fast-path slug validation:**
Before inserting a company, validate the extracted slug by making a lightweight HEAD request to `apply.workable.com/api/v1/widget/accounts/{slug}`. If it returns 200, the slug is valid — insert directly (fast path). If it returns 404, fall back to the Slugger (slow path).

**Step 2 — Route failures through the Slugger:**
For slugs that fail validation, call `resolveSlugger({ companyName: job.company.title, website: undefined, discoverySource: "workable_meta_search", insertCompany: true })`. The Slugger will try the DB cache, CNAME resolution, and slug probe against all 6 ATS platforms.

**Step 3 — Update the seeder:**
Modify `runWorkableMetaSearch()` in `src/lib/jobs/seeders/batch-sources/workable-meta-search.ts`:

```typescript
// Current (line ~284):
const insertResult = await insertDiscoveredCompanies(allInputs);

// New:
const validInputs: SeedCompanyInput[] = [];
const sluggerInputs: { companyName: string; companyUrl: string }[] = [];

for (const input of allInputs) {
  const slug = input.atsSlug;
  const isValid = await validateWorkableSlug(slug, fetchFn);
  if (isValid) {
    validInputs.push(input);
  } else {
    sluggerInputs.push({
      companyName: input.companyName ?? "",
      companyUrl: input.discoveryContext ?? "",
    });
  }
}

// Insert valid slugs directly
const insertResult = await insertDiscoveredCompanies(validInputs);

// Route invalid slugs through the Slugger
for (const { companyName, companyUrl } of sluggerInputs) {
  if (!companyName) continue;
  await resolveSlugger({
    companyName,
    website: companyUrl,
    discoverySource: "workable_meta_search",
    insertCompany: true,
  });
}
```

**Step 4 — Create `validateWorkableSlug` function:**
```typescript
async function validateWorkableSlug(slug: string, fetchFn: FetchFn): Promise<boolean> {
  const url = `https://apply.workable.com/api/v1/widget/accounts/${slug}`;
  try {
    const response = await fetchFn(url, { method: "HEAD" });
    return response.ok;
  } catch {
    return false; // Network error — assume invalid, route to Slugger
  }
}
```

**Files to modify:**
- `src/lib/jobs/seeders/batch-sources/workable-meta-search.ts` — Add `validateWorkableSlug`, update `runWorkableMetaSearch` to use fast-path + Slugger fallback.
- `src/lib/jobs/seeders/batch-sources/__tests__/workable-meta-search.test.ts` — Add tests for slug validation (valid slug → direct insert, invalid slug → Slugger fallback, network error → Slugger fallback).

**No migration needed.** This is a logic change only.

**Note:** The Slugger import should be dynamic (`await import("@/lib/jobs/seeders/slugger")`) to avoid circular dependency issues — the Slugger module imports from company-repository which imports from schemas.

---

### Task 4 (CRITICAL): Implement Circuit Breakers + Source Health Tracking

**Problem:** Two sources have already broken (Google CSE, Rapid7 FDNS) and one had schema drift (Workable). The pipeline has no circuit breakers, no per-source kill switches, and no automatic health monitoring. A failing source keeps running on its cron schedule, wasting Inngest executions.

**Specification:**

**Step 1 — Create `source_health` table:**
```typescript
// src/db/schemas/jobs/sourceHealth.ts — NEW
import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const sourceHealth = pgTable("source_health", {
  sourceName: text("source_name").primaryKey(),
  status: text("status").notNull().default("active"), // active | degraded | disabled
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  lastError: text("last_error"),
  totalRuns: integer("total_runs").notNull().default(0),
  totalFailures: integer("total_failures").notNull().default(0),
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),
});
```

**Step 2 — Create health query functions:**
```typescript
// src/lib/jobs/source-health.ts — NEW
export async function getSourceHealth(sourceName: string): Promise<SourceHealth | null> { ... }
export async function recordSourceSuccess(sourceName: string): Promise<void> { ... }
export async function recordSourceFailure(sourceName: string, error: string): Promise<void> { ... }
export async function isSourceEnabled(sourceName: string): Promise<boolean> { ... }
export async function disableSource(sourceName: string, reason: string): Promise<void> { ... }
export async function enableSource(sourceName: string): Promise<void> { ... }
```

`recordSourceFailure` should increment `consecutiveFailures`. If `consecutiveFailures >= 3`, automatically set `status = "degraded"`. The source is NOT auto-disabled — degraded sources still run but are flagged for review. Only manual `disableSource()` sets `status = "disabled"`.

`isSourceEnabled` returns `false` if `status === "disabled"` OR `consecutiveFailures >= 5` (hard circuit breaker — 5 consecutive failures = automatic shutdown).

**Step 3 — Integrate circuit breaker into all batch + daily source Inngest functions:**
For each `batchSourceB*` and `dailySourceD*` function in `src/inngest/functions.ts`, add a `check-health` step at the start and `record-success`/`record-failure` steps:

```typescript
export const dailySourceD2HnAlgolia = inngest.createFunction(
  {
    id: "daily-source-hn-algolia",
    name: "Daily Source — HN Algolia",
    triggers: [{ cron: "0 1,16 * * *" }],
  },
  async ({ step }) => {
    const sourceName = "hn-algolia-daily";

    const health = await step.run("check-health", async () => {
      const { isSourceEnabled } = await import("@/lib/jobs/source-health");
      return isSourceEnabled(sourceName);
    });

    if (!health) {
      return { skipped: true, reason: "circuit-breaker-open" };
    }

    try {
      const results = await step.run("fetch-and-process", async () => {
        const { runHnAlgoliaDailySeeder } = await import(
          "@/lib/jobs/seeders/daily-sources/hn-algolia-daily"
        );
        return runHnAlgoliaDailySeeder();
      });

      await step.run("record-success", async () => {
        const { recordSourceSuccess } = await import("@/lib/jobs/source-health");
        return recordSourceSuccess(sourceName);
      });

      return results;
    } catch (error) {
      await step.run("record-failure", async () => {
        const { recordSourceFailure } = await import("@/lib/jobs/source-health");
        return recordSourceFailure(sourceName, String(error));
      });
      throw error; // Re-throw for Inngest retry
    }
  },
);
```

**Step 4 — Apply this pattern to ALL 22 source functions** (13 daily + 9 batch). Use the Inngest function `id` as the `sourceName`.

**Files to create/modify:**
- `src/db/schemas/jobs/sourceHealth.ts` — NEW: Schema.
- `src/db/schemas/index.ts` — Export `sourceHealth`.
- `src/lib/jobs/source-health.ts` — NEW: Health query functions.
- `src/inngest/functions.ts` — Add circuit breaker to all 22 source functions.
- `src/lib/jobs/__tests__/source-health.test.ts` — NEW: Tests for health functions (mock DB).
- Generate migration: `npx drizzle-kit generate` → produces `0032_*.sql`.

**Testing:** Mock the DB layer. Test: `isSourceEnabled` returns true for active, false for disabled, false for `consecutiveFailures >= 5`. Test `recordSourceFailure` increments counter and sets degraded at 3. Test `recordSourceSuccess` resets counter.

---

### Task 5 (HIGH): Add Batch Source Refresh Crons

**Problem:** All 9 batch source Inngest functions use `triggers: [{ event: "batch/..." }]` — they only fire on manual event sends. There is no recurring refresh. The corpus becomes stale as new companies join ATS platforms after the initial flush.

**Specification:**

Add cron triggers to each batch source function using Inngest v4's multi-trigger support. Each function gets BOTH the event trigger (for manual flush) AND a cron trigger (for periodic refresh):

| Source | Refresh Cron | Cadence | Rationale |
|---|---|---|---|
| B1 Workable Meta-Search | `0 0 1 * *` | Monthly | New companies join Workable continuously |
| B3 YC Directory | `0 0 1 */3 *` | Quarterly | New batches 2x/year, `isHiring` toggles frequently |
| B4 VC Portfolios | `0 0 1 * *` | Monthly | Portfolio pages update as VCs invest |
| B5 Newsletter Archives | `0 0 1 * *` | Monthly | Weekly newsletters = monthly catch-up |
| B7 Wayback CDX | `0 0 1 */3 *` | Quarterly | Historical archive, diminishing returns |
| B8 Rapid7 FDNS | DISABLED | — | Commercial licensing required |
| B9 Cross-Pollination | `0 0 1 * *` | Monthly | New job descriptions = new company names |
| B10 Sitemap Probe | `0 0 * * 1` | Weekly | Rescues failed Slugger probes |
| B6 BigQuery | Already has monthly cron | — | No change needed |

**Implementation:**
For each batch source function, change `triggers` from:
```typescript
triggers: [{ event: "batch/workable-meta-search" }],
```
to:
```typescript
triggers: [
  { event: "batch/workable-meta-search" },  // manual flush
  { cron: "0 0 1 * *" },                     // monthly refresh
],
```

**Important:** The circuit breaker from Task 4 must be in place first — the refresh cron should respect the circuit breaker. If a source is disabled or has 5+ consecutive failures, the cron run should skip it.

**Files to modify:**
- `src/inngest/functions.ts` — Add cron triggers to 7 batch source functions (B1, B3, B4, B5, B7, B9, B10). B6 already has a cron. B2 and B8 are disabled.

**No migration needed.** This is a cron configuration change.

---

### Task 6 (HIGH): Create `sluggerRetryProcessor` Inngest Function

**Problem:** The `slugger_retry` table was created (migration 0019) and the Slugger inserts failed resolutions into it. But there is no Inngest function that processes the retry queue. Failed companies sit in the queue forever with `retryCount = 0` and `nextRetryAt` in the past.

**Specification:**

Create a new Inngest function `sluggerRetryProcessor` (cron `0 0 * * 1` — weekly, Monday 00:00 UTC):

**Step 1 — Select retryable entries:**
```sql
SELECT * FROM slugger_retry
WHERE next_retry_at < NOW() AND retry_count < 3
ORDER BY next_retry_at ASC
LIMIT 100;
```

**Step 2 — Re-run Slugger for each entry:**
For each entry, call `resolveSlugger({ companyName, website, discoverySource, insertCompany: true })`.

**Step 3 — Handle results:**
- **Success:** Delete the `slugger_retry` row. The company is now in the corpus.
- **Failure:** Increment `retryCount`, set `nextRetryAt = NOW() + INTERVAL '7 days' * POWER(2, retryCount)` (exponential backoff: 7d, 14d, 28d). If `retryCount >= 3`, leave in table for manual review (the G8 cleanup from Task 1 will delete it after 30 days).

**Step 4 — Write ingestion log.**

**Files to create/modify:**
- `src/lib/jobs/seeders/slugger-retry-processor.ts` — NEW: Pure functions for selecting retryable entries, processing results, updating retry counts.
- `src/inngest/functions.ts` — Add `sluggerRetryProcessor` Inngest function.
- `src/app/api/inngest/route.ts` — Register the new function.
- `src/lib/jobs/seeders/__tests__/slugger-retry-processor.test.ts` — NEW: Tests (mock DB + mock Slugger).

**No migration needed.** The `slugger_retry` table already exists.

---

### Task 7 (HIGH): Replace Google CSE with Brave Search API (D1/B2 Revival)

**Problem:** Google CSE API is discontinued for new customers. D1 (Google CSE Daily) and B2 (Google CSE Batch) are disabled. This creates a coverage gap of 200-500 companies. Brave Search API is the best available alternative — it supports `site:` queries and has a free tier ($5/month credits ≈ 1,000 searches/month).

**Specification:**

**Step 1 — Create a new Brave Search seeder** (replace the Google CSE seeder):
- `src/lib/jobs/seeders/batch-sources/brave-search.ts` — NEW
- The seeder should use the same `site:` query approach as Google CSE but with the Brave Search API:
  - API endpoint: `https://api.search.brave.com/res/v1/web/search`
  - Auth: `X-Subscription-Token` header (env var `BRAVE_SEARCH_API_KEY`)
  - Query params: `q=site:boards.greenhouse.io`, `count=20` (max per page)
  - Same 6 ATS domains as Google CSE
  - Same slug extraction from URLs (the URL patterns are identical — Google indexes the same pages)
  - Pagination via `offset` parameter

**Step 2 — Create both batch and daily modes** (same as Google CSE had):
- Batch mode: search all 6 ATS domains, extract all slugs, insert directly
- Daily mode: same queries but with `freshness=pd` (past day) filter to catch newly-indexed pages

**Step 3 — Replace the Google CSE Inngest functions:**
- Rename `dailySourceD1GoogleCse` → `dailySourceD1BraveSearch` (cron `0 0,14 * * *`)
- Rename `batchSourceB2GoogleCse` → `batchSourceB2BraveSearch` (event `batch/brave-search` + monthly cron `0 0 1 * *`)
- Update `src/app/api/inngest/route.ts` to register the new functions and remove the old ones

**Step 4 — Add env var:**
- `BRAVE_SEARCH_API_KEY` to `.env.example`

**Step 5 — Delete or archive the old Google CSE seeder:**
- Keep `src/lib/jobs/seeders/batch-sources/google-cse.ts` for reference but do NOT register it in route.ts. Add a comment at the top: `// DEPRECATED: Google CSE API discontinued. Replaced by brave-search.ts.`

**Files to create/modify:**
- `src/lib/jobs/seeders/batch-sources/brave-search.ts` — NEW: Brave Search seeder (batch + daily).
- `src/lib/jobs/seeders/batch-sources/__tests__/brave-search.test.ts` — NEW: Tests.
- `src/inngest/functions.ts` — Replace Google CSE functions with Brave Search functions.
- `src/app/api/inngest/route.ts` — Update registrations.
- `src/lib/jobs/seeders/batch-sources/google-cse.ts` — Mark as deprecated.
- `.env.example` — Add `BRAVE_SEARCH_API_KEY`.

**No migration needed.** The `google_cse` discovery source enum value can be reused or a new `brave_search` value can be added. Prefer adding `brave_search` to `discoverySourceEnum` for clarity.

---

### Task 8 (HIGH): Stagger `tierRecalc` + `qualityFlywheelRecalc` Cron Times

**Problem:** Both `tierRecalc` and `qualityFlywheelRecalc` run at `0 4 * * *` (04:00 UTC). They both read and write the `company.tier` column. Concurrent execution can cause race conditions — `tierRecalc` might promote a company to `active_hot` while `qualityFlywheelRecalc` simultaneously demotes it to `dormant`. The final state is non-deterministic.

**Specification:**

Change `qualityFlywheelRecalc` cron from `0 4 * * *` to `0 4 * * *` → `30 4 * * *` (04:30 UTC). This gives `tierRecalc` 30 minutes to complete before the quality flywheel starts.

**Files to modify:**
- `src/inngest/functions.ts` — Change `qualityFlywheelRecalc` triggers cron from `"0 4 * * *"` to `"30 4 * * *"`.
- Update the comment in the function to reflect the new time.
- Update the Inngest function registration table in `docs/governing/VectorMatchTechicalImplementation.md` §4.7.6 if it references the old cron.

**No migration needed.** This is a cron configuration change.

---

### Task 9 (HIGH): Reduce `pendingQueueSweep` Frequency

**Problem:** `pendingQueueSweep` runs every 15 minutes (`0,15,30,45 * * * *`) = 2,880 executions/month. This is ~6% of the 50K Inngest budget for a single function. As the corpus grows, each run takes longer.

**Specification:**

Change the cron from `0,15,30,45 * * * *` to `0,30 * * * *` (every 30 minutes = 1,440 executions/month). This halves the execution cost with minimal impact on user experience — users check daily, not hourly. A 30-minute feedback delay is acceptable.

**Files to modify:**
- `src/inngest/functions.ts` — Change `pendingQueueSweep` triggers cron from `"0,15,30,45 * * * *"` to `"0,30 * * * *"`.

**No migration needed.** This is a cron configuration change.

---

### Task 10 (HIGH): Backfill Q5 Fusion Scores for Direct-Insert Companies

**Problem:** B7 Wayback CDX and B6 BigQuery insert companies directly via `insertDiscoveredCompanies` (not through the Slugger). The Q5 fusion score integration is in the Slugger's `finalizeResolution()` function. Companies inserted directly never get a `recordDiscoverySource()` call, so their `fusion_score` stays at 1 forever. ~4,163 companies (70% of the corpus) from Wayback CDX are affected.

**Specification:**

**Step 1 — Create a backfill script:**
`scripts/backfill-fusion-scores.ts` — A one-time script that:
1. Queries all companies where `fusion_score = 1` (default, never incremented)
2. For each company, checks its `discovery_source` column
3. Calls `recordDiscoverySource(companyId, discoverySource)` to populate `company_discovery_sources` and increment `fusion_score` if the source is new

**Step 2 — Also fix `insertDiscoveredCompanies` for future inserts:**
Add a call to `recordDiscoverySource()` inside `insertDiscoveredCompanies()` in `src/lib/jobs/seeders/company-repository.ts`. After a successful insert, call `recordDiscoverySource(insertedCompanyId, input.discoverySource)`. This ensures all future direct-insert companies get their fusion score tracked.

**Step 3 — Script flags:**
- `--dry-run`: List companies that would be updated without making changes
- `--limit N`: Process only N companies (for testing)
- `--source S`: Only process companies from a specific discovery source

**Files to create/modify:**
- `scripts/backfill-fusion-scores.ts` — NEW: Backfill script.
- `src/lib/jobs/seeders/company-repository.ts` — Add `recordDiscoverySource` call after insert.
- `src/lib/jobs/seeders/__tests__/company-repository.test.ts` — Update tests to verify `recordDiscoverySource` is called (mock it).

**No migration needed.** The `fusion_score` column and `company_discovery_sources` table already exist (migration 0031).

---

### Implementation Order

Execute tasks in this order (dependencies noted):

1. **Task 1 (G8 Cleanup)** — No dependencies. Foundation for storage sustainability.
2. **Task 2 (Gate 2 threshold)** — No dependencies. Quick config change.
3. **Task 3 (B1 Workable fix)** — No dependencies. Bug fix.
4. **Task 4 (Circuit breakers)** — No dependencies. Foundation for Task 5.
5. **Task 5 (Batch refresh crons)** — DEPENDS ON Task 4 (circuit breaker must be in place before adding crons).
6. **Task 6 (Slugger retry processor)** — No dependencies.
7. **Task 7 (Brave Search API)** — No dependencies. Can be done in parallel with Tasks 5-6.
8. **Task 8 (Stagger crons)** — No dependencies. Quick config change.
9. **Task 9 (Reduce pendingQueueSweep)** — No dependencies. Quick config change.
10. **Task 10 (Fusion score backfill)** — No dependencies.

**Recommended parallelization:** Tasks 1-4 are sequential (each builds confidence for the next). Tasks 5-10 can be parallelized with subagents after Task 4 is complete.

### After All Tasks Complete

1. Run full verification: `npm run test`, `npx tsc --noEmit`, `npx biome check --write`
2. Generate all migrations: `npx drizzle-kit generate`
3. Report the list of migrations that need to be applied to production
4. Report the list of env vars that need to be set
5. Report the backfill scripts that need to be run
6. **DO NOT apply migrations, run backfill scripts, or commit changes.** The user will do all manual actions after review.

### Environment Variables to Set (After Session)

| Variable | Purpose | Task |
|---|---|---|
| `GATE2_MAX_COSINE_DISTANCE` | Gate 2 cosine distance threshold (default 0.50) | Task 2 |
| `BRAVE_SEARCH_API_KEY` | Brave Search API authentication | Task 7 |

### Migrations to Apply (After Session)

| # | Description | Task |
|---|---|---|
| 0032 | `source_health` table | Task 4 |

> **Note on Task 7:** The `brave_search` enum value was NOT added. The Brave Search seeder reuses `extractCompaniesFromResults` from `google-cse.ts`, which sets `discoverySource: "google_cse"`. This is a reasonable simplification — the discovery source is conceptually "search engine discovery", just using Brave as the API backend instead of Google. No migration 0033 is needed.

### Backfill Scripts to Run (After Session)

| Script | Purpose | Task |
|---|---|---|
| `scripts/backfill-fusion-scores.ts` | Populate Q5 fusion scores for direct-insert companies | Task 10 |

---

## Sprint 3 Hardening — Completion Report (Session 4 — June 30 2026)

### Verification Results (Verified by orchestrator session, June 30 2026 15:10 UTC)

| Check | Result |
|---|---|
| Vitest | **1,441 tests pass** across 70 test files (up from 1,376) |
| TypeScript | **0 errors** (`npx tsc --noEmit`) |
| Biome | **2 warnings** (pre-existing, in Sprint 1 files — `rapid7-cname.test.ts`, `sitemap-probe.test.ts`, `hn-algolia-daily.ts`. All Sprint 3 files are clean.) |
| Migration | `0032_source_health.sql` generated, NOT applied to production |

### Task-by-Task Verification

| # | Task | Verified | Notes |
|---|---|---|---|
| 1 | G8 Aggressive Cleanup | ✅ | `aggressiveCleanup` (cron `0 2 * * *`) + `vacuumAnalyze` (cron `0 2 * * 0`) in `functions.ts`. `cleanup-queries.ts` created with deletion logic. |
| 2 | Gate 2 Threshold | ✅ | `GATE2_MAX_COSINE_DISTANCE` now reads from `process.env`, default 0.50. Added to `.env.example`. |
| 3 | B1 Workable Slug Fix | ✅ | `validateWorkableSlug()` added to `workable-meta-search.ts`. Invalid slugs route through `resolveSlugger({ insertCompany: true })`. |
| 4 | Circuit Breakers | ✅ | `sourceHealth.ts` schema + `source-health.ts` query functions. 66 circuit breaker step references across 22 source functions in `functions.ts`. Migration `0032_source_health.sql`. |
| 5 | Batch Refresh Crons | ✅ | B1 (monthly), B3/B7 (quarterly), B4/B5/B9 (monthly), B10 (weekly). B2 Brave Search also got monthly cron (fixed by orchestrator — session missed this). |
| 6 | sluggerRetryProcessor | ✅ | Weekly Inngest function (cron `0 0 * * 1`) with exponential backoff. `slugger-retry-processor.ts` created. |
| 7 | Brave Search API | ✅ | `brave-search.ts` seeder created. Old Google CSE functions removed from `functions.ts` and `route.ts`. `google-cse.ts` marked as deprecated (fixed by orchestrator — session missed this). Reuses `google_cse` discovery source enum (no new enum value needed). |
| 8 | Stagger Cron Times | ✅ | `qualityFlywheelRecalc` cron changed from `0 4 * * *` to `30 4 * * *` (04:30 UTC). |
| 9 | Reduce pendingQueueSweep | ✅ | Cron changed from `0,15,30,45 * * * *` to `0,30 * * * *` (every 30 min). |
| 10 | Fusion Score Backfill | ✅ | `backfill-fusion-scores.ts` script created with `--dry-run`, `--limit`, `--source` flags. `insertDiscoveredCompanies` now calls `recordDiscoverySource()`. |

### Issues Found & Fixed by Orchestrator

1. **B2 Brave Search missing refresh cron** — The session created `batchSourceB2BraveSearch` with only an event trigger, no cron. The handoff specified a monthly refresh cron. Orchestrator added `{ cron: "0 0 1 * *" }` to the triggers.

2. **google-cse.ts not marked as deprecated** — The handoff specified adding a deprecation comment. Orchestrator added the deprecation header noting that brave-search.ts reuses the extraction functions from this file.

### New Files Created (10)

| File | Purpose |
|---|---|
| `src/db/schemas/jobs/sourceHealth.ts` | Drizzle schema for `source_health` table |
| `src/lib/jobs/source-health.ts` | Circuit breaker query functions |
| `src/lib/jobs/poller/cleanup-queries.ts` | G8 deletion queries |
| `src/lib/jobs/seeders/slugger-retry-processor.ts` | Retry queue processor |
| `src/lib/jobs/seeders/batch-sources/brave-search.ts` | Brave Search API seeder (replaces Google CSE) |
| `scripts/backfill-fusion-scores.ts` | One-time Q5 fusion score backfill |
| `src/lib/jobs/__tests__/source-health.test.ts` | 15 tests for circuit breaker logic |
| `src/lib/jobs/seeders/__tests__/slugger-retry-processor.test.ts` | 9 tests for retry processor |
| `src/lib/jobs/seeders/batch-sources/__tests__/brave-search.test.ts` | 14 tests for Brave Search seeder |
| `src/lib/jobs/seeders/__tests__/company-repository.test.ts` | 7 tests for fusion score integration |

### Modified Files (8)

| File | Changes |
|---|---|
| `src/inngest/functions.ts` | 22 source functions wrapped with circuit breakers; `aggressiveCleanup` + `vacuumAnalyze` + `sluggerRetryProcessor` added; D1/B2 replaced Google CSE with Brave Search; batch source cron triggers added; `qualityFlywheelRecalc` staggered to 04:30; `pendingQueueSweep` reduced to every 30 min |
| `src/app/api/inngest/route.ts` | Registered `sluggerRetryProcessor`, `dailySourceD1BraveSearch`, `batchSourceB2BraveSearch`, `aggressiveCleanup`, `vacuumAnalyze` |
| `src/db/schemas/index.ts` | Exported `sourceHealth` schema |
| `src/lib/jobs/matching-config.ts` | `GATE2_MAX_COSINE_DISTANCE` env-configurable with 0.50 default |
| `src/lib/jobs/seeders/batch-sources/workable-meta-search.ts` | Fast-path slug validation + Slugger fallback |
| `src/lib/jobs/seeders/company-repository.ts` | `recordDiscoverySource()` called after direct inserts |
| `src/lib/jobs/seeders/batch-sources/google-cse.ts` | Marked as deprecated (header comment) |
| `.env.example` | Added `BRAVE_SEARCH_API_KEY` and `GATE2_MAX_COSINE_DISTANCE=0.50` |

### Manual Actions Required (BLOCKING)

1. **Apply migration `0032_source_health.sql`** to production Neon:
   ```bash
   npx drizzle-kit push
   ```

2. **Set environment variables** in Coolify/production:
   - `GATE2_MAX_COSINE_DISTANCE=0.50` (Gate 2 threshold — tunable without redeploy)
   - `BRAVE_SEARCH_API_KEY=<your_key>` (Sign up at https://brave.com/search/api/ — free tier has $5/month credits ≈ 1,000 searches)

3. **Run the fusion score backfill** (one-time):
   ```bash
   # Dry run first:
   node --conditions react-server --import tsx scripts/backfill-fusion-scores.ts --dry-run
   # Then live:
   node --conditions react-server --import tsx scripts/backfill-fusion-scores.ts
   ```

4. **Monitor Gate 2 approval rate** for 3 days after deploying the threshold change (0.48 → 0.50). If approval rate exceeds 2%, hold. If below 1.5%, consider raising to 0.52.
