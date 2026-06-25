# SYSTEM ARCHITECTURE & TECHNICAL DESIGN DOCUMENT (TDD)
**Project:** Multi-Tenant Next.js AI Job Routing SaaS
**Target Audience:** Devin Desktop, Devin Local / Coding AI Agent
**Context:** This document contains the implementation blueprint for a multi-tenant job-matching SaaS. It uses a 3-gate funnel to match unstructured ATS job postings against explicitly defined user personas using GIN indexing, HNSW vector similarity, and LLM orchestration. 

---

## 1. TECHNOLOGY STACK
*   **Framework:** Next.js 16 (App Router + Cache Components, standalone Docker output)
*   **Database:** PostgreSQL (Neon) — connected via `@neondatabase/serverless` Pool (not HTTP driver) to support Drizzle transactions required by `recomputeTagsExperience()`
*   **ORM:** Drizzle ORM
*   **Authentication:** Better Auth (database-integrated)
*   **Background Jobs / Orchestration:** Inngest (v4, Durable Execution)
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

    // ── Module B additions (TDD §4.0c) — Deduplication & Stale Tracking ──────
    externalJobId: text("external_job_id").notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    // active | stale | gone | rejected | normalization_failed
    // - active|stale|gone: set by Module B (stale cleanup + re-poll)
    // - rejected: set by Module C Normalizer — garbage job (tombstone)
    // - normalization_failed: set by Module C Normalizer — system failure
    //   (retry sweep can re-process; distinguishable from 'rejected')
    status: text("status").notNull().default("active"),
    // ── Module C addition — idempotency guard + retry sweep filter ────────────
    // Set ONLY on terminal outcomes (success or rejection). Never set on
    // 'normalization_failed'. Null = never processed by Module C.
    normalizedAt: timestamp("normalized_at"),
  },
  (table) => ({
    extractedTagsIdx: index("jobs_extracted_tags_idx").using(
      "gin",
      table.extractedTags,
    ),
    // Module C — HNSW index for job embedding (Gate 2 candidate-side)
    embeddingIdx: index("job_embedding_hnsw_idx").using(
      "hnsw",
      table.jobEmbedding.op("vector_cosine_ops"),
    ),
    // Deduplication anchor — (ats_source, ats_slug, external_job_id)
    uniqueAtsJob: uniqueIndex("job_unique_ats_job").on(
      table.atsSource,
      table.atsSlug,
      table.externalJobId,
    ),
    // For the daily stale cleanup query (status + lastSeenAt)
    statusIdx: index("job_status_idx").on(table.status, table.lastSeenAt),
  }),
);

// 4. MATCH QUEUE TABLE (Module C — 3-Gate funnel output)
// src/db/schemas/jobs/matchQueue.ts
// A row is inserted by Gate 1+2 when a job + persona pair passes the GIN
// overlap + HNSW cosine distance filters. Gate 3 then fills in the LLM
// verdict columns. Schema decisions: docs/MODULE_C_DECISIONS.md §2.
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
    // Which persona matched. Required for multi-persona users (up to 3).
    // The unique index is on (jobId, personaId), NOT (jobId, applicantId) —
    // an applicant can match the same job via different personas.
    personaId: uuid("persona_id")
      .notNull()
      .references(() => persona.id, { onDelete: "cascade" }),
    overlapScore: integer("overlap_score").notNull(),
    // Gate 2 HNSW cosine distance (0.0–2.0, lower is better). Named "distance"
    // not "similarityScore" to prevent future ORDER BY ... DESC sorting bugs.
    cosineDistance: real("cosine_distance"),
    status: text("status").notNull().default("pending"),
    // ── Gate 3 LLM verdict columns (filled by gate3Evaluator) ───────────────
    // approved | rejected | error. Null until Gate 3 completes.
    llmVerdict: text("llm_verdict"),
    // 1–3 sentence LLM explanation. Audit trail for false positive/negative debugging.
    llmReasoning: text("llm_reasoning"),
    // LLM confidence score (0.0–1.0). Critical for calibration — distinguishes
    // high-confidence verdicts from borderline ones. Persisted from
    // verdict.matchConfidence in the Gate 3 evaluator.
    llmConfidence: real("llm_confidence"),
    // LLM blockers array (reasons for rejection). Persisted from
    // verdict.blockers. Empty for approved matches. Useful for calibration —
    // shows WHY the LLM rejected a candidate.
    llmBlockers: text("llm_blockers").array(),
    // Which model evaluated: gpt-4o-mini (MVP) | gpt-4o (escalation, post-MVP).
    llmModel: text("llm_model"),
    // When Gate 3 ran. Null until Gate 3 completes.
    evaluatedAt: timestamp("evaluated_at"),
    // In-app notification badge. Defaults to false; set true when user views the match.
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // Correct uniqueness constraint: a persona matches a job at most once,
    // but an applicant (via different personas) can match the same job multiple
    // times. Replaces the buggy (jobId, applicantId) index.
    uniqueMatchPersona: uniqueIndex("match_queue_unique_persona").on(
      table.jobId,
      table.personaId,
    ),
    // Dashboard list query: WHERE applicant_id = ? AND status = 'approved'
    // ORDER BY created_at DESC. The createdAt DESC in the index lets Postgres
    // return rows in sorted order without an in-memory sort.
    applicantStatusIdx: index("match_queue_applicant_status_idx").on(
      table.applicantId,
      table.status,
      sql`${table.createdAt} DESC`,
    ),
    // Sidebar unread badge count: WHERE applicant_id = ? AND is_read = false
    // AND status = 'approved'. Partial index — only indexes unread rows.
    unreadBadgeIdx: index("match_queue_unread_badge_idx")
      .on(table.applicantId)
      .where(sql`${table.isRead} = false AND ${table.status} = 'approved'`),
  }),
);

// 5. CV UPLOAD TABLE (Module A — Onboarding source data)
// src/db/schemas/jobs/cvUpload.ts
// Persists every CV upload attempt: raw extracted text (from pdfjs-dist Web
// Worker), the full LLM extraction payload (Schema 1 JSONB), and a lifecycle
// status that drives the onboarding state machine. A user may have multiple
// CV uploads (paid tier). See Module A §3.4 for the state machine.
export const cvUploadStatusEnum = pgEnum("cv_upload_status", [
  "processing", // PDF worker extracting text / LLM parse in flight
  "valid", // LLM extraction succeeded, CV passed validity checks
  "invalid", // LLM extraction failed or CV failed validity checks
  "abandoned", // User uploaded but never completed onboarding (orphan)
]);

