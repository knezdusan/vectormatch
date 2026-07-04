# VectorMatch — Technical Architecture & Business Logic Overview

**Document purpose:** Pre-read for external SaaS consultants conducting a comprehensive audit of the VectorMatch platform.
**Prepared:** July 2026
**Status:** MVP stage — production deployed, single test user. Core filtering pipeline has been remediated (Gate 0.5 over-rejection, remote scope schema gap, aggregator blacklist). Remaining challenges are strategic (acquisition, corpus composition, promise feasibility) and require external consultation.

---

## 1. Executive Summary

### 1.1 Core Value Proposition

VectorMatch is a 3-gate AI job-routing SaaS that delivers **highly matched, pre-vetted job opportunities to software engineers** by ingesting unstructured ATS job postings (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee) and routing them to user-defined developer personas using a layered filtering pipeline:

- **Gate 1:** GIN index tag overlap ( PostgreSQL array `&&` operator)
- **Gate 2:** HNSW cosine similarity on `text-embedding-3-small` vectors (`<=>` operator)
- **Gate 3:** LLM arbitration (`gpt-4o-mini`) for nuanced yes/no final evaluation

The differentiator versus standard job boards/aggregators: **discover untapped opportunities at startups and smaller companies before competitors see them**, with proportional inclusion of global remote roles, surfaced via continuous ATS polling rather than scraped HTML career pages.

### 1.2 Target Market

Software engineers and web developers seeking curated job opportunities, with explicit emphasis on:
- Remote-first and globally remote roles
- Startups and smaller/non-tech companies (lower competition, direct access to decision makers)
- Roles not already heavily advertised on mainstream job boards

### 1.3 Current Status

| Metric | Value | Source |
|---|---|---|
| Stage | MVP, production deployed | — |
| Companies ingested | ~10,003 (target was 5,000) | live DB query (July 2026) |
| Active polling tier (active_hot + active) | 2,454 companies (24.5% of corpus — polled every 3–12h) | live DB query |
| Dormant tier | 7,549 companies (75.5% of corpus — polled weekly at best) | live DB query |
| Active jobs ingested | 459 (projected 21,500–50,000 at full poll) | live DB query |
| Jobs normalized (tags + embedding) | 0 of 459 active jobs | live DB query |
| Match queue entries | 0 | live DB query |
| Test users | 1 (3 personas: front-end, back-end, full-stack) | user report |

> **Note:** The live DB query (July 2026) shows a different picture than the blueprint projections. The company corpus has grown to ~10K (exceeding the 5K target 2x), but only 459 jobs are active and **none have been normalized yet** — the matching pipeline has not processed any jobs. The match queue is empty.

### 1.4 Key Challenge

The filtering pipeline has been remediated — the Gate 0.5 over-rejection that produced zero matches for remote-only applicants has been fixed, and the `remote_scope` field now distinguishes global remote from country-fenced remote. However, **the matching pipeline has not yet processed any jobs** (0 of 459 active jobs are normalized, match queue is empty), and the **strategic challenges remain unresolved**:

1. **Pipeline not running:** 459 active jobs sit unnormalized. The Gate 0.5 fix cannot have any effect until normalization runs. This is the immediate priority.
2. **Corpus composition** skews toward large established companies (78.7% from undifferentiated sources), not the startups/small companies that form the core differentiator.
3. **Dormant tier dominance** (75.5% of corpus) means the actual active job corpus (459 jobs) is far smaller than the projected 21,500–50,000.
4. **The "10+ daily matched and approved jobs" promise** may not be achievable for a Serbia + remote-only user given the current corpus composition and active polling rate.
5. **The 30% global remote ratio goal** is now measurable (via `remote_scope`) but not enforced — no acquisition logic targets global remote jobs specifically.

### 1.5 Audit Objective

Identify recommendations for (a) job acquisition strategy and corpus composition rebalancing, (b) the "10+ daily matches" promise feasibility and possible redefinition, (c) dormant tier optimization, and (d) any remaining technical improvements to the matching pipeline — and recommend concrete improvements to make the core user promise achievable.

---

## 2. Business Model & User Journey

### 2.1 User Personas (Test Setup)

A single onboarded user with three personas covering the industry-median software-engineering skill spectrum:

| Persona | Skill Focus | Purpose |
|---|---|---|
| Front-end | React, Next.js, TypeScript, Tailwind | Standard front-end roles |
| Back-end | Node.js, Express/NestJS, PostgreSQL | Standard back-end roles |
| Full-stack | Combined front+back, modern frameworks | Widest match surface |

Each persona has: `mustHaveTags` (max 5), `blocklistTags`, `personaEmbedding` (1536-d), `embeddingSummary` (3-sentence LLM context), and `seniorityLevels`.

### 2.2 User Promise

> **"10+ new matched and approved jobs delivered to the user dashboard every day."**

This is the core success metric. As configured today (single user, Serbia, remote-only), the system's ability to deliver this depends on the unresolved strategic challenges in §7.

### 2.3 User Funnel

```
Sign-up (Better Auth)
  → Onboarding (CV upload → pdfjs-dist Web Worker → LLM extraction)
  → Persona creation (must-have tags, blocklist, embedding summary, seniority)
  → Applicant preferences (country, assignmentTypes, modalities, compliance, work auth)
  → Continuous matching (Inngest-driven ingestion → 3-gate pipeline)
  → Dashboard delivery (approved matches, sorted by composite 0–100 score)
```

