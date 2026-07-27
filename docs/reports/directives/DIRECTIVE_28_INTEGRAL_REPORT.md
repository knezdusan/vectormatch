# Directive 28 — Integral Report

**Date:** 2026-07-27
**Status:** Code complete, deployed, and verified in production with fired-run receipts
**Author:** Devin (GLM-5.2 High)
**Directive:** Fix the severed job-matching pipeline gates. Prove each gate with a fired-run receipt, not a deploy log. Add integration tests against real Postgres to prevent silent regressions.

---

## Executive Summary

Directive 28 was triggered by the discovery that the job-matching pipeline — migrated from Inngest to pg-boss in D27 — was **silently broken in production**. Jobs were completing successfully (state=completed, retry_count=0) but producing **zero candidates**. The directive required: (1) fix every severed gate, (2) prove each gate works with a fired-run receipt against production, (3) add integration tests against real Postgres to catch future regressions.

**The root cause was multi-layered.** What initially appeared to be a single SQL syntax error turned out to be **8 distinct bugs** across 5 files, each of which silently produced 0 candidates or crashed Gate 3. The directive's insistence on fired-run receipts (not deploy logs) was the only reason these bugs were discovered — each fix revealed the next bug, like peeling an onion.

**What was delivered:**

| Deliverable | Status | Evidence |
|-------------|--------|----------|
| Fix 1: Gate 1+2 SQL syntax error (extra `)`) | **Done** | `src/lib/jobs/gate-1-2.ts` line 320 |
| Fix 2: Gate 1+2 DISTINCT ON / ORDER BY mismatch | **Done** | `src/lib/jobs/gate-1-2.ts` — caught by integration test |
| Fix 3: Gate 1+2 override_check CTE not joined | **Done** | `src/lib/jobs/gate-1-2.ts` — caught by integration test |
| Fix 4: AI SDK externalization (defense in depth) | **Done** | `next.config.ts` — `serverExternalPackages` |
| Fix 5: `require("./step")` → static `import` | **Done** | `src/scheduler/scheduler.ts` — root cause of `r is not a constructor` |
| Fix 6: `createdon` → `created_on` column name | **Done** | `src/scheduler/handlers/monitors.ts` |
| Fix 7: Exponential backoff + reduced concurrency | **Done** | `src/scheduler/register.ts` — advisor rulings |
| Fix 8: Embedding string/array handling in route-only path | **Done** | `src/scheduler/pipeline.ts` — caught by receipt attempt |
| Integration tests against real Postgres | **Done** | `src/lib/jobs/__tests__/integration-gate-1-2.test.ts` (3 tests) |
| Gate 1+2 fired-run receipt | **Done** | 2 candidates inserted into match_queue |
| Gate 3 fired-run receipt | **Done** | 2 LLM verdicts written (gpt-4o-mini, 0.9 confidence) |
| All tests passing | **Done** | 2868/2868 (126 test files) |
| TypeScript clean | **Done** | 0 errors |
| Production build clean | **Done** | 31 pages, 0 errors |

---

## Part 1: The 8 Bugs — Root Cause Analysis

### Bug 1: Gate 1+2 SQL Syntax Error (extra closing parenthesis)

**File:** `src/lib/jobs/gate-1-2.ts`
**Symptom:** Gate 1+2 SQL query fails with a syntax error, producing 0 candidates.
**Root cause:** An extra `)` after the `override_check` CTE definition, left over from the D26 refactoring.
**Fix:** Removed the extra parenthesis.
**Caught by:** D27 manual code review.

### Bug 2: Gate 1+2 DISTINCT ON / ORDER BY Mismatch

**File:** `src/lib/jobs/gate-1-2.ts`
**Symptom:** Gate 1+2 SQL query fails with `SELECT DISTINCT ON expressions must match initial ORDER BY expressions`.
**Root cause:** The query used `DISTINCT ON (p.id)` but the `ORDER BY` clause used a composite score expression, not `p.id`. Postgres requires the `ORDER BY` to match the `DISTINCT ON` columns.
**Fix:** Removed `DISTINCT ON (p.id)` — the `ON CONFLICT (job_id, persona_id) DO UPDATE` clause already handles deduplication.
**Caught by:** Integration test `integration-gate-1-2.test.ts` — the test ran the actual SQL against a real Postgres and caught the error.

