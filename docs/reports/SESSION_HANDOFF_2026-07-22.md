# SESSION HANDOFF — VectorMatch — 2026-07-22

## PURPOSE

This document is the comprehensive transition context for the next agent session.
It captures every important piece of information from the previous two sessions
(D20 closeout + governing document updates) so the next agent can immediately
ask for a new directive and start working with full context capacity.

---

## 1. PROJECT OVERVIEW

**VectorMatch** is a multi-tenant Next.js AI job-matching SaaS that routes
unstructured ATS job postings to user personas using a 3-gate funnel:

- **Gate 1**: GIN index array overlap (tag matching)
- **Gate 2**: HNSW vector similarity (cosine distance) — **re-architected to RANK signal in D18**
- **Gate 3**: LLM arbitration (gpt-4o-mini via Vercel AI SDK)

**Tech stack**: Next.js 16.2.7, TypeScript (strict), Drizzle ORM, PostgreSQL 17
+ pgvector (self-hosted on VPS since D20), Better Auth, Inngest v4 (self-hosted),
Vercel AI SDK, Tailwind CSS v4, Shadcn/ui, Vitest, Playwright, Biome.

**Infrastructure**: Hetzner CX33 (Helsinki) + Coolify (self-hosted PaaS).
Self-hosted Inngest, VPS Postgres 17, FlareSolverr, WordPress blog.
Cloudflare for edge protection.

**Current state**: The project has completed its first end-to-end promise
(D18: founder applied to 2 jobs). The matcher is proven, the gates are sealed
(D19), the pipes are unfrozen (D20). August 2026 is the "tripwire sprint" —
≥5 would-apply matches/day × 7 consecutive days = product-market fit found.

---

## 2. WHAT WAS DONE IN THE PREVIOUS SESSION (D20 CLOSEOUT)

The previous session resolved all remaining D20 production issues:

1. **Dashboard `i.map is not a function` crash** — `src/actions/matches.ts`
   (a `"use server"` module) was exporting `DISMISS_REASONS` (const array) and
   `DismissReason` (type), which Next.js Server Action modules cannot do (they
   may only export async functions). Fix: moved exports to
   `src/lib/jobs/match-filters.ts` (client-safe). Deployed and verified.

2. **FlareSolverr `unhealthy` status** — Docker healthcheck used `wget` (not
   in the `flaresolverr/flaresolverr:latest` image). Fix: changed to
   `curl -sf http://localhost:8191/health`.

3. **FlareSolverr unreachable from app** — Docker network isolation (app on
   `coolify` network, FlareSolverr on its own private network). Fix: connected
   FlareSolverr to the `coolify` network, persisted in compose file.

4. **Inngest 504 timeout** — Coolify service FQDN had no explicit port, so
   Traefik couldn't generate the `loadbalancer.server.port` label. Fix: FQDN
   changed to `https://inngest.vectormatch.dev:8288`.

5. **Inngest "Signature validation failed"** — ruled out as benign startup race
   + expected 401s from unsigned health probes. Not an active bug.

6. **Malformed `matchQueueId`** — one-time manual debug artifact. Not a bug.

7. **D20 integral report** — fully updated with zero founder actions required.

---

## 3. WHAT WAS DONE IN THIS SESSION (GOVERNING DOC UPDATES)

This session's task was updating the two governing documents to reflect all
work done in Directives 11-20 (July 15-21 2026). Both documents are now
committed and in sync with the codebase.

### 3.1 TDD (`docs/governing/VectorMatchTechicalImplementation.md`) — 10 edits

- **§1 Technology Stack**: Neon → VPS Postgres 17 + pgvector. Added Postgres
  tuning values, container UUID, pool size change (20→30), FlareSolverr.
  Migrations count updated 46→58.
- **§2 Database Architecture (enums)**: Added `dismissReasonEnum` (9 values)
  and certstream discovery-source enum.
- **§2 Database Architecture (match_queue)**: Added `dismissReason` +
  `dismissedAt` columns (migration 0056).
