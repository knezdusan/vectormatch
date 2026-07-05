# Company Corpus Expansion v2 — Post-Implementation Session Handoff

> **Purpose:** This file is the initial prompt for a post-implementation session that (1) implements deferred operational improvements, (2) performs a comprehensive production stress-test of the entire v2 strategy, and (3) fixes any issues discovered during testing.
>
> **Date:** July 5, 2026
>
> **Implementation status:** All 3 implementation sessions (Phase 1-4) have been completed. The handoff document's Session State sections were NOT filled in by the implementation sessions — reconstruction is the first task.
>
> **Governing document:** `docs/governing/company-corpus-expansion-new.md` (locked strategy spec + Implementation Decisions + Open Tuning Items)
>
> **Implementation handoff:** `docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md` (multi-session roadmap, phase specs, session states — currently unfilled)

---

## Initial Prompt for New Session

I am running a post-implementation session for the Company Corpus Expansion v2 strategy at VectorMatch.dev. All 4 phases of implementation have been completed across 3 sessions. Your job is to (1) implement deferred operational improvements, (2) comprehensively stress-test the implementation against the governing strategy document, and (3) fix any issues discovered.

**YOUR ROLE:** You are a post-implementation auditor + fixer. You have full read/write access. You are NOT re-architecting the strategy — the governing document is locked. You are verifying it works as specified, fixing implementation gaps, and implementing the deferred operational items listed below.

**SESSION SCOPE:** Three mandates, in priority order:
1. **Mandate A**: Reconstruct session states + implement deferred operational improvements
2. **Mandate B**: Comprehensive stress-test of the full v2 implementation
3. **Mandate C**: Fix any issues discovered during stress-test

---

## Governing Documents to Read Before Proceeding

Read these files IN THIS ORDER before starting any work. Do not skip any. Do not assume memory from previous sessions — read the actual files.

### Tier 1: Strategy & Context (Read First)

1. **`docs/governing/company-corpus-expansion-new.md`** — THE locked strategy document. Read it in FULL. Pay special attention to:
   - All three Criteria (sourcing pipeline, remote-scope extraction, scoring matrix + breaker)
   - "Implementation Decisions" section (pre-resolved concerns: cheerio, openai package, big-tech registry)
   - "Schema Changes Required" section (verify all schema changes were applied)
   - "Open Tuning Items" section (these are your deferred operational tasks — see Mandate A)

2. **`docs/reports/EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md`** — The audit that motivated the v2 strategy. Read §1.4 (Key Challenges), §4 (Core Technical Implementation), §7 (Strategic Challenges). Understand WHY each criterion exists.

3. **`docs/reports/CORPUS_EXPANSION_V2_HANDOFF.md`** — The multi-session implementation handoff. Read the full document. Note that the Session State sections (Session 1, 2, 3) are likely still at `NOT_STARTED` / `—` placeholders — the implementation sessions did not follow the handoff protocol. You will reconstruct them in Mandate A.

### Tier 2: Project Rules (Read Before Touching Code)

4. **`AGENTS.md`** — Project rules. Critical sections:
   - Technology Stack (strict — Next.js 16, Drizzle, Inngest v4, Vitest, Biome)
   - Testing Strategy (Vitest vs Playwright separation, when NOT to generate tests)
   - Database Mutation in Tests (NEVER mutate production DB without explicit approval)
   - Destructive Operations Prohibition (NEVER run destructive ops without confirmation)
   - NEVER run Git commands

### Tier 3: Implementation Files (Read to Understand What Was Built)

