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
