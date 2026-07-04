# Gate 0.5 Geo-Fencing Hard Blocker — Implementation Handoff

**Date:** July 2026
**Status:** Ready for implementation
**Priority:** CRITICAL — systemic false positives in production matching pipeline

---

## 1. Executive Summary

The VectorMatch job matching pipeline has a critical gap: it lacks a hard-blocker
pre-filter between normalization and Gate 1+2 routing. This allows ineligible jobs
(geo-fenced to regions excluding the applicant, on-site in foreign countries, or
with compensation tiers priced for other markets) to pass through the entire 3-gate
funnel and rank at the top of the approved dashboard.

Three real production jobs were identified that should have been hard-rejected but
instead ranked in the top 3 of the user's approved matches. Analysis revealed
**three distinct geo-fencing patterns** that the current system cannot detect.

A parallel calibration session (see `docs/reports/matching-score-calibration-session.md`)
confirmed that the display score's 8% location weight is insufficient to suppress
these false positives — scoring cannot fix hard blockers. The calibration session
also identified "experience gap" and "location refinement" as its top two next-step
priorities, which this implementation directly addresses.

**The fix**: Insert a new **Gate 0.5** hard-blocker pre-filter that runs after
normalization succeeds but before Gate 1+2 routing. Jobs that fail Gate 0.5 are
tombstoned with `status='rejected'` and never enter the matching pipeline.

---

## 2. The Three Geo-Fencing Patterns (with Real Examples)

### Pattern 1: Title-Based Region Tags

**Example**: Reacher — "Software Engineer - Latam" (Job ID: `bd4d00a8-d5e0-405e-93b8-a0a3b6793f0d`)
- ATS: Ashby
- Location field: "Remote" (generic, misleading)
- Real geo-fence: Hidden in the job **title** suffix "- Latam"
- Compensation: $60K–$85K (priced for LatAm market)
- Experience band: 2–6 years with "senior ownership expected" (inverted band)

**Detection**: Parse job title for region suffixes: `- Latam`, `- APAC`, `- EMEA`,
`- Balkans`, `- India`, `- US Only`, `- Canada Only`, etc.

### Pattern 2: Location Field Country Lists

**Example**: Hire Hangar — "Senior Frontend Engineer" (Job ID: `dd202a53-bf62-4140-a452-8aa9f7188d36`)
- ATS: Ashby
- Location field: Lists specific countries (Mexico, Argentina, Colombia, Guatemala,
  Honduras, India, Nicaragua, Paraguay, Peru, South Africa)
- Serbia is not on the list
- Compensation: $1.5K–$3K/month (priced for lower-cost-of-living regions)

**Detection**: Parse `locationName` for comma-separated country lists or structured
`locationCountries` array from ATS API. Check if applicant's country is included.

### Pattern 3: No Remote Designation = On-Site by Default

**Example**: CloudSEK — "SDE 2 - Fullstack" (Job ID: `b4e6022a-868e-4dfc-b2d0-4cfb6b537dd1`)
- ATS: Greenhouse
- Location: "Bengaluru, Karnataka, India"
- Workplace type: No remote/hybrid/on-site designation anywhere in the post
- Current system: Defaults `workplaceType` to `null` (treated as neutral)
- Reality: This is an on-site India role

**Detection**: When `workplaceType` is `null` but `locationName` is non-empty and
does not contain the applicant's country, default to on-site and reject if applicant
is not in that location.

---

## 3. Current Architecture & Integration Point

### Current Pipeline Flow

```
Gate 0 (title filter — gate-zero.ts)
  → Normalization (job-normalizer.ts) — extract tags, embedding, metadata
  → Gate 1+2 SQL Router (gate-1-2.ts) — GIN overlap + HNSW cosine distance
  → Gate 3 LLM Arbiter (gate-3.ts) — gpt-4o-mini yes/no evaluation
  → Display Score (dashboard-queries.ts) — calibrated 0–100 ranking
```

### Required Pipeline Flow (After This Implementation)

```
Gate 0 (title filter — gate-zero.ts)
  → Normalization (job-normalizer.ts) — extract tags, embedding, metadata
  → Gate 0.5 (gate-zero-pre-filter.ts) ← NEW: hard blocker pre-filter
  → Gate 1+2 SQL Router (gate-1-2.ts) — GIN overlap + HNSW cosine distance
  → Gate 3 LLM Arbiter (gate-3.ts) — gpt-4o-mini yes/no evaluation
  → Display Score (dashboard-queries.ts) — calibrated 0–100 ranking (unchanged)
```

### Exact Integration Point in Code

The `jobIngestedHandler` in `src/inngest/functions.ts` (line 1221) is the Inngest
function that orchestrates the full pipeline. The current flow within this handler:

1. **Step 1** (`fetch-job`, line 1239): Fetch job + idempotency decision
2. **Step 2** (`normalize`, line 1288): Run normalizer (tags + LLM fallback)
3. **Step 3** (`embed`, line 1302): Generate embedding (only if normalized)
4. **Step 4** (`write-normalization`, line 1312): Write results to DB
5. **Step 5** (`gate-1-2-router`, line 1394): Run Gate 1+2 SQL router
6. **Step 6** (`fan-out-gate-3`, line 1416): Emit Gate 3 evaluation events