5. **Schema files** — Verify the Phase 1 migration was applied:
   - `src/db/schemas/jobs/enums.ts` — Check for new enum values (`region_fenced`, `onsite`, `undetermined` in remoteScopeEnum; `github_probe`, `funding_signal` in discoverySourceEnum)
   - `src/db/schemas/jobs/job.ts` — Check for new columns (`retryInFlight`, `retryGeneration`, `clearedGeneration`, `textHash`, `sourceFetchedAt`, `jobVersion`; `provisional` in status)
   - `src/db/schemas/jobs/sourceHealth.ts` — Check for `escalationCount`, `lastEscalatedAt`, `banned` status
   - `src/db/schemas/jobs/companyQualityScore.ts` — Check for `companySizeScore`
   - `src/db/schemas/jobs/company.ts` — Check for `isAgency`, `isPublic`, `employeeCount`, `sourceOrphaned`
   - `src/db/migrations/` — Find the migration file(s) created during Phase 1

6. **Remote-scope extraction (Phase 2)**:
   - `src/lib/jobs/job-normalizer.ts` — Step 1 deterministic pre-pass + Step 2 LLM extraction
   - Any new file for remote-scope patterns (e.g., `src/lib/jobs/remote-scope-patterns.ts` or inline in normalizer)
   - `src/lib/jobs/batch-llm-client.ts` — Batch API wrapper (may exist as stub)
   - `src/lib/jobs/gate-zero-pre-filter.ts` — Updated to handle new remoteScope values
   - `src/inngest/functions.ts` — `nightlyResurrectionSweep` function

7. **Sourcing pipeline (Phase 3)**:
   - `src/lib/jobs/seeders/funding-signal-rss.ts` — RSS/Atom funding feed parser
   - `src/lib/jobs/seeders/github-events-probe.ts` — GitHub Events API poller
   - `src/lib/jobs/seeders/domain-probe.ts` — 5-step probe pipeline
   - `src/lib/jobs/seeders/provisional-job-repository.ts` — Provisional job insert helper
   - `src/inngest/functions.ts` — `normalizeProvisionalJob`, `retryInFlightSweeper` functions
   - Staleness gate, content-drift guard, fencing-token logic (locations TBD — find them)

8. **Scoring matrix + circuit breaker (Phase 4)**:
   - `src/lib/jobs/company-enrichment/big-tech-registry.ts` — Curated big-tech list
   - `src/lib/jobs/company-scorer.ts` or scoring logic in `job-normalizer.ts`
   - `src/lib/jobs/circuit-breaker.ts` — 5-tier circuit breaker
   - `src/inngest/functions.ts` — `breakerCheck`, `sourceBanRecoveryCheck` functions

9. **Test files** — Read to understand what was tested:
   - `src/lib/jobs/__tests__/` — All new test files
   - `src/inngest/__tests__/` — Inngest function tests

---

## Mandate A: Reconstruct Session States + Implement Deferred Operational Improvements

### Task A1: Reconstruct Session States (FIRST — before any other work)

The 3 implementation sessions did not fill in the Session State sections in `CORPUS_EXPANSION_V2_HANDOFF.md`. Reconstruct them by inspecting the codebase:

1. Check `git log` (via `git log --oneline -30` — you may READ git history, just don't run git mutations) to identify commits from the implementation sessions.
2. Check `src/db/migrations/` for the Phase 1 migration file(s).
3. Check file creation timestamps for new files.
4. Check `package.json` for the `openai` dependency.
5. Run `npx tsc --noEmit` and `npm run test` to verify current state.
6. Fill in all three Session State sections in `CORPUS_EXPANSION_V2_HANDOFF.md` with: files created, files modified, migrations applied, tests added, test results, deviations, blockers.
7. Update the Multi-Session Roadmap table statuses from `NOT_STARTED` to `COMPLETED` (or `PARTIALLY_COMPLETE` / `BLOCKED` if applicable).

### Task A2: Implement Expanded Remote-Scope Pattern Dictionary (PRIORITY)

This is the highest-impact deferred operational item. The current regex patterns in the normalizer are MVP-level (basic "US-only", "worldwide" patterns). Expand to a comprehensive pattern dictionary to push deterministic resolution from ~60% to 75-80%, directly reducing OpenAI costs.

**Implementation:**

1. Create `src/lib/jobs/remote-scope-patterns.ts` as a structured, exported constant table (NOT hardcoded regex in the normalizer). Structure:

```ts
type ScopeSignal = {
  pattern: RegExp;
  scope: "global" | "country_fenced" | "region_fenced";
  confidence: "high" | "medium";
  allowedCountries?: string[];
};
```

2. Implement the full pattern framework (see the expanded pattern list from the pre-handoff analysis):

   **HIGH-CONFIDENCE GLOBAL:**
   - `\b(anywhere\s+in\s+the\s+world|worldwide|work\s+from\s+anywhere)\b`
   - `\b(remote-first|distributed\s+(team|company|workforce))\b`
   - `\b(global\s+remote|remote\s+-\s*global|fully\s+remote\s+worldwide)\b`
   - `\b(no\s+location\s+restrictions?|location\s+independent|borderless)\b`

   **HIGH-CONFIDENCE COUNTRY-FENCED:**
   - US: `\b(US\s+only|USA\s+only|must\s+(be|reside)\s+(based\s+)?in\s+the\s+US|authorized\s+to\s+work\s+in\s+the\s+US|W-?2\s+only)\b`
   - UK: `\b(UK\s+only|must\s+be\s+based\s+in\s+the\s+UK|right\s+to\s+work\s+in\s+the\s+UK)\b`
   - Canada, Germany, France, Netherlands, Spain, Italy, Australia, India, Brazil, Singapore (repeat pattern)

   **HIGH-CONFIDENCE REGION-FENCED:**
   - `\b(EU\s+only|European\s+Union\s+only|must\s+be\s+based\s+in\s+(the\s+)?EU)\b`
   - `\b(EMEA\s+only|APAC\s+only|LATAM\s+only|North\s+America\s+only)\b`

   **MEDIUM-CONFIDENCE (require country/region extraction):**
   - ATS labels: `\b(remote\s*[-:]?\s*(US|UK|CA|DE|FR|NL|EU|EMEA|APAC|LATAM))\b`
   - Timezone: `\b(working\s+hours?\s*[:?]?\s*(CET|EST|PST|UTC|GMT))\b` — medium because some global jobs mention working hours without requiring residence
   - UTC range: `/UTC\s*([+-])\s*(\d{1,2})(?:\s*(?:to|[-–])\s*UTC\s*([+-])\s*(\d{1,2}))?/gi` — narrow range = region_fenced, wide range = global (medium confidence)
   - "must be based in [Country]": `\b(must\s+(live|reside|be\s+based)\s+in\s+([A-Z][a-z]+))\b` — extract country
   - "right to work in [Country]": `\b(right\s+to\s+work\s+(in|for)\s+([A-Z][a-z]+))\b` — extract country

   **NEGATIVE SIGNALS (confidence boosters):**
   - `\b(relocation\s+(required|offered))\b` — NOT global remote
   - `\b(hybrid|on-?site|in-?office)\b` — not remote
   - `\b(local\s+candidates\s+(only|preferred))\b` — location-fenced

3. Update `job-normalizer.ts` Step 1 to import and use the pattern table instead of inline regex.
4. **Validate against the existing corpus** before shipping:
   ```sql
   SELECT id, title, location_name, remote_scope, normalized_text
   FROM job
   WHERE normalized_text ~* '(remote|anywhere|worldwide|US.only|authorized|UTC|CET|EMEA|APAC)'
     AND remote_scope = 'unknown'
   LIMIT 50;
   ```
   This shows which patterns the current regex misses. Tune the dictionary against real data.
5. Write comprehensive unit tests for the pattern table (each pattern category, confidence levels, country extraction, UTC range parsing).

### Task A3: Implement Granular Discard Reasons for Static HTML Extraction

The governing doc's Open Tuning Items specifies monitoring `ingestion_log` for `discarded_static` entries with granular reasons. Implement:

1. Update the probe pipeline (`domain-probe.ts` or `provisional-job-repository.ts`) to log specific discard stages:
   - `discarded_no_content` — empty after cheerio cleaning (need new semantic selector)
   - `discarded_no_title_match` — content found but no title regex hit (regex too strict)
   - `discarded_below_threshold` — content <200 chars after cleaning
   - `discarded_mailto_only` — mailto with no role context
   - `discarded_aggregator` — aggregator domain detected
   - `discarded_http_error` — 4xx/5xx response
2. Update `ingestion_log` schema/usage to accept these granular reasons (check if the current `ingestion_log` table has a `details` or `metadata` column for this, or if the `type` enum needs extension).
3. Write tests verifying each discard reason is logged correctly.

### Task A4: Implement Circuit Breaker Monitoring Metric

The governing doc's Open Tuning Items specifies tracking the ratio of `single-test retry success` vs `single-test retry failure`. Implement:

1. Add a query or admin dashboard metric that computes: `SELECT count(*) FILTER (WHERE retry_succeeded) / count(*) FROM alerts WHERE alert_type = 'per_source_breaker_retry' AND created_at > now() - interval '7 days'`
2. Surface this in the admin dashboard (check `src/components/admin/InfrastructureHealth.tsx` for existing patterns — add a "Breaker Health" section showing the retry success ratio per source).
3. If the alerts table doesn't track retry outcomes, add a column or use the existing `details`/`metadata` field to record whether the single-test retry succeeded or failed.

### Task A5: Add Big-Tech Registry Review Cadence

1. Add a comment at the top of `src/lib/jobs/company-enrichment/big-tech-registry.ts`:
   ```ts
   // Last reviewed: July 5, 2026. Review quarterly against IPO calendar + major acquisitions.
   // See governing doc "Open Tuning Items" → "Big-tech registry review cadence" for the
   // three-tier maintenance plan (manual quarterly → semi-automated Wikipedia cross-ref →
   // Clearbit/Crunchbase API enrichment).
   ```
2. Verify the registry contains the obvious top-tier entries (FAANG, Microsoft, Oracle, Salesforce, Adobe, IBM, Cisco, etc.). If any are missing, add them.

### Task A6: Verify Sweeper Implementation Matches Updated Spec

The governing doc was updated to specify event-driven sweep (fires after each `normalizeProvisionalJob` attempt) + 30min safety-net cron with conditional skip. Verify the implementation matches:

1. Check if `retryInFlightSweeper` is implemented as a blind cron (old spec) or event-driven + safety net (new spec).
2. If it's still the old 2-3min cron, refactor to the updated spec:
   - Primary: add a `step.run("sweep-stale-flags")` as the final step in `normalizeProvisionalJob`
   - Safety net: change cron to 30min with conditional skip (`SELECT 1 FROM job WHERE status = 'provisional' LIMIT 1` — exit if no provisional jobs)
3. Verify the partial index on `job(retry_in_flight, updated_at) WHERE retry_in_flight = true` exists in the migration.

---

## Mandate B: Comprehensive Stress-Test

After Mandate A is complete, perform a comprehensive stress-test of the entire v2 implementation. The goal is to verify the implementation performs as projected in the governing document and identify any remaining issues.

### Test B1: Schema Verification

1. Run `npx tsc --noEmit` — 0 errors
2. Verify all schema changes from the governing doc's "Schema Changes Required" section are applied to the live database (query the schema, don't just check the migration files):
   - `remoteScopeEnum` has `region_fenced`, `onsite`, `undetermined`
   - `job` table has all new columns with correct types and defaults
   - `company_quality_score` has `companySizeScore`
   - `source_health` has `escalationCount`, `lastEscalatedAt`, `banned` status
   - `company` has `isAgency`, `isPublic`, `employeeCount`, `sourceOrphaned`
   - `discoverySourceEnum` has `github_probe`, `funding_signal`
   - Partial index on `job(retry_in_flight, updated_at) WHERE retry_in_flight = true` exists
