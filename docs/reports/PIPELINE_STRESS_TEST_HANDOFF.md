# Pipeline Stress-Test & Production Readiness Handoff

> **Purpose:** This is the initial prompt for a new session whose goal is to stress-test the entire VectorMatch pipeline end-to-end, dig up all remaining issues, and polish every rough edge until the system is production-ready. The session should be systematic — investigate each issue, verify with live data, fix the root cause, and confirm the fix works.
>
> **Date:** July 2, 2026
>
> **Related:** `docs/governing/vectormatch-blueprint.md` (blueprint), `docs/governing/VectorMatchTechicalImplementation.md` (TDD), `docs/reports/CORPUS_EXPANSION_HANDOFF.md` (Sprint 1-8 history)

---

## Initial Prompt for New Session

I am preparing VectorMatch.dev for production. The Company Corpus Expansion campaign (Sprints 1-8) successfully ingested 9,637 companies and 9,126 active jobs, and the matching pipeline has been fixed (Sprint 8: bulk reprocessing, relaxed filters, Gate 3 prompt tuning, monitoring). However, a post-Sprint-8 investigation has identified several remaining issues that must be resolved before the system is production-ready.

**YOUR ROLE:** Stress-test the entire pipeline end-to-end, identify and fix all remaining issues, and polish every rough edge. The goal is a system that reliably delivers 5-10 approved job matches per day with zero manual intervention.

**CRITICAL RULES:**
- Read `AGENTS.md` first — follow the Technology Stack and NEVER run Git rules.
- **NEVER run Git commands** — leave all version control to the user.
- **Do NOT change the 3-gate matching algorithm** (Gate 1 GIN + Gate 2 HNSW + Gate 3 LLM) — only fix the pipeline, filters, prompts, and data quality.
- **Run tests after every change** — `npx tsc --noEmit && npx biome check --write && npx vitest run --reporter=dot` must pass.
- **Verify with live data** — use the Coolify MCP server and Inngest MCP server to inspect production state. Query the database via the Neon MCP server if available, or ask the user to run specific SQL queries.
- **Fix root causes, not symptoms** — if a metric is wrong, trace it to the source. Don't patch the display.

---

## Current Production State (July 2, 2026 12:00 UTC)

### Pipeline Health Monitor (from admin dashboard)

| Metric | Value | Target | Status |
|---|---|---|---|
| Unnormalized jobs | 3,634 | < 50 | ⚠️ WARNING (backlog clearing) |
| Unembedded jobs | 0 | < 50 | ✅ Healthy |
| Companies polled (4h) | 3 | > 0 | ✅ Healthy |
| Matches (24h) | 0 | 5-10 | ⚠️ WARNING |
| Source health rows | 6 | > 0 | ✅ Healthy |
| DB size | 145 MB | < 450 MB | ✅ Healthy |
| Pending matches stale | 0 | < 10 | ✅ Healthy |
| Normalization failed | 322 | (informational) | ⚠️ Monitor |
| Approved matches (24h) | 0 | 5-10 | ⚠️ WARNING |
| Gate 3 approval rate (7d) | 1.6% | 2-4% | ⚠️ LOW |
| Unmatched embedded jobs | 66 | < 100 | ✅ Healthy |
| Avg Gate 3 confidence | 0.854 | (informational) | ✅ Healthy |

### Active Alert

```
pipeline_health (warning): UNNORMALIZED_JOBS: 3634 jobs older than 1h without normalization
```

### Approval Rate by ATS Source

| ATS Source | Total Matches | Approved | Approval Rate |
|---|---|---|---|
| greenhouse | 38 | 0 | 0% |
| (other sources) | (to be verified) | (to be verified) | (to be verified) |

### Codebase State

- **48 Inngest functions** registered
- **1,623 tests** passing (86 files)
- **0 TypeScript errors**, Biome clean
- **35 migrations** applied (latest: `0035_flimsy_yellow_claw.sql` — inbound emails)
- **2 uncommitted files** (minor fixes to `RejectionPatternAnalysis.tsx` and `webhooks/resend/route.ts` — user will commit separately)
- **Self-hosted Inngest** at `https://inngest.vectormatch.dev` (Hetzner/Coolify)
- **Neon PostgreSQL** at `ep-damp-leaf-asddn66v-pooler` (Frankfurt, 145MB/512MB)

---

## Issues to Investigate and Fix

### Issue 1 (CRITICAL): Greenhouse 0% Approval Rate

**Symptom:** Greenhouse is the largest ATS source but has 0% approval (38 matches, 0 approved).

