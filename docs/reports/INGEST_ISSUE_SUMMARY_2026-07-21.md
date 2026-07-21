# Inngest Invocation Issue — Status Summary (2026-07-21)

## TL;DR

The original symptom (HTTP 524 Cloudflare timeouts on Gate 3 LLM evaluations) has been partially resolved, but **function invocations are now failing with "Signature validation failed"** despite signing keys matching on both sides. We need expert assistance to diagnose the signature mismatch.

---

## Infrastructure Setup

- **App**: Next.js 16.2 app running in Docker on Coolify, VPS at `157.180.68.189`
- **App URL** (registered with Inngest): `https://vectormatch.dev/api/inngest` (goes through Cloudflare orange-cloud proxy)
- **Inngest server**: Self-hosted `inngest/inngest:v1.34.0` running as a Coolify service
- **Inngest dashboard URL**: `https://inngest.vectormatch.dev:8288` (was broken, now fixed — see below)
- **Inngest Postgres**: Separate DB (`postgres:17`) for Inngest state
- **App Postgres**: Separate DB at `157.180.68.189:25432`
- **Cloudflare**: Orange-cloud proxy on both `vectormatch.dev` and `inngest.vectormatch.dev` (100s edge timeout)

---

## What Was Fixed (Confirmed Working)

### 1. `inngest.vectormatch.dev` was unreachable (504 through Cloudflare)

**Root cause**: The Inngest Coolify service's FQDN was set to `https://inngest.vectormatch.dev` without a port suffix. The Inngest container exposes **two ports** (8288 and 8289), and Coolify's Traefik label generator (`fqdnLabelsForTraefik` in `bootstrap/helpers/docker.php`) only emits the `traefik.http.services.<name>.loadbalancer.server.port=<N>` label when the FQDN URL contains an explicit `:PORT` suffix. Without it, Traefik couldn't determine which backend port to route to, causing all requests to hang until timeout.

**Fix applied**: Changed the Inngest service's FQDN in Coolify UI from `https://inngest.vectormatch.dev` to `https://inngest.vectormatch.dev:8288`, then restarted the service.

**Verification**: `curl https://inngest.vectormatch.dev/health` now returns `{"status":200,"message":"OK"}` in ~160ms (was hanging 30s+ before). The app container can now reach the Inngest server to publish events.

### 2. App → Inngest event publishing now works

The app can now publish events to `https://inngest.vectormatch.dev/e/<key>`. Events are received and function runs are initialized. This was completely broken before the FQDN fix.

---

## What Is Still Broken (Unresolved)

### Issue: "Signature validation failed" on function invocations

When the Inngest server invokes the app's functions (POST to `https://vectormatch.dev/api/inngest`), the app rejects the request with:

```
Signature validation failed
Error: Invalid signature
    at async R.verifySignature
    at async _.validateSignature
    at async _.handleAction
```

This happens for **every** function invocation — both event-triggered (Gate 3) and cron-triggered. The Inngest server logs show:

```
{"level":"ERROR","msg":"error handling queue item","error":"invalid status code: 500","item_kind":"start"}
```

### What we've verified is NOT the cause

1. **Signing keys match exactly** — both app and Inngest server have `INNGEST_SIGNING_KEY=5f4434b27d6fee6d3e4b1f2656bfc90ff00179709c15204b42f34f06f99705be` (64-char hex, identical)
2. **Clocks are in sync** — app container, Inngest container, and VPS host all show identical UTC time
3. **Inngest SDK is being used correctly** — `src/app/api/inngest/route.ts` uses `serve({ client: inngest, functions: [...] })` from `inngest/next`
4. **The app URL in Inngest DB is correct** — `apps.url = https://vectormatch.dev/api/inngest`
5. **The app is in production mode** — `NODE_ENV=production`
6. **The app is reachable from the Inngest server** — `https://vectormatch.dev/api/health` returns 200

### Suspected causes (not yet verified)

1. **Cloudflare modifying request bodies/headers** — The Inngest server invokes the app through Cloudflare (`https://vectormatch.dev/api/inngest`). Cloudflare may be altering request headers or body in a way that invalidates the HMAC signature. This is the leading hypothesis.
2. **Inngest SDK version mismatch** — The app's Inngest SDK version couldn't be determined (Next.js bundled output, `node_modules` not directly inspectable). If the app uses a different SDK version than the server expects, signature algorithms may differ.
3. **Stale function registrations** — The Inngest server may have cached old function definitions from before the D20 cron changes. The app logs show `"Unknown cron trigger: 0 */3 * * *"` for some invocations, suggesting the server's cached sync is out of date. However, a fresh sync (`PUT /api/inngest`) returned `{"message":"Successfully registered","modified":false}` — "modified: false" is suspicious; it may mean the server thinks nothing changed.

