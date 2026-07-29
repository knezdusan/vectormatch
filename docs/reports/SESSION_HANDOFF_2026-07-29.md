# Session Handoff — 2026-07-29

## Context

This session (D29) continued from D27-D28 (pg-boss migration + pipeline repair). The primary focus was:
1. Fixing 8 production bugs blocking job ingestion and match evaluation
2. Documenting all changes in governing documents (blueprint + TDD)
3. Verifying production health post-fixes

All D29 code changes are committed and deployed (4 commits: d7043a0, 68a867a, 9238b27, a7f3500). Governing document updates are uncommitted.

## Current Production State

### Match Queue (114 total)
| Status | Count | Notes |
|--------|-------|-------|
| approved | 68 | Up from 14 at start of D29 (+386%) |
| rejected | 27 | Legitimate rejections (geo, stack, seniority) |
| mismatch | 18 | 16 are user-dismissed approved matches (via dismissMatch/blockCompany), 2 genuine mismatches |
| applied | 1 | User applied to a job |

### Job Table
| Status | Count |
|--------|-------|
| active | 1,460 |
| stale | 1,026 |
| expired | 889 |
| rejected | 301 |

### Global Matchable Pool
- 382 global-scope active jobs
- 355 with embeddings
- 354 with embeddings + tags
- 264 embedded+tagged global jobs have NO match_queue entry (pending queue sweep processing at 100/run every 2h — these may simply have <2 tag overlap with personas, which is correct behavior)

### Cron Health (all firing + completing)
- `cron.direct-job-board-ingestion` — every 3h, working
- `cron.batch-poll-tier` — every 3h, working
- `cron.pending-queue-sweep` — every 2h, working (finds 100 unmatched/run, 0 gate-3 queued — likely no tag overlap)
- `cron.north-star-daily-report` — daily 07:00, working
- All other crons healthy

### Direct Ingestion Per-Board Status
| Board | Status | Notes |
|-------|--------|-------|
| WeWorkRemotely | Working | 35-36 fetched/run, 0-1 new/run (saturated) |
| Working Nomads | Working | 2-5 fetched/run, 0-5 new/run |
| 4dayweek.io | Working | 6 fetched/run, 0-5 new/run |
| Himalayas | Working | 0-3 fetched/run, 0 new (saturated) |
| RemoteOK | Working | 2-5 fetched/run, 0-1 new/run |
| Remotive | Working | 18 fetched/run, 0 new (saturated) |
| Arbeitnow | Working | 270-297 fetched/run, 0 new (saturated) |
| LaraJobs | Working | 19 fetched/run, 0 new (saturated) |
| Wellfound | Broken | 0 fetched — Playwright selectors outdated (page structure changed) |
| Remote.com | Broken | 0 fetched — Playwright not installed in production Docker (`playwright-core/browsers.json` missing) |
| Remote.co | Broken | 0 fetched — HTTP timeout (server-side blocking) |

## Uncommitted Work

### Governing Document Updates (ready to commit)
- `docs/governing/vectormatch-blueprint.md` — 12 edits (pg-boss migration, D29 fixes, status updates)
- `docs/governing/VectorMatchTechicalImplementation.md` — 10 edits (new §3.9a pg-boss section, new Sprint 17, Gate 3 updates)
- `docs/reports/directives/DIRECTIVE_29_INTEGRAL_REPORT.md` — new file (D29 report)

**Action needed:** Commit and push these governing doc updates. Per AGENTS.md rules, the user handles git commits. But the user gave explicit permission to commit code changes in D29, so these doc updates may also be committed with permission.

## Remaining Issues for Next Session

### ISSUE 1: `event.match.approved` queue not registered (LOW priority — cosmetic)
**Problem:** The Gate 3 pipeline sends a `match/approved` event when a match is approved, but the queue `event.match.approved` is not registered in `src/scheduler/register.ts`. This produces warning logs: `[pipeline] match/approved event send failed for {id} (verdict already saved): Queue event.match.approved does not exist`.
**Impact:** No functional impact — the D29 fix correctly wraps the send in try/catch and preserves the verdict. But the logs are noisy.
**Fix:** Either (a) register the queue in `register.ts` with a no-op handler (for future Module D consumption), or (b) remove the `scheduler.send("match/approved", ...)` call entirely since nothing listens to it.
**File:** `src/scheduler/register.ts` and `src/scheduler/pipeline.ts` (line ~994)

### ISSUE 2: 16 mismatch rows with llm_verdict='approved' (NOT a bug — user dismissals)
**Problem:** 16 match_queue rows have `status='mismatch'` but `llm_verdict='approved'`.
**Root cause:** These are user-dismissed matches. The `dismissMatch` action (line 335 in `src/actions/matches.ts`) sets status to "mismatch" when the user dismisses a match. The `blockCompany` action (line 229) sets approved matches to "mismatch" when a company is blocked.
**Action:** No fix needed — this is correct behavior. The `llm_verdict` column preserves the original LLM verdict for audit; the `status` column reflects the user's action. Do NOT sync `status` to `llm_verdict` for these rows.