3. Run `npm run test` — all existing + new tests pass
4. Run `npx biome check --write` — 0 lint errors

### Test B2: Remote-Scope Extraction Stress-Test

1. **Step 1 deterministic resolution rate**: Run the expanded pattern dictionary against the existing corpus of `normalized_text` values. Compute: what % of jobs with `remote_scope = 'unknown'` would now be resolved deterministically by the new patterns? Target: 75-80%.
2. **Step 2 LLM fallback**: Verify the Zod schema validation works correctly for all `remoteScope` values. Test with mocked LLM responses for each value.
3. **Gate 0.5 integration**: Verify that:
   - `remoteScope = 'global'` → bypasses country check
   - `remoteScope = 'country_fenced'` → hard-blocks if applicant country ∉ `allowedCountries`
   - `remoteScope = 'undetermined'` → passes through to Gate 3 (NEVER hard-rejects)
   - `remoteScope = 'region_fenced'` → correct behavior (check implementation)
   - `remoteScope = 'onsite'` → correct behavior (check implementation)
4. **Hard-fail path**: Verify that empty/garbage input produces `undetermined` + `normalization_failed`, NOT `onsite` or `country_fenced`.
5. **Nightly resurrection**: Verify the Inngest function is registered and would re-run Step 2 on `undetermined`/`normalization_failed` jobs.

