
## Context

VectorMatch is a 3-gate job-matching SaaS (Next.js 16 + Drizzle + Neon Postgres + Inngest + Vercel AI SDK). The applicant is a Serbia-based remote developer with 3 personas: React/Next.js/TypeScript, Vue/JavaScript, PHP/Laravel.

The job corpus has 329 global-remote active jobs, but only 98 overlap with the applicant's frontend/legacy stack. A direct ingestion pipeline was built to ingest jobs from remote-first job boards with structured APIs, bypassing the ATS poller and LLM normalization entirely.

### What Was Already Built (Previous Session — DO NOT recreate)

The following files exist and are committed (uncommitted in working tree, not yet deployed):

**Infrastructure (complete and working):**
- `src/lib/jobs/direct-ingestion/types.ts` — `DirectIngestionJob` interface, `DirectFetchResult` union, `DirectBoardSource` type
- `src/lib/jobs/direct-ingestion/filter.ts` — `hasPersonaTechOverlap()` function with 50+ frontend/PHP/Laravel keywords and word-boundary matching for short keywords
- `src/lib/jobs/direct-ingestion/upsert.ts` — `upsertDirectJobs()` function that sets structured fields + `normalizedAt` + embeddings directly, uses `ON CONFLICT (atsSource, atsSlug, externalJobId)` for dedup
- `src/lib/jobs/direct-ingestion/himalayas.ts` — Himalayas adapter (paginated GET, 50/page, max 20 pages, 104K jobs available)
- `src/lib/jobs/direct-ingestion/remoteok.ts` — RemoteOK adapter (single GET, skips legal notice first element, strips HTML)
- `src/lib/jobs/direct-ingestion/__tests__/direct-ingestion.test.ts` — 23 unit tests (filter, Himalayas adapter, RemoteOK adapter)
- `src/inngest/functions.ts` — `directJobBoardIngestion` Inngest function (cron `0 5 * * *`, concurrency 1, fetches from Himalayas + RemoteOK, applies tech filter, upserts with embeddings)
- `src/app/api/inngest/route.ts` — `directJobBoardIngestion` registered in Inngest route handler
- `scripts/evaluate-job-boards.ts` — Evaluation script (reports API status + job counts)

**Other completed work items (also uncommitted, not yet deployed):**
- WI2: Backlog sweeper Inngest function (`pollBacklogSweeper` in functions.ts, `getNeverPolledBatch` in tier-queries.ts, 5 new tests in batch-poll.test.ts)
- WI4: Profile UI for `expectedCompMin` and `yearsOfExperience` (schemas, actions, UI components, 17 new tests)

### The Critical Miss: NoFluffJobs Works

The previous session reported NoFluffJobs as "HTTP 500 — broken" and skipped it. This was wrong. The agent tested `POST /api/search/posting` which requires specific payload fields. The correct endpoint is `GET /api/posting`, which returns **11,446 jobs** in a single response with full structured data.

**Verified API (July 7, 2026):**
```
GET https://nofluffjobs.com/api/posting
```

**Response structure:**
```json
{
  "postings": [...],       // Array of 11,446 job postings
  "totalCount": 11446,
  "pageUniqueCount": 11446,
  "totalUniqueCount": 11446,
  "overridenSalaryFilter": false
}
```

**Each posting has these fields (verified):**
```json
{
  "id": "senior-vue-js-engineer-n-ix-remote",
  "name": "N-iX",                          // Company name
  "title": "Senior Vue.js Engineer",
  "technology": "Vue.js",                  // Primary tech (React, PHP, JavaScript, etc.)
  "category": "frontend",                  // frontend, backend, fullstack, devops, etc.
  "seniority": ["Senior"],                 // Array: Junior, Mid, Senior, Expert
  "fullyRemote": false,                    // Top-level (unreliable — always false)
  "location": {
    "fullyRemote": true,                   // THIS is the correct remote field
    "places": [
      { "country": { "code": "POL", "name": "Poland" }, "city": "Warszawa" },
      { "country": { "code": "ESP", "name": "Spain" }, "city": "Madryt" }
    ],
    "hybridDesc": "wizyty w biurze 1x/msc"
  },
  "salary": {
    "from": 5880,
    "to": 6552,
    "type": "b2b",                         // b2b, uop, mandate
    "currency": "USD",                     // PLN, USD, EUR
    "disclosedAt": "VISIBLE"
  },
  "url": "senior-vue-js-engineer-n-ix-remote",
  "posted": 1782987345284,                 // Epoch milliseconds
  "renewed": 1783419345284,
  "tiles": {
    "values": [
      { "value": "frontend", "type": "category" },
      { "value": "Vue.js", "type": "requirement" },
      { "value": "Nuxt.js", "type": "requirement" },
      { "value": "C#", "type": "requirement" }
    ]
  },
  "flavors": ["it"],
  "onlineInterviewAvailable": true,
  "regions": [...]
}
```

