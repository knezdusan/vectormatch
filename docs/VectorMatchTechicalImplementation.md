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