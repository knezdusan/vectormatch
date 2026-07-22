<!-- BEGIN:nextjs-agent-rules -->
# Multi-Tenant Next.js AI Job Routing SaaS

## Project Overview
This is a 3-gate job-matching SaaS that routes unstructured ATS job postings to user personas using GIN indexing (Gate 1), HNSW vector similarity (Gate 2), and LLM arbitration (Gate 3). 
Prioritize performance, accuracy, and developer-centric UX.

## Technology Stack (Strict)
- **Next.js 16.2** (App Router only — no Pages Router)
- **TypeScript** (strict mode - enforced in tsconfig.json)
- **Tailwind CSS 4.3.0** (**CRITICAL:** CSS-first configuration via `@theme`. There is NO `tailwind.config.js` or `postcss.config.js` in this project!)
- **Shadcn/ui 4.8.0**
- **Drizzle ORM** + PostgreSQL 17 (self-hosted on VPS Docker) with `pgvector` — migrated from Neon to VPS Postgres on July 20 2026 (D20). See "Database & Infrastructure" section below for connection details.
- **Better Auth** for authentication
- **Inngest v4** for durable background jobs and workflows
- **Vercel AI SDK** (gpt-4o for complex reasoning, gpt-4o-mini for scale, text-embedding-3-small)
- **Biome** as linter + formatter (never ESLint/Prettier)
- **useActionState + Zod** for forms
- **Vitest 4.1.8** for testing (React 19 + Next.js 16.2 compatible)

## CRITICAL: Destructive Operations Prohibition
**NEVER** perform irreversible destructive operations without **explicit user confirmation** for that specific action. This includes:
- Creating new projects (`npx shadcn init`, `create-next-app`, `npm create vite`, etc.) when a project already exists
- Deleting directories, database tables, or git branches
- Force-pushing, rewriting git history, or checking out over uncommitted changes
- Running `rm -rf` or bulk-deleting files
- Dropping database schemas or truncating tables
- **ALWAYS** verify the current project context before running initialization/scaffolding commands
- **STOP and ask for explicit confirmation** if a command would overwrite existing work
- **NEVER run any Git commands** (such as `git add`, `git commit`, `git push`, `git checkout`, etc.). All version control operations must be left entirely to the user.

## CRITICAL: Database Mutation in Tests

Tests must **never** mutate the production database (or any shared database) unless there is **absolutely no other way** to verify the behavior and the user has given **explicit approval** for that specific test.

### Rules for database-mutating tests

1. **Prefer non-mutating alternatives first.** Before writing a test that inserts, updates, or deletes real rows, exhaust these options:
   - Mock the database layer or the Server Action.
   - Use a test-only API route or fixture that returns seeded data.
   - Use a dedicated, isolated test database / test tenant.
   - Use Playwright browser automation against already-seeded demo data without creating new users.

2. **Stop and ask for explicit approval.** If no non-mutating alternative exists, explain to the user:
   - Exactly which tables will be touched.
   - Which rows will be inserted, updated, or deleted.
   - How the test will clean up after itself.
   - How cleanup will be verified.
   Do **not** run the test until the user has explicitly approved.

3. **Implement automatic cleanup.** Any approved test that mutates the database must clean up in a `test.afterAll` / `afterAll` hook, or equivalent teardown. Cleanup must run even if the test fails or is interrupted.

4. **Verify cleanup.** After the test runs, query the database to confirm that no test artifacts remain. If artifacts are found, delete them and report the leak to the user.

5. **Use obvious test identifiers.** Test emails, names, and IDs must be clearly identifiable (e.g., `test-{feature}-{timestamp}-{worker}@example.com`) so manual cleanup is possible if automation fails.

### Existing exception

The file `e2e/profile-management.spec.ts` was created before this rule was written and currently seeds/cleans up an onboarded user via raw SQL. If you need to modify or extend it, first review whether the test can be rewritten without database mutation. If not, ask the user for approval before running it against a shared database.