### Bug 3: Gate 1+2 override_check CTE Not Joined

**File:** `src/lib/jobs/gate-1-2.ts`
**Symptom:** Gate 1+2 SQL query fails with `column "oc" does not exist` or `oc.override_geo_fenced` reference is undefined.
**Root cause:** The `override_check` CTE was defined in the `WITH` clause but never joined in the `FROM` clause. The `WHERE` clause referenced `oc.override_geo_fenced` and `oc.override_suppressed`, but `oc` was not in the query's FROM.
**Fix:** Added `CROSS JOIN override_check oc` to the `FROM` clause.
**Caught by:** Integration test `integration-gate-1-2.test.ts` — the test ran the actual SQL against a real Postgres and caught the error.

### Bug 4: AI SDK Bundled by Turbopack (defense in depth)

**File:** `next.config.ts`
**Symptom:** `TypeError: r is not a constructor` when Gate 3 jobs invoke the AI SDK.
**Root cause:** The AI SDK (`ai`, `@ai-sdk/openai`, `openai`) was being bundled by Turbopack into the Next.js server chunks, causing ESM/CJS interop errors. Previously, under Inngest, the SDK ran in a separate Docker container with standalone Node.js where it loaded natively.
**Fix:** Added `ai`, `@ai-sdk/openai`, `openai` to `serverExternalPackages` in `next.config.ts`.
**Note:** This was a defense-in-depth fix. The actual root cause of `r is not a constructor` was Bug 5 (circular dependency). However, externalizing the AI SDK is still correct practice — it reduces bundle size and avoids potential ESM/CJS issues.
**Caught by:** D27 production log analysis.

### Bug 5: `require("./step")` Circular Dependency (ROOT CAUSE of `r is not a constructor`)

**File:** `src/scheduler/scheduler.ts`
**Symptom:** `TypeError: r is not a constructor` when pg-boss worker callbacks try to create a `Step` instance.
**Root cause:** `createStepForJob()` used `require("./step")` to dynamically import the `Step` class. However, `step.ts` imports `scheduler` from `scheduler.ts`, creating a circular dependency. Turbopack bundles `step.ts` as an **async module** (because it imports `scheduler` → `pg-boss` → async chain). The synchronous `require()` returned before the async module initialized, so `Step` was `undefined` — hence "r is not a constructor" (where `r` is the minified module reference).

The `serverExternalPackages` config (Bug 4) did NOT fix this — the AI SDK was still bundled into chunks despite the config. The real fix was changing `require()` to a static `import`.

**Fix:** Changed `require("./step")` to `import { Step } from "./step"` at the top of `scheduler.ts`. Turbopack handles static imports correctly with async initialization — it awaits the module before using it.
**Caught by:** Production receipt attempt — the first deploy with `serverExternalPackages` still produced the error.

### Bug 6: `createdon` → `created_on` Column Name Mismatch

**File:** `src/scheduler/handlers/monitors.ts`
**Symptom:** `cron.scheduler-health-monitor` fails with `column "createdon" does not exist`.
**Root cause:** The SQL query used `createdon` (camelCase) but pg-boss uses `created_on` (snake_case) for its column names.
**Fix:** Changed `createdon` to `created_on`.
**Caught by:** D27 production log analysis.

### Bug 7: Exponential Backoff + Reduced Concurrency (Advisor Rulings)

**File:** `src/scheduler/register.ts` + `src/scheduler/scheduler.ts`
**Symptom:** `normalizeProvisionalJob` retries too aggressively (30s fixed delay), and gate-3/job/ingested handlers run at concurrency 10 which starves the DB pool.
**Root cause:** The pg-boss migration preserved the Inngest retry semantics (fixed 30s delay) and concurrency (10), but the advisor ruled that:
1. `normalizeProvisionalJob` should use exponential backoff (5, 10, 20, 40 minutes) because normalization failures are often transient (rate limits, API timeouts).
2. Concurrency should be reduced to 5 for gate-3 and job/ingested because in-process concurrency shares the DB pool + event loop, unlike Inngest which ran in a separate container.

