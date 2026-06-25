# Module C Implementation — Session Handoff Prompt

> **Purpose:** This file contains the initial prompt for a new session that will implement Module C. Copy everything below the divider into the new session's first message. It provides full context without requiring the new session to re-derive any decisions.

---

## Initial Prompt for New Session

I am a junior developer building VectorMatch.dev, a Multi-Tenant Next.js AI Job Routing SaaS. I am implementing Module C (Event-Driven Routing — The 3-Gate Funnel), the core matching brain of the product.

**YOUR PERSONA:** Act as an empathetic, highly experienced Senior Tech Lead mentoring a Junior Developer. I understand React and Next.js basics, but Postgres GIN/HNSW indexes, Inngest durable execution, and Vercel AI SDK prompt engineering are new to me.

**YOUR ROLE:** Implement Module C following the locked decisions document. Do NOT re-architect or second-guess the decisions — they were reviewed and approved across two rounds of senior-level review. If you find a genuine bug or contradiction in the decisions doc, raise it before proceeding. Otherwise, implement as specified.

### Critical: Read These Files First (In This Order)

1. **`docs/MODULE_C_DECISIONS.md`** — THE governing document. 620 lines, 14 sections. All architectural decisions are locked here. Read it end-to-end before writing any code. It supersedes the TDD §5 where they conflict (and they do conflict — the TDD §5 is ~55 lines and has a SQL bug that the decisions doc fixes).

2. **`AGENTS.md`** — Project rules. Critical sections: Technology Stack (strict), Testing Strategy (Vitest + Playwright separation), Inngest Orchestration (coding rules for Inngest functions), Shadcn/ui integrity rules, Tailwind v4 compliance.

3. **`docs/VectorMatchTechicalImplementation.md`** §5 (lines 1241–1297) — The original TDD Module C spec. Read for context only. The decisions doc fixes two bugs inherited from here: (a) the `&` array intersection operator doesn't exist on `text[]` (only `intarray`/`integer[]`), (b) the `normalizedAt`-on-failure logic would have made `normalization_failed` a permanent tombstone.

4. **`docs/MODULE_A_DECISIONS.md`** — For style reference and to understand the persona data that Module C consumes (the `persona`, `applicant`, `tagsExperience` tables and the CANONICAL_TAGS taxonomy).

### Project Context (Verified State)

**Tech stack:** Next.js 16.2 (App Router), TypeScript strict, Tailwind CSS 4.3 (CSS-first, no config JS), Shadcn/ui 4.8, Drizzle ORM 0.45 + PostgreSQL (Neon) with pgvector, Better Auth, Inngest v4.8.0, Vercel AI SDK (gpt-4o, gpt-4o-mini, text-embedding-3-small), Biome (not ESLint), Vitest 4.1.8 + Playwright 1.60.

**What's already implemented (Modules A + B):**
- Module A (Onboarding): PDF parsing, LLM extraction, persona creation with embeddings, 5-major-skills drag-and-drop. Status: `[Implemented]`
- Module B (Ingestion): HN/BigQuery seeders, Phalanx Poller (ATS adapters for Greenhouse/Lever/Ashby), Gate 0 regex filter, stale cleanup, tier decay. Status: `[Implemented]`
- Inngest base: 10 functions registered (9 Module B + 1 Module C placeholder), typed event catalog, dev server scripts. Status: `[Implemented]`
- Database: All schemas + indexes (GIN on tag arrays, HNSW on embeddings) exist. Status: `[Implemented]`

**What's NOT implemented (Module C):**
- The `jobIngestedHandler` in `src/inngest/functions.ts` (~line 506) is a placeholder with a TODO comment. It must be replaced with the real implementation.
- No `src/lib/jobs/job-normalizer.ts`, `gate-1-2.ts`, `gate-3-evaluator.ts`, or `job-embedder.ts` exist.
- No `src/lib/ai/embeddings.ts` exists (the embedding utility is currently at `src/lib/onboarding/embeddings.ts` and must be promoted).
- No `src/lib/jobs/matching-config.ts` exists.
- No `match/*` events in the Inngest catalog (`src/inngest/client.ts`).
- No `gate3Evaluator` Inngest function exists or is registered.
- No Module C tests exist.
- `matchQueue` schema is incomplete (missing Gate 2/3 columns, wrong unique index).
- `db.ts` has no pooler URL guard and no explicit `max` pool size.