**Verified job counts (July 7, 2026):**
- Total postings: 11,446
- Remote jobs (`location.fullyRemote === true`): 9,320 (81.4%)
- Frontend jobs: 287 — Remote frontend: 246 (85.7%)
- React jobs: 253 — Remote React: 221 (87.4%)
- PHP jobs: 82 — Remote PHP: 78 (95.1%)
- Fullstack jobs: 1,038 — Remote fullstack: 895 (86.3%)
- JavaScript jobs: 103

**CRITICAL: Use `location.fullyRemote` NOT `fullyRemote`.** The top-level `fullyRemote` field is always `false` (appears to be a deprecated/stale field). The correct remote indicator is `location.fullyRemote`.

**Example persona-relevant jobs found:**
- "Senior Vue.js Engineer" at N-iX — Vue.js, Nuxt.js, C#, $5,880-$6,552/mo USD, Senior, fully remote
- 245 more remote frontend jobs with structured tech tags, salary, and seniority

### Other Working Boards Not Yet Implemented

These boards were verified working on July 7, 2026:

**Arbeitnow** — `GET https://www.arbeitnow.com/api/job-board-api`
- Returns `{ data: [...], links, meta }` — paginated, 100/page
- Each job: `{ slug, company_name, title, description, remote, url, tags[], job_types[], location, created_at }`
- `remote` is a boolean, `tags` is a string array
- Europe-focused, complements NoFluffJobs for CEE/EU coverage

**Remotive** — `GET https://remotive.com/api/remote-jobs?limit=100`
- Returns `{ "0-legal-notice": ..., "job-count": N, jobs: [...] }`
- Each job: `{ id, url, title, company_name, category, tags[], job_type, publication_date, candidate_required_location, salary, description }`
- `tags` is a string array, `salary` is free text ("$50-$75 /hour")
- All jobs are remote by definition
- Smaller volume (~28 jobs with limit=3, more with higher limit) but clean structured data

**WeWorkRemotely** — `GET https://weworkremotely.com/remote-jobs.rss`
- RSS XML feed, ~100 items
- Company name is baked into title as "Company: Role" — split on first colon
- Has `<category>`, `<region>`, `<type>`, `<description>` fields
- No structured tech tags, but `category` field helps (Front-End Programming, Back-End Programming, Full-Stack Programming, DevOps, etc.)
- Well-established board, good for brand recognition

### Boards Confirmed Broken (Do NOT Implement)

- **JustJoin.it** — All endpoints (`/api/offers`, `/api/v1/offers`, `/api/graphql`) return 404. API has been deprecated or moved behind auth.
- **MeetFrank** — HTTP 403 (blocked)
- **Workbeam** — HTTP 503 (down)
- **IsItFair.pl** — HTTP 422 (requires specific params)

### RemoteOK Adapter Is Correct (No Fix Needed)

The previous session's RemoteOK adapter is correct. Tags are plain strings (not objects). The adapter correctly lowercases them and applies the tech filter. RemoteOK has 100 jobs with 7 frontend-relevant ones. The adapter works — it just has low yield due to RemoteOK's small current catalog.

### Schema Notes (Critical)

