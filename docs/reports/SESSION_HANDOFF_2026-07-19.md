# SESSION HANDOFF — VectorMatch — 2026-07-19

## IMMEDIATE CRISIS: Neon Burn

**Neon is at 97.9% (2.05 CU-hrs remaining) of the 100 CU-hr monthly allowance.**
**Burn rate: 5.34 CU-hrs/day. Projected exhaustion: ~10 hours from now.**

**The D17 cron freeze is committed and pushed to origin/main but NOT deployed to production.**
Evidence: `breaker_check_v2` is still running every hour (06:05, 05:05, 04:05, 03:05, 02:05, 01:05 UTC today), processing 50 items per run. The D17 code freezes 28 of 36 crons, which would reduce burn to ~0.5-1.0 CU-hrs/day.

**Git state:** All changes are committed and pushed. Branch `main` is up to date with `origin/main`. Latest commit: `2a26084 Neon CPU limit fix` (Jul 18 19:31). Coolify should auto-deploy on push — if it hasn't, the user may need to manually trigger a deploy or check Coolify logs.

**What the user needs to do ASAP:**
1. Verify Coolify deployed the latest commit (check Coolify deploy logs)
2. If not deployed, manually trigger a deploy
3. After deploy, verify Inngest re-registered functions (the D17 freeze changes cron schedules in Inngest function definitions — Inngest only picks up new schedules when the function is re-registered during a deploy)
4. If Inngest didn't re-register: check that the Inngest serve endpoint is reachable and the sync API was called

---

## DIRECTIVE 18 — COMPLETE (Code committed, pending deploy verification)

### What was done

D18 diagnosed why the matcher was producing zero matches. Four root-cause breaks were identified and fixed:

**Break 1 — GATE2_MAX_COSINE_DISTANCE=0.50 env var override**
- The `.env` file had `GATE2_MAX_COSINE_DISTANCE=0.50`, overriding the D16 code default of 0.55
- This blocked 22 perfect Node/React matches at cosine 0.50-0.55
- **Status:** User removed this env var from Coolify. Local `.env` still has it on lines 43 and 55 (user should remove locally too).

**Break 2 — Idempotency trap in jobIngestedHandler**
- If the handler crashed after Step 4 (write normalization) but before Step 5 (gate router), the job was normalized + embedded but NOT in match_queue. On retry, the handler skipped it entirely because `normalizedAt IS NOT NULL`.
- **Fix:** Added a "route-only" recovery path in `src/inngest/functions.ts` (lines 2644-2720). When a job is already normalized + embedded but has no match_queue entries, the handler now runs the gate router directly.

**Break 3 — Bulk reprocess function never runs**
- The `match-retry-sweep` finds 14-26 unmatched jobs per run and sends `match/bulk-reprocess` events, but the `matchBulkReprocess` Inngest function has ZERO logs — it has never executed.
- **Status:** Not fixed. The idempotency trap fix (Break 2) reduces the need for it, but it should still work as a safety net. Needs separate investigation (Inngest event delivery issue).

**Break 4 — Embedding granularity mismatch (the representation disease)**
- Persona embedding = 3-sentence summary (50-500 chars). Job embedding = title + full description (thousands of chars). Perfect matches sit at cosine 0.45-0.55, not 0.20-0.35. The spread between perfect (0.47) and terrible (0.72) is only 0.25 — not enough for a threshold cut.
- **Fix (Gate Re-architecture):** Gate 2 is now a RANK signal, not a GATE. `GATE2_RANK_ONLY` mode (default: true) uses `GATE2_HARD_CEILING` (0.75) as a wide safety net and orders candidates by semantic distance. The cosine cliff is eliminated.
- **Files changed:** `src/lib/jobs/matching-config.ts` (added GATE2_RANK_ONLY, GATE2_HARD_CEILING), `src/lib/jobs/gate-1-2.ts` (Gate 2 WHERE clause uses rank-only mode)

### Gate 3 Direct Evaluation (bypassing Inngest)

Since the Inngest client couldn't send events from local dev mode (`INNGEST_DEV=1`, `ECONNREFUSED`), I ran Gate 3 evaluation directly via `scripts/d18-run-gate3-direct.ts`. This script:
- Fetches job/persona/applicant context from DB
- Calls `evaluateGate3` with gpt-4o-mini directly (bypassing Inngest)
- Writes verdicts directly to match_queue