### Test B3: Sourcing Pipeline Stress-Test

1. **Probe pipeline**: Verify the 5-step probe order is implemented correctly. Test with mocked HTTP responses for each step (robots.txt, common paths, JSON-LD, HTML fallback, RSS).
2. **Discard criteria**: Verify each discard condition triggers correctly (no job-like text, mailto-only, 4xx/5xx, <200 chars, aggregator domain).
3. **Provisional lifecycle**: Verify the full flow: insert provisional → `normalizeProvisionalJob` fires → parallel embed + classify → persist → status transitions to `active` or `normalization_failed`.
4. **Retry schedule**: Verify 4 attempts at 5min/15min/45min/90min. Verify 4hr SLA discard to `normalization_failed`.
5. **Staleness gate**: Verify `lastPolledAt` vs `sourceFetchedAt` comparison. Verify textHash dedup. Verify content-drift triggers full re-normalization.
6. **Fencing tokens**: Verify `retryGeneration` / `clearedGeneration` logic rejects zombie writes. Verify sweeper force-clears stale flags.
7. **Funding-signal seeders**: Verify `funding-signal-rss.ts` and `github-events-probe.ts` are implemented and registered as Inngest functions.

### Test B4: Scoring Matrix + Circuit Breaker Stress-Test

1. **Company size score**: Verify the scoring matrix computes correctly for all signal combinations. Verify clamping to [-0.30, +0.30]. Verify persistence to `company_quality_score.companySizeScore`.
2. **Big-tech registry**: Verify the registry lookup works (company in registry → use registry value; company not in registry and `employeeCount` null → skip signal).
3. **Circuit breaker tiers**: Verify each of the 5 tiers triggers correctly:
   - Tier 1: 3 consecutive provisional fails → 15min pause + single-test retry
   - Tier 2: >15% / >25% / >30% provisional >1hr → progressive throttle
   - Tier 3: ≥30% unknown at 3hr count → pause high-unknown sources
   - Tier 4: `global / (global + country_fenced) < 50%` → halt non-global ingestion
   - Tier 5: `escalation_count ≥ 3` in 24hr → 24hr ban + cooldown recovery
4. **Severity stack**: Verify hard pause suppresses rate reductions. Verify rate reductions don't stack (strictest applies).
5. **Breaker scheduling**: Verify `breakerCheck` fires at T+3hr via cron-linked event. Verify per-source evaluates before corpus-ratio.
6. **Source ban recovery**: Verify `sourceBanRecoveryCheck` recovers banned sources after 24hr with single-test retry.

### Test B5: Cost Verification

1. Verify the `openai` npm package is installed and the batch-llm-client.ts wrapper exists.
2. Verify the sync/batch split is implemented: sync path for SLA-critical (within 4hr window), batch path for SLA-indifferent (content-drift, dormant, backlog).
3. Estimate current daily LLM cost based on actual job volume and deterministic resolution rate (post-pattern-expansion).

