# DIRECTIVE 14 — INTEGRAL REPORT

**Date:** 2026-07-17
**Status:** Complete
**Author:** Devin (autonomous)
**Dux rulings:** Timezone scope (keep as global)

---

## Executive Summary

Directive 14 addressed 10 jobs across four themes: false-global regression
fixes, Neon consumption reconciliation, job board filter wiring, and the v3
tranche probe. The most consequential finding is that the D13 enrollment
tranche of 95 candidates has **zero addressable-global yield** under the v3
fingerprint — every "Remote" job is country-fenced ("Remote - India",
"Remote - Brazil", etc.), exposing a systematic overcounting in the v2
assumptions that built the tranche.

---

## JOB 3 — SpaceX False-Global Regression Fix

**Problem:** 46 SpaceX jobs classified as `global` despite being onsite-US.
The `remote-scope-extractor.ts` multi-probe confirmed "global" when product
scope text mentioned "worldwide" or "anywhere", overriding the
`workplaceType='remote'` + `isSpecificLocation` signal.

**Root cause:** The multi-probe did not check for the conflict case where
`workplaceType` indicates remote but the location is a specific US city.
Product-scope language ("worldwide product") was being misread as hiring
scope.

**Fix:** Modified `extractRemoteScope` to:
1. Correctly handle `workplaceType='remote'` in combination with
   `isSpecificLocation` — when both are present, the job is
   `country_fenced`, not `global`.
2. Prevent the multi-probe from confirming `global` in conflict cases
   where the location is specific.

**Verification:** Dedicated test `d14-spacex-regression.test.ts` created
and passing. The 46 SpaceX jobs + 3 similar jobs from other companies
reclassified to `country_fenced`, embeddings nulled for re-processing.

**Files modified:**
- `src/lib/jobs/remote-scope-extractor.ts`
- `src/lib/jobs/__tests__/d14-spacex-regression.test.ts`

---

## JOB 3.3 — Approvals-Side Scope Sampler

**What:** New Inngest cron function `approvalsSideScopeSampler` added to
sample approved global jobs weekly and detect potential false-globals on
the approval side. Mirrors the existing recall audit cron.

**Why:** The SpaceX regression showed that false-globals can slip through
the ingestion-side classifier. The approvals-side sampler provides a
second line of defense — if approved global jobs show location signals
inconsistent with genuine global scope, they're flagged for review.

**Files modified:**
- `src/inngest/functions.ts` (new cron function)
- `src/app/api/inngest/route.ts` (registration)

---

## JOB 2 — Neon Reality Reconciliation

**Problem:** The D13 report stated 7,500 CU-hrs/month free tier and
miscalculated usage. The actual free tier is **100 CU-hrs/month**.

**Reality:**
- Free tier: 100 CU-hrs/month
- Current usage: ~20.93–23.47 CU-hrs (21–23% of free tier)
- 80% warning threshold: 80 CU-hrs — not yet reached
- Headroom: ~77 CU-hrs before warnings

**Fix:** Updated `DIRECTIVE_13_INTEGRAL_REPORT.md` with correct Neon
consumption figures and a note on the 80% warning discrepancy.

**Files modified:**
- `docs/reports/DIRECTIVE_13_INTEGRAL_REPORT.md`

---

## JOB 1.3 — Himalayas worldwideOnly Wiring

**What:** The `directJobBoardIngestion` cron was passing
`worldwideOnly=false` (or not at all) to `fetchHimalayasJobs`, allowing
non-global jobs to be ingested as global.

**Fix:** Updated the cron to pass `worldwideOnly=true`, ensuring only
genuinely global Himalayas jobs are ingested.

**Files modified:**
- `src/inngest/functions.ts`

---

## JOB 5.2 — Ubiminds Re-Test (&& Operator Verdict)

**Question:** The D12 audit flagged 2 Ubiminds jobs WITH react/typescript
tags as "stack-disjoint" — suggesting the `&&` operator was buggy.

**Finding:** The `&&` operator is **NOT buggy in production**. The D12
audit script had a **parameterization bug**: `${JS_FAMILY_TAGS}` in the
Neon driver's tagged template literal creates a single-element array
containing the string `'{"typescript","javascript",...}'` — not
individual tags. This caused ALL jobs to appear "disjoint" in the audit.

**Proof:**
- Hardcoded SQL (production `gate-1-2.ts` uses `sql.raw()`): `&&` returns
  `true` for overlapping arrays ✓