export const cvUpload = pgTable("cv_upload", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicantId: text("applicant_id").notNull()
    .references(() => applicant.userId, { onDelete: "cascade" }),
  label: text("label").notNull(), // Mandatory user-provided CV name
  originalFileName: text("original_file_name"),
  rawText: text("raw_text").notNull(), // PDF worker output (enables re-parse)
  extractedJson: jsonb("extracted_json"), // Full Schema 1 LLM payload (audit trail)
  status: cvUploadStatusEnum("status").notNull().default("processing"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// 6. WORKING HISTORY TABLE (Module A — Single source of truth for work history)
// src/db/schemas/jobs/workingHistory.ts
// Each row = one employment entry extracted from a CV (by LLM) or added
// manually post-onboarding. Linked to cvUpload via cvUploadId (CASCADE).
// This table is the input to recomputeTagsExperience().
export const workingHistory = pgTable("working_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicantId: text("applicant_id").notNull()
    .references(() => applicant.userId, { onDelete: "cascade" }),
  cvUploadId: uuid("cv_upload_id").notNull()
    .references(() => cvUpload.id, { onDelete: "cascade" }),
  company: text("company").notNull(),
  role: text("role").notNull(), // Free-text, CANONICAL_ROLES provides dropdown
  startDate: date("start_date").notNull(),
  endDate: date("end_date"),
  isCurrent: boolean("is_current").notNull(),
  summary: text("summary"), // Deferred feature (Q9), nullable, column exists for future Gate 3
  canonicalSkillsDetected: text("canonical_skills_detected").array().notNull(),
  rawSkillsDetected: text("raw_skills_detected").array().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});

// 7. TAGS EXPERIENCE TABLE (Module A — Single source of truth for skills + years)
// src/db/schemas/jobs/tagsExperience.ts
// NOT populated by the LLM directly — computed by recomputeTagsExperience()
// which reads workingHistory, merges overlapping date ranges per canonical
// tag, and upserts results here. The `active` flag lets users deactivate
// non-critical skills without deleting the row. Unique constraint on
// (applicantId, canonicalTag) enables upsert during re-aggregation.
// Note: isPersonaDefining is NOT stored here — it's a global static property
// of the tag in CANONICAL_TAGS. Derive it at query time via PERSONA_DEFINING_TAGS.
export const tagsExperience = pgTable("tags_experience", {
  id: uuid("id").primaryKey().defaultRandom(),
  applicantId: text("applicant_id").notNull()
    .references(() => applicant.userId, { onDelete: "cascade" }),
  canonicalTag: text("canonical_tag").notNull(),
  yearsOfExperience: numeric("years_of_experience", { precision: 3, scale: 1 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()).notNull(),
});
```

---

## 3. MODULE A: DEVELOPER-CENTRIC ONBOARDING (FRONTEND & API)

**Goal:** Convert messy PDF resumes into structured, validated, vectorizable data using a 3-schema pipeline (LLM extraction → user-validated submission → DB persistence), preventing LLM math hallucinations on overlapping job dates, and giving the developer ultimate control over their "Active Persona."

**Governing Documents:** This section is governed by `docs/MODULE_A_DECISIONS.md` (locked decisions) and `docs/RESEARCH_NOTE_schemas.md` (research rationale). If this TDD and those documents conflict, the decisions document wins.

### 3.1 The 3-Schema Pipeline

Module A defines three distinct schemas that must not be conflated:

| Schema | What it is | Where it lives | When it's created |
|---|---|---|---|
| **Schema 1** | Raw LLM extraction output (gpt-4o via `generateObject`) | `cvUpload.extractedJson` (JSONB) | When the PDF is parsed |
| **Schema 2** | Validated onboarding submission (user-reviewed + user-collected) | Transient — passed to Server Action | When the user submits the onboarding form |
| **Schema 3** | DB tables (`applicant`, `persona`, `workingHistory`, `tagsExperience`) | PostgreSQL via Drizzle ORM | When the Server Action persists Schema 2 |

**Zod contracts:** `src/lib/onboarding/schemas.ts` defines `resumeExtractionSchema` (Schema 1) and `onboardingPayloadSchema` (Schema 2). Schema 3 is defined by the Drizzle table definitions in `src/db/schemas/jobs/`.

**Design principle:** The LLM returns raw `roles[]` data with date ranges. The server computes `yearsOfExperience` from merged date ranges — the LLM does NOT return a top-level `calculated_years_of_experience`. The LLM shows its work; the math is done in TypeScript. This is the anti-hallucination principle.

### 3.2 CANONICAL_TAGS & CANONICAL_ROLES (The Taxonomy Layer)

Two typed constant arrays govern tag and role normalization:

**CANONICAL_TAGS** (`src/lib/jobs/tech-tags.ts`):
- 144 entries (initial implementation, target ~300 after real-CV testing)
- Each entry: `{ tag, label, classification, category }`
- `classification`: `"persona_defining"` (can anchor a persona identity, e.g., `react`) or `"supporting"` (enhances but doesn't define, e.g., `css`)
- `category`: `"language" | "frontend" | "backend" | "database" | "devops" | "library" | "mobile" | "methodology"`
- Derived lookups: `CANONICAL_TAG_MAP` (O(1) by slug), `PERSONA_DEFINING_TAGS` (O(1) Set for validation), `TAGS_BY_CATEGORY` (grouped for UI)
- Seeded from Stack Overflow Developer Survey 2025 technology taxonomy

**CANONICAL_ROLES** (`src/lib/jobs/roles.ts`):
- ~90 entries (initial draft, target ~300 after real-CV testing)
- Each entry: `{ label, onetSoc }` (O*NET SOC code for traceability)
- Seniority is inline in the role title (Junior, Mid-level, Senior, Staff, Principal, Lead) — no separate DB column. True seniority is derived dynamically via `tagsExperience.yearsOfExperience`.
- Product Manager is included (for work history accuracy) but excluded from CANONICAL_TAGS — the LLM must never anchor a matching persona on it.
- Seeded from O*NET SOC 15-0000 + Stack Overflow developer-type self-identification

**Classification decisions (locked in MODULE_A_DECISIONS.md):**
- Cloud platforms (AWS/Azure/GCP) = `persona_defining` (dedicated Cloud Architects are major B2B personas)
- `kubernetes` = `persona_defining`, `terraform` = `supporting` (K8s has dedicated admins/CKA; Terraform is a tool)
- `tensorflow`/`pytorch`/`spark` = `persona_defining`; `scikit-learn`/`langchain`/`huggingface` = `supporting` (tools used by AI Engineer, not the anchor)
- `nextjs` = `persona_defining`; `nuxt`/`sveltekit`/`remix`/`astro` = `supporting` (Next.js has breakout market velocity)
- `php`/`ruby` = `persona_defining` (waning market share doesn't erase distinct B2B identities)

### 3.3 Phase 1: Client-Side PDF Parsing & LLM Extraction

Do not use `pdf-parse` on the server.

*   **Implementation:** Use `pdfjs-dist` in "fake worker" (same-thread) mode on the browser main thread.
*   **Architecture Decision — Main-Thread Fake Worker Mode (Revised from Web Worker):**
    The original design called for `pdfjs-dist` to run inside a Web Worker. This was revised during implementation due to a fundamental browser constraint: **browsers do not allow spawning a Worker from inside another Worker.** `pdfjs-dist` internally attempts to spawn its own Worker (via `GlobalWorkerOptions.workerSrc`) to parse PDFs. When running inside our custom Web Worker, this nested spawn fails silently, resulting in near-empty text extraction (9 characters instead of thousands).
    
    The solution is to run `pdfjs-dist` on the **main thread** in "fake worker" mode. This is achieved by importing the `pdf.worker.min.mjs` module and setting it on `globalThis.pdfjsWorker`. When `pdfjs-dist` detects `globalThis.pdfjsWorker.WorkerMessageHandler`, it runs its parsing logic in the same thread instead of spawning an internal Worker. For typical CV PDFs (1-5 pages), extraction takes <500ms on the main thread, which is acceptable for the onboarding MVP.
    
    The original Web Worker file (`src/workers/pdf-extract.worker.ts`) was removed during codebase cleanup (June 2026) since the nested-Worker constraint makes it unusable. The active implementation is in `src/lib/onboarding/pdf-worker-client.ts` (main-thread fake-worker mode).
    
    **Future optimization:** If main-thread blocking becomes problematic for very large PDFs, the fallback is server-side extraction (a dedicated API route with `pdf-parse` or a serverless function), or an OffscreenCanvas-based worker with a different PDF library that doesn't internally spawn Workers.

*   **SSR Compatibility — Dynamic Imports:** `pdfjs-dist` references browser-only APIs (`DOMMatrix`) at module evaluation time. Importing it at the top level of any module that runs during SSR causes a `ReferenceError: DOMMatrix is not defined`. The `extractPdfText()` function in `pdf-worker-client.ts` uses **dynamic `import()`** inside the function body so `pdfjs-dist` only loads in the browser when the function is actually called, never during server-side rendering.

*   **The Flow:** The client component calls `extractPdfText(file)` (an async function, not a Worker `postMessage`). The function dynamically imports `pdfjs-dist`, extracts raw text from the PDF on the main thread, and returns it. The component then constructs a `FormData` with the raw text, label, and original filename, and calls the Server Action via `formAction(formData)` inside a `startTransition()` (see §3.5).
*   **Pre-LLM CV Validity Check:** Before calling the LLM, the server runs `validateCvRawText(rawText)` which rejects:
    - Raw text < 200 characters (image-only PDFs, corrupt files, blank pages)
    - No year-like patterns found (no date evidence)
*   **Server Action (Parse):** The Server Action calls `gpt-4o` via Vercel AI SDK `generateObject()` with `resumeExtractionSchema` (Schema 1). Application-level rate limiting: 3 parses/hour/user.
*   **System Prompt with Canonical Tags (Critical):** The `generateObject()` system prompt must include the full list of `CANONICAL_TAGS` and `PERSONA_DEFINING_TAGS` so the LLM can accurately map skills. Without the tag list injected into the prompt, the LLM invents tag names that don't exist in the canonical set, causing `generateObject()` to fail with "response did not match schema." The prompt is built **dynamically** at runtime from the same `CANONICAL_TAGS` and `PERSONA_DEFINING_TAGS` constants that the Zod schema validates against — there is no hardcoded tag list in the prompt. When new tags are added to `tech-tags.ts`, they automatically appear in the next LLM call's prompt. Token cost: ~400 tokens for the tag list, negligible for a per-user onboarding action.
*   **Applicant Row Upsert (Critical):** The `cv_upload.applicant_id` foreign key references `applicant.user_id`. First-time users have a Better Auth `user` record but no `applicant` row yet. The `parseCvAction` must upsert an `applicant` row (with `onConflictDoNothing` on `userId`) before inserting into `cv_upload`. Without this, the FK constraint fails with a foreign key violation.
*   **API Route vs Server Action:** Default is a Server Action (called from the client component after extraction completes). An API route (`/api/onboarding/parse`) is reserved only if Cloudflare WAF URL-based rate limiting on this endpoint becomes a hard requirement.
*   **Schema 1 Output:** The LLM returns `roles[]` (work history with per-role canonical/raw skills), aggregated skill arrays, and `proposed_stacks[]` (1-2 LLM-proposed personas with 5 `must_have_tags` each). A Zod `.refine()` enforces that each proposed stack contains ≥1 `persona_defining` tag.
*   **Persistence on Parse:** The `cvUpload` row is created immediately (status=`processing`), then updated with `extractedJson` and status=`valid` or `invalid` when the LLM completes. This survives page refreshes and gives a stable ID for the onboarding flow.

### 3.4 Phase 2: The Onboarding UI (3-Presentation State Machine)

Route: `/dashboard/profile-management` (single route, three presentations based on `isOnboarded` and CV parse state).

```
State 1: isOnboarded=false, no CV parsed
  → Presentation: CV upload form
  → Transition: upload + worker parse + LLM extraction → State 2

State 2: isOnboarded=false, CV parse result in session (cvUpload row exists)
  → Presentation: Onboarding review (LLM data + user fields + persona confirmation)
  → Transition: submit → persist applicant + persona(s) + workingHistory + tagsExperience → set isOnboarded=true → State 3
  → Transition: reject CV (failed validity) → back to State 1

State 3: isOnboarded=true
  → Presentation: Profile management (full editing)
  → No transition (steady state)
```

**State 2 — Onboarding Review (goal: <3 minutes from upload to onboarded):**
- Shows LLM-extracted data (read-only summary with "edit" toggles for corrections)
- Shows LLM-proposed persona(s) — 1 or 2, with 5 `mustHaveTags` pre-filled
- User fills in mandatory user-collected fields (country, work preferences)
- User confirms or adjusts the 5 skills per persona
- Single submit → Server Action persists everything

**State 3 — Profile Management (post-onboarding):**
- *MVP status: read-only display of onboarding data. Full editing capabilities (add/remove jobs, deactivate skills, edit/delete personas) are a post-MVP follow-up.*
- Full Applicant section (edit employment history, add jobs, skills update) — *planned*
- Skills section (view all, deactivate non-critical — users cannot delete skills, only deactivate, because skills are derived from employment history) — *planned*
- Persona section (edit existing, add up to 3, delete) — *planned*

**UI sections (State 2 and 3):**
1. **Applicant Section**: Form reflecting user data from CV + mandatory fields not in CV (country, canWorkUsHours, assignmentTypes, modalities, preferredCompliance). Editing employment history here is the only way to add/modify skills.
2. **Skills Section**: Read-only list of all skills from `tagsExperience`, mapped against `CANONICAL_TAGS`. Users can deactivate non-critical skills but cannot add skills directly (they add skills by editing employment history in the Applicant section).
3. **Persona Section**: One or multiple (max 3) personas based on stacks derived from user data and skills. Each persona has exactly 5 `mustHaveTags` (the "5 Major Skills" constraint). The LLM proposes initial personas; the user edits/confirms.

### 3.5 Phase 3: Form State & Server Action Mutation

*   **Client State (React Hook Form):** Manages form field values, drag-and-drop state for the 5 Major Skills constraint, and real-time client validation via Zod resolver. RHF runs in the browser only.
*   **Server Execution (Server Actions + `useActionState`):** RHF hands the validated data to a Server Action. The Server Action independently re-validates with `onboardingPayloadSchema.safeParse()` (strict double-validation — never trust client payload).
*   **`useActionState` + `startTransition` (Critical React 19 Pattern):** The `formAction` dispatch returned by `useActionState` must be called inside a `startTransition()` callback. Without this, React logs a console error ("An async function with useActionState was called outside of a transition") and `isPending` does not update correctly. Both `CvUploadForm` and `OnboardingReview` wrap their `formAction(formData)` calls in `startTransition()`.
*   **Direct `formAction(formData)` instead of `requestSubmit()` + hidden fields:** The original approach of populating a hidden `<input>` field and calling `formRef.requestSubmit()` to trigger the bound form action is unreliable in React 19 + Next.js 16. Instead, the component constructs a `FormData` object manually (e.g., `formData.set("payload", JSON.stringify(data))`) and calls `formAction(formData)` directly inside `startTransition()`. This bypasses the HTML form submission mechanism entirely and gives full control over the payload.
*   **`router.refresh()` in `useEffect`, not during render:** Calling `router.refresh()` directly in the component body (during render) causes side effects during render, which React 19 discourages. The pattern is to watch the `useActionState` result in a `useEffect` and call `router.refresh()` there when the action succeeds. This also ensures the refresh only fires once after the action completes, not on every render.
*   **Toast Notifications (sonner):** User-facing success and error feedback is provided via `sonner` toasts (the `<Toaster />` component is mounted in the root layout). Both the CV upload and onboarding completion transitions fire toasts: green success toasts on successful state transitions, red error toasts with the error message on failures. This provides prominent, non-blocking confirmation that the action succeeded.
*   **Inline Form Validation Errors:** The `OnboardingReview` form displays validation errors at two levels: (1) a summary error box at the bottom of the form listing all failed fields (e.g., "Country is required", "Select at least one assignment type"), and (2) inline red error text next to each field that fails validation (country, assignment types, modalities, preferred compliance, persona label, persona embedding summary, persona must-have tags). The `errors` prop from RHF's `formState.errors` is passed down to `ApplicantSection` and `PersonaSection` sub-components for inline display.
*   **Persistence Flow (on submit):**
    1. Upsert `applicant` (country, canWorkUsHours, assignmentTypes, modalities, preferredCompliance, `isOnboarded=true`)
    2. Insert `workingHistory` rows (linked to `cvUploadId`)
    3. Call `recomputeTagsExperience(applicantId)` — transactional (see §3.6)
    4. Rebuild `applicant.allTags` as union of active `tagsExperience.canonicalTag` values
    5. Insert `persona` rows with `personaEmbedding` generated from `embeddingSummary` via `text-embedding-3-small`
*   **Embedding Generation:** Synchronous in the Server Action (~2s, well under the 100s Cloudflare budget). Do NOT route through Inngest — it's a single low-latency call.

<!-- ⚠️ GOTCHA: Never average 30 skills into one vector. Cap at 5 Major Skills per persona, or split into a separate persona row. -->

### 3.6 The Re-aggregation Function (Transactional)

`recomputeTagsExperience(applicantId)` must be wrapped in a Drizzle PostgreSQL transaction. If it fails halfway, the entire operation rolls back to prevent persona corruption.

```typescript
await db.transaction(async (tx) => {
  // 1. Read all workingHistory rows for applicant
  // 2. Merge overlapping date ranges per canonical tag (the overlap algorithm)
  // 3. Delete existing tagsExperience rows for this applicant
  // 4. Insert recomputed tagsExperience rows (upsert via unique constraint)
  // 5. Rebuild applicant.allTags as union of active tagsExperience.canonicalTag values
  // 6. If any persona.mustHaveTags changed, regenerate persona embeddings
});
```

**Called from:**
1. Onboarding submit (initial population)
2. Post-onboarding work history edit (re-aggregation)
3. Post-onboarding CV re-parse (full re-aggregation)

**Persona embedding auto-regeneration:** When `mustHaveTags` change on any persona, the embedding is automatically regenerated via `text-embedding-3-small`. This is automatic, not a user-confirmed action.

### 3.7 Onboarding Completion Constraints

`isOnboarded = true` requires ALL of:

**User-collected (mandatory):**
- `country` (ISO 3166-1 alpha-2)
- `canWorkUsHours` (boolean)
- `assignmentTypes` (≥1 from enum)
- `modalities` (≥1 from enum)
- `preferredCompliance` (≥1 from enum)

**LLM-extracted (mandatory for CV validity):**
- ≥1 employment entry (role, company, start date, end date)
- ≥3 canonical skills mapped to CANONICAL_TAGS

**Derived (mandatory for persona creation):**
- ≥1 persona with exactly 5 `mustHaveTags`
- `embeddingSummary` (3-sentence narrative)
- `personaEmbedding` (generated, non-null)

**Experience level:** Derived purely at query time from `tagsExperience.yearsOfExperience` (junior/mid/senior/staff/lead). No stored enum field on `applicant`.

### 3.8 Orphaned cvUpload Cleanup (Follow-up Task)

An Inngest cron job (post-MVP) deletes `cvUpload` rows where:
- `status` = `processing` or `valid` (not yet consumed by onboarding)
- `createdAt` is older than 24 hours
- The associated `applicant.isOnboarded` = `false`

Not blocking for Module A MVP.

### 3.9 Module A Pending Items (Post-MVP Follow-up)

The Module A MVP is functionally complete — the full onboarding flow (CV upload → LLM extraction → user review → persona persistence → profile display) works end-to-end. The following items are documented as pending with a prioritized timing strategy:

**Timing Strategy Rationale:** Module B (ingestion) and Module C (matching) are the core product value — without jobs to match against, onboarding has no purpose. The current MVP sufficiently populates `persona`, `tagsExperience`, and `applicant.allTags` for Module B/C to consume. Therefore, only P3 is done immediately; P1 and P2 are deferred to a pre-launch hardening sprint; P4 and P5 are post-launch.

| Item | Priority | When to Address | Rationale |
|------|----------|-----------------|-----------|
| P3 — Smart Redirect | ✅ Done | Before Module B | Implemented via two-layer redirect: `signInAction` checks `isOnboarded` post-login; `/dashboard` page checks `isOnboarded` as catch-all for social sign-in and direct URLs |
| P1 — State 3 Editing | Critical (pre-launch) | After Module B/C, before public launch | Read-only is sufficient for testing the matching pipeline; full editing is days of UI work that only matters once real users are using the product |
| P2 — Rate Limiting | Critical (pre-launch) | After Module B/C, before public launch | Cost protection against gpt-4o API abuse; pre-launch with no traffic, LLM cost is a natural limiter |
| P4 — Multiple CV Upload | Medium (post-launch) | Post-launch, tied to paid-tier feature | Feature expansion, not a gap; MVP works with single CV |
| P5 — Orphaned Cleanup | Low (post-launch) | Post-launch, when orphan volume matters | Operational hygiene; orphaned rows don't break anything |

**P1 — State 3 Full Editing (Profile Management):**
Currently implemented as read-only display. The following editing capabilities are required:
- **Employment history CRUD**: Add new jobs, edit existing entries (company, role, dates, skills), delete entries. Each edit triggers `recomputeTagsExperience(applicantId)` transactionally to recompute `tagsExperience` and rebuild `applicant.allTags`.
- **Skills deactivation**: Users can toggle the `active` flag on `tagsExperience` rows (deactivate non-critical skills, cannot delete — skills are derived from employment history). Deactivating a skill removes it from `applicant.allTags` and affects persona matching.
- **Persona CRUD**: Edit existing personas (label, embedding summary, must-have tags, blocklist tags), add new personas (up to max 3), delete personas. Editing `mustHaveTags` triggers persona embedding auto-regeneration via `text-embedding-3-small`.
- **CV re-parse**: Post-onboarding, user can re-upload a CV which triggers full re-aggregation (new `cvUpload` row → LLM extraction → replace `workingHistory` → `recomputeTagsExperience` → rebuild personas if needed).

**P2 — Rate Limiting (3 parses/hour/user):**
The `parseCvAction` currently has a TODO comment for rate limiting. Implementation: query count of `cvUpload` rows created in the last 3600 seconds for the `applicantId`. If count ≥ 3, reject with error: "You have reached the 3 CV parses per hour limit. Please try again later." Currently relies on LLM cost as a natural rate limiter, which is insufficient for production.

**P3 — Smart Dashboard Redirection Logic (✅ Implemented):**
Implemented via a two-layer redirect strategy that covers all auth entry paths:
- **Layer 1 — `signInAction`** (`src/actions/auth.ts`): After successful email sign-in, redirects to `/dashboard`. It does NOT check `isOnboarded` here because `auth.api.signInEmail` sets the session cookie in the *response* headers, but `auth.api.getSession()` reads from the *request* headers — the new cookie isn't available in the same request. The redirect target decision is deferred to Layer 2.
- **Layer 2 — `/dashboard` page** (`src/app/dashboard/page.tsx`): Server component that calls `getAuthSession()` (the session cookie is available in this new request), queries `applicant.isOnboarded`, and redirects to `/dashboard/jobs` (if onboarded) or `/dashboard/profile-management` (if not). This catches all paths: email sign-in (via Layer 1 redirect), social sign-in callback, direct URL access, bookmarks.
- **Sign-up / email verification**: `callbackURL` changed from `/dashboard` to `/dashboard/profile-management` in `signUpAction`, `resendVerificationEmailAction`, `auth.ts` config (`onExistingUserSignUp`), and `auth-client.ts` (social sign-in). New users always need onboarding.

**P4 — Multiple CV Upload / CV List View:**
The DB schema supports multiple `cvUpload` rows per applicant (no unique constraint), but the UI only shows the latest. Required:
- **State 1**: "Add New CV" prominent action button (multiple CV upload allowed only for paid users — tier gating is a post-MVP feature).
- **State 3**: CV list view showing all uploaded CVs with label, upload date, status, and edit/delete actions. Selecting a CV shows its extracted data. Re-parsing a CV triggers full re-aggregation.

**P5 — Orphaned cvUpload Cleanup:**
See §3.8 above. Inngest cron job to delete abandoned uploads. Not blocking for MVP.

---

## 3.9 INNGEST ORCHESTRATION INFRASTRUCTURE `[Status: Implemented]`

The Inngest v4 SDK provides the durable execution layer for all background jobs, scheduled tasks, and event-driven workflows. It is configured as the base infrastructure that Module B (seeding/ingestion) and Module C (routing) build upon.

### 3.9.1 Project Files

| File | Purpose |
|------|---------|
| `src/inngest/client.ts` | Typed Inngest client (`id: "vectormatch"`) with `VectorMatchEvents` catalog. Re-exports as `inngest`. |
| `src/inngest/functions.ts` | All Inngest function definitions: `hnAlgoliaSeeder`, `customUrlResolver`, `bigQuerySeeder`, `phalanxPoller`, `tierRecalc`, `staleCleanup`, `jobIngestedHandler`. |
| `src/inngest/index.ts` | Barrel exports for clean imports (`@/inngest`). |
| `src/app/api/inngest/route.ts` | Next.js App Router serve handler (`GET`, `POST`, `PUT`) with `maxDuration: 300`. |
| `docs/inngest-agent-resources.md` | Coding agent reference: LLM docs, MCP, CLI debugging, AI patterns (`step.ai.wrap`, `step.ai.infer`). |

### 3.9.2 Local Development

```bash
# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — Inngest Dev Server UI at http://localhost:8288
npm run inngest:dev
```

The Dev Server auto-discovers apps on common ports. Environment variable `INNGEST_DEV=1` (set in `.env`) forces the SDK to connect to the local dev server instead of Inngest Cloud.

### 3.9.3 MCP Integration

The Dev Server exposes a Model Context Protocol (MCP) endpoint at `http://127.0.0.1:8288/mcp`, registered in `.devin/config.json`. Coding agents can list functions, send test events, invoke functions, and inspect run status.

### 3.9.4 Self-Hosted Deployment (Coolify/Hetzner)

Unlike Vercel, there is no automatic Inngest integration for self-hosted setups. After each deploy, sync function definitions manually:

```bash
curl -X PUT https://vectormatch.dev/api/inngest --fail-with-body
```

Set `INNGEST_SERVE_ORIGIN=https://vectormatch.dev` in Coolify production environment variables.

**Inngest free plan concurrency cap (June 2026):** The Inngest free plan limits function concurrency to 5 per function. All three concurrent functions (`pollCompanyFn`, `jobIngestedHandler`, `gate3Evaluator`) were lowered from their original values (50/15/15) to 5 to match this cap. The protective intent (limiting simultaneous operations to protect Hetzner CPU/RAM and the Neon pooler) is preserved — 5 is more conservative than the original limits. Upgrade the Inngest plan and raise the limits if higher throughput is needed post-MVP. The sync will fail with HTTP 400 (`"has higher concurrency limits than your plan limit"`) if the code declares a higher limit than the plan allows.

### 3.9.5 Coding Rules for Inngest Functions

1. **Always wrap domain logic in `step.run()`** — never call the DB, external APIs, or AI SDKs directly in the handler body.
2. **Import domain logic lazily** inside the handler to avoid loading heavy modules at discovery time.
3. **Send events with `step.sendEvent()`** so emission is part of the durable trace.
4. **Use `step.ai.wrap()` or `step.ai.infer()`** for all LLM calls inside Inngest functions — full observability, retry logic, and cost offloading.
5. **Register new functions** in `src/app/api/inngest/route.ts`.

---

## 4. MODULE B: SEEDING & INGESTION PIPELINE

**Goal:** Discover non-tech and startup ATS slugs for $0, then poll them natively without getting blocked. The system is fully autonomous — no human-in-the-loop for routine operations. Unresolvable discoveries are discarded, not queued for manual review.

### 4.0 The `company` Table — The ATS Slug Registry `[Status: Implemented]`

The seeders discover `(company_domain, ats_source, ats_slug)` tuples. These must persist in a dedicated registry table — the `job` table stores jobs, not companies. Without this table, the Phalanx Poller has nowhere to read from and seeders have nowhere to write to.

**Drizzle Path:** `src/db/schemas/jobs/company.ts`

```typescript
// src/db/schemas/jobs/company.ts

// ── Enums ──────────────────────────────────────────────────────────────────

export const atsSourceEnum = pgEnum("ats_source", [
  "greenhouse",
  "lever",
  "ashby",
  // Future: "smartrecruiters", "recruitee", "workable"
]);

export const companyTierEnum = pgEnum("company_tier", [
  "active",   // Tier A: posted a job in last 14 days → poll every 12h
  "dormant",  // Tier B: no jobs in >14 days → poll weekly
  "dead",     // Tier C: endpoint returns 404 or 3+ consecutive failures → stop
]);

export const companyHealthEnum = pgEnum("company_health", [
  "healthy",      // Last poll succeeded
  "degraded",     // Last poll had partial failures (some jobs failed Zod validation)
  "rate_limited", // Got 429 — backed off, will retry next cycle
  "blocked",      // Got 403 — needs proxy or investigation
  "error",        // Unexpected error (500, timeout, malformed JSON)
  "dead",         // Endpoint returns 404 — company left the ATS
]);

export const discoverySourceEnum = pgEnum("discovery_source", [
  "httparchive",   // BigQuery volume seeder
  "hn_algolia",    // Hacker News delta seeder
  "crt_sh",        // Certificate Transparency stealth seeder (Phase 2)
  "hn_custom_url", // HN comment with non-ATS URL → CNAME/probe resolved
  "manual",        // Admin-added via dashboard
]);

// ── Table ──────────────────────────────────────────────────────────────────

export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── Identity ────────────────────────────────────────────────────────────
    atsSlug: text("ats_slug").notNull(),
    atsSource: atsSourceEnum("ats_source").notNull(),
    companyName: text("company_name"),  // Filled in by poller from ATS metadata
    rootDomain: text("root_domain"),    // For cross-seeder dedup

    // ── Discovery Provenance ────────────────────────────────────────────────
    discoverySource: discoverySourceEnum("discovery_source").notNull(),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    discoveryContext: text("discovery_context"),  // HN comment URL, BQ query date, etc.

    // ── Tier & Polling State ────────────────────────────────────────────────
    tier: companyTierEnum("tier").notNull().default("dormant"),
    lastPolledAt: timestamp("last_polled_at"),
    lastJobPostedAt: timestamp("last_job_posted_at"),  // Drives tier transitions
    activeJobCount: integer("active_job_count").notNull().default(0),

    // ── Health & Error Tracking ─────────────────────────────────────────────
    health: companyHealthEnum("health").notNull().default("healthy"),
    lastErrorMessage: text("last_error_message"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),

    // ── Operational Flags ───────────────────────────────────────────────────
    pollingEnabled: boolean("polling_enabled").notNull().default(true),

    // ── Timestamps ──────────────────────────────────────────────────────────
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    // A company can have multiple ATS sources — uniqueness is (ats_source, ats_slug)
    uniqueAtsSlug: uniqueIndex("company_unique_ats_slug")
      .on(table.atsSource, table.atsSlug),
    // Index for the poller's daily query: tier + pollingEnabled + lastPolledAt
    tierPollingIdx: index("company_tier_polling_idx")
      .on(table.tier, table.pollingEnabled, table.lastPolledAt),
    // Index for domain-based dedup across seeders
    domainIdx: index("company_root_domain_idx").on(table.rootDomain),
    // Index for health dashboard queries
    healthIdx: index("company_health_idx").on(table.health),
  }),
);
```

**Key design decisions:**
- **`uniqueIndex(atsSource, atsSlug)`** — A company might use Greenhouse for eng and Lever for sales. Slug alone isn't globally unique.
- **`companyTierEnum` is separate from `companyHealthEnum`** — Tier (active/dormant/dead) is about polling cadence. Health (healthy/degraded/rate_limited/blocked/error/dead) is about last poll result. These are orthogonal.
- **`lastJobPostedAt` drives tier transitions** — The decay algorithm doesn't need a separate tracking table. The poller updates this field; tier recalculation runs as a daily scheduled query.
- **`consecutiveFailures` with threshold of 3** — Automatic `→ dead` transition. Three consecutive poll failures mark the company as dead and stop polling.
- **No FK to `job` table** — The relationship is logical (jobs matched by `atsSource + atsSlug`), not enforced. This prevents poller failures when a job arrives for a slug not yet in the registry.

### 4.0b The `ingestionLog` Table — Observability `[Status: Implemented]`

Without observability, the pipeline is a black box. Every seeder and poller run is logged here.

**Drizzle Path:** `src/db/schemas/jobs/ingestionLog.ts`

```typescript
export const ingestionLogTypeEnum = pgEnum("ingestion_log_type", [
  "seed",         // Seeder ran (HN, BigQuery, crt.sh)
  "poll",         // Poller polled a company
  "tier_recalc",  // Tier recalculation ran
  "stale_cleanup",// Stale job cleanup ran
]);

export const ingestionLogStatusEnum = pgEnum("ingestion_log_status", [
  "success",
  "partial",   // Some items failed but the run completed
  "failed",    // The entire run failed
]);

export const ingestionLog = pgTable(
  "ingestion_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: ingestionLogTypeEnum("type").notNull(),
    status: ingestionLogStatusEnum("status").notNull(),
    companyId: uuid("company_id"),  // FK to company.id (nullable for seed/cleanup)
    source: text("source"),          // e.g. "hn_algolia", "httparchive", "greenhouse"
    // Metrics
    itemsProcessed: integer("items_processed").notNull().default(0),
    itemsInserted: integer("items_inserted").notNull().default(0),
    itemsUpdated: integer("items_updated").notNull().default(0),
    itemsRejected: integer("items_rejected").notNull().default(0),  // Failed Gate 0 or Zod
    itemsSkipped: integer("items_skipped").notNull().default(0),    // Duplicates
    // Error details
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"),  // Zod error issues, HTTP status codes, etc.
    // Duration
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index("ingestion_log_type_idx").on(table.type, table.createdAt),
    companyIdx: index("ingestion_log_company_idx").on(table.companyId, table.createdAt),
    statusIdx: index("ingestion_log_status_idx").on(table.status, table.createdAt),
  }),
);
```

### 4.0c The `job` Table Updates — Deduplication & Stale Tracking `[Status: Implemented]`

The existing `job` table (§2.1) needs three additions for Module B:

1. **`externalJobId` (text, notNull)** — The ATS's internal job ID (e.g. Greenhouse's numeric `id`, Lever's UUID string). Used for deduplication via upsert.
2. **`lastSeenAt` (timestamp, notNull, default now)** — When the job was last seen in a poll. Updated on every re-poll. Drives stale detection.
3. **`status` (text, notNull, default 'active')** — `active` | `stale` | `gone`. Jobs not seen in 7 days → `stale`. Not seen in 30 days → `gone`. Module C's Gate 1+2 query must filter `WHERE status = 'active'`.

**New indexes:**
- `uniqueIndex("job_unique_ats_job").on(atsSource, atsSlug, externalJobId)` — The deduplication anchor. A job is uniquely identified by `(ats_source, ats_slug, external_job_id)`.
- `index("job_status_idx").on(status, lastSeenAt)` — For the daily stale cleanup query.

**Upsert pattern in the poller:**
```typescript
await db.insert(job).values({
  atsSource: "greenhouse",
  atsSlug: slug,
  externalJobId: String(ghJob.id),
  title: ghJob.title,
  rawJson: JSON.stringify(ghJob),
  extractedTags: [],       // Empty — Module C fills these in
  jobEmbedding: null,      // Null — Module C generates this
  lastSeenAt: new Date(),
  status: "active",
}).onConflictDoUpdate({
  target: [job.atsSource, job.atsSlug, job.externalJobId],
  set: {
    title: ghJob.title,
    rawJson: JSON.stringify(ghJob),
    lastSeenAt: new Date(),
    status: "active",  // Resurrect if it was stale/gone
  },
});
```

### 4.1 The Discovery/Seeding Engines

Do not scrape career pages dynamically. Seed the database with known ATS slugs. The system is fully autonomous — unresolvable discoveries are discarded, not queued for manual review.

**Timescale separation — three different operational patterns:**

| Component | Schedule | Implementation | Failure Mode |
|-----------|----------|----------------|--------------|
| BigQuery Volume Seeder | Monthly (manual script) | `scripts/seed-bigquery.ts` via `npm run seed:bigquery` | Query fails → no new companies → retry next month |
| HN Algolia Delta Seeder | Weekly (Inngest scheduled) | Inngest function `seeder/hn-algolia` with `cron: "0 0 * * 1"` | API fails → Inngest automatic retry (3 attempts) |
| crt.sh Stealth Seeder | Phase 2 (deferred) | — | — |

#### 4.1.1 HTTPArchive BigQuery (The Volume Seeder) `[Status: Implemented]`

**⚠️ CRITICAL: The `httparchive.technologies` table no longer exists.** As of April 2025, the HTTP Archive reorganized their BigQuery dataset. The data now lives in `httparchive.crawl.pages` (~30 TB/month) as a nested `technologies.technology` array field within each page record. The old query strategy (`WHERE technology = 'Next.js'` against a standalone table) will not run.

**Cost optimization strategy:**
- BigQuery Sandbox Mode: 1 TB free query processing per month, no billing required.
- BigQuery charges per column scanned, not per filter complexity. Adding technologies to `IN UNNEST()` costs the same as querying for one.
- **Always pin `date` to a specific monthly crawl** (partition filter is mandatory — table is 30 TB/month).
- Filter on `client = 'desktop'` (halves scan volume) and `is_root_page = true` (only homepages).
- Use `TABLESAMPLE SYSTEM (0.01 PERCENT)` for exploratory queries (scans ~3 GB instead of ~30 GB).
- Two-phase approach: (1) cheap query on `technologies` column to find candidate domains, (2) targeted query on `payload` column for ATS script URL verification.

**Technology subset for the query (4 tiers):**

| Tier | Technologies | Rationale |
|------|-------------|-----------|
| **Tier 1 — Core web frameworks** | `Next.js`, `React`, `Vue.js`, `Nuxt.js`, `Svelte`, `SvelteKit`, `Angular`, `Astro`, `Remix`, `Gatsby`, `Solid.js` | Persona-defining for target users |
| **Tier 2 — Backend/runtime** | `Node.js`, `Express`, `NestJS`, `Fastify`, `Deno`, `Bun` | Catches backend-heavy shops without a JS frontend framework |
| **Tier 3 — Build tools & CSS** | `Tailwind CSS`, `Vite`, `esbuild`, `TypeScript`, `Playwright`, `Vitest` | High correlation with modern dev teams |
| **Tier 4 — Legacy (detectable)** | `PHP`, `WordPress`, `Laravel`, `Drupal`, `Symfony`, `Ruby on Rails` | These heavily influence frontend HTML structure, headers, and cookies — detectable via HTTPArchive unlike pure Go/Rust backends |

**Note on Tier 4:** Unlike pure Go or Rust backends (which leave no frontend fingerprint), PHP/Rails/WordPress stacks are detectable because they generate distinctive HTML structures, HTTP headers (`X-Powered-By: PHP/X.Y`), session cookies (`PHPSESSID`, `_rails_session`), and meta generator tags. These companies still hire frontend developers and full-stack engineers — excluding them would miss a significant portion of the market.

**Exploratory query (validate logic before full scan):**
```sql
SELECT
  page,
  root_page,
  technologies.technology AS tech_list
FROM `httparchive.crawl.pages`
TABLESAMPLE SYSTEM (0.01 PERCENT)
WHERE
  date = '2024-06-01'
  AND client = 'desktop'
  AND is_root_page
  AND (
    'Next.js' IN UNNEST(technologies.technology)
    OR 'React' IN UNNEST(technologies.technology)
    OR 'Vue.js' IN UNNEST(technologies.technology)
    OR 'Nuxt.js' IN UNNEST(technologies.technology)
    OR 'Svelte' IN UNNEST(technologies.technology)
    OR 'SvelteKit' IN UNNEST(technologies.technology)
    OR 'Angular' IN UNNEST(technologies.technology)
    OR 'Astro' IN UNNEST(technologies.technology)
    OR 'Remix' IN UNNEST(technologies.technology)
    OR 'Gatsby' IN UNNEST(technologies.technology)
    OR 'Solid.js' IN UNNEST(technologies.technology)
    OR 'Node.js' IN UNNEST(technologies.technology)
    OR 'Express' IN UNNEST(technologies.technology)
    OR 'NestJS' IN UNNEST(technologies.technology)
    OR 'Fastify' IN UNNEST(technologies.technology)
    OR 'Deno' IN UNNEST(technologies.technology)
    OR 'Bun' IN UNNEST(technologies.technology)
    OR 'Tailwind CSS' IN UNNEST(technologies.technology)
    OR 'Vite' IN UNNEST(technologies.technology)
    OR 'esbuild' IN UNNEST(technologies.technology)
    OR 'TypeScript' IN UNNEST(technologies.technology)
    OR 'Playwright' IN UNNEST(technologies.technology)
    OR 'Vitest' IN UNNEST(technologies.technology)
    OR 'PHP' IN UNNEST(technologies.technology)
    OR 'WordPress' IN UNNEST(technologies.technology)
    OR 'Laravel' IN UNNEST(technologies.technology)
    OR 'Drupal' IN UNNEST(technologies.technology)
    OR 'Symfony' IN UNNEST(technologies.technology)
    OR 'Ruby on Rails' IN UNNEST(technologies.technology)
  )
  AND (
    REGEXP_CONTAINS(LOWER(payload), 'boards-api\\.greenhouse\\.io')
    OR REGEXP_CONTAINS(LOWER(payload), 'boards\\.greenhouse\\.io')
    OR REGEXP_CONTAINS(LOWER(payload), 'api\\.lever\\.co/v0/postings')
    OR REGEXP_CONTAINS(LOWER(payload), 'jobs\\.lever\\.co')
    OR REGEXP_CONTAINS(LOWER(payload), 'api\\.ashbyhq\\.com/posting-api')
  )
LIMIT 1000;
```

**Delta query (monthly — find domains in the new crawl that weren't in the previous):**
```sql
WITH new_crawl AS (
  SELECT DISTINCT root_page
  FROM `httparchive.crawl.pages`
  WHERE date = '2024-07-01' AND client = 'desktop' AND is_root_page
    AND ('Next.js' IN UNNEST(technologies.technology)
         OR 'React' IN UNNEST(technologies.technology)
         /* ... full tier list ... */)
),
prev_crawl AS (
  SELECT DISTINCT root_page
  FROM `httparchive.crawl.pages`
  WHERE date = '2024-06-01' AND client = 'desktop' AND is_root_page
    AND ('Next.js' IN UNNEST(technologies.technology)
         OR 'React' IN UNNEST(technologies.technology)
         /* ... full tier list ... */)
)
SELECT n.root_page FROM new_crawl n
LEFT JOIN prev_crawl p ON n.root_page = p.root_page
WHERE p.root_page IS NULL;
```

**HTTPArchive homepage-only limitation — the workaround:**

HTTPArchive only crawls homepages (`/`). If a company embeds their Greenhouse widget only on `company.com/careers`, the ATS script URL won't appear in the homepage's HAR data. The workaround is a two-phase approach:

1. **Phase 1 (BigQuery):** Query for domains running our target tech stack. This gives candidate root domains — companies that are likely tech companies hiring developers. The ATS widget doesn't need to be on the homepage.
2. **Phase 2 (Phalanx Poller probe):** For each candidate domain, the poller attempts to resolve the ATS slug by trying known URL patterns against the inferred slug (e.g. `acme.com` → try slug `acme` against all three ATS APIs). If any returns valid JSON with jobs, the ATS slug is found. If none return valid data, the domain is discarded — no manual review.

**Implementation notes `[Status: Implemented]`:**

| File | Role |
|------|------|
| `src/lib/jobs/seeders/bq-schemas.ts` | Zod schemas for BigQuery HTTPArchive query result rows (with `REGEXP_EXTRACT` slug fields: `greenhouse_slug`, `lever_slug`, `ashby_slug`). |
| `src/lib/jobs/seeders/bigquery-seeder.ts` | Domain logic with injectable `BigQueryFn`. SQL builder (`buildBigQuerySql`), two-phase slug extraction (direct `REGEXP_EXTRACT` + slug probe fallback via `resolveCustomUrl`), `processBigQueryRows` pure function. |
| `scripts/seed-bigquery.ts` | Manual script wrapper (`npx tsx scripts/seed-bigquery.ts --date 2024-06-01 --limit 1000`). Uses `createDefaultBigQueryFn()` which wraps `@google-cloud/bigquery`. |

**Key implementation decisions:**
- The SQL query uses `REGEXP_EXTRACT` to pull ATS slugs directly from the homepage payload when possible (Phase 1). Domains where the slug couldn't be extracted go through the slug probe resolver (Phase 2).
- Slug priority: Greenhouse > Lever > Ashby (when a domain has multiple ATS integrations, the first non-null slug wins).
- The BigQuery client is injectable (`BigQueryFn = (sql: string) => Promise<BigQueryRow[]>`) for testing without real GCP credentials.
- Dual execution: manual script (`scripts/seed-bigquery.ts`) + Inngest scheduled function (`bigQuerySeeder`, monthly cron `0 0 1 * *`). Both call `runBigQuerySeeder()`.
- Test coverage: 31 unit tests (11 schema tests + 20 seeder tests) with mocked BQ client.

#### 4.1.2 HN Algolia Sniper (The Delta Seeder) `[Status: Implemented]`

**Endpoint:** Two-phase fetch against `https://hn.algolia.com/api/v1/`:
1. **Phase 1 (find story):** `search_by_date?tags=story,author_whoishiring&hitsPerPage=10` — finds the most recent "Ask HN: Who is hiring?" story by the `whoishiring` account (which posts both "Who is hiring?" and "Who wants to be hired?" threads monthly; we filter to only the hiring one by title).
2. **Phase 2 (fetch comments):** `search_by_date?tags=comment,story_{storyId}&hitsPerPage=50` — paginates through all comments on that story. The actual job postings are the oldest comments (from the 1st of the month); `search_by_date` returns newest first (job seeker replies), so all pages must be fetched.

> **Why not full-text search?** Discovered via live testing (June 2026): the broad query `?query=Ask+HN+Who+is+hiring` matches "Who wants to be hired" threads (job seekers, no ATS URLs) and unrelated comments. The two-phase approach is precise — it only fetches comments on the actual hiring thread.

This is the primary "hidden jobs" discovery engine. HN "Who is Hiring" surfaces 200–500 companies per month, many of which are first-time posters or small startups that won't be in HTTPArchive's top-sites crawl. The companies self-select by posting — they're actively hiring and want to be found.

**HTML entity decoding (critical):** The HN Algolia API returns HTML-encoded comment text where `/` is `&#x2F;`, `'` is `&#x27;`, `&` is `&amp;`, etc. Without decoding, URLs appear as `https:&#x2F;&#x2F;job-boards.greenhouse.io&#x2F;planetscale` and are invisible to the URL regex. The `extractUrls()` function in `url-parser.ts` decodes HTML entities before applying the URL regex. Discovered via live testing — 0 ATS URLs were found across 501 comments before this fix.

**URL extraction strategy — two categories:**

1. **Direct ATS URLs** (immediately usable): Extract URLs matching these hostnames:
   - `boards.greenhouse.io/{slug}` — Greenhouse hosted board
   - `job-boards.greenhouse.io/{slug}` — Greenhouse hosted board (alternate hostname, e.g. PlanetScale)
   - `boards-api.greenhouse.io/v1/boards/{slug}/jobs` — Greenhouse API
   - `jobs.lever.co/{slug}` — Lever hosted board
   - `api.lever.co/v0/postings/{slug}` — Lever API
   - `api.ashbyhq.com/posting-api/job-board/{slug}` — Ashby API
   - `careers.ashbyhq.com/{slug}` — Ashby hosted board (primary pattern)
   - `jobs.ashbyhq.com/{slug}` — Ashby hosted board (legacy/alternate)

   These map directly to `company` table rows.

2. **Non-ATS URLs** (e.g. `mystartup.com/careers`): The system attempts autonomous resolution via a two-stage process:
   - **Stage 1 — DNS CNAME check:** For `careers.mystartup.com`, do a DNS CNAME lookup. If it resolves to `boards.greenhouse.io` or `lever.co`, the ATS is found.
   - **Stage 2 — Slug probe:** If CNAME fails, extract the company name from the URL and try `boards-api.greenhouse.io/v1/boards/{slug}/jobs`, `api.lever.co/v0/postings/{slug}?mode=json`, `api.ashbyhq.com/posting-api/job-board/{slug}`. If any returns valid JSON, the ATS slug is found.
   - **If both fail: discard the URL.** The system is fully autonomous — no manual review queue. Unresolvable URLs are logged in `ingestionLog` for observability but not acted upon. If practice shows the majority of HN job listings fall into this unresolvable category, alternative resolution strategies will be considered.

**Implementation:** The HN seeder runs as an Inngest scheduled function (`seeder/hn-algolia`, weekly on Monday). The custom-URL resolver runs as a separate Inngest function (`seeder/resolve-custom-url`), triggered by events from the HN seeder. This separation keeps the HN seeder fast (text parsing only) and isolates network-dependent logic.

#### 4.1.3 crt.sh (The Stealth Seeder) `[Status: Planned / TO DO — Phase 2, Post-MVP]`

**Decision: Deferred to Phase 2.** HN Algolia is the superior "hidden jobs" discovery engine because:
- Companies self-select by posting on HN — they're actively hiring.
- Posts include job descriptions, enabling seeder-level filtering for developer roles.
- Many posters are first-time companies not in HTTPArchive.
- Signal-to-noise ratio is far higher than crt.sh's wildcard query (200–500 curated posts vs. millions of certificate records).

crt.sh's wildcard query (`%.careers.*`) returns every domain with "careers" in the name — most are not hiring developers. A truly "stealth" startup often doesn't have an ATS yet (they use "email us" pages), so crt.sh finds the subdomain but there's no JSON API to poll.

**When implemented (Phase 2), the approach will be:**
- Use the **direct PostgreSQL connection** (`postgres://guest@crt.sh:5432/certwatch`) instead of the HTTP API — far more reliable, bypasses web server rate limiting.
- Query the `certificate_identity` table directly with date constraints (`ci.NOT_BEFORE > NOW() - INTERVAL '30 days'`) to only get new certificates.
- **Expanded pattern matching:** `%.careers.*`, `%.jobs.*`, `%.join.*`, `%.work.*`, `%.hiring.*`, `%.talent.*`, `%.opportunities.*`, `%.roles.*`, `%.apply.*`, `%.team.*`.
- **Two-stage verification:** (1) CNAME lookup, (2) slug probe against all three ATS APIs. If both fail, discard — no manual review.

### 4.2 ATS Endpoint Registry & Defensive Zod Schemas `[Status: Implemented]`

#### 4.2.1 Centralized ATS Endpoint Registry

**Drizzle Path:** `src/lib/jobs/ats-endpoints.ts`

A single source of truth for ATS API endpoints. When an endpoint changes, this is the only file to update.

```typescript
export const ATS_ENDPOINTS = {
  greenhouse: {
    // Public Job Board API — no auth required.
    // Docs: https://developers.greenhouse.io/job-board.html
    jobsList: (slug: string) =>
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    jobDetail: (slug: string, jobId: string) =>
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`,
    hostedBoard: (slug: string) => `https://boards.greenhouse.io/${slug}`,
  },
  lever: {
    // Public Postings API v0 — no auth required.
    // Docs: https://github.com/lever/postings-api
    // Note: v1 requires auth. v0 is the public endpoint.
    // EU instance available at api.eu.lever.co
    jobsList: (slug: string) =>
      `https://api.lever.co/v0/postings/${slug}?mode=json`,
    jobDetail: (slug: string, postingId: string) =>
      `https://api.lever.co/v0/postings/${slug}/${postingId}`,
    hostedBoard: (slug: string) => `https://jobs.lever.co/${slug}`,
  },
  ashby: {
    // Public Job Posting API — no auth required.
    // Docs: https://developers.ashbyhq.com/docs/public-job-posting-api
    jobsList: (slug: string) =>
      `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
    hostedBoard: (slug: string) => `https://careers.ashbyhq.com/${slug}`,
  },
} as const;
```

**Lever filtering features:** The v0 API supports query parameters: `mode=json` (always set), `limit` (set to 1000), `skip` (pagination), `commitment` (filter by employment type — use `?commitment=Fulltime&commitment=Contract` to skip internships at the API level), `team`, `location`, `department`. The `team` and `department` values are case-sensitive and company-specific — do not use them for server-side filtering. Rely on Gate 0 (§4.4) for role filtering.

#### 4.2.2 Automated Endpoint Health Monitoring & LLM Recovery `[Status: Planned / TO DO]`

The endpoint registry is augmented with an automated health monitoring and recovery system to prevent prolonged service misconfiguration when ATS providers change their APIs:

1. **Health Monitoring:** An Inngest scheduled function (`[Status: Planned / TO DO]` — Inngest base to be set up in a subsequent iteration) periodically tests each ATS endpoint by making a lightweight probe request (e.g. fetching 1 job from a known-active slug). If the endpoint returns unexpected HTTP status codes or fails Zod validation across multiple slugs, it is flagged as `endpoint_degraded`.

2. **LLM-Based Endpoint Recovery:** When an endpoint is flagged as `endpoint_degraded`, an automated recovery function is triggered `[Status: Planned / TO DO]`. This function:
   - Uses `gpt-4o-mini` to research the ATS provider's current developer documentation (via web search + page fetch).
   - Extracts the new API URL pattern from the documentation.
   - Proposes an updated endpoint configuration.
   - Tests the proposed endpoint against a known slug.
   - If the test succeeds, updates `src/lib/jobs/ats-endpoints.ts` programmatically and emits an alert (logged in `ingestionLog`).
   - If the test fails, logs the failure and leaves the endpoint unchanged — the system degrades gracefully (Zod `safeParse` catches the mismatch) until manual intervention.

3. **Zod Schema Drift Detection:** Every ATS response is passed through `schema.safeParse()`. If validation fails across multiple slugs for the same ATS, this triggers the endpoint recovery function — the JSON payload structure may have changed even if the URL hasn't.

**Note:** The Inngest base infrastructure is now set up (see §3.9). The function definitions, scheduling configuration, and step-level implementation for this monitoring/recovery system can now be added to `src/inngest/functions.ts` and registered in `src/app/api/inngest/route.ts`.

#### 4.2.3 Defensive Zod Schemas

**Drizzle Path:** `src/lib/jobs/ats-schemas.ts`

Because we don't control the Greenhouse/Lever/Ashby APIs, we MUST use Zod to validate their incoming JSON. If a job is missing a description, our pipeline gracefully skips it rather than crashing the Inngest worker.

**Greenhouse Job Board API response schema:**
```typescript
export const greenhouseJobSchema = z.object({
  id: z.number(),
  internal_job_id: z.number().optional(),
  title: z.string(),
  updated_at: z.string().optional(),
  requisition_id: z.string().nullable().optional(),
  location: z.object({ name: z.string() }).optional(),
  absolute_url: z.string().url(),
  content: z.string().optional(),
  metadata: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).nullable().optional(),
  language: z.string().optional(),
});

