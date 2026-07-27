# Pipeline Architecture Audit & Inngest Removal Plan

**Date:** 2026-07-27
**Status:** Investigation complete — action required

---

## Executive Summary

The D25 migration moved the **critical ingestion path** (ATS polling, direct board ingestion, Gate 3 evaluation, pending queue sweep) from Inngest to pg-boss. But the migration was **incomplete**:

1. **pg-boss is broken** — the package is missing from the production standalone build (Next.js tracing doesn't follow dynamic imports from `instrumentation.ts`). Fix already applied to Dockerfile + `next.config.ts`, pending redeploy.

2. **4 critical-path Inngest functions were NOT removed** — `jobIngestedHandler`, `gate3Evaluator`, `phalanxPoller`, and `aggregatorJobHandler` are still registered in Inngest. These create a **parallel pipeline** that duplicates pg-boss functionality and risks double-processing.

3. **Admin actions still depend on Inngest** — `admin.ts` sends `job/ingested`, `match/bulk-reprocess`, and `purge/emergency-storage` events via `inngest.send()`. `profile.ts` sends `persona/updated` via `inngest.send()`. These are live code paths.

4. **64 non-critical Inngest functions remain** — seeders, discovery, maintenance, monitors, sweeps. These are not duplicated on pg-boss and need to be migrated or removed.

**Bottom line:** The pipeline is in a **split-brain state**. The critical path is supposed to be on pg-boss (broken), but 4 critical-path handlers are still on Inngest (working but with hostname caching issues). Admin actions and profile updates still go through Inngest. This is the source of the confusion.

---

## Current Architecture: Two Parallel Systems

### pg-boss (D25 — critical path, BROKEN)

| Cron ID | Schedule | Function | Status |
|---------|----------|----------|--------|
| `batch-poll-tier` | `0 */3 * * *` | `runBatchPollTier()` | **BROKEN** — pg-boss not in standalone build |
| `direct-job-board-ingestion` | `0 */3 * * *` | `runDirectJobBoardIngestion()` | **BROKEN** |
| `pending-queue-sweep` | `0 */2 * * *` | `runPendingQueueSweep()` | **BROKEN** |

| Event Handler | Concurrency | Function | Status |
|---------------|-------------|----------|--------|
| `match/gate-3-evaluate` | 10 | `runGate3Evaluation()` | **BROKEN** |

**Coverage:** 3 crons + 1 event handler. All critical-path. All broken because pg-boss package is missing from the production container.

### Inngest (68 functions — legacy, PARTIALLY WORKING)

#### Critical-path functions STILL registered (DUPLICATES pg-boss)

| Function | Trigger | What it does | Risk |
|----------|---------|--------------|------|
| `jobIngestedHandler` | Event `job/ingested` | Full pipeline: normalize → embed → Gate 0.5 → Gate 1+2 → fan out Gate 3 | **DUPLICATE** of pg-boss `runJobPipeline()`. If both systems receive the same job, it gets processed twice. |
| `gate3Evaluator` | Event `match/gate-3-evaluate` | Gate 3 LLM evaluation | **DUPLICATE** of pg-boss `runGate3Evaluation()`. If both systems receive the same event, the LLM runs twice (cost + potential conflicting verdicts). |
| `phalanxPoller` | Event `poller/run` | Manual single-company poll → emits `job/ingested` | Feeds into `jobIngestedHandler`. Not directly duplicated, but the downstream handler is. |
| `aggregatorJobHandler` | Event `job/aggregator-ingested` | Handles aggregator jobs → emits `match/gate-3-evaluate` | Feeds into `gate3Evaluator`. Not directly duplicated, but the downstream handler is. |

#### Functions that emit events triggering the duplicate handlers

| Function | Event emitted | Triggers |
|----------|---------------|----------|
| `phalanxPoller` | `job/ingested` | `jobIngestedHandler` (Inngest) — but pg-boss has no listener for this event |
| `aggregatorJobHandler` | `match/gate-3-evaluate` | `gate3Evaluator` (Inngest) — AND pg-boss `runGate3Evaluation` if pg-boss were working |
| `pendingQueueSweep` (removed from Inngest) | `match/gate-3-evaluate` | Was triggering `gate3Evaluator` — now only on pg-boss |
| `personaUpdatedHandler` | `match/gate-3-evaluate` | Triggers `gate3Evaluator` (Inngest) — AND pg-boss if working |
| `matchBulkReprocess` | `match/gate-3-evaluate` | Triggers `gate3Evaluator` (Inngest) — AND pg-boss if working |
| `v2FrontendJobScanner` | `poller/run` | Triggers `phalanxPoller` → `job/ingested` → `jobIngestedHandler` |

#### Admin actions that use Inngest directly

| File | Action | Event sent | Inngest handler |
|------|--------|------------|-----------------|
| `src/actions/admin.ts:123` | Bulk reprocess matches | `match/bulk-reprocess` | `matchBulkReprocess` |
| `src/actions/admin.ts:184` | Re-trigger ingestion | `job/ingested` | `jobIngestedHandler` |
| `src/actions/admin.ts:211` | Emergency purge | `purge/emergency-storage` | `emergencyStoragePurge` |
| `src/actions/profile.ts:431` | Persona updated | `persona/updated` | `personaUpdatedHandler` |

#### Non-critical Inngest functions (64 — no pg-boss equivalent)

**Seeders/Discovery (27 functions):**
- `hnAlgoliaSeeder`, `bigQuerySeeder`, `customUrlResolver`
- `batchSourceB1-B10` (Workable, Brave, YC, VC, Newsletter, Wayback, crt.sh, Rapid7, CrossPoll, Sitemap)
- `dailySourceD1-D13` (Brave, HN, Reddit, RemoteJobBoards, WWR, CertStream, FundingSignal, ProductHunt, EngineeringBlogs, GitHubTrending, TechNews, NPM, MetaAds)
- `v2FundingSignalRss`, `v2GithubEventsProbe`, `v2FrontendJobScanner`
- `sluggerRetryProcessor`

**Maintenance/Sweeps (16 functions):**
- `normalizationRetrySweep`, `pollBacklogSweeper` (paused), `nightlyResurrectionSweep`, `nightlyStaleClassificationSweep`, `tierRecalc`, `staleCleanup`, `staleJobVerifier`, `companyRevivalSweep`, `emergencyStoragePurge`, `aggressiveCleanup`, `vacuumAnalyze`, `cleanupOrphanedCvUploads`, `probationEmbeddingBackfill`, `jobSummaryBackfill`, `jobSummarizeHandler`, `retryInFlightSweeper`

**Monitors/Alerts (10 functions):**
- `breakerCheck`, `sourceBanRecoveryCheck`, `dailyHealthCheck`, `storageMonitor`, `pipelineHealthMonitor`, `inngestHealthMonitor`, `northStarDailyReport`, `layoffSignalChecker`, `backupAlertHandler`, `resourceAlertHandler`

**Quality/Feedback (5 functions):**
- `qualityFlywheelRecalc`, `recallAuditCron`, `falseGlobalScopeSampler`, `matchRetrySweep`, `normalizeProvisionalJob`

---

## The Core Problem

The D25 migration created a **split-brain pipeline**:

```
INTENDED STATE (D25):
  pg-boss cron → poll → normalize → gate 1+2 → gate 3 → match_queue
  (Inngest only for seeders/discovery/maintenance)

ACTUAL STATE:
  pg-boss cron → poll → normalize → gate 1+2 → gate 3 → match_queue  [BROKEN]
  Inngest event → jobIngestedHandler → normalize → gate 1+2 → gate 3  [WORKING]
  Inngest event → gate3Evaluator → LLM evaluation                     [WORKING]
  Admin action → inngest.send("job/ingested") → jobIngestedHandler    [WORKING]
  Admin action → inngest.send("match/bulk-reprocess") → matchBulkReprocess [WORKING]
  Profile update → inngest.send("persona/updated") → personaUpdatedHandler [WORKING]
```

When pg-boss is fixed and starts working, we'll have **double-processing**:
- pg-boss `runJobPipeline` processes a job → emits `match/gate-3-evaluate` via `scheduler.send()`
- Inngest `gate3Evaluator` receives the SAME event (if anyone emits it via `inngest.send()`)
- Both run Gate 3 LLM evaluation → 2x cost, potential conflicting verdicts

**But right now, pg-boss is broken, so only the Inngest path works.** The problem is that the Inngest path has the hostname caching issue, so it's fragile.

---

## Inngest Removal Plan

### Phase 1: Fix the split-brain (IMMEDIATE — this deploy)

**Goal:** Eliminate the duplicate critical-path handlers so there's exactly one pipeline.

**Actions:**

1. **Remove from Inngest route.ts:**
   - `jobIngestedHandler` — duplicated by pg-boss `runJobPipeline()`
   - `gate3Evaluator` — duplicated by pg-boss `runGate3Evaluation()`

2. **Migrate `phalanxPoller` to pg-boss:**
   - Register an event handler `poller/run` on pg-boss
   - Handler calls `pollCompany()` then `runJobPipeline()` for each new job
   - Remove `phalanxPoller` from Inngest route.ts

3. **Migrate `aggregatorJobHandler` to pg-boss:**
   - Register an event handler `job/aggregator-ingested` on pg-boss
   - Handler processes aggregator jobs through `runJobPipeline()`
   - Remove `aggregatorJobHandler` from Inngest route.ts

4. **Migrate admin actions to pg-boss:**
   - `admin.ts:184` — change `inngest.send("job/ingested")` to `scheduler.send("job/ingested", ...)` or directly call `runJobPipeline(jobId)`
   - `admin.ts:123` — change `inngest.send("match/bulk-reprocess")` to a pg-boss event or direct call
   - `admin.ts:211` — change `inngest.send("purge/emergency-storage")` to a pg-boss event
   - `profile.ts:431` — change `inngest.send("persona/updated")` to a pg-boss event

5. **Register new pg-boss event handlers:**
   - `poller/run` → manual poll handler
   - `job/aggregator-ingested` → aggregator handler
   - `match/bulk-reprocess` → bulk reprocess handler
   - `purge/emergency-storage` → emergency purge handler
   - `persona/updated` → persona feedback handler

**Result after Phase 1:** The critical path runs entirely on pg-boss. Inngest only has seeders/discovery/maintenance functions. No double-processing risk.

### Phase 2: Migrate maintenance functions (NEXT SPRINT)

**Goal:** Move all remaining cron-triggered functions to pg-boss.

**Functions to migrate (high priority — run daily/weekly):**
- `breakerCheck` (hourly) — circuit breaker
- `tierRecalc` (weekly Sun 03:00) — tier recalculation
- `staleCleanup` (weekly Mon 02:00) — stale job cleanup
- `staleJobVerifier` (daily 10:00) — stale job verification
- `normalizationRetrySweep` (weekly Wed 02:00) — retry failed normalizations
- `matchRetrySweep` (daily 07:00) — retry failed matches
- `nightlyResurrectionSweep` (weekly Thu 02:00) — revive stale jobs
- `companyRevivalSweep` (weekly Tue 02:00) — revive dead companies
- `emergencyStoragePurge` (every 6h) — emergency storage cleanup
- `storageMonitor` (every 6h) — storage monitoring
- `dailyHealthCheck` (daily 06:00) — health check
- `pipelineHealthMonitor` (every 4h) — pipeline monitoring

**Functions to migrate (lower priority — weekly/monthly):**
- `vacuumAnalyze`, `aggressiveCleanup`, `cleanupOrphanedCvUploads`
- `probationEmbeddingBackfill`, `jobSummaryBackfill`, `jobSummarizeHandler`
- `qualityFlywheelRecalc`, `recallAuditCron`, `falseGlobalScopeSampler`
- `layoffSignalChecker`, `northStarDailyReport`
- `sourceBanRecoveryCheck`, `sluggerRetryProcessor`
- `nightlyStaleClassificationSweep`
- `retryInFlightSweeper`, `normalizeProvisionalJob`

### Phase 3: Migrate seeders/discovery (FOLLOWING SPRINT)

**Goal:** Move all seeder and discovery functions to pg-boss.

**Functions:**
- All `batchSourceB1-B10` functions
- All `dailySourceD1-D13` functions
- `hnAlgoliaSeeder`, `bigQuerySeeder`, `customUrlResolver`
- `v2FundingSignalRss`, `v2GithubEventsProbe`, `v2FrontendJobScanner`

### Phase 4: Remove Inngest entirely (FINAL)

**Actions:**
1. Remove the Inngest route handler (`src/app/api/inngest/route.ts`)
2. Remove the Inngest client (`src/inngest/client.ts`)
3. Remove all Inngest functions (`src/inngest/functions.ts`, `src/inngest/circuit-breaker-functions.ts`, `src/inngest/normalize-provisional-job.ts`)
4. Remove the Inngest auto-sync from `instrumentation.ts`
5. Remove `inngest` from `package.json` dependencies
6. Stop the Inngest Docker container
7. Drop the Inngest database
8. Remove Inngest environment variables (`INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_BASE_URL`)

---

## Recommended Migration Pattern

For each function migrated from Inngest to pg-boss, follow this pattern:

```typescript
// In src/scheduler/register.ts:

// 1. Cron-triggered function
scheduler.registerCron({
  id: "breaker-check",
  name: "Circuit Breaker Check",
  cron: "5 * * * *",  // same schedule as Inngest
  handler: async () => {
    // Extract the core logic from the Inngest function
    // Remove all step.run() wrappers — pg-boss handles retries at the job level
    await runBreakerCheck();
  },
});

// 2. Event-triggered function
scheduler.registerEvent({
  event: "poller/run",
  name: "Manual Poll Trigger",
  handler: async (data) => {
    const { companyId } = data as { companyId: string };
    const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");
    const { runJobPipeline } = await import("./pipeline");
    const result = await pollCompany(companyId);
    for (const jobId of result.newJobIds) {
      await runJobPipeline(jobId);
    }
  },
  concurrency: 5,
  retries: 3,
});
```

**Key differences from Inngest:**
- No `step.run()` — pg-boss retries the entire job, not individual steps
- No `step.sendEvent()` — use `scheduler.send()` instead
- No checkpointing — the handler runs to completion or fails
- Concurrency is per-queue, not per-function

---

## Immediate Action Items

### Before redeploy:

1. **Remove `jobIngestedHandler` and `gate3Evaluator` from Inngest route.ts** — these are the duplicate handlers
2. **Migrate `phalanxPoller` to pg-boss** — register `poller/run` event handler
3. **Migrate admin actions** — change `inngest.send()` to `scheduler.send()` or direct calls
4. **Migrate `persona/updated`** — change `profile.ts` to use `scheduler.send()`

### After redeploy:

1. Verify pg-boss schedules are registered (3 crons + new event handlers)
2. Verify Inngest only has non-critical functions
3. Monitor for 24h — confirm no double-processing
4. Begin Phase 2 migration

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pg-boss fails again after fix | Low | Critical | Pre-flight check in instrumentation.ts (already added) |
| Double-processing during transition | Medium | High | Remove duplicate handlers BEFORE fixing pg-boss |
| Admin actions break after Inngest removal | Medium | Medium | Migrate admin actions in Phase 1, test before deploy |
| Seeders stop running during Phase 2-3 | Low | Low | Keep Inngest running until all functions migrated |
| pg-boss doesn't support all Inngest features | Low | Medium | pg-boss supports cron, events, retries, concurrency — covers all use cases |
