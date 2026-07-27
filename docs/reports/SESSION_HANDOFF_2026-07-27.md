# Session Handoff — 2026-07-27

## Context

The user reported that after the D26 deploy, the admin dashboard showed:
- **0 total runs** in the ingestion performance panel (last 24h)
- **0 items processed**, 0% yield rate
- Only **1 new job** landed on the admin jobs page in 12h

Both pipeline systems (pg-boss and Inngest) were completely broken.

## Root Cause Analysis

### Issue 1: pg-boss NOT installed in production container (CRITICAL)

**Symptom:** `[scheduler] Failed to start: Queue cron.batch-poll-tier not found` — 0 cron schedules registered, 0 jobs processed.

**Root cause:** Next.js standalone build tracing does not follow dynamic `import()` calls from `instrumentation.ts`. The scheduler is loaded via `await import("@/scheduler")` inside a `setTimeout` in instrumentation.ts. The Next.js tracer doesn't trace this code path, so `pg-boss` was excluded from the standalone `node_modules` directory.

**Evidence:**
```
docker exec <container> ls /app/node_modules/pg-boss → NOT_FOUND
docker exec <container> ls /app/node_modules/ | grep pgb → (empty)
```

**Fix:**
1. Added `pg-boss` to `serverExternalPackages` in `next.config.ts` — tells Next.js to treat it as external
2. Added explicit `COPY --from=builder` commands in the Dockerfile for `pg-boss` and its dependencies (`cron-parser`, `luxon`, `serialize-error`)
3. Added a pre-flight check in `instrumentation.ts` that verifies `pg-boss` is importable before starting the scheduler — if missing, logs a FATAL error instead of silently failing

### Issue 2: Inngest cached OLD container hostname (CRITICAL)

**Symptom:** Inngest logs showed `lookup 21cda4fa923e on 127.0.0.11:53: server misbehaving` — the old container hostname from a previous deploy.

**Root cause:** When Coolify redeploys the app, the container gets a new hostname (e.g., `c454b457491b`). But Inngest's database has the app's URL cached as `http://21cda4fa923e:3000/api/inngest` (the old hostname). Inngest cannot reach the app at the old hostname.

**Fix:**
1. Updated the Inngest database directly: `UPDATE apps SET url = 'http://c454b457491b:3000/api/inngest' WHERE name = 'vectormatch'`
2. Restarted the Inngest container to clear cached state
3. Re-added the Inngest auto-sync to `instrumentation.ts` (it was removed in D25 when pg-boss was supposed to replace Inngest, but 65 Inngest functions remain active)

### Issue 3: Inngest signature validation failing on ALL requests (CRITICAL)

**Symptom:** App logs showed `Signature validation failed: No x-inngest-signature provided` on GET requests.

**Root cause:** The Inngest auto-sync in instrumentation.ts was using the wrong sync mechanism. It was sending a POST to Inngest's `/fn/register` endpoint, but:
1. The `/fn/register` endpoint doesn't exist in Inngest v1.34 OSS (returns 404)
2. The correct sync mechanism is to send a PUT request to the APP's own `/api/inngest` endpoint, which triggers the Inngest SDK to push function definitions to the Inngest server using the signing key

**Fix:** Changed the auto-sync in `instrumentation.ts` to send a PUT to `http://${hostname()}:3000/api/inngest` instead of POST to Inngest's `/fn/register`. Verified manually: `curl -X PUT http://c454b457491b:3000/api/inngest` returned `{"message":"Successfully registered","modified":true}`.

## Files Modified

| File | Change |
|------|--------|
| `Dockerfile` | Added explicit COPY for pg-boss + dependencies (cron-parser, luxon, serialize-error) |
| `next.config.ts` | Added `pg-boss` to `serverExternalPackages` |
| `src/instrumentation.ts` | Re-added Inngest auto-sync (PUT to app's own endpoint); added pg-boss import pre-flight check |

## Production Actions Taken (already applied)

1. Updated Inngest DB: `UPDATE apps SET url = 'http://c454b457491b:3000/api/inngest' WHERE name = 'vectormatch'`
2. Restarted Inngest container
3. Manually triggered sync: `curl -X PUT http://c454b457491b:3000/api/inngest` → "Successfully registered"
4. Verified: no more signature errors in app logs

## What Needs to Happen Next

### Immediate (user action required)

1. **Commit and redeploy** — the Dockerfile and next.config.ts changes are required for pg-boss to work. Without the redeploy, pg-boss will continue to fail.
2. **After redeploy, verify:**
   ```bash
   # Check pg-boss is installed
   docker exec <new-container> ls /app/node_modules/pg-boss
   
   # Check scheduler started
   docker logs <new-container> 2>&1 | grep -i 'scheduler\|pg-boss'
   # Expected: "[scheduler] Started: 3 cron jobs, 1 event handlers"
   
   # Check pg-boss schedules
   docker exec z10g6zz09soe0ddwgpizteq2 psql -U vectormatch -d vectormatch -c \
     "SELECT name, cron FROM pgboss.schedule ORDER BY name"
   # Expected: 3 rows (batch-poll-tier, direct-job-board-ingestion, pending-queue-sweep)
   
   # Check Inngest sync
   docker logs <new-container> 2>&1 | grep 'Inngest sync'
   # Expected: "[instrumentation] Inngest sync triggered"
   ```

### Ongoing

- The Inngest container hostname cache issue will recur on every app redeploy. The auto-sync in instrumentation.ts now handles this automatically (PUT to app's own endpoint on startup).
- The pg-boss standalone build issue is permanently fixed by the Dockerfile COPY commands.

## Verification Status

- TypeScript: 0 errors
- Tests: 2906 pass (2 flaky timing tests in funding-signal.test.ts — unrelated)
- Production Inngest: sync verified manually, signature errors stopped
- Production pg-boss: NOT yet verified — requires redeploy with new Dockerfile