**Root cause (identified):** Greenhouse jobs likely have empty/missing descriptions. The Greenhouse API uses `?content=true`, but the `content` field is optional in the Zod schema. When content is missing, the normalizer degrades to **title-only** text, producing:
- Poor embeddings (Gate 2 can't do semantic matching on just a title)
- Poor tag extraction (regex scanner + LLM fallback have minimal text)
- Poor Gate 3 evaluation (LLM has no job description to evaluate)

**Files to examine:**
- `src/lib/jobs/job-normalizer.ts` — `extractJobContent()` Greenhouse case (line ~143)
- `src/lib/jobs/ats-schemas.ts` — Greenhouse schema (`content: z.string().optional()`)
- `src/lib/jobs/poller/ats-adapters.ts` — Greenhouse fetch logic
- `src/lib/jobs/ats-endpoints.ts` — Greenhouse endpoint URL with `?content=true`

**Verification query (ask user to run):**
```sql
SELECT ats_source,
  count(*) AS total,
  count(*) FILTER (WHERE normalized_text IS NULL OR length(normalized_text) < 100) AS title_only,
  round(avg(length(coalesce(normalized_text, '')))) AS avg_text_length
FROM job WHERE status = 'active' AND normalized_at IS NOT NULL
GROUP BY ats_source ORDER BY total DESC;
```

**Potential fixes (in priority order):**
1. **Selective detail fetch** (like SmartRecruiters Tier 2): If Greenhouse content is empty/short (< 100 chars), fetch the individual job detail endpoint (`/boards/{slug}/jobs/{jobId}`) which may return fuller content. Cap at 10 fetches per poll cycle.
2. **Reject title-only jobs at normalization**: If `fullText` is < 100 chars after extraction, mark as `rejected` rather than letting them through to Gate 3 where they waste LLM calls and produce 0% approval.
3. **Log title-only degradation**: Add `console.warn` when Greenhouse jobs fall back to title-only, so it's visible in logs.

**Also investigate:** Check if OTHER ATS sources (Lever, Ashby, SmartRecruiters, Recruitee, Workable) have similar issues with empty descriptions. Run the verification query for all sources.

---

### Issue 2 (HIGH): matchRetrySweep Time Filter Mismatch

**Symptom:** Pipeline health reports 66 unmatched embedded jobs, but `matchRetrySweep` may not catch all of them.

**Root cause (identified):** Query discrepancy between health monitor and retry sweep:

| Query | Gate 1 | Gate 2 | Time Filter | Limit |
|---|---|---|---|---|
| `countUnmatchedEmbeddedJobs` (health) | Yes | Yes | **None** | Count |
| `matchRetrySweep` | Yes | Yes | **`< NOW() - 1h`** | 500 |
| `matchBulkReprocess` (sweep mode) | Yes | **No** | None | 1000 |

The health monitor counts ALL unmatched jobs (no time filter). The retry sweep only queries jobs older than 1 hour. If the 66 jobs were recently ingested, the sweep misses them.

**File to fix:**
- `src/inngest/functions.ts` — `matchRetrySweep` function, line ~2138

**Fix:** Remove the `AND j.detected_at < NOW() - INTERVAL '1 hour'` filter from `matchRetrySweep`. The `NOT EXISTS` check against `match_queue` already prevents duplicate processing, and freshly inserted jobs are handled by `jobIngestedHandler`.

**Secondary issue:** `matchRetrySweep` finds jobs that pass Gate 1+2, but then triggers `matchBulkReprocess` with `personaId: null`, which does NOT check Gate 2. This means the bulk reprocess queries a larger set of jobs (Gate 1 only). Not a critical bug (Gate 2 is re-checked by `runGateSQLRouter`), but inefficient. Consider whether the retry sweep should pass the specific job IDs to the bulk reprocess instead of triggering a full sweep.

---

### Issue 3 (HIGH): 3,634 Unnormalized Jobs Backlog

**Symptom:** 3,634 jobs older than 1h without normalization. Alert is active.

**Current state:** The user already increased the `normalizationRetrySweep` limit from 500 to 2000 and changed the cron from daily to every 4 hours (commit `8d7fe44`). Theoretical throughput: 12,000 jobs/day. The backlog should clear in ~2 runs (8 hours).

**What to verify:**
1. **Is the sweep actually running?** Check Inngest dashboard for `Normalization Retry Sweep` runs. Check `ingestion_log` for `source = 'normalization_retry'` entries.
2. **Are jobs failing normalization or just never picked up?** Run this query:
   ```sql
   SELECT status, count(*) FROM job
   WHERE normalized_at IS NULL AND detected_at < NOW() - INTERVAL '1 hour'
   GROUP BY status;
   ```
   - If most are `active` → throughput issue (sweep not running often enough or limit too low)
   - If most are `normalization_failed` → OpenAI API issue (check error logs, API key, rate limits)
3. **Are there jobs with `raw_json IS NULL AND normalized_at IS NULL`?** These would be invisible to both the health query AND the retry sweep (both require `raw_json IS NOT NULL`). Run:
   ```sql
   SELECT count(*) FROM job WHERE raw_json IS NULL AND normalized_at IS NULL AND status = 'active';
   ```
   If > 0, these jobs are permanently stuck — the retry sweep can't re-normalize them because the raw data was pruned before normalization completed. This is a data loss bug.

**If the backlog persists:**
- Check OpenAI API key is set in Coolify production env vars
- Check Inngest dashboard for failed `jobIngestedHandler` runs
- Temporarily increase limit further (e.g. 5000) or run the sweep manually via Inngest dashboard
- Check if the `jobIngestedHandler` concurrency is hitting a limit

**Stale comment to fix:** Line 1109 in `functions.ts` says "500-job limit per run" but the actual code uses `.limit(2000)`. Update the comment.

---

### Issue 4 (MEDIUM): Quality Score Data Empty

**Symptom:** Quality Score Distribution, Top Companies by Quality, and Purge Candidates sections all show "No data" in the admin dashboard.

**Root cause (identified):** The `qualityFlywheelRecalc` function (cron daily 04:30 UTC) calculates quality scores as:
```sql
score = COUNT(*) FILTER (WHERE mq.status = 'approved') / COUNT(mq.id) * 100
```

With only 1 approved match in the system, most companies have 0 approved matches → score = 0. The `company_quality_score` table is either empty or contains zero-score rows.

**Status:** This is **expected behavior** — it will self-resolve once the bulk reprocess + Gate 3 prompt tuning generates more approved matches. Once there are 10+ approved matches across different companies, the quality scores will populate.

**What to verify after fixes:**
- After Issue 1 and the bulk reprocess generate more approved matches, check if `company_quality_score` table populates
- Verify the `qualityFlywheelRecalc` cron is actually running (check Inngest dashboard)
- If the table is still empty after 20+ approved matches, investigate the `recalculateQualityScores()` function in `src/lib/jobs/quality/quality-flywheel.ts`

---

### Issue 5 (MEDIUM): Source-Seeder Code Duplication

**Symptom:** Fallow reports 10+ duplicated code blocks in `src/inngest/functions.ts` (123 lines × 4 instances, 103 lines × 3 instances, 23 lines × 9 instances).

**Root cause:** 23 source seeder functions (10 batch + 13 daily) share nearly identical boilerplate: check-health → fetch-and-process → record-success/failure → write-log. A `source-helpers.ts` file was started in a previous session to create a shared `runSourceFunction` factory, but the refactoring was never completed.

**Why it matters:**
- Makes the file hard to maintain (3700+ lines)
- Contains a **copy-paste bug**: D3 (Reddit RSS) and D4 (Remote Job Boards) both log `source: "hn_algolia"` instead of their correct source names (`reddit_rss`, `remote_job_boards`)
- Risk of inconsistency when updating shared logic (e.g. circuit breaker changes need to be applied 23 times)

**Recommended approach:**
1. Complete the `runSourceFunction` factory in `src/inngest/source-helpers.ts`
2. Refactor all 23 source seeder functions to use it
3. Fix the D3/D4 copy-paste bug as part of the refactoring
4. Add tests for the factory function
5. Verify all 23 cron triggers still fire correctly after refactoring

**Files:**
- `src/inngest/functions.ts` — lines 2490-3700 (source seeder functions)
- `src/inngest/source-helpers.ts` — started but not wired up
- `src/lib/jobs/source-health.ts` — `isSourceEnabled`, `recordSourceSuccess`, `recordSourceFailure`
- `src/lib/jobs/poller/ingestion-log.ts` — `writeIngestionLog`

---

### Issue 6 (MEDIUM): Gate 3 Approval Rate Still at 1.6%

**Symptom:** The Sprint 8 Gate 3 prompt tuning (international contractor guidance, hybrid as soft concern, balanced approach) was deployed, but the approval rate is still 1.6%.

**What to investigate:**
1. **Are the new prompts actually being used?** Check `match_queue.prompt_variant` for recent evaluations — all 3 variants should show the updated guidance.
2. **What are the rejection reasons?** Use the `RejectionPatternAnalysis` admin dashboard component to see the actual `llm_reasoning` and `llm_blockers` for recent rejections. Are they still citing geographic restrictions (which should now be soft concerns)?
3. **Is the issue the prompts or the job data?** If most rejections are for genuine skill mismatches (not geographic), the prompts may be working correctly and the issue is the job corpus quality (Issue 1 — title-only Greenhouse jobs).
4. **Consider A/B test analysis:** Compare approval rates across the 3 prompt variants (`balanced`, `strict`, `thorough`). If one variant performs significantly better, consider making it the default.

**Verification query (ask user to run):**
```sql
SELECT prompt_variant,
  count(*) AS total,
  count(*) FILTER (WHERE status = 'approved') AS approved,
  round(count(*) FILTER (WHERE status = 'approved')::numeric / count(*) * 100, 1) AS approval_pct
FROM match_queue
WHERE prompt_variant IS NOT NULL
  AND evaluated_at > NOW() - INTERVAL '7 days'
GROUP BY prompt_variant;
```

```sql
SELECT llm_blockers[1] AS top_blocker, count(*) AS cnt
FROM match_queue
WHERE status = 'rejected'
  AND evaluated_at > NOW() - INTERVAL '7 days'
  AND array_length(llm_blockers, 1) > 0
GROUP BY llm_blockers[1]
ORDER BY cnt DESC
LIMIT 20;
```

---

### Issue 7 (LOW): matchBulkReprocess Batch Query Discrepancy

**Symptom:** When `matchRetrySweep` triggers `matchBulkReprocess` with `personaId: null`, the bulk reprocess does NOT include the Gate 2 cosine distance check in its initial query. It only checks Gate 1 (tag overlap). This means it queries a larger set of jobs than the retry sweep identified.

**Impact:** Not a bug — `runGateSQLRouter` re-checks Gate 2 for each job. But it's inefficient: the bulk reprocess may load and process jobs that will fail Gate 2 anyway.

**Fix (optional):** Consider passing the specific job IDs from `matchRetrySweep` to `matchBulkReprocess` instead of triggering a full sweep. This would require adding a `jobIds` parameter to the `match/bulk-reprocess` event.

---

### Issue 8 (LOW): Inngest Function Registration Count Mismatch

**Symptom:** The blueprint says "48 functions" but the Inngest dashboard may show a different count if not all functions are properly registered in `route.ts`.

**Verification:**
```bash
# Count createFunction calls in functions.ts
grep -c "createFunction" src/inngest/functions.ts

# Count registered functions in route.ts
grep -c "Fn\b" src/app/api/inngest/route.ts
```

If there's a mismatch, some functions may not be registered in the serve handler. Check `src/app/api/inngest/route.ts` to ensure all 48 functions are registered.

---

## Stress-Test Checklist

After fixing the issues above, perform a comprehensive end-to-end stress test:

### A. Ingestion Pipeline
- [ ] Verify `batchPollTier` is polling companies (check `ingestion_log` for `batch_poll` entries)
- [ ] Verify all 3 tiers are being polled (active_hot every 3h, active every 12h, dormant weekly)
- [ ] Verify daily source seeders are running (check Inngest dashboard for D1-D13 cron triggers)
- [ ] Verify circuit breakers are working (check `source_health` table for failure counts)
- [ ] Verify `fetchWithTimeout` is preventing ATS endpoint hangs (no stuck `batchPollTier` runs)

### B. Normalization Pipeline
- [ ] Verify `normalizationRetrySweep` is clearing the backlog (unnormalized count trending down)
- [ ] Verify `jobIngestedHandler` is processing new jobs (check Inngest dashboard)
- [ ] Verify normalization failures are logged with `console.error` (check container logs)
- [ ] Verify G7 rawJson pruning is working (check `raw_json IS NULL` for normalized jobs)
- [ ] Verify `normalized_text` is populated for normalized jobs

### C. Matching Pipeline
- [ ] Verify `matchBulkReprocess` completes successfully (check Inngest dashboard)
- [ ] Verify `matchRetrySweep` is catching unmatched jobs (check `ingestion_log` for `match_retry_sweep`)
- [ ] Verify Gate 1+2 is producing candidates (check `match_queue` for new `pending` entries)
- [ ] Verify Gate 3 is evaluating candidates (check `match_queue` for `approved`/`rejected` entries)
- [ ] Verify `pendingQueueSweep` is clearing stuck pending rows
- [ ] Verify `personaUpdatedHandler` triggers bulk reprocess after persona changes

### D. Quality & Monitoring
- [ ] Verify `pipelineHealthMonitor` is running every 30 min (check Inngest dashboard)
- [ ] Verify all 12 metrics are being collected (check admin dashboard)
- [ ] Verify alerts are being created/resolved correctly
- [ ] Verify `qualityFlywheelRecalc` is running daily (check Inngest dashboard)
- [ ] Verify `tierRecalc` is running daily (check Inngest dashboard)
- [ ] Verify `aggressiveCleanup` is running daily (check Inngest dashboard)
- [ ] Verify `staleJobVerifier` is running (check Inngest dashboard)

### E. Admin Dashboard
- [ ] Verify all dashboard components render without errors
- [ ] Verify `PipelineHealthMonitor` shows current metrics
- [ ] Verify `MatchingFunnel` shows funnel analysis
- [ ] Verify `InfrastructureHealth` shows storage + source health
- [ ] Verify `RejectionPatternAnalysis` shows approval rates by variant/persona/source
- [ ] Verify `BulkReprocessButton` triggers the function successfully
- [ ] Verify admin Server Actions work (enable/disable source, resolve alert)

### F. End-to-End Flow
- [ ] New job ingested → normalized → embedded → Gate 1+2 → Gate 3 → approved match appears in dashboard
- [ ] Persona update → bulk reprocess triggered → new matches created
- [ ] Stuck job → normalization retry sweep → re-normalized → matched
- [ ] Unmatched job → retry sweep → bulk reprocess → matched

---

## Key Files to Read

| File | Purpose |
|---|---|
| `AGENTS.md` | Project rules — READ FIRST |
| `docs/governing/vectormatch-blueprint.md` | Application blueprint (updated July 2 2026) |
| `docs/governing/VectorMatchTechicalImplementation.md` | Technical implementation details (updated July 2 2026) |
| `docs/reports/CORPUS_EXPANSION_HANDOFF.md` | Sprint 1-8 history and handoffs |
| `src/inngest/functions.ts` | All 48 Inngest functions (3700+ lines) |
| `src/lib/jobs/gate-1-2.ts` | Gate 1+2 SQL router |
| `src/lib/jobs/gate-3.ts` | Gate 3 LLM evaluator with 3 prompt variants |
| `src/lib/jobs/job-normalizer.ts` | Job normalization (extractJobContent, normalizeJob) |
| `src/lib/jobs/matching-config.ts` | All matching thresholds |
| `src/lib/jobs/pipeline-health.ts` | Pipeline health metrics (12 metrics) |
| `src/lib/jobs/admin-queries.ts` | Admin dashboard queries |
| `src/lib/jobs/quality/quality-flywheel.ts` | Quality score calculation |
| `src/lib/jobs/source-health.ts` | Circuit breaker logic |
| `src/lib/jobs/poller/ats-adapters.ts` | ATS fetch + validate + normalize |
| `src/lib/jobs/poller/fetch-with-timeout.ts` | HTTP fetch timeout utility |
| `src/components/admin/PipelineHealthMonitor.tsx` | Pipeline health dashboard |
| `src/components/admin/RejectionPatternAnalysis.tsx` | Rejection pattern dashboard |
| `src/components/admin/BulkReprocessButton.tsx` | Bulk reprocess trigger |
| `src/app/api/inngest/route.ts` | Inngest serve handler (function registration) |

---

## MCP Servers Available

- **Coolify** — inspect production containers, logs, deployments
- **Inngest** — inspect function runs, trigger events, check cron schedules
- **Neon** — query production database (if configured)
- **Playwright** — browser automation for admin dashboard testing

Use `mcp_list_tools` before calling any MCP tool to discover available capabilities.

---

## Expected Outcome

After this session, the system should:
1. **Greenhouse jobs have real descriptions** — not title-only
2. **Normalization backlog cleared** — unnormalized count < 50
3. **Match retry sweep catches all unmatched jobs** — no time filter mismatch
4. **Gate 3 approval rate improved** — 2-4% (not 1.6%)
5. **5-10 approved matches per day** — visible in user dashboard
6. **Quality scores populated** — once enough approved matches exist
7. **Source seeder code deduplicated** — shared factory function, D3/D4 bug fixed
8. **All stress-test checklist items pass** — end-to-end flow verified
9. **Zero active alerts** — all pipeline health metrics in healthy range
10. **All tests pass** — `npx tsc --noEmit && npx biome check --write && npx vitest run --reporter=dot`
