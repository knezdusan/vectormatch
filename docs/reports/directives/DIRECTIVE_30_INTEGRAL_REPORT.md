# Directive 30 — Integral Report

**Date:** 2026-08-13
**Status:** Complete
**Commits:** 2 (4d422ed — OpenAI credit fulfilment + is_fenced/Dockerfile fixes; second commit pending user action)
**Tests:** 2890/2890 pass (128 files)
**Build:** Clean (tsc --noEmit, Biome, Vitest all green)

---

## Executive Summary

D30 was triggered by a 5-day outage (Aug 9-13 2026) during which the admin user received zero new job opportunities on the dashboard. The investigation revealed a primary root cause (OpenAI API credit exhaustion) and two secondary code bugs (NULL fence flag exclusion in pending-queue-sweep, missing Playwright system dependencies in the Docker runner stage). A new subscription health monitoring system was built to prevent future credit-exhaustion outages from going undetected.

**Key metrics:**
- 655 jobs normalized but not embedded (stuck at Gate 2 due to no credits)
- 16 job-persona pairs with ≥2 tag overlap stuck without embeddings
- Gate 3 last evaluated: Aug 9, 12:02 UTC (4 days of silence)
- 127 unmatched embedded global jobs (27 excluded by `is_fenced = false` bug)
- 5 paid SaaS dependencies identified and monitored

---

## JOB 1: OpenAI Credit Exhaustion (Root Cause)

### Investigation

The admin user reported zero job opportunities for 5 days. Production investigation via SSH + psql revealed:

- The match_queue contained 44 approved rows, but ALL had `is_read = true` (the dashboard "approved" tab shows only unread matches).
- Gate 3 last evaluated on Aug 9, 12:02 UTC — no new evaluations for 4 days.
- 655 jobs were normalized but had no embedding (`job_embedding IS NULL`).
- Production logs repeatedly showed: `You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.`

The OpenAI credit exhaustion caused a cascading failure:
1. **Embedding generation** (text-embedding-3-small) — FAILING → jobs can't enter Gate 2
2. **Gate 3 LLM arbitration** (gpt-4o-mini) — STOPPED → no new matches can be approved
3. **Job summary generation** (gpt-4o-mini) — FAILING (non-fatal, pipeline continues without summary)
4. **Job normalization LLM fallback** (gpt-4o-mini) — FAILING (regex-only tags still work)

### Resolution

**External action (user):** OpenAI credits were replenished by the user on Aug 13.

**Code fix:** A subscription health monitoring system was built (see JOB 3) to detect this class of failure before it becomes a 5-day outage.

### Impact

Once credits were restored, the `normalization-retry-sweep` and `probation-embedding-backfill` crons will retroactively embed the 655 stuck jobs. The 16 matching job-persona pairs (including "Senior AI Engineer", "Senior React Developer", "Software Engineer - React and Rest") will flow through Gate 1+2 → Gate 3 → dashboard.

---

## JOB 2: NULL Fence Flag Exclusion Bug

### Investigation

The `runPendingQueueSweep` function in `src/scheduler/pipeline.ts` queries for unmatched embedded global jobs to route through Gate 1+2. The query used `j.is_fenced = false` instead of `j.is_fenced IS NOT TRUE`. Since `is_fenced`, `is_natsec`, and `is_qa` are nullable columns (NULL = "not yet scanned"), the `= false` predicate excludes NULL rows.

Production data showed:
- 127 unmatched embedded global jobs
- 27 of these had NULL `is_fenced` — all silently excluded by the `= false` bug
- 1 of the 27 ("Web Developer" with tags `{wordpress, php, mysql}`) had 3 tag overlap with the PHP/Laravel persona and would have been matched

The same `= false` bug existed in `src/lib/jobs/pipeline-health.ts` in two places: the unembedded count query and the dashboard visible matches query.

### Bugs Found and Fixed

#### Bug 1: pending-queue-sweep NULL fence exclusion

**Root cause:** `j.is_fenced = false` excludes NULL rows. The serve-time gate filter in `dashboard-queries.ts` already used `IS NOT TRUE` — the sweep was inconsistent.

**Fix:** Changed `j.is_fenced = false` to `j.is_fenced IS NOT TRUE` (and same for `is_natsec`, `is_qa`) in the unmatched jobs query. Also added `is_natsec` and `is_qa` checks that were missing entirely.

**Impact:** 27 previously-excluded jobs are now eligible for matching via the sweep. The Gate 1+2 SQL router has its own COALESCE fallback regex for NULL fence flags, so NULL jobs are still fence-checked at match time.

**File:** `src/scheduler/pipeline.ts` (line 1086-1107)

#### Bug 2: pipeline-health.ts NULL fence exclusion (2 instances)

**Root cause:** Same `= false` bug in two queries in `pipeline-health.ts`: the unembedded count query (line 278) and the dashboard visible matches query (line 518).

**Fix:** Changed both to `IS NOT TRUE` semantics.

**Files:** `src/lib/jobs/pipeline-health.ts` (lines 278-280, 518-520)

---

## JOB 3: Subscription Health Monitoring System

### Investigation

The OpenAI credit exhaustion outage went undetected for 5 days because there was no dashboard indicator for paid service health. The existing `/api/admin/diagnostic/openai` endpoint tests OpenAI key validity but is not surfaced in the admin UI — it requires manually hitting the API endpoint.

A comprehensive audit of all paid/external SaaS dependencies identified 5 services that could halt or degrade the app:

| Service | Impact | Env Var(s) | Existing Health Check |
|---|---|---|---|
| OpenAI | CRITICAL (app-halting) | `OPENAI_API_KEY` | Yes (API route only, not in UI) |
| Resend Email | CRITICAL (sign-up/reset fails) | `RESEND_API_KEY` | No |
| Brave Search | MEDIUM (corpus expansion) | `BRAVE_SEARCH_API_KEY` | No |
| Google OAuth | MEDIUM (sign-in degrades) | `GOOGLE_CLIENT_ID/SECRET` | No |
| GitHub OAuth | MEDIUM (sign-in degrades) | `GITHUB_CLIENT_ID/SECRET` | No |

### Implementation

**New files:**
- `src/lib/subscriptions/health.ts` — Core health check module. Uses Cache Components (`"use cache"` + `cacheLife("minutes")` + `cacheTag("subscription-health")`) for a 5-minute TTL. On cache hit, zero API calls. On cache miss (every 5 min), OpenAI embedding ping (~$0.00002) + Resend API GET /domains. Exports `getSubscriptionHealth()` (full results) and `hasUnhealthySubscription()` (boolean for sidebar).
- `src/app/dashboard/subscriptions/page.tsx` — Admin-only page at `/dashboard/subscriptions`. Renders health status for all 5 services with status badges, impact indicators, key presence, and last-check timestamp.
- `src/components/admin/SubscriptionHealthList.tsx` — Server Component that reads cached health data and renders service rows.
- `src/components/admin/SubscriptionHealthSkeleton.tsx` — Loading fallback.
- `src/components/admin/RecheckButton.tsx` — Client Component with "Re-check now" button that busts the cache via Server Action.
- `src/actions/subscriptions.ts` — Server Action `recheckSubscriptions()` that calls `revalidateTag("subscription-health", "max")` (admin-only).
- `src/lib/subscriptions/__tests__/health.test.ts` — 13 unit tests (mocked OpenAI/Resend, no real API calls).
- `src/actions/__tests__/subscriptions.test.ts` — 3 unit tests for the recheck action.

**Modified files:**
- `src/app/dashboard/layout.tsx` — Added `hasUnhealthySubscription()` call (admin-only, cached) and passes result to `DashboardSidebar`.
- `src/components/dashboard/DashboardSidebar.tsx` — Added `subscriptionUnhealthy` prop, passes through to nav.
- `src/components/dashboard/DashboardSidebarNav.tsx` — Added "Subscriptions" sub-item under Admin. When `subscriptionUnhealthy` is true, the tab gets `bg-destructive/15 text-destructive` classes (danger indicator) and a small `bg-destructive` dot.
- `src/components/dashboard/__tests__/DashboardSidebar.test.tsx` — 3 new tests for Subscriptions tab presence and danger styling.

### Sidebar Danger Indicator

When any CRITICAL-impact service (OpenAI or Resend) is unhealthy, the "Subscriptions" sub-item in the admin sidebar gets:
- Background: `bg-destructive/15` (semi-transparent danger color)
- Text: `text-destructive` (the `--destructive` CSS var from the theme)
- A small `bg-destructive` dot indicator on the right

This provides immediate visual feedback on every dashboard navigation, without any additional API calls (reads from the 5-minute cache).

---

## JOB 4: Playwright System Dependencies in Docker Runner

### Investigation

The Dockerfile's runner stage copied the Playwright browser binary from the builder stage but did NOT install the system shared libraries (libglib-2.0, libnss3, libatk, etc.) that Chromium needs. The `npx playwright install-deps chromium` ran in the builder stage, but those apt packages stay in the builder's filesystem — they are not copied to the runner.

Production logs showed:
```
error while loading shared libraries: libglib-2.0.so.0: cannot open shared object file
```

This broke the Remote.com adapter (and the Wellfound direct-Playwright fallback).

### Fix

Added `playwright-core cli install-deps chromium` to the runner stage of the Dockerfile, after the playwright node_modules are copied. This installs the system-level shared libraries directly in the runner image. Uses the local playwright-core CLI (no npx network access needed in production).

**File:** `Dockerfile` (runner stage, after Playwright browser copy)

---

## Production Health Verification

- **tsc --noEmit:** Clean
- **Biome:** Clean (9 new/modified files, no warnings)
- **Vitest:** 2890/2890 pass (128 files, 19 new tests added)
- **OpenAI credits:** Replenished by user (Aug 13)
- **Production deployment:** Code changes pushed to GitHub (commit 4d422ed). Dockerfile fix requires rebuild + redeploy via Coolify (pending user action).

---

## Governing Document Updates

- `docs/governing/vectormatch-blueprint.md` — Updated with D30 changes (subscription monitoring, fence flag fix, Playwright deps fix)
- `docs/reports/directives/DIRECTIVE_30_INTEGRAL_REPORT.md` — This document

---

## Next Steps

1. **Rebuild + redeploy** the Docker image via Coolify to apply the Dockerfile Playwright deps fix and the code changes.
2. **Monitor** the subscription health page after redeploy to verify all 5 services show "Healthy".
3. **Monitor** the pipeline logs for successful embeddings and Gate 3 evaluations after OpenAI credits are restored.
4. **Consider** adding a Resend diagnostic endpoint (`/api/admin/diagnostic/resend`) for deeper debugging (the subscription page already pings Resend, but a dedicated endpoint would allow curl-based testing).
5. **Consider** adding a pg-boss cron that alerts via the existing alerts system when a subscription goes critical (currently the indicator is passive — visible only when the admin visits the dashboard).