export const greenhouseJobsResponseSchema = z.object({
  jobs: z.array(greenhouseJobSchema),
  meta: z.object({ total: z.number() }).optional(),
});
```

**Lever Postings API v0 response schema:**
```typescript
export const leverJobSchema = z.object({
  id: z.string(),
  text: z.string(),  // Job title (Lever calls it "text")
  categories: z.object({
    location: z.string().nullable().optional(),
    commitment: z.string().nullable().optional(),
    team: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    allLocations: z.array(z.string()).optional(),
  }).optional(),
  country: z.string().nullable().optional(),
  descriptionPlain: z.string().optional(),
  description: z.string().optional(),
  hostedUrl: z.string().url(),
  applyUrl: z.string().url().optional(),
  workplaceType: z.enum(["unspecified", "on-site", "remote", "hybrid"]).optional(),
  salaryRange: z.object({
    currency: z.string().optional(),
    interval: z.string().optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).nullable().optional(),
});

export const leverJobsResponseSchema = z.array(leverJobSchema);
```

**Ashby Job Posting API response schema:**
```typescript
export const ashbyJobSchema = z.object({
  id: z.string(),
  title: z.string(),
  location: z.object({ locationName: z.string().optional() }).optional(),
  descriptionHtml: z.string().optional(),
  descriptionPlain: z.string().optional(),
  externalLink: z.string().url().optional(),
  workplace: z.enum(["remote", "hybrid", "on-site"]).optional(),
}).passthrough();  // Allow extra fields — Ashby adds fields frequently

export const ashbyJobsResponseSchema = z.object({
  jobs: z.array(ashbyJobSchema),
}).passthrough();
```

**Error handling pattern:** Always use `safeParse()`, never `parse()`. On validation failure, log the Zod error, skip the slug, mark the company as `health = "degraded"`, and continue. The pipeline never crashes on a single bad response.

**Complete Zod schema inventory for Module B:**

| Schema | Location | Purpose |
|--------|----------|---------|
| `greenhouseJobSchema` / `greenhouseJobsResponseSchema` | `src/lib/jobs/ats-schemas.ts` | Greenhouse job board API |
| `leverJobSchema` / `leverJobsResponseSchema` | same | Lever v0 postings API |
| `ashbyJobSchema` / `ashbyJobsResponseSchema` | same | Ashby posting API |
| `hnAlgoliaHitSchema` / `hnAlgoliaResponseSchema` | `src/lib/jobs/seeders/hn-schemas.ts` | HN Algolia API response |
| `crtShRecordSchema` | `src/lib/jobs/seeders/crt-schemas.ts` | crt.sh PostgreSQL query result (Phase 2) |
| `bigQueryRowSchema` | `src/lib/jobs/seeders/bq-schemas.ts` | BigQuery HTTPArchive query result row |
| `pollerEventSchema` | `src/lib/jobs/poller/schemas.ts` | Inngest `poller/poll-company` event payload |
| `seedCompanyInputSchema` | `src/lib/jobs/seeders/schemas.ts` | Input to company insert function (all seeders) |

### 4.3 Gate 0 — Pre-Database-Insertion Title Filter `[Status: Implemented]`

**Drizzle Path:** `src/lib/jobs/gate-zero.ts`

Before the Poller saves a job to the database, a fast synchronous regex test on the job title filters out non-engineering roles. If the title doesn't match, the job is thrown away immediately — it never touches the database. This prevents thousands of "Account Executive", "HR Manager", and "Janitor" roles from slowing down the Postgres HNSW index and eating disk space.

**Design principle: optimize for recall, not precision, at Gate 0.** The 3-Gate funnel (Module C) handles precision. The cost of a false positive (one extra row filtered out by Gate 1/2/3) is low. The cost of a false negative (a missed job opportunity) is high.

**Relevant title terms (word-boundary matched, case-insensitive):**
- Core engineering: `engineer`, `engineering`, `developer`, `programmer`, `software`, `frontend`, `front-end`, `backend`, `back-end`, `fullstack`, `full-stack`
- Specialized: `devops`, `sre`, `site reliability`, `platform engineer`, `architect`, `data engineer`, `data scientist`, `ml engineer`, `machine learning engineer`, `security engineer`, `infrastructure`, `reliability`
- Mobile: `ios developer`, `android developer`, `mobile developer`, `react native`
- Leadership: `tech lead`, `engineering manager`, `engineering director`, `cto`, `vp of engineering`, `head of engineering`
- QA: `qa engineer`, `test engineer`, `automation engineer`, `quality engineer`
- Design-adjacent: `ui engineer`, `ux engineer`

**Implementation:** A single compiled regex with `\b` word boundaries and alternation. Phrase matching (`data engineer`, `ml engineer`) catches specialized roles without catching unrelated "data" or "ml" mentions. Word boundaries prevent "Data Entry Clerk" from matching `data`.

### 4.4 The "Phalanx" Poller `[Status: Implemented]`

Do not use AWS API Gateway for Native ATS endpoints. They do not run TLS fingerprinting.

#### 4.4.1 Three Optimizations for Production Scalability

Polling 100,000 HTTP requests daily from a single Hetzner CX33 (2 vCPU / 8GB RAM) will exhaust resources, max out the Neon database connection pool, and likely get the server's IP blacklisted. Three optimizations prevent this:

**Optimization 1 — Strict Concurrency Limits:**
- Inngest is capped at 5 maximum concurrent steps (Inngest free plan limit, June 2026; originally 50). This protects the Hetzner CPU/RAM and prevents the Neon Serverless Postgres pool from being overwhelmed.
- The `bottleneck` npm package enforces a hard limit of 2 concurrent requests per second per ATS platform. Implementation: `maxConcurrent: 1, minTime: 500` per ATS source — guarantees strictly 2 req/s with no concurrent requests.

**Optimization 2 — Separation of Heavy Compute:**
- The Poller only fetches JSON and inserts it into Postgres. It does NOT run AI embeddings (gpt-4o-mini / text-embedding-3-small).
- The heavy vector math is deferred to Inngest Event `job/ingested` (Module C). This ensures the Poller never blocks on LLM latency.

**Optimization 3 — The Decay Polling Algorithm:**

The TDD's original "Run Daily" is not scalable. A priority queuing strategy based on company activity reduces the poll load:

| Tier | Condition | Polling Cadence |
|------|-----------|-----------------|
| **Tier A (Active)** | Posted a job in the last 14 days | Every 12 hours |
| **Tier B (Dormant)** | No jobs posted in >14 days | Weekly |
| **Tier C (Dead)** | Endpoint returns 404 or 3+ consecutive failures | Stop polling entirely |

**Tier transitions are computed daily, not in real-time:**
A separate Inngest scheduled function (`poller/recompute-tiers`, `cron: "0 4 * * *"`) runs a single SQL statement to recalculate all tiers:
```sql
UPDATE company SET
  tier = CASE
    WHEN health = 'dead' OR consecutive_failures >= 3 THEN 'dead'
    WHEN last_job_posted_at > NOW() - INTERVAL '14 days' THEN 'active'
    ELSE 'dormant'
  END
WHERE polling_enabled = true;
```

**Polling cadence is implemented via two Inngest scheduled functions (fan-out pattern):**
- `poller-tier-active` (`cron: "0 */12 * * *"`) — emits `poller/poll-company` events for all Tier A companies.
- `poller-tier-dormant` (`cron: "0 0 * * 0"`) — emits `poller/poll-company` events for all Tier B companies.
- Each `poller/poll-company` event triggers a separate Inngest function instance that polls a single company. Inngest's concurrency cap (5, free plan limit) naturally limits simultaneous polls.

**Do NOT create per-company Inngest scheduled functions** — 100,000 scheduled functions would overwhelm Inngest. The fan-out pattern (2 scheduled functions → N events → N function instances) is the correct architecture.

#### 4.4.2 Rate Limiting Implementation

`bottleneck` is used **within each per-company function instance**, not across all companies. One limiter per ATS source ensures the aggregate rate stays at 2 req/s:

```typescript
const limiters: Record<string, Bottleneck> = {
  greenhouse: new Bottleneck({ maxConcurrent: 1, minTime: 500 }),
  lever: new Bottleneck({ maxConcurrent: 1, minTime: 500 }),
  ashby: new Bottleneck({ maxConcurrent: 1, minTime: 500 }),
};
```

**What happens when the queue is full?** Each per-company function instance makes only 1–2 HTTP requests. The bottleneck limiter ensures that across all concurrent Inngest instances polling the same ATS, the aggregate rate stays at 2 req/s. Individual instances wait for their turn via bottleneck's queue. If the wait exceeds 30 seconds (bottleneck `expiration: 30000`), the step throws, and Inngest retries the whole function (up to 3 times). On retry, the queue may have drained. If all 3 retries fail, `consecutiveFailures` is incremented.

#### 4.4.3 Proxy Strategy — Deferred to Post-MVP

Proxies are prematurely optimized for MVP. The rate limiter (`bottleneck` at 2 req/s) is sufficient — Greenhouse and Lever don't aggressively block JSON API access at this rate. Proxies add failure modes that are hard to debug (proxy timeout vs. ATS timeout vs. code bug) and cost ~$50–$150/mo.

**Trigger to add proxies:** When we see the first persistent 403 from an ATS that isn't a 404 (endpoint gone). At that point, add a proxy fallback layer *behind* the bottleneck rate limiter: `bottleneck (2 req/s) → direct request → on 403: retry through proxy`.

#### 4.4.4 The Stale Job Problem — Detection and Cleanup

Jobs that have been filled or deleted by the company must be detected and excluded from matching. Two-phase stale detection:

**Phase 1 — Mark as stale (after each poll):**
After polling a company, jobs in the database for that `(atsSource, atsSlug)` that were *not* in the current fetch have their `lastSeenAt` left unchanged. Jobs that *were* in the fetch get `lastSeenAt = now()` and `status = "active"` (resurrected if previously stale).

**Phase 2 — Mark as gone (daily Inngest function `poller/mark-stale-jobs`, `cron: "0 3 * * *"`):**
```sql
-- Jobs not seen in 7 days → "stale" (might come back, don't delete)
UPDATE job SET status = 'stale'
WHERE status = 'active' AND last_seen_at < NOW() - INTERVAL '7 days';

-- Jobs not seen in 30 days → "gone" (safe to exclude from matching)
UPDATE job SET status = 'gone'
WHERE status = 'stale' AND last_seen_at < NOW() - INTERVAL '30 days';
```

**Module C integration:** The 3-Gate query (§5.2) must filter `WHERE j.status = 'active'`. This ensures stale and gone jobs are never matched.

**Why not delete gone jobs?** (1) The `matchQueue` table has a FK to `job` (`onDelete: cascade`) — deleting would lose match history. (2) If a company re-posts the same job (same `externalJobId`), the upsert resurrects it from `gone` to `active`.

#### 4.4.5 Implementation Notes `[Status: Implemented]`

**File map (all domain logic in `src/lib/jobs/poller/`):**

| File | Role |
|------|------|
| `ats-adapters.ts` | Fetch + Zod validate + normalize per ATS platform. Returns unified `NormalizedJob[]`. Uses original JSON for `rawJson` to preserve all fields. Injectable `FetchFn`. |
| `job-repository.ts` | Job table upserts (`onConflictDoUpdate`), new job detection (for B→C handoff), stale cleanup (Phase 2: 7d→stale, 30d→gone), active job count. |
| `company-state.ts` | Company polling state updates (lastPolledAt, health, consecutiveFailures). Auto-disables polling after 3 consecutive failures. HTTP status → health mapping (429→rate_limited, 403→blocked, 404→dead, 500+→error). |
| `tier-queries.ts` | Tier-based company queries for fan-out (active every 12h, dormant weekly). Daily tier recalculation SQL (uses `::company_tier` enum cast for PostgreSQL compatibility). Single-company lookup by ID. |
| `phalanx-poller.ts` | Core orchestrator: fetch → Gate 0 filter → upsert → emit `job/ingested` → update company state. Never throws — all errors caught and returned in `PollResult`. |
| `rate-limiter.ts` | Per-ATS Bottleneck limiters (2 req/s, 1 concurrent per platform). |
| `schemas.ts` | Zod schemas for Inngest event payloads (`pollCompanyEventSchema`, `pollerRunEventSchema`, `jobIngestedEventSchema`). |

**Inngest function map (in `src/inngest/functions.ts`):**

| Function | Trigger | Role |
|----------|---------|------|
| `pollCompanyFn` | `poller/poll-company` event | Per-company fan-out target. Concurrency cap 50. Fetches → Gate 0 → upsert → emits `job/ingested`. |
| `tierActiveFanOut` | cron `0 0/12 * * *` (every 12h) | Queries Tier A companies, emits `poller/poll-company` events. |
| `tierDormantFanOut` | cron `0 0 * * 0` (weekly Sunday) | Queries Tier B companies, emits `poller/poll-company` events. |
| `phalanxPoller` | `poller/run` event (manual) | Single-company poll by companyId (admin/testing). |
| `tierRecalc` | cron `0 4 * * *` (daily 04:00 UTC) | Recalculates all company tiers based on activity. |
| `staleCleanup` | cron `0 3 * * *` (daily 03:00 UTC) | Marks stale (7d) and gone (30d) jobs. |

**Test coverage:** 32 unit tests (20 ATS adapter tests + 12 poller orchestrator tests) with mocked fetch + mocked DB. All 470 project tests pass. Live-tested against real ATS APIs and real Neon dev branch (June 2026) — see blueprint §4.1.2 testing strategy for results.

### 4.5 The B→C Handoff Contract `[Status: Implemented]`

**Module B owns:** fetching, validating (Zod), filtering (Gate 0), and persisting raw job data.
**Module C owns:** normalization (tag extraction), embedding generation, and matching.

**The handoff:** The poller emits one `job/ingested` Inngest event per **newly inserted** job (not upserted jobs — only genuinely new jobs). This prevents Module C from re-normalizing jobs it's already processed.

```
Module B (Poller)                          Module C (Router)
─────────────────                          ─────────────────
1. Fetch JSON from ATS API
2. Validate with Zod schema (safeParse)
3. Gate 0: regex title filter
4. Upsert into job table:
   - extractedTags = []  (empty)
   - jobEmbedding = null
   - status = "active"
5. If NEW job (not upsert):
   emit "job/ingested" { jobId }  ──────►  1. Receive "job/ingested" event
                                             2. Fetch job from DB
                                             3. Extract canonical tags
                                             4. Generate embedding
                                             5. UPDATE job SET tags + embedding
                                             6. Run Gate 1 + Gate 2 SQL query
                                             7. Insert into match_queue
                                             8. Fan out Gate 3 LLM evaluation
```

**Why this boundary:**
- **Testability:** Module B is tested by asserting `job` rows with `extractedTags = []` and `jobEmbedding = null`. Module C is tested by feeding it a job row and asserting tags/embedding are populated.
- **Failure isolation:** If the embedding service is down, Module B still inserts raw jobs. Module C catches up when it recovers.
- **Cost control:** Embedding every job costs money. By separating insertion from embedding, only jobs that passed Gate 0 (relevant titles) get embedded.

### 4.6 ATS Platform Coverage

| ATS | Market Share | Public JSON API? | VectorMatch Priority |
|-----|-------------|-------------------|---------------------|
| Workday | ~32% | No (enterprise auth only) | Skip |
| Greenhouse | ~18% | Yes (`boards-api.greenhouse.io`) | **MVP** |
| Lever | ~12% | Yes (`api.lever.co/v0`) | **MVP** |
| iCIMS | ~10% | No | Skip |
| Ashby | ~5% (fastest-growing) | Yes (`api.ashbyhq.com`) | **MVP** |
| SmartRecruiters | ~3% | Yes | Phase 2 |
| Recruitee | ~2% | Yes | Phase 2 |
| Workable | ~2% | Yes (v3 API) | Phase 2 |

**Greenhouse + Lever + Ashby = ~35% of total market but ~60–70% of the startup/mid-size tech company market** — which is the target segment. Workday dominates enterprise (Fortune 500), which is not the target user's sweet spot.

---

## 5. MODULE C: EVENT-DRIVEN ROUTING (THE 3-GATE FUNNEL) `[Status: Implemented — Synthetic-Data Calibrated]`

**Goal:** Solve the O(N*M) compute cost problem using Inngest and Postgres.

**Implementation reference:** `docs/MODULE_C_DECISIONS.md` is the primary design document for all Module C features. Calibration findings: `docs/calibration-report.md`.

**Feature breakdown (7 features, all implemented):**
- **C0** — Schema & contracts hardening: `matchQueue` columns, `job.status` values, `normalizedAt`, Module C event types, `matching-config.ts`, `db.ts` pooler guard.
- **C1** — Job normalization: `job-normalizer.ts` + `job-embedder.ts`, wired into `jobIngestedHandler`.
- **C5** — Seed script: `scripts/seed-routing-engine.ts` (synthetic data for calibration).
- **C2** — Gate 1+2 SQL router: `gate-1-2.ts`, wired into `jobIngestedHandler`.
- **C3** — Gate 3 LLM evaluator: `gate-3.ts` + `gate3Evaluator` Inngest function.
- **C4** — Dashboard query layer + UI: `dashboard-queries.ts` (status-filtered queries, pagination, resilient unread badge) + `matches.ts` Server Actions + `/dashboard/jobs` list page + `/dashboard/jobs/[matchId]` detail page + sidebar unread badge.
- **C6** — Calibration: `scripts/calibrate-routing-engine.ts` + `docs/calibration-report.md`.

### 5.1 Step 1: Normalization (Inngest Event: `job/ingested`) `[Status: Implemented]`
*   When a job is inserted by the Phalanx Poller (Module B), Inngest emits a `job/ingested` event. The `jobIngestedHandler` in `src/inngest/functions.ts` receives it.
*   **Idempotency guard:** If `job.normalizedAt IS NOT NULL`, the handler skips — event re-delivery is safe.
*   **Tag extraction** (`src/lib/jobs/job-normalizer.ts`):
    *   `extractJobContent` extracts the description from the raw ATS JSON (Ashby prefers `descriptionPlain` over `descriptionHtml`).
    *   `scanTagsRegex` — a TypeScript dictionary regex extracts canonical tags (e.g., matching "ReactJS" to "react"). Fast, $0 cost.
    *   `extractTagsLLM` — if regex yields <3 tags, a fallback `gpt-4o-mini` call extracts them via `generateObject` with a Zod schema.
    *   `decideNormalizationAction` — handles rejection (garbage job → `status = 'rejected'`, tombstone) vs. system failure (`status = 'normalization_failed'`, retryable).
*   **Embedding** (`src/lib/jobs/job-embedder.ts`): The job description is embedded using `text-embedding-3-small` (1536 dimensions).
*   `normalizedAt` is set ONLY on terminal outcomes (successful normalization OR rejection). Never set on `normalization_failed` — that would turn it into a permanent tombstone, defeating the two-status split.

### 5.2 Step 2: Gate 1 & 2 (The SQL Router) `[Status: Implemented]`
Run a single SQL query (`src/lib/jobs/gate-1-2.ts`, `runGateSQLRouter`) to narrow all personas down to ~8 candidates in under 20ms.

**Bug fix from original TDD (review round 1):** The original TDD used `cardinality(p.must_have_tags & ${jobTags}::text[])` for the overlap count. The `&` (array intersection) operator exists ONLY in the `intarray` extension and ONLY for `integer[]` — it does NOT exist for `text[]`. The fix uses `unnest` + `= ANY` inside a `LATERAL` subquery so the count is evaluated once per persona.

```typescript
// src/lib/jobs/gate-1-2.ts — actual implementation (simplified)
await db.execute(sql`
  INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
  SELECT
    ${jobId}::uuid,
    p.id,
    p.applicant_id,
    ov.overlap_score,
    (p.persona_embedding <=> ${embeddingStr}::vector) AS cosine_distance,
    'pending'
  FROM persona p
  CROSS JOIN LATERAL (
    SELECT count(*) AS overlap_score
    FROM unnest(p.must_have_tags) AS t(tag)
    WHERE t.tag = ANY(${tagsArraySql})
  ) ov
  WHERE
    -- GATE 1: GIN Index Array Overlap (≥1 must-have tag hit, zero blocklist hits)
    p.must_have_tags && ${tagsArraySql}
    AND NOT (p.blocklist_tags && ${tagsArraySql})
    -- GATE 2: HNSW Vector Similarity (cosine distance threshold)
    AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${GATE2_MAX_COSINE_DISTANCE}::real
    AND p.persona_embedding IS NOT NULL
  ORDER BY
    -- Composite ordering: blends Gate 1 (overlap) and Gate 2 (similarity) signals
    (ov.overlap_score * ${GATE1_WEIGHT}::real
     + (1 - (p.persona_embedding <=> ${embeddingStr}::vector)) * ${GATE2_WEIGHT}::real) DESC
  LIMIT ${GATE_ROUTER_LIMIT}
  ON CONFLICT (job_id, persona_id) DO NOTHING
  RETURNING id, persona_id, applicant_id, overlap_score, cosine_distance
`);
```

**Composite ordering rationale:** A candidate with `overlapScore = 5, cosineDistance = 0.34` (barely passed Gate 2) should not outrank a candidate with `overlapScore = 3, cosineDistance = 0.05` (very strong semantic match). Pure overlap ordering ignores the Gate 2 signal after the threshold filter. The composite blend accounts for both.

**Config values** (`src/lib/jobs/matching-config.ts`):
| Constant | Value | Calibration Status |
|---|---|---|
| `GATE2_MAX_COSINE_DISTANCE` | `0.35` | Uncalibrated guess — no-op on synthetic data (embeddings cluster at 0.18–0.21). Must be benchmarked against real job/persona pairs. |
| `GATE_ROUTER_LIMIT` | `8` | Uncalibrated guess — doing all filtering on synthetic data. |
| `GATE1_WEIGHT` | `0.6` | Uncalibrated guess. |
| `GATE2_WEIGHT` | `0.4` | Uncalibrated guess. `GATE1_WEIGHT + GATE2_WEIGHT = 1.0`. |

**Edge cases handled:**
- Empty `jobTags`: Skip Gate 1, rely on Gate 2 alone. Log warning.
- No personas pass: Return empty array. No Gate 3 fan-out.
- All candidates blocklisted: Filtered by `NOT (p.blocklist_tags && ...)`.
- Null `jobEmbedding`: Defensive fallback to Gate 1 only with `LIMIT 8`.

**Performance:** `EXPLAIN ANALYZE` (verified by `scripts/verify-gate-explain.mts`) confirms both GIN and HNSW indexes are used. At MVP scale (~1,000 personas), the composite ORDER BY may cause an in-memory sort (HNSW index is optimized for pure KNN, not composite expressions) — this is <5ms at 1k rows. At 100k+ scale, a two-phase query (KNN + re-rank) may be needed (post-MVP).

### 5.3 Step 3: Gate 3 (The LLM Arbiter) `[Status: Implemented]`
*   `jobIngestedHandler` fans out one `match/gate-3-evaluate` Inngest event per candidate row inserted by Gate 1+2. The `gate3Evaluator` function in `src/inngest/functions.ts` receives these events.
*   **One event per candidate** (not a batch) — maximum parallelism, maximum failure isolation. If one candidate's LLM call fails, the others are unaffected.
*   `src/lib/jobs/gate-3.ts`:
    *   `buildGate3Prompt` constructs a structured prompt with: job title + description + extracted tags, persona label + embedding summary + must-have/blocklist tags, and applicant constraints (country, work hours, compliance, modalities, assignment types).
    *   `evaluateGate3` calls `gpt-4o-mini` via Vercel AI SDK `generateObject` with a strict Zod schema (`gate3VerdictSchema`): verdict (`approved`/`rejected`), confidence (0.0–1.0), reasoning (1–3 sentences), and blockers (array of strings).
    *   `mapVerdict` maps the LLM verdict to `match_queue` status.
*   **Verdict writing:** `llm_verdict`, `llm_reasoning`, `llm_confidence`, `llm_blockers`, `llm_model`, `evaluated_at` written to `match_queue`. If approved, `status = 'approved'` and `match/approved` event emitted. The `llm_confidence` and `llm_blockers` columns (migrations `0010` + `0011`) persist the LLM's actual confidence score and rejection reasons — critical for calibration via the dashboard UI.
*   **`match/approved` event:** MVP — nothing listens (dashboard polls `match_queue` directly). Defined now so Module D (cold email generation) has a stable contract post-MVP.
*   **Error recovery:** Unparseable output or exhausted retries → `status = 'pending'`, `llm_verdict = 'error'`. Recoverable by a future sweep that re-emits `match/gate-3-evaluate` for `pending` rows older than N hours (not built in MVP — error rows are rare with `generateObject` + Zod enforcement).
*   Inngest concurrency is capped to max 5 (Inngest free plan limit, June 2026).
The original limit of 50 existed to prevent Vercel's 340-second idle-connection
limit from severing fanned-out function instances. Under Module E, there is no
Vercel idle-connection limit — the constraint now is protecting the single
Hetzner CX33 instance's own CPU/RAM headroom (2 vCPU / 8GB, shared with the
live Next.js server process) and, more importantly, protecting the Neon
Postgres connection pool from exhaustion under a sudden fan-out spike. The
free plan's cap of 5 concurrent steps is more conservative than the original
50 and is adequate for MVP/solo use. Upgrade the Inngest plan and raise the
limit if higher throughput is needed post-MVP — tune empirically against
actual Neon pool size and observed CX33 load.

Separately: any request path sitting behind Cloudflare's proxy (which is all
of them under Module E) is also bound by Cloudflare's 100-second connection
timeout (HTTP 524) on idle/no-data connections. This is unrelated to Inngest
concurrency but governs the same general class of "long-running request"
risk — synchronous API routes (e.g. `/api/onboarding/parse`, the `gpt-4o`
extraction call) must complete well under 100 seconds, and anything that
can't is a candidate for Inngest, not a synchronous route.

### 5.4 Step 4: Dashboard Query Layer & UI (In-App Notification) `[Status: Implemented]`

The dashboard is the primary calibration interface — all scoring data (cosine distance, overlap score, LLM confidence, LLM reasoning, blockers) is visible on both the list and detail views.

**Query layer** (`src/lib/jobs/dashboard-queries.ts`):
*   `getMatches(userId, status, limit, offset)` — status-filtered (approved/rejected/pending/all), paginated, applicant-scoped list of matches with job title, ATS source/slug, persona label, cosine distance, overlap score, LLM verdict, LLM reasoning, LLM confidence, LLM blockers, status, isRead, createdAt.
*   `getMatchesCount(userId, status)` — total count for pagination controls.
*   `getApprovedMatches(userId, limit, offset)` — backward-compat wrapper around `getMatches` with `status='approved'`.
*   `getUnreadBadgeCount(userId)` — count of approved + unread matches for the sidebar badge. Resilient — returns 0 on DB error instead of crashing the dashboard layout.
*   `getMatchDetail(userId, matchQueueId)` — full match detail with job `rawJson`, extracted tags, persona embedding summary, must-have tags, LLM confidence, LLM blockers, LLM model, evaluatedAt.

**Server Actions** (`src/actions/matches.ts`):
*   `markMatchRead(matchQueueId)` — sets `is_read = true`, scoped to `applicant_id = session.user.id`.
*   `markAllMatchesRead()` — sets `is_read = true` for all approved unread matches.

**List view** (`/dashboard/jobs`, Server Component):
*   Status filter tabs (Approved / Rejected / Pending / All) with per-status counts.
*   Paginated match cards (10 per page) with: job title, ATS source + slug, persona label, cosine distance (raw number), overlap score (raw number), LLM confidence (color-coded: green >0.7, yellow 0.4–0.7, red <0.4), LLM reasoning (1–3 sentences), blockers (as badges), status badge, unread indicator.
*   "Mark all read" button + per-card "Mark as read" action (Server Action + `router.refresh()`).
*   "View on ATS" link to the company's hosted career page (via `ATS_ENDPOINTS[source].hostedBoard(slug)`).
*   Empty state with link to profile management.
*   Client component: `src/components/dashboard/MatchList.tsx` (handles tabs, mark-as-read actions, pagination).

**Detail view** (`/dashboard/jobs/[matchId]`, Server Component):
*   Full job description parsed from `rawJson` via `extractJobContent` (ATS-source-aware: Greenhouse `content`, Lever `descriptionPlain`/`description`, Ashby `descriptionPlain`/`descriptionHtml`).
*   Gate 1+2 scores panel (cosine distance, overlap score, LLM confidence, timestamps).
*   Gate 3 LLM verdict panel (verdict, confidence, model, reasoning, blockers).
*   Persona context panel (label, embedding summary, must-have tags).
*   Extracted job tags with ✓ markers for tags overlapping persona must-haves.
*   "View on ATS" link + back to list navigation.

**Sidebar unread badge**:
*   `getUnreadBadgeCount` fetched in the dashboard layout (`src/app/dashboard/layout.tsx`, Server Component).
*   Passed as prop to `DashboardSidebar` → `DashboardSidebarNav`.
*   Badge rendered next to "Jobs" nav item (count in accent-colored circle).
*   Updates on navigation (Server Component re-renders) and after `router.refresh()` from mark-as-read actions.

### 5.5 Calibration (Feature C6) `[Status: Implemented — Synthetic Data Calibrated; Real-Data Calibration In Progress]`

**⚠️ LAUNCH-BLOCKING (for public access):** The current thresholds are uncalibrated guesses validated only against synthetic seed data. No non-developer user sees Module C output until thresholds are benchmarked against real job/persona pairs.

**Self-use calibration path:** The "20–30 real pairs" requirement is correct for opening the app to the public, but overly cautious for solo developer use. The developer's own usage IS the calibration:
1. Onboard with a real CV (Module A — done)
2. Run Module B seeders/poller to ingest real jobs
3. The 3-Gate funnel processes them and populates `match_queue`
4. Inspect matches via `/dashboard/jobs` (cosine distance, overlap score, LLM confidence, LLM reasoning all visible)
5. Tune `GATE2_MAX_COSINE_DISTANCE` and `GATE_ROUTER_LIMIT` based on observed false positives/negatives
6. Document tuned values in `docs/calibration-report.md`

The dashboard UI was built specifically as the calibration debugging interface. Synthetic seed data has been cleaned from the production database (via `scripts/cleanup-seed-data.ts`); the next step is ingesting real jobs.

**Calibration script:** `scripts/calibrate-routing-engine.ts` — runs Gate 1+2 against seed data, collects cosine distance + overlap score distributions, measures true candidate counts at different thresholds (no LIMIT), and optionally evaluates Gate 3 verdicts on a sample.

**Key findings (synthetic data, 100 personas + 500 jobs):**
- `GATE2_MAX_COSINE_DISTANCE = 0.35` is a no-op — seed embeddings cluster tightly (mean 0.19, max 0.21). 222 candidates pass per job; the LIMIT 8 does all filtering.
- Gate 3 correctly approved archetype-matched candidates (4/5) and rejected a skill-emphasis mismatch (SolidJS primary vs React persona) despite perfect tag overlap and low cosine distance — validating the 3-Gate architecture.
- Confidence scores are high (0.90–0.95) on synthetic data. Real data will produce a wider distribution with borderline cases (0.4–0.6).

**Full report:** `docs/calibration-report.md`

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

Status: Final decision — implemented via self-hosted PaaS (Hetzner Cloud + Coolify). Deployed and running (healthy) as of June 25, 2026.

### 7.1 Infrastructure stack

*   **Host server:** Hetzner Cloud CX33 (x86_64 AMD64, 2 vCPU, 8GB RAM, 80GB disk). Region: Helsinki (eu-central). IP: 157.180.68.189. Cost: ~€8.99/month, fixed.
*   **PaaS orchestrator:** Coolify v4.1.2 (open-source), installed on-server. Manages Docker builds, Traefik reverse proxy, and automated SSL via Let's Encrypt. Coolify admin accessible at `https://admin.vectormatch.dev` (Cloudflare-proxied). MCP endpoint at `https://admin.vectormatch.dev/mcp`.
*   **Build pipeline:** Next.js `output: 'standalone'`. Coolify builds from the project's root `Dockerfile` (3-stage: deps → builder → runner, Node 24-slim, multi-arch). Build pack: Dockerfile. No build-time secrets required — all env vars are runtime-only (see §7.5).
*   **CI/CD integration:** GitHub App connection (Coolify Sources → GitHub App). Auto-deploy on push to `main` — Coolify receives a webhook from GitHub via `https://admin.vectormatch.dev` (Cloudflare-proxied, port 443) and triggers a Docker build automatically. **Binding constraint:** the deployment type MUST be "Private Repository (with Github App)", NOT "Public Repository" (HTTPS clone). The public clone method has no webhook integration and breaks the auto-deploy contract — pushes to `main` are not detected by Coolify. The GitHub App must be configured with the Cloudflare-proxied Coolify dashboard URL as the webhook endpoint, not the direct IP:8000, so that the Hetzner firewall can block port 8000 entirely.
*   **Database proximity:** Neon Postgres, region `aws-eu-central-1` (Frankfurt). Rationale: same-region placement avoids the cross-region network latency (typically 30-50ms round-trip) that would otherwise be added to every GIN/HNSW query in Gate 1 & 2 (Module C). Exact latency is unmeasured pre-deployment and should be benchmarked post-launch rather than assumed.
*   **Edge protection:** Cloudflare (free tier), proxied (orange-clouded). DNS A record pointing to 157.180.68.189. SSL/TLS set to Full (Strict). WAF rate-limiting rules applied to `/api/inngest` and `/api/onboarding/parse` specifically, since these endpoints trigger LLM calls and job fan-out and are the highest-cost targets for bot/scraper abuse. (See §7.6 for setup instructions.)
*   **Domain:** `vectormatch.dev` — Cloudflare-proxied, globally propagated. Coolify FQDN: `https://vectormatch.dev`.

### 7.2 **Corrected technical trade-off (binding implementation constraint)**

> **Correction (June 25, 2026):** The original TDD stated that standalone Node output "does not support Next.js Partial Prerendering (PPR)." This was incorrect. The production build confirms PPR is active — all routes render as `◐ (Partial Prerender)` with `cacheComponents: true` + `output: "standalone"`. PPR itself works; what does **not** work is edge-cached PPR.

The actual trade-off: under standalone Docker output, every request must reach the live NextServer process to resolve the cache. PPR pages cannot be served directly from a CDN edge — the static shell is generated by the server process, not a CDN node. This means PPR pages work correctly but do not benefit from zero-roundtrip edge delivery. In practice, the static shell is served from the Hetzner server (Frankfurt/Helsinki region) with ~10-30ms TTFB for European users, which is acceptable for MVP.

**Instruction to any developer or agent implementing this:** PPR and `cacheComponents: true` are fully supported — do not disable them. However, do not design pages assuming a zero-roundtrip, edge-cached static shell served from a CDN. Treat all routes as server-rendered with PPR optimization (static shell + streamed dynamic content), with `use cache` available for function/component-level caching. Page-level edge caching is not available under this deployment model.

### 7.3 **Known operational constraint**
The Next.js Data Cache writes to the container's local filesystem under standalone output. If horizontal scaling (a second Hetzner instance) is ever needed, a shared cache handler (e.g., Redis-backed) must be implemented first, or the two instances will serve inconsistent cached content. Not a concern at current single-instance scale.

### 7.4 **Operational ownership**
Unlike a managed PaaS, this requires manual setup and ongoing light maintenance via the Coolify dashboard or SSH:

*  Health checks: Coolify probes `GET /api/health` (port 3000) with curl. The Dockerfile also includes a `HEALTHCHECK` directive using `node fetch`. The `/api/health` endpoint is deliberately DB-free so the container is marked healthy as long as the Next.js process is responsive.
*  Monthly OS security updates and Docker image pruning (the latter automatable via Coolify settings) to prevent disk bloat.
*  Local volume backups for any non-ephemeral data stored outside Neon.
*  **Inngest sync:** After each deploy, sync function definitions manually (see §3.9.4).
*  **Hetzner firewall:** Port 8000 (Coolify admin fallback) should be restricted to the developer's IP via Hetzner Cloud Firewall. Ports 80/443 open to all. (See §7.6.)

### 7.5 **Lazy initialization pattern (binding code constraint)**

During Next.js static generation (build time), every module in the import graph is loaded — including `auth.ts` → `db.ts` and `auth.ts` → `email.ts`. Since runtime secrets (`DATABASE_URL`, `RESEND_API_KEY`) are not available at Docker build time, any module that instantiates a client at the top level will crash static generation with an opaque "digest" error.

**Binding rule:** No module in the import graph of `auth.ts` (or any route that Next.js statically generates) may instantiate a network client at module import time. All clients must be lazily initialized — created on first method call, not at module load.

Currently applied to:
*   `src/db/db.ts` — Neon `Pool` via a lazy Proxy. The `db` export is a `Proxy` that defers `new Pool()` to the first `db.select()` / `db.transaction()` / etc. call. No importer changes required — the Drizzle API surface is identical.
*   `src/lib/email.ts` — Resend client via `getResend()`. The `new Resend(process.env.RESEND_API_KEY)` call is deferred to the first `sendVerificationEmail()` / `sendResetPasswordEmail()` / `sendAlreadyRegisteredEmail()` call.

**Future modules:** Any new module that creates a network client (OpenAI, Google Cloud, etc.) and is transitively imported by a statically-generated route must follow this pattern. The test is simple: if `npm run build` succeeds with zero environment variables, the pattern is correctly applied.

### 7.6 **Post-deployment security checklist**

**Cloudflare WAF rate-limiting rules** (dashboard → Security → WAF → Rate limiting rules):

1.  **Rule: Rate limit /api/inngest**
    *   Field: URI Path → equals → `/api/inngest`
    *   Characteristics: IP
    *   Requests: 50 per 1 minute
    *   Action: Block
    *   Duration: 1 minute
    *   Rationale: Inngest polls this endpoint; legitimate traffic is the Inngest Cloud scheduler. 50/min/IP is generous for the scheduler but blocks scrapers.

2.  **Rule: Rate limit /api/onboarding/parse**
    *   Field: URI Path → equals → `/api/onboarding/parse`
    *   Characteristics: IP
    *   Requests: 5 per 1 minute
    *   Action: Block
    *   Duration: 10 minutes
    *   Rationale: This endpoint triggers a `gpt-4o` extraction call (~$0.01-0.03 per request). 5/min is generous for real users but prevents cost-abuse attacks.

> **Free plan limitation:** On the Cloudflare Free plan, rate-limiting fields are limited to Path and Verified Bot, and counting is IP-based only. This is sufficient for the above rules.

**Hetzner Cloud Firewall** (Cloud Console → Firewall):

| Direction | Protocol | Port | Source IPs | Purpose |
|-----------|----------|------|------------|---------|
| Inbound | TCP | 22 | [your IP] | SSH (restricted) |
| Inbound | TCP | 80 | Any | HTTP (Cloudflare proxy) |
| Inbound | TCP | 443 | Any | HTTPS (app + Coolify dashboard + GitHub webhooks, all via Cloudflare) |

Port 8000 (Coolify's default admin port) is **not** opened — the Coolify dashboard is accessed via `https://admin.vectormatch.dev` (Cloudflare-proxied on 443), and GitHub App webhooks are delivered to the same Cloudflare-proxied URL. Blocking 8000 entirely is more secure than restricting it to a single IP, and it does not break any functionality.

Apply the firewall to the CX33 server. The implicit deny at the end blocks all other inbound traffic. 