**Gate 0.5 must be inserted as a new step between Step 4 (write-normalization) and
Step 5 (gate-1-2-router)**, at approximately line 1389 (after the
`if (normalization.status !== "normalized")` early return).

The Gate 0.5 step should:
1. Fetch the applicant(s) for this job (the job hasn't been routed to personas yet,
   so we need to check against ALL applicants — in the current single-user setup
   this is one applicant, but the design must be applicant-aware)
2. Run the hard-blocker checks
3. If any blocker fires, update the job to `status='rejected'` with the rejection
   reason and return early (skip Gate 1+2)

**Important architectural note**: Gate 0.5 is a **job-level** filter, not a
job-persona-pair filter. It checks whether the job is fundamentally eligible for
the applicant(s) regardless of persona. This is correct because location,
compensation, and experience requirements are applicant-level constraints, not
persona-level. A job in Bengaluru is ineligible for a Serbia-based applicant
regardless of which persona we're evaluating.

---

## 4. Files to Create

### 4.1 `src/lib/jobs/gate-zero-pre-filter.ts` (NEW — main implementation)

This is the core new file. It must be:
- **Pure logic** (no DB access, no side effects) — like `gate-zero.ts`
- **Server-only** (`import "server-only"`) — it reads applicant data
- **Fully unit-testable** with mock inputs — like the existing gate tests

The function signature:

```typescript
export interface PreFilterInput {
  job: {
    title: string;
    locationName: string | null;
    workplaceType: "remote" | "hybrid" | "on-site" | null;
    normalizedText: string | null;
    // New fields (may be null for legacy jobs — see §6 Backward Compatibility)
    titleRegionTag: string | null;
    locationCountries: string[] | null;
    experienceMinYears: number | null;
    experienceMaxYears: number | null;
    compensationMin: number | null;
    compensationMax: number | null;
    compensationCurrency: string | null;
  };
  applicant: {
    country: string | null;       // ISO 3166-1 alpha-2
    assignmentTypes: string[];    // "remote", "hybrid", "on-site", etc.
    preferredCompliance: string[]; // "w8ben", "ic_global", etc.
    // New fields (may be null if not yet captured — see §7 Onboarding)
    expectedCompMin: number | null;  // Annual USD
    yearsOfExperience: number | null;
  };
}

export interface PreFilterResult {
  passes: boolean;
  blockers: string[];
  rejectionReason: string | null;
  patternDetected: string | null;
}

export function runHardBlockerPreFilter(input: PreFilterInput): PreFilterResult;
```

**Detection logic (in priority order)**:

#### Check 1: Title Region Tags (Pattern 1)

Parse the job title for region suffixes. If found, check if the region is
applicant-friendly. The applicant-friendly regions should be configurable but
for now hardcoded based on `applicant.country`:

- Applicant in Serbia (`RS`): Friendly = EMEA, Europe, EU, Balkans, Eastern Europe,
  Global, Worldwide, Remote
- Applicant in US (`US`): Friendly = United States, North America, Global,
  Worldwide, Remote
- (Extend for other countries as needed)

Region tag patterns to detect (case-insensitive):
- `/\b-?\s*(?:Latam|LatAm|Latin\s*America)\b/i`
- `/\b-?\s*(?:APAC|Asia[- ]?Pacific)\b/i`
- `/\b-?\s*(?:EMEA|Europe[- ]?Middle[- ]?East[- ]?Africa)\b/i`
- `/\b-?\s*(?:Balkans|Eastern\s*Europe)\b/i`
- `/\b-?\s*(?:US[- ]?Only|United\s*States[- ]?Only)\b/i`
- `/\b-?\s*(?:Canada[- ]?Only)\b/i`
- `/\b-?\s*(?:India)\b/i` (when used as a suffix, e.g., "Software Engineer - India")

**Important**: Only treat as a region tag when it appears as a **suffix** (after a
dash or at the end of the title). "India Engineer" as a prefix is not a region tag,
but "Software Engineer - India" is. Use the dash-separator pattern to avoid false
positives.

#### Check 2: Location Country Lists (Pattern 2)

If `locationCountries` array is available (from structured ATS data), check if
the applicant's country is in the list. If not available, attempt to parse
`locationName` for a comma-separated list of countries (3+ items suggests a
country list, not a city).

**Important**: This check only applies when `workplaceType` is `remote` or when
the location name contains "remote" (case-insensitive). A non-remote job with a
single city location is handled by Check 3.

#### Check 3: No Remote Designation = On-Site Default (Pattern 3)

If `workplaceType` is `null` AND `locationName` is non-empty:
1. If `locationName` contains the applicant's country → pass (on-site in their country)
2. If `locationName` does NOT contain the applicant's country → **hard block**
   (the job is on-site in a foreign country)

If `workplaceType` is explicitly `'on-site'`:
1. If `locationName` contains the applicant's country → pass
2. Otherwise → **hard block**