**Result:** 20 approved, 36 rejected, 0 errors out of 56 candidates.

### Current Match Queue State (as of 2026-07-19 08:13 UTC)

```
approved:  21  (was 3 before D18)
rejected:  31
pending:    7  (new — from match_retry_sweep at 05:00 UTC)
applied:    1  (USER APPLIED TO A JOB — dashboard is working!)
mismatch:   1  (USER MARKED A MISMATCH — feedback loop active)
```

The user has been interacting with the dashboard. They applied to one job and marked one as a mismatch. The `match_retry_sweep` ran at 05:00 UTC, found 35 jobs, and 7 new pending entries were inserted. These 7 pending entries need Gate 3 evaluation (the pending queue sweep at 06:00 UTC should have caught them, but there are no gate-3 logs — the sweep may not be emitting events properly).

---

## KEY FILES MODIFIED IN D18 (all committed)

### Source code changes:
1. **`src/lib/jobs/matching-config.ts`** — Added `GATE2_RANK_ONLY` (default: true) and `GATE2_HARD_CEILING` (default: 0.75)
2. **`src/lib/jobs/gate-1-2.ts`** — Gate 2 WHERE clause uses `GATE2_HARD_CEILING` in rank-only mode, `GATE2_MAX_COSINE_DISTANCE` in gate mode
3. **`src/inngest/functions.ts`** — Idempotency trap fix: "route-only" recovery path for already-normalized jobs with no match_queue entries (lines 2644-2720)

### Diagnostic scripts (all in `scripts/`):
- `d18-bypass-test.ts` — Part A localizer (35 jobs × per-gate trace)
- `d18-candidate-selection-probe.ts` — Investigated the 7 CANDIDATE_SELECTION breaks
- `d18-gate-trace.ts` — Traced specific jobs through dedup/blocklist checks
- `d18-gate-router-manual.ts` — Ran the gate router SQL manually
- `d18-company-tier-check.ts` — Verified company tiers, found the env var override
- `d18-route-unmatched.ts` — Manually routed 56 candidates into match_queue
- `d18-trigger-gate3.ts` — Attempted to trigger Gate 3 via Inngest (failed — dev mode)
- `d18-run-gate3-direct.ts` — Ran Gate 3 directly, bypassing Inngest (succeeded)

### Reports:
- `docs/reports/DIRECTIVE_18_INTEGRAL_REPORT.md` — Full D18 report
- `docs/reports/d18-bypass-test.json` — Part A bypass test data

---

## GIT STATE

```
Branch: main (up to date with origin/main)
Latest commits:
  2a26084 Neon CPU limit fix                          (Jul 18 19:31)
  e92456a transient                                    (Jul 18 13:43)
  a9c5588 directive 18 transient                       (Jul 18 13:38)
  5df6cc6 Fix URL construction and double-protocol...  (D16)
  5bab86b L2 transient
  73c24da D16 G1: End silent zeros in direct job...    (D16)
```

All D16, D17, and D18 changes are committed and pushed. No uncommitted changes (except an untracked `docs/reports/BlogPostGenerationPrompt.md` which is unrelated).

---

## ARCHITECTURE CONTEXT

### The 3-Gate Matching Funnel

1. **Gate 1 (Tag Overlap):** GIN index array overlap on `must_have_tags` / `blocklist_tags`. Minimum overlap: 2 tags. Stack-disjoint check prevents cross-family matches (e.g., Ruby job vs JS persona).

2. **Gate 2 (Semantic Similarity):** HNSW vector cosine similarity on `text-embedding-3-small` (1536 dims). **D18 change:** Now a RANK signal, not a GATE. Uses `GATE2_HARD_CEILING=0.75` as wide safety net instead of `GATE2_MAX_COSINE_DISTANCE=0.55` as hard exclusion.

3. **Gate 3 (LLM Arbiter):** gpt-4o-mini evaluates full context (job description, persona summary, applicant constraints). Outputs approved/rejected with confidence, reasoning, and blockers.