# This is NOT the Next.js or Tailwind you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data.
1. **Next.js 16.2:** Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
2. **Tailwind CSS v4+:** Do NOT use v3 syntax or deprecated configuration formats. Custom utilities and theme tokens are strictly handled via CSS `@theme` directives inside global styles.

## Core Architecture Rules
- Use **App Router** exclusively (`app/` directory)
- **Server Components by default** — add `"use client"` only when necessary (interactivity, hooks, browser APIs)
- All database operations must go through **Drizzle ORM** (no raw SQL unless for complex vector/GIN queries)
- Background jobs and ATS polling **must** use **Inngest** durable execution
- Prefer Server Actions for mutations
- Use **Cache Components** for data caching (see `node_modules/next/dist/docs/` for reference)

## Coding Standards
- **Formatting**: Always use Biome (`biome check --write`) — note: Biome 2.2.0 removed the old `--apply` flag; use `--write` (or `--fix`) instead
- **Imports**: Organized automatically by Biome
- **Naming**: `camelCase` for variables/functions, `PascalCase` for components/types
- **Error Handling**: Always handle errors gracefully (never silent failures)
- **Types**: Use strict TypeScript (enforced) + Zod schemas for all external data (ATS payloads, forms)
- **Performance**: Keep queries under 20ms for Gate 1+2. Use indexes properly.

## Testing Strategy

This project runs **two separate test frameworks with zero overlap.** They serve different purposes, live in different directories, and use different file extensions. Never mix them.

### Test Hierarchy — which tool for which job

| Test Type | Tool | File Location | File Extension | When to write |
|---|---|---|---|---|
| **Unit tests** | Vitest | `src/**/__tests__/` or alongside source | `.test.ts` / `.test.tsx` | Individual functions, hooks, utilities, Zod schema validation |
| **Integration tests** | Vitest | `src/**/__tests__/` | `.test.ts` | Server Actions, auth flow logic, DB operations (mocked) |
| **Component tests** | Vitest | `src/components/**/__tests__/` | `.test.tsx` | React components in isolation (`happy-dom`) |
| **E2E tests** | Playwright | `e2e/` only | `.spec.ts` | Full user journeys across real browser: auth, navigation, critical paths |

### Separation rules — preventing interference

- **Vitest territory**: `src/` directory, files ending in `.test.ts` or `.test.tsx`. Vitest config excludes `tests-e2e/**/*` and scans `src/` automatically. It uses `happy-dom` (not a real browser).
- **Playwright territory**: `e2e/` directory, files ending in `.spec.ts`. Playwright config `testDir: "./e2e"`. It launches real Chromium/Firefox/WebKit browsers.
- **Never** place `.test.ts` files in `e2e/`. **Never** place `.spec.ts` files in `src/`.
- Both use `test` / `describe` / `expect`, but the **import source differs**: Vitest uses globals (or `import { vi } from "vitest"`); Playwright uses `import { test, expect } from "@playwright/test"`.

### When NOT to generate tests

Do **not** write tests for these changes. They add noise without value:

- Pure UI/styling changes (Tailwind classes, dark mode adjustments, spacing)
- Layout refactoring with no logic change
- Shadcn/ui component updates (generated upstream code, already tested)
- Copy/text changes, static content additions
- README or documentation updates
- Moving files between directories with no behavioral change

### When TO generate tests

Always add or update tests for these:

- **New auth flows**: sign-up, sign-in, password reset, email verification, OAuth callbacks
- **New form validations**: Zod schemas, Server Actions with `useActionState`
- **Database schema changes** affecting queries or Drizzle relations
- **New API endpoints** or route handlers (`app/api/**/route.ts`)
- **New background jobs** (Inngest functions, event handlers)
- **New business logic**: matching algorithms, scoring, filtering
- **Bug fixes**: always add a regression test (unit or E2E, whichever fits)
- **Critical user journeys**: onboarding, job matching flow, payments

### Vitest configuration

- **Skill**: Use the `vitest-best-practices` skill for all unit/integration/component testing
- **Stack**: Vitest 4.1.8 + @testing-library/react 16.3.2 + happy-dom 20.10.2
- **Config**: `vitest.config.mts` (environment: happy-dom, coverage: v8, globals: true)
- **Setup**: `vitest.setup.ts` — global mocks for `next/navigation` and `next/headers` (async APIs for Next.js 16)
- **Commands**: `npm run test` (watch) · `npm run test:ui` (visual) · `npm run test:coverage`