- `job.ats_source` is **plain `text`** (NOT a Postgres enum) — any string value works. Verified via `information_schema.columns`.
- `job.external_job_id` (text, NOT NULL) — reuse as the board's job ID
- `job.apply_url` (text, nullable) — reuse as the direct apply URL
- Unique index `job_unique_ats_job` on `(ats_source, ats_slug, external_job_id)` — serves as dedup constraint
- `company.ats_source` IS a Postgres enum — but direct ingestion does NOT create company records. Jobs are standalone.
- No schema migration needed for any new board adapter.

### Existing DirectIngestionJob Interface

```typescript
interface DirectIngestionJob {
  externalJobId: string;
  title: string;
  companyName: string | null;
  normalizedText: string;
  extractedTags: string[];
  applyUrl: string | null;
  locationName: string | null;
  workplaceType: "remote" | "hybrid" | "on-site" | null;
  employmentType: string | null;
  remoteScope: "global" | "country_fenced" | "region_fenced" | "unknown";
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  publishedAt: Date | null;
}
```

### Existing DirectBoardSource Type

```typescript
type DirectBoardSource = "himalayas_direct" | "remoteok_direct" | "nofluffjobs" | "justjoin";
```

Note: `"nofluffjobs"` is already in the type. New boards (arbeitnow, remotive, weworkremotely) need to be added.

### Existing Inngest Function Pattern

The `directJobBoardIngestion` function in `src/inngest/functions.ts` (line 1513) follows this pattern for each board:
1. `step.run("fetch-{board}", ...)` — call the adapter, return `{ success, jobs, error, totalAvailable }`
2. If success + jobs.length > 0: rebuild Date objects (step.run serialization), then `step.run("upsert-{board}", ...)` — call `upsertDirectJobs(source, slug, jobs, embedFn)`
3. Push result to `boardResults[]` array
4. After all boards: `step.run("write-log", ...)` — write ingestion log

The function currently has Himalayas (Board 1) and RemoteOK (Board 2) implemented. NoFluffJobs and JustJoin are skipped with a comment. New boards need to be added in the same pattern.

---

## Work Items

### WORK ITEM 1: Build NoFluffJobs Adapter (CRITICAL — Highest Impact)

**Goal:** Create `src/lib/jobs/direct-ingestion/nofluffjobs.ts` that fetches all 11,446 jobs from `GET https://nofluffjobs.com/api/posting` and transforms them into `DirectIngestionJob[]`.

**Implementation:**

1. Create `src/lib/jobs/direct-ingestion/nofluffjobs.ts` with a `fetchNoFluffJobs(maxJobs, techFilter, fetchFn)` function following the same pattern as `himalayas.ts` and `remoteok.ts`.

2. API call: `GET https://nofluffjobs.com/api/posting` — returns all 11,446 jobs in a single response (no pagination needed). Use `AbortSignal.timeout(60000)` since the response is large.

3. Response parsing:
   - Top-level: `{ postings: [...], totalCount, ... }`
   - Each posting has the structure documented above

