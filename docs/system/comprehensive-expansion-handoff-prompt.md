

## Context

VectorMatch is a 3-gate job-matching SaaS (Next.js 16 + Drizzle + Neon Postgres + Inngest + Vercel AI SDK) that routes ATS job postings to developer personas using GIN tag overlap (Gate 1), HNSW vector similarity (Gate 2), and LLM arbitration (Gate 3). The system has 10,158 registered companies across 6 ATS platforms (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee) and 3,653 jobs in the database.

The applicant is a Serbia-based remote developer with 3 personas covering React/Next.js/TypeScript, Vue/JavaScript, and PHP/Laravel. Their profile: country=RS, assignment_types={remote}, modalities={full-time,part-time,contract}, preferred_compliance={w8ben,ic_global}, seniority_levels={senior,lead}, work_authorizations=null, expected_comp_min=null, years_of_experience=null.

### The Core Problem

The job corpus is overwhelmingly backend-heavy and US-centric, producing very few matches for a Serbia-based remote frontend developer. Of 329 global-remote active jobs:
- Frontend overlap (react/nextjs/ts/js/vue): 88 jobs (26.7%)
- Legacy frontend (php/laravel): 10 jobs (3.0%)
- Python backend: 153, Go backend: 103, Java backend: 61

The applicant's 3 personas compete for ~98 jobs out of 329. The supply side is skewed because:
1. The ATS pollers poll ALL jobs from a company (backend, infra, data), not just frontend
2. 65% of discovered companies have NEVER been polled (the batch poller can't keep up)
3. The sources are biased toward US/VC-backed companies (YC, VC portfolios) which are backend-heavy
4. 866 Greenhouse jobs have remote_scope='undetermined' (resurrection sweep was broken, now fixed but not yet deployed)

### Recent Fixes (Completed But NOT Yet Deployed)

The following code changes have been made in the current branch but need deployment to Coolify:

1. **Gate 3 prompt fix** (`src/lib/jobs/gate-3.ts`): Clarified that "full-time" is a modality not a W-2 signal, absence of contractor language is NOT a hard blocker, workAuthRiskFlag is NEVER a rejection reason, hybrid in a foreign country is a HARD blocker, and null workplaceType with a specific city location should be inferred as on-site. All 3 prompt variants (balanced, strict, thorough) updated.

2. **Gate 0.5 pre-filter fix** (`src/lib/jobs/gate-zero-pre-filter.ts`): Extended Check 3 to hard-block hybrid jobs in foreign countries (applicant cannot commute) and null-workplaceType jobs with specific city locations (infer on-site). Added `isSpecificLocation()` helper with `REMOTE_LOCATION_INDICATORS` and `BROAD_REGION_NAMES` arrays.

3. **Resurrection sweep fix** (`src/inngest/functions.ts`): The `get-undetermined-jobs` step was returning 500 rows with full normalizedText/rawJson, exceeding Inngest's step output size limit. Fixed to return only job IDs in the first step; full metadata is fetched inside each batch step via `inArray(job.id, batchIds)`.

4. **LLM timeout fix** (`src/lib/jobs/remote-scope-extractor.ts`): `extractScopeLLM` had no timeout, causing indefinite hangs when the OpenAI API was slow. Added `abortSignal: AbortSignal.timeout(30000)`. Also added content truncation to 20,000 chars to stay within gpt-4o-mini's 8192 token limit.

5. **LLM token limit fix** (`src/lib/jobs/job-normalizer.ts`): Added content truncation to `extractTagsLLM` (24,000 chars) and `summarizeJobLLM` (30,000 chars) to prevent "maximum input length is 8192 tokens" API rejections. 24 jobs previously failed normalization due to this.

6. **Test updates** (`src/lib/jobs/__tests__/gate-zero-pre-filter.test.ts`): Updated 6 tests to reflect new Gate 0.5 behavior, added 5 new tests. All 113 tests pass (46 Gate 0.5 + 67 Gate 3). Biome clean, typecheck clean.

### Current Database State (as of July 7, 2026)

**Companies:** 10,158 total with polling enabled
- 976 active_hot (polled every 3h) — 902 have zero active jobs, 28 never polled
- 9,127 active (polled every 12h) — 8,898 have zero active jobs, 6,516 never polled
- 53 dormant — all zero jobs, 30 never polled
- 2 dead — both zero jobs
- Only 3,584 companies (35%) have EVER been polled
- The active tier at 100 companies/run every 12h = 45 days for a single full cycle

**Jobs:** 3,653 total
- 854 active + normalized, 607 active but NOT normalized, 110 normalization_failed, 1,681 rejected, 401 stale
- By ATS source: Greenhouse 818 active, Ashby 450, SmartRecruiters 120, Lever 73
- Remote scope: 513 global (Greenhouse), 46 global (Ashby), 25 global (SmartRecruiters), 20 global (Lever)
- 866 Greenhouse jobs still have remote_scope='undetermined'

**Match Queue:** 11 entries total (1 approved, 6 rejected, 4 mismatch). The 5 false-positive approved matches from the previous run were cleared by the user.

---

## Work Items

### WORK ITEM 1: Deploy Existing Fixes and Verify

**Goal:** Deploy all 6 code changes to Coolify and verify each fix is working.

**Steps:**
1. Commit and push all changed files (gate-3.ts, gate-zero-pre-filter.ts, gate-zero-pre-filter.test.ts, remote-scope-extractor.ts, job-normalizer.ts, functions.ts)
2. Deploy to Coolify
3. Trigger the `nightly-resurrection-sweep` Inngest function manually via the Inngest dashboard — it should now succeed (step output is just IDs, not full job text)
4. Monitor the Inngest dashboard for `job-ingested` handler failures — they should stop (the 30s timeout prevents indefinite hangs)
5. Trigger `normalization-retry-sweep` or run the normalization script to retry the 110 `normalization_failed` jobs — the truncation fix should allow most to succeed
6. Clear the existing match_queue: `DELETE FROM match_queue` (the user has already cleared the 5 false positives; clear the rest too for a clean slate)
7. Run `NODE_OPTIONS='--conditions react-server' npx tsx scripts/direct-gate-routing.ts --limit 500 --concurrency 10` to re-route jobs through the fixed gates

**Success Criteria:**
- Resurrection sweep completes without "step output size" error
- Job Ingested handler failure rate drops to near zero
- At least 50% of the 110 normalization_failed jobs now succeed
- Gate 3 approval rate is between 20-60% of candidates that reach Gate 3 (not 0%, not 100%)
- No false positives like hybrid jobs in foreign countries or on-site jobs in specific cities
- Approved matches are visible in the dashboard with correct job titles, locations, and remote_scope

### WORK ITEM 2: Fix the Polling Bottleneck (191/10,114 Ratio)

**Goal:** Diagnose and fix why 65% of discovered companies have never been polled, and why only 191 out of 10,158 companies have active jobs.

**Root Cause (already identified):** The batch poller polls 100 companies per Inngest function run. The active tier has 9,127 companies. At 100/run every 12h, it takes 91 runs = 45 days for a single full cycle. 6,516 companies in the active tier have never been polled because the poller hasn't reached them yet.

**Steps:**
1. Verify the batch poll crons are actually firing in the Inngest dashboard (active_hot every 3h, active every 12h, dormant weekly)
2. Increase the batch poll batch size from 100 to the maximum Inngest allows per step (likely 500-1000 with optimized DB queries)
3. OR: Increase the active tier polling frequency from every 12h to every 4h (matching active_hot) — this would reduce the full cycle from 45 days to 15 days
4. OR: Implement a "poll backlog" Inngest function that specifically targets never-polled companies, running every hour with a high batch size until the backlog is cleared
5. After fixing the polling throughput, monitor the `ever_polled_total` count over 7 days — it should increase from 3,584 toward 10,158
6. Investigate why 902 active_hot companies have zero active jobs despite being polled frequently — are these companies with no current openings, or is the poller failing silently? Check `consecutive_failures`, `health` status, and `last_error_message` for these companies
7. Check if the `active_job_count` field is being updated correctly after each poll — if the poller finds 0 jobs, does it correctly set `active_job_count=0` and update `last_polled_at`?

**Success Criteria:**
- At least 80% of companies (8,000+) have been polled at least once within 7 days of the fix
- The number of companies with active jobs increases from 191 toward 500+ (not all companies will have openings, but 191/10,158 = 1.9% is too low)
- The Inngest dashboard shows batch poll functions completing successfully with high company counts
- Admin dashboard shows increasing active job count over time

### WORK ITEM 3: Implement Direct Job Board Ingestion (Phase 1)

**Goal:** Ingest jobs directly from remote-first job boards with structured APIs, bypassing the ATS poller entirely. This targets the tech stack gap (frontend/legacy) and the remote scope problem (every job on these boards is remote by definition).

**Background:** Research identified 14 free, no-auth job boards with structured tech_stack/remote fields. The current architecture only extracts company names from RemoteOK/Remotive/Himalayas and runs them through the Slugger → ATS poller pipeline, which: (a) throws away structured data, (b) loses remote-first filtering, (c) introduces a 2-hop delay. Direct ingestion is 1 hop: API call → job record.

**Phase 1 Boards (implement in this order):**

1. **NoFluffJobs** — `POST https://nofluffjobs.com/api/search/posting` — 19,000+ CEE jobs (Poland/CZ/SK/HU/NL) with `techStack[]`, `remoteType`, `salaryMin/Max`, `seniority`, `contractType`. Direct frontend/PHP/Laravel representation. Serbia-friendly companies.

2. **JustJoin.it** — `GET https://justjoin.it/api/offers` — 5,000+ CEE jobs with `requiredSkills[]` (array of `{name, level}`), `workplaceType`, `salaryFrom/To`, `experienceLevel`, `currency`. Poland's largest IT job board.

3. **Himalayas** — `GET https://himalayas.app/jobs/api?limit=20&offset=0` (paginated) — 100,000+ global remote jobs with `tags[]`, `minSalary/maxSalary`, `employmentType`, `timezone`. Already has a seeder but needs direct ingestion.

4. **RemoteOK** — `GET https://remoteok.com/api` — 2,000+ global remote jobs with `tags[]`, `salary_min/max`. Already has a seeder but needs direct ingestion. Note: first element in response array is a legal notice, not a job — skip it.

**Implementation Steps:**

Step 1: Write an evaluation script (`scripts/evaluate-job-boards.ts`) that calls each board's API, counts total jobs, counts frontend/PHP/Laravel jobs, and reports the actual numbers. Run it and verify the estimates before implementing ingestion.

Step 2: Schema migration — add new `ats_source` enum values: `nofluffjobs`, `justjoin`, `himalayas_direct`, `remoteok_direct`. Add `external_url` text column to `job` table (the direct apply URL from the job board). Add `source_job_id` text column to `job` table (the board's internal ID for dedup). Add unique constraint on `(ats_source, source_job_id)`.

Step 3: Create a shared normalizer module (`src/lib/jobs/direct-ingestion/`) with one adapter per board that transforms the board's JSON response into the existing `NormalizedJob` format. Map the board's structured `tags`/`techStack`/`requiredSkills` directly to `extracted_tags`. Map `remoteType`/`workplaceType` directly to `workplace_type` + `remote_scope='global'` (for remote-first boards). Map `salaryMin/Max` to `compensation_min/max`. Map `seniority`/`experienceLevel` to `experience_min_years`/`experience_max_years` where possible.

Step 4: Create a new Inngest function `directJobBoardIngestion` in `src/inngest/functions.ts` that runs daily (cron `0 5 * * *`), calls each board's API, normalizes via the adapters, and upserts into the `job` table. Use the `source_job_id` + `ats_source` unique constraint for dedup. Skip LLM normalization entirely — the structured fields from the API are the source of truth. Still generate job embeddings via `text-embedding-3-small` for Gate 2 vector search. Still emit `job/ingested` events for Gate 0.5 + Gate 1+2 routing.

Step 5: For NoFluffJobs and JustJoin specifically, filter the API response to only ingest jobs where `remoteType` includes remote or hybrid, AND the tech stack overlaps with the applicant's personas (React, Next.js, TypeScript, JavaScript, Vue, PHP, Laravel, Node.js, CSS, HTML, frontend). This prevents ingesting 19,000 backend jobs that won't match.

Step 6: Run the ingestion function manually via Inngest dashboard and verify jobs appear in the database with correct `ats_source`, `extracted_tags`, `workplace_type`, `remote_scope`, `external_url`, and `source_job_id`.

Step 7: Run `direct-gate-routing.ts` to route the newly ingested jobs through the matching pipeline.

**Success Criteria:**
- Evaluation script reports actual job counts per board, broken down by tech stack
- At least 4 new `ats_source` values exist in the database with job records
- At least 5,000 new jobs ingested from direct job boards within 24h of implementation
- At least 500 of those new jobs have frontend/PHP/Laravel tags
- At least 200 of those new jobs have `remote_scope='global'`
- New approved matches appear in the dashboard for the applicant's personas
- No duplicate jobs (the `(ats_source, source_job_id)` constraint prevents re-ingestion)

### WORK ITEM 4: Implement Profile UI for expectedCompMin and yearsOfExperience

**Goal:** The applicant's `expected_comp_min` and `years_of_experience` are both NULL. Gate 0.5 checks 4 (compensation) and 5 (experience band) are soft-fail-open when these are null, meaning they never fire. The user needs UI to set these values.

**Background:** The database schema already has these columns (`src/db/schemas/jobs/applicant.ts` lines 49-52). The Shadcn Slider component exists (`src/components/ui/slider.tsx`) and is already used on the /jobs page for salary and experience filtering (`src/components/jobs/JobList.tsx` lines 338-384). The profile preferences form (`src/components/onboarding/ProfilePreferencesForm.tsx`) and the onboarding form (`src/components/onboarding/ApplicantSection.tsx`) need to be extended.

**Steps:**
1. Add `expectedCompMin` (optional number, USD annual) and `yearsOfExperience` (optional number, 0-40) to `updatePreferencesSchema` in `src/lib/onboarding/profile-schemas.ts`
2. Add Slider components to `ProfilePreferencesForm.tsx`:
   - Expected compensation: Slider min=0, max=300000, step=5000, default=0 (display as "$X,000/yr")
   - Years of experience: Slider min=0, max=40, step=1, default=0 (display as "X years")
3. Add the same sliders to `ApplicantSection.tsx` for onboarding
4. Update `updateApplicantPreferencesAction` in `src/actions/profile.ts` to save these fields
5. Update `finalizeOnboardingAction` in `src/actions/onboarding.ts` to save these fields
6. User sets their values (expected_comp_min and years_of_experience) via the profile UI
7. Verify Gate 0.5 checks 4 and 5 now have data to evaluate against

**Success Criteria:**
- Profile preferences form has two new Slider controls for compensation and experience
- Saving the form persists the values to the `applicant` table
- The onboarding form also includes these sliders
- After the user sets their values, Gate 0.5 check 4 fires on jobs with compensation below 70% of the applicant's minimum
- After the user sets their values, Gate 0.5 check 5 fires on jobs where the applicant is significantly overqualified

### WORK ITEM 5: Verify and Monitor End-to-End

**Goal:** After all work items are complete, verify the full pipeline is producing quality matches and monitor for regressions.

**Steps:**
1. Run a full gate routing pass on all unrouted normalized jobs
2. Query the match_queue for approved matches and verify each one:
   - Is the job genuinely remote (not on-site in a foreign country)?
   - Does the job's tech stack overlap with the applicant's personas?
   - Is the job's location compatible with the applicant's country + compliance?
   - Is the `workAuthRiskFlag` set appropriately (true for ambiguous, false for explicit)?
3. Check the admin dashboard for:
   - Total active jobs (should be significantly higher after direct ingestion)
   - Active jobs by ats_source (should show new sources: nofluffjobs, justjoin, himalayas_direct, remoteok_direct)
   - Active jobs by remote_scope (should show more 'global' jobs)
   - Match queue approved count (should be higher than the current 1)
4. Monitor the Inngest dashboard for 24h:
   - Resurrection sweep completes successfully
   - Job Ingested handler failure rate is near zero
   - Direct job board ingestion function runs successfully
   - Batch poll functions are clearing the never-polled backlog

**Success Criteria:**
- At least 20 approved matches in the match queue (up from 1)
- At least 80% of approved matches are genuine remote/frontend jobs that the applicant could actually apply to
- Admin dashboard shows active job count increased by at least 3,000 (from direct ingestion + previously unpolled companies)
- Admin dashboard shows at least 5 ats_source values with active jobs
- No false positives (no on-site jobs in foreign countries, no hybrid jobs in foreign countries, no W-2-only jobs approved for international contractors)
- Inngest dashboard shows all functions completing successfully with no "step output size" or timeout errors

---

## Technical Constraints

- **Next.js 16.2** App Router, TypeScript strict mode, Tailwind CSS 4 (CSS-first `@theme`), Shadcn/ui 4
- **Drizzle ORM** for all DB operations (no raw SQL unless for vector/GIN queries)
- **Inngest v4** for all background jobs
- **Biome** for formatting (never ESLint/Prettier) — run `npx biome check --write` on all changed files
- **Vitest** for unit/integration tests, Playwright for E2E
- Never modify files under `src/components/ui/` (Shadcn generated)
- Never run git commands (the user handles version control)
- Never perform destructive DB operations without explicit user confirmation
- Use `gpt-4o-mini` for all LLM calls (Gate 3, normalization, remote scope extraction)
- Use `text-embedding-3-small` for job embeddings
- All new code must pass `npx tsc --noEmit` and `npx biome check --write`
- All new logic must have tests (Vitest unit tests for normalizers, adapters, and schema validation)

## Environment

- Database: Neon Postgres (project: cool-grass-94401149) — use the Neon MCP server for queries
- Deployment: Coolify (self-hosted) — the user deploys
- Inngest: self-hosted on Coolify
- OpenAI API key is in `.env`
- Brave Search API key is in `.env`
- `GATE2_MAX_COSINE_DISTANCE=0.50` is set in Coolify env vars

## Key Files

- Gate 3 prompt: `src/lib/jobs/gate-3.ts`
- Gate 0.5 pre-filter: `src/lib/jobs/gate-zero-pre-filter.ts`
- Remote scope extractor: `src/lib/jobs/remote-scope-extractor.ts`
- Job normalizer: `src/lib/jobs/job-normalizer.ts`
- Inngest functions: `src/inngest/functions.ts`
- Job schema: `src/db/schemas/jobs/job.ts`
- Company schema: `src/db/schemas/jobs/company.ts`
- Applicant schema: `src/db/schemas/jobs/applicant.ts`
- Match queue schema: `src/db/schemas/jobs/matchQueue.ts`
- Existing remote job board seeder: `src/lib/jobs/seeders/daily-sources/remote-job-boards.ts`
- Existing frontend job scanner: `src/lib/jobs/seeders/daily-sources/frontend-job-scanner.ts`
- Direct gate routing script: `scripts/direct-gate-routing.ts`
- Profile preferences form: `src/components/onboarding/ProfilePreferencesForm.tsx`
- Profile schemas: `src/lib/onboarding/profile-schemas.ts`
- Profile actions: `src/actions/profile.ts`
- Onboarding actions: `src/actions/onboarding.ts`
- Slider component: `src/components/ui/slider.tsx`
- Job list (Slider usage reference): `src/components/jobs/JobList.tsx`

## Rules

- Work through work items in order (1 → 2 → 3 → 4 → 5)
- Do not skip ahead — each work item builds on the previous
- After each work item, verify the success criteria before moving to the next
- If a work item reveals a new issue, add it as a sub-task and resolve it before continuing
- Use the Neon MCP server to query the database for verification (don't guess — verify)
- Use the todo_write tool to track progress across all work items
- Report back to the user with evidence (DB query results, Inngest dashboard screenshots, test results) after each work item