If `workplaceType` is `'remote'` or `'hybrid'` → skip this check (handled by
Check 2 for country lists, or passed through to Gate 3 for nuanced evaluation).

#### Check 4: Compensation Tier (if data available)

If `compensationMax` is available AND `applicant.expectedCompMin` is available:
- Normalize to annual USD (if `compensationMax < 1000` and currency is USD, it's
  likely monthly — multiply by 12)
- If `normalizedMax < applicant.expectedCompMin * 0.7` → **hard block**

**Important**: This check only fires when BOTH values are available. For legacy
jobs or applicants who haven't set compensation preferences, this check is skipped.
This is a soft-fail-open design — we don't want to block jobs just because we
don't have compensation data.

#### Check 5: Experience Band (if data available)

If `experienceMaxYears` is available AND `applicant.yearsOfExperience` is available:
- If applicant's years > `experienceMaxYears + 5` → **hard block** (overqualified)
- If `experienceMaxYears < 7` AND applicant's years > 10 AND the title/description
  contains "senior", "SDE 2", "SDE II" → **hard block** (inverted band)

**Important**: Same soft-fail-open design as Check 4.

#### Return Value

If any check fires, return `{ passes: false, blockers: [...], rejectionReason: "...", patternDetected: "..." }`.
If no checks fire, return `{ passes: true, blockers: [], rejectionReason: null, patternDetected: null }`.

---

## 5. Files to Modify

### 5.1 `src/lib/jobs/job-normalizer.ts` — Fix Workplace Type Default

**Critical fix in `extractGreenhouseMetadata()` (around line 538-593)**:

Currently, when no remote/hybrid/on-site keywords are found in the location name
or content, `workplaceType` defaults to `null`. This is wrong — it should default
to `'on-site'` when a `locationName` exists.

**Current behavior** (simplified):
```typescript
let workplaceType = null;
if (locationName) {
  if (/hybrid/i.test(locationName)) workplaceType = "hybrid";
  else if (/remote/i.test(locationName)) workplaceType = "remote";
  else if (/on-?site|in-?office/i.test(locationName)) workplaceType = "on-site";
  // else: stays null ← WRONG
}
// content fallback...
// if still null: stays null ← WRONG
```

**Required behavior**:
```typescript
// After all detection attempts (location + content fallback):
if (workplaceType === null && locationName && locationName.length > 0) {
  workplaceType = "on-site"; // Pattern 3 fix: no remote designation = on-site
}
// Only null if we truly have no location info at all
```

**Important**: This change affects ALL Greenhouse jobs. After this change, any
Greenhouse job with a location name but no remote/hybrid keywords will be
classified as on-site. This is correct behavior — if a job doesn't say it's
remote, it isn't.

**Also apply the same fix to `extractAshbyMetadata()` and `extractLeverMetadata()`**
if they have the same null-default pattern. Check each function's current logic
before modifying — Ashby and Lever have structured `workplaceType` fields from
the API, so they may not need this fix. Only Greenhouse (which has no structured
field and relies on heuristics) definitely needs it.

### 5.2 `src/lib/jobs/job-normalizer.ts` — Enhanced Metadata Extraction

Add extraction of new fields to `extractJobMetadata()` and the per-ATS functions:

1. **`titleRegionTag`**: Parse the job title for region suffixes (same patterns as
   Gate 0.5 Check 1). Store the matched tag string or null.

2. **`locationCountries`**: For Ashby, check if the raw JSON has a structured
   location object with a countries array. The Ashby Public API may provide this
   in some payloads. For other ATS sources, this will typically be null (we rely
   on `locationName` parsing in Gate 0.5 as a fallback).

3. **`experienceMinYears` / `experienceMaxYears`**: Parse from the job description
   text. Patterns to match:
   - `(\d+)\+?\s*years?\s*(?:of\s*experience)?` → min only
   - `(\d+)\s*[-–]\s*(\d+)\s*years?` → min and max
   - `(?:minimum|min)\s*(\d+)\s*years?` → min only
   Run this on the cleaned `fullText` (title + description) during normalization.

4. **`compensationMin` / `compensationMax` / `compensationCurrency`**:
   - Ashby: The endpoint already requests `includeCompensation=true` (see
     `src/lib/jobs/ats-endpoints.ts` line 90). Check the raw JSON for a
     `compensation` object with `min`, `max`, `currency` fields.
   - Lever: The schema already includes `salaryRange` (see
     `src/lib/jobs/ats-schemas.ts` line 107). Extract from there.
   - Greenhouse: No compensation data available in the public API. Leave null.

**Update the `JobMetadata` type** (around line 434) to include the new fields.

**Update the `empty` metadata object** (around line 485) to include null defaults
for the new fields.

### 5.3 `src/db/schemas/jobs/job.ts` — Add New Columns

Add to the `job` table definition:

```typescript
titleRegionTag: text("title_region_tag"),
locationCountries: text("location_countries").array(),
experienceMinYears: integer("experience_min_years"),
experienceMaxYears: integer("experience_max_years"),
compensationMin: numeric("compensation_min"),
compensationMax: numeric("compensation_max"),
compensationCurrency: text("compensation_currency"),
rejectionPattern: text("rejection_pattern"), // Tracks which Gate 0.5 pattern fired
```

Add indexes:
```typescript
titleRegionTagIdx: index("job_title_region_tag_idx").on(table.titleRegionTag),
```

**Important**: Use `integer()` not `int()` — Drizzle's PostgreSQL builder uses
`integer`. For `numeric`, import from `drizzle-orm/pg-core`. The existing imports
in `job.ts` are: `index, pgTable, text, timestamp, uniqueIndex, uuid, vector` —
you'll need to add `integer` and `numeric` to the imports.

### 5.4 `src/db/schemas/jobs/applicant.ts` — Add New Columns

Add to the `applicant` table definition:

```typescript
expectedCompMin: numeric("expected_comp_min"),  // Annual USD
yearsOfExperience: integer("years_of_experience"),
```

Import `integer` and `numeric` from `drizzle-orm/pg-core` (currently imports
`boolean, pgTable, text, timestamp`).

### 5.5 `src/inngest/functions.ts` — Insert Gate 0.5 Step

In `jobIngestedHandler` (line 1221), insert a new step between the
`write-normalization` step (line 1312) and the `gate-1-2-router` step (line 1394).

The new step should be inserted after the early return at line 1388
(`if (normalization.status !== "normalized")`) and before the Gate 1+2 router call.

```typescript
// ── Step 4.5: Gate 0.5 hard-blocker pre-filter ─────────────────────────
// Runs after normalization succeeds but before Gate 1+2 routing. Checks
// for hard blockers (geo-fencing, compensation tier, experience band)
// that make the job fundamentally ineligible regardless of tech match.
// Jobs that fail are tombstoned and never enter the matching pipeline.
const preFilterResult = await step.run("gate-0-5-pre-filter", async () => {
  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");
  const { applicant } = await import("@/db/schemas/jobs/applicant");
  const { eq } = await import("drizzle-orm");
  const { runHardBlockerPreFilter } = await import(
    "@/lib/jobs/gate-zero-pre-filter"
  );

  // Fetch the job with new metadata fields
  const jobRows = await db
    .select({
      id: job.id,
      title: job.title,
      locationName: job.locationName,
      workplaceType: job.workplaceType,
      normalizedText: job.normalizedText,
      titleRegionTag: job.titleRegionTag,
      locationCountries: job.locationCountries,
      experienceMinYears: job.experienceMinYears,
      experienceMaxYears: job.experienceMaxYears,
      compensationMin: job.compensationMin,
      compensationMax: job.compensationMax,
      compensationCurrency: job.compensationCurrency,
    })
    .from(job)
    .where(eq(job.id, jobId))
    .limit(1);

  if (jobRows.length === 0) {
    return { passes: true, blockers: [] }; // Defensive: shouldn't happen
  }

  // Fetch ALL applicants (Gate 0.5 is job-level, not persona-level).
  // In the current single-user setup this returns one row, but the design
  // must handle multiple applicants for future multi-tenant use.
  const applicants = await db
    .select({
      country: applicant.country,
      assignmentTypes: applicant.assignmentTypes,
      preferredCompliance: applicant.preferredCompliance,
      expectedCompMin: applicant.expectedCompMin,
      yearsOfExperience: applicant.yearsOfExperience,
    })
    .from(applicant);

  if (applicants.length === 0) {
    return { passes: true, blockers: [] }; // No applicants yet — let Gates 1+2 handle it
  }

  const jobRow = jobRows[0];

  // Check against ALL applicants. The job passes Gate 0.5 only if it passes
  // for at least one applicant. If it fails for all, it's tombstoned.
  // (In single-user setup: one applicant, one check.)
  for (const app of applicants) {
    const result = runHardBlockerPreFilter({
      job: {
        title: jobRow.title,
        locationName: jobRow.locationName,
        workplaceType: jobRow.workplaceType as "remote" | "hybrid" | "on-site" | null,
        normalizedText: jobRow.normalizedText,
        titleRegionTag: jobRow.titleRegionTag,
        locationCountries: jobRow.locationCountries,
        experienceMinYears: jobRow.experienceMinYears,
        experienceMaxYears: jobRow.experienceMaxYears,
        compensationMin: jobRow.compensationMin,
        compensationMax: jobRow.compensationMax,
        compensationCurrency: jobRow.compensationCurrency,
      },
      applicant: {
        country: app.country,
        assignmentTypes: app.assignmentTypes ?? [],
        preferredCompliance: app.preferredCompliance ?? [],
        expectedCompMin: app.expectedCompMin,
        yearsOfExperience: app.yearsOfExperience,
      },
    });

    if (result.passes) {
      // At least one applicant is eligible — let the job through
      return { passes: true, blockers: [] };
    }
  }

  // All applicants failed — tombstone the job
  const firstResult = runHardBlockerPreFilter({
    job: { /* same as above */ },
    applicant: { /* first applicant */ },
  });

  await db
    .update(job)
    .set({
      status: "rejected",
      rejectionPattern: firstResult.patternDetected,
      normalizedAt: new Date(), // Terminal state
    })
    .where(eq(job.id, jobId));

  return {
    passes: false,
    blockers: firstResult.blockers,
    patternDetected: firstResult.patternDetected,
  };
});

if (!preFilterResult.passes) {
  console.log(
    `[jobIngestedHandler] Gate 0.5 rejected job ${jobId}: ` +
    `${preFilterResult.patternDetected} — ${preFilterResult.blockers.join("; ")}`
  );
  return {
    jobId,
    normalizationStatus: "normalized",
    gate05Rejected: true,
    pattern: preFilterResult.patternDetected,
    blockers: preFilterResult.blockers,
    queued: 0,
  };
}
```