### 2.4 Success Metrics

| Metric | Target | Current |
|---|---|---|
| Daily qualified matches per user | ≥10 | TBD (filtering fixed, pending reprocessing) |
| Match approval rate (Gate 3 approve / Gate 1+2 candidates) | TBD | ~9.7% (32 approved / 298 rejected, per calibration session) |
| Approved match score (display) | — | avg 54.1/100, range 33–75 |
| Rejected match score | — | avg 39.9/100, range 19–60 |

---

## 3. System Architecture Overview

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  ACQUISITION LAYER (Inngest durable jobs)                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Batch Seeders│  │ Daily Drivers│  │ Tiered ATS Pollers       │  │
│  │ (B1–B10)     │  │ (D1–D13)     │  │ (active_hot/active/      │  │
│  │ monthly      │  │ 2x daily     │  │  dormant/dead)           │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────────┘  │
│         └──────────────────┴─────────────────────┘                  │
│                            ▼                                        │
│         ┌────────────────────────────────────┐                      │
│         │ Company Registry (Neon PostgreSQL) │                      │
│         └────────────────────────────────────┘                      │
│                            ▼                                        │
│         ┌────────────────────────────────────┐                      │
│         │ ATS Polling (2 req/s per platform) │                      │
│         │ Greenhouse/Lever/Ashby/SmartRecr/  │                      │
│         │ Workable/Recruitee                 │                      │
│         └────────────────┬───────────────────┘                      │
└──────────────────────────┼──────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PROCESSING PIPELINE (per ingested job, Inngest event-driven)       │
│  ┌─────────┐  ┌────────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐ │
│  │ Gate 0  │→ │ Normalize  │→ │ Gate 0.5│→ │ Gate 1+2│→ │ Gate 3 │ │
│  │ title   │  │ (tags +    │  │ hard    │  │ GIN +   │  │ LLM    │ │
│  │ filter  │  │  embedding)│  │ blocker │  │ HNSW    │  │ arbiter│ │
│  └─────────┘  └────────────┘  └─────────┘  └─────────┘  └────────┘ │
│                                              ↓                      │
│                                              ▼                      │
│                              match_queue (approved/rejected)        │
└─────────────────────────────────────────────────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DELIVERY LAYER (Next.js 16 App Router)                             │
│  Dashboard → approved matches sorted by composite 0–100 score       │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.2 (App Router) | Server Components by default |
| Language | TypeScript (strict) | Zod for all external data |
| UI | Tailwind CSS 4.3 + Shadcn/ui 4.8 | CSS-first `@theme` config |
| ORM | Drizzle ORM | Raw SQL only for vector/GIN queries |
| Database | PostgreSQL (Neon) + pgvector | 512 MB plan limit |
| Vector index | HNSW (`vector_cosine_ops`) | 1536-d embeddings |
| Auth | Better Auth | Email/password + OAuth |
| Background jobs | Inngest v4 | 52 registered functions |
| AI | Vercel AI SDK | gpt-4o, gpt-4o-mini, text-embedding-3-small |
| Hosting | Vercel + Neon + self-hosted Inngest | — |
| Lint/format | Biome 2.2 | — |
| Tests | Vitest 4.1 + Playwright 1.60 | Unit + E2E separation |

### 3.3 Data Flow

```
ATS JSON API → ats-adapters.ts (per-platform parsing)
  → job-normalizer.ts (tags via LLM, embedding, metadata extraction, remote_scope inference)
  → Gate 0.5 pre-filter (hard blockers: geo, comp, experience)
  → Gate 1+2 SQL router (GIN overlap + HNSW cosine, LIMIT 8 candidates)
  → Gate 3 LLM (gpt-4o-mini, A/B prompt variants: balanced/strict/thorough)
  → match_queue (status: pending → approved/rejected/error/stale)
  → dashboard-queries.ts (composite 0–100 display score)
```

---

## 4. Core Technical Implementation Strategies

### 4.1 Job Acquisition Strategies

#### 4.1.1 Company Extraction (Batch Seeders — Initial Push)

| Source | ID | Schedule | Yield | Startup Bias? |
|---|---|---|---|---|
| HTTP Archive BigQuery | `bigQuerySeeder` | Monthly (1st) | High | **No** — ingests any domain with target tech stack + ATS detection |
| Wayback CDX | B7 | Monthly (1st) | 4,163 (top source) | **No** |
| HN Algolia ("Who is hiring") | `seeder-hn-algolia` | Daily (first 7 days of month only) | — | **Yes** — HN startups |
| YC Directory | B3 | Quarterly | 374 | **Yes** — YC startups only |
| VC Portfolios | B4 | Monthly | 36 | **Yes** — VC-funded |
| Newsletter Archives | B5 | Monthly | 257 | No |
| Workable Meta-Search | B1 | Monthly (1st) | — | No |
| Brave Search Batch | B2 | Monthly (1st) | — | No |
| Cross-Pollination | B9 | Monthly | 11 | No |
| Sitemap Probe | B10 | Weekly | — | No |
| crt.sh Certificate Transparency | B8 | Monthly (1st) | — | No |
| Rapid7 FDNS v2 | B8 | Event-triggered | — | No |
| Custom URL Resolver | `seeder-resolve-custom-url` | Event-triggered | — | No — resolves non-ATS URLs from HN Algolia via CNAME + slug probe |

> **Note:** Google CSE was replaced by Brave Search API in Sprint 3. The `google-cse.ts` file remains in the codebase but is not registered as an Inngest function.