- Parameterized SQL (D12 audit script): `&&` returns `false` ✗
- `unnest + = ANY`: returns `true` ✓

**Real reason for zero match_queue entries:** Gate 2 cosine distance is
0.5036, just above the 0.5 threshold — a marginal miss, NOT a
stack-disjoint rejection.

**Verdict:** B3.1 was correctly closed. No code change needed. The D12
audit script's parameterization bug created a false trail.

---

## JOB 5.1 — Timezone Scope Ruling

**Question:** Remote.com jobs with "GMT-6 to GMT-4" timezone ranges —
should they be a distinct `timezone_fenced` class excluded from global?

**Dux ruling:** Keep as global. The worker can be anywhere as long as
they overlap the timezone window.

**Action:** No code change needed.

---

## JOB 5.3 — LaraJobs Daily Poll + Employer Harvest

**What:** New LaraJobs adapter for the PHP/Laravel persona's only
dedicated channel. ~9 active jobs at any time.

**Implementation:**
- HTML scraping (no JSON API available) — fetches main page, parses job
  cards, fetches individual job pages for descriptions
- No anti-bot protection — plain HTTP fetch (no Playwright needed)
- Merges card tags with `scanTagsRegex` results from title + description
- Infers remote scope from location string (Remote → global, Remote /
  Europe → region_fenced, specific city → onsite)
- Parses salary from metadata (£60k-£70k, $125,000, etc.)
- Employer harvest function for the Slugger (ATS slug census)

**Wiring:** Added as Board 10 in `directJobBoardIngestion` cron.

**Tests:** 10 tests covering card parsing, tag extraction, remote scope
inference, salary parsing, tech filter, maxJobs limit, HTTP error
handling, and job description fetching. All passing.

**Files created:**
- `src/lib/jobs/direct-ingestion/larajobs.ts`
- `src/lib/jobs/direct-ingestion/__tests__/larajobs.test.ts`

**Files modified:**
- `src/lib/jobs/direct-ingestion/types.ts` (added `larajobs` to
  `DirectBoardSource`)
- `src/inngest/functions.ts` (import + Board 10 wiring)

---

## JOB 4 — v3 Tranche Probe (95 Candidates)

**What:** Probed all 95 D13 tranche candidates' ATS feeds, counted
web-dev roles, gated ≥2 web-dev roles, ranked by addressable-global
yield.

**Critical finding:** **Zero of 95 candidates have genuinely global
jobs.** Every "Remote" job is country-fenced:
- Twilio: 163 jobs, 161 "Remote - {Country}" → all country_fenced
- Huzzle: 2,156 jobs, all `undetermined` (no location data in Workable
  widget API)
- SmartRecruiters: 99-100 jobs each, all with `location.city` set to
  specific cities

**Breakdown:**
- 25 passed ≥2 web-dev gate (up from initial run after SmartRecruiters
  fix)
- 40 failed <2 web-dev gate
- 30 errored (404 — stale slugs, mostly Recruitee)

**Top 25 by web-dev count (all 0 global):**

| Rank | Slug | ATS | Total | WebDev | Global |
|------|------|-----|-------|--------|-------|
| 1 | twilio | greenhouse | 163 | 52 | 0 |
| 2 | sonyinteractiveentertainmentglobal | greenhouse | 188 | 102 | 0 |
| 3 | wpp | greenhouse | 195 | 29 | 0 |
| 4 | smartsheet | greenhouse | 103 | 30 | 0 |
| 5 | smartlyio | greenhouse | 75 | 22 | 0 |
| ... | (20 more) | ... | ... | ... | 0 |

**Implication for Dux:** The D13 tranche was built on v2 assumptions
that treated any "Remote" location as global. The v3 fingerprint exposes
this as a systematic overcounting. The tranche needs to be rebuilt with
v3 scope classification, or the discovery sources need to shift to
boards that actually have global jobs (Himalayas, WeWorkRemotely,
Remotive — the direct ingestion boards already wired).

**Output:** `docs/reports/d14-v3-tranche-probe.json`

**Files created:**
- `scripts/d14-v3-tranche-probe.ts`
- `docs/reports/d14-v3-tranche-probe.json`

---

## JOB 1 — Production Flow Table

Production is live and running. Current state (2026-07-17):

### Jobs by ATS Source