### Playwright E2E configuration

- **Skill**: Use the `playwright-e2e` skill for all E2E work — it covers auth bypass, rate limits, and Next.js 16 hydration
- **Stack**: `@playwright/test` v1.60 + `@playwright/mcp@latest` (browser exploration tools)
- **Config**: `playwright.config.ts` — 5 projects (Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari), baseURL `http://localhost:3000`, dev server auto-start
- **Artifacts**: screenshots/videos/traces in `e2e/test-results/`, HTML report in `e2e/playwright-report/`
- **Commands**: `npm run test:e2e` (headless all) · `npx playwright test --project=chromium` (dev) · `npm run test:e2e:ui` (interactive)

### Better Auth E2E testing rules

Better Auth applies **strict rate limits** that will break naive E2E tests:
- `/api/auth/sign-in/email` — **3 attempts per 10 seconds**
- `/api/auth/sign-up/email` — **3 attempts per 10 seconds**
- `/api/auth/request-password-reset` — **3 attempts per 60 seconds**

**Do not** write E2E tests that repeatedly submit auth forms through the UI. Instead:
1. **For authenticated state**: Create the session via Better Auth API once, then use Playwright `storageState` to reuse it across tests.
2. **For auth flow validation**: Test each flow once (sign-in, sign-up, reset) with a single test per flow. Use the MCP browser tools (`browser_navigate`, `browser_snapshot`) to verify DOM state before writing the permanent test.
3. **For validation errors**: Test empty-field and invalid-format errors via Vitest on the Server Action, not via Playwright on the UI. The UI just renders what the action returns.

### Next.js 16 hydration awareness

React 19 + Next.js 16 can produce hydration mismatches. Both test types must account for this:
- **Vitest**: `vitest.setup.ts` mocks async `useParams`, `useSearchParams`, `cookies()`, `headers()`. Server Components render synchronously in `happy-dom`; hydration is not a factor.
- **Playwright**: After `page.goto('/')`, always wait for selectors before asserting. Monitor `page.on('console')` for errors containing "hydrat". Use `page.waitForSelector` with timeouts — do not assert immediately after navigation.

### AI-assisted test exploration (Playwright MCP)

The project has `@playwright/mcp@latest` registered in `.devin/config.json`. This lets Devin use browser tools (`browser_navigate`, `browser_click`, `browser_snapshot`) to explore pages before writing tests.

**Use MCP for**: discovering selectors, verifying page structure, exploring complex flows before codifying them.
**Do NOT use MCP for**: running the actual test suite. MCP is exploration only. The permanent test must be written as standard Playwright code in `e2e/*.spec.ts`.

### Running the full test suite

```bash
# 1. Unit + integration tests (Vitest)
npm run test        # watch mode
npm run test:coverage

# 2. E2E tests (Playwright) — after Vitest passes
npm run test:e2e    # all browsers, headless
# or during development:
npx playwright test --project=chromium

# Both suites must pass before committing.
```

## Data & Caching
- Use **Cache Components** for data caching (see `node_modules/next/dist/docs/` for reference)
- Cache expensive database queries using `cacheLife` and `cacheTag`
- Use `revalidatePath` and `revalidateTag` for cache invalidation

## UI/UX Rules
- Use Shadcn/ui components consistently
- Forms: useActionState + Zod
- Drag-and-drop: `@dnd-kit`
- All new UI must be responsive and accessible
- For Style Guide reference the `src/app/globals.css` file
- Use the dark mode as default

### Shadcn/ui Component Integrity Rules
- **Never modify files under `src/components/ui/`** — these are generated by the shadcn CLI and must stay in their original form so future `npx shadcn add` or component updates apply cleanly.
- **Never add re-exports, extra types, or custom logic** to shadcn component files. If a type or abstraction is needed (e.g. `InputProps`), derive it from the React primitive directly (`React.ComponentProps<"input">`) or declare it in your own component file.
- **Compose, don't modify.** Build custom components (e.g. `PasswordInput`) as wrappers that import from `src/components/ui/` — never edit the source.
- **Style via `className` only.** Pass Tailwind utility classes through the `className` prop; never hardcode additional styles inside a shadcn component file.

