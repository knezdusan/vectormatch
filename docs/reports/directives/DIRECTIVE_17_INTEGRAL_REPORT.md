# DIRECTIVE 17 — INTEGRAL REPORT

**Date:** 2026-07-17
**Status:** Complete (pending deploy)
**Author:** Devin (autonomous)
**Founder rulings:** Gate 2 threshold 0.55 (D16), contract work excluded (D16), disable probation+dormant (D16), trial FlareSolverr (D17)

---

## PORTFOLIO SCOREBOARD v1 (updated)

| Source | jobs/day | web-dev % | honest global % | matches | verdict |
|--------|----------|-----------|-----------------|---------|---------|
| greenhouse | 104.1 | 66% | 21% | 0 | KEEP (supply) |
| lever | 57.3 | 67% | 12% | 2 | KEEP (yielding) |
| ashby | 38.6 | 75% | 33% | 0 | KEEP (supply) |
| smartrecruiters | 9.4 | 58% | 0% | 0 | MONITOR |
| weworkremotely | 9.0 | 0% | 51% | 0 | KEEP (supply) |
| remoteok_direct | 5.1 | 33% | 39% | 0 | KEEP (supply) |
| remotive | 3.4 | 100% | 8% | 0 | KEEP (supply) |
| himalayas_direct | 0 | — | — | 0 | PIPE BROKEN — awaiting deploy |
| remotecom | 0 | — | — | 0 | PIPE BROKEN — awaiting deploy |
| larajobs | 0 | — | — | 0 | PIPE BROKEN — awaiting deploy |
| wellfound | 0 | — | — | 0 | CLOUDFLARE-WALLED — FlareSolverr trial prepped |

---

## PART A — Survive July: The 24-Minute Day

### A1 — Suspend Timeout

