# SYSTEM ARCHITECTURE & TECHNICAL DESIGN DOCUMENT (TDD)
**Project:** Multi-Tenant Next.js AI Job Routing SaaS
**Target Audience:** Devin Desktop, Devin Local / Coding AI Agent
**Context:** This document contains the implementation blueprint for a multi-tenant job-matching SaaS. It uses a 3-gate funnel to match unstructured ATS job postings against explicitly defined user personas using GIN indexing, HNSW vector similarity, and LLM orchestration. 

---

## 1. TECHNOLOGY STACK
*   **Framework:** Next.js 16 (App Router + Cache Components, standalone Docker output)
*   **Database:** PostgreSQL (Neon)
*   **ORM:** Drizzle ORM
*   **Authentication:** Better Auth (database-integrated)
*   **Background Jobs / Orchestration:** Inngest (v3, Durable Execution)
*   **AI/ML:** Vercel AI SDK (`gpt-4o` for strict reasoning, `gpt-4o-mini` for scaling, `text-embedding-3-small` for embeddings)
*   **Frontend UI:** Tailwind CSS v4, React Hook Form, Zod, `@dnd-kit` (for drag-and-drop)
*   **Vector Database:** Postgres `pgvector` (with `hnsw` indexes)
*   **Hosting:** Hetzner Cloud (Frankfurt) + Coolify (self-hosted PaaS). 

---

## 2. DATABASE ARCHITECTURE (Drizzle ORM Schema)

All database table schemas are located in the dedicated folder: src/db/schemas.

We are using the Separation of Concerns principle: the Better Auth tables inluding the 'user' table are completely isolated inside src/db/schemas/auth folder, and all domain SaaS logic has been moved to a 1:1 'applicant' table, along with the accompaning 'persona', 'job', 'matchQueue' tables inside a dedicated src/db/schemas/jobs/ module. 

src/db/schemas/index.ts is the central schema barrel file for the app's Drizzle ORM setup. It serves three purposes:

1. Re-exports all table schemas — It pulls in and re-exports everything from the individual schema modules (auth/* and jobs/*), so the rest of the app can import schemas from a single path (@/db/schemas).
2. Defines Drizzle relations — It uses Drizzle's relations() utility to declare how tables relate to each other (one-to-many, many-to-many, self-referential).
3. Provides the schema object for the Drizzle client — This file is typically imported by the Drizzle database client initialization (src/db/db.ts) to register the full schema with the ORM.

The whole SaaS logic database setup is optimized for the "Inverted Index" pattern. Instead of looping through users, jobs query the database for users whose constraints overlap with the job's extracted tags.


### 2.1 Core Tables and enums

<!-- ⚠️ GOTCHA: Never run vector similarity search without CREATE INDEX USING hnsw on personaEmbedding — falls back to sequential scan and crashes the DB at scale. -->

```typescript

// src/db/schemas/jobs/enums.ts
import { pgEnum } from "drizzle-orm/pg-core";

export const assignmentTypeEnum = pgEnum("assignment_type", [
  "remote",
  "hybrid",
  "on-site",
  "remote_local",
]);
export const modalityEnum = pgEnum("modality", [
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
]);
export const complianceEnum = pgEnum("compliance", [
  // --- Employee / Payroll Options ---
  "w2", // US Corporate Employment
  "local_employment", // Standard domestic employment (direct hire in dev's country)
  "eor", // Employer of Record (Global full-time via Deel/Remote/etc.)

  // --- Business-to-Business (Corporate) ---
  "b2b", // Company-to-Company (Serbian Sole Proprietorship, UK Outside IR35, LLCs)

  // --- Independent Contractor / Freelance (Individual) ---
  "1099", // US Resident Solo Contractor (Requires W-9 & IRS 1099-NEC filing)
  "w8ben", // Foreign Solo Contractor for US Client (0% US tax withholding, exempt from IRS reporting)
  "ic_global", // International Solo Contractor for non-US Client (filing taxes locally)
]);


// 1. APPLICANT TABLE (1:1 with User)
// src/db/schemas/jobs/applicant.ts
// This table strictly uses the Better Auth user.id as its primary key to enforce a 1:1 relationship and optimize JOINs.
export const applicant = pgTable("applicant", {
  // 1:1 Relationship constraint & Primary Key
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),

  isOnboarded: boolean("is_onboarded").default(false),
  country: text("country"), // ISO 3166-1 alpha-2
  canWorkUsHours: boolean("can_work_us_hours"),

  assignmentTypes: assignmentTypeEnum("assignment_types").array(),
  modalities: modalityEnum("modalities").array(),
  preferredCompliance: complianceEnum("preferred_compliance").array(),

  // The global knowledge base for Gate 3 LLM evaluation
  allTags: text("all_tags").array().notNull().default(sql`'{}'::text[]`),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// 2. USER PERSONA TABLE (Solving the "Muddy Vector" Problem)
// src/db/schemas/jobs/persona.ts
export const persona = pgTable(
  "persona",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),
    personaId: text("persona_id").notNull(), // e.g., "react_frontend"
    personaLabel: text("persona_label").notNull(), // e.g., "Senior React Developer"
    embeddingSummary: text("embedding_summary").notNull(), // Dense 3-sentence summary for LLM context
    personaEmbedding: vector("persona_embedding", { dimensions: 1536 }), // text-embedding-3-small

    mustHaveTags: text("must_have_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    blocklistTags: text("blocklist_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => ({
    mustHaveTagsIdx: index("persona_must_have_tags_idx").using(
      "gin",
      table.mustHaveTags,
    ),
    blocklistTagsIdx: index("persona_blocklist_tags_idx").using(
      "gin",
      table.blocklistTags,
    ),
    embeddingIdx: index("persona_embedding_hnsw_idx").using(
      "hnsw",
      table.personaEmbedding.op("vector_cosine_ops"),
    ),
    applicantIdIdx: index("persona_applicant_id_idx").on(table.applicantId),
  }),
);

// 3. JOBS TABLE
// src/db/schemas/jobs/job.ts
export const job = pgTable(
  "job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atsSource: text("ats_source").notNull(),
    atsSlug: text("ats_slug").notNull(),
    title: text("title").notNull(),
    rawJson: text("raw_json").notNull(),
    extractedTags: text("extracted_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    jobEmbedding: vector("job_embedding", { dimensions: 1536 }),
    detectedAt: timestamp("detected_at").defaultNow(),
  },
  (table) => ({
    extractedTagsIdx: index("jobs_extracted_tags_idx").using(
      "gin",
      table.extractedTags,
    ),
  }),
);

// 4. MATCH QUEUE TABLE
// src/db/schemas/jobs/matchQueue.ts
export const matchQueue = pgTable(
  "match_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),
    overlapScore: integer("overlap_score").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    uniqueMatch: index("match_queue_unique").on(table.jobId, table.applicantId),
  }),
);
```

---

## 3. MODULE A: DEVELOPER-CENTRIC ONBOARDING (FRONTEND & API)

**Goal:** Convert messy PDF resumes into explicit `zod` validated data, preventing LLM math hallucinations on overlapping job dates, and giving the developer ultimate control over their "Active Persona" while ensuring strict backend data integrity.

### 3.1 Phase 1: Client-Side Parsing & Edge-Protected API
Do not use `pdf-parse` on the server.
*   **Implementation:** Use `pdfjs-dist` in a Web Worker inside the browser.
*   **The Flow:** The Worker extracts the raw text and sends it to the Main (React) Thread via `postMessage`. The Main Thread then triggers the Vercel AI SDK `useObject` hook.
*   **API Route vs. Server Action:** The target endpoint MUST be an API Route (`/api/onboarding/parse`), not a Server Action. This is a deliberate architectural decision required to:
    1. Support the `useObject` hook for real-time JSON streaming (preventing Cloudflare 524 timeouts).
    2. Allow Cloudflare WAF to apply strict URL-based rate limiting to protect OpenAI billing.

### 3.2 Phase 2: The Skillset Math & Canonical Tagging (Server-Side AI)
To prevent "hallucinated years of experience" and "muddy vectors", use `gpt-4o` (not mini) with a strict `zod` schema (`ResumeExtractionSchema`).
*   **The Overlap Algorithm:** The system prompt must enforce a 4-step Chain of Thought to merge overlapping date ranges before outputting `years_of_experience`.
*   **The CANONICAL_TAGS Dictionary:** The LLM is strictly prohibited from inventing tech tags. It must map findings to a hardcoded dictionary split into:
    *   **Core Skills** (e.g., "React", "Python"): Technologies capable of defining an entire Persona (`mustHaveTags`).
    *   **Optional Skills** (e.g., "CSS", "Agile", "Jira"): Contextual modifiers saved in the applicant's global knowledge base (`allTags`) for Gate 3 LLM evaluation.

### 3.3 Phase 3: The Hybrid Form Architecture & Data Mutation
The `/dashboard/cv` UI utilizes a hybrid state architecture to balance complex interactions with Next.js App Router mutation standards.
*   **Client State (React Hook Form):** Manages the highly interactive draft state (uncontrolled inputs for performance) and complex dynamic arrays like the drag-and-drop "5 Major Skills" constraint. Performs initial Zod validation for immediate UX feedback.
*   **Server Execution (Server Actions + `useActionState`):** RHF hands the validated data over to a Server Action as a JSON-stringified payload in `FormData`. Note: This intentionally sacrifices non-JS progressive enhancement in favor of complex dashboard UI requirements.
*   **Strict Double-Validation Constraint:** The Server Action MUST NOT trust the RHF payload. It must independently execute `PersonaFormSchema.safeParse()` to validate the payload server-side before invoking `text-embedding-3-small` to generate the vectors and executing the Drizzle ORM inserts.

<!-- ⚠️ GOTCHA: Never average 30 skills into one vector. Cap at 5 Major Skills per persona, or split into a separate persona row. -->

---

## 4. MODULE B: SEEDING & INGESTION PIPELINE

**Goal:** Discover non-tech and startup ATS slugs for $0, then poll them natively without getting blocked.

### 4.1 The Discovery/Seeding Engines (Run Monthly/Weekly)
Do not scrape career pages dynamically. Seed the database with known ATS slugs.
1.  **HTTPArchive BigQuery (The Volume Seeder):**
    *   Query the Google BigQuery public dataset `httparchive.technologies` and `httparchive.summary_pages`.
    *   Logic: Extract domains where `technology = 'Next.js'` AND HTML body contains `boards-api.greenhouse.io` or `api.lever.co`.
2.  **HN Algolia Sniper (The Delta Seeder):**
    *   Endpoint: `https://hn.algolia.com/api/v1/search_by_date?query=Ask+HN+Who+is+hiring`
    *   Extract URLs matching `jobs.ashbyhq.com/slug`, `boards.greenhouse.io/slug`.
3.  **crt.sh (The Stealth Seeder):**
    *   Endpoint: `https://crt.sh/?q=%.careers.*&output=json`. Extract domain, perform a CNAME lookup in Node.js to verify if it points to Greenhouse/Lever.

### 4.2 The "Phalanx" Poller (Run Daily via Inngest or Cron)
Do not use AWS API Gateway for Native ATS endpoints. They do not run TLS fingerprinting.
*   **The Logic:** A central worker fetches the Native JSON APIs (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`).
*   **Anti-Ban Mechanism:** Use the `bottleneck` npm package. Strict limits: Max 2 concurrent requests per second per ATS platform.
*   **The Fallback:** If a 429/403 is encountered, route the request through a rotating residential proxy (e.g., Webshare.io or Smartproxy).

---

## 5. MODULE C: EVENT-DRIVEN ROUTING (THE 3-GATE FUNNEL)

**Goal:** Solve the O(N*M) compute cost problem using Inngest and Postgres.

### 5.1 Step 1: Normalization (Inngest Event: `job/ingested`)
*   When a job is inserted into `raw_jobs`, Inngest triggers.
*   A basic TypeScript dictionary regex extracts `canonical_tags` (e.g., matching "ReactJS" to "react"). If tags < 3, a fallback `gpt-4o-mini` call extracts them.
*   The job description is embedded using `text-embedding-3-small`.

### 5.2 Step 2: Gate 1 & 2 (The SQL Router)
Run a single, massive SQL query to narrow 1,000 users down to ~8 candidates in under 20ms.

```typescript
// Drizzle ORM implementation concept of the core SQL logic
await db.execute(sql`
  INSERT INTO match_queue (job_id, applicant_id, overlap_score, status)
  SELECT 
    ${jobId}::uuid,
    p.applicant_id,
    cardinality(p.must_have_tags & ${jobTags}::text[]) AS overlap_score,
    'pending'
  FROM persona p
  WHERE
    -- GATE 1: GIN Index Array Overlap (Must hit at least one major skill, zero blocklist hits)
    (p.must_have_tags && ${jobTags}::text[]) 
    AND NOT (p.blocklist_tags && ${jobTags}::text[])
    -- GATE 2: HNSW Vector Similarity
    AND (p.persona_embedding <=> ${jobEmbedding}::vector) < 0.35 -- Distance metric (1 - 0.65 similarity)
  ORDER BY overlap_score DESC
  LIMIT 8
  ON CONFLICT DO NOTHING
`);
```

### 5.3 Step 3: Gate 3 (The LLM Arbiter)
*   Inngest queries the `match_queue` and fans out 8 parallel events (`job/evaluate/candidate`).
*   Inngest concurrency is still capped to max 50, but the binding constraint changed. The
original limit existed to prevent Vercel's 340-second idle-connection limit
from severing fanned-out function instances. Under Module E, there is no
Vercel idle-connection limit — the constraint now is protecting the single
Hetzner CAX21 instance's own CPU/RAM headroom (4 vCPU / 8GB, shared with the
live Next.js server process) and, more importantly, protecting the Neon
Postgres connection pool from exhaustion under a sudden fan-out spike. A cap
of 50 concurrent steps is kept as a starting point; this should be tuned
empirically post-launch against actual Neon pool size and observed CAX21
load, not treated as a fixed number carried over from the old justification.

Separately: any request path sitting behind Cloudflare's proxy (which is all
of them under Module E) is also bound by Cloudflare's 100-second connection
timeout (HTTP 524) on idle/no-data connections. This is unrelated to Inngest
concurrency but governs the same general class of "long-running request"
risk — synchronous API routes (e.g. `/api/onboarding/parse`, the `gpt-4o`
extraction call) must complete well under 100 seconds, and anything that
can't is a candidate for Inngest, not a synchronous route.
*   `gpt-4o-mini` evaluates the job against the specific user's nuanced preferences (e.g., "Must be B2B, no web3").
*   If pass, status is set to `approved` and user is notified.

---

## 6. MODULE D: BUSINESS LOGIC & COMPLIANCE (THE GO-TO-MARKET)

This application serves as a portfolio showcase to secure B2B Contracts for Senior developers.

### 6.1 The "Minute Zero" Cold Email Template
This is generated by the system when a match occurs, intended for the startup's CTO/Founder.

> **Subject:** Intercepted your [Job Title] req via custom API / Next.js Architecture
> 
> Hey [CTO First Name],
> 
> Instead of waiting for this role to hit LinkedIn and drown you in 800 AI-generated applications, I’m reaching out directly.
> 
> My custom Next.js/pgvector ingestion engine just pinged me the second you published the [Job Title] role on [Greenhouse/Lever]. I built this SaaS to bypass the broken hiring market and connect directly with engineering leaders.
> 
> I am a Senior Full-Stack Engineer specializing in your exact stack: Next.js (App Router), TypeScript, and PostgreSQL. I operate exclusively as an independent B2B contractor. I come pre-packaged with a W-8BEN, meaning hiring me via Deel or Wire involves zero payroll tax and zero HR compliance friction for US companies. 
> 
> The app that found this job is at [Portfolio Link]. If you need senior velocity this quarter, are you open to a 15-minute architectural chat later this week?
> 
> Best,
> [Name]

### 6.2 The Compliance 1-Pager (To be linked in the email)
*   **Title:** Hiring me is legally and operationally identical to paying any US software vendor.
*   **W-8BEN Clause:** "I provide a Certificate of Foreign Status. Under the US tax treaty (Article 14), income is fully exempt from US federal withholding (0%)."
*   **1099 Exemption:** "1099-NEC forms are only required for US persons. You file nothing with the IRS."
*   **Payment Clause:** "Contract via Deel, or standard B2B Wire/Wise. Treat my invoice exactly like paying an AWS or Vercel subscription."

### 6.3 Legal Protection (Terms of Service Framing)
*   **App Positioning:** Do NOT position the SaaS as a data broker or scraper. Position it as a **"User-Driven Job Intelligence Tool"** or "User-Agent Aggregator" that fetches public data strictly on behalf of authenticated users based on their explicit parameters.
*   **Required Clauses:** 
    *   "We only access publicly available job postings."
    *   "No guarantee of access: We reserve the right to stop fetching from any source if requested via cease-and-desist."
    *   Full indemnification clauses to shield the platform creators from ATS legal action.

\* *Note: App server and Neon are co-located in Frankfurt to minimize cross-region query latency

## 7. MODULE E: INFRASTRUCTURE & DEPLOYMENT ARCHITECTURE

Status: Final decision — implemented via self-hosted PaaS (Hetzner Cloud + Coolify).

### 7.1 Infrastructure stack

*   **Host server:** Hetzner Cloud CAX21 (ARM64 Ampere Altra, 4 vCPU, 8GB RAM). Region: Frankfurt (fsn1). Cost: ~€6.41/month, fixed.
*   **PaaS orchestrator:** Coolify (open-source), installed on-server. Manages Docker builds, Traefik reverse proxy, and automated SSL via Let's Encrypt.
*   **Build pipeline:** Next.js output: 'standalone'. Coolify connects via GitHub webhook to trigger Docker builds from the project's root Dockerfile on push.
*   **Database proximity:** Neon Postgres, region pinned to Frankfurt (eu-central-1). Rationale: same-region placement avoids the cross-region network latency (typically 30-50ms round-trip) that would otherwise be added to every GIN/HNSW query in Gate 1 & 2 (Module C). Exact latency is unmeasured pre-deployment and should be benchmarked post-launch rather than assumed.
*   **Edge protection:** Cloudflare (free tier), proxied (orange-clouded). WAF rate-limiting and challenge rules applied to /api/inngest and /api/onboarding/parse specifically, since these endpoints trigger LLM calls and job fan-out and are the highest-cost targets for bot/scraper abuse.


### 7.2 **Accepted technical trade-off (binding implementation constraint)**
This deployment model does not support Next.js Partial Prerendering (PPR) as designed for Vercel's edge network. Per OpenNext's own documentation, standalone Node output requires every request to reach the live NextServer process to resolve the cache; PPR pages cannot be served directly from a CDN under this model, and in some configurations this can be slower than standard SSR.

**Instruction to any developer or agent implementing this:** do not design pages assuming a zero-roundtrip, edge-cached static shell. Treat all routes as standard server-rendered, with use cache available for function/component-level caching only — not page-level edge caching. This is an accepted, deliberate trade-off, not an oversight to fix later.

### 7.3 **Known operational constraint**
The Next.js Data Cache writes to the container's local filesystem under standalone output. If horizontal scaling (a second Hetzner instance) is ever needed, a shared cache handler (e.g., Redis-backed) must be implemented first, or the two instances will serve inconsistent cached content. Not a concern at current single-instance scale.

### 7.4 **Operational ownership**
Unlike a managed PaaS, this requires manual setup and ongoing light maintenance via the Coolify dashboard or SSH:

*  Health checks configured in Coolify to auto-restart the container on crash.
*  Monthly OS security updates and Docker image pruning (the latter automatable via Coolify settings) to prevent disk bloat.
*  Local volume backups for any non-ephemeral data stored outside Neon. 