### Test B6: Integration Verification

1. Verify all new Inngest functions are registered in `src/inngest/functions.ts`:
   - `normalizeProvisionalJob`
   - `nightlyResurrectionSweep`
   - `breakerCheck`
   - `retryInFlightSweeper` (event-driven + safety net)
   - `sourceBanRecoveryCheck`
2. Verify the Inngest dev server / self-hosted Inngest recognizes all new functions.
3. Verify no existing functionality is broken by the schema changes (run the full existing test suite).

---

## Mandate C: Fix Issues Discovered During Stress-Test

For each issue discovered during Mandate B:

1. **Document the issue**: What was expected, what actually happened, which file(s) are affected.
2. **Fix the issue**: Implement the fix following existing codebase conventions.
3. **Add a regression test**: Write a test that would have caught the issue.
4. **Verify the fix**: Run the test, confirm it passes. Run the broader test suite, confirm no regressions.
5. **Update the Session State**: If this is a significant fix, note it in the handoff document.

If an issue requires a strategy-level change (not just an implementation fix), STOP and raise it with the user. Do NOT change the governing document without explicit approval.

---

## Verification Checklist (Before Declaring Session Complete)

- [ ] All three Session State sections in `CORPUS_EXPANSION_V2_HANDOFF.md` are filled in (reconstructed from codebase inspection)
- [ ] Multi-Session Roadmap table statuses updated to reflect actual completion state
- [ ] `src/lib/jobs/remote-scope-patterns.ts` created with comprehensive pattern dictionary
- [ ] `job-normalizer.ts` updated to use the pattern table
- [ ] Pattern dictionary validated against existing corpus (deterministic resolution rate measured)
- [ ] Granular discard reasons implemented in probe pipeline
- [ ] Circuit breaker monitoring metric implemented in admin dashboard
- [ ] Big-tech registry review comment added
- [ ] Sweeper implementation verified/refactored to event-driven + 30min safety net
- [ ] `npx tsc --noEmit` — 0 errors
- [ ] `npx biome check --write` — 0 errors
- [ ] `npm run test` — all tests pass (existing + new)
- [ ] All schema changes verified against live database
- [ ] All Inngest functions registered and recognized
- [ ] Stress-test results documented (what passed, what was fixed)
- [ ] Any remaining issues documented as Open Tuning Items in the governing document

---

## Key Constraints (From AGENTS.md — Do Not Violate)

- **No raw SQL** unless for complex vector/GIN queries — use Drizzle ORM
- **Biome** for formatting (never ESLint/Prettier) — use `biome check --write`
- **Vitest** for unit/integration tests, **Playwright** for E2E — never mix
- **Never modify `src/components/ui/`** (shadcn components)
- **Tailwind v4 CSS-first** — no `tailwind.config.js`
- **Never run Git commands** — leave all version control to the user (you MAY read git history with `git log`, but never `git add`, `git commit`, `git push`, `git checkout`, etc.)
- **Never perform destructive operations** without explicit user confirmation
- **Database mutation in tests**: prefer mocks, ask before touching real DB
- **NEVER run `db:migrate`** without explicit user approval

---

## Final Notes

- The implementation sessions did not follow the handoff protocol (Session States are unfilled). This is a process failure that Mandate A1 addresses. Do not let it block you — reconstruct from codebase evidence.
- The regex pattern expansion (Task A2) is the highest-impact operational improvement. It directly reduces OpenAI costs and improves matching pipeline latency. Prioritize it.
- The stress-test (Mandate B) is comprehensive but should use mocked data where possible. Do NOT create test jobs in the production database. Do NOT trigger real Inngest functions against production unless explicitly approved.
- If you discover that a phase was not actually implemented (e.g., Phase 3's probe pipeline doesn't exist), STOP and tell the user. Do NOT attempt to implement missing phases — that's outside this session's scope.
