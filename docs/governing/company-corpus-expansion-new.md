# Company Corpus Expansion v2 — Governing Document

> **Status:** Strategy finalized (8-round red-team brainstorming session, July 5 2026). Ready for implementation.
>
> **Implementation:** Multi-session. See `docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md` for the 3-session roadmap (Session 1: Phase 1+2, Session 2: Phase 3, Session 3: Phase 4) and mandatory handoff protocol. Each session updates the handoff document's Session State before closing.
>
> **Supersedes:** `company-corpus-expansion-prompt.md` (v1 strategy — batch seeders + flush-and-flow architecture). The v1 strategy's aggregator-dependent sourcing and absence of remote-ratio enforcement produced the corpus composition problems documented in `EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md` §1.4.
>
> **Scope:** Three closing criteria, each independently stress-tested:
> 1. Programmable sourcing pipeline that bypasses middleman/aggregator ATS traps.
> 2. Flawless extraction logic separating true "Global Remote" from "HQ-Locked Remote".
> 3. Programmatic Job Scoring Matrix enforcing 50% remote minimum and penalizing big tech/agencies.

---

## Criterion 1: Programmable Sourcing Pipeline (Aggregator Bypass)

### Discovery Layer

Replace bulk undifferentiated seeders (BigQuery/Wayback CDX) with funding-signal-driven company discovery:

- **Funding-signal sources**: RSS/Atom funding feeds + GitHub Events API for YC/VC-funded orgs. (Crunchbase webhook triggers mentioned in original strategy are deferred for MVP — RSS + GitHub Events cover startup discovery. See handoff doc Pre-Resolved Concern #5.)
- **Startup filter**: `employee_count < 50` enforced before registry insert. Employee count sourced from funding-signal metadata (YC/Crunchbase/GitHub org data) at discovery time; no external enrichment API required for funding-signal-sourced companies.
- **Aggregator blacklist**: All aggregator domains blacklisted at seeder level; never resolve HN non-ATS URLs through aggregators. Non-ATS URLs from HN resolved via DNS CNAME check + slug probe against ATS APIs; if both fail, discard.

### Probe Order (per company domain)

1. `robots.txt` → extract `sitemap.xml` + disallow patterns.
2. Common paths: HEAD then GET on `/jobs`, `/careers`, `/open-roles`, `/hiring`, `/work-with-us` (2s timeout).
3. JSON-LD + microdata parse (`schema.org/JobPosting`).
4. Static HTML fallback: cheerio (existing dep) with job-page-specific main-content heuristics → strip `nav`/`footer`/`header`/`aside`/`script`/`style`, target semantic containers (`main`, `[role="main"]`, `article`, `.jobs`, `.careers`, `.job-listing`), fall back to text-density scoring on top-level divs → regex extract title patterns (`/Senior|Engineer|Developer/i` + tech keywords from persona `mustHaveTags`) + `mailto:` links.
5. RSS/Atom feed scan in `<link>` tags.

### Discard Criteria

- No job-like text (title + ≥50 word description) after 3 path attempts.
- Mailto-only with no role context.
- 4xx/5xx response.
- Content <200 chars after cleaning.
- Aggregator domain detected.
- Log to `ingestion_log` as `discarded_static`; retry weekly via `companyRevivalSweep` only if funding signal refreshed.

### Provisional Job Lifecycle

- **Insert**: `status = 'provisional'`, `tier = 'active_hot'`, `pollingEnabled = false`. Store raw HTML snippet + extracted email in job row.
- **Trigger**: Inngest `normalizeProvisionalJob` event fired post-insert (30s debounce). Listens on `job.created` where `status = 'provisional'`.
- **Retry schedule**: 4 attempts — 5min / 15min / 45min / 90min cumulative. Third attempt fires at 65min; fourth safety attempt at ~2h35m. Buys ~2hr buffer before 3hr breaker check.
- **Parallel normalization steps** (Inngest step boundaries):
  ```
  step.run("extract-and-clean")      → cleaned JD text (Step 1)
    ├─ step.run("embed")             → text-embedding-3-small on cleaned text
    └─ step.run("classify-scope")    → gpt-4o-mini structured Zod call (Step 2)
  step.run("persist-normalized-job") → writes tags + embedding + remoteScope together
  ```
  - Embed and classify are independent (different endpoints, no data dependency). Shared cleaned-text cache from Step 1. Independent retry per step.
- **Transition**: On success → `status = 'active'`, enqueue to `match_queue` via Gate 0.5. Failure after all retries → `status = 'normalization_failed'` at 4hr SLA.
- **SLA**: 4hr end-to-end (provisional→matchable). Provisional jobs are NOT immediate discard candidates; 4hr window preserves startup signal.

### Staleness Gate (Retry Path)

On retry, compare `lastPolledAt` (company registry) vs `sourceFetchedAt` (job record):

- `lastPolledAt` older → no newer poll occurred; safe to resume single-step (skip failed step only, reuse cached result for succeeded step).
- `lastPolledAt` newer → scheduled poller already re-ingested; pull existing `textHash` from upserted row (zero HTTP). If `textHash` changed → full re-normalization (both embed + classify), not retry.
- Last resort only: single-URL fetch through same `bottleneck` limiter (`maxConcurrent: 1, minTime: 500ms`), tagged low-priority (Inngest concurrency key). ~30-60 req/platform/day, <0.05% of rate ceiling.

### Dedup Guard

Hash cleaned JD text (`textHash`) before firing embed/classify. Identical `textHash` on retry → skip re-embedding (deterministic/idempotent), retry only failed step.

### Content-Drift Guard

If job already in `match_queue` when a content-drift retry resolves: cosine-distance old vs. new embedding.

- Below threshold (near-identical, e.g. typo fix) → overwrite in place.
- Above threshold (material JD edit) → `jobVersion++`, re-run Gate 1–3 fresh. Do not mutate already-scored match.

### `retryInFlight` Fencing (Zombie-Write Prevention)

- `retryInFlight` boolean + monotonic `retryGeneration` counter on job row.
- Every retry attempt increments `retryGeneration` and stamps its generation number when setting `retryInFlight = true`.
- **Sweeper** (event-driven + safety-net cron): Primary sweep fires as an Inngest step at the end of each `normalizeProvisionalJob` attempt (both success and failure) — only runs when normalization activity is happening, zero CU-hour cost when pipeline is idle. Safety-net cron at 30min intervals does a conditional skip (`SELECT 1 FROM job WHERE status = 'provisional' LIMIT 1` — exit immediately if no provisional jobs exist) to catch process-death edge cases between event-driven sweeps. Scans `retryInFlight = true AND updatedAt < now() - 10min`, force-clears flag, records `clearedGeneration`.
- Force-clear is **passive** — removes the block preventing breaker observation; does NOT itself count the job as unknown. Breaker only counts at 3hr checkpoint.
- Any write persisting results (or re-setting flag) must carry its originating generation. If generation ≤ `clearedGeneration` → reject as zombie write. Only generation > `clearedGeneration` counts as legitimate new attempt.
- Inngest step timeout set to 5-7min (defense in depth); sweeper is backstop for process death / hung HTTP clients.

---

## Criterion 2: Remote-Scope Extraction (Global vs. HQ-Locked)

### Step 1 — Deterministic Pre-Pass (`job-normalizer.ts`)

- **ATS-native `workplaceType`** (Lever/Ashby only) → trust directly, zero LLM cost.
- **HTML/markdown sources** (no ATS JSON): cheerio-based main-content extraction (existing dep — strip `nav`/`footer`/`header`/`aside`/`script`/`style`, target semantic containers, fall back to text-density scoring) → regex heuristics with confidence-scoring (exact phrase hit vs. weak keyword proximity).
  - High-confidence → accept, zero LLM cost.
  - Inconclusive or extraction degraded (malformed markup, JS-rendered shell, truncated blob) → route to Step 2.
- **Regex hard-signals**:
  - `\b(anywhere|worldwide|global|remote-first)\b` → candidate `global`.
  - `\b(US-only|must reside in|authorized to work in US)\b` → candidate `country_fenced`.
- **Critical rule**: Strip HQ/company location fields entirely from scope inference — never trust registry `company.location`. Greenhouse (~85% miss rate) and null-`workplaceType` skip straight to Step 2.

### Step 2 — LLM Extraction (gpt-4o-mini, at normalization time)

- **Input**: full JD body text only (never company metadata).
- **Structured Zod output**: `{ remoteScope: 'global'|'country_fenced'|'region_fenced'|'onsite'|'undetermined', allowedCountries: string[]|null, workAuthRequired: boolean, confidence: number }`.
- **Persist** `remoteScope` + `allowedCountries` as first-class normalized columns (populate `locationCountries` here, don't leave null).

#### Sync/Batch Split (SLA-criticality, not job type)

The 4hr provisional SLA requires synchronous LLM calls — OpenAI Batch API has up to 24hr turnaround and cannot serve SLA-critical paths. The split is based on whether a job is inside its 4hr provisional window, not on its source tier:

| Path | Criterion | Examples |
|---|---|---|
| **Synchronous** | First-time normalization of a job the breaker is actively counting toward (inside 4hr window, no prior embedding/scope) | New provisional startup-probe jobs; active-tier first-time normalization with inconclusive regex |
| **Batch API** (50% discount, 24hr turnaround) | Job already has prior state, or nothing is waiting on it in real time | Content-drift re-normalization (`jobVersion++`); dormant-tier first-time normalization (weekly cadence); sweeper-discarded jobs recovered for next-cycle inclusion; bulk backlog catch-up |

**Queue isolation is the engineering justification, not cost reduction.** A burst of refresh/backlog volume on the Batch API path can never contend for the same rate-limited synchronous path that active-tier jobs need to hit the 4hr window.

#### Cost Ceiling (Recomputed)

- ~60% of jobs resolve deterministically via Step 1 regex (zero LLM cost).
- Remaining ~40% (~4,000 jobs/day at 10k volume) need Step 2 LLM, split ~30% sync / ~70% batch:
  - Sync: 1,200 jobs × $0.0003/job = $0.36/day
  - Batch: 2,800 jobs × $0.00015/job (50% discount) = $0.42/day
  - LLM total: ~$0.78/day (~$23/month)
- Embeddings (text-embedding-3-small, ~$0.02/M tokens): ~$0.20/day (~$6/month) with same split
- **Combined: ~$1/day (~$29/month)** typical, ~$90/month worst-case if deterministic resolution fails.
- **Provisional-only cost** (Hacker's startup-probe jobs, ~50/day): ~$0.01/day — immaterial.

### Hard-Fail Path

- Empty after cleaning / binary garbage → write `undetermined` + `normalization_failed` (retryable). **Never default to `onsite`/`country_fenced`** — this is the anti-pattern that caused the original zero-match bug.
- Retry queue: second extraction pass (alternate parser lib or headless render as last resort) before permanent `undetermined` + Gate 3 pass-through.

### Nightly Resurrection Job

Re-run Step 2 on `undetermined` / `normalization_failed` jobs when Gate 3 capacity allows. A single LLM miss should not cause permanent exclusion.

### Gate 0.5 Integration

- `remoteScope = 'global'` → bypass country check entirely.
- `remoteScope = 'country_fenced'` → hard-block if applicant country ∉ `allowedCountries`.
- `remoteScope = 'undetermined'` → pass through to Gate 3, never hard-reject on parsing failure.

---

## Criterion 3: Job Scoring Matrix + Remote Minimum Enforcement

### Company Size Score (Persisted)

Persist `company_size_score` in `company_quality_score` table, computed at normalization time in `job-normalizer.ts`.

| Signal | Condition | Score |
|---|---|---|
| Employee count | >5000 | −25 |
| Employee count | 1000–5000 | −15 |
| Employee count | 250–1000 | −5 |
| Employee count | 50–250 | 0 |
| Employee count | <50 | +15 |
| Employee count | <20 | +25 |
| Agency/aggregator flag | `company.is_agency = true` | −40 + `tier = dead` |
| Public/listed company | `company.is_public` or ticker | −20 |
| Source origin | YC/VC portfolio | +15 |
| Source origin | Product Hunt | +10 |
| Source origin | HN Algolia | +5 |
| Source origin | Known aggregator | −30 |
| Company maturity | Seed/Series A, <3 years old | +10 |
| Company maturity | >10 years old | −10 |

- **Clamp** to [−0.30, +0.30]; feed into existing `companyQuality` component (0.17 weight in `dashboard-queries.ts`).
- **Polling tier assignment**: `active_hot` if score > 15, `dormant` if score < −20.

### Global Remote Circuit Breaker: 5-Tier Action Chain

**Timing model**: Provisional jobs count toward unknown sub-floor at **3hr after `detectedAt`**; discarded at **4hr SLA**. 1hr observation window for breaker action.

**Three-bucket denominator**:
- Known-scope ratio: `global / (global + country_fenced) ≥ 50%` — unknown jobs excluded from this ratio.
- Unknown sub-floor: `unknown / (global + country_fenced + unknown) ≤ 30%`.

**5-tier action chain (in trigger-speed order):**

1. **Per-source early-warning breaker** — 3 consecutive provisional normalization failures from one source (generalizable across all `discovery_source` enum values).
   - Action: set source to `degraded`, pause new inserts 15min, emit `alerts` row.
   - Single-test retry at +15min (one provisional job from source).
   - Success → reset to `healthy` + resume. Fail → escalate to 1hr pause + alert. Increment `escalation_count`.
   - Resets on first success post-pause.

2. **Provisional backlog throttle** — progressive rate-limit trigger (not breaker).
   - >15% provisional jobs >1hr old → reduce offending source batch rate 50%.
   - >25% → reduce 90%.
   - >30% → pause source until backlog clears.

3. **Unknown sub-floor guard** — at 3hr count checkpoint.
   - `unknown / (global + country_fenced + unknown) ≥ 30%` → pause sources with >40% unknown yield, force LLM re-classification of backlog.

4. **Corpus-ratio breaker** — strategic corpus-wide guard.
   - `global / (global + country_fenced) < 50%` → halt all non-global-remote ingestion, redirect all seeders to global-remote filters, page on-call.
   - Resets on purge below 15%.

5. **Daily source ban** — escalation cap for chronically broken sources.
   - `escalation_count ≥ 3` in sliding 24hr window → set `source_status = 'banned'`, fire Slack/Discord alert, halt all ingestion from that source.
   - 24hr cooldown via daily Inngest cron (`sourceBanRecoveryCheck`). On recovery: set `source_status = 'degraded'`, reset `escalation_count = 0`, run single-test retry. Success → `healthy` + resume. Fail → re-ban immediately.
   - Companies whose only discovery source is banned → mark `source_orphaned` for admin visibility (NOT `tier = dead` — companies may be multi-source).

**Severity stack (interaction rule):**
- Hard pause > rate reduction > normal operation.
- Per-source pause suppresses active rate reductions for duration of pause.
- After pause expires, re-evaluate source. If backlog condition still true → apply rate reduction.
- Rate reductions do not stack — strictest active reduction applies.
- Clean chain: pause → drain → throttle if still needed → resume.

**HN-specific rule**: HN-discovered jobs routed through LLM pre-classifier at normalization time. HN is high-unknown source by nature (yields ATS links, not job posts). Unresolved enters unknown bucket.

**Breaker scheduling**: `breakerCheck` Inngest event scheduled at T+3hr via independent cron-linked event (not `onComplete`). Per-source breaker evaluates first; corpus-ratio evaluates second at same checkpoint via sequential Inngest steps.

---

## Implementation Decisions (Pre-Implementation Session)

These decisions were made during implementation-session preparation after codebase investigation revealed constraints not visible during the brainstorming session. They are implementation-detail choices that do not change the locked strategy — only how the strategy is realized in code.

### HTML Cleaning: cheerio (not Readability)

The governing doc originally specified "Readability.js or trafilatura" for main-content extraction. Investigation revealed:
- `@mozilla/readability` requires a full DOM `Document` implementation (jsdom or linkedom) — a second undocumented dependency. cheerio's domhandler is a low-level parser, not a DOM implementation with the document API Readability expects.
- Readability is tuned for articles/blog posts (Mozilla reader mode), not job listing pages with structured role/requirements/company-info sections.
- cheerio is already installed (`^1.2.0`) and battle-tested in `src/lib/jobs/sanitize-html.ts`.

**Decision**: Use cheerio with custom job-page-specific heuristics (strip `nav`/`footer`/`header`/`aside`/`script`/`style`, target semantic containers, fall back to text-density scoring). Upgrade path preserved: add `@mozilla/readability` + `linkedom` as targeted fallback if cheerio heuristics prove insufficient in production.

### OpenAI Batch API: `openai` npm package required

The sync/batch split (Round 9) requires two LLM code paths:
- **Sync path**: existing `@ai-sdk/openai` + `generateObject` from Vercel AI SDK (already used in `gate-3.ts`, `job-normalizer.ts`).
- **Batch path**: OpenAI Batch API — NOT exposed by Vercel AI SDK (confirmed via locked feature request vercel/ai#8636).

**Decision**: Add `openai` npm package (official OpenAI SDK). The two packages coexist without conflict — `@ai-sdk/openai` for sync `generateObject` calls, `openai` for Batch API submission/retrieval. Create `src/lib/jobs/batch-llm-client.ts` as a thin wrapper.

### Employee Count Signal: Curated big-tech registry + graceful degradation

The scoring matrix's employee_count signal has the largest swing (50 points: +25 to -25). Investigation revealed:
- No enrichment API is currently wired (no Clearbit, no Crunchbase API integration).
- The existing `funding-signal.ts` (D7) is a slugger retry queue sweeper, not a Crunchbase integration.
- Crunchbase free API has undocumented rate limits and coverage gaps — adding it is a full sub-project that blocks Phase 4.
- Three of five scoring signals work today without new data: agency flag (`aggregator-blacklist.ts` exists), source origin (`discoverySourceEnum` records provenance), maturity (`discoveredAt` as rough proxy).
- Startup bonuses (+15, +25) overlap significantly with source-origin bonuses — companies from `yc_directory`, `vc_portfolio`, `github_probe`, `funding_signal` are small by definition.
- Big-tech penalties (-25, -20) need to be accurate but cover a finite, well-known set (~100-200 public tech companies).

**Decision**: Create `src/lib/jobs/company-enrichment/big-tech-registry.ts` — a curated TS constant with ~100-200 entries: `{ canonicalName, employeeCount, isPublic, ticker? }`. At scoring time: if `company.employeeCount` is not null → use it; else if `canonicalName` matches registry → use registry value; else → skip employee-count signal, score from available signals only. The `company.employeeCount` column (Phase 1 migration) is the canonical source — registry is fallback. Upgrade path to Crunchbase enrichment preserved: populates `employeeCount` directly, registry becomes redundant for those companies.

---

## Schema Changes Required

### `remoteScopeEnum` (enums.ts) — extend with new values
Current: `global`, `country_fenced`, `unknown`.
**Add**: `region_fenced`, `onsite`, `undetermined`.
> Note: `unknown` (existing) is retained for legacy jobs; `undetermined` is the new terminal value for jobs that exhausted the retry queue. Gate 0.5 treats both as pass-through to Gate 3.

### `job` table (job.ts) — add columns
- `retryInFlight` (boolean, default false) — fencing flag for in-flight retry attempts.
- `retryGeneration` (integer, default 0) — monotonic counter for zombie-write fencing.
- `clearedGeneration` (integer, default null) — last generation force-cleared by sweeper.
- `textHash` (text, nullable) — hash of cleaned JD text for dedup guard.
- `sourceFetchedAt` (timestamp, nullable) — when the source was fetched for this job record (for staleness gate).
- `jobVersion` (integer, default 1) — incremented on material content drift.
- `status` — add `'provisional'` to the status text values (currently: active, stale, gone, rejected, normalization_failed).

### `company_quality_score` table — add column
- `companySizeScore` (numeric, nullable) — the clamped [-0.30, +0.30] score from Criterion 3.

### `source_health` table (sourceHealth.ts) — add columns
- `escalationCount` (integer, default 0) — count of 1hr-pause escalations in current 24hr window.
- `lastEscalatedAt` (timestamp, nullable) — timestamp of most recent escalation.
- `sourceStatus` — extend `status` text values with `'banned'` (currently: active, degraded, disabled).

### `company` table (company.ts) — add columns
- `isAgency` (boolean, default false) — agency/aggregator flag for scoring.
- `isPublic` (boolean, default false) — public/listed company flag for scoring.
- `employeeCount` (integer, nullable) — employee count for scoring + startup filter.
- `sourceOrphaned` (boolean, default false) — set when only discovery source is banned.

### `discoverySourceEnum` (enums.ts) — add values
- `github_probe` — GitHub Events API funding-signal sourcing.
- `funding_signal` — RSS/Atom funding feed sourcing (Crunchbase webhook deferred for MVP).
- `x_semantic` — X semantic search (if implemented; deferred per dismissed pathways in v1).

---

## Open Tuning Items (Post-Implementation)

*Last updated: July 5, 2026 — post-implementation audit session. Items marked [IMPLEMENTED] have been completed; remaining items are deferred to production observation.*

- **Escalation threshold validation** [IMPLEMENTED — monitoring metric added]: The `escalation_count ≥ 3 in 24hr` threshold for daily source ban should be validated against real failure patterns post-launch. Start at 3, adjust based on observed false-positive rate. **Monitoring metric implemented**: `getBreakerRetryMetrics()` in `admin-queries.ts` computes the retry success ratio from the alerts table and displays it in the admin InfrastructureHealth dashboard. The dashboard shows: retry success % (green ≥80%, yellow 50-80%, red <50%), escalation count, active alerts, and active bans. Monitor this metric post-launch to tune the threshold.
- **Cosine-distance threshold for content-drift guard**: The "below threshold → overwrite in place" value needs calibration against observed JD edit patterns. Suggest starting at 0.02 cosine distance and tuning. *Current implementation uses `CONTENT_DRIFT_COSINE_THRESHOLD = 0.15` in `provisional-job-repository.ts` — verify this is the intended value vs the 0.02 suggestion.*
- **`retryInFlight` sweeper cadence (UPDATED)** [IMPLEMENTED]: Changed from fixed 2-3min cron to event-driven sweep (fires after each `normalizeProvisionalJob` attempt via `job/normalization-attempt-completed` event, including onFailure handler) + 30min safety-net cron. Monitor Neon CU-hour consumption — if the 30min safety net still contributes meaningfully, increase to 1hr or remove it entirely if the event-driven path proves reliable.
- **Big-tech registry review cadence** [IMPLEMENTED — comment added]: The curated `big-tech-registry.ts` (212 entries) should be reviewed quarterly against the IPO calendar and major acquisitions. **Review comment added** at top of file: `// Last reviewed: July 5, 2026. Review quarterly against IPO calendar and major acquisitions.` Short-term rot is minimal (FAANG-scale companies don't change size category frequently). Medium-term: add a monthly Inngest cron that cross-references Wikipedia's "List of largest technology companies" and creates an admin alert for diff review. Long-term: transition to Clearbit/Crunchbase API enrichment that populates `company.employeeCount` directly — the column is already the canonical source, registry is fallback.
- **Static HTML extraction selector expansion** [IMPLEMENTED — granular discard reasons]: Monitor `ingestion_log` for `discarded_static` entries. **Granular discard reasons implemented** in `domain-probe.ts`: `no_content` (Cheerio selector gap), `no_title_match` (regex gap — content ≥200 chars but no job title pattern), `below_word_threshold` (thin posting — JSON-LD found but <50 words), `content_too_short` (selector extracted too little), `mailto_only_no_role` (mailto-only careers page). Priority ordering: `no_title_match` > `below_word_threshold` > `mailto_only_no_role` > `content_too_short` > `no_content` (most actionable first). Add new semantic selectors to the Cheerio extraction logic as patterns emerge from production data.
- **Cost-weighted per-source breaker (deferred)**: A proposal to add `costPerJob` + `failureBudget` columns to `source_health` and weight the per-source breaker threshold by LLM cost was considered in Round 9 and rejected as over-engineering — at ~$29/month total LLM spend, cost-weighted breaker logic adds schema complexity to manage costs that are acknowledged as immaterial. The existing 3-consecutive-failures threshold is sufficient. Revisit only if LLM costs exceed $200/month or if sync-LLM sources demonstrate systematically higher failure rates than deterministic sources.
- **Batch LLM path wiring (Phase 3 deferred)**: The `batch-llm-client.ts` wrapper exists with proper exports (`submitBatch`, `checkBatchStatus`, `retrieveBatchResults`) but is NOT wired into any production code path. All LLM calls currently use the sync path via `@ai-sdk/openai` + `generateObject`. Actual LLM costs are ~$42/month (all sync) vs the documented ~$29/month estimate (sync+batch split). Wiring the batch path into content-drift re-normalization and dormant-tier operations is deferred to Phase 3. The 50% Batch API discount would reduce costs by ~$13/month once wired.