### Tailwind CSS v4 Compliance Rules
- **No JS Configurations:** Never generate, look for, or attempt to modify `tailwind.config.js` or `tailwind.config.ts`. 
- **Theme Extensions:** All custom colors, spacing, animations, and typography variants must be appended directly inside the CSS entrypoint file using the `@theme` directive.
- **Documentation Enforcement:** When generating advanced layouts, grid containers, or using relative arbitrary values, Cascade **MUST** prioritize live documentation over training data weights. If a layout fails or syntax looks legacy, read from: `https://tailwindcss.com/docs`.
<!-- END:nextjs-agent-rules -->

## Resources & References

### Database & Infrastructure (CRITICAL — read this first)

**The production database is a self-hosted PostgreSQL 17 running in a Docker container on the Hetzner VPS.** It is NOT Neon anymore. The Neon → VPS migration was completed on July 20 2026 (D20). Neon connection strings are retained only for disaster recovery.

**Production database access:**
- **VPS SSH:** `ssh vectormatch-vps` (root@157.180.68.189, key-based auth via `~/.ssh/id_ed25519`)
- **SSH config** (`~/.ssh/config`): includes `LocalForward 15432 10.0.1.10:5432` — establishes a tunnel on port 15432 when connecting
- **Postgres container:** `z10g6zz09soe0ddwgpizteq2` (Docker container on the VPS)
- **Postgres port:** 25432 (external, firewalled) / 5432 (internal Docker network)
- **Database name / user:** `vectormatch` / `vectormatch`
- **Direct psql from VPS:** `docker exec z10g6zz09soe0ddwgpizteq2 psql -U vectormatch -d vectormatch -c "SQL"`
- **Local tunnel access:** `ssh -f -N vectormatch-vps` then connect to `localhost:15432` (use `pg` Pool or `node` with `pg` package — no `psql` binary on local Mac)
- **Connection string pattern:** `postgresql://vectormatch:<password>@157.180.68.189:25432/vectormatch`

**⚠️ Migration management warning:** Drizzle migrations are NOT automatically applied to the VPS Postgres. The `drizzle-kit migrate` command requires `DATABASE_URL` to be set locally with SSH tunnel access. When raw SQL migrations are applied manually (via `docker exec ... psql`), the `drizzle.__drizzle_migrations` tracking table must also be updated with the migration hash + timestamp, or future `drizzle-kit migrate` runs will fail or skip migrations. This caused a production outage on July 22 2026 when migration `0056_ambitious_argent` was never applied (the `description_html` column was missing from the `job` table).

**Local development database:**
- The local dev server (`npm run dev`) uses the same `DATABASE_URL` env var. If pointed at the VPS Postgres via SSH tunnel, it can query production data. If no `DATABASE_URL` is set, the lazy Proxy in `src/db/db.ts` defers Pool creation — the app starts but DB queries fail on first call.
- There is no local Neon dev branch anymore. The Neon free tier is retained for disaster recovery only.

### Neon Database (Historical — DR only)
- **Status:** The Neon database is retained for disaster recovery only (JOB 4.2). Do NOT use Neon for app queries, scripts, or tests.
- **Neon MCP server:** Still registered in `.devin/config.json` but connects to the old Neon project. Useful for DR verification only.
- **Historical docs:** Connection with Drizzle ORM: https://neon.com/docs/guides/drizzle | pgvector: https://neon.com/docs/extensions/pgvector

### Drizzle ORM
- **Drizzle Kit migrations**: https://orm.drizzle.team/docs/kit-overview
- **Query patterns**: https://orm.drizzle.team/docs/goodies