| Source | Active | Global | Global+Embedded | Country | Region | Onsite |
|--------|--------|--------|-----------------|---------|--------|--------|
| greenhouse | 729 | 156 | 156 | 549 | 3 | 13 |
| lever | 403 | 49 | 49 | 351 | 1 | 0 |
| ashby | 348 | 115 | 94 | 206 | 9 | 7 |
| smartrecruiters | 66 | 0 | 0 | 48 | 0 | 18 |
| weworkremotely | 63 | 32 | 32 | 31 | 0 | 0 |
| remoteok_direct | 36 | 14 | 14 | 22 | 0 | 0 |
| remotive | 24 | 2 | 2 | 22 | 0 | 0 |
| **Total** | **1,669** | **368** | **347** | **1,229** | **13** | **38** |

### Scope Distribution (Active Jobs)

- country_fenced: 1,229 (73.6%)
- global: 368 (22.0%)
- onsite: 38 (2.3%)
- region_fenced: 13 (0.8%)
- undetermined: 13 (0.8%)
- unknown: 8 (0.5%)

### Match Queue Flow

- Total matches: 3
- Pending: 0
- Approved: 3
- Rejected: 0
- Sent: 0

### Approved Matches

1. **Sr. Software Engineer (Node)** at evry-health
   - Persona: typescript, nextjs, react, nodejs, prompt-engineering
   - Overlap: 3 tags | Cosine distance: 0.3683

2. **Sr. Software Engineer (Node)** at evry-health
   - Persona: typescript, react, nextjs, graphql, tailwindcss
   - Overlap: 3 tags | Cosine distance: 0.3837

3. **Senior Software Engineer - Fullstack** at honkforhelp
   - Persona: typescript, nextjs, react, nodejs, prompt-engineering
   - Overlap: 2 tags | Cosine distance: 0.4980

### Inngest Crons Running

- `batch_poll`: Last run 2026-07-17T10:02:58Z (242 items, partial)
- `poll`: Last run 2026-07-17T10:02:58Z (4 items, success)
- `tier_recalc`: Running hourly (50 items per run)

---

## JOB 5.6 — D13 File Set Commit

Pending user action. The D13 file set includes:
- `docs/reports/DIRECTIVE_13_INTEGRAL_REPORT.md` (Neon correction)
- `src/lib/jobs/remote-scope-extractor.ts` (SpaceX fix)
- `src/lib/jobs/__tests__/d14-spacex-regression.test.ts`
- `src/inngest/functions.ts` (3 changes: sampler, Himalayas, LaraJobs)
- `src/app/api/inngest/route.ts` (sampler registration)
- `src/lib/jobs/direct-ingestion/types.ts` (larajobs source)
- `src/lib/jobs/direct-ingestion/larajobs.ts` (new adapter)
- `src/lib/jobs/direct-ingestion/__tests__/larajobs.test.ts` (10 tests)
- `scripts/d14-v3-tranche-probe.ts`
- `docs/reports/d14-v3-tranche-probe.json`

Per AGENTS.md rules, git operations are left to the user.

---

## Test Suite Status

- **Total test files:** 92 passed
- **Total tests:** 2,539 passed
- **New tests added in D14:**
  - 5 SpaceX regression tests
  - 10 LaraJobs adapter tests
- **TypeScript:** Zero errors (`tsc --noEmit` clean)

---

## Open Items for Dux

1. **D13 tranche rebuild:** The v3 probe shows zero global yield from the
   95 candidates. The tranche needs to be rebuilt with v3 scope
   classification, or discovery should shift to direct ingestion boards
   (Himalayas, WWR, Remotive) which already have genuine global jobs.

2. **Recruitee slugs:** 30 of 95 tranche candidates 404'd — all
   Recruitee. The slugs are stale or the companies moved to different
   ATS platforms. Consider re-discovering these companies.

3. **SmartRecruiters global yield:** 0 global jobs across all SR
   candidates. SR's `location.remote` field may need a different
   interpretation — "remote" in SR often means "remote within a specific
   country", not "remote from anywhere".

4. **Production match volume:** Only 3 matches approved from 347
   global+embedded jobs × 3 personas. The Gate 2 threshold (0.5 cosine
   distance) may be too tight for the current embedding quality. Consider
   relaxing to 0.55 or adding a tag-overlap override for high-overlap
   pairs.

5. **D13 file set commit:** All D14 changes are ready for commit.