**Important notes for the implementing agent**:
- The `runHardBlockerPreFilter` function is called twice in the snippet above
  (once in the loop, once after). In the actual implementation, refactor to call
  it once per applicant and store results. The snippet is illustrative.
- The `job.workplaceType` column is an enum (`workplaceTypeEnum`). The Drizzle
  select will return the enum value. Cast appropriately for TypeScript.
- `compensationMin` and `compensationMax` are `numeric` columns — Drizzle returns
  these as strings. Parse to numbers with `Number()` or `parseFloat()` before
  passing to `runHardBlockerPreFilter`.
- `locationCountries` is a `text[]` column — Drizzle returns this as `string[] | null`.

### 5.6 Database Migration

After modifying the schema files, generate and apply the migration:

```bash
npm run db:generate  # Generates SQL migration files in src/db/migrations/
npm run db:migrate   # Applies migrations to the database
```

**Important**: The `db:push` script runs both. Do NOT use `db:push` if you want
to review the generated SQL first. Use `db:generate` then review the SQL in
`src/db/migrations/`, then `db:migrate`.

The migration will be numbered `0039_*.sql` (next in sequence after `0038`).

---

## 6. Backward Compatibility

### Existing Jobs in Database

The new columns (`titleRegionTag`, `locationCountries`, `experienceMinYears`,
`experienceMaxYears`, `compensationMin`, `compensationMax`, `compensationCurrency`,
`rejectionPattern`) will be `NULL` for all existing jobs. This is fine because:

1. **Gate 0.5 checks are soft-fail-open for missing data**: If `locationCountries`
   is null, Check 2 falls back to `locationName` parsing. If `compensationMax` is
   null, Check 4 is skipped. If `experienceMaxYears` is null, Check 5 is skipped.

2. **The workplace type fix (§5.1) is the only check that affects existing jobs**:
   After the fix, Greenhouse jobs with a location name but null workplaceType will
   be reclassified as on-site. This is correct — but it means existing approved
   matches may need re-evaluation.

### Re-evaluation of Existing Approved Matches

After deploying Gate 0.5, the 28 currently approved matches should be reviewed.
Some may now be caught by the workplace type fix (Pattern 3) or the title region
tag check (Pattern 1).

**Recommended approach**: Do NOT automatically re-evaluate all existing matches.
Instead:
1. Deploy Gate 0.5 (affects only NEW jobs going through the pipeline)
2. Run a one-time analysis script to check existing approved matches against
   Gate 0.5 logic and flag any that would now be blocked
3. Let the user manually decide whether to dismiss those matches

**Do NOT write a script that automatically rejects existing approved matches.**
The user should review and dismiss them manually via the dashboard.

### Existing Applicant Profile

The new applicant columns (`expectedCompMin`, `yearsOfExperience`) will be `NULL`
for the existing user. This means Checks 4 and 5 will be skipped for all jobs
until the user fills in these fields via onboarding/profile management.

**This is intentional** — we don't want to block jobs based on compensation or
experience until the user has explicitly set their preferences. The geo-fencing
checks (1, 2, 3) work without any new applicant data because they only need
`country` and `assignmentTypes`, which are already captured.

---

## 7. Onboarding / Profile Enhancement (Phase 5 — Lower Priority)

The applicant profile needs two new fields to enable Checks 4 and 5:

1. **`expectedCompMin`**: Minimum acceptable annual compensation in USD
2. **`yearsOfExperience`**: Total years of professional experience

These should be added to the onboarding flow and the profile management page.

**This is Phase 5 (lower priority)** — the geo-fencing fix (Checks 1-3) works
without these fields and addresses the immediate crisis. The compensation and
experience checks are enhancements that become active once the user fills in
the new profile fields.

**Do not block the Gate 0.5 implementation on the onboarding changes.** Implement
Gate 0.5 with all five checks, but Checks 4 and 5 will be no-ops until the
applicant profile is updated. The onboarding changes can be done in a follow-up.

---

## 8. Testing Requirements

### Unit Tests (Vitest)

**Create**: `src/lib/jobs/__tests__/gate-zero-pre-filter.test.ts`

Test each pattern with the real job examples:

```typescript
describe("Gate 0.5 — Pattern 1: Title region tags", () => {
  it("rejects 'Software Engineer - Latam' for Serbia applicant", () => {
    const result = runHardBlockerPreFilter({
      job: {
        title: "Software Engineer - Latam",
        locationName: "Remote",
        workplaceType: "remote",
        // ... other fields null
      },
      applicant: {
        country: "RS",
        assignmentTypes: ["remote"],
        // ... other fields null
      },
    });
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("title_region_tag");
    expect(result.blockers[0]).toContain("Latam");
  });

  it("passes 'Software Engineer - EMEA' for Serbia applicant", () => {
    // EMEA includes Europe, so Serbia is friendly
  });

  it("does not treat 'India Engineer' (prefix) as a region tag", () => {
    // Only suffix patterns count
  });
});

describe("Gate 0.5 — Pattern 2: Location country lists", () => {
  it("rejects job with country list excluding applicant", () => {
    const result = runHardBlockerPreFilter({
      job: {
        title: "Senior Frontend Engineer",
        locationName: "Remote",
        workplaceType: "remote",
        locationCountries: ["Mexico", "Argentina", "Colombia", "India"],
        // ...
      },
      applicant: { country: "RS", assignmentTypes: ["remote"], ... },
    });
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("location_country_list");
  });

  it("passes job with country list including applicant", () => {
    // locationCountries includes "Serbia" or "RS"
  });
});

describe("Gate 0.5 — Pattern 3: No remote designation", () => {
  it("rejects on-site job in foreign country with null workplaceType", () => {
    const result = runHardBlockerPreFilter({
      job: {
        title: "SDE 2 - Fullstack",
        locationName: "Bengaluru, Karnataka, India",
        workplaceType: null, // No designation
        // ...
      },
      applicant: { country: "RS", assignmentTypes: ["remote"], ... },
    });
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("default_on_site");
  });

  it("passes on-site job in applicant's country", () => {
    // locationName contains "Serbia" and applicant country is "RS"
  });

  it("passes remote job with null workplaceType and no location", () => {
    // Truly unknown — let Gate 3 handle it
  });
});

describe("Gate 0.5 — Compensation check", () => {
  it("rejects job with compensation below threshold", () => {
    // compensationMax = 36000, expectedCompMin = 60000
  });

  it("skips check when compensation data is missing", () => {
    // compensationMax = null → should pass
  });

  it("normalizes monthly compensation to annual", () => {
    // compensationMax = 3000, currency = USD → treated as 36000 annual
  });
});

describe("Gate 0.5 — Experience band check", () => {
  it("rejects overqualified applicant", () => {
    // experienceMaxYears = 6, yearsOfExperience = 15
  });

  it("detects inverted experience band", () => {
    // experienceMaxYears = 6, title contains "SDE 2", yearsOfExperience = 15
  });

  it("skips check when experience data is missing", () => {
    // experienceMaxYears = null → should pass
  });
});
```

### Normalizer Tests

**Update**: `src/lib/jobs/__tests__/job-normalizer.test.ts`

Add tests for:
1. The workplace type default fix (Pattern 3) — verify Greenhouse jobs with
   location but no remote keywords now return `'on-site'` instead of `null`
2. New metadata extraction (titleRegionTag, experienceMinYears, etc.)

### Integration Tests

**Update or create**: Tests in `src/lib/jobs/__tests__/` that verify the
`jobIngestedHandler` correctly calls Gate 0.5 and tombstones rejected jobs.

**Important**: Per AGENTS.md rules, do NOT write tests that mutate the production
database. Mock the database layer or use the existing test patterns in the
`__tests__/` directory.

### What NOT to Test

Per AGENTS.md testing rules:
- Do NOT write E2E tests for this — it's backend logic, not a user journey
- Do NOT write tests for the UI/styling changes (if any)
- Do NOT write tests that mutate the shared database

---

## 9. Calibration Report Integration

A parallel calibration session (see `docs/reports/matching-score-calibration-session.md`)
made changes that this implementation must be aware of:

### What the Calibration Session Changed

1. **`src/lib/jobs/dashboard-queries.ts`**: Added three negative signals to the
   display score formula (blocklist penalty, coverage gap, secondary domain
   mismatch). Fixed a SQL bug in the blocklist CASE condition.

2. **Display score formula** (now 9 signals):
   ```
   score = clamp(
     similarity * 0.25
     + overlapNormalized * 0.30
     + workplaceMatch * 0.12
     + locationMatch * 0.08
     + seniorityMatch * 0.08
     + companyQuality * 0.17
     - blocklistPenalty * 0.10
     - coverageGap * 0.10
     - secondaryDomainMismatch * 0.08,
     0, 1
   ) * 100
   ```

3. **Calibration results**: Approved average 54.1/100, rejected average 39.9/100,
   gap of 14.2 points. 8 rejected matches still score above the approved average.

### How This Relates to Gate 0.5

- **No conflict**: Gate 0.5 is a pre-matching filter; the display score is a
  post-matching ranker. They operate at different stages of the pipeline.