4. Field mapping:
   - `externalJobId` ← `posting.id`
   - `title` ← `posting.title`
   - `companyName` ← `posting.name`
   - `normalizedText` ← Build from available fields: `${posting.title} at ${posting.name}. Technology: ${posting.technology}. Category: ${posting.category}. Seniority: ${(posting.seniority || []).join(', ')}. Required skills: ${posting.tiles?.values?.filter(v => v.type === 'requirement').map(v => v.value).join(', ')}.` (No full description available from the list endpoint — this is sufficient for embedding and Gate matching.)
   - `extractedTags` ← Combine: `[posting.technology?.toLowerCase(), ...posting.tiles?.values?.filter(v => v.type === 'requirement').map(v => v.value.toLowerCase())].filter(Boolean)` — dedupe
   - `applyUrl` ← `posting.url ? \`https://nofluffjobs.com/job/${posting.url}\` : null`
   - `locationName` ← `posting.location?.places?.map(p => \`${p.city}, ${p.country?.name}\`).join(' / ') || null`
   - `workplaceType` ← `posting.location?.fullyRemote ? 'remote' : 'hybrid'` (if not fully remote but has multiple locations, it's hybrid)
   - `employmentType` ← `posting.salary?.type` (b2b, uop, mandate) — map b2b→'contract', uop→'full-time', mandate→'contract'
   - `remoteScope` ← `'global'` if `location.fullyRemote` is true (NoFluffJobs remote jobs are typically open to CEE/EU), else `'country_fenced'`
   - `compensationMin` ← `posting.salary?.from` (convert to annual if monthly — NoFluffJobs salaries are monthly)
   - `compensationMax` ← `posting.salary?.to`
   - `compensationCurrency` ← `posting.salary?.currency?.toUpperCase()`
   - `experienceMinYears` ← Map seniority: Junior→0, Mid→3, Senior→5, Expert→8
   - `experienceMaxYears` ← Map seniority: Junior→2, Mid→5, Senior→8, Expert→15
   - `publishedAt` ← `new Date(posting.posted)` (epoch milliseconds)

5. Tech filter: Apply `techFilter` function to each job using `{ tags: extractedTags, title, description: normalizedText }`. Only keep jobs where `location.fullyRemote === true` AND the tech filter passes. This prevents ingesting 9,000+ non-frontend remote jobs.

6. Additional filter: Only ingest jobs where `location.fullyRemote === true` (skip hybrid/on-site — the applicant is remote-only).

7. maxJobs: Set to 1000 (we want all persona-relevant remote jobs, which is ~545 based on verified counts).

**Tests:** Add tests to `src/lib/jobs/direct-ingestion/__tests__/direct-ingestion.test.ts` following the existing pattern (mock fetch, test field mapping, test remote filter, test tech filter, test salary mapping, test seniority-to-years mapping).

### WORK ITEM 2: Add NoFluffJobs to Inngest Function

**Goal:** Wire the NoFluffJobs adapter into the `directJobBoardIngestion` function in `src/inngest/functions.ts`.

**Implementation:**

1. Add `const { fetchNoFluffJobs } = await import("@/lib/jobs/direct-ingestion/nofluffjobs");` to the imports section (around line 1559).

2. Add a "Board 3: NoFluffJobs" section after the RemoteOK section (around line 1693), following the exact same pattern:
   - `step.run("fetch-nofluffjobs", ...)` — call `fetchNoFluffJobs(1000, techFilter)`
   - If success + jobs.length > 0: rebuild Date objects, `step.run("upsert-nofluffjobs", ...)` — call `upsertDirectJobs("nofluffjobs", "nofluffjobs", jobsForUpsert, embedFn)`
   - Push to `boardResults[]`

3. Remove the comment "NoFluffJobs and JustJoin are skipped — APIs broken as of July 2026" (line 1694-1695) and replace with just "JustJoin is skipped — API broken as of July 2026 (404 on all endpoints)."

### WORK ITEM 3: Build Arbeitnow Adapter

**Goal:** Create `src/lib/jobs/direct-ingestion/arbeitnow.ts` for the Europe-focused job board.

**Implementation:**

1. Create `src/lib/jobs/direct-ingestion/arbeitnow.ts` with `fetchArbeitnowJobs(maxJobs, techFilter, fetchFn)`.

2. API: `GET https://www.arbeitnow.com/api/job-board-api` — returns `{ data: [...], links, meta }` with 100 jobs per page. Paginate via `links.next` URL or `meta.current_page + 1`.

3. Field mapping:
   - `externalJobId` ← `job.slug`
   - `title` ← `job.title`
   - `companyName` ← `job.company_name`
   - `normalizedText` ← `stripHtml(job.description)`
   - `extractedTags` ← `job.tags?.map(t => t.toLowerCase()) || []`
   - `applyUrl` ← `job.url`
   - `locationName` ← `job.location`
   - `workplaceType` ← `job.remote ? 'remote' : null`
   - `employmentType` ← `job.job_types?.[0] || null`
   - `remoteScope` ← `job.remote ? 'global' : 'unknown'`
   - `compensationMin/Max/Currency` ← null (Arbeitnow doesn't provide structured salary)
   - `experienceMinYears/MaxYears` ← null
   - `publishedAt` ← `new Date(job.created_at)`

4. Tech filter: Apply `techFilter` to each job. Only keep jobs where `job.remote === true` AND tech filter passes.

5. maxJobs: 500.

6. Add to `DirectBoardSource` type: `"arbeitnow"`.

7. Add to Inngest function as "Board 4: Arbeitnow" following the same pattern.

8. Add tests following the existing pattern.

### WORK ITEM 4: Build Remotive Adapter

**Goal:** Create `src/lib/jobs/direct-ingestion/remotive.ts`.

**Implementation:**

1. Create `src/lib/jobs/direct-ingestion/remotive.ts` with `fetchRemotiveJobs(maxJobs, techFilter, fetchFn)`.

2. API: `GET https://remotive.com/api/remote-jobs?limit=100` — returns `{ "0-legal-notice": ..., "job-count": N, jobs: [...] }`. All jobs are remote by definition.

3. Field mapping:
   - `externalJobId` ← `String(job.id)`
   - `title` ← `job.title`
   - `companyName` ← `job.company_name`
   - `normalizedText` ← `stripHtml(job.description)`
   - `extractedTags` ← `job.tags?.map(t => t.toLowerCase()) || []`
   - `applyUrl` ← `job.url`
   - `locationName` ← `job.candidate_required_location`
   - `workplaceType` ← `'remote'` (Remotive is remote-first)
   - `employmentType` ← `job.job_type`
   - `remoteScope` ← `'global'` (unless `candidate_required_location` specifies specific countries)
   - `compensationMin/Max/Currency` ← null (Remotive salary is free text, not structured)
   - `experienceMinYears/MaxYears` ← null
   - `publishedAt` ← `new Date(job.publication_date)`

4. Tech filter: Apply `techFilter` to each job.

5. maxJobs: 500.

6. Add to `DirectBoardSource` type: `"remotive"`.

7. Add to Inngest function as "Board 5: Remotive" following the same pattern.

8. Add tests following the existing pattern.

### WORK ITEM 5: Build WeWorkRemotely RSS Adapter

**Goal:** Create `src/lib/jobs/direct-ingestion/weworkremotely.ts` for the RSS feed.

**Implementation:**

1. Create `src/lib/jobs/direct-ingestion/weworkremotely.ts` with `fetchWeWorkRemotelyJobs(maxJobs, techFilter, fetchFn)`.

2. API: `GET https://weworkremotely.com/remote-jobs.rss` — returns RSS XML. Parse with a simple XML parser or regex (the feed is well-structured).

3. RSS item structure:
   ```xml
   <item>
     <title>Company Name: Job Title</title>
     <region>Anywhere in the World</region>
     <category>Front-End Programming</category>
     <type>Full-Time</type>
     <description>HTML content</description>
     <link>https://weworkremotely.com/job/...</link>
   </item>
   ```

4. Field mapping:
   - `externalJobId` ← extract from `<link>` URL (last path segment)
   - `title` ← split `<title>` on first `:`, take the part after (job title)
   - `companyName` ← split `<title>` on first `:`, take the part before (company name)
   - `normalizedText` ← `stripHtml(<description>)`
   - `extractedTags` ← derive from `<category>`: map "Front-End Programming"→["frontend"], "Full-Stack Programming"→["frontend","backend"], "Back-End Programming"→["backend"], etc. Also scan description for tech keywords.
   - `applyUrl` ← `<link>`
   - `locationName` ← `<region>`
   - `workplaceType` ← `'remote'` (WWR is remote-first)
   - `employmentType` ← `<type>` (Full-Time, Part-Time, Contract)
   - `remoteScope` ← `'global'` if `<region>` contains "Anywhere" or "World", else `'country_fenced'`
   - `compensationMin/Max/Currency` ← null
   - `experienceMinYears/MaxYears` ← null
   - `publishedAt` ← null (WWR RSS doesn't always include pubDate)

5. Tech filter: Apply `techFilter` using the derived tags + title + description.

6. maxJobs: 200.

7. Add to `DirectBoardSource` type: `"weworkremotely"`.

8. Add to Inngest function as "Board 6: WeWorkRemotely" following the same pattern.

9. Add tests following the existing pattern. Mock the RSS response as a string.

### WORK ITEM 6: Update Evaluation Script

**Goal:** Update `scripts/evaluate-job-boards.ts` to reflect the correct NoFluffJobs endpoint and include the new boards.

**Implementation:**

1. Fix the NoFluffJobs test to use `GET https://nofluffjobs.com/api/posting` instead of `POST /api/search/posting`.
2. Add tests for Arbeitnow, Remotive, WeWorkRemotely.
3. Add frontend/PHP/Laravel job counting for each board.
4. Run the script and verify all 5 boards return jobs.

### WORK ITEM 7: Final Verification

**Goal:** Verify all code passes typecheck, tests, and biome.

**Steps:**
1. Run `npx tsc --noEmit` — must pass with 0 errors
2. Run `npx biome check --write` on all new and modified files
3. Run `npx vitest run src/lib/jobs/direct-ingestion/` — all tests must pass
4. Run the evaluation script: `npx tsx scripts/evaluate-job-boards.ts` — verify all 5 boards report jobs
5. Verify the Inngest function has 6 boards wired (Himalayas, RemoteOK, NoFluffJobs, Arbeitnow, Remotive, WeWorkRemotely)

**Success Criteria:**
- NoFluffJobs adapter correctly maps `location.fullyRemote` (NOT top-level `fullyRemote`) to workplaceType
- NoFluffJobs adapter extracts tech requirements from `tiles.values` where `type === 'requirement'`
- NoFluffJobs adapter maps salary (converting monthly to annual where needed)
- NoFluffJobs adapter maps seniority to experience year ranges
- All 5 new adapters have tests with mocked fetch
- All tests pass
- Typecheck passes
- Biome passes
- Inngest function has all 6 boards wired
- Evaluation script reports actual job counts for all 6 boards

---

## Technical Constraints

- **Next.js 16.2** App Router, TypeScript strict mode, Tailwind CSS 4, Shadcn/ui 4
- **Drizzle ORM** for all DB operations
- **Inngest v4** for background jobs
- **Biome** for formatting (never ESLint/Prettier) — run `npx biome check --write`
- **Vitest** for unit tests
- Never modify files under `src/components/ui/` (Shadcn generated)
- Never run git commands (the user handles version control)
- Never perform destructive DB operations without explicit user confirmation
- Use `gpt-4o-mini` for LLM, `text-embedding-3-small` for embeddings
- All new code must pass `npx tsc --noEmit` and `npx biome check --write`

## Key Files (Read These Before Starting)

- **DirectIngestionJob interface:** `src/lib/jobs/direct-ingestion/types.ts`
- **Tech filter:** `src/lib/jobs/direct-ingestion/filter.ts` — `hasPersonaTechOverlap(tags, title, description)`
- **Upsert function:** `src/lib/jobs/direct-ingestion/upsert.ts` — `upsertDirectJobs(source, slug, jobs, embedFn)`
- **Himalayas adapter (reference pattern):** `src/lib/jobs/direct-ingestion/himalayas.ts`
- **RemoteOK adapter (reference pattern):** `src/lib/jobs/direct-ingestion/remoteok.ts`
- **Existing tests (reference pattern):** `src/lib/jobs/direct-ingestion/__tests__/direct-ingestion.test.ts`
- **Inngest function:** `src/inngest/functions.ts` — `directJobBoardIngestion` at line 1513
- **Inngest route:** `src/app/api/inngest/route.ts`
- **Evaluation script:** `scripts/evaluate-job-boards.ts`
- **Job schema:** `src/db/schemas/jobs/job.ts` — note `ats_source` is `text` (not enum), `external_job_id` and `apply_url` already exist

## Rules

- Read the existing adapter files (himalayas.ts, remoteok.ts) before writing new adapters — follow the same pattern
- Read the existing test file before writing new tests — follow the same pattern
- Use the Neon MCP server to verify database state if needed
- Use the todo_write tool to track progress across all work items
- Work through work items in order (1 → 7)
- For NoFluffJobs: use `location.fullyRemote` NOT `fullyRemote` — this is critical
- For NoFluffJobs: the API returns all 11,446 jobs in one response (no pagination)
- For NoFluffJobs: filter to only `location.fullyRemote === true` jobs before applying tech filter
- For WeWorkRemotely: parse RSS XML (no JSON API available)
- For salary mapping: NoFluffJobs salaries are monthly — multiply by 12 for annual
- Report back with evidence (test results, evaluation script output) after all work items