**BigQuery query filter (the highest-volume undifferentiated source):**
Filters on Wappalyzer `technologies` column for tech stacks (Next.js, React, Vue, Node.js, Tailwind, etc.) AND requires Greenhouse/Lever/Workable detection. **No company-size, employee-count, or revenue filtering.** Whatever domain has the target stack + an ATS gets ingested.

#### 4.1.2 Company Extraction (Daily Drivers — Continuous Discovery)

13 daily sources (D1–D13) running 2x daily on staggered crons: Brave Search, HN Algolia, Reddit RSS, Remote Job Boards, WWR RSS, CertStream, Funding Signal, Product Hunt, Engineering Blogs, GitHub Trending, Tech News RSS, NPM Registry, Meta Ads.

**Startup-biased daily sources:** HN Algolia (small startups), Product Hunt (small startups), Tech News RSS (funding announcements Series A/B), Funding Signal.

**Undifferentiated daily sources:** Brave Search, Reddit RSS, Remote Job Boards, WWR RSS, CertStream, Engineering Blogs, GitHub Trending, NPM Registry, Meta Ads.

#### 4.1.3 ATS Integration

6 ATS platforms supported via native JSON APIs (no HTML scraping):

| Platform | API Host | Structured `workplaceType`? | Structured `locationCountries`? |
|---|---|---|---|
| Greenhouse | boards-api.greenhouse.io | **No** — heuristic only | **No** |
| Lever | api.lever.co | **Yes** | **No** |
| Ashby | api.ashbyhq.com | **Yes** | **No** (public API returns string) |
| SmartRecruiters | api.smartrecruiters.com | — | — |
| Workable | apply.workable.com | — | — |
| Recruitee | api.recruitee.com | — | — |

**Rate limiting:** `bottleneck` library, `maxConcurrent: 1, minTime: 500` per ATS source = 2 req/s per platform. Each platform has an independent limiter (parallel across platforms).

#### 4.1.4 Inngest Polling Pipeline

| Function | Schedule | Purpose |
|---|---|---|
| `batchPollTier` | active_hot: every 3h, dormant: every 12h | Tier-based batch polling |
| `tierRecalc` | Daily 04:00 UTC | Re-bucket companies by activity |
| `qualityFlywheelRecalc` | Daily 04:30 UTC | Promote/demote tiers by match quality |
| `layoffSignalChecker` | Daily 05:00 UTC | Demote companies with recent layoffs |
| `aggressiveCleanup` | Daily 02:00 UTC | Delete terminal-state jobs |
| `staleCleanup` | Daily 03:00 UTC | Mark stale/gone jobs |
| `companyRevivalSweep` | Daily 05:00 UTC | Re-enable dead companies after 7d |

**Tier distribution (post-flush, per blueprint):** 475 active / 4,815 dormant / 0 dead.

#### 4.1.5 Current Corpus Size

- **Companies:** ~5,290 (target 5,000 — exceeded)
- **Active jobs:** ~4,086 (from 449 companies polled so far)
- **Projected at full poll:** 21,500–50,000 jobs (5–50 jobs/company)

> **Audit note:** The corpus target was met by *company count*, but only ~8.5% of companies (475/5,290) are in the active polling tier. The dormant tier (4,815 companies) is polled weekly at best, meaning the projected 21,500–50,000 jobs is **not yet realized** — the actual active job corpus is ~4,086.

### 4.2 3-Gate Matching System

#### 4.2.1 Gate 1 — GIN Index Tag Overlap

**File:** `src/lib/jobs/gate-1-2.ts` (lines 133–208)

```sql
-- Gate 1 clause (text array overlap using GIN index)
p.must_have_tags && ${tagsArraySql}          -- ≥1 overlapping must-have tag
AND NOT (p.blocklist_tags && ${tagsArraySql}) -- zero blocklist hits
```

- **Threshold:** ≥1 overlapping must-have tag, zero blocklist hits
- **Index:** `persona_must_have_tags_idx` (GIN), `persona_blocklist_tags_idx` (GIN), `jobs_extracted_tags_idx` (GIN)

#### 4.2.2 Gate 2 — HNSW Cosine Similarity

```sql
AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${GATE2_MAX_COSINE_DISTANCE}::real
```

- **Threshold:** `GATE2_MAX_COSINE_DISTANCE = 0.50` (env-configurable via `GATE2_MAX_COSINE_DISTANCE`)
- **Calibration history:** 0.35 (initial, rejected 100% of real pairs) → 0.55 → 0.48 → 0.50 (current)
- **Index:** `persona_embedding_hnsw_idx` (HNSW, `vector_cosine_ops`), `job_embedding_hnsw_idx` (HNSW)
- **Dimensions:** 1536 (`text-embedding-3-small`)

#### 4.2.3 Gate 1+2 Composite Ordering (Candidate Selection)

```sql
ORDER BY (
  (1 - EXP(-0.4 * LEAST(ov.overlap_score, 5))) * 0.6   -- Gate 1 weight
  + (1 - cosine_distance) * 0.4                          -- Gate 2 weight
) DESC
LIMIT 8   -- GATE_ROUTER_LIMIT
```

**Max 8 candidates** per job proceed to Gate 3. The composite score blends tag overlap (60%) and semantic similarity (40%) for *candidate selection* (recall). This is separate from the dashboard display score (precision).

#### 4.2.4 Gate 3 — LLM Arbitration