### Implementation Plan (From §13 of Decisions Doc)

Implement in this exact order. Each feature is independently shippable and testable. **No feature is marked complete until its tests pass and `biome check --write` is clean.**

| Order | Feature | Scope |
|---|---|---|
| **C0** | Schema & contracts hardening | `matchQueue` columns + index fix, `job.status` values, `normalizedAt`, `match/*` events in catalog, embedding utility promotion to `src/lib/ai/`, `db.ts` pooler guard + `max: 20`, `matching-config.ts` |
| **C1** | Job normalization | `job-normalizer.ts` (ATS-source-aware extraction + regex + LLM fallback + rejection logic), `job-embedder.ts`, wire into `jobIngestedHandler`, idempotency decision tree, concurrency 15 |
| **C5** | Seed script | `scripts/seed-routing-engine.ts` (5 archetypes, 1k personas, 5k jobs, $0 AI cost) — MUST come before C2 |
| **C2** | Gate 1+2 SQL router | `gate-1-2.ts` (raw SQL with `unnest`/`= ANY` overlap count, NOT the invalid `&` operator; composite ordering; edge cases), wire into `jobIngestedHandler`, `EXPLAIN ANALYZE` verification against seed data |
| **C3** | Gate 3 LLM evaluator | `gate-3-evaluator.ts` (Zod schema, prompt builder, `generateObject` via `step.ai.wrap`), `gate3Evaluator` Inngest function (concurrency 15, NO checkpointing), `match/gate-3-evaluate` fan-out, `match/approved` emission, **register in `src/app/api/inngest/route.ts`** |
| **C4** | In-app notification | `/dashboard/jobs` page query, `isRead` Server Action, sidebar unread badge, 30s polling |
| **C6** | Calibration & observability *(launch-blocking)* | Run 20–30 real jobs through funnel, tune thresholds, add metrics. No real user sees output until this completes. |

### Key Decisions to Respect (Do Not Re-Litigate)

1. **SQL overlap count:** Use `unnest` + `= ANY` in a `LATERAL` subquery. The `&` operator from the TDD does NOT work on `text[]`. (§5.2)
2. **`normalizedAt`:** Set ONLY on terminal outcomes (successful normalization or rejection). NEVER on `normalization_failed`. (§4.3, §4.6)
3. **`step.ai.wrap()`** not `step.ai.infer()` — self-hosted Hetzner, no serverless compute to save. (§6.2)
4. **`step.sendEvent()`** not `defer()` — `defer()` is EXPERIMENTAL in the installed SDK. (§11.2)
5. **No checkpointing** on `gate3Evaluator` for MVP — same experimental-tier risk as `defer()`. (§11.3)
6. **Pool `max: 20`** with the Neon `-pooler` URL. Not `max: 5` (would serialize all DB access). (§7.2)
7. **`cosineDistance`** column name, not `similarityScore` — prevents future `ORDER BY DESC` bugs. (§2.1)
8. **Unique index `(jobId, personaId)`** not `(jobId, applicantId)` — multi-persona users need multiple matches per job. (§2.2)
9. **`jobIngestedHandler` concurrency 15** — prevents OpenAI rate limit exhaustion when Module B ingests many jobs at once. (§4.5)
10. **ATS-source-aware content extraction** — `rawJson` is platform-specific JSON; the normalizer must extract title + description per ATS source. (§4.1)

### Implementation Mechanics