- **The display score's 8% location weight explains why geo-fenced jobs rank
  high** — a perfect technical match (55% from similarity + overlap) overwhelms
  the 8% location penalty. Gate 0.5 fixes this by blocking these jobs entirely.
- **The calibration session's top two next-step priorities are directly addressed
  by Gate 0.5**:
  1. "Experience gap signal" → Gate 0.5 Check 5 (experience band)
  2. "Location refinement" → Gate 0.5 Checks 1, 2, 3 (geo-fencing patterns)

### What NOT to Change

- **Do NOT modify the display score formula** — it was just calibrated against
  live data and is working correctly for its purpose (ranking approved matches).
- **Do NOT modify the analysis scripts** (`analyze-approved-matches.ts`,
  `analyze-rejected-matches.ts`, `investigate-wordpress-matching.ts`) — they are
  for continuous tuning and still work.
- **Do NOT modify the Gate 1+2 router or Gate 3 evaluator** — they are working
  correctly for their purpose (recall and precision within the eligible pool).

---

## 10. Additional Concerns & Edge Cases

### 10.1 Multi-Applicant Design

The current system has one user with three personas. Gate 0.5 is a **job-level**
filter, not a job-persona-pair filter. It checks whether the job is fundamentally
eligible for the applicant(s) regardless of persona.

The implementation fetches ALL applicants and checks the job against each. If the
job passes for at least one applicant, it proceeds to Gate 1+2 (which will route
it to the appropriate personas). If it fails for all applicants, it's tombstoned.

In the current single-user setup, this is one check. The design supports future
multi-tenant use without modification.

### 10.2 The `rejectionPattern` Column

Add a `rejectionPattern` column to the `job` table to track which Gate 0.5
pattern triggered the rejection. This enables:
- Observability: monitoring which patterns fire most often
- Debugging: identifying false positives
- Future tuning: adjusting pattern detection logic

Values: `title_region_tag`, `location_country_list`, `default_on_site`,
`explicit_on_site`, `compensation_mismatch`, `experience_gap`,
`inverted_experience_band`, or null (not rejected by Gate 0.5).

### 10.3 False Positive Risk

The highest false-positive risk is in Check 3 (no remote designation = on-site).
Some jobs may genuinely be remote-friendly but not have explicit remote keywords
in the Greenhouse location or content fields. After deploying, monitor the
`rejectionPattern = 'default_on_site'` rejections for false positives.

**Mitigation**: The normalizer's content scan fallback (lines 557-593) already
checks the description for remote phrases like "fully remote", "work from home",
"remote-first". This catches most genuinely remote jobs. The fix only changes the
behavior when BOTH the location name AND content scan fail to find remote
keywords — in that case, defaulting to on-site is the correct assumption.

### 10.4 Ashby Compensation Data

The Ashby endpoint already requests `includeCompensation=true` (see
`src/lib/jobs/ats-endpoints.ts` line 90). However, the Ashby schema
(`src/lib/jobs/ats-schemas.ts`) uses `.passthrough()` which means the
compensation field is present in the raw JSON but not explicitly validated.

The implementing agent should:
1. Check a real Ashby raw JSON payload to confirm the compensation field structure
2. Add explicit extraction in `extractAshbyMetadata()`
3. The field may be named `compensation` with sub-fields `min`, `max`, `currency`
   (based on the test in `ats-schemas.test.ts` line 371)

### 10.5 Lever Salary Range

The Lever schema already includes `salaryRange` (line 107 in `ats-schemas.ts`).
Extract it in `extractLeverMetadata()`. The interval field may be
`"per-year-salary"`, `"per-month-salary"`, etc. — normalize to annual.

### 10.6 Experience Parsing Edge Cases

Experience parsing from job descriptions is inherently fuzzy. Common patterns:
- "3+ years of experience" → min=3, max=undefined (use min+10 as default max)
- "2-6 years" → min=2, max=6
- "minimum 5 years" → min=5, max=undefined
- "at least 3 years" → min=3, max=undefined

**Important**: Only parse explicit year ranges. Do NOT infer experience from
seniority words ("senior", "lead") — that's the job of Gate 3's seniority check.

### 10.7 Country Code Matching

The applicant's `country` field is ISO 3166-1 alpha-2 (e.g., "RS" for Serbia).
The job's `locationName` may contain full country names ("Serbia", "India",
"United States"). The matching logic must handle both:
- Direct code match: `locationName` contains "RS" (rare but possible)
- Full name match: `locationName` contains "Serbia" (common)

For `locationCountries` (structured array from ATS), the values may be full
country names or ISO codes. Normalize both sides before comparing.

A simple approach: maintain a mapping of ISO codes to common name variants:
```typescript
const COUNTRY_NAMES: Record<string, string[]> = {
  RS: ["serbia", "rs"],
  US: ["united states", "usa", "u.s.", "us"],
  IN: ["india", "in"],
  // ... extend as needed
};
```

### 10.8 Do Not Run Git Commands

Per AGENTS.md: **NEVER run any Git commands** (git add, git commit, git push,
git checkout, etc.). All version control operations must be left to the user.