**BLOCKED by Neon free tier.** The Neon API returns `"modifying the suspend interval is not permitted on this account"`. The default `suspend_timeout_seconds` is 0 (which maps to Neon's default of 300 seconds = 5 minutes). The endpoint will auto-suspend after 5 minutes of idle time — sufficient for the batch window approach.

### A2 — Batch Window Compression

**28 crons frozen.** Only 8 active cron triggers remain:

**Daily pulse (5-7am UTC):**
1. `direct-job-board-ingestion` — 05:00 UTC (THE DAILY PULSE)
2. `pending-queue-sweep` — 06:00 UTC
3. `daily-health-check` — 06:00 UTC
4. `match-retry-sweep` — 07:00 UTC

**Weekly (in-window):**
5. `vacuum-analyze` — Sunday 02:00 UTC
6. `slugger-retry-processor` — Monday 00:00 UTC
7. `recall-audit-cron` — Monday 02:00 UTC
8. `false-global-scope-sampler` — Monday 04:00 UTC

**Monthly:**
9. `seeder-bigquery` — 1st of month

**Frozen (28 crons):** All discovery source crons (brave, HN, reddit, certstream, funding signal, producthunt, engineering blogs, github trending, tech news, npm, meta ads), all heavy sweeps (resurrection, stale classification, job summary backfill, normalization retry, stale cleanup, company revival, aggressive cleanup, tier recalc, quality flywheel, layoff signal, probation embedding backfill, orphaned CV cleanup, stale job verifier), all sub-daily monitors (storage, pipeline health, inngest health, emergency storage purge), and v2 probes (github events, frontend job scanner).

**Expected burn after deploy:** ~0.5-1.0 CU-hrs/day (down from 5.63). The endpoint will be awake for ~2-3 hours/day (5am-7am) with no sub-daily wakes.

### A3 — Daily Burn Check

Script created: `scripts/d17-burn-check.ts`. Reads Neon API for `compute_time_seconds`, calculates CU-hrs used/remaining, burn rate, and recommends whether to run today's pulse. Designed to run outside the batch window (no DB connection, just API read).

**Current state (pre-deploy):**
- CU-hrs used: 94.77 / 100 (94.8%)
- CU-hrs remaining: 5.23
- Burn rate: 5.63 CU-hrs/day (pre-freeze)
- **Free tier exhaustion: ~1 day at current burn rate**
- Post-freeze projected: ~5-10 days of runway

---

## PART B — August is the Proof Month

**Aug 1 reset:** 100 CU-hrs against a post-cut ~15-30 CU-hrs/month burn — comfortable.

**Proof sprint Aug 1-14:** All pipes flowing, 0.55 threshold live, scoreboard weekly, founder dashboard audit daily. Tripwire clause (a) — ≥5 would-apply matches/day × 7 consecutive days — is the test.

**July's job:** Enter August with zero construction debt. Status:
- ✅ Gate 2 threshold 0.55 (adopted, code updated)
- ✅ Gate flags materialized (is_fenced/is_natsec/is_qa columns + indexes)
- ✅ 13 JSON-LD false-global catches reclassified
- ✅ Redhorse investigation complete (sim artifact, not gate regression)
- ✅ FlareSolverr trial prepped (client + adapter + docker-compose)
- ✅ Certstream funnel traced (5 breaks identified)
- ✅ ATS-origin enumeration spec written
- ⏳ Deploy + first real cycle for three fixed pipes (needs commit)
- ⏳ FlareSolverr Coolify deployment (needs manual deploy)

---

## PART C — Close the July List

### C1 — Three Fixed Pipes Deploy

**Status: Awaiting commit + Coolify auto-deploy.**

The D16 visibility fix (per-board breakdown in ingestion logs) and D17 cron freeze are ready for commit. Per AGENTS.md, git operations are left to the user. Once committed and pushed, Coolify auto-deploys from `main`, and the next cron at 05:00 UTC will be the first post-deploy cycle.

### C2 — Wellfound Ruling: FlareSolverr Trial

**Founder ruling: Trial FlareSolverr.**

Prepared:
1. **FlareSolverr client** (`src/lib/jobs/direct-ingestion/flaresolverr-client.ts`) — sends requests through FlareSolverr's Cloudflare-bypass proxy
2. **Wellfound adapter modified** (`src/lib/jobs/direct-ingestion/wellfound.ts`) — tries FlareSolverr first (cheerio HTML parsing), falls back to Playwright
3. **Docker-compose** (`docker-compose.flaresolverr.yml`) — ready for Coolify deployment

**Next steps for user:**
1. Deploy FlareSolverr on Coolify: New Resource → Docker Compose → paste `docker-compose.flaresolverr.yml`
2. Set `FLARESOLVERR_URL` env var in the VectorMatch app (default: `http://flaresolverr:8191/v1`)
3. The Wellfound adapter will auto-detect FlareSolverr and use it

### C3 — 13 JSON-LD False-Global Reclassifications

**Complete.** All 13 jobs reclassified from `global` to `country_fenced`:
- remoteok_direct ×6 (Spain, Poland, Portugal, "Anywhere" ×3)
- vytalize_health ×5 (United States)
- silver ×1 (Argentina)
- payabli ×1 (United States)

Embeddings nulled — they will be re-embedded with the correct scope on the next batch.

### C4 — Redhorse Investigation

**Verdict: SIM ARTIFACT. The production gate stack correctly blocks Redhorse.**

The D16 threshold simulation was a raw SQL query that only checked cosine distance — it did NOT include the natsec/fenced/QA gates. The production Gate 1+2 SQL in `gate-1-2.ts` lines 320-321 applies `AND NOT jm.is_fenced AND NOT jm.is_natsec`. All 5 Redhorse jobs have `is_natsec: true` (contain "national security", "US citizen", "U.S. SECRET clearance"). Redhorse is NOT in match_queue.

**The 0.55 threshold is safe to ship.** The full gate stack is applied in production.

### C5 — Gate Flags Materialized

**Complete.** Three new columns added to the `job` table:
- `is_fenced` (boolean, default false) — 1,295 jobs marked true
- `is_natsec` (boolean, default false) — 136 jobs marked true
- `is_qa` (boolean, default false) — 35 jobs marked true

Partial indexes created on each column (`WHERE is_X = true`). The `gate-1-2.ts` SQL query now uses `COALESCE(is_fenced, <inline regex>, false)` — materialized column first, inline regex as fallback for un-backfilled jobs. This is a direct compute saving under the 24-minute regime.

### C6 — Commit

Per AGENTS.md, git operations are left to the user. The following files are ready for commit:

**D16 changes (from previous session):**
- `src/inngest/functions.ts` — cron consolidation + visibility fix
- `src/lib/jobs/matching-config.ts` — threshold 0.55
- `scripts/d16-s4-v2-probe.ts` + `docs/reports/d16-s4-v2-probe.json`
- `scripts/d16-jsonld-pilot.ts` + `docs/reports/d16-jsonld-pilot.json`
- `docs/reports/DIRECTIVE_16_INTEGRAL_REPORT.md`

**D17 changes:**
- `src/inngest/functions.ts` — 28 crons frozen (D17 A2)
- `src/lib/jobs/gate-1-2.ts` — materialized gate flags (D17 C5)
- `src/lib/jobs/direct-ingestion/flaresolverr-client.ts` — new (D17 C2)
- `src/lib/jobs/direct-ingestion/wellfound.ts` — FlareSolverr integration (D17 C2)
- `docker-compose.flaresolverr.yml` — new (D17 C2)
- `scripts/d17-certstream-funnel.ts` + `docs/reports/d17-certstream-funnel.json` — new (D17 D1)
- `scripts/d17-burn-check.ts` — new (D17 A3)
- `docs/reports/d17-ats-origin-enumeration-spec.md` — new (D17 D2)
- `docs/reports/DIRECTIVE_17_INTEGRAL_REPORT.md` — this file

---

## PART D — Build the Origin Channel

### D1 — Certstream End-to-End Funnel Trace

**First trace in the channel's existence.** Results: ALL ZEROS.

| Stage | Count |
|-------|-------|
| Domains seen | 0 |
| Careers-relevant | 0 |
| Slug-resolved | 0 |
| v3-passed | 0 |
| Enrollable | 0 |

**5 funnel breaks identified:**

1. **WebSocket yields 0 certificates.** The cron runs daily (7 `ingestion_log` rows, all `status=success`), but every run reports `items_processed=0`. The `defaultCollectFromCertStream` function treats `ws.onclose` as a successful empty collection — if the socket closes immediately, no error is surfaced. The upstream CertStream service may be unavailable.

2. **`discovery_source` enum has no `certstream` value.** The enum contains `crt_sh` but not `certstream`. Certstream-discovered companies are invisible in the `discovery_source` column.

3. **Seeder hard-codes `discoverySource: "hn_algolia"`.** Even if the WebSocket produced matches, the resulting company rows would be tagged `hn_algolia`, not certstream.

4. **v3 fingerprint probe is never called.** `probeStackProfileV3` is defined but never invoked anywhere in the codebase. The "v3-passed" stage doesn't execute.

5. **Zero companies with certstream provenance** in the last 7 days — downstream consequence of break #1.

**Recommended fixes (August):**
1. Fix `defaultCollectFromCertStream` to distinguish clean timeout from immediate close
2. Add `certstream` to the `discovery_source` enum
3. Change certstream-processor.ts to use the correct `discoverySource`
4. Wire `probeStackProfileV3` into the Slugger

### D2 — ATS-Origin Enumeration Spec

**Spec complete.** See `docs/reports/d17-ats-origin-enumeration-spec.md`.

Key points:
- Enumerate Greenhouse/Lever/Ashby board IDs at census scale (~9,000-15,000 boards)
- Probe via public ATS API endpoints (no auth, 2 req/s per ATS)
- Filter through JSON-LD TELECOMMUTE + no-country-requirement declaration
- v3 fingerprint probe for web-dev stack verification
- Expected yield: ~540-900 new enrollable boards (6-10x corpus expansion)
- Build in August (week 1-3), runs in one batch window (~42 min)

---

## Standing Answers (for the record)

- **Market vs local:** Same numbers, four filters apart (truly-global × web-dev × persona-fit × coverage). Believe both. Grow coverage.
- **Mainstream research loop:** Aggregator paradox. Stop shopping; build the origin.
- **The meter:** `compute_time_seconds` = raw endpoint hours (the plan's limit meter — matches the banner); console CU-hrs = hours × compute size. The founding scarcity was real; D14 read the wrong meter.
- **Tripwire:** Acknowledged in writing; August 1-14 is its test window.

---

## What to Bring Back

1. **Daily pulse log:** Not yet available — first post-deploy cron at 05:00 UTC will produce the per-board ingestion breakdown. The burn check script (`scripts/d17-burn-check.ts`) is ready for daily use.

2. **Redhorse verdict:** SIM ARTIFACT. The threshold simulation bypassed the natsec gate. Production Gate 1+2 correctly blocks all Redhorse jobs (`is_natsec: true`). The 0.55 threshold is safe to ship.

3. **13 reclassifications done:** ✅. Gate flags materialized: ✅. Commits: ready for user to push.

4. **Wellfound ruling executed:** FlareSolverr trial prepped (client + adapter + docker-compose). Needs Coolify deployment by user.

5. **Certstream funnel report:** ✅. First end-to-end trace. 5 breaks identified. The channel is broken at the WebSocket layer (0 certificates collected) and has 4 additional structural breaks. Full report: `docs/reports/d17-certstream-funnel.json`.

6. **ATS-origin enumeration spec:** ✅. One page: enumeration method, scale estimate (~15K boards), probe cost (negligible), August build plan (3 weeks). Full spec: `docs/reports/d17-ats-origin-enumeration-spec.md`.

---

## Open Items for Dux

1. **DEPLOY NOW:** The 28-cron freeze is the single most urgent action. At 5.63 CU-hrs/day, the free tier exhausts in ~1 day. Post-freeze burn should drop to ~0.5-1.0 CU-hrs/day. Commit and push to trigger Coolify auto-deploy.

2. **FlareSolverr Coolify deployment:** Deploy `docker-compose.flaresolverr.yml` as a new Coolify service. Set `FLARESOLVERR_URL` env var in the VectorMatch app.

3. **First post-deploy cron verification:** After deploy, check the 05:00 UTC cron's ingestion log for the per-board breakdown (Himalayas=N; RemoteOK=N; LaraJobs=N). This ends the silent-zero era.

4. **Daily burn check:** Run `npx tsx --env-file=.env scripts/d17-burn-check.ts` daily. If it says SKIP, skip the next pulse.

5. **Certstream fixes (August):** Fix the WebSocket close handling, add `certstream` to the discovery_source enum, wire `probeStackProfileV3`.

6. **ATS-origin census (August):** Build per the spec in `docs/reports/d17-ats-origin-enumeration-spec.md`.

7. **Neon free tier exhaustion:** At current burn rate, the free tier will be exhausted in ~1 day. The freeze must be deployed ASAP. If the free tier is breached before the freeze takes effect, the endpoint will be suspended until Aug 1 reset.