- **§2 Database Architecture (job table)**: Added `is_fenced`/`is_natsec`/
  `is_qa` shadow-schema columns with D19 NULL-default fix explanation.
- **§5 Module C (Gate 2 SQL)**: Updated to show D18 rank-only mode
  (`GATE2_RANK_ONLY`, `GATE2_HARD_CEILING`). Config table updated.
- **§5 Module C (component list)**: Added C16-C23 entries (Gate 2
  re-architecture, idempotency trap, COALESCE fix, E-Verify fence, dismiss
  button, North Star, embedding symmetry, certstream fixes).
- **§4.7 Sprints**: Added Sprint 14 (D11-D14), Sprint 15 (D18-D19),
  Sprint 16 (D20).
- **§7 Module E**: Added §7.0b (VPS Postgres), §7.0c (backup), §7.0d
  (resource monitoring), §7.0e (FlareSolverr), §7.0f (Inngest FQDN fix).
  Updated §7.1 infrastructure stack.

### 3.2 Blueprint (`docs/governing/vectormatch-blueprint.md`) — 7 edits

- **Module B**: Added Wellfound + FlareSolverr, SpaceX false-global fix (D14),
  embedding symmetry enforcement (D20).
- **Neon Database Impact Analysis**: Annotated as
  `[Status: Historical — superseded by VPS Postgres migration]`.
- **Module C header**: Updated status to reflect D18 Gate 2 re-architecture.
- **Module C Gate 2**: Rewritten to describe rank-only mode as default.
  Added idempotency trap fix (D18) and COALESCE fix (D19).
- **Module C Gate 3**: Added geo-deduction hard-blocker rules (D19).
- **Dashboard section**: Added dismiss button (D20) and North Star daily
  report (D20). Updated launch-blocking note.
- **Hosting Infrastructure**: Rewritten — Neon → VPS Postgres 17, added
  FlareSolverr, backup infrastructure, resource monitoring.

---

## 4. GIT STATE

**Branch**: `main`, up to date with `origin/main`.
**Working tree**: Clean (all changes committed by the founder).
**Latest commit**: `a580af0 "transient"` (Jul 22 11:45 CEST).

### 4.1 Latest commit contents ("transient" — a580af0)

This commit was made by the founder AFTER the governing doc updates. It
includes work from another session or the founder's own work:

1. **New `description_html` column on `job` table** — sanitized HTML version
   of job descriptions, extracted from ATS source before rawJson is nullified.
   New `src/lib/jobs/sanitize-html.ts` module (cheerio-based HTML sanitizer).
   `src/lib/jobs/job-normalizer.ts` heavily modified (159 lines) to extract
   and persist `htmlDescription` during normalization.

2. **Job detail page changes** — `src/app/dashboard/jobs/[matchId]/page.tsx`
   and `src/components/jobs/JobDetail.tsx` modified to render
   `descriptionHtml`.

3. **Public queries changes** — `src/lib/jobs/public-queries.ts` and
   `src/lib/jobs/public-queries-types.ts` modified to expose
   `descriptionHtml`.

4. **Blog post JSON** — `docs/wordpress/posts-json/senior-engineer-negotiate-title-pay-together.json`

5. **Inngest + normalize-provisional-job** — minor changes.

### 4.2 MIGRATION CONFLICT — NEEDS RESOLUTION

There are **TWO migration files with number 0056**:

| File | Source | Status | Contents |
|---|---|---|---|
| `0056_d20_dismiss_reason.sql` | D20 (manually created) | Applied to VPS directly | dismiss_reason enum + columns + backfill + index. Idempotent. |
| `0056_ambitious_argent.sql` | drizzle-kit generate (latest commit) | In drizzle-kit journal (idx 56) | dismiss_reason enum + certstream enum + `description_html` column + dismiss_reason columns + index. NOT idempotent. |

Also: `0057_d20_certstream_enum.sql` (manually created, applied to VPS) is
NOT in the drizzle-kit journal.