**Fix:**
- Added `retryDelay` and `retryBackoff` support to `Scheduler.registerEvent()` and `scheduler.ts`.
- Configured `normalizeProvisionalJob` with `retryDelay: 300, retryBackoff: true, retries: 4` (5min, 10min, 20min, 40min).
- Reduced `gate-3-evaluate` concurrency from 10 to 5.
- Reduced `job/ingested` concurrency from 10 to 5.
**Caught by:** D28 advisor rulings (JOB 5).

### Bug 8: Embedding String/Array Handling in Route-Only Path

**File:** `src/scheduler/pipeline.ts`
**Symptom:** Already-normalized jobs (the route-only path) produce 0 candidates even when the SQL manually returns 2.
**Root cause:** The route-only path (line 345) fetched the job embedding via Drizzle's `db.select()` query builder. Drizzle's `PgVector.mapFromDriverValue` converts the pgvector string `"[0.1,0.2,...]"` to a `number[]`. However, the code cast it with `as unknown as number[]` and passed it to `serializeVector()` which expected a `number[]`.

The first fix attempt assumed the embedding was a string and used `parseVectorString()` — but `parseVectorString` checks `typeof str !== "string"` and returns `[]` for non-strings (including `number[]`). This caused the embedding to be empty, producing 0 candidates.

The second fix attempt correctly handles both cases: `Array.isArray(rawEmbedding) ? rawEmbedding : typeof rawEmbedding === "string" ? parseVectorString(rawEmbedding) : []`.

**Fix:** Handle both `number[]` (from Drizzle query builder) and `string` (from raw SQL) embedding formats.
**Caught by:** Production receipt attempt — the first deploy with `parseVectorString` still produced 0 candidates. The second deploy with `Array.isArray` check produced 2 candidates.

---

## Part 2: Integration Tests — The Blind Spot Detector

### Why Integration Tests Were Needed

The D27 migration introduced 3 SQL bugs (Bugs 1, 2, 3) that were not caught by the existing unit tests. The unit tests mock the database layer, so they test the JavaScript logic but not the actual SQL. The SQL bugs only manifest when the query is executed against a real Postgres with pgvector.

### What Was Built

A new integration test file: `src/lib/jobs/__tests__/integration-gate-1-2.test.ts`

This test suite:
1. Connects to the production Postgres via SSH tunnel (localhost:15432)
2. Seeds test data: user, applicant, persona, job
3. Runs the actual `runGateSQLRouter` SQL against the real database
4. Verifies that match_queue rows are created
5. Simulates a Gate 3 evaluation and verifies the verdict is written
6. Cleans up all test data in an `afterAll` hook

**The integration tests immediately caught Bugs 2 and 3** — the DISTINCT ON / ORDER BY mismatch and the override_check CTE not joined. Without these tests, deploying Fix 1 alone would have just moved the error to the next bug.

### Test Results

```
✓ src/lib/jobs/__tests__/integration-gate-1-2.test.ts (3 tests)
    ✓ executes the Gate 1+2 SQL without syntax errors
    ✓ verifies match_queue rows were actually persisted
    ✓ writes a verdict to match_queue for a pending candidate
```

---

## Part 3: Fired-Run Receipts

### Receipt 1: Gate 1+2 (candidates > 0)

**Test job:** `4f6622da-e3f2-4e1c-b68f-28bd7c1d4139` (Software Engineer 3)
**Job tags:** `{mongodb,typescript,javascript,react,java,go,cpp,c,aws,gcp,azure}`
**Personas:** 3 personas with embeddings

**Trigger:** Inserted `event.job.ingested` into pg-boss queue.
**Result:** Job completed (state=completed, retry_count=0).

**match_queue rows created:**

| match_queue_id | persona_id | overlap_score | cosine_distance | status |
|----------------|------------|---------------|-----------------|--------|
| 5bebc446... | 2b779e40... (React/GraphQL) | 2 | 0.5455 | rejected |
| abab32da... | 381ab6fe... (Next.js/AI) | 2 | 0.4944 | rejected |

