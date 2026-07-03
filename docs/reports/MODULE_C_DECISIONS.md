# Module C Decisions — Locked

**Status:** Pre-implementation Decision Phase (Step 10 prerequisite)
**Date:** June 2026
**Scope:** Records the final binding decisions for Module C (Event-Driven Routing — The 3-Gate Funnel). These supersede any conflicting guidance in the TDD §5 or blueprint. The TDD §5 is ~55 lines and underspecified for the most complex module; this document closes the gaps and locks the undefined decisions before any Module C code is written.

**Governing principle:** Module A had `MODULE_A_DECISIONS.md` and it paid off. Module C is more complex (multi-gate, multi-LLM, concurrent fan-out) and has less spec — it needs this even more. No Module C code is written until this document is reviewed and accepted.

---

## 1. Schema Changes — Job Table

### 1.1 New `status` values: `rejected` and `normalization_failed`

The current `job.status` is a free-text column with values `active | stale | gone` (set by Module B). Module C adds two new statuses produced during Step 1 (Normalization):

| Status | Set by | Meaning | Reaches Gates 1+2? |
|---|---|---|---|
| `active` | Module B (default) | Freshly ingested, awaiting normalization | Only after normalization populates tags + embedding |
| `stale` | Module B (`staleCleanup` cron) | Not seen in 7 days | No |
| `gone` | Module B (`staleCleanup` cron) | Not seen in 30 days | No |
| `rejected` | Module C (Normalizer) | Garbage job — Gate 0 false positive, garbled listing, non-dev content. Tombstone. | No |
| `normalization_failed` | Module C (Normalizer) | System failure — LLM fallback call failed (rate limit, timeout, OpenAI outage). Distinguishable from `rejected` for retry sweeps. | No (until retried) |

**Why two new statuses, not one:** Conflating "garbage job" with "system failure" destroys observability. A `rejected` job is permanently useless. A `normalization_failed` job is useful once OpenAI recovers — a future retry sweep (`WHERE status = 'normalization_failed'`) can re-process them without re-running garbage jobs. This distinction is the same principle as Module A's `cvUpload` status enum (`invalid` vs `abandoned`).

**Implementation:** `job.status` is currently `text` (not a pgEnum), so no enum migration is needed — only a documentation update and a check constraint if desired. The values are enforced by application code in the Normalizer.

### 1.2 New column: `normalizedAt timestamp`

Added to `job` table. Set when Module C completes normalization (tags + embedding written). Serves two purposes:
1. **Idempotency guard:** `jobIngestedHandler` checks `IF normalizedAt IS NOT NULL → skip` (event re-delivery is safe).
2. **Retry sweep filter:** `WHERE status = 'normalization_failed' AND normalizedAt IS NULL` identifies jobs that failed before completing normalization.

Nullable. Null = never processed by Module C.

---

## 2. Schema Changes — `matchQueue` Table

The current `matchQueue` schema is incomplete for Gates 2 & 3 and has a correctness bug in its unique index. Both must be fixed before any matching code is written.

### 2.1 New columns

| Column | Type | Purpose |
|---|---|---|
| `personaId` | `uuid NOT NULL REFERENCES persona(id) ON DELETE CASCADE` | **Which persona matched.** Required for multi-persona users (up to 3) — without this, the UI cannot say "Matched on your React persona" and Gate 3 debugging is blind. |
| `cosineDistance` | `real` | Gate 2 HNSW cosine distance (0.0–2.0, lower is better). Stored for ranking, debugging, and calibration. Named `cosineDistance` not `similarityScore` to prevent a future `ORDER BY ... DESC` bug — distance is "lower is better," similarity is "higher is better," and conflating them in a column name is a sorting-bug magnet. |
| `llmVerdict` | `text` | Gate 3 result: `approved` \| `rejected` \| `error`. |
| `llmReasoning` | `text` | Gate 3 LLM explanation (1–3 sentences). Audit trail for false positive/negative debugging. |
| `llmModel` | `text` | Which model evaluated: `gpt-4o-mini` (MVP) \| `gpt-4o` (escalation, post-MVP). |
| `evaluatedAt` | `timestamp` | When Gate 3 ran. Null until Gate 3 completes. |
| `isRead` | `boolean NOT NULL DEFAULT false` | In-app notification badge (§8). |

### 2.2 Unique index fix: `(jobId, applicantId)` → `(jobId, personaId)`

**Problem:** The current `match_queue_unique` index on `(jobId, applicantId)` prevents a multi-persona user from having multiple matches for the same job via different personas. A user with a "React Developer" persona and a "Node.js Backend" persona could legitimately match the same full-stack job through both. The current index silently drops the second match.

**Decision:** Drop `match_queue_unique` on `(jobId, applicantId)`. Create `match_queue_unique_persona` on `(jobId, personaId)`. This is the correct uniqueness constraint — a persona matches a job at most once, but an applicant (via different personas) can match the same job multiple times.

**Migration note:** This is a destructive index change on an existing table. The table is currently empty (Module C not implemented), so no data backfill is needed. Migration must drop the old index before creating the new one.

### 2.3 New indexes: dashboard list + unread badge

Two indexes, one per query pattern:

1. **`match_queue_applicant_status_idx`** on `(applicantId, status, createdAt DESC)` — supports the dashboard list query `WHERE applicant_id = ? AND status = 'approved' ORDER BY created_at DESC`. The `createdAt DESC` in the index means Postgres can return rows in sorted order without an in-memory sort. (The prior `(applicantId, status, isRead)` ordering supported the filter but not the sort, forcing a sort step on every page load.)

2. **`match_queue_unread_badge_idx`** — partial index `ON match_queue (applicantId) WHERE isRead = false AND status = 'approved'`. Supports the badge count query `WHERE applicant_id = ? AND isRead = false AND status = 'approved'`. A partial index is smaller and faster than folding `isRead` into the main index, because it only indexes the unread rows (a small fraction of total matches).

---

## 3. Inngest Event Catalog Additions

The current `VectorMatchEvents` interface in `src/inngest/client.ts` defines `job/ingested` and Module B events. Module C adds two new events. Added to the same interface, same convention-based typing pattern.

### 3.1 `match/gate-3-evaluate`

Emitted by `jobIngestedHandler` after Gate 1+2 inserts candidate rows into `matchQueue`. One event per candidate row → one `gate3Evaluator` function instance per candidate (maximum parallelism, maximum failure isolation).

