# Company Corpus Expansion v2 — Multi-Session Implementation Handoff

> **Purpose:** This file is the living handoff document for the v2 corpus expansion implementation. It is passed from session to session. Each session updates the "Session State" section before closing so the next session has full context.
>
> **Date:** July 5, 2026 (updated with pre-implementation decisions + multi-session protocol)
>
> **Governing document:** `docs/governing/company-corpus-expansion-new.md` (read this first — it is the locked strategy spec, includes "Implementation Decisions" section with pre-resolved concerns)
>
> **Context document:** `docs/reports/EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md` (the audit that motivated this strategy)
>
> **Supersedes:** `docs/reports/CORPUS_EXPANSION_HANDOFF.md` (v1 implementation — completed, but its aggregator-dependent sourcing produced the corpus composition problems this v2 strategy addresses)

---

## Multi-Session Roadmap

The v2 implementation is split across **3 sessions** to manage complexity and provide review checkpoints. Each session has a defined scope and cannot proceed to the next phase until the current phase is complete, tested, and reviewed.

| Session | Scope | Phases | Status | Handoff Section |
|---|---|---|---|---|
| **Session 1** | Schema + Remote-Scope Extraction | Phase 1 + Phase 2 | `COMPLETED` (reconstructed) | [Session 1 State](#session-1-state) |
| **Session 2** | Sourcing Pipeline + Provisional Lifecycle | Phase 3 | `COMPLETED` (reconstructed) | [Session 2 State](#session-2-state) |
| **Session 3** | Job Scoring Matrix + Circuit Breaker | Phase 4 | `PARTIALLY_COMPLETE` (reconstructed — breaker functions not registered in route, fixed post-impl) | [Session 3 State](#session-3-state) |

> **Reconstruction note (July 5, 2026):** The 3 implementation sessions did not follow the handoff protocol — Session State sections were left at `NOT_STARTED` placeholders. All 4 phases were committed in a single commit `15b3b6b` ("New jog acquisition strategy focused on startups and globaly remot positions applied", Jul 5 19:43 +0200). The session states below were reconstructed by the post-implementation audit session from `git show --stat 15b3b6b`, migration files, and on-disk file inspection. The phase-to-session mapping follows the original handoff plan (Session 1 = Phase 1+2, Session 2 = Phase 3, Session 3 = Phase 4) even though the actual implementation was done in one shot.

**Why 3 sessions:**
- Phase 1+2 (schema + remote-scope extraction) is the highest-value, lowest-risk subsystem and produces a natural review checkpoint.
- Phase 3 (sourcing pipeline + provisional lifecycle) is the most complex — Inngest function orchestration, fencing-token logic, staleness gates. It benefits from the implementer having already learned codebase patterns from Phase 2.
- Phase 4 (scoring matrix + circuit breaker) depends on Phase 3's provisional lifecycle being in place (the breaker monitors provisional jobs).

**Session boundary rule:** A session MUST NOT begin work on a phase that belongs to a later session. If a session completes its scope early, it stops and prepares the handoff — it does not "helpfully" start the next phase.

---

## Session Handoff Protocol (MANDATORY)

Before closing, every implementation session MUST complete the following steps. Failure to complete any step means the handoff is incomplete and the next session will start with a gap.

### Step 1: Update Session State

Update this document's "Session State" section for the session that is closing. Fill in every field:

```markdown
### Session N State

**Status:** `COMPLETED` | `PARTIALLY_COMPLETE` | `BLOCKED`
**Date closed:** [date]
**Phases completed:** [list]
**Phases partially completed:** [list with details]

#### What was implemented
- [file path]: [brief description of what was added/changed]

#### What was NOT implemented (carry-forward)
- [item]: [why it wasn't done — time, blocker, dependency]

#### Files created
- [list of new file paths]

#### Files modified
- [list of modified file paths with brief change description]

#### Migration(s) applied
- [migration filename]: [what it does, whether it was applied to live DB]

#### Tests added
- [test file path]: [N tests, what they cover]

#### Test results at session close
- Existing tests: [pass/fail count]
- New tests: [pass/fail count]
- TypeScript: [0 errors or list]
- Biome: [0 errors or list]

#### Deviations from governing document
- [any deviation from the locked strategy, with rationale — or "None"]

#### Blockers / open issues for next session
- [issue]: [description, impact on next phase]

#### Verification checklist status
- [ ] [item]: [pass/fail/skipped with reason]
```

### Step 2: Verify No Broken State

Before closing, the session MUST verify:
1. `npx tsc --noEmit` — 0 TypeScript errors (no half-written code with type errors)
2. `npx biome check --write` — 0 lint errors (run the fix, don't leave formatting debt)
3. `npm run test` — all tests pass (no failing tests left for the next session to debug)
4. No uncommitted migrations that haven't been applied to the DB (either apply or document as pending)

If any of these fail and cannot be fixed before close, the session status is `BLOCKED` and the blocker MUST be documented in the Session State.

### Step 3: Update Next Session's Read List

In the next session's state section, update the "Files to read before starting" list with any new files created in this session that the next session needs to understand. This prevents the next session from re-discovering patterns that were already established.

### Step 4: Confirm with User

Before closing, tell the user:
1. Which phases were completed.
2. Which verification checks passed.
3. What the next session's scope is.
4. Whether any blockers were left for the next session.

Do NOT close the session until the user acknowledges the handoff is complete.

---

## Session 1 State

**Status:** `COMPLETED` (reconstructed July 5, 2026 by post-implementation audit)
**Date closed:** July 5, 2026 (committed in `15b3b6b` at 19:43 +0200)
**Phases completed:** Phase 1 (Schema Migrations + Dependencies), Phase 2 (Remote-Scope Extraction)
**Phases partially completed:** —

### Session 1 Scope: Phase 1 + Phase 2 Only

This session implements **Phase 1 (Schema Migrations + Dependencies)** and **Phase 2 (Remote-Scope Extraction)** only. Do NOT attempt Phase 3 or Phase 4.

**Rationale**: Phase 1+2 is the highest-value, lowest-risk subsystem. Schema migrations + remote-scope extraction produces a natural review checkpoint. Phase 3+4 are more complex (Inngest function orchestration, circuit breaker state machine, fencing-token logic) and benefit from the implementer having already learned codebase patterns from Phase 2.

### Database Migration Safety: Generate + Dry-Run

Phase 1 requires schema changes against the live Neon database. Follow this protocol:

1. Run `npm run db:generate` to produce migration files.
2. **STOP.** Show the user the generated SQL diff (the contents of the new migration file in `src/db/migrations/`).
3. **Wait for explicit go-ahead** before running `npm run db:migrate`.
4. Do NOT run `db:migrate` without explicit user approval — schema changes on the shared Neon database are significant operations per AGENTS.md destructive operations rules.

### Files to read before starting

(See "Critical: Read These Files First" section below — all files are pre-populated for Session 1.)

#### What was implemented

**Phase 1 — Schema + Dependencies:**
- `package.json` / `package-lock.json`: added `openai@^6.45.0` (official OpenAI SDK for Batch API path; sync path stays on `@ai-sdk/openai`)
- `src/db/schemas/jobs/enums.ts`: extended `remoteScopeEnum` with `region_fenced`, `onsite`, `undetermined`; extended `discoverySourceEnum` with `github_probe`, `funding_signal`
- `src/db/schemas/jobs/job.ts`: added `retryInFlight`, `retryGeneration`, `clearedGeneration`, `textHash`, `sourceFetchedAt`, `jobVersion`, `updatedAt` columns
- `src/db/schemas/jobs/sourceHealth.ts`: added `escalationCount`, `lastEscalatedAt`; documented `banned` status value (text column, no enum migration needed)
- `src/db/schemas/jobs/companyQualityScore.ts`: added `companySizeScore` (numeric, nullable)
- `src/db/schemas/jobs/company.ts`: added `isAgency`, `isPublic`, `employeeCount`, `sourceOrphaned`
- `src/db/schemas/jobs/alerts.ts`: added `v2_breaker_per_source`, `v2_breaker_corpus_ratio`, `v2_source_banned` alert types
- `src/db/migrations/0043_milky_secret_warriors.sql`: v2 schema migration (all enum extensions + new columns + partial index `job_retry_in_flight_sweeper_idx`)
- `src/db/migrations/0044_modern_scarlet_spider.sql`: v2 breaker alert type extensions

**Phase 2 — Remote-Scope Extraction:**
- `src/lib/jobs/remote-scope-extractor.ts` (NEW, 636 lines): Step 1 deterministic pre-pass (ATS-native workplaceType trust + regex heuristics with confidence scoring) + Step 2 LLM extraction (gpt-4o-mini structured Zod output). Implements the hard-fail path (`undetermined` + `normalization_failed`, never defaults to restrictive interpretation).
- `src/lib/jobs/batch-llm-client.ts` (NEW, 321 lines): OpenAI Batch API wrapper (submit/retrieve). Created in Phase 2 per handoff; not wired into normalizer until Phase 3 batch-eligible paths exist.
- `src/lib/jobs/job-normalizer.ts` (MODIFIED, +74 lines): integrated remote-scope-extractor into the normalization pipeline
- `src/lib/jobs/gate-zero-pre-filter.ts` (MODIFIED, +39 lines): handles new `remoteScope` values — `global` bypasses country check, `country_fenced` hard-blocks, `undetermined` passes through to Gate 3 (never hard-rejects)
- `src/inngest/functions.ts` (MODIFIED): added `nightlyResurrectionSweep` Inngest function (re-runs Step 2 on `undetermined`/`normalization_failed` jobs)
- `src/app/api/inngest/route.ts` (MODIFIED): registered `nightlyResurrectionSweep`

#### What was NOT implemented (carry-forward)
- `src/lib/jobs/remote-scope-patterns.ts` — the expanded remote-scope pattern dictionary. The MVP regex patterns are inline in `remote-scope-extractor.ts`. Expanding to a structured pattern table is a deferred operational item (post-implementation Task A2).
- Batch API path not wired into normalizer (deferred to Phase 3 per handoff — batch-eligible paths don't exist until content-drift re-normalization is implemented)

#### Files created
- `src/lib/jobs/remote-scope-extractor.ts` (636 lines)
- `src/lib/jobs/batch-llm-client.ts` (321 lines)
- `src/lib/jobs/__tests__/remote-scope-extractor.test.ts` (537 lines, 41 tests)
- `src/lib/jobs/__tests__/gate-zero-pre-filter.test.ts` (835 lines, 40 tests — includes pre-existing + new v2 tests)
- `src/db/migrations/0043_milky_secret_warriors.sql`
- `src/db/migrations/0044_modern_scarlet_spider.sql`
- `src/db/migrations/meta/0043_snapshot.json`
- `src/db/migrations/meta/0044_snapshot.json`
- `docs/system/brainstorming_multy_llm_session_prompt_template.md` (46 lines — brainstorming session template)

#### Files modified
- `package.json` / `package-lock.json` — added `openai` dependency
- `src/db/schemas/jobs/enums.ts` — extended `remoteScopeEnum`, `discoverySourceEnum`
- `src/db/schemas/jobs/job.ts` — added 7 new columns
- `src/db/schemas/jobs/sourceHealth.ts` — added `escalationCount`, `lastEscalatedAt`
- `src/db/schemas/jobs/companyQualityScore.ts` — added `companySizeScore`
- `src/db/schemas/jobs/company.ts` — added `isAgency`, `isPublic`, `employeeCount`, `sourceOrphaned`
- `src/db/schemas/jobs/alerts.ts` — added v2 breaker alert types
- `src/lib/jobs/job-normalizer.ts` — integrated remote-scope-extractor
- `src/lib/jobs/gate-zero-pre-filter.ts` — handle new `remoteScope` values
- `src/inngest/functions.ts` — added `nightlyResurrectionSweep`
- `src/app/api/inngest/route.ts` — registered `nightlyResurrectionSweep`
- `src/db/migrations/meta/_journal.json` — updated migration journal

#### Migration(s) applied
- `0043_milky_secret_warriors.sql`: v2 schema migration — extends `remote_scope` enum (region_fenced, onsite, undetermined), extends `discovery_source` enum (github_probe, funding_signal), adds all new columns to `job`, `company`, `company_quality_score`, `source_health`, creates partial index `job_retry_in_flight_sweeper_idx` on `job(updated_at) WHERE retry_in_flight = true`. **Applied status: committed in `15b3b6b`; live-DB application to be verified by post-implementation audit (Mandate B1).**
- `0044_modern_scarlet_spider.sql`: extends `alert_type` enum with v2 breaker alert types. **Applied status: committed; live-DB application to be verified by post-implementation audit.**

#### Tests added
- `src/lib/jobs/__tests__/remote-scope-extractor.test.ts`: 41 tests — Step 1 deterministic resolution (regex hard-signals, confidence scoring, ATS-native workplaceType trust), Step 2 LLM extraction (mocked Zod schema validation for all remoteScope values), hard-fail path (empty/garbage → `undetermined` + `normalization_failed`)
- `src/lib/jobs/__tests__/gate-zero-pre-filter.test.ts`: 40 tests total (pre-existing + new v2 tests) — Gate 0.5 integration for all `remoteScope` values, `undetermined` pass-through verification

#### Test results at session close
- Existing tests: all pass (baseline 2118 tests, 103 files)
- New tests: 81 new tests (41 remote-scope-extractor + 40 gate-zero-pre-filter) — all pass
- TypeScript: 0 errors (`npx tsc --noEmit`)
- Biome: 0 errors, 10 warnings (7 v2-related — unused imports/params, noExplicitAny)

#### Deviations from governing document
- None for Phase 1. All schema changes match the governing doc's "Schema Changes Required" section exactly.
- Phase 2: `remote-scope-extractor.ts` was created as a new dedicated module rather than extending `job-normalizer.ts` inline. The governing doc says "Step 1 deterministic pre-pass (`job-normalizer.ts`)" — the implementation extracts this logic into a separate module that `job-normalizer.ts` imports. This is a structural choice, not a strategy deviation. The behavior matches the spec.

#### Blockers / open issues for next session
- None blocking Phase 3. The `normalizeProvisionalJob` function in Phase 3 depends on the Step 1/Step 2 extraction logic from Phase 2 — `remote-scope-extractor.ts` is ready for integration.
- Carry-forward: `remote-scope-patterns.ts` expanded pattern dictionary (deferred operational item, Task A2).

#### Verification checklist status
- [x] `npm run db:generate` produces clean migration files (Phase 1) — 0043 + 0044 generated
- [ ] SQL diff reviewed and approved by user before applying (Phase 1) — **could not verify** (session state was not filled; reconstruction cannot confirm whether user reviewed the SQL diff before migration)
- [ ] `npm run db:migrate` succeeds (after explicit approval) (Phase 1) — **to be verified** by post-implementation audit against live DB
- [x] `npx tsc --noEmit` — 0 TypeScript errors
- [x] `npx biome check --write` — 0 lint errors (10 warnings, 0 errors)
- [x] `npm run test` — all existing tests still pass + new tests pass
- [ ] `npm run test:coverage` — not verified in reconstruction
- [x] No database-mutating tests run against production (per AGENTS.md rules)
- [x] All new Inngest functions registered in `src/inngest/functions.ts` (Phase 2) — `nightlyResurrectionSweep` registered
- [x] All new enum values reflected in Drizzle schema (Phase 1)
- [x] Gate 0.5 handles all new `remoteScope` values without hard-rejecting `undetermined` (Phase 2)
- [ ] Session State section updated with all fields filled — **was NOT done by implementation session; reconstructed by post-implementation audit**
- [ ] Next session's "Files to read before starting" list updated — **was NOT done; reconstructed below**

---

## Session 2 State

**Status:** `COMPLETED` (reconstructed July 5, 2026 by post-implementation audit)
**Date closed:** July 5, 2026 (committed in `15b3b6b` at 19:43 +0200)
**Phases completed:** Phase 3 (Sourcing Pipeline + Provisional Lifecycle)

### Session 2 Scope: Phase 3 Only

This session implements **Phase 3 (Sourcing Pipeline + Provisional Lifecycle)** only. Do NOT attempt Phase 4.

**Prerequisite:** Session 1 must be `COMPLETED` with Phase 1 (schema) and Phase 2 (remote-scope extraction) fully tested and verified. The `normalizeProvisionalJob` function in Phase 3 depends on the Step 1/Step 2 extraction logic from Phase 2.

### Files to read before starting

(Updated by Session 1 before close. Session 1 should add any new files it created that Phase 3 depends on — especially the batch-llm-client.ts wrapper, the Step 1/Step 2 extraction modules, and any new test patterns.)

**Always read:**
1. `docs/governing/company-corpus-expansion-new.md` — full governing doc (re-read, don't assume memory)
2. `docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md` — this file, especially Session 1 State
3. `AGENTS.md` — project rules

**From Session 1 (reconstructed by post-implementation audit):**
- `src/lib/jobs/remote-scope-extractor.ts` — Step 1 deterministic + Step 2 LLM extraction (Phase 3's `normalizeProvisionalJob` calls this)
- `src/lib/jobs/batch-llm-client.ts` — OpenAI Batch API wrapper (Phase 3 wires this into content-drift re-normalization)
- `src/lib/jobs/__tests__/remote-scope-extractor.test.ts` — test patterns for mocked LLM extraction
- `src/db/schemas/jobs/job.ts` — new columns (`retryInFlight`, `retryGeneration`, `clearedGeneration`, `textHash`, `sourceFetchedAt`, `jobVersion`) used by Phase 3 fencing + staleness gate
- `src/db/schemas/jobs/enums.ts` — `discoverySourceEnum` now has `github_probe`, `funding_signal` (used by Phase 3 seeders)

#### What was implemented

**Phase 3 — Sourcing Pipeline + Provisional Lifecycle:**
- `src/lib/jobs/seeders/daily-sources/funding-signal-rss.ts` (NEW, 466 lines): RSS/Atom funding feed parser (TechCrunch, etc. → company names + domains). Startup filter `employee_count < 50` enforced before registry insert.
- `src/lib/jobs/seeders/daily-sources/github-events-probe.ts` (NEW, 285 lines): GitHub Events API poller for YC/VC-funded orgs.
- `src/lib/jobs/seeders/domain-probe.ts` (NEW, 756 lines): 5-step probe pipeline (robots.txt → common paths → JSON-LD → HTML fallback via cheerio → RSS). Implements discard criteria (no job-like text, mailto-only, 4xx/5xx, <200 chars, aggregator domain). Inserts as `status = 'provisional'`, `tier = 'active_hot'`, `pollingEnabled = false`.
- `src/lib/jobs/seeders/provisional-job-repository.ts` (NEW, 347 lines): provisional job insert helper — stores raw HTML snippet + extracted email, sets `status = 'provisional'`.
- `src/inngest/normalize-provisional-job.ts` (NEW, 451 lines): `normalizeProvisionalJob` Inngest function (triggered on `job.created` where `status = 'provisional'`, 30s debounce; parallel steps: extract-and-clean → forked embed + classify-scope → persist-normalized-job; 4-attempt retry schedule 5min/15min/45min/90min; transitions to `active` or `normalization_failed` at 4hr SLA). Also contains `retryInFlightSweeper` (event-driven sweep + safety-net cron).
- `src/lib/jobs/seeders/schemas.ts` (MODIFIED, +16 lines): provisional job Zod schema
- `src/lib/jobs/seeders/company-repository.ts` (MODIFIED, +10 lines): startup filter integration
- `src/lib/jobs/seeders/slugger.ts` (MODIFIED, +11 lines)
- `src/inngest/functions.ts` (MODIFIED): added `v2FundingSignalRss`, `v2GithubEventsProbe` Inngest functions
- `src/app/api/inngest/route.ts` (MODIFIED): registered `v2FundingSignalRss`, `v2GithubEventsProbe`, `normalizeProvisionalJob`, `retryInFlightSweeper`

#### What was NOT implemented (carry-forward)
- Batch API path wiring: `batch-llm-client.ts` (created in Phase 2) was supposed to be wired into the content-drift re-normalization path in Phase 3. **Status to be verified** by post-implementation audit — the content-drift guard may use sync path only.
- Granular discard reasons: the governing doc's Open Tuning Items specifies logging `discarded_no_content` vs `discarded_no_title_match` vs `discarded_below_threshold` etc. The current probe pipeline logs `discarded_static` without granular reasons. This is a deferred operational item (Task A3).

#### Files created
- `src/lib/jobs/seeders/daily-sources/funding-signal-rss.ts` (466 lines)
- `src/lib/jobs/seeders/daily-sources/github-events-probe.ts` (285 lines)
- `src/lib/jobs/seeders/domain-probe.ts` (756 lines)
- `src/lib/jobs/seeders/provisional-job-repository.ts` (347 lines)
- `src/inngest/normalize-provisional-job.ts` (451 lines)
- `src/lib/jobs/seeders/__tests__/domain-probe.test.ts` (579 lines, 55 tests)
- `src/lib/jobs/seeders/__tests__/provisional-job-repository.test.ts` (355 lines, 34 tests)
- `src/lib/jobs/seeders/daily-sources/__tests__/funding-signal-rss.test.ts` (484 lines, 40 tests)
- `src/lib/jobs/seeders/daily-sources/__tests__/github-events-probe.test.ts` (320 lines, 20 tests)

#### Files modified
- `src/lib/jobs/seeders/schemas.ts` — provisional job Zod schema
- `src/lib/jobs/seeders/company-repository.ts` — startup filter
- `src/lib/jobs/seeders/slugger.ts` — slugger integration
- `src/inngest/functions.ts` — added v2 seeder functions
- `src/app/api/inngest/route.ts` — registered v2 seeder + provisional lifecycle functions

#### Migration(s) applied
- None (Phase 3 uses schema from Phase 1)

#### Tests added
- `src/lib/jobs/seeders/__tests__/domain-probe.test.ts`: 55 tests — 5-step probe order, discard criteria, regex extraction, mocked HTTP responses
- `src/lib/jobs/seeders/__tests__/provisional-job-repository.test.ts`: 34 tests — provisional insert, status/tier/pollingEnabled defaults
- `src/lib/jobs/seeders/daily-sources/__tests__/funding-signal-rss.test.ts`: 40 tests — RSS/Atom parsing, company extraction, startup filter
- `src/lib/jobs/seeders/daily-sources/__tests__/github-events-probe.test.ts`: 20 tests — GitHub Events API polling, org filtering

#### Test results at session close
- Existing tests: all pass
- New tests: 149 new tests (55 + 34 + 40 + 20) — all pass
- TypeScript: 0 errors
- Biome: 0 errors, 10 warnings

#### Deviations from governing document
- `funding-signal-rss.ts` and `github-events-probe.ts` were placed in `src/lib/jobs/seeders/daily-sources/` rather than directly in `src/lib/jobs/seeders/` as the handoff specified. This follows the existing codebase convention (daily sources are in the `daily-sources/` subdirectory). Not a strategy deviation.
- `normalizeProvisionalJob` and `retryInFlightSweeper` were placed in a new file `src/inngest/normalize-provisional-job.ts` rather than in `src/inngest/functions.ts`. This follows good separation-of-concerns practice. Not a strategy deviation.

#### Blockers / open issues for next session
- None blocking Phase 4. The circuit breaker in Phase 4 monitors provisional jobs created by Phase 3's sourcing pipeline — provisional lifecycle is in place.
- Carry-forward: granular discard reasons (Task A3), batch API wiring verification.

#### Verification checklist status
- [x] `npx tsc --noEmit` — 0 TypeScript errors
- [x] `npx biome check --write` — 0 lint errors (10 warnings)
- [x] `npm run test` — all existing + new tests pass
- [x] All new Inngest functions registered — `normalizeProvisionalJob`, `retryInFlightSweeper`, `v2FundingSignalRss`, `v2GithubEventsProbe` registered in route.ts
- [ ] Session State updated — **was NOT done by implementation session; reconstructed by post-implementation audit**
- [ ] Next session's read list updated — **was NOT done; reconstructed below**

---

## Session 3 State

**Status:** `PARTIALLY_COMPLETE` (reconstructed July 5, 2026 by post-implementation audit — breaker functions not registered in route, fixed by audit session)
**Date closed:** July 5, 2026 (committed in `15b3b6b` at 19:43 +0200; registration bug fixed by post-implementation audit session)
**Phases completed:** Phase 4 (Job Scoring Matrix + Circuit Breaker) — all code written and tested; breaker function registration bug fixed post-impl

### Session 3 Scope: Phase 4 Only

This session implements **Phase 4 (Job Scoring Matrix + Circuit Breaker)**. This is the final implementation session.

**Prerequisite:** Session 2 must be `COMPLETED` with Phase 3 (sourcing pipeline + provisional lifecycle) fully tested and verified. The circuit breaker in Phase 4 monitors provisional jobs created by Phase 3's sourcing pipeline.

### Files to read before starting

(Updated by Session 2 before close.)

**Always read:**
1. `docs/governing/company-corpus-expansion-new.md` — full governing doc (re-read, don't assume memory)
2. `docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md` — this file, especially Session 2 State
3. `AGENTS.md` — project rules

**From Session 2 (reconstructed by post-implementation audit):**
- `src/inngest/normalize-provisional-job.ts` — `normalizeProvisionalJob` + `retryInFlightSweeper` (Phase 4's breaker monitors provisional jobs created here)
- `src/lib/jobs/seeders/domain-probe.ts` — probe pipeline (Phase 4's breaker observes provisional normalization failures from this path)
- `src/lib/jobs/seeders/provisional-job-repository.ts` — provisional insert helper (sets `status = 'provisional'` that the breaker counts)
- `src/db/schemas/jobs/sourceHealth.ts` — `escalationCount`, `lastEscalatedAt` columns (Phase 4's Tier 5 ban uses these)
- `src/db/schemas/jobs/company.ts` — `isAgency`, `isPublic`, `employeeCount` columns (Phase 4's scoring matrix reads these)
- `src/db/schemas/jobs/companyQualityScore.ts` — `companySizeScore` column (Phase 4 persists the clamped score here)

#### What was implemented

**Phase 4 — Job Scoring Matrix + Circuit Breaker:**
- `src/lib/jobs/company-enrichment/big-tech-registry.ts` (NEW, 1006 lines): curated TS constant with big-tech entries (`{ canonicalName, employeeCount, isPublic, ticker? }`). Used as fallback when `company.employeeCount` is null.
- `src/lib/jobs/company-enrichment/index.ts` (NEW, 14 lines): barrel export
- `src/lib/jobs/company-scorer.ts` (NEW, 455 lines): scoring matrix computation — employee count signal (with big-tech registry fallback), agency/aggregator flag, public/listed flag, source origin signal, company maturity signal. Clamps to [-0.30, +0.30]. Persists to `company_quality_score.companySizeScore`.
- `src/lib/jobs/circuit-breaker.ts` (NEW, 920 lines): 5-tier circuit breaker evaluation functions:
  - Tier 1: Per-source early-warning (3 consecutive provisional fails → 15min pause + single-test retry)
  - Tier 2: Provisional backlog throttle (>15% / >25% / >30% provisional >1hr)
  - Tier 3: Unknown sub-floor guard (≥30% unknown at 3hr count)
  - Tier 4: Corpus-ratio breaker (`global / (global + country_fenced) < 50%`)
  - Tier 5: Daily source ban (`escalation_count ≥ 3` in 24hr → 24hr ban + cooldown recovery)
  - Severity stack: hard pause > rate reduction > normal; rate reductions don't stack (strictest applies)
- `src/lib/jobs/admin-queries.ts` (NEW, 87 lines): admin dashboard queries for breaker state
- `src/lib/jobs/dashboard-queries.ts` (MODIFIED, +8 lines): `companySizeScore` integration into `companyQuality` component (0.17 weight)
- `src/inngest/circuit-breaker-functions.ts` (NEW, 174 lines): `breakerCheck` Inngest function (scheduled at T+3hr via cron-linked event; per-source evaluates first, corpus-ratio second) + `sourceBanRecoveryCheck` Inngest function (daily cron, recovers banned sources after 24hr cooldown with single-test retry)
- `src/components/admin/InfrastructureHealth.tsx` (MODIFIED, +141 lines): breaker state display in admin dashboard

#### What was NOT implemented (carry-forward)
- **CRITICAL BUG (fixed by post-implementation audit):** `breakerCheck` and `sourceBanRecoveryCheck` were imported in `src/app/api/inngest/route.ts` but NOT added to the `serve({ functions: [...] })` array. The entire circuit breaker enforcement layer was non-functional in production — the logic existed and was unit-tested, but the Inngest server never discovered the functions. **Fixed by post-implementation audit session:** added both functions to the serve() array + added regression test (`src/app/api/inngest/__tests__/route.test.ts`, 5 tests) that asserts all exported Inngest functions are registered.
- Big-tech registry review cadence comment not added (deferred operational item, Task A5).
- Circuit breaker monitoring metric (retry success ratio) not surfaced in admin dashboard (deferred operational item, Task A4).

#### Files created
- `src/lib/jobs/company-enrichment/big-tech-registry.ts` (1006 lines)
- `src/lib/jobs/company-enrichment/index.ts` (14 lines)
- `src/lib/jobs/company-scorer.ts` (455 lines)
- `src/lib/jobs/circuit-breaker.ts` (920 lines)
- `src/lib/jobs/admin-queries.ts` (87 lines)
- `src/inngest/circuit-breaker-functions.ts` (174 lines)
- `src/lib/jobs/__tests__/circuit-breaker.test.ts` (606 lines, 40 tests)
- `src/lib/jobs/__tests__/company-scorer.test.ts` (507 lines, 51 tests)
- `src/lib/jobs/company-enrichment/__tests__/big-tech-registry.test.ts` (162 lines, 20 tests)

**Post-implementation audit fix:**
- `src/app/api/inngest/__tests__/route.test.ts` (127 lines, 5 tests) — regression test for function registration

#### Files modified
- `src/lib/jobs/dashboard-queries.ts` — `companySizeScore` integration
- `src/components/admin/InfrastructureHealth.tsx` — breaker state display
- `src/inngest/functions.ts` — (no Phase 4 additions; `nightlyResurrectionSweep` was Phase 2)
- `src/app/api/inngest/route.ts` — **BUG: imported `breakerCheck` + `sourceBanRecoveryCheck` but did NOT add them to functions array. Fixed by post-implementation audit.**
- `src/lib/coolify/__tests__/client.test.ts` — Biome formatting only (line wrapping), not v2-related

#### Migration(s) applied
- None (Phase 4 uses schema from Phase 1; `0044_modern_scarlet_spider.sql` alert types were Phase 1 migration)

#### Tests added
- `src/lib/jobs/__tests__/circuit-breaker.test.ts`: 40 tests — all 5 tier evaluation functions, severity stack interaction, escalation count increment, ban recovery cycle, DB integration (mocked)
- `src/lib/jobs/__tests__/company-scorer.test.ts`: 51 tests — scoring matrix computation for all signal combinations, clamping to [-0.30, +0.30], big-tech registry fallback, persistence
- `src/lib/jobs/company-enrichment/__tests__/big-tech-registry.test.ts`: 20 tests — registry lookup, canonicalName matching, employeeCount/isPublic fields

**Post-implementation audit:**
- `src/app/api/inngest/__tests__/route.test.ts`: 5 tests — regression: all exported Inngest functions registered in serve()

#### Test results at session close
- Existing tests: all pass
- New tests: 111 new tests (40 + 51 + 20) — all pass
- TypeScript: 0 errors
- Biome: 0 errors, 10 warnings (7 in v2 code: unused import in route.ts [fixed by audit], unused import/param in circuit-breaker.ts, noExplicitAny in circuit-breaker.test.ts)

#### Deviations from governing document
- `circuit-breaker.ts` (920 lines) is larger than expected — the governing doc describes the 5-tier action chain conceptually; the implementation includes DB query helpers, alert emission, and source ban recovery logic in the same file. This is a structural choice, not a strategy deviation.
- **Implementation bug (not a deviation):** breaker functions not registered in route — fixed by post-implementation audit.

#### Blockers / open issues for next session
- **FIXED by post-implementation audit:** breaker function registration bug
- Carry-forward: big-tech registry review cadence comment (Task A5), circuit breaker monitoring metric (Task A4), biome warnings cleanup (7 v2-related warnings)

#### Verification checklist status
- [x] `npx tsc --noEmit` — 0 TypeScript errors
- [x] `npx biome check --write` — 0 lint errors (10 warnings, 7 v2-related — to be cleaned up)
- [x] `npm run test` — all existing + new tests pass
- [x] All new Inngest functions registered — **FIXED by post-implementation audit** (breakerCheck + sourceBanRecoveryCheck now registered; regression test added)
- [ ] Session State updated — **was NOT done by implementation session; reconstructed by post-implementation audit**
- [ ] Next session's read list updated — N/A (this is the final implementation session)

---

## Initial Prompt for New Session

I am implementing the Company Corpus Expansion v2 strategy for VectorMatch.dev. This is a multi-session implementation of three new subsystems that replace or extend the existing v1 pipeline. The governing strategy document has been locked after an 8-round red-team brainstorming session — your job is to implement it faithfully, not to re-architect it.

**YOUR ROLE:** Implement the phases assigned to your session (see "Multi-Session Roadmap" and your session's "Session State" section) as production code with tests. Follow the existing project conventions (Next.js 16 App Router, Drizzle ORM, Inngest v4, Vitest, Biome). If you find a genuine contradiction between the governing document and the existing codebase, raise it before proceeding.

**BEFORE STARTING:** Read the "Session Handoff Protocol" section above — you MUST follow it before closing your session. If a previous session has completed, read its Session State to understand what was done and what files were created.

### Critical: Read These Files First (In This Order)

1. **`docs/governing/company-corpus-expansion-new.md`** — THE governing strategy document. Read it in full. Every section is a locked decision. The "Implementation Decisions" section contains pre-resolved concerns. The "Schema Changes Required" section is your implementation roadmap.

2. **`AGENTS.md`** — Project rules. Critical sections: Technology Stack (strict), Testing Strategy (Vitest vs Playwright separation), Database Mutation in Tests rules, Inngest Orchestration rules, Biome (not ESLint), Shadcn component integrity, Tailwind v4 CSS-first config.

3. **`docs/reports/EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md`** — The audit context. Read §1.4 (Key Challenges), §4.1 (Job Acquisition Strategies), §7 (Strategic Challenges) to understand WHY this strategy exists.

4. **Existing schema files** — Read these to understand current state before writing migrations:
   - `src/db/schemas/jobs/enums.ts` — Current enum values (especially `remoteScopeEnum`, `discoverySourceEnum`, `companyHealthEnum`)
   - `src/db/schemas/jobs/job.ts` — Current job columns (note: `remoteScope`, `normalizedText`, `detectedAt`, `normalizedAt`, `status` already exist)
   - `src/db/schemas/jobs/sourceHealth.ts` — Existing `source_health` table (has `consecutiveFailures`, `status`, `lastFailureAt` — needs `escalationCount`, `lastEscalatedAt`, `banned` status)
   - `src/db/schemas/jobs/companyQualityScore.ts` — Existing quality score table (needs `companySizeScore` column)
   - `src/db/schemas/jobs/company.ts` — Company schema (needs `isAgency`, `isPublic`, `employeeCount`, `sourceOrphaned`)

5. **Existing implementation files** — Read these to understand current patterns:
   - `src/lib/jobs/job-normalizer.ts` — Current normalizer (basis for Step 1 + Step 2 extension; uses `@ai-sdk/openai` + `generateObject`)
   - `src/inngest/functions.ts` — All Inngest functions (add `normalizeProvisionalJob`, `breakerCheck`, `retryInFlightSweeper`, `sourceBanRecoveryCheck`)
   - `src/lib/jobs/source-health.ts` — Existing source health logic (extend for escalation)
   - `src/lib/jobs/seeders/aggregator-blacklist.ts` — Existing aggregator blacklist (provides `isAggregator(slug, name)` — used for agency flag in scoring matrix)
   - `src/lib/jobs/seeders/` — Existing seeder patterns (basis for funding-signal seeders)
   - `src/lib/jobs/ats-endpoints.ts` — ATS endpoint registry
   - `src/lib/jobs/sanitize-html.ts` — Existing cheerio usage pattern (basis for main-content extraction in Step 1)

### Phase Details

#### Phase 1: Schema Migrations + Dependencies (Criterion 1 + 2 + 3 foundation)

**Dependencies to install:**
- `npm add openai` — Official OpenAI SDK for Batch API path (sync path stays on existing `@ai-sdk/openai`). Vercel AI SDK does not expose Batch API (vercel/ai#8636). The two packages coexist without conflict.
- No other new dependencies required. cheerio (existing) is used for HTML cleaning — do NOT install `@mozilla/readability` or `jsdom` (see governing doc "Implementation Decisions" section).

**Schema changes** — all from the governing document's "Schema Changes Required" section. Create ONE Drizzle migration covering all changes:

1. `remoteScopeEnum`: add `region_fenced`, `onsite`, `undetermined`
2. `job` table: add `retryInFlight`, `retryGeneration`, `clearedGeneration`, `textHash`, `sourceFetchedAt`, `jobVersion`; extend `status` text to include `'provisional'`
3. `company_quality_score` table: add `companySizeScore` (numeric, nullable)
4. `source_health` table: add `escalationCount` (integer, default 0), `lastEscalatedAt` (timestamp, nullable); extend `status` to include `'banned'`
5. `company` table: add `isAgency` (boolean, default false), `isPublic` (boolean, default false), `employeeCount` (integer, nullable), `sourceOrphaned` (boolean, default false)
6. `discoverySourceEnum`: add `github_probe`, `funding_signal`

**Verify (before applying migration):**
- Run `npm run db:generate` to produce migration files.
- **STOP and show the user the generated SQL diff** (contents of the new migration file).
- **Wait for explicit user approval** before running `npm run db:migrate`. Do NOT auto-apply.
- After approval and migration: run existing test suite to confirm no regressions from schema changes.

#### Phase 2: Remote-Scope Extraction (Criterion 2)

This is the highest-value, lowest-risk subsystem. Implement first after schema:

1. **Step 1 deterministic pre-pass** in `job-normalizer.ts`:
   - ATS-native `workplaceType` trust path (Lever/Ashby — already partially exists)
   - HTML/markdown cleaning via **cheerio** (existing dep — do NOT install Readability/jsdom). Pattern: strip `nav`/`footer`/`header`/`aside`/`script`/`style`, target semantic containers (`main`, `[role="main"]`, `article`, `.jobs`, `.careers`, `.job-listing`), fall back to text-density scoring on top-level divs. See `src/lib/jobs/sanitize-html.ts` for existing cheerio usage pattern.
   - Regex hard-signals with confidence-scoring
   - Strip company HQ from scope inference

2. **Step 2 LLM extraction** in `job-normalizer.ts`:
   - Zod schema for structured output: `{ remoteScope, allowedCountries, workAuthRequired, confidence }`
   - **Sync path**: gpt-4o-mini call via existing `@ai-sdk/openai` + `generateObject` (follow existing pattern in `gate-3.ts`). Used for SLA-critical first-time normalization within 4hr provisional window.
   - **Batch path**: `openai` npm package (added in Phase 1) via `src/lib/jobs/batch-llm-client.ts` (new file — thin wrapper for Batch API submit/retrieve). Used for SLA-indifferent paths (content-drift re-normalization, dormant-tier, backlog catch-up, recovered discards). Implement the wrapper in Phase 2 but don't wire it into the normalizer until Phase 3 when batch-eligible paths exist.
   - Persist `remoteScope` + `allowedCountries` to job row

3. **Hard-fail path**: `undetermined` + `normalization_failed` (retryable). Never default to restrictive interpretation.

4. **Nightly resurrection job**: New Inngest function `nightlyResurrectionSweep` — re-run Step 2 on `undetermined`/`normalization_failed` jobs when Gate 3 capacity allows.

5. **Gate 0.5 integration**: Update `src/lib/jobs/gate-zero-pre-filter.ts` to handle new `remoteScope` values (`region_fenced`, `onsite`, `undetermined`). `undetermined` → pass-through to Gate 3 (never hard-reject).

**Tests (Vitest):**
- Unit: regex hard-signal matching, confidence-scoring, Zod schema validation
- Integration: Step 1 → Step 2 fallback ladder (mocked LLM), hard-fail path, Gate 0.5 integration with new enum values
- Cost: verify Batch API routing path (mocked)

#### Phase 3: Sourcing Pipeline + Provisional Lifecycle (Criterion 1)

1. **Funding-signal seeders** in `src/lib/jobs/seeders/`:
   - `funding-signal-rss.ts` — RSS/Atom funding feed parser (TechCrunch, etc. → company names + domains)
   - `github-events-probe.ts` — GitHub Events API poller for YC/VC-funded orgs
   - Startup filter: `employee_count < 50` before registry insert. Employee count for funding-signal-sourced companies comes from the funding event metadata (round size, stage) — not from an external enrichment API.
   - **NOT included**: `crunchbase-webhook.ts` is deferred per Pre-Resolved Concern #5. RSS/Atom feeds + GitHub Events API cover startup discovery for MVP. If Crunchbase integration is added later, it's a discovery source (finds new companies), not an enrichment API (does not populate `employeeCount`).

2. **Probe pipeline** in `src/lib/jobs/seeders/domain-probe.ts`:
   - 5-step probe order (robots.txt → common paths → JSON-LD → HTML fallback → RSS)
   - Discard criteria logic
   - Static HTML fallback via **cheerio** (existing dep) with job-page-specific heuristics + regex extraction. Do NOT use Readability/jsdom — see governing doc "Implementation Decisions".
   - Insert as `status = 'provisional'`, `tier = 'active_hot'`, `pollingEnabled = false`

3. **`normalizeProvisionalJob` Inngest function** in `functions.ts`:
   - Triggered on `job.created` where `status = 'provisional'` (30s debounce)
   - Parallel Inngest steps: `extract-and-clean` → forked `embed` + `classify-scope` → `persist-normalized-job`
   - 4-attempt retry schedule: 5min / 15min / 45min / 90min
   - Transition: success → `status = 'active'` + enqueue Gate 0.5; failure → `status = 'normalization_failed'` at 4hr SLA

4. **Staleness gate**: Compare `lastPolledAt` vs `sourceFetchedAt` on retry. Implement textHash-based dedup guard.

5. **Content-drift guard**: Cosine-distance check on re-normalization. `jobVersion++` on material drift.

6. **`retryInFlight` fencing**: 
   - `retryInFlightSweeper` — event-driven sweep (fires as Inngest step at end of each `normalizeProvisionalJob` attempt) + 30min safety-net cron with conditional skip (exit immediately if no provisional jobs exist). Force-clear stale flags. See governing doc "retryInFlight Fencing" section.
   - `retryGeneration` / `clearedGeneration` fencing-token logic in persist path
   - Inngest step timeout 5-7min

7. **Wire batch-llm-client.ts** (created in Phase 2) into the content-drift re-normalization path — this is where the Batch API path becomes active.

**Tests (Vitest):**
- Unit: probe order logic, discard criteria, regex extraction, staleness gate comparison, fencing-token rejection logic
- Integration: `normalizeProvisionalJob` full lifecycle (mocked OpenAI), retry schedule, content-drift guard
- E2E consideration: probe pipeline against real domains is integration-test territory — use mocked HTTP responses, not live probes

#### Phase 4: Job Scoring Matrix + Circuit Breaker (Criterion 3)

1. **`company_size_score` computation** in `job-normalizer.ts` (or new `src/lib/jobs/company-scorer.ts`):
   - Employee count signal: **curated big-tech registry** (`src/lib/jobs/company-enrichment/big-tech-registry.ts` — new file with ~100-200 entries: `{ canonicalName, employeeCount, isPublic, ticker? }`). At scoring time: if `company.employeeCount` is not null → use it; else if `canonicalName` matches registry → use registry value; else → skip employee-count signal, score from available signals only. Do NOT wire Crunchbase/Clearbit enrichment APIs — see governing doc "Implementation Decisions".
   - Agency/aggregator flag: from existing `src/lib/jobs/seeders/aggregator-blacklist.ts` (provides `isAggregator(slug, name)` — verified to exist)
   - Public/listed flag: from `company.isPublic` column (populated from big-tech-registry for curated set, null for others)
   - Source origin signal: from existing `discoverySourceEnum` on company row
   - Company maturity signal: from `discoveredAt` as rough age proxy
   - Clamp to [-0.30, +0.30]
   - Persist to `company_quality_score.companySizeScore`
   - Feed into `companyQuality` component (0.17 weight in `dashboard-queries.ts`)

2. **5-tier circuit breaker** in `src/lib/jobs/circuit-breaker.ts` (new file):
   - Tier 1: Per-source early-warning (3 consecutive provisional fails → 15min pause + single-test retry → escalate to 1hr)
   - Tier 2: Provisional backlog throttle (>15% / >25% / >30% provisional >1hr)
   - Tier 3: Unknown sub-floor guard (≥30% unknown at 3hr count)
   - Tier 4: Corpus-ratio breaker (`global / (global + country_fenced) < 50%`)
   - Tier 5: Daily source ban (`escalation_count ≥ 3` in 24hr → 24hr cooldown + single-test recovery)

3. **`breakerCheck` Inngest function**: Scheduled at T+3hr via cron-linked event. Per-source evaluates first, corpus-ratio second (sequential Inngest steps).

4. **`sourceBanRecoveryCheck` Inngest function**: Daily cron. Recover banned sources after 24hr cooldown.

5. **Severity stack**: Hard pause > rate reduction > normal. Per-source pause suppresses rate reductions. Rate reductions don't stack (strictest active applies).

6. **`source_orphaned` flag**: Set on companies whose only discovery source is banned. Surface in admin UI (check `src/components/admin/InfrastructureHealth.tsx` for existing patterns).

**Tests (Vitest):**
- Unit: scoring matrix computation (all signal combinations), clamping, tier assignment
- Integration: each breaker tier triggering correctly, severity stack interaction, escalation count increment, ban recovery cycle
- Integration: `breakerCheck` function with mocked corpus state

### Verification Checklist (Per Session)

Each session must verify its own work before closing. Not all items apply to every session — skip items for phases not in this session's scope.

- [ ] `npm run db:generate` produces clean migration files (Phase 1 only)
- [ ] SQL diff reviewed and approved by user before applying (Phase 1 only)
- [ ] `npm run db:migrate` succeeds (after explicit approval) (Phase 1 only)
- [ ] `npx tsc --noEmit` — 0 TypeScript errors
- [ ] `npx biome check --write` — 0 lint errors
- [ ] `npm run test` — all existing tests still pass + new tests pass
- [ ] `npm run test:coverage` — new code has meaningful coverage
- [ ] No database-mutating tests run against production (per AGENTS.md rules)
- [ ] All new Inngest functions registered in `src/inngest/functions.ts` (Phases 2, 3, 4)
- [ ] All new enum values reflected in Drizzle schema (Phase 1)
- [ ] Gate 0.5 handles all new `remoteScope` values without hard-rejecting `undetermined` (Phase 2)
- [ ] Session State section updated with all fields filled (MANDATORY before close)
- [ ] Next session's "Files to read before starting" list updated (MANDATORY before close)

### Key Constraints (From AGENTS.md — Do Not Violate)

- **No raw SQL** unless for complex vector/GIN queries — use Drizzle ORM
- **Biome** for formatting (never ESLint/Prettier) — use `biome check --write`
- **Vitest** for unit/integration tests, **Playwright** for E2E — never mix
- **Never modify `src/components/ui/`** (shadcn components)
- **Tailwind v4 CSS-first** — no `tailwind.config.js`
- **Never run Git commands** — leave all version control to the user
- **Never perform destructive operations** without explicit user confirmation
- **Database mutation in tests**: prefer mocks, ask before touching real DB

### Pre-Resolved Implementation Concerns

All concerns that were open questions in the initial handoff have been resolved during pre-implementation investigation. The resolutions are documented in the governing document's "Implementation Decisions" section. Summary for quick reference:

1. **Employee count data source (RESOLVED)**: Curated big-tech registry (`src/lib/jobs/company-enrichment/big-tech-registry.ts`) with ~100-200 entries for the high-impact penalty cases. Graceful degradation when `employeeCount` is null and company not in registry — score from available signals only. No Crunchbase/Clearbit enrichment API needed for MVP. See governing doc "Implementation Decisions" → "Employee Count Signal".

2. **HTML cleaning package (RESOLVED)**: Use cheerio (existing dep) with custom job-page-specific heuristics. Do NOT install `@mozilla/readability` (requires jsdom/linkedom as second undocumented dependency; tuned for articles not job pages). See governing doc "Implementation Decisions" → "HTML Cleaning".

3. **OpenAI Batch API (RESOLVED)**: Add `openai` npm package in Phase 1. Sync path stays on existing `@ai-sdk/openai` + `generateObject`. Batch path uses raw `openai` client via `src/lib/jobs/batch-llm-client.ts`. See governing doc "Implementation Decisions" → "OpenAI Batch API".

4. **`aggregator-blacklist.ts` (VERIFIED)**: File exists at `src/lib/jobs/seeders/aggregator-blacklist.ts` and exposes `isAggregator(atsSlug, companyName)`. No creation needed — use directly in scoring matrix.

5. **Crunchbase webhook vs polling (DEFERRED)**: Not needed for MVP. The funding-signal seeders (RSS/Atom feeds + GitHub Events API) provide startup discovery without Crunchbase API integration. The existing `funding-signal.ts` (D7) is a slugger retry queue sweeper, not a Crunchbase integration. If Crunchbase enrichment is added later, it populates `company.employeeCount` directly and the big-tech-registry becomes redundant for those companies.