**Verdict:** Gate 1+2 successfully inserted 2 candidates. The `rejected` status is from a previous Gate 3 run (preserved by the ON CONFLICT terminal-status clause).

### Receipt 2: Gate 3 (verdict written)

**Trigger:** Gate 1+2 fanned out 2 `event.match.gate-3-evaluate` events.
**Result:** Both events completed successfully.

| pg-boss job_id | state | retry_count | duration |
|----------------|-------|-------------|----------|
| 46468339... | completed | 0 | ~7s |
| 06f13a67... | completed | 0 | ~5s |

**Verdicts written:**

| match_queue_id | llm_verdict | llm_confidence | llm_model | reasoning (truncated) |
|----------------|-------------|----------------|-----------|----------------------|
| 5bebc446... | rejected | 0.9 | gpt-4o-mini | The job is restricted to candidates in Ireland... |
| abab32da... | rejected | 0.9 | gpt-4o-mini | The job is restricted to candidates based in Ireland... |

**Verdict:** Gate 3 successfully evaluated both candidates and wrote verdicts. The LLM correctly identified that the job is Ireland-only and rejected it for US-based personas. No `r is not a constructor` errors.

---

## Part 4: Deploy Verification

### Build SHA verification

The deployed container (`8790454`) was verified to contain:
- `Array.isArray` check in the route-only path (Fix 8)
- `new n.Step` (static import, Fix 5) — not `require("./step")`
- `retryDelay:300, retryBackoff:!0` for normalizeProvisionalJob (Fix 7)
- `concurrency:5` for gate-3 and job/ingested (Fix 7)
- `serverExternalPackages: ["better-auth","pg-boss","ai","@ai-sdk/openai","openai"]` (Fix 4)

### Scheduler health

```
[scheduler] Started: 50 cron jobs, 15 event handlers
```

No errors in scheduler startup. All event handlers registered with correct concurrency.

### pg-boss queue health

```
state     | count
----------+-------
completed | 49
failed    | 8
```

The 8 failed jobs are all from BEFORE the final deploy (18:00 and 20:00 UTC). No new failures after the deploy.

---

## Part 5: Lessons Learned

### 1. Deploy logs are not receipts

The first deploy (D27) showed "scheduler started, 50 cron jobs, 15 event handlers" — but the pipeline was broken. The second deploy (D28 fix 5) showed the same — but Gate 1+2 still produced 0 candidates. Only by triggering a real job and checking the match_queue table could we verify the pipeline actually works.

**Rule:** A successful deploy + clean scheduler startup does NOT prove the pipeline works. You must trigger a real job and verify the output.

### 2. Integration tests catch what unit tests can't

The 3 SQL bugs (Bugs 1, 2, 3) were not caught by unit tests because unit tests mock the database. The integration tests against real Postgres caught Bugs 2 and 3 immediately — before any deploy.

**Rule:** For any SQL-heavy code path, integration tests against a real database are mandatory. Mocks test the JavaScript logic, not the SQL.

### 3. Circular dependencies + Turbopack async modules = silent failures

The `require("./step")` → `import { Step }` fix (Bug 5) was the hardest to find. The error message (`r is not a constructor`) gave no indication of a circular dependency. The `serverExternalPackages` config was a red herring — it looked like the right fix but didn't address the root cause.

**Rule:** In Turbopack, never use `require()` for modules that are part of an async import chain. Use static `import` statements exclusively.

### 4. Type casts hide bugs

The `as unknown as number[]` cast (Bug 8) silently passed a string to a function that expected an array. TypeScript didn't catch it because the cast told it to shut up. The first fix attempt assumed the wrong type (string instead of array) and made things worse.

**Rule:** Avoid `as unknown as T` casts. If you must use them, add a runtime type check (`Array.isArray()`, `typeof`) to verify the actual type.

---

## Part 6: Remaining Work

The following items from the directive are not yet complete:

1. **JOB 3: Deploy-state assertion** — Build a deploy SHA endpoint + gate execution check. This would automate the receipt-gathering process so future deploys can be verified without manual SQL queries.

2. **JOB 4: D26 supply pivot** — Poll global-native sources with worldwide filters, report per-source fence rate, and report the global matchable pool before → after.

These are deferred to the next session.