```typescript
"match/gate-3-evaluate": {
  data: {
    matchQueueId: string;   // The matchQueue row to update with the verdict
    jobId: string;          // For fetching job context
    personaId: string;      // For fetching persona + applicant context
    applicantId: string;    // For fetching applicant preferences
  };
};
```

### 3.2 `match/approved`

Emitted by `gate3Evaluator` when the LLM verdict is `approved`. Consumed by:
- **MVP:** The dashboard polling query picks up `status = 'approved'` rows directly — this event is not strictly required for MVP notification.
- **Post-MVP:** Module D (cold email generation) listens for this event to generate the "Minute Zero" pitch.

**Decision:** Define the event in the catalog now (so Module D's contract is stable), but do not build a listener for MVP. The `gate3Evaluator` emits it via `step.sendEvent()` for forward compatibility.

```typescript
"match/approved": {
  data: {
    matchQueueId: string;
    jobId: string;
    applicantId: string;
    personaId: string;
  };
};
```

---

## 4. Normalization Rules (Step 1)

### 4.1 ATS-Source-Aware Content Extraction (Prerequisite)

**Problem (gap found in final review):** The `job.rawJson` column stores `JSON.stringify(rawJobs[i])` — the original ATS platform JSON, not a normalized shape. The description field name and format vary by ATS source:

| ATS | Title field | Description field | Format |
|---|---|---|---|
| Greenhouse | `title` | `content` | HTML |
| Lever | `text` | `descriptionPlain` (preferred) / `description` (HTML fallback) | Plain text / HTML |
| Ashby | `title` | `description` | HTML / Markdown |

The normalizer cannot generically "parse rawJson" — it must know which field to extract per platform. The existing `ats-adapters.ts` only normalizes `{ externalJobId, title, rawJson, url }` — it does NOT extract the description (Module B doesn't need it; Module C does).

**Decision:** Create `extractJobContent(atsSource: string, rawJson: string): { title: string; description: string; fullText: string }` in `src/lib/jobs/job-normalizer.ts`. This function:
1. Parses `rawJson` as JSON.
2. Based on `atsSource` (`"greenhouse" | "lever" | "ashby"`), extracts the description from the correct field.
3. Strips HTML tags (for Greenhouse/Ashby) — use a lightweight approach (regex `<[^>]*>` replacement or the `html-to-text` library if already available; check `package.json` before adding a dependency).
4. Returns `{ title, description (plain text), fullText: title + " " + description }` — `fullText` is the input to both the regex tag scan and the embedding generator.

**Defensive handling:** If `atsSource` is unknown or the expected field is missing, return `{ title: job.title (from the job row), description: "", fullText: job.title }`. The normalizer proceeds with title-only text — the regex scan may still find tags in the title, and the LLM fallback gets the title as context. Log a warning. This degrades gracefully rather than crashing on an unexpected ATS payload shape.

**Future ATS platforms:** When SmartRecruiters/Recruitee/Workable are added (Phase 2), add their field mappings to `extractJobContent`. The function is the single point of ATS-source-awareness for Module C.

### 4.2 Tag Extraction Strategy

Two-phase, same cost-confidence layering principle as Module A's CV Domain Gate (§13):

**Phase 1 — Regex dictionary (zero cost, medium recall):**
- Scan `extractJobContent(...).fullText` (title + cleaned description) for canonical tag labels using word-boundary regex, same `\b{label}(?![\w])` pattern as Module A Layer 1.
- Derive the dictionary from `CANONICAL_TAGS` at module load (no drift risk when tags are added).
- Map detected labels to canonical tag slugs via `CANONICAL_TAG_MAP`.

**Phase 2 — LLM fallback (one `gpt-4o-mini` call, high recall):**
- Triggered if Phase 1 yields `< GATE_NORMALIZATION_MIN_PERSONA_TAGS` `persona_defining` tags.
- Uses `generateObject` with a Zod schema returning `{ canonicalTags: string[] }`.
- System prompt includes the full `CANONICAL_TAGS` list (same pattern as Module A's CV extraction) so the LLM maps free-text to canonical slugs, not invents new ones.
- The LLM sees `extractJobContent(...).fullText` (title + cleaned description), not the raw ATS JSON.

### 4.3 Rejection Threshold

```typescript
GATE_NORMALIZATION_MIN_PERSONA_TAGS = 1;
```

**Decision:** The threshold is **1 `persona_defining` tag** (not 1–2 generic tags). Rationale: supporting tags like `css`, `git`, `html` appear in non-engineering job descriptions (design, QA, marketing tech). A `persona_defining` tag (`react`, `python`, `kubernetes`, `aws`) unambiguously indicates a developer role. This mirrors Module A's Layer 2 refine (≥1 `persona_defining` tag in `canonical_skills_detected`).

**Flow:**
1. Run Phase 1 regex → get `extractedTags`.
2. Count `persona_defining` tags in `extractedTags` (via `PERSONA_DEFINING_TAGS` Set).
3. If count ≥ 1 → proceed to embedding generation.
4. If count < 1 → run Phase 2 LLM fallback.
5. After Phase 2, recount. If still < 1 → `UPDATE job SET status = 'rejected', normalizedAt = NOW()`. Stop. Job is a tombstone.
6. If Phase 2 LLM call fails (rate limit, timeout, outage) → `UPDATE job SET status = 'normalization_failed'` (**do NOT set `normalizedAt`**). Inngest retries the step per its default retry policy; if retries exhaust, the job stays `normalization_failed` for a future sweep. **Why no `normalizedAt`:** `normalizedAt` means "Module C has finished processing this job." A failed normalization has NOT finished — it must remain retryable. Setting `normalizedAt` on failure would cause §4.6's idempotency guard (`IF normalizedAt IS NOT NULL → return early`) to skip the retry, and §1.2's sweep filter (`WHERE normalizedAt IS NULL`) to never find it — turning `normalization_failed` into a permanent tombstone identical to `rejected`, defeating the entire purpose of the two-status split. Only set `normalizedAt` on terminal outcomes: successful normalization (step 3/5 → `active` with tags+embedding) or rejection (step 5 → `rejected`).

### 4.4 Embedding Generation

- Combine job title + cleaned description (HTML stripped from `rawJson`) into a single text block.
- Call `generateEmbedding()` (promoted from `src/lib/onboarding/embeddings.ts` to `src/lib/ai/embeddings.ts` — see §9).
- Model: `text-embedding-3-small` (1536-d). **Must match persona embeddings** — Gate 2 only works if both vectors are in the same embedding space. This is already guaranteed by Module A.
- Store result in `job.jobEmbedding`.

### 4.5 `jobIngestedHandler` Concurrency Limit

**Decision:** Set `concurrency: { limit: 15 }` on `jobIngestedHandler`.

**Problem this solves (gap found in final review):** The current placeholder has no concurrency limit. Module B's `pollCompanyFn` runs at concurrency 50 — if 50 companies poll concurrently and each inserts 5 new jobs, that's 250 `job/ingested` events → 250 concurrent `jobIngestedHandler` instances. Each does an LLM normalization call (when regex fallback triggers) + an embedding API call + DB queries. 250 concurrent OpenAI calls would hit rate limits, and 250 concurrent DB operations would exhaust the pool.

**Why 15, matching `gate3Evaluator`:** Each handler instance is mostly waiting for I/O (LLM call ~2-3s, embedding ~200ms), not holding DB connections. With the stateless step pattern (§6.4), DB connections are acquired and released per step (~50ms each). At concurrency 15, only ~3-4 instances are actively holding DB connections at any moment (the rest are waiting for LLM/embedding). Combined with `gate3Evaluator` at concurrency 15, peak concurrent DB access is ~20-25 with partial overlap — within the pool `max: 20` budget (§7.2). The OpenAI call rate (15 concurrent embeddings + ~4 concurrent LLM normalizations) is well within tier 1 limits.

```typescript
export const jobIngestedHandler = inngest.createFunction(
  {
    id: "job-ingested-handler",
    name: "Job Ingested — Trigger 3-Gate Funnel",
    triggers: [{ event: "job/ingested" }],
    concurrency: { limit: 15 },
  },
  async ({ event, step }) => { /* §4.6 decision tree + steps */ },
);
```

### 4.6 `jobIngestedHandler` Idempotency Decision Tree

At the top of the handler, before any work:

```
FETCH job by jobId
IF job.normalizedAt IS NOT NULL:
  → already processed, return early (idempotency — safe for event re-delivery)
IF job.status = 'rejected':
  → garbage tombstone, return early
IF job.status = 'normalization_failed':
  → retry normalization (this is why we distinguish it from 'rejected')
IF job.status IN ('stale', 'gone'):
  → job aged out before normalization; return early (Module C only matches 'active')
ELSE (status = 'active', normalizedAt IS NULL):
  → run normalization → embedding → Gate 1+2 → Gate 3 fan-out
```

---

## 5. Gate 1 & 2 — The SQL Router

### 5.1 Raw SQL via Drizzle `sql` Template Literal

**Decision:** Use `db.execute(sql\`...\`)`, not Drizzle's query builder. The `&&` (array overlap) and `<=>` (cosine distance) operators are PostgreSQL-specific and not safely expressible in Drizzle's builder. This is explicitly permitted by AGENTS.md ("no raw SQL unless for complex vector/GIN queries").

**Implementation:** A named, typed, testable function — not inline SQL in the Inngest handler:

```typescript
// src/lib/jobs/gate-1-2.ts
export type GateRouterCandidate = {
  personaId: string;
  applicantId: string;
  overlapScore: number;
  cosineDistance: number;
};

export async function runGateSQLRouter(
  jobId: string,
  jobTags: string[],
  jobEmbedding: number[],
): Promise<GateRouterCandidate[]>;
```

This signature makes the router unit-testable (assert SQL shape, assert result parsing) without spinning up Inngest, and makes the Gate 3 fan-out type-safe.

### 5.2 The Query

> **Bug fix (review round 1):** The TDD §5.2 original used `cardinality(p.must_have_tags & ${jobTags}::text[])` for the overlap count. The `&` (array intersection) operator exists **only** in the `intarray` extension and **only** for `integer[]` — it does not exist for `text[]`. On `text[]` this errors with `operator does not exist: text[] & text[]`. This bug was inherited verbatim from the TDD and never surfaced because the query was never run. The `&&` (overlap, boolean) in the WHERE clause is fine — it's a built-in polymorphic operator. The fix uses `unnest` + `= ANY` inside a `LATERAL` subquery so the count is evaluated once per persona, not repeated in SELECT and ORDER BY.

```sql
INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
SELECT
  ${jobId}::uuid,
  p.id,
  p.applicant_id,
  ov.overlap_score,
  (p.persona_embedding <=> ${jobEmbedding}::vector) AS cosine_distance,
  'pending'
FROM persona p
-- LATERAL: compute overlap count once per persona (replaces invalid `&` operator)
CROSS JOIN LATERAL (
  SELECT count(*) AS overlap_score
  FROM unnest(p.must_have_tags) AS t(tag)
  WHERE t.tag = ANY(${jobTags}::text[])
) ov
WHERE
  -- GATE 1: GIN Index Array Overlap (≥1 must-have tag hit, zero blocklist hits)
  (p.must_have_tags && ${jobTags}::text[])
  AND NOT (p.blocklist_tags && ${jobTags}::text[])
  -- GATE 2: HNSW Vector Similarity (cosine distance threshold)
  -- Distance kept in direct form (not LATERAL) to preserve HNSW index pushdown
  AND (p.persona_embedding <=> ${jobEmbedding}::vector) < ${gate2MaxDistance}::real
  -- Only match against personas with non-null embeddings
  AND p.persona_embedding IS NOT NULL
ORDER BY
  -- Composite score: weighted blend of Gate 1 (tag overlap) and Gate 2 (similarity)
  (
    ov.overlap_score * ${gate1Weight}::real
    + (1 - (p.persona_embedding <=> ${jobEmbedding}::vector)) * ${gate2Weight}::real
  ) DESC
LIMIT ${gateRouterLimit}
ON CONFLICT (job_id, persona_id) DO NOTHING
RETURNING id, persona_id, applicant_id, overlap_score, cosine_distance;
```

**Why `LATERAL` for overlap but not for distance:** The overlap count via `unnest`/`= ANY` is a per-row computation that benefits from single evaluation. The cosine distance is kept in direct form (`p.persona_embedding <=> ${jobEmbedding}::vector`) in the WHERE clause, SELECT, and ORDER BY — not wrapped in a LATERAL subquery — because HNSW index pushdown requires the operator to appear directly in the query, not behind an alias. PostgreSQL may common-subexpression-eliminate the repeated distance computation; if `EXPLAIN ANALYZE` shows it evaluated 3× per row and that's a bottleneck, a `LATERAL` distance subquery can be revisited (but verify HNSW index usage is preserved).

### 5.3 Thresholds and Weights (Calibration Status)

All magic numbers are **config values, not literals**. They live in a single config object and are marked with their calibration status:

| Constant | Initial Value | Calibration Status | Location |
|---|---|---|---|
| `GATE2_MAX_COSINE_DISTANCE` | `0.35` | **Uncalibrated guess.** `< 0.35` = cosine similarity `> 0.65`. Must be benchmarked against 20–30 real job/persona pairs in Feature C6 before launch. | `src/lib/jobs/matching-config.ts` |
| `GATE_ROUTER_LIMIT` | `8` | **Uncalibrated guess.** If all 8 fail Gate 3, no re-run with wider net in MVP (post-MVP: dynamic widening). | `src/lib/jobs/matching-config.ts` |
| `GATE1_WEIGHT` | `0.6` | **Uncalibrated guess.** Weight of tag overlap in composite ordering. | `src/lib/jobs/matching-config.ts` |
| `GATE2_WEIGHT` | `0.4` | **Uncalibrated guess.** Weight of vector similarity in composite ordering. `GATE1_WEIGHT + GATE2_WEIGHT = 1.0`. | `src/lib/jobs/matching-config.ts` |

**Why composite ordering instead of pure `overlap_score DESC`:** A candidate with `overlapScore = 5, cosineDistance = 0.34` (barely passed Gate 2 threshold of 0.35) should not outrank a candidate with `overlapScore = 3, cosineDistance = 0.05` (very strong semantic match). Pure overlap ordering ignores the Gate 2 signal after the threshold filter. The composite blend accounts for both — note that `1 - cosineDistance` converts distance to similarity for the weighting (higher similarity = higher score). The weights are guesses until calibrated — do not enshrine them as final.

### 5.4 Edge Cases

| Case | Handling |
|---|---|
| `jobTags` is empty (normalization yielded 0 tags but ≥1 persona_defining — impossible per §4.3, but defensive) | Skip Gate 1 (`&&` with empty array matches nothing), rely on Gate 2 alone. Log warning. |
| No personas pass Gates 1+2 | Return empty array. `jobIngestedHandler` logs "no matches" and completes. No Gate 3 fan-out. |
| All candidates blocklisted | Same as above — the `NOT (p.blocklist_tags && ...)` clause filters them. |
| `jobEmbedding` is null (embedding generation failed) | This should not happen — normalization sets `normalization_failed` before reaching gates. Defensive: if null, skip Gate 2, run Gate 1 only with `LIMIT 8`. Log error. |

### 5.5 Performance Verification

After implementing the query, run `EXPLAIN ANALYZE` against the dev database with the seed data (§10). **Verify both indexes are used:**
- `persona_must_have_tags_idx` (GIN) for the `&&` clause
- `persona_embedding_hnsw_idx` (HNSW) for the `<=>` clause

If the plan shows `Seq Scan` on either, stop and fix before proceeding. The <20ms target is achievable only with both indexes. Common causes of index miss: vector wrapped in a subquery that prevents pushdown, or a function call on the vector column that breaks index usage.

**HNSW + composite ordering caveat:** pgvector's HNSW index is optimized for `ORDER BY col <=> constant LIMIT n` (pure KNN search). Our ORDER BY is a composite expression (`overlap * w1 + similarity * w2`), not pure distance. This means the HNSW index may **not** be used for the ORDER BY — PostgreSQL may fall back to evaluating all rows that pass the WHERE filter, computing the composite score, then sorting in-memory. At MVP scale (~1,000 personas from the seed script), this is fast enough (sequential scan + sort on ~1k rows is <5ms). At production scale (100k+ personas), this becomes a bottleneck. Two mitigation paths if `EXPLAIN ANALYZE` shows `Seq Scan` on the HNSW index at scale:
1. **Two-phase query:** First `ORDER BY persona_embedding <=> constant LIMIT N*3` (HNSW index scan, pure KNN), then re-rank the top N*3 candidates by composite score in-memory. Trades a slightly wider initial net for index usage.
2. **Filtered KNN:** pgvector 0.8+ supports filtered HNSW search (`WHERE` clauses combined with the index). Verify the installed pgvector version supports this.

For MVP, verify the query completes in <20ms against the 1,000-persona seed dataset. If it does, ship it. The scale optimization is a post-MVP concern — do not over-engineer before you have real scale data.

---

## 6. Gate 3 — The LLM Arbiter

### 6.1 Inngest Function Design

A separate function `gate3Evaluator`, triggered by `match/gate-3-evaluate`, concurrency limit **15** (separate from Module B's `pollCompanyFn` concurrency 50 — Inngest concurrency is per-function, not global).

```typescript
export const gate3Evaluator = inngest.createFunction(
  {
    id: "match-gate-3-evaluator",
    name: "Gate 3 — LLM Candidate Evaluation",
    triggers: [{ event: "match/gate-3-evaluate" }],
    concurrency: { limit: 15 },
    // No checkpointing: true for MVP — see §11.3 for rationale
  },
  async ({ event, step }) => {
    // §6.4 step structure
  },
);
```

**Why concurrency 15, not 50:** At 15 concurrent Gate 3 evaluations, each holding a DB connection for ~100ms (read) + ~100ms (write) around a ~3–5s LLM call, the Neon pooler sees ~30 short-lived connection acquisitions per second — well within PgBouncer's transaction-mode budget. At 50, the DB-side pressure becomes risky. 15 is a conservative starting point; tune empirically post-launch against observed Neon pool metrics.

**Registration (critical, easy to forget):** `gate3Evaluator` must be added to the `functions: [...]` array in `src/app/api/inngest/route.ts` alongside the existing 10 functions. Per AGENTS.md rule 7: "Register new functions in `src/app/api/inngest/route.ts` — both import and add to the `functions: [...]` array." The function will not be discovered by the Inngest Dev Server or Inngest Cloud without this registration. The existing `jobIngestedHandler` is already registered (line ~54 in route.ts) — it will be modified in place, not re-registered.

### 6.2 `step.ai.wrap()` — Not `step.ai.infer()`

**Decision:** Use `step.ai.wrap()` with Vercel AI SDK `generateObject`. Do not use `step.ai.infer()`.

**Rationale (verified against Inngest v4.8.0 docs and installed SDK):**
- `step.ai.infer()` offloads inference to Inngest's infrastructure, pausing function execution. The cost saving is specific to **serverless** platforms (you don't pay for function compute while waiting for the LLM). VectorMatch is self-hosted on Hetzner CAX21 — a persistent process. There is no serverless compute billing to save.
- `step.ai.infer()` routes all LLM traffic through Inngest's proxy, introducing an external dependency and latency on every Gate 3 call. On self-hosted, this is pure overhead with no benefit.
- `step.ai.wrap()` wraps the existing Vercel AI SDK call as a step, adding observability (prompts, tokens, latency in the Inngest dashboard) without routing traffic through Inngest. It matches the existing Module A pattern (`generateObject` directly) and keeps all inference on our own OpenAI API key.

```typescript
const verdict = await step.ai.wrap("gate-3-evaluate", generateObject, {
  model: openai("gpt-4o-mini"),
  schema: gate3VerdictSchema,
  system: gate3SystemPrompt,
  prompt: buildGate3Prompt(job, persona, applicant),
});
```

### 6.3 Gate 3 I/O Schema

**Output schema (Zod, enforced by `generateObject`):**

```typescript
const gate3VerdictSchema = z.object({
  approved: z.boolean().describe("Whether this job is a strong match for this persona"),
  matchConfidence: z.number().min(0).max(1).describe("Confidence score 0.0–1.0"),
  matchReasoning: z.string().min(1).max(500).describe("1–3 sentence explanation of the verdict"),
  blockers: z.array(z.string()).describe("Hard disqualifiers if rejected (e.g., 'web3 on blocklist', 'requires on-site in SF')"),
});
```

**Input context (built by `buildGate3Prompt`):**

| Source | Fields | Why |
|---|---|---|
| Job | `title`, cleaned description (from `rawJson`), `extractedTags` | What the job is |
| Persona | `personaLabel`, `embeddingSummary`, `mustHaveTags`, `blocklistTags` | Who the user is, as they described themselves |
| Applicant | `allTags` (full skill knowledge base), `country`, `canWorkUsHours`, `preferredCompliance`, `modalities`, `assignmentTypes` | Hard constraints and full skill context |

**Why the full applicant context:** The TDD says Gate 3 evaluates "nuanced preferences (e.g., 'Must be B2B, no web3')." But `applicant` has `preferredCompliance`, `modalities`, `assignmentTypes` — these are hard constraints that belong in the prompt. A job requiring on-site in San Francisco should be rejected for a user whose `assignmentTypes = ['remote']` regardless of tag overlap. Without these in the prompt, Gate 3 is blind to logistics.

### 6.4 Step Structure (Stateless DB Pattern)

Each `step.run()` boundary is a checkpoint — DB connections acquired inside a step are released when the step completes. The anti-pattern is acquiring a connection in the outer function body and holding it across `step.ai.wrap()`.

```
step.run("fetch-context")    → read job + persona + applicant from DB, release connection
step.ai.wrap("evaluate")     → LLM call, NO DB connection held
step.run("write-verdict")    → update matchQueue row (verdict, reasoning, model, evaluatedAt, status), release connection
step.sendEvent("emit-approved") → if approved, emit match/approved for Module D (fire-and-forget)
```

### 6.5 Gate 3 Failure Handling

| Failure | Handling |
|---|---|
| LLM call fails (rate limit, timeout) | Inngest retries the `step.ai.wrap` step per default policy. `matchQueue.status` stays `pending`. |
| LLM returns unparseable output | `generateObject` throws `AI_ZodError`. Caught → `UPDATE matchQueue SET llmVerdict = 'error', status = 'pending'`. Flagged for manual review or retry. |
| All retries exhaust | `matchQueue.status` stays `pending`. A future sweep can re-emit `match/gate-3-evaluate` for `pending` rows older than N hours. |

---

## 7. Database Connection Pool Strategy

### 7.1 Neon Pooler URL (Required)

`src/db/db.ts` must use the Neon **pooler** connection string (hostname with `-pooler` suffix), not the direct connection. The pooler runs PgBouncer in transaction mode, multiplexing up to 10,000 client connections over a smaller pool of real Postgres connections.

**Runtime guard (add to `db.ts`):**

```typescript
if (!databaseUrl.includes("-pooler")) {
  console.warn(
    "DATABASE_URL does not use the Neon pooler endpoint — " +
    "connection exhaustion risk under concurrent Inngest fan-out"
  );
}
```

This 3-line guard prevents a future misconfiguration from crashing production under Gate 3 fan-out.

### 7.2 Pool `max` Setting

**Decision:** Set `max: 20` on the `pg.Pool` constructor in `db.ts`.

**Rationale (correcting a prior recommendation):** A `max: 5` recommendation was based on conflating client-side pool size with database connection count. With Neon's PgBouncer in transaction mode, these are decoupled — the pooler multiplexes client connections. At `max: 5`, all DB access in the Node process serializes, and Inngest steps queue waiting for a connection — the opposite of the goal. With Gate 3 concurrency 15 + Module B poller concurrency 50, peak concurrent DB access could reach ~65. `max: 20` gives headroom for concurrent steps while the pooler manages DB-side pressure. The previous `max: 5` would have been a self-inflicted bottleneck.

```typescript
const pool = new Pool({ connectionString: databaseUrl, max: 20 });
```

### 7.3 Why Not the HTTP `neon()` Driver

The TDD already locks this: `db.ts` uses the `Pool` (WebSocket) driver, not the HTTP `neon()` driver, because the HTTP driver does not support transactions (required by Module A's `recomputeTagsExperience()`). This decision is unchanged by Module C. The stateless pattern in §6.4 works with the Pool driver — connections are released at step boundaries, not held across LLM calls.

---

## 8. Notification System — In-App Polling (MVP)

**Decision:** In-app polling, no email/push/SSE for MVP.

**Rationale:** The server is persistent (Hetzner, not serverless). A 30-second polling interval is imperceptible for job matching. Zero new infrastructure. The dashboard query already needs to fetch `matchQueue` rows to display them — the same query yields the unread count.

### 8.1 Dashboard Query

```sql
-- /dashboard/jobs page
SELECT * FROM match_queue
WHERE applicant_id = $userId AND status = 'approved'
ORDER BY created_at DESC;

-- Sidebar unread badge count
SELECT COUNT(*) FROM match_queue
WHERE applicant_id = $userId AND is_read = false AND status = 'approved';
```

The `match_queue_applicant_status_idx` index (§2.3) supports both queries.

### 8.2 `isRead` Column

Added to `matchQueue` (§2.1). Defaults to `false`. Set to `true` when the user views the match (Server Action on the `/dashboard/jobs` page, or on click of a specific match). Drives the red notification badge on the sidebar.

### 8.3 Polling Interval

30 seconds. Client-side `useEffect` with `setInterval`, fetching the unread count via a Server Action or route handler. Cancel on unmount. No WebSocket, no SSE — these are post-MVP.

### 8.4 Module D Boundary

When Gate 3 approves a match, `gate3Evaluator` emits `match/approved` (§3.2). For MVP, nothing listens — the dashboard polls `matchQueue` directly. Module D (cold email generation) will listen for `match/approved` post-MVP. The event contract is defined now so Module D's interface is stable.

---

## 9. Embedding Utility Promotion

**Decision:** Move `generateEmbedding()` and `generateEmbeddings()` from `src/lib/onboarding/embeddings.ts` to `src/lib/ai/embeddings.ts`.

**Rationale:** Module C is not "onboarding." Importing embedding utilities from the onboarding module is a boundary smell that will worsen as Module D also needs embeddings. The `src/lib/ai/` directory becomes the shared home for AI SDK utilities (embeddings now; prompt builders, model configs later).

**Migration:** Move the file, update imports in Module A onboarding code, re-export from the old path temporarily if needed to avoid a large diff. The function signatures and behavior are unchanged.

---

## 10. Dummy Data Strategy — `scripts/seed-routing-engine.ts`

**Problem:** 3 jobs / 5 users is insufficient for stress-testing a routing engine. We need volume and clusters of relevance to validate Gate 1+2 index usage, Gate 3 concurrency, and the <20ms query target.

**Decision:** A dedicated seed script generating 1,000 personas and 5,000 jobs from 5 archetype vectors, at $0 AI cost (5 API calls total for archetype embeddings).

### 10.1 The 5 Archetypes

| Archetype | `personaLabel` | `mustHaveTags` (seed) | Example `embeddingSummary` |
|---|---|---|---|
| Senior React Dev | "Senior React Developer" | `react, nextjs, typescript, javascript, css` | "Senior frontend engineer with 6 years building React applications. Deep expertise in Next.js App Router, TypeScript, and modern CSS. Strong product sense." |
| Python Backend | "Senior Python Backend Engineer" | `python, django, postgresql, docker, redis` | "Backend engineer with 7 years building Python services. Django, PostgreSQL, Redis caching. Distributed systems and API design." |
| DevOps Engineer | "DevOps / Platform Engineer" | `kubernetes, aws, terraform, docker, linux` | "Platform engineer specializing in Kubernetes, AWS, and infrastructure as code. CI/CD pipelines, observability, and cost optimization." |
| Mobile iOS | "Senior iOS Engineer" | `swift, swiftui, ios, xcode, combine` | "iOS engineer with 5 years shipping Swift/SwiftUI apps. Deep knowledge of the Apple ecosystem, Combine, and performance tuning." |
| Junior Frontend | "Junior Frontend Developer" | `javascript, html, css, react, git` | "Junior frontend developer with 1.5 years experience. JavaScript, React, and responsive design. Eager to grow into a senior role." |

### 10.2 Generation Algorithm

**Tags and vectors are independent variance axes. Do not couple them.**

1. **Generate 5 archetype vectors** via `text-embedding-3-small` (5 API calls, ~$0.0001 total). Hardcode the resulting 1536-d vectors into the script.
2. **Write 5 `embeddingSummary` strings** (one per archetype, for Gate 3 LLM context). These are display/context strings, not embedding sources in the seed script.
3. **Generate 1,000 personas:**
   - Loop 1,000 times. Randomly pick an archetype (weighted: 30% React, 25% Python, 20% DevOps, 15% Mobile, 10% Junior).
   - `mustHaveTags`: start from archetype seed, randomly swap 1–2 of 5 tags with adjacent canonical tags (e.g., `nextjs` → `remix`, `django` → `fastapi`). This creates Gate 1 variance.
   - `personaEmbedding`: take the archetype vector, add small Gaussian noise (σ = 0.01 per dimension). This preserves cluster structure while creating realistic variance. **No API call.**
   - `blocklistTags`: 20% of personas get 1 random blocklist tag (e.g., `web3`, `java`) for Gate 1 negative testing.
   - Bulk insert via `db.insert(persona).values(batch)`.
4. **Generate 5,000 jobs:**
   - Loop 5,000 times. Assign each to one of the 5 archetypes (1,000 each).
   - `extractedTags`: archetype seed tags ± 1–2 swaps (same variance logic).
   - `jobEmbedding`: archetype vector + Gaussian noise (σ = 0.015 — slightly more than personas, since jobs are noisier than self-described personas).
   - `rawJson`: synthetic JSON with title + description containing the tags (for Gate 3 prompt testing).
   - `status = 'active'`, `normalizedAt = NOW()` (pre-normalized so the funnel can be tested directly).
   - Bulk insert.
5. **Result:** 6,000 records, mathematically aligned clusters, inserted in <10 seconds, $0 AI cost. When a "React" job enters the funnel, it snaps to the React persona cluster via Gate 2.

### 10.3 Usage

```bash
npx tsx scripts/seed-routing-engine.ts
```

Used in Feature C6 (calibration) and for stress-testing the Gate 3 concurrency 15 cap. Not run in production. The script should accept a `--scale` flag (default 1000/5000, reduce to 100/500 for quick local tests).

---

## 11. Inngest Primitives — Best Practices for Module C

Verified against the installed Inngest SDK v4.8.0 and official docs.

### 11.1 `step.ai.wrap()` over `step.ai.infer()` (§6.2)

Confirmed: `infer()` saves serverless compute; `wrap()` adds observability without routing. On self-hosted Hetzner, `wrap()` is correct.

### 11.2 `step.sendEvent()` over `defer()` for MVP

**Decision:** Use `step.sendEvent()` for the `match/approved` handoff. Do not use `defer()`.

**Rationale (verified against installed SDK types):** The `defer()` primitive and `createDefer()` are marked **EXPERIMENTAL** in the installed SDK type definitions:

> *"EXPERIMENTAL: This API is not yet stable and may change in the future without a major version bump."*

Using an experimental API in the matching brain — the core product value — risks a future Inngest minor version breaking the notification flow without a major bump warning. `step.sendEvent()` is stable, well-understood, and cleanly hands off to Module D later. Track `defer()` as a post-MVP optimization once it stabilizes.

### 11.3 Checkpointing — Not Enabled for MVP (Consistency with §11.2)

**Decision:** Do not enable `checkpointing: true` on `gate3Evaluator` for MVP. Use default behavior.

**Rationale:** §11.2 rejects `defer()` because it is EXPERIMENTAL / developer-preview and could break without a major version bump. Checkpointing is in the same maturity tier (developer preview, opt-in). Applying a conservative risk posture to `defer()` but an accepting one to checkpointing is inconsistent — either both previews are acceptable for the matching brain, or both wait. For MVP, both wait.

**Practical reinforcement:** The latency win from checkpointing is marginal for `gate3Evaluator` specifically. The function has 3 steps: fetch-context (~100ms DB), evaluate (~3–5s LLM call), write-verdict (~100ms DB). The LLM call dominates the run by 15–50×. Near-zero inter-step latency between the two ~100ms steps saves ~200ms on a ~5s run — a 4% improvement that doesn't justify a preview API in the core product.

**Post-MVP:** Revisit checkpointing and `defer()` as a paired item once both stabilize. If checkpointing graduates to stable before `defer()`, it can be enabled independently at that point.

### 11.4 Per-Function Concurrency

Confirmed: Inngest concurrency is per-function, not global. The existing `pollCompanyFn` (concurrency 50) and the new `gate3Evaluator` (concurrency 15) are independent. Document both in the decisions doc so future tuning is informed.

### 11.5 `step.run()` Wrapping (Existing Rule)

Per AGENTS.md rule 1: all DB calls, external API calls, and AI SDK calls must be wrapped in `step.run()` (or `step.ai.wrap()` for AI). No direct calls in the handler body. This is unchanged for Module C — the `jobIngestedHandler` and `gate3Evaluator` both follow this pattern (§6.4).

### 11.6 Lazy Imports (Existing Rule)

Per AGENTS.md rule 2: import domain logic lazily inside handlers to avoid loading heavy modules at discovery time. Module C follows this — `gate-1-2.ts`, `job-normalizer.ts`, `gate-3-evaluator.ts` are all dynamically imported inside their respective Inngest handlers.

---

## 12. Display Match Score (Dashboard Composite Score)

**Decision:** The dashboard renders a single, composite 0–100 match score derived from multiple signals in `src/lib/jobs/dashboard-queries.ts`. This score is **not** the same as the Gate 1+2 router's composite ordering score (used only to rank candidates in `gate-1-2.ts`). It is a user-facing calibration score that combines positive match signals with negative mismatch signals.

**Formula (July 2026):**

```text
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

| Signal | Computation | Weight |
|---|---|---|
| Semantic similarity | `1 - cosineDistance` | 0.25 |
| Tag overlap | `1 - exp(-0.4 * min(overlapScore, 5))` | 0.30 |
| Workplace alignment | `assignmentTypes` vs. `job.workplaceType` (exact = 1.0, hybrid/remote partial = 0.5, mismatch = 0.0) | 0.12 |
| Location alignment | `applicant.country` vs. `job.locationName` (country-specific remote = 1.0, generic remote = 1.0, restricted country = 0.0, unknown = 0.5) | 0.08 |
| Seniority alignment | `job.title` regex vs. `persona.seniorityLevels` (match = 1.0, mismatch = 0.0, unknown = 0.5) | 0.08 |
| Company quality | `companyQualityScore / 100` (default 50) | 0.17 |
| Blocklist penalty | `1.0` if `blocklistTags && extractedTags`, else `0.0` | 0.10 |
| Coverage gap | `1 - overlapScore / min(mustHaveCount, jobTagCount)` | 0.10 |
| Secondary domain mismatch | `min(count / 3, 1.0)` where `count` is the number of alternative framework/language tags in `extractedTags` not present in `mustHaveTags` | 0.08 |

**Alternative framework/language list for secondary domain mismatch:** `wordpress`, `vue`, `nuxt`, `angular`, `svelte`, `solidjs`, `php`, `laravel`, `ruby`, `rails`, `csharp`, `dotnet`, `aspnet`, `swift`, `kotlin`, `flutter`, `ios`, `android`. General-purpose backend/AI languages (`python`, `go`, `golang`, `rust`, `java`, `spring`, `spring-boot`, `django`, `flask`, `fastapi`) are intentionally excluded to avoid penalizing legitimate AI/full-stack secondary skills.

**Rationale:** Gate 1+2 scores (overlap, cosine distance) are insufficient for a user-facing quality signal. The LLM rejects matches for reasons that are not captured by tag overlap or vector similarity alone — missing must-have skills, blocklist hits, or off-domain framework requirements. The composite score encodes these mismatch signals so the dashboard ranking and star rating reflect the same factors that drive the LLM verdict.

**Calibration status:** The weights are tuned empirically against live `match_queue` data (July 2026). The current gap between approved (avg ~54.1/100) and rejected (avg ~39.9/100) matches is ~14 points. The next targeted signal is an experience gap (extracting `min_experience_years` from job descriptions and comparing to persona-inferred experience).

**Ordering:** The dashboard list is ordered by this composite score descending, then `createdAt` descending.

---

## 13. Re-Match Strategy — Deferred to Post-MVP

**Problem:** When a user updates their persona (changes `mustHaveTags`), or when a job's `rawJson` is refreshed on re-poll, the existing matches may be stale. Module A regenerates persona embeddings on tag changes, but nothing re-triggers Module C for affected jobs.

**Decision:** **Defer to post-MVP.** For MVP, matches are computed once at job ingestion. Persona updates do not retroactively re-match against existing jobs.

**Rationale:** The re-match problem is a UX polish issue, not a correctness issue. At MVP scale (low user count, low job volume), the staleness window is small. Building a re-match sweep now adds complexity (which jobs to re-match? all active? recent only?) without clear MVP value. Post-MVP, the likely design is a daily Inngest cron that re-runs Gate 1+2 for personas updated in the last 24h against active jobs.

**Documented as a follow-up task.** Not blocking for Module C MVP.

---

## 14. Implementation Feature Sequence

Module C is implemented as 7 isolated features, each independently shippable and testable. Ordered by dependency.

> **Reorder note (review round 1):** C5 (seed script) was moved **before** C2 (Gate 1+2 SQL router). Rationale: C2's §5.5 requires `EXPLAIN ANALYZE` against seed data to verify index usage, and the composite ordering needs real clusters to test against. Building C2's SQL with no data to run it against defers the index-verification step — which is precisely where the `&` operator bug (§5.2) would have surfaced. The seed script must exist first.

| Feature | Scope | Tests | Estimated Effort |
|---|---|---|---|
| **C0** — Schema & contracts hardening | `matchQueue` columns + index fix, `job.status` values, `normalizedAt`, `match/*` events in catalog, embedding utility promotion, `db.ts` pooler guard + `max: 20`, `matching-config.ts` | Schema migration applies; event types compile; config module exports constants | 0.5 day |
| **C1** — Job normalization | `job-normalizer.ts` (regex + LLM fallback + rejection logic), `job-embedder.ts`, wire into `jobIngestedHandler` steps 1–4, idempotency decision tree | Unit: regex extraction, LLM fallback (mocked), rejection threshold, idempotency guard | 1 day |
| **C5** — Seed script | `scripts/seed-routing-engine.ts` (5 archetypes, 1k personas, 5k jobs, $0 AI cost) | Script runs successfully; data inserted and queryable | 0.5 day |
| **C2** — Gate 1+2 SQL router | `gate-1-2.ts` (raw SQL, `unnest`/`= ANY` overlap count, composite ordering, edge cases), wire into `jobIngestedHandler` step 5, `matchQueue` insertion | Unit: SQL shape validation (assert `unnest` not `&`), result parsing, edge cases. Integration: `EXPLAIN ANALYZE` against seed data from C5 — verify GIN + HNSW index usage | 1 day |
| **C3** — Gate 3 LLM evaluator | `gate-3-evaluator.ts` (Zod schema, prompt builder, `generateObject`), `gate3Evaluator` Inngest function, `match/gate-3-evaluate` fan-out from `jobIngestedHandler`, `match/approved` emission | Unit: prompt construction, verdict parsing (mocked AI SDK), Inngest function (mocked evaluator) | 1.5 days |
| **C4** — In-app notification | `/dashboard/jobs` page query, `isRead` Server Action, sidebar unread badge, 30s polling | Component test: badge renders correct count. E2E: approved match appears in dashboard | 0.5 day |
| **C6** — Calibration & observability *(launch-blocking)* | Run 20–30 real jobs through funnel, inspect verdicts, tune `GATE2_MAX_COSINE_DISTANCE` and weights, add Inngest step metrics. **Display score calibration (July 2026):** Add composite match score in `dashboard-queries.ts`, add negative signals (blocklist penalty, coverage gap, secondary domain mismatch), tune weights against live `match_queue` data. | Manual calibration document with tuned values; dashboard score verified against SQL/manual recomputation | 1 day + ongoing calibration |

**Total: ~6 days for a focused implementation.** Longer if learning Inngest/pgvector as you go — and that's fine.

**C6 is launch-blocking:** Uncalibrated thresholds are acceptable while the only data is synthetic seed data. They are **not** acceptable the moment a real persona could be matched. No real user sees Module C output until C6 completes and the thresholds are benchmarked against real job/persona pairs. This is a hard gate, not a "nice to have."

**Hard rule:** No feature is marked complete until its tests pass and `biome check --write` is clean. Per AGENTS.md, tests are mandatory for "new business logic: matching algorithms, scoring, filtering" and "new background jobs (Inngest functions)."

---

## 15. Open Questions (Not Blocking, Track for Post-MVP)

1. **Gate 3 model escalation:** When should a borderline verdict (confidence 0.4–0.6) be re-evaluated by `gpt-4o` instead of `gpt-4o-mini`? Post-MVP: two-pass Gate 3 with confidence-based escalation.
2. **Funnel observability metrics:** What dashboard metrics track gate conversion rates (jobs ingested → normalized → Gate 1+2 passed → Gate 3 approved)? Post-MVP: Inngest step naming convention + a metrics query.
3. **`allTags` staleness:** If a user updates work history between job ingestion and Gate 3 evaluation, `allTags` may be stale. For MVP, the window is seconds — acceptable. Post-MVP: re-read `tagsExperience` directly in Gate 3, or add `tagsUpdatedAt` to detect staleness.
4. **Dynamic Gate 2 widening:** If all 8 Gate 1+2 candidates fail Gate 3, should the funnel re-run with a wider `GATE2_MAX_COSINE_DISTANCE`? Post-MVP: adaptive widening with a cap.
5. **`defer()` and checkpointing migration:** When Inngest stabilizes `defer()` (no longer EXPERIMENTAL) and checkpointing (no longer developer preview), revisit both as a paired item. Migrate the `match/approved` emission from `step.sendEvent()` to `defer()` for fire-and-forget semantics with independent retries. Enable checkpointing on `gate3Evaluator` if the inter-step latency win is measurable.
6. **Gate 3 error recovery sweep:** The Gate 3 error path (§6.5) leaves `matchQueue` rows at `status = 'pending'` with `llmVerdict = 'error'` when the LLM returns unparseable output or all retries exhaust. These rows are recoverable only by a future sweep that re-emits `match/gate-3-evaluate` for `pending` rows older than N hours. This sweep does not exist in MVP — it's acceptable because error rows are rare (LLM parse failures are uncommon with `generateObject` + Zod enforcement), but the sweep should be built before scale to prevent error rows from accumulating invisibly.
7. **Experience gap signal:** Jobs rejected for requiring more years of experience than the persona has (e.g., "8+ years" vs. persona inferred at "7+ years") still score high because the formula has no experience component. Post-MVP: extract `min_experience_years` from job descriptions via regex or LLM, compare to persona-inferred experience, and add a negative signal.