### Embedding Representation (D18 finding — the representation disease)
- **Persona side:** `embeddingSummary` — 3-sentence dense summary (50-500 chars), generated by gpt-4o during CV parsing
- **Job side:** `normalizedText` — title + cleaned full description (potentially thousands of chars)
- **Model:** `text-embedding-3-small` (1536 dimensions) — same model both sides
- **Problem:** Granularity mismatch causes perfect matches to sit at cosine 0.45-0.55, not 0.20-0.35. The rank-only mode works around this, but the long-term fix is to embed a normalized role-summary sentence on both sides.

### Inngest Function Registration
- Inngest functions are defined in `src/inngest/functions.ts`
- The serve endpoint is at `/api/inngest` (Next.js route handler)
- Inngest re-registers functions when the serve endpoint is called during a deploy
- **Critical:** If Coolify deploys but the Inngest sync doesn't happen, old cron schedules remain active. This is likely why `breaker_check_v2` is still running hourly despite the D17 freeze being in the code.

### Neon Burn Levers (D17 freeze)
The D17 freeze (in code, not deployed) freezes 28 of 36 Inngest crons until Aug 1. The 8 active crons are:
1. `daily-pulse` — daily job corpus pulse
2. `pending-queue-sweep` — daily at 06:00 UTC (finds pending match_queue rows, emits Gate 3 events)
3. `match-retry-sweep` — daily (finds jobs that pass Gate 1+2 but have no match_queue entry)
4. `breaker-check-v2` — **should be frozen but still running hourly in production**
5. A few other essential crons

The biggest burn levers:
- `breaker_check_v2`: ~1.2 CU-hrs/day (hourly, 50 items per run)
- `batch_poll_active_hot`: ~2+ CU-hrs/day (when it runs)
- Various backfill/sweep crons: ~2+ CU-hrs/day combined

---

## KNOWN ISSUES (not yet addressed)

1. **`matchBulkReprocess` Inngest function is dead** — has zero logs, never executes. The `match-retry-sweep` sends `match/bulk-reprocess` events but nothing processes them. The idempotency trap fix (Break 2) reduces the need for it, but it should still work as a safety net.

2. **Inngest event delivery from local dev** — The local Inngest client is in dev mode (`INNGEST_DEV=1`) and can't send events to production. To trigger Gate 3 for pending candidates from local, use `scripts/d18-run-gate3-direct.ts` (bypasses Inngest entirely).

3. **7 new pending candidates** — The `match_retry_sweep` at 05:00 UTC inserted 7 new pending entries. The `pending-queue-sweep` at 06:00 UTC should have emitted Gate 3 events for them, but there are no gate-3 logs. These may need manual Gate 3 evaluation via `scripts/d18-run-gate3-direct.ts`.

4. **Embedding granularity mismatch** — The long-term fix is to embed a normalized role-summary sentence on both sides (persona and job), not raw JD text. This would compress the distance spread and make ranking more meaningful. August work.

5. **Local `.env` still has `GATE2_MAX_COSINE_DISTANCE=0.50`** on lines 43 and 55. User removed it from Coolify but should also remove locally for consistency.

---

## DIRECTIVE HISTORY (for context)

- **D11-D15:** ATS ingestion hardening, natsec filtering, location fencing, company dedup
- **D16:** Cron consolidation (reduced frequency), direct job board ingestion fixes
- **D17:** 28-cron freeze (burn reduction from 5.3 to ~0.5-1.0 CU-hrs/day) — **committed but NOT deployed**
- **D18:** Open the matcher — diagnosed 4 breaks, fixed gate re-architecture, manually routed 56 candidates, ran Gate 3 directly — **committed but deploy unverified**

---

## WHAT THE NEXT SESSION SHOULD DO FIRST

1. **Check if D17 freeze is deployed** — Run `scripts/d17-burn-check.ts` and check if `breaker_check_v2` is still running hourly. If yes, the deploy didn't take effect — the user needs to verify Coolify deployed and Inngest re-registered functions.

2. **Check the 7 pending candidates** — Run `scripts/d18-run-gate3-direct.ts` to evaluate them if the pending queue sweep didn't.

3. **Wait for the user's next directive** — D18 is complete. The user mentioned they want to share a new directive.