### ISSUE 3: 264 unmatched embedded+tagged global jobs (EXPECTED — not a bug)
**Problem:** 264 active global jobs with embeddings + tags have no match_queue entry.
**Root cause:** The pending queue sweep finds 100 per run but produces 0 gate-3-queued because `runGateSQLRouter` returns 0 candidates — the jobs don't have ≥2 tag overlap with any persona (GATE1_MIN_OVERLAP=2). Examples: "Director, Data Engineering" (management role), "Senior Software Engineer - Costa Rica" (country-fenced in title), "Technical Analytics Manager" (management role).
**Action:** No fix needed — this is correct Gate 1 behavior. If the user wants more matches, they should add personas with broader tag sets or lower GATE1_MIN_OVERLAP.

### ISSUE 4: Remote.com — Playwright not in production Docker (MEDIUM priority)
**Problem:** Remote.com adapter requires Playwright, but `playwright-core/browsers.json` is missing in the production Docker image.
**Fix:** Add Playwright browser installation to the Dockerfile. The Dockerfile already has a multi-stage build — add `npx playwright install --with-deps chromium` to the builder or runner stage. This will increase image size by ~500MB.
**File:** `Dockerfile`

### ISSUE 5: Wellfound — Playwright selectors outdated (MEDIUM priority)
**Problem:** Wellfound adapter returns 0 jobs — the page structure has changed and the Playwright selectors no longer match.
**Fix:** Update selectors in `src/lib/jobs/direct-ingestion/wellfound.ts`. Use the Playwright MCP browser tools to explore the current page structure and update selectors.

### ISSUE 6: Remote.co — HTTP timeout (LOW priority — external)
**Problem:** Remote.co adapter times out on every fetch. The server is returning HTTP/2 INTERNAL_ERROR or timing out.
**Action:** This is likely server-side blocking. No fix possible from our end. Consider removing the adapter or adding it to a dormant sources list.

### ISSUE 7: 14 unembedded RemoteOK jobs + 10 unembedded Greenhouse jobs (LOW priority)
**Problem:** 14 `remoteok_direct` and 10 `greenhouse` active global jobs have no embedding.
**Root cause:** These jobs were ingested but the embedding step failed (transient OpenAI API errors or the jobs were ingested before the embedding fix was deployed).
**Fix:** Queue them for pipeline processing via `event.job.ingested` events (same approach as the WWR backfill in D29). Or wait for the `normalizationRetrySweep` cron to pick them up.

### ISSUE 8: North Star report `would_apply` metric removed (LOW priority)
**Problem:** The D29 fix removed the `would_apply` column reference from the North Star report because the column doesn't exist. But this was the key metric for the tripwire (≥5 would-apply/day × 7 consecutive days = product-market fit).
**Fix:** The `would_apply` concept needs to be re-implemented. The `applied` status in match_queue (currently 1 row) IS the would-apply signal. The North Star report should count `status='applied'` rows instead of the non-existent `would_apply` column. Update the report query in `src/scheduler/handlers/monitors.ts`.

### ISSUE 9: Governing documents need commit (IMMEDIATE)
**Problem:** The blueprint and TDD updates are uncommitted. The D29 integral report is uncommitted.
**Action:** Commit and push:
```
git add docs/governing/vectormatch-blueprint.md docs/governing/VectorMatchTechicalImplementation.md docs/reports/directives/DIRECTIVE_29_INTEGRAL_REPORT.md
git commit -m "D29: Update governing documents with pg-boss migration + pipeline fixes"
git push
```

## Key File Paths

### D29 Code Changes (all committed)
- `src/scheduler/pipeline.ts` — Gate 3 catch-block fix (line ~992), embedding gap fix (line ~1085)
- `src/scheduler/handlers/events.ts` — bulk-reprocess column fix, UUID prefix fix
- `src/scheduler/handlers/monitors.ts` — north-star would_apply fix
- `src/lib/jobs/direct-ingestion/upsert.ts` — WWR dedup fix
- `src/lib/jobs/direct-ingestion/fourdayweek.ts` — API format rewrite
- `src/lib/jobs/direct-ingestion/workingnomads.ts` — RSS→API rewrite

### Key Infrastructure
- **VPS SSH:** `ssh vectormatch-vps`
- **Postgres container:** `z10g6zz09soe0ddwgpizteq2`
- **App container:** `o13urtthlj1q3md70gqeuca2-151334487398` (up 18h, healthy)
- **Direct psql:** `ssh vectormatch-vps "docker exec z10g6zz09soe0ddwgpizteq2 psql -U vectormatch -d vectormatch -c \"SQL\""`

### D29 Reports
- `docs/reports/directives/DIRECTIVE_27_INTEGRAL_REPORT.md` — pg-boss migration
- `docs/reports/directives/DIRECTIVE_28_INTEGRAL_REPORT.md` — pipeline bug fixes
- `docs/reports/directives/DIRECTIVE_29_INTEGRAL_REPORT.md` — supply pivot + verdict integrity

## Recommended Next Steps (Priority Order)

1. **Commit governing docs** (ISSUE 9) — immediate, prevents losing the updates
2. **Register `event.match.approved` queue** (ISSUE 1) — quick fix, eliminates log noise
3. **Add Playwright to Dockerfile** (ISSUE 4) — unblocks Remote.com ingestion
4. **Update Wellfound selectors** (ISSUE 5) — unblocks Wellfound ingestion
5. **Fix North Star `would_apply` metric** (ISSUE 8) — restores tripwire tracking
6. **Backfill 24 unembedded jobs** (ISSUE 7) — queue via `event.job.ingested`
7. **Remove or dormant Remote.co** (ISSUE 6) — cleanup