### 10.9 Do Not Modify shadcn/ui Components

Per AGENTS.md: Never modify files under `src/components/ui/`. If any UI changes
are needed (e.g., displaying rejection reasons in the dashboard), compose new
components that import from `src/components/ui/` — never edit the source.

### 10.10 Biome Formatting

After all code changes, run:
```bash
npm run format   # biome format --write
npm run lint     # biome check (verify no errors)
```

Do NOT use ESLint or Prettier — this project uses Biome exclusively.

---

## 11. Implementation Order

### Step 1: Database Schema + Migration
1. Modify `src/db/schemas/jobs/job.ts` — add new columns
2. Modify `src/db/schemas/jobs/applicant.ts` — add new columns
3. Run `npm run db:generate` to generate migration SQL
4. Review the generated SQL in `src/db/migrations/0039_*.sql`
5. Run `npm run db:migrate` to apply

### Step 2: Normalizer Fixes + Enhanced Extraction
1. Fix workplace type default in `extractGreenhouseMetadata()` (§5.1)
2. Add new metadata fields to `JobMetadata` type
3. Add extraction functions for titleRegionTag, experienceRange, compensation
4. Update `extractAshbyMetadata()`, `extractLeverMetadata()` for compensation
5. Update `extractGreenhouseMetadata()` for experience parsing
6. Update tests in `job-normalizer.test.ts`

### Step 3: Gate 0.5 Implementation
1. Create `src/lib/jobs/gate-zero-pre-filter.ts`
2. Implement all five checks (§4.1)
3. Create unit tests in `__tests__/gate-zero-pre-filter.test.ts`
4. Run `npm run test` to verify all tests pass

### Step 4: Inngest Handler Integration
1. Modify `src/inngest/functions.ts` — insert Gate 0.5 step (§5.5)
2. Verify the step is correctly placed between normalization and Gate 1+2
3. Test the integration

### Step 5: Verification
1. Run `npx tsc --noEmit` — must pass with no errors
2. Run `npm run test` — all Vitest tests must pass
3. Run `npm run format` and `npm run lint` — Biome must be clean
4. Run a smoke test against the three example job IDs to verify they would
   now be rejected by Gate 0.5

### Step 6: Documentation Update
1. Update `docs/reports/MODULE_C_DECISIONS.md` with Gate 0.5 design decisions
2. Update `docs/governing/VectorMatchTechicalImplementation.md` with the new
   pipeline step
3. Update `docs/governing/vectormatch-blueprint.md` if needed

---

## 12. Verification Commands

```bash
# Type checking
npx tsc --noEmit

# Unit tests
npm run test

# Lint + format
npm run lint
npm run format

# Database migration
npm run db:generate
npm run db:migrate

# Do NOT run:
# - npm run test:e2e (no E2E tests needed for this change)
# - git commands (per AGENTS.md)
# - npm run db:push (use generate + migrate separately to review SQL)
```

---

## 13. Summary of Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/jobs/gate-zero-pre-filter.ts` | CREATE | Gate 0.5 hard-blocker pre-filter logic |
| `src/lib/jobs/__tests__/gate-zero-pre-filter.test.ts` | CREATE | Unit tests for Gate 0.5 |
| `src/lib/jobs/job-normalizer.ts` | MODIFY | Fix workplace type default + add metadata extraction |
| `src/lib/jobs/__tests__/job-normalizer.test.ts` | MODIFY | Update tests for normalizer changes |
| `src/db/schemas/jobs/job.ts` | MODIFY | Add 8 new columns + 1 index |
| `src/db/schemas/jobs/applicant.ts` | MODIFY | Add 2 new columns |
| `src/inngest/functions.ts` | MODIFY | Insert Gate 0.5 step in jobIngestedHandler |
| `src/db/migrations/0039_*.sql` | GENERATED | Auto-generated by drizzle-kit |
| `docs/reports/MODULE_C_DECISIONS.md` | MODIFY | Document Gate 0.5 design |
| `docs/governing/VectorMatchTechicalImplementation.md` | MODIFY | Update pipeline docs |

**Total**: 2 new files, 7 modified files, 1 generated migration.

---

## 14. Expected Outcome

After implementation:
- **Pattern 1** (title region tags): Jobs like "Software Engineer - Latam" are
  rejected before entering the matching pipeline
- **Pattern 2** (location country lists): Jobs with country lists excluding the
  applicant are rejected
- **Pattern 3** (no remote designation): Greenhouse jobs with a location but no
  remote keywords are correctly classified as on-site and rejected if the
  applicant is not in that location
- **Compensation check**: Jobs with compensation below the applicant's threshold
  are rejected (once applicant sets `expectedCompMin`)
- **Experience check**: Jobs where the applicant is significantly overqualified
  are rejected (once applicant sets `yearsOfExperience`)

The three example jobs from this session would all be automatically rejected:
- Hire Hangar: Pattern 2 (country list excludes Serbia) + compensation mismatch
- Reacher: Pattern 1 (title "- Latam") + inverted experience band
- CloudSEK: Pattern 3 (no remote designation, on-site in India)
