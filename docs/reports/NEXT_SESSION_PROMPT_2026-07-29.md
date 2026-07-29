# Next Session Initiation Prompt

You are continuing work on VectorMatch, a 3-gate AI job-matching SaaS. The previous session (D29) fixed 8 production bugs in the job ingestion and matching pipeline, updated the governing documents, and verified production health.

## Read These First

1. **Session handoff:** `docs/reports/SESSION_HANDOFF_2026-07-29.md` — full context, production state, and remaining issues
2. **D29 integral report:** `docs/reports/directives/DIRECTIVE_29_INTEGRAL_REPORT.md` — what was fixed in D29
3. **Governing documents (uncommitted):**
   - `docs/governing/vectormatch-blueprint.md` — app blueprint (updated with pg-boss migration + D29 fixes)
   - `docs/governing/VectorMatchTechicalImplementation.md` — TDD (updated with new §3.9a pg-boss section + Sprint 17)
4. **AGENTS.md** — project rules, database access, coding standards

## Current Production State

- **68 approved matches** (up from 14 at start of D29)
- **1,460 active jobs**, 382 global-scope, 354 matchable (embedded + tagged)
- **All crons healthy** — direct ingestion, batch poll, pending sweep, north star all firing
- **3 direct ingestion sources still broken:** Remote.com (Playwright missing), Wellfound (selectors outdated), Remote.co (server-side timeout)

## Immediate Task: Commit Governing Documents

The governing document updates (blueprint + TDD) and D29 integral report are uncommitted. Commit and push:

```bash
git add docs/governing/vectormatch-blueprint.md docs/governing/VectorMatchTechicalImplementation.md docs/reports/directives/DIRECTIVE_29_INTEGRAL_REPORT.md docs/reports/SESSION_HANDOFF_2026-07-29.md
git commit -m "D29: Update governing documents with pg-boss migration + pipeline fixes

- Blueprint: 12 edits (pg-boss migration, D29 adapter fixes, verdict integrity, status updates)
- TDD: 10 edits (new §3.9a pg-boss section, new Sprint 17, Gate 3 updates, tech stack)
- D29 integral report: 8 production bugs fixed, 80 approved matches
- Session handoff: 2026-07-29

Generated with [Devin](https://devin.ai)

Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>"
git push
```

## Then Address These Issues (Priority Order)

### 1. Register `event.match.approved` queue (5 min)
The Gate 3 pipeline sends `match/approved` events but the queue isn't registered, producing warning logs. Either register it with a no-op handler in `src/scheduler/register.ts` or remove the send from `src/scheduler/pipeline.ts` (line ~994).

### 2. Add Playwright to production Dockerfile (30 min)
Remote.com requires Playwright but `playwright-core/browsers.json` is missing in production. Add `npx playwright install --with-deps chromium` to the Dockerfile. This will increase image size by ~500MB.

### 3. Update Wellfound selectors (1-2h)
Wellfound returns 0 jobs — page structure changed. Use Playwright MCP browser tools to explore the current page structure and update selectors in `src/lib/jobs/direct-ingestion/wellfound.ts`.

### 4. Fix North Star `would_apply` metric (15 min)
The D29 fix removed the non-existent `would_apply` column reference. The `applied` status in match_queue IS the would-apply signal. Update the North Star report query in `src/scheduler/handlers/monitors.ts` to count `status='applied'` rows.

### 5. Backfill 24 unembedded jobs (10 min)
14 RemoteOK + 10 Greenhouse active global jobs have no embedding. Queue them via `event.job.ingested` events:
```sql
INSERT INTO pgboss.job (name, data, state, retry_limit, retry_delay, expire_seconds, created_on, start_after, keep_until)
SELECT 'event.job.ingested', jsonb_build_object('jobId', id), 'created', 0, 30, 3600, NOW(), NOW(), NOW() + INTERVAL '2 hours'
FROM job WHERE status = 'active' AND remote_scope = 'global' AND job_embedding IS NULL;
```

### 6. Remove or dormant Remote.co (5 min)
Remote.co times out on every fetch (server-side blocking). Either remove the adapter or add it to a dormant sources list.

## Key Infrastructure Access

- **VPS SSH:** `ssh vectormatch-vps`
- **Postgres:** `ssh vectormatch-vps "docker exec z10g6zz09soe0ddwgpizteq2 psql -U vectormatch -d vectormatch -c \"SQL\""`
- **App container:** `o13urtthlj1q3md70gqeuca2-151334487398`
- **App logs:** `ssh vectormatch-vps "docker logs o13urtthlj1q3md70gqeuca2-151334487398 2>&1 | tail -50"`

## Important Notes

- **NEVER run git commands** without user permission (AGENTS.md rule). Ask before committing.
- **NEVER mutate production DB** without explicit approval.
- The 16 "mismatch" rows with `llm_verdict='approved'` are user-dismissed matches — NOT bugs. Do not sync them.
- The 264 unmatched embedded+tagged jobs are correctly filtered by Gate 1 (insufficient tag overlap) — NOT a bug.
- Tests: 2871/2871 pass (126 files). Build: clean (31 pages, Next.js 16.2.7 Turbopack).