### Secondary issue: "Unknown cron trigger" errors

Some cron-triggered invocations fail with `Error: Unknown cron trigger: 0 */3 * * *`. This suggests the Inngest server has stale cron schedules cached from before D20's cron refactoring. A forced re-sync may be needed, but the sync returning `modified: false` is concerning.

---

## What We've Tried

1. **Restarted the Inngest service** (via Coolify UI) — fixed the FQDN/routing issue but did not fix signatures
2. **Triggered manual sync** (`PUT /api/inngest` from inside the app container) — returned success but `modified: false`
3. **Published test events** — events are received and function runs initialize, but invocations fail with signature errors
4. **Compared signing keys** — identical on both sides
5. **Compared clocks** — identical on both sides

## What Has NOT Been Tried

1. **Bypassing Cloudflare for app invocations** — The original plan was to create a `direct.vectormatch.dev` DNS record (grey-cloud / DNS-only) and set `INNGEST_SERVE_ORIGIN=https://direct.vectormatch.dev` so the Inngest server invokes the app directly, bypassing Cloudflare's request modification. This was rejected earlier as "too speculative" but may actually be the correct fix for the signature issue.
2. **Forcing a full re-sync** — Deleting the app from the Inngest server's `apps` table and letting it re-register from scratch
3. **Checking if Cloudflare is stripping/adding headers** — Comparing raw request headers as received by the app vs. as sent by the Inngest server
4. **Upgrading/reinstalling the Inngest SDK** in the app to match the server version
5. **Checking Inngest server logs at DEBUG/TRACE level** for the exact signature computation

---

## Key Files

- `src/app/api/inngest/route.ts` — Inngest route handler (uses `serve()` from `inngest/next`)
- `src/inngest/client.ts` — Inngest client initialization
- `src/inngest/functions.ts` — All function definitions (Gate 3 at line 3594)
- `src/instrumentation.ts` — Auto-sync on startup (sends PUT to /api/inngest)

## Key Infrastructure

- **VPS**: `157.180.68.189` (Hetzner), IPv6: `2a01:4f9:c013:2d1f::1`
- **App container**: `o13urtthlj1q3md70gqeuca2-094320185775` (Coolify-managed, `coolify` Docker network)
- **Inngest container**: `inngest-otrzmmwzdh8z6hcg5at9yi03` (Coolify-managed, `otrzmmwzdh8z6hcg5at9yi03` Docker network)
- **Traefik**: `coolify-proxy` container, on all networks
- **Cloudflare**: Orange-cloud proxy on both `vectormatch.dev` and `inngest.vectormatch.dev`

## Environment Variables (App)

- `INNGEST_SIGNING_KEY=5f4434b27d6fee6d3e4b1f2656bfc90ff00179709c15204b42f34f06f99705be`
- `INNGEST_EVENT_KEY=5fc1ab0c2d572d9d9f507a9701f147f8b81d150c1e8b695280b1480c2fcad29a`
- `INNGEST_SERVE_ORIGIN=https://vectormatch.dev`
- `INNGEST_DEV` — not set (production mode)

## Environment Variables (Inngest server)

- `INNGEST_SIGNING_KEY=5f4434b27d6fee6d3e4b1f2656bfc90ff00179709c15204b42f34f06f99705be`
- `INNGEST_EVENT_KEY=5fc1ab0c2d572d9d9f507a9701f147f8b81d150c1e8b695280b1480c2fcad29a`
- `INNGEST_POSTGRES_URI=postgres://inngest:***@postgres:5432/inngest`
- `INNGEST_REDIS_URI=redis://redis:6379`

---

## Questions for Expert Assistance

1. **Could Cloudflare's orange-cloud proxy be modifying request bodies or headers in a way that breaks Inngest's HMAC signature validation?** If so, is the recommended fix to use a grey-cloud DNS record for the app's Inngest endpoint?

2. **The sync returns `modified: false` even after D20 changed many function definitions (cron schedules, new functions). Shouldn't it return `modified: true`?** Is the Inngest server caching stale function definitions?

3. **Is there a known incompatibility between Inngest SDK versions and Inngest server v1.34.0?** The app uses `inngest/next` (version couldn't be determined from bundled output).

4. **What's the recommended architecture for self-hosted Inngest behind Cloudflare?** Should the Inngest server invoke the app through a direct (non-proxied) hostname to avoid signature issues?
