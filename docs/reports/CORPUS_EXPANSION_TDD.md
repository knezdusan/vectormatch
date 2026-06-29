# Continuous Company Acquisition Pipeline — Technical Design Document

> **Status:** LOCKED — All decisions verified across 6 brainstorming iterations. Do not re-architect or second-guess. Raise concerns only if you find a genuine bug or contradiction.
>
> **Date:** June 29, 2026
>
> **Supersedes:** TDD §4 (Module B) where they conflict. This document extends Module B from a static seeder+poller into a continuous acquisition pipeline with batch+daily sources, adaptive polling, and infrastructure-cost-optimized batching.
>
> **Related:** `docs/governing/company-corpus-expansion-prompt.md` (brainstorming summary), `docs/reports/CORPUS_EXPANSION_HANDOFF.md` (implementation session prompt)

---

## 0. ARCHITECTURE OVERVIEW

### 0.1 The Problem

Current state: 449 companies, ~29 new jobs/day, ~1-2 approved matches/week. Target: 5,000 quality companies, 5-10 approved matches/day, continuous daily flow.

The current architecture has three structural problems:
1. **Fan-out execution explosion:** 1 Inngest function per company poll + 1 per job normalization = 600K+ executions/month at 5,000 companies (12x over the 50K Hobby limit)
2. **Storage wall:** `rawJson` at 15KB/job × 21,500 jobs = 322MB, exceeding Neon's 512MB limit
3. **Burst/drought UX:** Batch discovery dumps all companies at once → all matches in first 48h → silence until next batch

### 0.2 The Solution — Three Architectural Pivots

**Pivot 1: Batch Polling (G5+G6).** Replace per-company fan-out with batch polling (100 companies per Inngest function run). Normalize + embed + Gate 1+2 within the batch function. Gate 3 remains fan-out (small numbers). Reduces execution count by 50-100x.

**Pivot 2: rawJson Pruning (G7+G8).** Add `normalizedText` column. After normalization, store cleaned text (3KB) and NULL `rawJson` (15KB). 80% storage reduction. Must be implemented BEFORE the flush.

**Pivot 3: Flush-and-Flow.** Process all batch discoveries immediately (the flush bootstraps the corpus in week 1). The poller's adaptive cadence (G1) produces the steady state. Daily-native sources (D1-D13) add fresh companies continuously with job-level direct ingestion (G3).

### 0.3 Infrastructure Constraints (Verified)

| Resource | Limit | Solution | Usage at 5K companies |
|---|---|---|---|
| Inngest executions | 50K/month (Hobby) | G5+G6 batching | ~30% (15K) |
| Inngest concurrent steps | 5 (global) | Stagger daily sources, schedule flush off-peak | ~98% idle in steady state |
| Inngest events | 500K/month | N/A — events are cheap | <50K |
| Neon storage | 512MB | G7 (prune rawJson) + G8 (cleanup) | ~80% (410MB) |
| Neon compute | 100 CU-hours/month | Batch DB ops, scale-to-zero, monitor | ~60-93% |
| OpenAI API | Pay-per-use | N/A | ~$0.79/month |

**Escape hatches:** Self-host Inngest (removes all limits, $0, existing Hetzner+Coolify). Neon Launch ($0.35/GB-month + $0.106/CU-hour, ~$11/month total).

---

## 1. SPRINT 1 — INFRASTRUCTURE LAYER

Implementation order is strict. Each item is a prerequisite for subsequent items.

### 1.1 G7: rawJson Pruning (FIRST — before any seeder runs)

**Why first:** If G7 is done after the flush, the backfill causes simultaneous storage of both `rawJson` (322MB) and `normalizedText` (64.5MB) = 386.5MB + 332MB embeddings = 718.5MB — 40% over the 512MB limit. Neon suspends the project.

**Schema change:** Add `normalizedText` column to `job` table.

```typescript
// src/db/schemas/jobs/job.ts — add after rawJson field:
normalizedText: text("normalized_text"), // Cleaned, HTML-stripped job text.
  // Populated by normalizer after extraction. rawJson is NULLed at the
  // same time to reclaim storage (G7). Gate 3 reads this instead of rawJson.
```

**Migration:** `drizzle-kit generate` → produces `XXXX_add_normalized_text.sql`:
```sql
ALTER TABLE "job" ADD COLUMN "normalized_text" text;
```