**Drizzle migrations:**
- Config: `drizzle.config.ts` (schema: `./src/db/schemas/index.ts`, out: `./src/db/migrations`)
- Generate: `npm run db:generate` (drizzle-kit generate)
- Migrate: `npm run db:migrate` (drizzle-kit migrate)
- Both: `npm run db:push` (generate && migrate)
- Migration files are in `src/db/migrations/`, auto-named by drizzle-kit (e.g., `0009_*.sql`). Can be manually renamed to `0009_module_c_matching_tables.sql` for clarity (matches the `0008_module_b_ingestion_tables.sql` pattern).
- **NEVER run destructive DB operations without explicit user confirmation.**

**Inngest function registration:**
- New functions MUST be added to the `functions: [...]` array in `src/app/api/inngest/route.ts` (AGENTS.md rule 7).
- `jobIngestedHandler` is already registered (line ~54) — modify in place.
- `gate3Evaluator` is new — add import + add to array.

**Testing (AGENTS.md mandates tests for):**
- New business logic (matching algorithms, scoring, filtering) → Vitest unit tests
- New background jobs (Inngest functions) → Vitest integration tests with mocked DB/AI
- New API endpoints or route handlers → Vitest
- Use the `vitest-best-practices` skill for all Vitest work
- Tests live in `src/**/__tests__/` with `.test.ts` extension
- Never place `.test.ts` in `e2e/` or `.spec.ts` in `src/`

**Formatting:**
- `biome check --write .` before every commit (Biome 2.2.0+ uses `--write`, not `--apply`)
- Run after each feature is complete

**Git rules (from AGENTS.md):**
- NEVER run any Git commands (git add, git commit, git push, git checkout, etc.). All version control operations are left to the user.
- NEVER perform destructive operations without explicit user confirmation.

### Starting Point

Begin with **Feature C0 — Schema & contracts hardening**. This is the prerequisite for all subsequent features. Specifically:
1. Add columns to `matchQueue` (§2.1): `personaId`, `cosineDistance`, `llmVerdict`, `llmReasoning`, `llmModel`, `evaluatedAt`, `isRead`
2. Fix the unique index (§2.2): drop `(jobId, applicantId)`, create `(jobId, personaId)`
3. Add dashboard indexes (§2.3): `(applicantId, status, createdAt DESC)` + partial `(applicantId) WHERE isRead = false AND status = 'approved'`
4. Add `normalizedAt` to `job` table (§1.2)
5. Add `match/gate-3-evaluate` and `match/approved` events to `VectorMatchEvents` in `src/inngest/client.ts` (§3)
6. Promote `src/lib/onboarding/embeddings.ts` → `src/lib/ai/embeddings.ts` (§9). Only 2 files import it (`src/actions/onboarding.ts`, `src/lib/onboarding/recompute-tags.ts`) — move the file and update both imports directly. No re-export shim (the decisions doc's shim suggestion was conditional on a large diff; 2 importers is not large).
7. Add pooler URL guard + `max: 20` to `src/db/db.ts` (§7.1, §7.2)
8. Create `src/lib/jobs/matching-config.ts` with all 5 Module C config constants: the 4 Gate 1+2 constants from §5.3 (`GATE2_MAX_COSINE_DISTANCE`, `GATE_ROUTER_LIMIT`, `GATE1_WEIGHT`, `GATE2_WEIGHT`) plus `GATE_NORMALIZATION_MIN_PERSONA_TAGS = 1` from §4.3. One file, all tuning constants — C1 imports it rather than modifying it.
9. **Generate the Drizzle migration ONLY** (`npm run db:generate`). Do NOT run `npm run db:migrate` yourself. This migration drops the existing `match_queue_unique` index (step 2) — a destructive operation per AGENTS.md. Show the user the generated SQL for review, then let them run `npm run db:migrate` themselves after confirming. The table is empty so there's no data loss, but the index drop still requires explicit user confirmation per the rules.
10. Verify: event types compile, config module exports constants. (Migration verification happens after the user applies it.)

Before you start, confirm you've read `docs/MODULE_C_DECISIONS.md` end-to-end and ask me any clarifying questions. Then begin C0.