### Shadcn/ui
- **Official documentation**: https://ui.shadcn.com/docs
- **Next.js installation**: https://ui.shadcn.com/docs/installation/next
- **Components registry**: https://ui.shadcn.com/docs/components
- **Thing and customization**: https://ui.shadcn.com/docs/theming
- **CLI reference**: https://ui.shadcn.com/docs/cli

### Zod
- **Official documentation**: https://zod.dev/
- **Drizzle-Zod integration**: https://orm.drizzle.team/docs/zod

<!--
BEGIN:agent-rules-on-hold - DISABLED UNTIL FURTHER NOTICE
## Database & Matching Rules (Critical)
- Follow the exact schema in `db/schemas/index.ts` (users, userPersonas, jobs, matchQueue)
- Gate 1: Always use GIN index overlap on `must_have_tags` / `blocklist_tags`
- Gate 2: Use HNSW cosine similarity on persona embeddings (`<=>` operator)
- Gate 3: Use `gpt-4o` or `gpt-4o-mini` for nuanced final evaluation
- Never hallucinate experience years — strictly follow the date-merging algorithm from the TDD
- Use Cache Components for database query caching where appropriate


## Onboarding & PDF Parsing
- PDF parsing must happen **client-side** using `pdfjs-dist` in a Web Worker
- Skill extraction must follow the mandatory Chain-of-Thought algorithm (merge overlapping date ranges, no double-counting)
- Limit "Major Skills" to maximum 5 for `mustHaveTags`
END:agent-rules-on-hold - Database & Matching + Onboarding remain on hold; ATS Ingestion Rules re-enabled below
-->

## ATS Ingestion Rules
- Use native Greenhouse, Lever, and Ashby JSON APIs (all three are MVP priority). Centralized in `src/lib/jobs/ats-endpoints.ts`.
- Respect rate limits: max 2 req/s per ATS platform using `bottleneck` (`maxConcurrent: 1, minTime: 500` per ATS source). Rate limiting is distributed via Redis (`REDIS_URL`) when configured — see `src/lib/jobs/poller/rate-limiter.ts`. Without Redis, the cap is only enforced per-process (not safe for multi-worker production).
- Seed using HTTP Archive BigQuery (monthly script) + HN Algolia (weekly Inngest function). crt.sh deferred to Phase 2 (post-MVP).
- Never scrape HTML career pages. Non-ATS URLs from HN are resolved via DNS CNAME check + slug probe against ATS APIs. If both fail, discard — no manual review.
- Gate 0: Synchronous regex title filter rejects non-engineering jobs before database insertion (`src/lib/jobs/gate-zero.ts`). Optimize for recall — the 3-Gate funnel handles precision.
- All ATS responses must pass through Zod `safeParse()` before processing. Payload changes degrade gracefully (slug flagged as `degraded`) rather than crashing the worker.
- Deduplication: upsert on `(ats_source, ats_slug, external_job_id)` unique constraint. Re-polls refresh `lastSeenAt` and `rawJson`.
- Stale job cleanup: jobs not seen in 7 days → `stale`, not seen in 30 days → `gone`. Module C only matches `status = 'active'` jobs.
- Decay polling: Tier A (active) → every 12h, Tier B (dormant) → weekly, Tier C (dead) → stopped. Tiers recalculated daily.
- B→C handoff: Poller emits `job/ingested` Inngest event only for new jobs. Module B inserts raw jobs (empty tags, null embedding). Module C owns normalization.
- Proxies deferred to post-MVP. Trigger to add: first persistent 403 from an ATS.
- The system is fully autonomous — no human-in-the-loop for routine operations.

## Security & Compliance
- Never expose sensitive ATS credentials
- Position the app as a "User-Driven Job Intelligence Tool"
- Include proper legal framing in cold emails (W-8BEN, B2B compliance)
- Use environment variables for all secrets (never hardcode)

## Development Workflow
- Run `biome check --write .` before every commit (Biome 2.2.0+ uses `--write`; the old `--apply` flag was removed)
- Use Inngest dev server for local testing
- Always test the full 3-gate funnel after major changes

## Inngest Orchestration

All background jobs, durable workflows, and scheduled tasks **must** use Inngest. Do not use raw `setTimeout`, `node-cron`, or custom worker queues.