**File:** `src/lib/jobs/gate-3.ts`
**Model:** `gpt-4o-mini`
**A/B variants:** `balanced` (default), `strict`, `thorough` — randomly assigned per candidate.

**7 evaluation criteria in the system prompt:**
1. Tech stack alignment (description is source of truth, tags may be incomplete)
2. Seniority fit (don't reject on small year gaps; respect persona `seniorityLevels`)
3. Hard constraints (workplace type vs assignment types; modalities; compliance)
4. Country-specific remote restrictions (US-only + W-2 = hard blocker; US-only + contractor-friendly = soft; other countries = hard blocker without compliance)
5. Blocklist tags (immediate reject)
6. Domain relevance (React dev ≠ React Native game dev)
7. Work authorization requirements (citizenship/permits; `workAuthRiskFlag` for silent JDs on hybrid/single-country-remote)

**Output schema (Zod-validated):**
```typescript
{
  approved: boolean,
  matchConfidence: number,    // 0.0–1.0
  matchReasoning: string,     // 1–3 sentences
  blockers: string[],         // hard disqualifiers
  workAuthRiskFlag: boolean   // silent JD + hybrid/single-country-remote
}
```

#### 4.2.5 Performance Targets

- **Gates 1+2:** <20ms (per `AGENTS.md` line 80). Calibration notes confirm queries are "well under the 20ms target" at current scale.
- **Gate 3:** LLM round-trip (not formally benchmarked).

#### 4.2.6 Display Match Score (0–100, dashboard)

**File:** `src/lib/jobs/dashboard-queries.ts` (lines 140–249)

```
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

This is a **post-hoc ranking score**, not a matching filter. It does not affect which jobs pass the gates. The `locationMatch` component now uses `remote_scope = 'global'` for a perfect score (1.0), improving ranking of global remote jobs.

### 4.3 User Preferences & Filtering

#### 4.3.1 Stored Preferences (`applicant` table)

| Field | Type | Example (test user) |
|---|---|---|
| `country` | text (ISO 3166-1 alpha-2) | `RS` (Serbia) |
| `assignmentTypes` | `assignment_type[]` | `["remote"]` (remote-only) |
| `modalities` | `modality[]` | full-time, contract, etc. |
| `preferredCompliance` | `compliance[]` | w8ben, ic_global, b2b, etc. |
| `seniorityLevels` | `seniority_level[]` | senior, lead, etc. |
| `workAuthorizations` | `text[]` | eu_citizen, rwr_card_plus, etc. |
| `expectedCompMin` | numeric (annual USD) | nullable (soft-fail-open) |
| `yearsOfExperience` | integer | nullable (soft-fail-open) |

#### 4.3.2 Where Filtering Happens in the Pipeline

```
Gate 0 (title filter)           ← rejects garbage titles
  → Normalization               ← extracts tags, embedding, workplaceType, remoteScope, location
  → Gate 0.5 (hard blocker)     ← LOCATION/REMOTE FILTERING HAPPENS HERE
  → Gate 1+2 (tag + vector)     ← tech match only
  → Gate 3 (LLM)                ← nuanced final evaluation
```

**Gate 0.5** hard-rejects jobs that are explicitly on-site in a foreign country, have title region tags excluding the applicant, or have country-fenced remote lists excluding the applicant. Jobs with `workplaceType = null` (undetermined — common for Greenhouse) are **passed through to Gate 3 (LLM)**, which reads the full JD text to determine remote/on-site status. Global-remote jobs (`remoteScope = "global"`) bypass the country list check.

---

## 5. Current Performance & Metrics

### 5.1 Ingestion Metrics

| Metric | Value | Source |
|---|---|---|
| Companies ingested | ~10,003 | live DB query (July 2026) |
| Active polling tier (active_hot + active) | 2,454 companies (24.5%) | live DB query |
| Dormant tier | 7,549 companies (75.5%) | live DB query |
| Active jobs | 459 | live DB query |
| Jobs normalized (tags + embedding) | 0 | live DB query |
| Jobs rejected (Gate 0 / normalizer) | 35 (no embeddings — legitimate rejections) | live DB query |
| Jobs normalization_failed | 79 (retryable — LLM errors, rate limits) | live DB query |
| Match queue entries | 0 | live DB query |
| ATS platforms | 6 (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee) | — |
| Inngest functions | 52 registered | — |

> **Critical observation:** Despite 10K companies and 2,454 in the active polling tier, only 459 jobs have been ingested and **none have been normalized**. The matching pipeline has not processed any jobs — the match queue is empty. This suggests either (a) the polling pipeline is not running, (b) jobs are being ingested but normalization is failing silently, or (c) the system was recently reset/flushed. This needs investigation before the Gate 0.5 fix can have any effect.

### 5.2 Matching Performance

| Metric | Value | Source |
|---|---|---|
| Gate 3 approval rate | ~9.7% (32 approved / 298 rejected) | calibration session |
| Approved display score (avg) | 54.1/100 (range 33–75) | calibration session |
| Rejected display score (avg) | 39.9/100 (range 19–60) | calibration session |
| Approved/rejected score gap | 14.2 points | calibration session |

### 5.3 System Health

| Subsystem | Status |
|---|---|
| Storage monitoring | Neon API integration, hourly checks, 4 threshold levels (80/88/94% + 75% recovery) |
| WAL protection | Inflation detection (abort on 2 consecutive storage increases), 20% corpus limit, 48h age minimum |
| Emergency purge | 5-tier deletion (normalization_failed → rejected → gone → stale → active FIFO), approved matches protected |
| Pipeline health monitor | 8 metrics checked every 30 min |
| Source health | Per-source circuit breaker (degraded at 3 failures, hard trip at 5) |

---

## 6. Database Schema & Data Model

### 6.1 Key Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `user` | Auth (Better Auth) | id, email, role |
| `applicant` | User preferences (1:1 with user) | country, assignmentTypes, modalities, compliance, workAuthorizations, expectedCompMin, yearsOfExperience |
| `persona` | Developer personas (many per applicant) | mustHaveTags, blocklistTags, personaEmbedding (vector 1536), embeddingSummary, seniorityLevels |
| `company` | ATS company registry | atsSlug, atsSource, tier, health, fusionScore, pollingEnabled |
| `job` | Ingested job postings | title, extractedTags, jobEmbedding (vector 1536), workplaceType, remoteScope, locationName, locationCountries, titleRegionTag, status |
| `match_queue` | Match results (job × persona) | overlapScore, cosineDistance, status, llmVerdict, llmReasoning, llmConfidence, llmBlockers, workAuthRiskFlag |
| `company_quality_score` | Bayesian quality score per company | score (0–100), approvedMatches, rejectedMatches |
| `ingestion_log` | Audit trail for ingestion runs | type, status, itemsProcessed/Inserted/Rejected |
| `alerts` | System health alerts | type, severity, status |

### 6.2 Indexing Strategy

| Index Type | Table.Column | Index Name | Purpose |
|---|---|---|---|
| GIN | `job.extracted_tags` | `jobs_extracted_tags_idx` | Gate 1 tag overlap |
| GIN | `persona.must_have_tags` | `persona_must_have_tags_idx` | Gate 1 tag overlap |
| GIN | `persona.blocklist_tags` | `persona_blocklist_tags_idx` | Gate 1 blocklist filter |
| HNSW | `job.job_embedding` | `job_embedding_hnsw_idx` | Gate 2 cosine similarity |
| HNSW | `persona.persona_embedding` | `persona_embedding_hnsw_idx` | Gate 2 cosine similarity |
| B-tree | `job.(status, last_seen_at)` | `job_status_idx` | Stale cleanup |
| B-tree | `job.workplace_type` | `job_workplace_type_idx` | Workplace filtering |
| B-tree | `job.title_region_tag` | `job_title_region_tag_idx` | Gate 0.5 geo-fencing |
| B-tree | `job.remote_scope` | `job_remote_scope_idx` | Remote scope filtering |
| Partial | `match_queue.applicant_id` WHERE is_read=false AND status='approved' | `match_queue_unread_badge_idx` | Unread badge |
| Composite | `match_queue.(applicant_id, status, created_at DESC)` | `match_queue_applicant_status_idx` | Dashboard list query |

### 6.3 Vector Embeddings

- **Model:** `text-embedding-3-small` (OpenAI), 1536 dimensions
- **Job embedding:** generated from cleaned `title + stripped description`
- **Persona embedding:** generated from `embeddingSummary` (3-sentence dense summary)
- **Operator:** `<=>` (cosine distance, lower = more similar)
- **Token limit:** 8192 (truncated to 24,000 chars for safety)

### 6.4 Data Relationships

```
user (1) ─── (1) applicant
                  │
                  ├── (many) persona ──── (many) match_queue
                  ├── (many) cv_upload ── (many) working_history
                  └── (many) tags_experience
                  
job (many) ─── (many) match_queue
  └── logical link to company (via atsSource + atsSlug, NOT a FK)

company (1) ─── (many) ingestion_log
company (1) ─── (1) company_quality_score
```

> **Note:** `company ↔ job` is a **logical relationship** (matched by `atsSource + atsSlug`), not a Drizzle FK. This is intentional — to avoid poller failures when a job arrives for a slug not yet in the registry.

### 6.5 Enum Types (Key)

| Enum | Values |
|---|---|
| `workplace_type` | `remote`, `hybrid`, `on-site` |
| `remote_scope` | `global`, `country_fenced`, `unknown` |
| `assignment_type` | `remote`, `hybrid`, `on-site`, `remote_local` |
| `company_tier` | `active_hot`, `active`, `dormant`, `dead` |
| `company_health` | `healthy`, `degraded`, `rate_limited`, `blocked`, `error`, `dead` |
| `compliance` | `w2`, `local_employment`, `eor`, `b2b`, `1099`, `w8ben`, `ic_global` |
| `discovery_source` | 14 values (httparchive, hn_algolia, yc_directory, vc_portfolio, wayback_cdx, ...) |

The `remote_scope` enum distinguishes global remote (`global`) from country-fenced remote (`country_fenced`) from undetermined (`unknown`). It is populated at normalization time via the `inferRemoteScope()` heuristic, which scans location name and JD content for global-remote indicators ("Remote - Global", "work from anywhere", "distributed team") and country-fenced indicators ("Remote - US Only", "must be located in"). Jobs with `remote_scope = "unknown"` are evaluated by Gate 3 (LLM) as fallback.

---

## 7. Current Challenges & Pain Points

### 7.1 Corpus Composition Skews Large/Established

#### 7.1.1 The User's Observation (Confirmed by Code Review)

The user reports the corpus skews toward large established companies (Vercel, Perplexity, Reddit). **Code review confirms:** The highest-volume acquisition sources (BigQuery, Wayback CDX) are **undifferentiated** — they ingest any domain with a target tech stack + ATS detection, with no company-size, employee-count, or revenue filtering. Startup-biased sources exist (HN Algolia, YC Directory, VC Portfolios, Product Hunt, funding signals) but contribute a small fraction of total volume:

| Source | Companies | Startup-biased? |
|---|---|---|
| Wayback CDX | 4,163 | No |
| YC Directory | 374 | Yes |
| Newsletter Archives | 257 | No |
| VC Portfolios | 36 | Yes |
| Cross-Pollination | 11 | No |

> **Note:** HN Algolia is startup-biased but its yield is not shown here because it runs as a delta seeder (only first 7 days of each month) and its discovered companies are resolved via the Slugger, so they appear under the Slugger's discovery source rather than `hn_algolia` in the company table.

The top source (Wayback CDX, 4,163 companies = 78.7% of corpus) has **no startup bias whatsoever**.

#### 7.1.2 Impact

- Large companies: already heavily advertise, high competition, low differentiation value for VectorMatch users
- Missing: startups, small/non-tech companies, companies offering global remote
- The corpus exceeds the *quantity* target (10K companies vs 5K target) but not the *quality* target (startup/small-company/global-remote focus)

### 7.2 Dormant Tier Dominance Limits Active Job Volume

75.5% of the company corpus (7,549/10,003) is in the **dormant tier** (polled weekly at best). Only 2,454 companies (24.5%) are in the active polling tiers (active_hot + active). Despite this, only 459 jobs have been ingested and **none normalized** — the matching pipeline has not processed any jobs. This means:
- The "21,500–50,000 jobs" headline figure is **projected**, not actual
- Actual active job corpus is 459 jobs (0 normalized)
- The match queue is empty — zero matches have been delivered
- The eligible corpus for a Serbia + remote-only user depends on normalization running, then Gate 0.5 + Gate 3 processing

### 7.3 Additional Observed Issues

#### 7.3.1 Gate 2 Threshold Was Initially Too Strict

The initial `GATE2_MAX_COSINE_DISTANCE = 0.35` rejected 100% of real persona-job pairs. It was raised through 0.55 → 0.48 → 0.50 (current). This indicates the embedding distance distribution for real data is much wider than synthetic seed data predicted (synthetic: 0.18–0.21; real: 0.45–0.74). The threshold is now calibrated but this history suggests **embedding-based matching may be less discriminative than expected** on real data.

#### 7.3.2 Display Score Has Known False Negatives

Per the calibration session, 8 rejected matches score above the approved average (54.1). Top false negatives are rejected for reasons not captured in the score formula:
- Experience gap (job asks 8+ years, persona has 7+)
- Employment type / contractor language
- Location (London on-site, Japan-only)

The experience-gap signal is documented as the "next highest-impact signal" but is **not yet implemented** in the display score (only in Gate 0.5 as a soft-fail-open check).

#### 7.3.3 `locationCountries` Field Is Always Null

The schema includes `locationCountries` (text array) for structured country-list filtering, but **no ATS provides this in their public API**. The field is always `null`. Gate 0.5 Check 2 (location country lists) therefore falls back to parsing the free-text `locationName` for comma-separated country lists — a fragile heuristic. An LLM-based extraction at normalization time could populate this field reliably.

---

## 8. Recent System Improvements

### 8.1 Storage Monitoring (Neon API Integration)

- **File:** `src/lib/jobs/neon-api.ts`
- Monitors `synthetic_storage_size` (what Neon enforces against the 512 MB limit)
- 4 threshold levels: 80% early warning, 88% ingestion halt, 94% critical, 75% recovery
- Hourly checks via `storageMonitor` Inngest function
- Auto-resolves alerts when storage drops below 88%

### 8.2 WAL Protection

- **File:** `src/lib/jobs/poller/cleanup-queries.ts` (lines 159–494)
- **WAL inflation detection:** Aborts purge if storage increases for 2 consecutive batches (`PURGE_MAX_WAL_INFLATION_BATCHES = 2`)
- **Active FIFO corpus protection:** Max 20% of active jobs deletable per run (`PURGE_ACTIVE_FIFO_MAX_CORPUS_FRACTION = 0.2`), 48-hour age minimum (`PURGE_ACTIVE_FIFO_MIN_AGE_HOURS = 48`)
- **Approved match exclusion:** Jobs with approved matches are never deleted

### 8.3 Emergency Purge

- 5-tier deletion order (safest first): `normalization_failed` → `rejected` → `gone` → `stale` → `active` FIFO (last resort)
- Per-batch `VACUUM ANALYZE` to reclaim space
- Stops at 75% storage recovery

### 8.4 Gate 0.5 Geo-Fencing (July 2026)

- **File:** `src/lib/jobs/gate-zero-pre-filter.ts`
- 3 geo-fencing patterns: title region tags, location country lists, explicit on-site in foreign country
- Compensation tier mismatch (soft-fail-open)
- Experience band inversion (soft-fail-open)
- Jobs with `workplaceType = null` (undetermined) pass through to Gate 3 (LLM) — they are NOT hard-rejected
- Global-remote jobs (`remoteScope = "global"`) bypass the country list check

### 8.5 Remote Scope Classification (July 2026)

- **File:** `src/lib/jobs/job-normalizer.ts` (`inferRemoteScope()`)
- New `remote_scope` enum and column: `global`, `country_fenced`, `unknown`
- Heuristic classification at normalization time based on location name + JD content
- Integrated into all 6 ATS extractors (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee)
- Used in Gate 0.5 Check 2 (global bypass) and display score (global = perfect location score)

### 8.6 Aggregator Blacklist (July 2026)

- **File:** `src/lib/jobs/seeders/aggregator-blacklist.ts`
- Known job aggregators (Hirehangar, Ketryx) are filtered at ingestion time
- Integrated into both `insertDiscoveredCompanies` (batch) and `insertResolvedCompany` (Slugger)
- Extensible — new aggregators can be added to the blacklist arrays

### 8.7 Match Sorting Controls

- 3 sort options: `best_match` (composite score DESC), `newest`, `oldest`
- Composite score: 25% semantic + 30% overlap + 12% workplace + 8% location + 8% seniority + 17% quality − 10% blocklist − 10% coverage − 8% secondary domain

### 8.8 Work Authorization Filtering (Gate 3)

- `workAuthRiskFlag` added to `match_queue` (boolean, default false)
- Gate 3 sets flag when JD is silent on work auth but role is hybrid/single-country-remote
- 10 permit types supported (eu_citizen, rwr_card_plus, blue_card_eu, uk_settled, etc.)

### 8.9 Match Status Management

- 7 editable statuses: approved, rejected, stale, pending, mark_read, mismatch, applied
- `markAllMatchesRead` server action
- `staleJobVerifier` (daily 06:00 UTC) re-checks approved matches against ATS, marks stale if job gone

---

## 9. Questions for Consultants

### 9.1 Acquisition Strategy

1. **Are we targeting the right job sources?** The top source (Wayback CDX, 78.7% of corpus) is undifferentiated. Should we de-prioritize it in favor of startup-biased sources (YC, VC portfolios, Product Hunt, funding signals)?
2. **What company-size signals** could we incorporate at ingestion time? (Employee count from Crunchbase API? Revenue from public records? LinkedIn company size?)
3. **Is the 5,000-company target meaningful** if 91% are dormant and only 475 are actively polled?

### 9.2 Matching Algorithm

4. **Are the 3 gates too restrictive in sequence?** Gate 0.5 → Gate 1 → Gate 2 → Gate 3 is a strict funnel where each stage can irrecoverably reject jobs. Should there be a "resurrection" path for Gate 0.5 rejections when Gate 3 capacity allows?
5. **Is `GATE_ROUTER_LIMIT = 8` sufficient?** With 3 personas, a job produces at most 8 candidate pairs for Gate 3. Is this enough recall?
6. **The Gate 2 threshold (0.50) was tuned through 4 iterations.** Is the current calibration methodology (empirical tuning against live match_queue) sound, or should we invest in a labeled dataset?

### 9.3 Data Quality & Metadata

7. **`locationCountries` is always null** — no ATS provides it in their public API. Should we invest in LLM-based country extraction at normalization time to populate it?
8. **The Greenhouse workplace-type heuristic misses ~85% of jobs** (per the normalizer's own comment). Should we use an LLM call at normalization time to classify workplace type more accurately, accepting the added cost?

### 9.4 User Promise

9. **Is "10+ daily matched and approved jobs" realistic** for a single user with 3 personas, location-locked to Serbia, remote-only — given the current corpus composition and filtering pipeline?
10. **What is a realistic promise** given the constraints? Should the promise be per-week? Per-persona? Conditional on corpus size for the user's preferences?
11. **Should the 30% global remote ratio goal** be enforced at acquisition time (preferentially ingest global remote jobs) or at delivery time (filter/rank the dashboard)?

### 9.5 Strategic

12. **The core differentiator is "untapped opportunities at startups/small companies before competitors see them."** Does the current acquisition strategy (78.7% Wayback CDX, undifferentiated) actually serve this differentiator?
13. **Should we pivot from breadth (5,000 companies) to depth (500 high-quality startup-focused companies with daily polling)?**
14. **What is the minimum viable corpus composition** (startup %, global remote %, non-tech %) needed to deliver the user promise for a Serbia + remote-only user?

---

## 10. Appendix

### 10.1 Key File References

| Component | File |
|---|---|
| Gate 0.5 pre-filter | `src/lib/jobs/gate-zero-pre-filter.ts` |
| Gate 1+2 SQL router | `src/lib/jobs/gate-1-2.ts` |
| Gate 3 LLM arbiter | `src/lib/jobs/gate-3.ts` |
| Job normalizer (ATS parsing, remote scope) | `src/lib/jobs/job-normalizer.ts` |
| ATS endpoints config | `src/lib/jobs/ats-endpoints.ts` |
| ATS adapters | `src/lib/jobs/poller/ats-adapters.ts` |
| Rate limiter | `src/lib/jobs/poller/rate-limiter.ts` |
| BigQuery seeder | `src/lib/jobs/seeders/bigquery-seeder.ts` |
| HN Algolia seeder | `src/lib/jobs/seeders/hn-algolia.ts` |
| Aggregator blacklist | `src/lib/jobs/seeders/aggregator-blacklist.ts` |
| Inngest functions (52) | `src/inngest/functions.ts` |
| Inngest client | `src/inngest/client.ts` |
| Inngest route handler | `src/app/api/inngest/route.ts` |
| Dashboard queries (display score) | `src/lib/jobs/dashboard-queries.ts` |
| Matching config (thresholds) | `src/lib/jobs/matching-config.ts` |
| Storage monitoring (Neon API) | `src/lib/jobs/neon-api.ts` |
| Storage check (thresholds) | `src/lib/jobs/storage-check.ts` |
| Emergency purge / cleanup | `src/lib/jobs/poller/cleanup-queries.ts` |
| Alerting | `src/lib/jobs/alerting.ts` |
| Embeddings | `src/lib/ai/embeddings.ts` |
| DB schema (index) | `src/db/schemas/index.ts` |
| Job schema | `src/db/schemas/jobs/job.ts` |
| Persona schema | `src/db/schemas/jobs/persona.ts` |
| Applicant schema | `src/db/schemas/jobs/applicant.ts` |
| Match queue schema | `src/db/schemas/jobs/matchQueue.ts` |
| Company schema | `src/db/schemas/jobs/company.ts` |
| Enums | `src/db/schemas/jobs/enums.ts` |

### 10.2 Key Documentation

| Document | Path |
|---|---|
| Technical Implementation (governing) | `docs/governing/VectorMatchTechicalImplementation.md` |
| Blueprint (governing) | `docs/governing/vectormatch-blueprint.md` |
| Company Corpus Expansion Prompt | `docs/governing/company-corpus-expansion-prompt.md` |
| Gate 0.5 Geo-Fencing Handoff | `docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md` |
| Calibration Report | `docs/reports/calibration-report.md` |
| Matching Score Calibration Session | `docs/reports/matching-score-calibration-session.md` |
| Corpus Expansion Handoff | `docs/reports/CORPUS_EXPANSION_HANDOFF.md` |
| Pipeline Stress Test Handoff | `docs/reports/PIPELINE_STRESS_TEST_HANDOFF.md` |
| Database Schema | `docs/reports/database-schema.md` |

### 10.3 Calibration & Analysis Scripts

| Script | Purpose |
|---|---|
| `scripts/calibrate-routing-engine.ts` | Funnel threshold calibration |
| `scripts/analyze-approved-matches.ts` | Per-match score breakdown |
| `scripts/analyze-rejected-matches.ts` | Rejected-match distribution, false negatives |
| `scripts/investigate-wordpress-matching.ts` | Secondary-domain mismatch case study |
| `scripts/audit-approved-against-gate-0-5.ts` | Audit approved matches against Gate 0.5 logic |
| `scripts/rerun-gates.ts` / `rerun-gates-sql-only.ts` | Re-run gates on existing jobs |
| `scripts/rerun-gate-3-direct.ts` | Re-run Gate 3 LLM only |
| `scripts/backfill-fusion-scores.ts` | Backfill company fusion scores |
| `scripts/seed-routing-engine.ts` | Synthetic persona/job seeding for stress testing |

### 10.4 Test Data (3 Personas)

No production seed data exists for the test personas. The only persona generation is in `scripts/seed-routing-engine.ts` (synthetic, 5 archetypes: Senior React, Python Backend, DevOps, iOS, Junior FE). The actual test user's 3 personas (front-end, back-end, full-stack) were created via the onboarding flow and are stored in the `persona` table with real embeddings.

### 10.5 Sample Jobs That Failed Matching (from Calibration Session)

| Job | Persona | Score | Rejection Reason |
|---|---|---|---|
| Principal Full Stack Developer with React (Remote, Global) | Next.js / AI Full-Stack | 59/100 | 8+ years vs 7+ years experience |
| Senior Software Engineer, Trading Platform GUI (DRW) | — | 56/100 | London on-site location |
| Forward Deployed Engineer - Applied AI (DevRev) | — | 56/100 | Japan-only location |
| Senior Forward Deployed Engineer (DevRev) | — | 60/100 | Employment-type/contractor language |

> **Note:** These jobs survived Gate 0.5 (their locations contained remote/country keywords) but were rejected at Gate 3. The experience-gap and employment-type rejection reasons are not yet captured in the display score formula.

---

## 11. Initial Insights from Internal Code Review (for External Auditors)

The following initial insights were identified during preparation of this document and are provided to help auditors get a swift grasp of the core issues before building their analysis.

### 11.1 Acquisition Breadth Does Not Serve the Differentiator

78.7% of the company corpus comes from an undifferentiated source (Wayback CDX). The startup-biased sources (HN Algolia, YC, VC, Product Hunt, funding signals) contribute <10% combined. The corpus exceeds the *quantity* target (10K companies vs 5K target) but not the *quality* target (startup/small-company/global-remote focus).

### 11.2 The Matching Pipeline Has Not Processed Any Jobs

Despite 10K companies and 2,454 in the active polling tier, only 459 jobs have been ingested and **none have been normalized** (no tags, no embeddings). The match queue is empty. This means the Gate 0.5 fix — while correct — has had zero effect yet because no jobs have passed through the pipeline. The first priority should be investigating why normalization is not running (Inngest function not deployed? OpenAI API key not set? Database connection issues?).

### 11.3 The LLM Is Underutilized for Metadata Extraction

The system uses regex heuristics for workplace-type detection at normalization time (cheap, fast, ~85% miss rate on Greenhouse) and reserves LLM calls for Gate 3 final arbitration (expensive, accurate, but only sees jobs that survive Gate 0.5). There is a **cost-accuracy tradeoff opportunity**: using a cheap LLM call (`gpt-4o-mini`) at normalization time to classify `workplaceType` and extract `locationCountries` would dramatically improve metadata quality — at a fraction of the cost of Gate 3 calls on a larger candidate pool.

---

*End of document. Prepared for external audit consultation.*