**Code changes:**
1. `src/lib/jobs/job-normalizer.ts` — `normalizeJob()` already produces `fullText` (HTML-stripped). After writing `extractedTags` and `jobEmbedding`, also write `normalizedText: normalization.fullText` and `rawJson: null` to the DB update.
2. `src/inngest/functions.ts` — `jobIngestedHandler` step "write-normalization": add `normalizedText` to the `.set()` call, add `rawJson: null`.
3. `src/inngest/functions.ts` — `gate3Evaluator` step "fetch-context": change `rawJson: job.rawJson` to `normalizedText: job.normalizedText` in the select. Update `extractJobContent()` call to use `normalizedText` directly (no HTML stripping needed — it's already clean).
4. `src/lib/jobs/job-normalizer.ts` — `extractJobContent()` function: if `normalizedText` is available, return it directly. If not (legacy jobs), fall back to stripping `rawJson`. This handles the transition period.

**Backfill for existing 4,086 jobs:** Run a one-time script `scripts/backfill-normalized-text.ts` that:
1. Reads all jobs where `normalizedText IS NULL AND rawJson IS NOT NULL`
2. For each, calls `extractJobContent(atsSource, rawJson, title)` to get `fullText`
3. Updates `normalizedText = fullText, rawJson = NULL` in batches of 100
4. This reclaims ~61MB immediately (4,086 × 15KB → 4,086 × 3KB)

**Testing:** Vitest unit test verifying that `normalizeJob()` output includes `normalizedText` and that the DB update NULLs `rawJson`. Test that `gate3Evaluator` context fetch uses `normalizedText`.

### 1.2 G5: Batch Polling Architecture

**Replaces:** `pollCompanyFn` (per-company fan-out) and `tierActiveFanOut` / `tierDormantFanOut` (per-company event emission).

**New function:** `batchPollTier` — polls N companies in a single Inngest function run.

```typescript
// src/inngest/functions.ts — new function

export const BATCH_SIZE = 100; // companies per batch

export const batchPollTier = inngest.createFunction(
  {
    id: "poller-batch-poll-tier",
    name: "Batch Poll Tier",
    triggers: [
      { cron: "0 */3 * * *" },   // every 3h — hot tier
      { cron: "0 */12 * * *" },  // every 12h — standard tier
      { cron: "0 3 * * 1" },     // weekly Monday 3am — dormant tier
    ],
    concurrency: { limit: 5 }, // Hobby plan: 5 concurrent steps max
  },
  async ({ event, step }) => {
    // Determine tier from trigger context.
    // Inngest v4 cron triggers expose the cron string at event.data.cron
    // (event name is "inngest/scheduled.timer"). See node_modules/inngest/types.d.ts.
    const tier = cronToTier(event.data.cron);

    // Step 1: Get batch of companies for this tier
    const companies = await step.run("get-batch", async () => {
      const { db } = await import("@/db/db");
      const { company } = await import("@/db/schemas/jobs/company");
      // Query: SELECT * FROM company WHERE tier = ? AND pollingEnabled = true
      // ORDER BY lastPolledAt ASC NULLS FIRST LIMIT 100
      // Returns [{ id, atsSource, atsSlug, companyName }]
      return getBatchForTier(tier, BATCH_SIZE);
    });

    if (companies.length === 0) return { polled: 0, newJobs: 0 };

    // Step 2: Poll all companies in this batch (sequential, rate-limited per ATS)
    const pollResults = await step.run("poll-batch", async () => {
      const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");
      const results = [];
      for (const c of companies) {
        try {
          const result = await pollCompany(c.id, c.atsSource, c.atsSlug, fetch);
          results.push({ companyId: c.id, atsSource: c.atsSource, atsSlug: c.atsSlug, newJobIds: result.newJobIds, jobs: result.jobs });
        } catch (e) {
          // Log failure, continue with next company
          results.push({ companyId: c.id, error: String(e) });
        }
      }
      return results;
    });

    // Compute total new jobs across the batch
    const totalNewJobs = pollResults
      .filter(r => r.newJobIds?.length > 0)
      .reduce((sum, r) => sum + r.newJobIds.length, 0);

    // Steps 3-N: Normalize + embed new jobs in sub-batches (G6)
    // ... see §1.3 for the full normalize + Gate 1+2 + Gate 3 fan-out implementation

    return { polled: companies.length, newJobs: totalNewJobs };
  },
);
```

**`cronToTier` helper:**
```typescript
// Maps the cron string that triggered the function to the company tier to poll.
function cronToTier(cron: string): "active_hot" | "active" | "dormant" {
  switch (cron) {
    case "0 */3 * * *":   return "active_hot";  // every 3h
    case "0 */12 * * *":  return "active";       // every 12h
    case "0 3 * * 1":     return "dormant";      // weekly Monday 3am
    default: throw new Error(`Unknown cron trigger: ${cron}`);
  }
}
```

**Key design decisions:**
- **Sequential polling within batch:** The existing `phalanx-poller.ts` already enforces 2 req/s per ATS platform via Bottleneck. Sequential calls within a batch respect this naturally.
- **Error isolation:** Each company poll is wrapped in try/catch. One company's failure doesn't stop the batch. Failed companies are logged for the retry sweep.
- **Batch size 100:** At 2 req/s per ATS × 6 ATS platforms = 12 req/s, 100 companies takes ~8.3 seconds. Well within Inngest's 300s `maxDuration`.
- **Cron-to-tier mapping:** The function inspects which cron triggered it to determine which tier to poll. Hot tier (3h) runs 8x/day, standard (12h) 2x/day, dormant (weekly) 1x/week.

**What to remove:**
- `pollCompanyFn` — per-company function (replaced by batch)
- `tierActiveFanOut` — per-company event emission (replaced by batch cron)
- `tierDormantFanOut` — same
- The `poller/poll-company` event in the Inngest event catalog

**What to keep:**
- `phalanx-poller.ts` — the actual polling logic (fetch, Zod validate, Gate 0, upsert) is reused unchanged. `pollCompany()` is called directly within the batch step.
- `job-repository.ts` — `upsertJobs()` is reused unchanged.
- `tierRecalc` — daily tier recalculation (unchanged)
- `companyRevivalSweep` — weekly revival (unchanged)

**Testing:** Vitest integration test with mocked `pollCompany` verifying that the batch function processes 100 companies, handles errors gracefully, and returns correct counts.

### 1.3 G6: Batch Matcher (Normalize + Embed + Gate 1+2 within batch poller)

**Extends:** `batchPollTier` (from G5) with normalization and Gate 1+2 steps.

**Why:** Without G6, each new job triggers a separate `jobIngestedHandler` function (6 executions per job). At 21,500 flush jobs: 129,000 executions — 258% of the 50K limit. With G6, normalization happens within the batch poller's own steps: ~12 executions per batch.

**Architecture:**

```
batchPollTier (1 function run)
  → step.run("get-batch")           // get 100 companies
  → step.run("poll-batch")          // poll all 100, upsert jobs, collect newJobIds
  → step.run("normalize-1")         // normalize+embed new jobs 1-50 (if any)
  → step.run("normalize-2")         // normalize+embed new jobs 51-100 (if any)
  → step.run("normalize-N")         // ... until all new jobs processed
  → step.run("gate-1-2-batch")      // run Gate 1+2 for all new jobs in batch
  → step.sendEvent("gate-3-fanout") // fan out only Gate 3 candidates (~6%)
```

**Sub-batch sizing:** 50 jobs per `step.run()`. Each job: ~10ms regex + ~200ms embedding + ~250ms LLM fallback (10% of jobs) = ~460ms avg. 50 × 460ms = 23 seconds per step. Within Inngest's 300s limit.

**Implementation:**

```typescript
// Within batchPollTier, after poll-batch step:

// Collect all new job IDs across the batch
const allNewJobIds = pollResults
  .filter(r => r.newJobIds?.length > 0)
  .flatMap(r => r.newJobIds);

if (allNewJobIds.length === 0) {
  return { polled: companies.length, newJobs: 0 };
}

// Normalize + embed in sub-batches of 50
const SUB_BATCH = 50;

for (let i = 0; i < allNewJobIds.length; i += SUB_BATCH) {
  const chunk = allNewJobIds.slice(i, i + SUB_BATCH);
  const stepName = `normalize-${Math.floor(i / SUB_BATCH) + 1}`;

  // Each sub-batch is a separate step.run() for durability
  await step.run(stepName, async () => {
    const { normalizeJob } = await import("@/lib/jobs/job-normalizer");
    const { embedJob } = await import("@/lib/jobs/job-embedder");
    const { db } = await import("@/db/db");
    const { job } = await import("@/db/schemas/jobs/job");
    const { eq, inArray } = await import("drizzle-orm");

    // Fetch job rows for this chunk
    const jobs = await db.select({
      id: job.id, atsSource: job.atsSource, title: job.title,
      rawJson: job.rawJson,
    }).from(job).where(inArray(job.id, chunk));

    for (const j of jobs) {
      try {
        const normalization = await normalizeJob(j.atsSource, j.rawJson, j.title);
        let embedding: number[] | null = null;
        if (normalization.status === "normalized") {
          embedding = await embedJob(normalization.fullText);
        }
        // Write results + prune rawJson (G7)
        await db.update(job).set({
          extractedTags: normalization.tags,
          jobEmbedding: embedding,
          normalizedText: normalization.status === "normalized" ? normalization.fullText : null,
          rawJson: null, // G7: reclaim storage
          normalizedAt: new Date(),
          status: normalization.status === "rejected" ? "rejected" :
                  normalization.status === "normalization_failed" ? "normalization_failed" : "active",
        }).where(eq(job.id, j.id));
      } catch (e) {
        // Mark as normalization_failed, continue
        await db.update(job).set({
          status: "normalization_failed",
        }).where(eq(job.id, j.id));
      }
    }
  });
}

// Gate 1+2 for all new jobs in batch
const candidates = await step.run("gate-1-2-batch", async () => {
  const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");
  const { inArray } = await import("drizzle-orm");

  // Run Gate 1+2 for each new job
  const allCandidates = [];
  for (const jobId of allNewJobIds) {
    // Fetch the job's tags and embedding (just written by normalize step)
    const j = await db.select({
      extractedTags: job.extractedTags, jobEmbedding: job.jobEmbedding,
      status: job.status,
    }).from(job).where(eq(job.id, jobId)).limit(1);

    if (j[0]?.status !== "active" || !j[0].jobEmbedding) continue;

    const cands = await runGateSQLRouter(jobId, j[0].extractedTags, j[0].jobEmbedding);
    allCandidates.push(...cands);
  }
  return allCandidates;
});

// Fan out Gate 3 evaluations (small numbers, ~6% of new jobs)
if (candidates.length > 0) {
  await step.sendEvent("gate-3-fanout", candidates.map(c => ({
    id: `gate-3-${c.matchQueueId}`,
    name: "match/gate-3-evaluate",
    data: { matchQueueId: c.matchQueueId, jobId: c.jobId, personaId: c.personaId, applicantId: c.applicantId },
  })));
}
```

**What happens to `jobIngestedHandler`:** It remains for G3 (job-level direct ingestion from daily sources). Daily sources fire individual `job/ingested` events at ~100-200 jobs/day = 600-1,200 executions/month — negligible. The poller path no longer uses `jobIngestedHandler`.

**Concurrency consideration:** With 5 concurrent steps (Hobby plan), the batch poller's normalize steps run sequentially within a single function run (Inngest executes steps in order). But multiple `batchPollTier` instances can run concurrently if triggered by different crons. The `concurrency: { limit: 5 }` on the function prevents more than 5 simultaneous batch polls.

**Testing:** Vitest test with mocked `normalizeJob`, `embedJob`, and `runGateSQLRouter` verifying that the batch correctly processes new jobs, handles normalization failures, and fans out Gate 3 events only for surviving candidates.

### 1.4 F1: The Slugger (with F3 Cross-Platform Identity Resolution integrated)

**Replaces/extends:** `src/lib/jobs/seeders/resolve-custom-url.ts` (existing CNAME + slug probe for URLs).

**New file:** `src/lib/jobs/seeders/slugger.ts`

**The Slugger resolves company names (not just URLs) to ATS slugs.** It's the foundation for all name-based discovery sources (YC, VC portfolios, Remote OK, Product Hunt, etc.).

**Multi-strategy name normalization (F3 integrated):**

```typescript
// src/lib/jobs/seeders/slugger.ts

/**
 * Canonicalize a company name for deduplication.
 * Handles: "Stripe Inc" → "stripe", "Klarna Bank AB" → "klarna",
 * "23andMe" → "23andme", "Docker Inc." → "docker"
 */
export function canonicalizeCompanyName(input: string): string {
  let name = input.trim().toLowerCase();
  // Strip common corporate suffixes
  const suffixes = [
    /\s+(inc|llc|ltd|corp|corporation|gmbh|ab|oy|as|sa|sas|sarl|bv|nv|plc|limited|co)\.?\s*$/i,
    /\s+(holdings|holding|group|ventures|labs|technologies|technology|systems|solutions|software|platforms)\s*$/i,
  ];
  for (const re of suffixes) name = name.replace(re, "");
  // Remove punctuation except hyphens and dots within names
  name = name.replace(/[,.]/g, "").replace(/\s+/g, "");
  return name;
}

/**
 * Generate candidate slug variants from a company name.
 * "Buffalo Wild Wings" → ["buffalowildwings", "buffalo", "bww"]
 * "23andMe" → ["23andme"]
 */
export function generateSlugVariants(companyName: string): string[] {
  const canonical = canonicalizeCompanyName(companyName);
  const variants = new Set<string>([canonical]);
  // First word as slug (common for long names)
  const words = companyName.trim().toLowerCase().split(/\s+/);
  if (words.length > 1) variants.add(words[0]);
  // Acronym (first letters of each word)
  if (words.length >= 2) {
    const acronym = words.map(w => w[0]).join("");
    if (acronym.length >= 2) variants.add(acronym);
  }
  return [...variants];
}
```

**Resolution pipeline:**

```typescript
export interface SluggerInput {
  companyName: string;
  website?: string;   // optional — if available, extract domain for CNAME check
  atsHint?: AtsSource; // optional — if from BigQuery, probe only this ATS
}

export interface SluggerResult {
  success: boolean;
  atsSource?: AtsSource;
  atsSlug?: string;
  resolvedBy: "db_cache" | "cname" | "slug_probe";
  canonicalName: string;
}

export async function resolveSlugger(
  input: SluggerInput,
  opts: { fetchFn?: FetchFn; resolveCname?: ResolveCnameFn } = {},
): Promise<SluggerResult> {
  const canonical = canonicalizeCompanyName(input.companyName);

  // Stage 0: DB cache — check if we already have this company
  const cached = await checkDbCache(canonical);
  if (cached) return { success: true, ...cached, resolvedBy: "db_cache", canonicalName: canonical };

  // Stage 1: If website provided, try CNAME check
  if (input.website) {
    const cnameResult = await tryCname(input.website, opts.resolveCname);
    if (cnameResult) return { success: true, ...cnameResult, resolvedBy: "cname", canonicalName: canonical };
  }

  // Stage 2: Slug probe — try each variant against each ATS
  const variants = generateSlugVariants(input.companyName);
  const atsSources = input.atsHint ? [input.atsHint] : ATS_SOURCES;

  for (const slug of variants) {
    for (const ats of atsSources) {
      const probeResult = await probeSlug(ats, slug, opts.fetchFn);
      if (probeResult) return { success: true, atsSource: ats, atsSlug: slug, resolvedBy: "slug_probe", canonicalName: canonical };
    }
  }

  return { success: false, canonicalName: canonical };
}
```

**DB cache check:** Query `company` table for matching `rootDomain` or `companyName`. The `rootDomain` index already exists. Add a `canonicalName` column to `company` table for exact-match dedup.

**Schema change for F3:**
```typescript
// src/db/schemas/jobs/company.ts — add:
canonicalName: text("canonical_name"), // Canonicalized name for cross-platform dedup
```

**Retry queue:** Companies that fail resolution are stored in a `sluggerRetry` table with `nextRetryAt` timestamps. A daily Inngest function retries them after 30/60/90 days (companies may configure ATS later, especially post-funding).

```typescript
// New table: src/db/schemas/jobs/sluggerRetry.ts
export const sluggerRetry = pgTable("slugger_retry", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull(),
  website: text("website"),
  discoverySource: discoverySourceEnum("discovery_source").notNull(),
  discoveryContext: text("discovery_context"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Rate limiting:** The Slugger respects the existing 2 req/s per ATS platform via Bottleneck. When probing all 6 ATS platforms (after F2), that's 12 req/s total. For 1,000 companies × 3 variants × 6 ATS = 18,000 probes at 12 req/s = 25 minutes. Acceptable for a background Inngest function.

**Testing:** Vitest unit tests for `canonicalizeCompanyName()` (suffix stripping, punctuation, case), `generateSlugVariants()` (first word, acronym), and `resolveSlugger()` (DB cache hit, CNAME success, slug probe success, all-fail → retry queue).

### 1.5 F2: Phase 2 ATS Expansion

**Extends:** `src/lib/jobs/ats-endpoints.ts` and `src/db/schemas/jobs/enums.ts`

**Three new ATS platforms, all verified as having public no-auth JSON APIs:**

```typescript
// src/lib/jobs/ats-endpoints.ts — add to ATS_ENDPOINTS:

smartrecruiters: {
  // Public API — no auth required.
  // Docs: https://developers.smartrecruiters.com/docs/consuming-api
  name: "SmartRecruiters",
  apiHost: "api.smartrecruiters.com",
  jobsList: (slug) =>
    `https://api.smartrecruiters.com/v1/companies/${slug}/postings`,
  hostedBoard: (slug) => `https://jobs.smartrecruiters.com/${slug}`,
},

workable: {
  // Public widget API — no auth required.
  // Per-company: apply.workable.com/api/v1/widget/accounts/{slug}
  // Meta-search: jobs.workable.com/api/v1/jobs?query=... (for B1 discovery)
  name: "Workable",
  apiHost: "apply.workable.com",
  jobsList: (slug) =>
    `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`,
  hostedBoard: (slug) => `https://apply.workable.com/${slug}`,
},

recruitee: {
  // Public API — no auth required.
  // Docs: https://docs.recruitee.com/reference
  name: "Recruitee",
  apiHost: "api.recruitee.com",
  jobsList: (slug) =>
    `https://api.recruitee.com/v1/companies/${slug}/offers`,
  hostedBoard: (slug) => `https://${slug}.recruitee.com`,
},
```

**Enum changes:**
```typescript
// src/db/schemas/jobs/enums.ts — extend atsSourceEnum:
export const atsSourceEnum = pgEnum("ats_source", [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "recruitee",
  "workable",
]);
```

**ATS adapters:** Create `src/lib/jobs/poller/ats-adapters/smartrecruiters.ts`, `workable.ts`, `recruitee.ts` — each implements the `AtsAdapter` interface (fetch jobs, parse to `NormalizedJob[]`). Follow the existing pattern in `greenhouse.ts`, `lever.ts`, `ashby.ts`.

**Zod schemas:** Create defensive Zod schemas for each new ATS in `src/lib/jobs/ats-schemas.ts`. Follow existing pattern.

**Migration:** `drizzle-kit generate` → adds new enum values. No data migration needed (existing companies stay on their current ATS).

**Testing:** Vitest tests for each new adapter with sample API responses (mocked). Verify Zod schema validation, Gate 0 filtering, and NormalizedJob output.

### 1.6 G4: Stale-Job Garbage Collection

**New Inngest function:** `staleJobVerifier` — daily sweep that re-checks dashboard-displayed approved matches against their ATS endpoint.

```typescript
export const staleJobVerifier = inngest.createFunction(
  {
    id: "stale-job-verifier",
    name: "Stale Job Verifier",
    triggers: [{ cron: "0 6 * * *" }], // daily 6am
  },
  async ({ step }) => {
    // Step 1: Get all approved matches from the last 30 days
    const approvedMatches = await step.run("get-approved", async () => {
      // SELECT * FROM match_queue WHERE status = 'approved'
      //   AND evaluatedAt > NOW() - INTERVAL '30 days'
      return getApprovedMatches(30);
    });

    // Step 2: For each, re-fetch the job from ATS and check if it still exists
    const staleResults = await step.run("verify-batch", async () => {
      const results = [];
      for (const match of approvedMatches) {
        try {
          const jobExists = await verifyJobExists(match.atsSource, match.atsSlug, match.externalJobId);
          if (!jobExists) {
            results.push({ matchId: match.id, status: "stale" });
          }
        } catch (e) {
          // ATS API error — don't mark as stale, just log
          results.push({ matchId: match.id, status: "error", error: String(e) });
        }
      }
      return results;
    });

    // Step 3: Mark stale matches as hidden
    if (staleResults.filter(r => r.status === "stale").length > 0) {
      await step.run("mark-stale", async () => {
        const staleIds = staleResults.filter(r => r.status === "stale").map(r => r.matchId);
        // UPDATE match_queue SET status = 'stale' WHERE id IN (staleIds)
        return markMatchesStale(staleIds);
      });
    }

    return { verified: approvedMatches.length, stale: staleResults.filter(r => r.status === "stale").length };
  },
);
```

**`verifyJobExists`:** Fetches the ATS job list for the company and checks if the `externalJobId` is present. If the ATS returns 404 (company left the ATS) or the job is not in the list, it's stale.

**Dashboard impact:** The `/dashboard/jobs` query already filters by `status = 'approved'`. Stale matches are excluded automatically. No UI changes needed.

**Testing:** Vitest test with mocked ATS responses verifying that stale jobs are correctly identified and marked.

### 1.7 G3: Job-Level Inversion

**New normalizer entry point for aggregator-sourced jobs:**

```typescript
// src/lib/jobs/job-normalizer.ts — add:

export interface AggregatorJob {
  source: "remoteok" | "remotive" | "himalayas" | "wwr" | "jobicy" | "hn_comment" | "reddit" | "newsletter";
  externalJobId: string; // e.g. "remoteok-12345"
  company: string;
  title: string;
  description: string; // HTML or plain text
  location?: string;
  tags?: string[];
  applyUrl?: string;
  publishedAt?: Date;
}

export function normalizeAggregatorJob(job: AggregatorJob): {
  status: "normalized" | "rejected";
  fullText: string;
  tags: string[];
} {
  // Strip HTML from description
  const fullText = stripHtml(job.description);
  // Combine: title + company + location + cleaned description
  const combinedText = `${job.title} at ${job.company}\n${job.location ?? ""}\n${fullText}`;
  // Run regex tag extraction (same as ATS jobs)
  const tags = extractTagsRegex(combinedText);
  // Gate 0 check on title
  if (!gateZeroFilter(job.title)) {
    return { status: "rejected", fullText: combinedText, tags };
  }
  return { status: "normalized", fullText: combinedText, tags };
}
```

**New Inngest event:** `job/aggregator-ingested`

```typescript
// src/inngest/client.ts — add to VectorMatchEvents:
"job/aggregator-ingested": {
  data: {
    source: string;
    externalJobId: string;
    company: string;
    title: string;
    description: string;
    location?: string;
    tags?: string[];
    applyUrl?: string;
    publishedAt?: string;
  };
};
```

**New Inngest function:** `aggregatorJobHandler` — processes aggregator-sourced jobs through the same Gate 1+2+3 pipeline.

```typescript
export const aggregatorJobHandler = inngest.createFunction(
  {
    id: "aggregator-job-handler",
    name: "Aggregator Job Handler",
    triggers: [{ event: "job/aggregator-ingested" }],
    concurrency: { limit: 5 },
  },
  async ({ event, step }) => {
    const job = event.data;

    // Step 1: Normalize + embed
    const normalization = await step.run("normalize", async () => {
      const { normalizeAggregatorJob } = await import("@/lib/jobs/job-normalizer");
      return normalizeAggregatorJob(job);
    });

    if (normalization.status !== "normalized") return { skipped: true };

    const embedding = await step.run("embed", async () => {
      const { embedJob } = await import("@/lib/jobs/job-embedder");
      return embedJob(normalization.fullText);
    });

    // Step 2: Insert into job table with synthetic atsSource/atsSlug
    const jobId = await step.run("insert-job", async () => {
      // atsSource = "aggregator", atsSlug = job.source (e.g. "remoteok")
      // externalJobId = job.externalJobId
      // rawJson = NULL (G7), normalizedText = normalization.fullText
      return insertAggregatorJob(job, normalization, embedding);
    });

    // Step 3: Gate 1+2
    const candidates = await step.run("gate-1-2", async () => {
      const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
      return runGateSQLRouter(jobId, normalization.tags, embedding);
    });

    // Step 4: Fan out Gate 3
    if (candidates.length > 0) {
      await step.sendEvent("gate-3-fanout", candidates.map(c => ({
        id: `gate-3-${c.matchQueueId}`,
        name: "match/gate-3-evaluate",
        data: { matchQueueId: c.matchQueueId, jobId, personaId: c.personaId, applicantId: c.applicantId },
      })));
    }

    // Step 5: Also try to resolve the company via Slugger for future polling
    await step.run("slugger-resolve", async () => {
      const { resolveSlugger } = await import("@/lib/jobs/seeders/slugger");
      return resolveSlugger({ companyName: job.company });
    });

    return { jobId, candidates: candidates.length };
  },
);
```

**Key design:** The aggregator job is ingested immediately (near-zero latency). In parallel, the Slugger tries to resolve the company for future polling. If the company is already in the corpus, the Slugger result is a DB cache hit (no-op). If it's new, the company gets added for future polling.

**Deduplication:** The `job` table's unique index on `(atsSource, atsSlug, externalJobId)` prevents duplicates. Aggregator jobs use `atsSource = "aggregator"` and `atsSlug = source_name` (e.g. "remoteok"). If the same job is later caught by the poller (different atsSource), it's a separate row — but Gate 3 will produce a separate match, and the user sees it as a duplicate. To prevent this, the dashboard should dedup by job title + company name similarity. This is a UI concern, not a pipeline concern.

**Testing:** Vitest test for `normalizeAggregatorJob()` (HTML stripping, tag extraction, Gate 0). Integration test for `aggregatorJobHandler` with mocked DB and AI SDK calls.

### 1.8 Q1: Quality Probe at Insertion

**Integrated into:** The Slugger's company insertion path and the batch poller's first poll.

**Logic:** When a company is first inserted (via Slugger or batch source), immediately poll its job list and count engineering-relevant jobs (jobs that pass Gate 0). Set the initial tier:

```typescript
// In slugger.ts, after successful resolution:
const jobCount = await countGateZeroJobs(atsSource, atsSlug);
const initialTier = jobCount === 0 ? "dormant" : jobCount <= 2 ? "dormant" : "active";
// Insert company with initialTier
```

This prevents companies with zero engineering jobs from entering the active polling queue, saving execution budget.

**Testing:** Vitest test verifying tier assignment logic.

---

## 2. SPRINT 1 — DISCOVERY SOURCES

After the infrastructure layer is complete, fire batch sources and wire daily sources.

### 2.1 Batch Sources (B1-B10)

Each batch source is an Inngest function that discovers companies, runs them through the Slugger, and inserts them into the `company` table. They run once (one-time flush) and then on a refresh schedule (monthly or quarterly).

**B1: Workable Meta-Search** — `jobs.workable.com/api/v1/jobs?query=...`
- Paginate via `nextPageToken` (20 jobs/page)
- Extract company slugs from job results (each job has `company.shortName`)
- Insert directly into `company` table (no Slugger needed — slugs are Workable-native)
- Est. yield: 300-600 companies

**B2: Google CSE Batch Sweep** — `site:boards.greenhouse.io`, `site:jobs.lever.co`, `site:jobs.ashbyhq.com` + new ATS domains
- 100 free queries/day, ~10 results/query
- Extract slugs from URL paths via regex
- Insert directly (no Slugger)
- Est. yield: 200-500 companies

**B3: YC Directory** — Algolia API, `isHiring=true` filter
- Extract company names + websites → Slugger
- Est. yield: 150-400 companies

**B4: VC Portfolio Mining** — 50+ VC portfolio pages
- Fetch each VC's portfolio page, extract company names + website links via DOM parsing
- Run through Slugger
- Est. yield: 500-2,000 companies

**B5: Developer Newsletter Archives** — JS Weekly, React Status, Node Weekly, TypeScript Weekly, CSS Weekly
- Crawl archive pages, extract job section URLs
- Many contain direct ATS URLs → extract slugs directly
- Others link to company career pages → Slugger
- Est. yield: 200-500 companies

**B6: BigQuery 6-partition scan** — expand from 3 to 6 monthly partitions
- Config change in `bigquery-seeder.ts` (partition count)
- Also add Workable to Wappalyzer filter after F2
- Est. yield: 200-400 companies (delta)

**B7: Wayback Machine CDX** — `web.archive.org/cdx/search/cdx?url=boards.greenhouse.io/*&output=json&filter=statuscode:200&fl=original`
- Date-filter to last 18 months (avoid graveyard)
- Extract slugs from URL paths
- Est. yield: 200-500 companies

**B8: CNAME Reversal via Rapid7 FDNS v2** — download bulk CNAME dataset
- Filter for CNAMEs pointing at ATS domains
- Extract company domains → resolve to company names → Slugger
- Est. yield: 300-1,000 companies

**B9: Cross-Pollination from Job Descriptions** — mine existing 4,086 job descriptions
- SQL query: `SELECT DISTINCT companyName FROM job WHERE companyName IS NOT NULL`
- Run each through Slugger
- Est. yield: 50-150 companies

**B10: Sitemap.xml Probing** — for companies where Slugger failed
- Probe `sitemap.xml`, `jobs/sitemap.xml`, `careers/sitemap.xml`
- Extract ATS-powered career page links
- Est. yield: rescues 20-30% of failed probes

### 2.2 Daily-Native Sources (D1-D13)

Each daily source is an Inngest function on a cron schedule (staggered across the day to avoid concurrent execution contention with the 5-step limit). They discover new companies and/or ingest jobs directly via G3.

**Staggered schedule (one source per hour):**

| Time | Source | Type |
|---|---|---|
| 00:00 | D1: Google CSE Date-Restricted Daily | Direct slug extraction |
| 01:00 | D2: HN Algolia Daily ATS Link Mining | Direct slug extraction |
| 02:00 | D3: Reddit RSS Hiring Feeds | Direct slug extraction (ATS URLs in posts) |
| 03:00 | D4: Remote OK + Remotive + Himalayas | G3 job-level ingestion + Slugger |
| 04:00 | D5: We Work Remotely + Jobicy RSS | G3 job-level ingestion + Slugger |
| 05:00 | D8: Product Hunt Daily Launches | Slugger (company names → ATS) |
| 06:00 | D9: Company Engineering Blog RSS | Slugger (hiring mentions → ATS) |
| 07:00 | D10: GitHub Trending + CONTRIBUTING.md | Slugger (org → website → ATS) |
| 08:00 | D11: Tech News RSS + LLM Extraction | Slugger (funding/hiring signals) |
| 09:00 | D12: NPM Registry New Packages | Slugger (org-scoped packages) |
| 10:00 | D6: CertStream batch processing | Slugger (CT log domain matches) |
| 11:00 | D7: Funding Signal Seeder | Slugger + retry queue |
| 12:00 | D13: Meta Ads Library | Slugger (employment ad companies) |
| 14:00 | D1: Google CSE (second sweep) | Direct slug extraction |
| 16:00 | D2: HN Algolia (second sweep) | Direct slug extraction |
| 18:00 | D3: Reddit RSS (second sweep) | Direct slug extraction |

**D1: Google CSE Date-Restricted Daily**
```
GET https://www.googleapis.com/customsearch/v1?
  key={API_KEY}&cx={CSE_ID}
  &q=site:boards.greenhouse.io
  &sort=date
  &dateRestrict=d1
  &num=10
```
Extract slugs from URL paths. Insert directly into `company` table.

**D2: HN Algolia Daily**
```
GET https://hn.algolia.com/api/v1/search_by_date?
  query=boards.greenhouse.io
  &tags=comment
  &numericFilters=created_at_i>{YESTERDAY_UNIX}
  &hitsPerPage=50
```
Also query for `jobs.lever.co` and `jobs.ashbyhq.com`. Extract ATS URLs from comment text via `extractUrls()`.

**D3: Reddit RSS**
```
GET https://www.reddit.com/r/reactjs/search.rss?q=hiring&sort=new&restrict_sr=on
```
Also: r/typescript, r/nextjs, r/node, r/forhire, r/jobbit. Parse RSS XML, extract ATS URLs from post content.

**D4: Remote OK + Remotive + Himalayas**
- Remote OK: `GET https://remoteok.com/api` — parse `company` field → Slugger. Fire `job/aggregator-ingested` events for G3.
- Remotive: `GET https://remotive.com/api/remotejobs` — same pattern.
- Himalayas: `GET https://himalayas.app/jobs/api` — same pattern. No auth required.

**D5-D13:** Follow the same pattern — fetch from source, extract company names or ATS URLs, route through Slugger or G3 as appropriate.

**Each daily source function structure:**
```typescript
export const dailySourceD1 = inngest.createFunction(
  {
    id: "daily-source-google-cse",
    name: "Daily Source — Google CSE",
    triggers: [{ cron: "0 0,14 * * *" }], // 00:00 and 14:00
  },
  async ({ step }) => {
    // Step 1: Fetch from source
    const results = await step.run("fetch", async () => fetchFromSource());

    // Step 2: Process results (extract slugs or fire G3 events)
    const newCompanies = await step.run("process", async () => {
      // For direct-slug sources: insert into company table
      // For name-based sources: run through Slugger
      // For job-level sources: fire job/aggregator-ingested events
      return processResults(results);
    });

    return { discovered: results.length, newCompanies: newCompanies.length };
  },
);
```

---

## 3. SPRINT 2 — QUALITY ARCHITECTURE

### 3.1 G1: Tiered Adaptive Polling Cadence

**Extends:** `batchPollTier` (from G5) with tier-specific cron schedules.

**New tier values:** Add to `companyTierEnum`:
```typescript
export const companyTierEnum = pgEnum("company_tier", [
  "active",      // Tier A-Standard: poll every 12h
  "active_hot",  // Tier A-Hot: poll every 3h (approved matches in last 30d)
  "dormant",     // Tier B: poll weekly
  "dead",        // Tier C: stopped
]);
```

**Tier promotion/demotion logic (in `tierRecalc` daily function):**
- Companies with approved matches in last 30 days → `active_hot`
- Companies with active jobs but no approved matches → `active`
- Companies with no jobs in 14 days → `dormant`
- Companies with 3+ consecutive failures → `dead`

**Cron schedule:**
- `active_hot`: every 3h (`0 */3 * * *`)
- `active`: every 12h (`0 */12 * * *`)
- `dormant`: weekly (`0 3 * * 1`)

**New company bootstrap (Q4):** New companies get `active_hot` for first 48h, then transition based on job count.

### 3.2 Q2: Adversarial Quality Flywheel

**New table:** `companyQualityScore`
```typescript
export const companyQualityScore = pgTable("company_quality_score", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  score: integer("score").notNull(), // Bayesian score 0-100
  approvedMatches: integer("approved_matches").notNull().default(0),
  rejectedMatches: integer("rejected_matches").notNull().default(0),
  totalJobsProcessed: integer("total_jobs_processed").notNull().default(0),
  lastApprovedAt: timestamp("last_approved_at"),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
});
```

**Daily recalculation:** `qualityFlywheelRecalc` Inngest function (daily cron) that:
1. For each company: calculates `score = (approvedMatches / totalJobsProcessed) * 100`
2. Companies with score > 50 and approvedMatches > 3 → promote to `active_hot`
3. Companies with score < 10 and totalJobsProcessed > 20 → demote to `dormant`
4. Companies with 0 approved matches in 90 days → mark for purge review

### 3.3 Q3: Layoff Signal Deprioritization

**New Inngest function:** `layoffSignalChecker` — daily cron that fetches Layoffs.fyi RSS feed, matches company names against corpus, and demotes affected companies from `active_hot` to `active`.

### 3.4 Q5: Multi-Intent Fusion Scoring

**Integrated into:** The Slugger's `discoveryScore` calculation. When a company is discovered by multiple sources (e.g., HN + GitHub + Product Hunt), the fusion score increases. High-fusion companies get priority for polling.

---

## 4. EXECUTION BUDGET VERIFICATION

### 4.1 Steady State (5,000 companies)

| Component | Daily Execs | Monthly | % of 50K |
|---|---|---|---|
| Polling batches (hot: 5×8 + std: 35×2 + dorm: 10×0.14) | ~112 batches × 2 = 224 | 6,720 | 13.4% |
| Normalize steps (within batch, ~11 batches with new jobs) | ~44 | 1,320 | 2.6% |
| Gate 1+2 (within batch) | ~22 | 660 | 1.3% |
| Gate 3 fan-out (~20 candidates/day) | ~100 | 3,000 | 6.0% |
| Daily source seeders (13 sources × 2 runs × 2 steps) | ~52 | 1,560 | 3.1% |
| Stale cleanup + GC (G4) | ~4 | 120 | 0.2% |
| Tier recalc + quality flywheel | ~4 | 120 | 0.2% |
| Slugger retry queue | ~2 | 60 | 0.1% |
| **Total** | **~448** | **~13,540** | **~27%** |

### 4.2 Flush (Week 1, one-time)

| Component | Executions | % of 50K |
|---|---|---|
| 50 batch polls × 12 steps (poll + 9 normalize + Gate 1+2) | 600 | 1.2% |
| Gate 3 fan-out (1,290 candidates × 5) | 6,450 | 12.9% |
| Batch source seeders (10 sources × ~3 steps) | ~30 | 0.1% |
| **Total flush** | **7,080** | **14.2%** |

### 4.3 First Month Total

Flush (7,080) + steady state (13,540) + seeders (~1,000) = ~21,620 = **43% of 50K.** 57% headroom.

---

## 5. STORAGE BUDGET VERIFICATION

### 5.1 With G7 + G8 at 5,000 companies

| Component | Size | % of 512MB |
|---|---|---|
| `normalizedText` (19,350 jobs × 3KB) | 58 MB | 11.3% |
| `jobEmbedding` + HNSW index (19,350 × 9.2KB) | 178 MB | 34.8% |
| Other job fields (19,350 × 0.3KB) | 6 MB | 1.2% |
| `company` table (5,000 × 0.5KB) | 2.5 MB | 0.5% |
| `matchQueue` table (~5,000 rows × 1KB) | 5 MB | 1.0% |
| `sluggerRetry` table (~2,000 rows × 0.2KB) | 0.4 MB | 0.1% |
| `companyQualityScore` (5,000 × 0.1KB) | 0.5 MB | 0.1% |
| Postgres system catalogs + WAL overhead | ~60 MB | 11.7% |
| **Total** | **~310 MB** | **60.5%** |

39.5% headroom. Comfortable.

---

## 6. OPENAI COST VERIFICATION

| Component | Flush (one-time) | Monthly (steady state) |
|---|---|---|
| Embeddings (text-embedding-3-small, $0.02/1M tokens) | $0.22 | $0.10 |
| Gate 3 LLM (gpt-4o-mini, $0.15/$0.60 per 1M I/O tokens) | $0.50 | $0.21 |
| Normalization LLM fallback (10% of jobs, gpt-4o-mini) | $0.48 | $0.24 |
| D11 News extraction (gpt-4o-mini, 100 articles/day) | — | $0.24 |
| **Total** | **$1.20** | **$0.79/month** |

---

## 7. KEY FILES TO CREATE/MODIFY

### New Files

| File | Purpose |
|---|---|
| `src/lib/jobs/seeders/slugger.ts` | F1: The Slugger — company name → ATS slug resolution |
| `src/db/schemas/jobs/sluggerRetry.ts` | F1: Retry queue for unresolved companies |
| `src/lib/jobs/poller/ats-adapters/smartrecruiters.ts` | F2: SmartRecruiters adapter |
| `src/lib/jobs/poller/ats-adapters/workable.ts` | F2: Workable adapter |
| `src/lib/jobs/poller/ats-adapters/recruitee.ts` | F2: Recruitee adapter |
| `src/lib/jobs/seeders/batch-sources/workable-meta-search.ts` | B1: Workable meta-search seeder |
| `src/lib/jobs/seeders/batch-sources/google-cse.ts` | B2/D1: Google CSE seeder (batch + daily) |
| `src/lib/jobs/seeders/batch-sources/yc-directory.ts` | B3: YC directory seeder |
| `src/lib/jobs/seeders/batch-sources/vc-portfolios.ts` | B4: VC portfolio mining |
| `src/lib/jobs/seeders/batch-sources/newsletter-archives.ts` | B5: Newsletter archive mining |
| `src/lib/jobs/seeders/batch-sources/wayback-cdx.ts` | B7: Wayback Machine CDX |
| `src/lib/jobs/seeders/batch-sources/rapid7-cname.ts` | B8: Rapid7 FDNS CNAME reversal |
| `src/lib/jobs/seeders/batch-sources/sitemap-probe.ts` | B10: Sitemap.xml probing |
| `src/lib/jobs/seeders/daily-sources/hn-daily.ts` | D2: HN Algolia daily |
| `src/lib/jobs/seeders/daily-sources/reddit-rss.ts` | D3: Reddit RSS |
| `src/lib/jobs/seeders/daily-sources/remote-aggregators.ts` | D4/D5: Remote OK + Remotive + Himalayas + WWR + Jobicy |
| `src/lib/jobs/seeders/daily-sources/product-hunt.ts` | D8: Product Hunt daily |
| `src/lib/jobs/seeders/daily-sources/engineering-blogs.ts` | D9: Engineering blog RSS |
| `src/lib/jobs/seeders/daily-sources/github-trending.ts` | D10: GitHub trending scan |
| `src/lib/jobs/seeders/daily-sources/tech-news-llm.ts` | D11: Tech news + LLM extraction |
| `src/lib/jobs/seeders/daily-sources/npm-registry.ts` | D12: NPM new packages |
| `src/lib/jobs/seeders/daily-sources/meta-ads.ts` | D13: Meta Ads Library |
| `src/lib/jobs/seeders/daily-sources/certstream-processor.ts` | D6: CertStream batch processor |
| `src/lib/jobs/seeders/daily-sources/funding-signals.ts` | D7: Funding signal seeder |
| `src/lib/jobs/quality/quality-flywheel.ts` | Q2: Quality flywheel logic |
| `src/lib/jobs/quality/layoff-signals.ts` | Q3: Layoff signal checker |
| `scripts/backfill-normalized-text.ts` | G7: One-time backfill script |

### Modified Files

| File | Changes |
|---|---|
| `src/db/schemas/jobs/job.ts` | Add `normalizedText` column (G7) |
| `src/db/schemas/jobs/company.ts` | Add `canonicalName` column (F3), new tier values (G1) |
| `src/db/schemas/jobs/enums.ts` | Add `smartrecruiters`, `recruitee`, `workable` to `atsSourceEnum`. Add `active_hot` to `companyTierEnum`. Add new `discoverySource` values. |
| `src/lib/jobs/ats-endpoints.ts` | Add SmartRecruiters, Workable, Recruitee configs (F2) |
| `src/lib/jobs/job-normalizer.ts` | Add `normalizeAggregatorJob()` (G3). Update `normalizeJob()` to write `normalizedText` and NULL `rawJson` (G7). |
| `src/inngest/functions.ts` | Replace `pollCompanyFn` + `tierActiveFanOut` + `tierDormantFanOut` with `batchPollTier` (G5+G6). Add `aggregatorJobHandler` (G3). Add `staleJobVerifier` (G4). Add daily source functions (D1-D13). Add `qualityFlywheelRecalc` (Q2). Add `layoffSignalChecker` (Q3). Update `gate3Evaluator` to use `normalizedText` (G7). |
| `src/inngest/client.ts` | Add `job/aggregator-ingested` event type (G3) |
| `src/lib/jobs/seeders/bigquery-seeder.ts` | Expand to 6 partitions (B6). Add Workable to Wappalyzer filter. |
| `src/lib/jobs/seeders/resolve-custom-url.ts` | Refactor to use Slugger (F1) for name-based resolution |

---

## 8. IMPLEMENTATION ORDER (STRICT)

| Order | Item | Prerequisite | Est. Effort |
|---|---|---|---|
| 1 | G7: Add `normalizedText` column + migration + backfill script | None | 0.5 day |
| 2 | G7: Update `job-normalizer.ts` + `gate3Evaluator` to use `normalizedText` | #1 | 0.5 day |
| 3 | G7: Run backfill script on existing 4,086 jobs | #2 | 0.5 day |
| 4 | G5: Create `batchPollTier` function, remove `pollCompanyFn` + fan-outs | #2 | 1 day |
| 5 | G6: Add normalize + embed + Gate 1+2 steps to `batchPollTier` | #4 | 1.5 days |
| 6 | F2: Add 3 new ATS to `ats-endpoints.ts` + enums + adapters + Zod schemas | #2 | 2 days |
| 7 | F1: Create `slugger.ts` with name normalization + slug probe + DB cache + retry queue | #6 | 2 days |
| 8 | F1: Add `canonicalName` to `company` schema + `sluggerRetry` table + migration | #7 | 0.5 day |
| 9 | G4: Create `staleJobVerifier` function | #2 | 0.5 day |
| 10 | G3: Add `normalizeAggregatorJob()` + `aggregatorJobHandler` function + event type | #2 | 1 day |
| 11 | Q1: Add quality probe logic to Slugger insertion path | #7 | 0.5 day |
| 12 | B6: Expand BigQuery to 6 partitions | #6 | 0.5 day |
| 13 | B1: Workable meta-search seeder | #6 | 1 day |
| 14 | B2/D1: Google CSE seeder (batch + daily) | None | 1 day |
| 15 | B3: YC directory seeder | #7 | 1 day |
| 16 | B7: Wayback CDX seeder | None | 0.5 day |
| 17 | D2: HN Algolia daily seeder | None | 0.5 day |
| 18 | D3: Reddit RSS seeder | None | 0.5 day |
| 19 | D4/D5: Remote aggregator seeders (Remote OK, Remotive, Himalayas, WWR, Jobicy) | #7, #10 | 2 days |
| 20 | Fire batch sources (B1-B10) — THE FLUSH | All batch sources | 0.5 day |
| 21 | Wire daily sources (D1-D13) with staggered crons | All daily sources | 0.5 day |
| 22 | B4: VC portfolio mining | #7 | 2 days |
| 23 | B5: Newsletter archive mining | #7 | 1 day |
| 24 | B8: Rapid7 CNAME reversal | #7 | 2 days |
| 25 | B9: Cross-pollination from job descriptions | #7 | 0.5 day |
| 26 | B10: Sitemap.xml probing | #7 | 0.5 day |
| 27 | D6: CertStream processor | #7 | 2 days |
| 28 | D7: Funding signal seeder | #7 | 2 days |
| 29 | D8: Product Hunt seeder | #7 | 1 day |
| 30 | D9: Engineering blog RSS | #7 | 2 days |
| 31 | D10: GitHub trending scan | #7 | 1.5 days |
| 32 | D11: Tech news + LLM extraction | #7 | 1.5 days |
| 33 | D12: NPM registry monitoring | #7 | 1 day |
| 34 | D13: Meta Ads Library | #7 | 2 days |
| 35 | G1: Adaptive polling cadence (new tier + cron schedules) | #4 | 1 day |
| 36 | Q2: Quality flywheel | #11 | 3 days |
| 37 | Q3: Layoff signal checker | None | 1 day |
| 38 | Q4: Bootstrap polling (new company 2h cadence for 48h) | #35 | 0.5 day |
| 39 | Q5: Multi-intent fusion scoring | #36 | 1 day |

**Total estimated effort: ~35-40 days of implementation.**

Items 1-21 are Sprint 1 (infrastructure + first batch + first daily sources). Items 22-34 are Sprint 1 continued (remaining sources). Items 35-39 are Sprint 2 (quality architecture).

---

## 9. TESTING STRATEGY

### 9.1 Unit Tests (Vitest)

- `slugger.ts`: `canonicalizeCompanyName()`, `generateSlugVariants()`, `resolveSlugger()` (mocked DB, DNS, fetch)
- `normalizeAggregatorJob()`: HTML stripping, tag extraction, Gate 0
- Each new ATS adapter: Zod validation, NormalizedJob output
- Quality probe tier assignment logic
- `canonicalizeCompanyName()` edge cases (suffixes, punctuation, acronyms)

### 9.2 Integration Tests (Vitest)

- `batchPollTier` with mocked `pollCompany`, `normalizeJob`, `embedJob`, `runGateSQLRouter`
- `aggregatorJobHandler` with mocked DB and AI SDK
- `staleJobVerifier` with mocked ATS responses

### 9.3 E2E Tests (Playwright)

- No new E2E tests needed for the pipeline itself (it's all background jobs)
- Existing `/dashboard/jobs` E2E should continue to pass
- Add a Playwright test verifying that the dashboard shows matches after the flush (requires test database with seeded companies)

### 9.4 Manual Verification

- After Sprint 1 infrastructure: run the flush against real batch sources, verify company count increases from 449 to 2,000+
- Monitor Inngest dashboard for execution count (should be < 25K in first month)
- Monitor Neon dashboard for storage (should be < 450MB after G7 backfill)
- Monitor Neon compute hours (should be < 80 CU-hours in first month)
- Verify daily match count on dashboard reaches 5+ within 2 weeks
