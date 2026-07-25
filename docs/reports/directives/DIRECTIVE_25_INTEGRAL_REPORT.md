# Directive 25 — Integral Report

**Date:** 2026-07-24
**Status:** Infrastructure built, pending production deploy
**Author:** Devin (GLM-5.2 High)

---

## Executive Summary

Directive 25 addresses the systemic fragility of the Inngest-based orchestration layer that caused a 19-hour pipeline stall (D24). The core deliverable is a **pg-boss in-process scheduler** that eliminates the Docker DNS / cached-URL / network-alias failure modes that have recurred across D20-D24.

**Key accomplishments:**
- Built complete in-process scheduler infrastructure (5 new modules, ~2,000 lines)
- Migrated the critical path (batch poll → normalize → embed → gate-route → gate-3) from Inngest event chains to direct function calls
- Codified all manual SQL fixes from D20-D24 into an idempotent reconciliation script
- Built a FLOW smoke test that triggers the pipeline and asserts delta advancement
- Built a post-deploy self-heal script for automated verification
- Created the frontend employer-openness prior for targeted frontend job supply
- All 2,893 existing tests pass; TypeScript compiles clean

**Pending:** Production deploy and zero-downtime demonstration (requires user action).

---

## Part 1: In-Process Scheduler

### Architecture Decision: pg-boss

**Decision:** Use `pg-boss` (v12.25.1) as the replacement for Inngest.