### File Map

| File | Role |
|------|------|
| `src/inngest/client.ts` | Typed Inngest client (`VectorMatchEvents`) |
| `src/inngest/functions.ts` | All background functions (seeders, poller, cleanup) |
| `src/inngest/index.ts` | Barrel exports for clean imports |
| `src/app/api/inngest/route.ts` | Next.js App Router serve handler (`GET`, `POST`, `PUT`) |
| `docs/reports/inngest-agent-resources.md` | Full coding agent reference (AI features, MCP, CLI) |

### Local Development

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — Inngest Dev Server (UI at http://localhost:8288)
npm run inngest:dev
```

The Dev Server auto-discovers apps on common ports. It exposes an MCP server at `http://127.0.0.1:8288/mcp` for agent-driven debugging.

### Coding Rules for Inngest Functions

1. **Always wrap domain logic in `step.run()`** — never call the DB, external APIs, or AI SDKs directly in the handler body. This ensures retries, checkpointing, and observability.
2. **Import domain logic lazily** inside the handler to avoid loading heavy modules at discovery time.
3. **Send events with `step.sendEvent()`** (not `inngest.send()`) so the emission is part of the durable trace.
4. **Use cron triggers** for scheduled jobs (e.g. `triggers: [{ cron: "0 0 * * 1" }]`).
5. **Use `throttle`** for rate-sensitive operations (ATS APIs, DNS lookups).
6. **Use `step.ai.wrap()` or `step.ai.infer()`** for all LLM calls inside Inngest functions — this gives full observability, retry logic, and (with `infer()`) offloads serverless cost to Inngest infrastructure.
7. **Register new functions** in `src/app/api/inngest/route.ts` — both import and add to the `functions: [...]` array.

### Self-Hosted Deployment (Coolify/Hetzner)

There is no Vercel integration for Inngest on self-hosted setups. After each deploy:

```bash
curl -X PUT https://vectormatch.dev/api/inngest --fail-with-body
```

Set `INNGEST_SERVE_ORIGIN=https://vectormatch.dev` in production environment variables.

### Redis (Distributed Rate Limiting)

Redis is required for production multi-worker deployments. It backs the Bottleneck rate limiters in `src/lib/jobs/poller/rate-limiter.ts` so the "max 2 req/s per ATS platform" cap is enforced globally across all Inngest worker processes.

- **Coolify**: Deploy a Redis container on the same Docker network. Use `redis://<redis-container-name>:6379` as `REDIS_URL`.
- **Local dev / CI**: Leave `REDIS_URL` unset. In-process rate limiting is used (correct for single-process, not safe for multi-worker).
- **Failure mode**: If Redis is unreachable, ATS fetches fail with a "network" error and the circuit breaker pauses the source. This is intentional (fail-closed) — stalling ingestion is safer than risking an ATS IP ban from uncoordinated requests.

### Environment Variables

| Variable | Local | Production |
|----------|-------|------------|
| `INNGEST_DEV` | `1` | omit |
| `INNGEST_EVENT_KEY` | dummy | self-hosted Inngest (Coolify service) |
| `INNGEST_SIGNING_KEY` | dummy | self-hosted Inngest (Coolify service) |
| `INNGEST_SERVE_ORIGIN` | omit | `https://vectormatch.dev` |
| `REDIS_URL` | omit | `redis://<coolify-redis>:6379` |

## Fallow (Codebase Intelligence)

This project has **Fallow** (v2.95.0) installed for structural analysis: dead code, duplication, complexity, circular dependencies, and boundary violations. Use it via the `fallow` skill (`.devin/skills/fallow/SKILL.md`) or the `fallow` MCP server registered in `.devin/config.json`.

**When to use Fallow**: architectural reviews, large feature builds, cleanup requests, PR audits, or complexity concerns. Invoke the skill or MCP tool for these scenarios.

**When NOT to use Fallow**: routine changes, individual component edits, or anything already covered by Vitest, Playwright, and Biome. Do not run fallow on every turn — it is overkill for small tasks.

**Agent**: Devin Desktop (not Windsurf). `FALLOW_AGENT_SOURCE` is intentionally unset because Devin is not in the Fallow allowlist; this does not affect functionality.

### Suppressed False-Positive Warnings (`ignoreExports`)

The `.fallowrc.json` `ignoreExports` section suppresses recurring "unused export" and "duplicate export" warnings that are **false positives**. These fall into three categories — do NOT remove these suppressions without understanding why they were added:

1. **Tested-and-ready modules awaiting Inngest wiring** — Module B/C job-matching infrastructure (poller, seeders, normalizer, gate functions, tech-tags, onboarding recompute). These are fully unit-tested in `__tests__/` directories (which Fallow ignores from usage analysis) and documented in the TDD/blueprint as key functions. Their production caller (the Inngest `jobIngestedHandler` and related functions) is still being wired up. When Inngest wiring is complete, these suppressions can be removed.

2. **Intentional API surface** — Per-job Zod schemas (`greenhouseJobSchema`, `leverJobSchema`, `ashbyJobSchema`) and their type exports (`GreenhouseJob`, etc.) are exported for testability and downstream consumer use, even though only the response-level schemas are imported by the poller adapters. `ATS_SOURCES` is a helper for iterating ATS sources. `getApprovedMatches` is a backward-compatibility wrapper.

3. **Intentional duplicate `AtsSource` type** — `src/lib/jobs/ats-endpoints.ts` exports a hand-written `AtsSource = "greenhouse" | "lever" | "ashby"` union, while `src/lib/jobs/seeders/schemas.ts` exports `AtsSource = z.infer<typeof atsSourceSchema>` (derived from the Zod enum). Both resolve to the same type, but the duplication is deliberate: the Zod schema is the source of truth for runtime validation, and the hand-written union is the canonical type for non-validation contexts. Consolidating would create a circular dependency or lose type safety.

**When a new Fallow "unused export" warning appears**: check whether the export is (a) tested in `__tests__/`, (b) used only within the same file, or (c) documented in the TDD as a pending-wiring module. If yes, add it to `ignoreExports` in `.fallowrc.json` rather than deleting the export. If no, the export is genuinely dead code and should be removed.

## BigQuery MCP (Public Dataset Analysis)

This project has **Google BigQuery MCP** integration for public dataset analysis, specifically supporting Module B (Seeding & Ingestion Engine). The server is registered in `.devin/config.json` using `@toolbox-sdk/server`.

**Available Tools**:
- `execute_sql`: Execute SQL statements against BigQuery
- `ask_data_insights`: Natural language data analysis and complex queries
- `search_catalog`: Find tables using natural language search
- `get_table_info`: Retrieve table metadata and schema
- `get_dataset_info`: Get dataset metadata
- `list_table_ids`: List all tables in a dataset
- `list_dataset_ids`: List all datasets in the project
- `analyze_contribution`: Perform key driver analysis
- `forecast`: Time series forecasting

**When to Use BigQuery MCP vs VPS Postgres**:
- **BigQuery MCP**: Public dataset analysis (HTTP Archive, Hacker News), market intelligence, job market trend analysis, prototyping data ingestion strategies, exploratory data analysis
- **VPS Postgres (via SSH + psql/docker exec)**: Transactional database operations, user/persona/job data, match queue operations, production database queries. Access via `ssh vectormatch-vps` then `docker exec z10g6zz09soe0ddwgpizteq2 psql -U vectormatch -d vectormatch -c "SQL"`. The Neon MCP server still works but connects to the old (DR-only) Neon database — do NOT use it for production queries.

**Use Cases for VectorMatch**:
- Module B: Discover job boards and companies from public datasets (HTTP Archive, HN, SSL certificates)
- Market intelligence: Analyze trending tech skills in job postings
- Performance monitoring: Query matching funnel metrics
- Prototyping: Test hypotheses before building custom scrapers

**Configuration**: See `.devin/config.json` and `docs/reports/bigquery-mcp-setup.md` for setup details. Uses BigQuery Sandbox tier (no billing required for public datasets).

**When to invoke**: Use for Module B development, market analysis, and when you need to query public datasets. Always use `mcp_list_tools` first to discover available tools before calling `mcp_call_tool`.

## Coolify MCP (Infrastructure Operations)

VectorMatch is hosted on a Hetzner VPS managed by Coolify. The Coolify MCP server is registered in `.devin/config.json` and provides read-only access to the production infrastructure.

**Available Tools**:
- `get_infrastructure_overview`: High-level summary of all servers, projects, applications, databases, and services — start here
- `list_servers` / `get_server`: List or inspect the Coolify host server
- `list_projects`: List Coolify projects
- `list_applications` / `get_application`: List or inspect the VectorMatch Next.js application
- `list_databases` / `get_database`: List or inspect databases (e.g., Redis)
- `list_services` / `get_service`: List or inspect services (e.g., Inngest, FlareSolverr, WordPress)

**When to Use Coolify MCP**:
- Investigating production health, status, or configuration of the VectorMatch app, Inngest, Redis, or other Coolify-managed services
- Answering questions about the current deployment, FQDN, health checks, or resource limits
- Discovering infrastructure context before making code or deployment decisions

**Note:** The VPS Postgres container (`z10g6zz09soe0ddwgpizteq2`) is NOT managed by Coolify — it was deployed manually via `docker run`. Use SSH (`ssh vectormatch-vps`) + `docker exec` to inspect it, not the Coolify MCP. The Coolify MCP will not list it under databases.

**Important Rules**:
- The built-in Coolify MCP server is **read-only**. Do not attempt to restart, stop, or modify resources through the MCP server.
- Some `get_*` responses include `_actions` hints (e.g., `restart`, `stop`). These are metadata only and are not callable MCP tools with this server.
- For any mutating operations (start/stop/restart services), use the existing `src/lib/coolify/client.ts` Server Actions (`getInngestStatus`, `startInngest`, `stopInngest`, `restartInngest`) or the Coolify dashboard.
- Always use `mcp_list_tools` first to discover the exact available tools before calling `mcp_call_tool`.

**Configuration**: See `.devin/config.json` for the `coolify` entry. It uses `COOLIFY_BASE_URL` and `COOLIFY_MCP_TOKEN` from the environment. If `COOLIFY_MCP_TOKEN` is not set, use `COOLIFY_API_TOKEN` and update the config accordingly. Ensure the Coolify API token has `read` permission only.

## Corpus Alignment Backfill Scripts

These one-time scripts activate the v2 corpus expansion enforcement layer. All support `--dry-run` (default, no writes) and `--apply` (persist) flags.

### Company Scorer Backfill (P0-1)
```bash
# Dry-run: preview tier transitions + scores
NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-company-scores.ts --dry-run

# Apply: persist scores + tiers
NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-company-scores.ts --apply --concurrency 25
```

### Employee Count Backfill (P1-1)
```bash
# Dry-run: preview emp estimates (63 registry + 932 YC + 436 VC)
NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-employee-count.ts --dry-run

# Apply: fill NULL employee_count values (never overwrites existing)
NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-employee-count.ts --apply
```

### Remote-Scope Backfill (P0-3)
```bash
# Dry-run: Step 1 only, no LLM cost
NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-remote-scope.ts --dry-run

# Apply: Step 1 + Step 2 LLM (~$0.71 for 2,381 LLM calls)
NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-remote-scope.ts --apply --concurrency 10
```

### Direct Normalize Backlog (P0-4)
```bash
# Dry-run: count backlog + show sample jobs
NODE_OPTIONS='--conditions react-server' npx tsx scripts/direct-normalize-backlog.ts --dry-run --limit 1500

# Apply: normalize + embed + write (~$0.37 for 1,237 jobs)
NODE_OPTIONS='--conditions react-server' npx tsx scripts/direct-normalize-backlog.ts --apply --limit 1500
```

### Required Env Vars for New Sources
- `GITHUB_TOKEN` — GitHub Events Probe (129 orgs × daily, needs 5000 req/hr authenticated tier)
- `BRAVE_SEARCH_API_KEY` — Brave Search seeder + frontend job scanner (free tier: 2000 queries/month)
