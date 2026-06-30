# Company Corpus Expansion — Brainstorming Session Summary

> **Status:** Brainstorming complete (6 iterations, June 29 2026). Implementation TDD prepared at `docs/reports/CORPUS_EXPANSION_TDD.md`. Implementation handoff prompt at `docs/reports/CORPUS_EXPANSION_HANDOFF.md`.
>
> **Supersedes:** The original expansion prompt (this file's prior content) which set a target of 1,800 companies for 1-2 approved matches/week. The new target is 5,000 quality companies for 5-10 approved matches/day.

---

## Session Overview

Six iterations of structured brainstorming (conventional + challenger reports per iteration) produced a comprehensive, cost-verified portfolio for continuous company acquisition. The session evolved through three major architectural pivots:

1. **Iteration 1-3:** Discovery source identification and verification (batch sources)
2. **Iteration 4:** Daily-flow architecture — the realization that batch dumps cause burst/drought UX, and the poller itself is the steady-state engine
3. **Iteration 5-6:** Infrastructure cost analysis — the discovery that Inngest's 50K execution/month limit and Neon's 512MB storage limit are the real binding constraints, not discovery source availability

## Final Target

- **5-10 approved matches per day** on the user's dashboard (up from 1-2/week)
- **~5,000 quality companies** in the corpus (up from 449)
- **Continuous daily flow** of new matches, not burst-and-drought from monthly batch dumps
- **$0 infrastructure cost** — stay within Inngest Hobby (50K exec, 5 concurrent), Neon Free (512MB, 100 CU-hours), OpenAI (~$0.79/month)

## The Three Infrastructure Walls (and Their Solutions)

### Wall 1: Inngest Executions (50K/month, 5 concurrent steps)

**Problem:** The current fan-out architecture (1 Inngest function per company poll + 1 per job normalization) consumes 600K+ executions/month at 5,000 companies — 12x over the limit.

**Solution: G5 (Batch Polling) + G6 (Batch Matcher)**
- G5: Poll 100 companies per Inngest function run instead of 1. Reduces polling executions by 50x.
- G6: Normalize + embed + run Gate 1+2 within the batch poller function. Reduces matcher executions by 19x. Gate 3 remains fan-out (small numbers, ~20/day).
- Combined: ~30% of the 50K budget at 5,000 companies with adaptive polling.

**Escape hatch:** Self-host Inngest on existing Hetzner + Coolify infrastructure. Open-source, removes all limits. Migration: deploy Inngest server, update env vars, redeploy. No code changes.

### Wall 2: Neon Storage (512MB)

**Problem:** At 5,000 companies × 21,500 jobs, `rawJson` alone consumes 322MB. Total storage: 709MB — 38% over limit.

**Solution: G7 (rawJson Pruning) + G8 (Aggressive Cleanup)**
- G7: Add `normalizedText` column. After normalization, store cleaned text (3KB) and NULL out `rawJson` (15KB). 80% reduction in text storage. **Must be implemented BEFORE the flush** — otherwise the backfill causes simultaneous storage of both fields, exceeding the limit.
- G8: Delete `rejected` jobs immediately, `gone` jobs after 7 days, `normalization_failed` after 7 days. Weekly `VACUUM FULL`.
- Combined: ~80% of 512MB at 5,000 companies.

**Escape hatch:** Neon Launch at $0.35/GB-month. At 1GB: $0.35/month.

### Wall 3: Neon Compute (100 CU-hours/month)

**Problem:** At 5,000 companies with adaptive polling, estimated 93 CU-hours/month — only 7% headroom.

**Solution:** Optimize DB active time (batch DB operations), leverage Neon's scale-to-zero (5-min idle), monitor from day 1 with automatic cadence reduction if CU-hours exceed 80% by day 20.

**Escape hatch:** Neon Launch at $0.106/CU-hour. At 100 CU-hours: $10.60/month.

## The Flush-and-Flow Architecture

Replaces the rejected "Staggered Batch Queue" (which would have made jobs stale by delaying company insertion).

**Phase 1 — Flush (Week 1-2):** Fire all 10 batch sources simultaneously. Process all discovered companies immediately. The initial flush produces 100-300 approved matches from existing job inventory. This is a feature (immediate value to user), not a bug.

**Phase 2 — Steady State (Week 2+):** The poller's 12h cycle (with G1 adaptive cadence: 3h for hot companies, 12h for standard, weekly for dormant) produces 7-10 approved/day from new jobs at existing companies. Daily-native sources add 60-200 new companies/day, each contributing fresh jobs via G3 (job-level direct ingestion).

**Phase 3 — Maturity (Month 2+):** Q2 Adversarial Quality Flywheel pushes approval rate from 2% to 3-4%. At 5,000 companies: ~13 approved/day.

## The Approved Portfolio

### Foundation Infrastructure (Sprint 1 — must exist before any seeder runs)

| ID | Pathway | Description |
|---|---|---|
| **G5** | Batch Polling Architecture | 100 companies per Inngest function run. Replaces fan-out. |
| **G6** | Batch Matcher | Normalize + embed + Gate 1+2 within batch poller. Gate 3 remains fan-out. |
| **G7** | rawJson Pruning | Add `normalizedText` column, NULL `rawJson` after normalization. **Before flush.** |
| **G8** | Aggressive Job Cleanup | Delete rejected/gone/failed jobs faster. Weekly VACUUM FULL. |
| **F1** | The Slugger | Company name → ATS slug resolution. Multi-strategy normalization, concurrent probing, DB-cached, retry queue. Integrates F3 (cross-platform identity resolution / name canonicalization). |
| **F2** | Phase 2 ATS Expansion | SmartRecruiters, Workable, Recruitee — all verified public no-auth JSON APIs. |
| **G4** | Stale-Job GC | Re-verify dashboard matches against ATS API, hide dead listings. |
| **G3** | Job-Level Inversion | New `normalizeAggregatorJob()` + `job/aggregator-ingested` event for daily sources. Collapses discovery-to-match latency to minutes. |
| **Q1** | Quality Probe at Insertion | Score companies by engineering-role count. 0 → dormant, 1-2 → dormant, 3+ → active. |

### Quality Architecture (Sprint 1-2)

| ID | Pathway | Description |
|---|---|---|
| **Q2** | Adversarial Quality Flywheel | Dynamic Bayesian scoring. Approved matches promote companies. Persistent rejections demote/purge. Match feedback improves discovery heuristics. |
| **Q3** | Layoff Signal Deprioritization | Track public layoffs (Layoffs.fyi RSS). Demote affected companies. Re-promote after 60 days. |
| **Q4** | Hourly Bootstrap Polling | New companies polled every 2h for first 48h, then taper to tier cadence. |
| **Q5** | Multi-Intent Fusion Scoring | Cross-signal strength at discovery: GitHub activity + ad spend + HN mention + funding = god-tier. |
| **G1** | Tiered Adaptive Polling Cadence | A-Hot (approved matches in 30d): 3h. A-Standard: 12h. B-Dormant: weekly. New (48h): 2h. |

### Batch Discovery Sources (produce the flush — one-time + periodic refresh)

| ID | Pathway | Est. Companies | Verified |
|---|---|---|---|
| **B1** | Workable Meta-Search (`jobs.workable.com/api/v1/jobs`) | 300-600 | ✅ Endpoint confirmed via Apify scraper docs |
| **B2** | Google CSE Batch Sweep (`site:boards.greenhouse.io` etc.) | 200-500 | ✅ |
| **B3** | YC Directory (Algolia API, `isHiring=true`) | 150-400 | ✅ |
| **B4** | VC Portfolio Mining (50+ VC portfolio pages) | 500-2,000 | ✅ |
| **B5** | Developer Newsletter Archives (JS Weekly, React Status, etc.) | 200-500 | ✅ |
| **B6** | BigQuery 6-partition scan (expand from 3 to 6) | 200-400 | ✅ |
| **B7** | Wayback Machine CDX (date-filtered to last 18 months) | 200-500 | ✅ |
| **B8** | CNAME Reversal via Rapid7 FDNS v2 (free bulk DNS dataset) | 300-1,000 | ✅ |
| **B9** | Cross-Pollination from Job Descriptions | 50-150 | ✅ |
| **B10** | Sitemap.xml Probing (rescue failed Slugger probes) | Rescues 20-30% | ✅ |
| | **Batch Total** | **~2,100-6,050** | |

### Daily-Native Discovery Sources (produce the flow — continuous)

| ID | Pathway | Est. New/day | Verified |
|---|---|---|---|
| **D1** | Google CSE Date-Restricted Daily (`dateRestrict=d1`, `sort=date`) | 10-30 | ✅ |
| **D2** | HN Algolia Daily ATS Link Mining (`search_by_date`, `created_at_i>YESTERDAY`) | 5-15 | ✅ |
| **D3** | Reddit RSS Hiring Feeds (`.rss` endpoint, `.json` is dead May 2026) | 5-15 | ✅ |
| **D4** | Remote OK + Remotive + Himalayas (3 free public APIs, company names → Slugger) | 10-30 | ✅ |
| **D5** | We Work Remotely + Jobicy RSS | 5-15 | ✅ |
| **D6** | CertStream Real-Time WebSocket (self-hosted, CT log streaming) | 2-10 | ✅ |
| **D7** | Funding Signal Pre-emptive Seeder (Crunchbase free API + TechCrunch RSS) | 3-10 | ✅ |
| **D8** | Product Hunt Daily Launches (free GraphQL API) | 4-20 | ✅ |
| **D9** | Company Engineering Blog RSS Monitoring (500-1,000 feeds) | 5-15 | ✅ |
| **D10** | GitHub Trending + CONTRIBUTING.md Daily Scan (30 req/min) | 3-10 | ✅ |
| **D11** | Tech News RSS + LLM Hiring Signal Extraction (gpt-4o-mini, ~$1/day) | 3-10 | ✅ |
| **D12** | NPM Registry New Package Monitoring (org-scoped packages) | 3-10 | ✅ |
| **D13** | Meta Ads Library Employment Ads (`ad_type=EMPLOYMENT_ADS`, requires FB Dev account) | 2-8 | ✅ |
| | **Daily Total** | **~60-200/day** | |

### Dismissed Pathways

| Pathway | Reason |
|---|---|
| Twitter/X Filtered Stream | $5,000/month for Pro tier. Economically impossible. |
| Stack Overflow Jobs | Shut down April 2026. |
| Reddit `.json` endpoint | Shut down May 2026. RSS still works. |
| LinkedIn Job Signal Streaming | Actively blocks automated access. No free API. |
| Staggered Batch Queue | Delays make jobs stale — violates freshness requirement. |
| All Challenger "weaponized" ideas | Deceptive, illegal, or unethical (honeypot profiles, WAF exploitation, credential scraping, etc.) |

## Sprint Sequencing

**Sprint 1:** G7 → G5 → G6 → F1 (with F3 integrated) → F2 → G4 → G3 → Q1 → Fire batch sources (B1-B10) → Wire daily sources (D1-D13, staggered) — `[Status: Complete — June 29 2026]`

**Sprint 2:** Q2 (Quality Flywheel) → Q3 (Layoff signals) → Q4 (Bootstrap polling) → Q5 (Multi-intent scoring) → G1 (Adaptive cadence) — `[Status: Complete — June 30 2026]`

**Sprint 3:** Remaining daily sources, optimization, monitoring — `[Status: Not started]`

## Key Files

- `docs/reports/CORPUS_EXPANSION_TDD.md` — The comprehensive implementation TDD
- `docs/reports/CORPUS_EXPANSION_HANDOFF.md` — The initial prompt for the implementation session
- `src/inngest/functions.ts` — All Inngest functions (1421 lines, 16 functions)
- `src/lib/jobs/ats-endpoints.ts` — ATS endpoint registry (3 platforms, needs F2 expansion)
- `src/db/schemas/jobs/company.ts` — Company schema (needs tier/health extensions for G1)
- `src/db/schemas/jobs/job.ts` — Job schema (needs `normalizedText` column for G7)
- `src/db/schemas/jobs/enums.ts` — Enums (needs new ATS sources, discovery sources, tier values)
- `src/lib/jobs/seeders/resolve-custom-url.ts` — Existing slug resolution (basis for F1 Slugger)
- `src/lib/jobs/poller/job-repository.ts` — Job upsert logic (basis for G5/G6 batching)