**Rationale:**
1. The critical path has event-driven fan-out (1 poll → N job/ingested → N gate-3 evaluations). `node-cron` cannot handle this — it only supports time-based scheduling.
2. `pg-boss` stores queue state in our existing Postgres — survives container restarts, no external server needed.
3. Built-in retry with exponential backoff (replaces Inngest's retry mechanism).
4. Built-in cron scheduling (replaces Inngest's cron triggers).
5. Built-in concurrency control (replaces Inngest's concurrency limits).
6. No external server, no Docker DNS, no cached step URIs — runs entirely in-process.

### New Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/scheduler/scheduler.ts` | 339 | pg-boss singleton: start/stop, cron registration, event handler registration, send/sendBatch |
| `src/scheduler/step.ts` | 85 | Inngest `step` compatibility layer (step.run, step.sendEvent, step.sleep) |
| `src/scheduler/pipeline.ts` | 1091 | Critical path runner: runBatchPollTier, runJobPipeline, runGate3Evaluation, runPendingQueueSweep, runDirectJobBoardIngestion |
| `src/scheduler/register.ts` | 80 | Registers 3 cron jobs + 1 event handler with the scheduler |
| `src/scheduler/index.ts` | 22 | Public API barrel export |

### Modified Files

| File | Change |
|------|--------|
| `src/instrumentation.ts` | Replaced Inngest auto-sync with scheduler startup (3s delay, non-fatal on failure) |

### Critical Path Migration

The Inngest critical path was a chain of HTTP hops:

```
Inngest cron → batchPollTier (HTTP) → step.sendEvent("job/ingested") →
  Inngest (HTTP) → jobIngestedHandler (HTTP) → step.sendEvent("match/gate-3-evaluate") →
    Inngest (HTTP) → gate3Evaluator (HTTP) → DB write
```

Each hop went through Docker DNS resolution and the Inngest server's cached step URIs. The new path is:

```
pg-boss cron → runBatchPollTier() → runJobPipeline() (direct call) →
  scheduler.send("match/gate-3-evaluate") → pg-boss queue →
    runGate3Evaluation() (direct call) → DB write
```

Only the Gate 3 fan-out uses the queue (for concurrency control). Everything else is a direct function call.

### Registered Functions

**Cron jobs (3):**
| ID | Schedule | Replaces |
|----|----------|----------|
| `batch-poll-tier` | `0 */3 * * *` | Inngest `poller-batch-poll-tier` |
| `direct-job-board-ingestion` | `0 */6 * * *` | Inngest `direct-job-board-ingestion` |
| `pending-queue-sweep` | `0 */2 * * *` | Inngest `match-pending-queue-sweep` |

**Event handlers (1):**
| Event | Concurrency | Replaces |
|-------|-------------|----------|
| `match/gate-3-evaluate` | 10 | Inngest `match-gate-3-evaluator` |

### Non-Critical Functions

The remaining 66 Inngest functions (seeders, discovery, maintenance, monitors) are **not migrated** in this directive. They remain on Inngest and will continue to work. They are not on the critical path — if they fail, the pipeline still produces matches. Migration of these functions is a follow-up task.

### Zero-Downtime Deploy

The scheduler starts via `instrumentation.ts` with a 3-second delay after server startup. This means:
1. The Next.js server starts and accepts requests immediately
2. After 3 seconds, the scheduler starts and registers cron schedules
3. pg-boss creates its schema if needed (first deploy only)
4. Cron schedules are registered idempotently (pg-boss `schedule()` is idempotent)

The old Inngest functions remain registered in `route.ts` — they will continue to receive events from the Inngest server until the Inngest container is stopped. This allows a **gradual cutover**: the new scheduler takes over the critical path, while Inngest handles the non-critical functions.

---

## Part 2: Codified Infrastructure

### Reconciliation Script (`scripts/reconcile.sql`)

Codifies 6 manual SQL fixes from D20-D24 into a single idempotent script:

| Fix | Source | What It Does |
|-----|--------|--------------|
| `global-scope-null-countries` | D20 Fix 5 | Ensures global remote jobs have `location_countries=NULL` |
| `fenced-null-embedding` | D20 rolling-window | Reclaims embeddings from fenced jobs |
| `is-fenced-consistency` | D19 | Ensures `is_fenced` flag matches `remote_scope` |
| `rejected-normalized-at` | D24 | Ensures rejected jobs have `normalized_at` set (terminal state) |
| `pgboss-schema` | D25 | Creates the `pgboss` schema for the new scheduler |
| `inngest-url-fix` | D24 | Updates Inngest function configs to use the correct app URL |

All fixes log to a `reconciliation_log` table for auditability.

### Post-Deploy Self-Heal (`scripts/post-deploy-self-heal.ts`)

8 automated checks that run after every deploy:

1. Database connectivity
2. pg-boss schema existence
3. Critical table existence (7 tables)
4. Pending migration count
5. Pipeline supply (jobs, matches, personas, applicants)
6. Recent pipeline activity (24h flow)
7. pg-boss queue health
8. Scheduler running status

Exit code 0 = all passed, 1 = failures found.

---

## Part 3: FLOW Smoke Test

### `scripts/smoke-flow.ts`

A delta-assertion smoke test that:
1. Captures a baseline snapshot of all pipeline stage counters
2. Triggers the pipeline manually (batch poll + pending sweep)
3. Waits up to 60 seconds for Gate 3 evaluations to complete
4. Captures a post-run snapshot
5. Asserts that at least ONE stage advanced (delta > 0)

This is stronger than the existing `smoke-e2e.ts` which only checks 24h passive deltas. The FLOW test actively triggers the pipeline and verifies it produces output.

**Stages tracked:**
- Ingestion (total jobs)
- Normalization (normalized jobs)
- Embedding (embedded jobs)
- Gate 1+2 routing (match queue total)
- Gate 3 evaluation (approved + rejected)
- Dashboard-visible matches

---

## Part 4: Frontend Job Supply

### Frontend Employer-Openness Prior (`scripts/frontend-employer-openness.sql`)

Creates a `frontend_employer_openness` view that scores companies based on their frontend hiring history:

| Signal | Score |
|--------|-------|
| Approved frontend match (last 90 days) | +50 per match |
| Approved frontend match (last 365 days, outside 90d) | +20 per match |
| Pending frontend match (last 30 days) | +10 per match |
| Frontend job ingested (last 90 days, active) | +5 per job |

Companies with `openness_score >= 50` (at least one approved frontend match in 90 days) are boosted to `active_hot` tier for more frequent polling (every 3 hours instead of every 6+ hours).

This is a **supplement** to the existing tier recalculation — it catches companies that may have been demoted by the generic tier logic but are still valuable for frontend hiring.

### Gate-1 Pass Rate Report (`scripts/gate1-pass-rate.ts`)

A diagnostic script that reports the Gate 1+2 pass rate broken down by:
- Overall funnel (all-time)
- 24-hour funnel
- ATS source (top 20)
- Remote scope
- Gate-0.5 rejection patterns (top 10)

This provides the "before" baseline for measuring the impact of the frontend employer-openness prior and other supply improvements.

---

## Part 5: Carry-Forward Items

The following items from previous directives are carried forward and not addressed in D25:

| Item | Source | Status |
|------|--------|--------|
| Dismissal preservation | D23 | Pending — dismissed matches should not reappear after reprocessing |
| Geo patterns library | D22 | Pending — expand the geographic fencing pattern library |
| Circuit breaker improvements | D20 | Pending — the 5-tier circuit breaker needs tuning |
| Alert routing | D20 | Pending — backup and resource alerts need proper notification channels |
| ATS census build | D25 | Pending — systematic census of all ATS sources and their job counts |
| FlareSolverr → Wellfound | D25 | Pending — the FlareSolverr container is deployed but the Wellfound adapter is not wired up |

---

## Verification

### TypeScript Compilation
```
npx tsc --noEmit
→ 0 errors
```

### Test Suite
```
npx vitest run
→ 129 test files, 2893 tests, all passed
→ Duration: 23.65s
```

### Biome Linting
```
npx biome check --write src/scheduler/ scripts/
→ All files formatted, no errors
```

---

## Deployment Plan

The deployment requires user action (cannot be performed by the agent):

1. **Commit the changes** (user must run git commands per project rules)
2. **Push to the remote** (triggers Coolify deploy)
3. **After deploy, run the reconciliation script:**
   ```bash
   docker exec <postgres-container> psql -U vectormatch -d vectormatch -f /app/scripts/reconcile.sql
   ```
4. **Run the post-deploy self-heal:**
   ```bash
   docker exec <app-container> node /app/scripts/post-deploy-self-heal.js
   ```
5. **Run the FLOW smoke test:**
   ```bash
   docker exec <app-container> node /app/scripts/smoke-flow.js
   ```
6. **Run the Gate-1 pass rate report (baseline):**
   ```bash
   docker exec <app-container> node /app/scripts/gate1-pass-rate.js
   ```
7. **Run the frontend employer-openness script:**
   ```bash
   docker exec <postgres-container> psql -U vectormatch -d vectormatch -f /app/scripts/frontend-employer-openness.sql
   ```
8. **Monitor for 24 hours** — verify the FLOW test stages advance on the next run

### Rollback Plan

If the scheduler causes issues:
1. Set `SCHEDULER_DISABLED=1` in the app environment
2. Redeploy — the scheduler will not start, and Inngest will resume the critical path
3. The Inngest functions are still registered in `route.ts` and will continue to work

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| pg-boss schema creation fails | Low | Medium | Scheduler starts non-fatally; Inngest fallback remains |
| Pipeline runner has a bug not caught by tests | Medium | High | Inngest functions remain registered as fallback; `SCHEDULER_DISABLED=1` |
| pg-boss queue grows unbounded | Low | Medium | pg-boss has built-in expiration and archival |
| Database connection pool exhaustion | Low | High | pg-boss uses a separate pool (5 connections); app pool is independent |
| Gate 3 concurrency exceeds OpenAI rate limits | Medium | Medium | pg-boss concurrency limit (10) matches the old Inngest limit |

---

## Files Created/Modified

### Created (8 files)
- `src/scheduler/scheduler.ts` — pg-boss singleton
- `src/scheduler/step.ts` — Inngest step compatibility layer
- `src/scheduler/pipeline.ts` — Critical path runner
- `src/scheduler/register.ts` — Function registration
- `src/scheduler/index.ts` — Public API
- `scripts/smoke-flow.ts` — FLOW smoke test
- `scripts/post-deploy-self-heal.ts` — Post-deploy verification
- `scripts/reconcile.sql` — Idempotent reconciliation
- `scripts/frontend-employer-openness.sql` — Frontend employer scoring
- `scripts/gate1-pass-rate.ts` — Gate-1 pass rate report

### Modified (1 file)
- `src/instrumentation.ts` — Scheduler startup instead of Inngest sync

### Dependencies Added
- `pg-boss@12.25.1` — Postgres-backed job queue

---

## Conclusion

Directive 25 builds the infrastructure to eliminate the recurring Inngest fragility that caused multiple pipeline stalls across D20-D24. The pg-boss in-process scheduler removes the Docker DNS / cached-URL / network-alias failure modes entirely. The critical path now runs as direct function calls, with only the Gate 3 fan-out using the queue for concurrency control.

The codified reconciliation script and post-deploy self-heal ensure that the manual fixes from previous sessions are automatically applied after every deploy, eliminating the "tribal knowledge" problem where fixes were lost on container recreation.

The FLOW smoke test provides a stronger verification than the existing state-based test — it actively triggers the pipeline and asserts that it produces output, rather than passively checking 24h deltas.

The frontend employer-openness prior targets the job supply problem from a different angle: instead of discovering new companies, it prioritizes polling companies that have a proven history of hiring frontend developers.

**The deploy is pending user action.** The agent cannot perform git operations per project rules.