**The problem**: `0056_ambitious_argent.sql` consolidates the D20 manual
migrations (0056_d20 + 0057_d20) PLUS the new `description_html` column.
Running it on the VPS would fail (enum/columns already exist, not idempotent).
Running `drizzle-kit migrate` on a fresh DB would apply 0056_ambitious_argent
but skip the manual migrations.

**What needs to happen** (next session or founder):
1. Delete `0056_d20_dismiss_reason.sql` and `0057_d20_certstream_enum.sql`
   from the migrations directory (they're superseded by 0056_ambitious_argent).
2. Apply ONLY the `description_html` part of 0056_ambitious_argent to the VPS:
   `ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "description_html" text;`
3. OR: make 0056_ambitious_argent.sql idempotent and run it on the VPS.
4. The drizzle-kit journal already tracks 0056_ambitious_argent (idx 56), so
   no journal change needed.

---

## 5. CURRENT ARCHITECTURE STATE (KEY DECISIONS D11-D20)

### 5.1 Gate 2 Re-Architecture (D18 — most consequential change)

Gate 2 was re-architected from a **hard threshold gate** to a **rank signal**.

- `GATE2_RANK_ONLY=true` (default) — uses `GATE2_HARD_CEILING=0.75` as a wide
  safety net. Jobs that pass hard filters + stack match are ALL inserted into
  match_queue, ordered by semantic distance.
- The cosine cliff is eliminated — a qualified job is never dropped for being
  0.0036 over a threshold line.
- Result: 19.7x increase in candidates (3 → 59). Founder applied to 2 jobs.
- Root cause: embedding granularity mismatch — persona embeddings are
  3-sentence summaries (50-500 chars), job embeddings are title + full
  description (thousands of chars). Perfect matches sit at cosine 0.45-0.55,
  not 0.20-0.35. No threshold cures this.

### 5.2 D19 Gate Sealing (4 leaks fixed)

1. **COALESCE default-false bug** — `is_fenced`/`is_natsec`/`is_qa` changed
   from `DEFAULT FALSE` to `DEFAULT NULL` (migration 0055). The FALSE default
   killed the COALESCE regex fallback in `gate-1-2.ts`.
2. **E-Verify fence classifier** — E-Verify patterns added to FENCE classifier
   (was only in NATSEC, context-dependent).
3. **D18 route-unmatched script deprecated** — used `COALESCE(is_fenced, false)`
   with no regex fallback. Replaced by idempotency-trap fix in
   `jobIngestedHandler`.
4. **Gate 3 geo-deduction logic** — founder's manual geo-deduction encoded
   into Gate 3 prompt as explicit hard-blocker rules.

### 5.3 D20 Infrastructure Changes

- **VPS Postgres 17** — migrated from Neon free tier. Container
  `z10g6zz09soe0ddwgpizteq2`, port 25432. Tuned: `shared_buffers=2GB`,
  `work_mem=16MB`, `maintenance_work_mem=512MB`, SSD-optimized.
  Pool: `max: 30` in `src/db/db.ts`. Neon retained for DR only.
- **Backup** — `scripts/ops/backup-pg.sh` nightly `pg_dump` → GCS bucket
  `gs://vectormatch-pg-backups`, 30-day retention. `backupAlertHandler`
  in Inngest.
- **Resource monitoring** — `scripts/ops/resource-monitor.sh` every 15min.
  Alerts at 80% disk/RAM. `resourceAlertHandler` in Inngest.
- **FlareSolverr** — Coolify service, Cloudflare bypass on Wellfound
  confirmed. `FLARESOLVERR_URL=http://flaresolverr-v104gdwm9iidiajuwd2jy52t:8191/v1`.
- **Inngest FQDN** — `https://inngest.vectormatch.dev:8288` (port suffix
  required for Traefik routing).

### 5.4 D20 Feature Additions

- **Dismiss button** — `dismissReasonEnum` (9 values) + `dismissReason`/
  `dismissedAt` columns. `dismissMatch(matchQueueId, reason)` Server Action.
  `DismissButton` component. `DISMISS_REASONS` in `src/lib/jobs/match-filters.ts`.
- **North Star daily report** — `northStarDailyReport` Inngest function
  (cron `0 7 * * *`). Tracks approved matches, would-apply, dismissals with
  reason breakdown, 7-day rolling average, tripwire status.
- **Embedding symmetry** — 18 active unfenced jobs embedded, 520 fenced jobs'
  embeddings nulled. Script: `scripts/d20-embedding-symmetry.ts`.
- **Certstream fixes** — 3 of 5 breaks fixed (WebSocket close handling,
  discoverySource, enum). 2 remain for August.

### 5.5 Cron State

- **21 crons unfrozen** (D20): Direct Job Board Ingestion (4×/day), Batch Poll
  Tier (8×/day), Daily Sources (HN Algolia, Brave Search, v2 Frontend Job
  Scanner), event-driven handlers, North Star Daily Report.
- **14 crons still frozen** — heavy sweeps and discovery sources. Unfreeze
  after Aug 1 Neon quota reset.

---

## 6. OPEN ITEMS / NEXT STEPS

### 6.1 Immediate (next session should address)

1. **MIGRATION CONFLICT** — resolve the 0056 numbering conflict (see §4.2).
   The `description_html` column was applied to VPS Postgres in Session 3.
   File-level cleanup (deleting superseded `0056_d20_dismiss_reason.sql` and
   `0057_d20_certstream_enum.sql`) still pending — noted but not destructive.
2. **~~Verify `description_html` feature~~** — DONE (Session 3). Column added,
   Drizzle tracking updated, feature verified end-to-end.
3. **Ask the founder for a new directive** — all D20 items are closed. The
   founder needs to issue Directive 21 or specify the next task.

### 6.2 August calendar items (from D20 report)

1. **~~AUGUST 1: NEON QUOTA RESET~~** — DONE (D21). 10 of 14 crons unfrozen,
   4 kept frozen with updated rationale (Meta Ads, GitHub Events, WWR RSS,
   remote-job-boards — redundant/broken). Neon-era logic purged from code.
2. **AUGUST 1-14: TRIPWIRE SPRINT** — the North Star daily report tracks the
   proof gate metric daily. Test: ≥5 would-apply matches/day × 7 consecutive
   days.
3. **DISMISS BUTTON FEEDBACK LOOP** — use the dismiss button daily. After 2
   weeks of dismiss data, review the breakdown for classifier improvement.
4. **ATS CENSUS (JOB 6.4)** — enumerate Greenhouse/Lever/Ashby board IDs at
   census scale (~9,000-15,000 boards). Spec at
   `docs/reports/d17-ats-origin-enumeration-spec.md`.
5. **CERTSTREAM BREAKS 4-5** — `probeStackProfileV3` not wired; upstream
   CertStream service degraded.
6. **APPLYABILITY WEIGHTING (JOB 6.6)** — depends on tier data verification.

### 6.3 WordPress blog pipeline

The founder has open files related to the WordPress blog:
- `docs/wordpress/WordpresBlogPostsPerCategory.md` — 60 blog post topics
  across 6 categories, researched from Reddit/HN/Dev.to communities.
- `docs/wordpress/BlogPostGenerationPrompt.md` — external LLM prompt
  template for generating publish-ready blog posts as JSON.
- `docs/wordpress/posts-json/` — 12 blog post JSONs already generated.

The blog is live at `vectormatch.dev/blog` (WordPress + Coolify + Traefik).
WPVibe MCP is available for WordPress management. The blog post pipeline
appears to be: generate JSON with external LLM → parse → publish via WPVibe.

---

## 7. KEY INFRASTRUCTURE DETAILS

| Component | Details |
|---|---|
| **VPS** | Hetzner CX33, Helsinki, 2 vCPU, 8GB RAM, 80GB disk, IP 157.180.68.189 |
| **PaaS** | Coolify v4.1.2, admin at `https://admin.vectormatch.dev` |
| **App DB** | VPS Postgres 17 + pgvector, container `z10g6zz09soe0ddwgpizteq2`, port 25432 |
| **Inngest** | Self-hosted, `https://inngest.vectormatch.dev:8288` |
| **FlareSolverr** | Coolify service, `http://flaresolverr-v104gdwm9iidiajuwd2jy52t:8191/v1` |
| **WordPress** | `vectormatch.dev/blog`, Coolify service `a1yhworj7zx3hqhuhrrrkoui` |
| **Backups** | `gs://vectormatch-pg-backups`, nightly 02:00 UTC, 30-day retention |
| **Monitoring** | `resource-monitor.sh` every 15min, Coolify Sentinel daily 23:00 UTC |
| **Edge** | Cloudflare free tier, proxied, SSL Full (Strict) |
| **CI/CD** | GitHub App → Coolify webhook, auto-deploy on push to `main` |

### MCP servers available

- **coolify** — read-only Coolify management (servers, projects, applications,
  databases, services)
- **neon** — Neon Postgres management (historical, DB migrated to VPS)
- **bigquery** — Google BigQuery (HTTPArchive corpus discovery)
- **playwright** — browser automation for E2E testing
- **wordpress** (WPVibe) — WordPress management via MCP
- **inngest** — Inngest function management
- **shadcn** — shadcn component management
- **fallow** — codebase intelligence (JS/TS static analysis)

---

## 8. IMPORTANT CONSTRAINTS (from AGENTS.md)

1. **NEVER run git commands** — `git add`, `git commit`, `git push`,
   `git checkout`, etc. All version control is the founder's responsibility.
2. **NEVER perform destructive operations** without explicit confirmation.
3. **Tests must NEVER mutate the production database** unless absolutely
   necessary AND the user has given explicit approval.
4. **Technology stack is strict** — Next.js 16.2, Tailwind CSS v4 (CSS-first,
   no `tailwind.config.js`), Biome (never ESLint/Prettier), Drizzle ORM,
   Inngest v4, Vitest 4.1.8, Playwright 1.60.
5. **Shadcn/ui components** — never modify files under `src/components/ui/`.
   Compose, don't modify.
6. **Server Action modules** (`"use server"`) may only export async functions.
   Non-function exports (consts, types) break client-component imports.
7. **Database mutations in tests** — prefer mocks, test databases, or
   Playwright against seeded data. Stop and ask if no alternative exists.

---

## 9. GOVERNING DOCUMENTS (for reference)

| Document | Path | Purpose |
|---|---|---|
| **TDD** | `docs/governing/VectorMatchTechicalImplementation.md` | Full technical implementation document (2800+ lines) |
| **Blueprint** | `docs/governing/vectormatch-blueprint.md` | High-level product blueprint (535 lines) |
| **AGENTS.md** | `AGENTS.md` | Agent rules (tech stack, testing, constraints) |
| **D20 Report** | `docs/reports/DIRECTIVE_20_INTEGRAL_REPORT.md` | D20 complete report (closed out 2026-07-21) |
| **D19 Report** | `docs/reports/DIRECTIVE_19_INTEGRAL_REPORT.md` | D19 gate sealing report |
| **D18 Report** | `docs/reports/DIRECTIVE_18_INTEGRAL_REPORT.md` | D18 Gate 2 re-architecture report |
| **D17 Report** | `docs/reports/DIRECTIVE_17_INTEGRAL_REPORT.md` | D17 cron freeze report |
| **D16 Report** | `docs/reports/DIRECTIVE_16_INTEGRAL_REPORT.md` | D16 Neon burn crisis report |
| **D14 Report** | `docs/reports/DIRECTIVE_14_INTEGRAL_REPORT.md` | D14 SpaceX fix + Neon reconciliation |
| **D13 Report** | `docs/reports/DIRECTIVE_13_INTEGRAL_REPORT.md` | D13 supply sprint report |
| **D12 Report** | `docs/reports/DIRECTIVE_12_INTEGRAL_REPORT.md` | D12 reject-side audit + recall cron |
| **D11 Report** | `docs/reports/DIRECTIVE_11_INTEGRAL_REPORT.md` | D11 5 deterministic fixes |

Both governing documents (TDD + Blueprint) were updated in THIS session to
reflect all D11-D20 work. They are committed and in sync with the codebase.

---

## 10. SESSION START INSTRUCTIONS FOR THE NEXT AGENT

1. **Read this document** — you have full context now.
2. **Check git state** — `git status` should be clean on `main`.
3. **Note the migration conflict** (§4.2) — this may need resolution before
   any new schema work.
4. **Note the `description_html` feature** (§4.1) — the latest commit added
   HTML description extraction. Verify it's deployed and working if relevant
   to the next directive.
5. **Ask the founder for Directive 21** — all D20 items are closed. The
   founder will specify the next task. Do NOT start work without a directive.
6. **Use MCP servers** when needed — coolify (infra), wordpress (blog),
   playwright (E2E), bigquery (corpus discovery), inngest (functions).
7. **Follow AGENTS.md constraints** — never run git commands, never mutate
   the production DB in tests, use Biome not ESLint, etc.

**The project is in a healthy state.** The matcher works (D18: 2 applications).
The gates are sealed (D19). The pipes are unfrozen (D20). The infrastructure
is hardened (VPS Postgres, backups, monitoring). The governing docs are
updated. August is the proof month.

---

## 11. JOB DETAIL PAGE FIX — 2026-07-22 (Session 3)

### Problem

The job detail page (`/dashboard/jobs/[matchId]`) crashed with a 500 server
error ("This page couldn't load") for all matches. The error only appeared
after the Neon → VPS PostgreSQL migration.

### Root Cause

Migration `0056_ambitious_argent` was never applied to the new VPS Postgres
database after the Neon → VPS migration. This migration adds the
`description_html` column to the `job` table. The `getMatchDetail` query in
`src/lib/jobs/dashboard-queries.ts` selects `job.descriptionHtml`, causing:

```
column "description_html" of relation "job" does not exist
```

The raw SQL files (`0056_d20_dismiss_reason.sql`, `0057_d20_certstream_enum.sql`)
were applied manually to the VPS DB, but the Drizzle-tracked migration
`0056_ambitious_argent` (which bundles the `description_html` column addition
with the dismiss_reason enum and certstream enum value) was skipped. This left
the Drizzle migration journal out of sync with the actual DB state.

### Fix Applied

1. **Added the missing column** directly on the VPS Postgres container:
   ```sql
   ALTER TABLE "job" ADD COLUMN IF NOT EXISTS "description_html" text;
   ```

2. **Updated Drizzle migration tracking** — inserted records for migrations
   0055 and 0056 into `drizzle.__drizzle_migrations` so future
   `drizzle-kit migrate` runs won't try to re-apply them (which would fail
   since most of their content was already applied manually via raw SQL).

### Verification

- Production page `https://vectormatch.dev/dashboard/jobs/5f23364c-...` now
  returns HTTP 200 (previously 500).
- No `description_html` or `does not exist` errors in production Docker logs.
- The `description_html` column is confirmed present in the `job` table.
- Drizzle migration tracking table is up to date (IDs 52–53 = migrations 0055–0056).

### Lessons for Future Migrations

When applying raw SQL migrations manually (outside `drizzle-kit migrate`):
1. **Always check if the migration is also Drizzle-tracked** — if so, update
   the `drizzle.__drizzle_migrations` table with the correct hash and timestamp.
2. **Verify all columns/enums from the Drizzle snapshot** are present after
   manual migration application — the Drizzle-generated SQL may bundle multiple
   changes that get split across separate raw SQL files.
3. **The `0056_ambitious_argent.sql` Drizzle migration bundles 3 changes**:
   dismiss_reason enum, certstream enum value, and description_html column.
   The first two were applied via raw SQL files, but the third was missed.
