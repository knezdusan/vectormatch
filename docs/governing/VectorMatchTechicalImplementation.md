# SYSTEM ARCHITECTURE & TECHNICAL DESIGN DOCUMENT (TDD)
**Project:** Multi-Tenant Next.js AI Job Routing SaaS
**Target Audience:** Devin Desktop, Devin Local / Coding AI Agent
**Context:** This document contains the implementation blueprint for a multi-tenant job-matching SaaS. It uses a 3-gate funnel to match unstructured ATS job postings against explicitly defined user personas using GIN indexing, HNSW vector similarity, and LLM orchestration. 

---

## 1. TECHNOLOGY STACK
*   **Framework:** Next.js 16.2.7 (App Router + Cache Components, standalone Docker output)
*   **Database:** PostgreSQL (Neon) — connected via `@neondatabase/serverless` Pool (not HTTP driver) to support Drizzle transactions required by `recomputeTagsExperience()`
*   **ORM:** Drizzle ORM 0.45.2
*   **Authentication:** Better Auth 1.6.14 (database-integrated)
*   **Background Jobs / Orchestration:** Inngest v4.8.0 (self-hosted, Durable Execution)
*   **AI/ML:** Vercel AI SDK 6.0.208 (`gpt-4o` for strict reasoning, `gpt-4o-mini` for scaling, `text-embedding-3-small` for embeddings, OpenAI SDK 6.45.0)
*   **Frontend UI:** Tailwind CSS v4, React 19.2.4, React Hook Form, Zod 4.4.3, `@dnd-kit` (for drag-and-drop), Shadcn/ui 4.8.0
*   **Vector Database:** Postgres `pgvector` (with `hnsw` indexes)
*   **Testing:** Vitest 4.1.8 (110 test files, 2,260 tests), Playwright 1.60 (E2E), Biome 2.2.0 (lint+format)
*   **BigQuery:** `@google-cloud/bigquery` 8.3.1 (HTTPArchive corpus discovery, `GOOGLE_APPLICATION_CREDENTIALS_B64` for Docker-safe auth)
*   **Hosting:** Hetzner Cloud (Frankfurt) + Coolify (self-hosted PaaS). Self-hosted Inngest (`inngest/inngest:v1.34.0` + `postgres:17` + `redis:7`).
*   **Migrations:** 46 SQL migrations (0000–0045) managed via Drizzle Kit 0.31.10. 

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

// Seniority levels for applicant job matching preferences (added June 28 2026).
// The applicant can select multiple levels — jobs whose inferred seniority
// matches ANY of the selected levels will pass Gate 3. The LLM infers the
// applicant's primary seniority from the CV during onboarding (stored in
// cvUpload.extractedJson.inferred_seniority), and the user can adjust
// the preselected level(s) or add more during onboarding and in profile
// management.
export const seniorityLevelEnum = pgEnum("seniority_level", [
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
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

  // Seniority levels the applicant wants to match against (added June 28 2026).
  // Pre-selected from the LLM-inferred level during CV parsing; user can adjust
  // in onboarding and profile management. Multi-select so users can match
  // multiple levels (e.g., "senior" + "lead"). Gate 3 LLM checks the job's
  // inferred seniority against this list.
  seniorityLevels: seniorityLevelEnum("seniority_levels").array(),

  // Work authorization permits the applicant holds (added July 4 2026).
  // e.g. ["eu_citizen", "rwr_card_plus", "blue_card_eu"]. Empty/null when
  // the user hasn't set it — Gate 3 soft-fail-opens on the work-auth check
  // but may still set workAuthRiskFlag for hybrid/single-country-remote roles.
  // Supported values: eu_citizen, rwr_card_plus, blue_card_eu, uk_settled,
  // uk_pre_settled, us_green_card, us_citizen, canadian_pr, swiss_permit_c,
  // other_permit. Migration 0040.
  workAuthorizations: text("work_authorizations").array(),

  // Expected minimum compensation (added July 2026 for Gate 0.5 check 4).
  // Used by the compensation_mismatch pre-filter — soft-fail-open when NULL.
  expectedCompMin: integer("expected_comp_min"),

  // Years of experience (added July 2026 for Gate 0.5 check 5).
  // Used by the experience_gap pre-filter — soft-fail-open when NULL.
  yearsOfExperience: integer("years_of_experience"),

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

    // ── Gate 0.5 metadata (added July 2026, migration 0039) ──────────────────
    // Parsed from job title and location during normalization. Used by the
    // Gate 0.5 hard-blocker pre-filter to catch geo-fencing patterns.
    titleRegionTag: text("title_region_tag"), // e.g., "Latam", "EU", "US"
    locationCountries: text("location_countries").array(), // parsed country list
    experienceMinYears: integer("experience_min_years"),
    experienceMaxYears: integer("experience_max_years"),
    compensationMin: integer("compensation_min"),
    compensationMax: integer("compensation_max"),
    compensationCurrency: text("compensation_currency"),
    // Which Gate 0.5 check rejected this job (e.g., "title_region_tag",
    // "location_country_list", "default_on_site"). NULL for non-rejected jobs.
    rejectionPattern: text("rejection_pattern"),

    // ── AI-generated short description (added July 2026, migration 0037) ─────
    // One-sentence summary generated during normalization for dashboard display.
    shortDescription: text("short_description"),
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
// verdict columns. Schema decisions: docs/reports/MODULE_C_DECISIONS.md §2.
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
    // Which Gate 3 prompt variant was used for this evaluation (added June 28 2026).
    // Used for A/B testing prompt variations to optimize approval rates.
    // Values: "balanced" | "strict" | "thorough". Null for rows evaluated
    // before the A/B test feature was deployed.
    promptVariant: text("prompt_variant"),
    // Work authorization risk flag (added July 4 2026). Set to true by Gate 3
    // when the JD is silent on work authorization/visa/citizenship requirements
    // BUT the role is hybrid or single-country-remote (not global). This warns
    // the user to verify work authorization before applying — many employers
    // hide citizenship/permit requirements in the application form, not the JD.
    // The job is NOT rejected — the flag is advisory. Migration 0040.
    workAuthRiskFlag: boolean("work_auth_risk_flag").default(false),
    // When Gate 3 ran. Null until Gate 3 completes.
    evaluatedAt: timestamp("evaluated_at"),
    // In-app notification badge. Defaults to false; set true when user views the match.
    isRead: boolean("is_read").notNull().default(false),
    // When the match was marked stale (added July 2026, migration 0038).
    // Set by stale cleanup when the underlying job transitions to stale/gone status.
    staleAt: timestamp("stale_at"),
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

**Governing Documents:** This section is governed by `docs/reports/MODULE_A_DECISIONS.md` (locked decisions) and `docs/reports/RESEARCH_NOTE_schemas.md` (research rationale). If this TDD and those documents conflict, the decisions document wins.

### 3.1 The 3-Schema Pipeline

Module A defines three distinct schemas that must not be conflated:

| Schema | What it is | Where it lives | When it's created |
|---|---|---|---|
| **Schema 1** | Raw LLM extraction output (gpt-4o via `generateObject`) | `cvUpload.extractedJson` (JSONB) | When the PDF is parsed |
| **Schema 2** | Validated onboarding submission (user-reviewed + user-collected) | Transient — passed to Server Action | When the user submits the onboarding form |
| **Schema 3** | DB tables (`applicant`, `persona`, `workingHistory`, `tagsExperience`) | PostgreSQL via Drizzle ORM | When the Server Action persists Schema 2 |

**Zod contracts:** `src/lib/onboarding/schemas.ts` defines `resumeExtractionSchema` (Schema 1) and `onboardingPayloadSchema` (Schema 2). Schema 3 is defined by the Drizzle table definitions in `src/db/schemas/jobs/`.

**Design principle:** The LLM returns raw `roles[]` data with date ranges. The server computes `yearsOfExperience` from merged date ranges — the LLM does NOT return a top-level `calculated_years_of_experience`. The LLM shows its work; the math is done in TypeScript. This is the anti-hallucination principle.

**Seniority inference (added June 28 2026, updated July 2026):** Schema 1 now includes `inferred_seniority` — a single enum value (`junior | mid | senior | lead | staff | principal`) that the LLM infers from the CV's years of experience, role titles, and career progression. This value pre-selects the seniority checkbox in the onboarding form (Schema 2's `seniorityLevels` array on the applicant level). The user can adjust or add more levels.

**Per-persona seniority (added July 2026):** Seniority levels are now defined per-persona, not just per-applicant. The `applicant.seniorityLevels` field remains as the onboarding default that pre-populates each persona's `seniorityLevels` during signup. Each persona has its own `seniorityLevels` array in the `persona` table, editable independently in profile management. Gate 3 now uses `Gate3Context.persona.seniorityLevels` (not `applicant.seniorityLevels`) to check the job's inferred seniority — this allows the same applicant to have different seniority levels for different personas (e.g., senior for React, mid for PHP). Validation: max 3 consecutive (adjacent) levels per persona, enforced by `validateAdjacentSeniority()`.

**Schema 1 additions (June 28 2026):**
- `inferred_seniority`: `z.enum(["junior", "mid", "senior", "lead", "staff", "principal"])` — LLM-inferred seniority level.

**Schema 2 additions (June 28 2026, updated July 2026):**
- `seniorityLevels` (applicant level): `z.array(seniorityLevelsEnum).min(1)` — user-validated seniority levels (onboarding default).
- `seniorityLevels` (persona level): `z.array(seniorityLevelsEnum).max(3).default([])` — per-persona seniority levels for Gate 3 matching. Must be ≤3 and consecutive (adjacent).

### 3.2 CANONICAL_TAGS & CANONICAL_ROLES (The Taxonomy Layer)

Two typed constant arrays govern tag and role normalization:

**CANONICAL_TAGS** (`src/lib/jobs/tech-tags.ts`):
- 146 entries (initial 144 + `wordpress` and `docker` added June 28 2026 for PHP/Laravel persona support; target ~300 after real-CV testing)
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
- *MVP status: editable preferences, work history, personas, and CV re-parse. Skills remain read-only because they are derived from employment history.*
- Work preferences section (country, canWorkUsHours, assignmentTypes, modalities, preferredCompliance) — *implemented*
- Work history section (add/edit/delete job entries) — *implemented*
- Skills section (view all — read-only; skills are derived from employment history) — *implemented*
- Persona section (edit existing, add up to 3, delete) — *implemented*

**UI sections (State 2 and 3):**
1. **Applicant Section**: Form reflecting user data from CV + mandatory fields not in CV (country, canWorkUsHours, assignmentTypes, modalities, preferredCompliance). Editing employment history here is the only way to add/modify skills.
2. **Skills Section**: Read-only list of all skills from `tagsExperience`, mapped against `CANONICAL_TAGS`. Users cannot add or deactivate skills directly; skills are derived from employment history and are kept in sync by `recomputeTagsExperience()`.
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

### 3.8 Orphaned cvUpload Cleanup (Implemented)

The `cleanupOrphanedCvUploads` Inngest cron job (registered in `src/app/api/inngest/route.ts`) runs daily at 03:00 UTC and deletes `cvUpload` rows in two categories:
- **Stuck processing**: `status` = `processing` and `createdAt` is older than 24 hours (LLM call or action failed).
- **Orphaned**: rows with no `workingHistory` children and `createdAt` older than 7 days (user abandoned onboarding before finalizing).

Implemented as `src/lib/onboarding/cleanup-cv-uploads.ts` and tested in `src/lib/onboarding/__tests__/cleanup-cv-uploads.test.ts`.

### 3.9 Module A Post-MVP Items (Status Review)

The Module A onboarding flow is complete. All follow-up items have been addressed: either implemented for the launch-ready surface or explicitly skipped because they are tied to paid-tier features.

| Item | Priority | Status | Rationale |
|------|----------|--------|-----------|
| P3 — Smart Redirect | ✅ Done | Implemented | Implemented via two-layer redirect: `signInAction` checks `isOnboarded` post-login; `/dashboard` page checks `isOnboarded` as catch-all for social sign-in and direct URLs |
| P1 — State 3 Editing | ✅ Done | Implemented | Full editing implemented in ProfileManagement: preferences, work history, personas, and CV re-parse. Skills section is read-only because skills are derived from work history. |
| P2 — Rate Limiting | ✅ Done | Implemented | 3 cvUpload rows/hour/user enforced in `parseCvAction` by counting recent rows before the LLM call |
| P4 — Multiple CV Upload | ⏸️ Skipped | Post-launch / paid-tier | Feature expansion, not a launch gap; MVP works with single CV and re-parse only |
| P5 — Orphaned Cleanup | ✅ Done | Implemented | `cleanupOrphanedCvUploads` Inngest cron job removes stuck processing and orphan cvUpload rows daily |

**P1 — State 3 Full Editing (Profile Management):** ✅ Implemented
The editable ProfileManagement view is in `src/components/onboarding/ProfileManagement.tsx`. The Server Actions live in `src/actions/profile.ts` and the schemas in `src/lib/onboarding/profile-schemas.ts`.
- **Preferences**: `updateApplicantPreferencesAction` edits country, US-hours availability, assignment types, modalities, and compliance preferences.
- **Employment history CRUD**: `updateWorkHistoryAction` supports add/edit/delete of job entries. Each edit triggers `recomputeTagsExperience(applicantId)` transactionally to recompute `tagsExperience` and rebuild `applicant.allTags`.
- **Skills (read-only)**: The skills section displays active `tagsExperience` rows derived from work history. Users cannot toggle skills directly; editing job entries changes the derived skill set.
- **Persona CRUD**: `updatePersonasAction` edits existing personas (label, embedding summary, must-have tags, blocklist tags), adds new personas (up to max 3), and deletes personas. Changes to `mustHaveTags` or `embeddingSummary` trigger persona embedding auto-regeneration via `text-embedding-3-small`.
- **CV re-parse**: `reparseCvAction` re-runs LLM extraction on the latest CV, replaces `workingHistory` linked to that CV, and runs `recomputeTagsExperience`. UI exposes this as a "Re-parse CV" button in the work history section.

**P2 — Rate Limiting (3 parses/hour/user):** ✅ Implemented
`parseCvAction` (`src/actions/onboarding.ts`) counts all `cvUpload` rows created in the last 3600 seconds for the applicant before calling the LLM. If count ≥ 3, it rejects with error: "You have reached the 3 CV parses per hour limit. Please try again later." Unit tests in `src/actions/__tests__/onboarding.test.ts` cover the allow and reject cases.

**P3 — Smart Dashboard Redirection Logic (✅ Implemented):**
Implemented via a two-layer redirect strategy that covers all auth entry paths:
- **Layer 1 — `signInAction`** (`src/actions/auth.ts`): After successful email sign-in, redirects to `/dashboard`. It does NOT check `isOnboarded` here because `auth.api.signInEmail` sets the session cookie in the *response* headers, but `auth.api.getSession()` reads from the *request* headers — the new cookie isn't available in the same request. The redirect target decision is deferred to Layer 2.
- **Layer 2 — `/dashboard` page** (`src/app/dashboard/page.tsx`): Server component that calls `getAuthSession()` (the session cookie is available in this new request), queries `applicant.isOnboarded`, and redirects to `/dashboard/jobs` (if onboarded) or `/dashboard/profile-management` (if not). This catches all paths: email sign-in (via Layer 1 redirect), social sign-in callback, direct URL access, bookmarks.
- **Sign-up / email verification**: `callbackURL` changed from `/dashboard` to `/dashboard/profile-management` in `signUpAction`, `resendVerificationEmailAction`, `auth.ts` config (`onExistingUserSignUp`), and `auth-client.ts` (social sign-in). New users always need onboarding.

**P4 — Multiple CV Upload / CV List View:** ⏸️ Skipped
The DB schema supports multiple `cvUpload` rows per applicant, but the UI intentionally shows only the latest CV for MVP. A full CV list view with add/edit/delete and paid-tier gating is deferred to post-launch. Re-parsing the latest CV is supported via `reparseCvAction` in the State 3 work history section.

**P5 — Orphaned cvUpload Cleanup:** ✅ Implemented
See §3.8 above. The `cleanupOrphanedCvUploads` Inngest cron job runs daily and removes stuck processing and orphaned `cvUpload` rows.

---

## 3.9 INNGEST ORCHESTRATION INFRASTRUCTURE `[Status: Implemented]`

The Inngest v4 SDK provides the durable execution layer for all background jobs, scheduled tasks, and event-driven workflows. It is configured as the base infrastructure that Module B (seeding/ingestion) and Module C (routing) build upon.

### 3.9.1 Project Files

| File | Purpose |
|------|---------|
| `src/inngest/client.ts` | Typed Inngest client (`id: "vectormatch"`) with `VectorMatchEvents` catalog. Re-exports as `inngest`. |
| `src/inngest/functions.ts` | All Inngest function definitions: `hnAlgoliaSeeder`, `customUrlResolver`, `bigQuerySeeder`, `phalanxPoller`, `tierRecalc`, `staleCleanup`, `jobIngestedHandler`, `gate3Evaluator`, `pendingQueueSweep` (cron every 30 min — picks up stuck pending rows), `personaUpdatedHandler` (event-driven — re-evaluates rejected matches when persona tags change AND triggers bulk reprocess), `cleanupOrphanedCvUploads`, `companyRevivalSweep`, `normalizationRetrySweep` (limit 500/run), `tierActiveFanOut`, `tierDormantFanOut`, `pollCompanyFn`, `batchPollTier`, `aggregatorJobHandler`, `staleJobVerifier`, `pipelineHealthMonitor`, `matchBulkReprocess` (event-triggered bulk reprocessing), `matchRetrySweep` (daily re-matching sweep), plus 27 Module B source seeder functions (10 batch + 13 daily + Brave Search + crt.sh + slugger retry). 48 functions total. |
| `src/inngest/index.ts` | Barrel exports for clean imports (`@/inngest`). |
| `src/app/api/inngest/route.ts` | Next.js App Router serve handler (`GET`, `POST`, `PUT`) with `maxDuration: 300`. |
| `docs/reports/inngest-agent-resources.md` | Coding agent reference: LLM docs, MCP, CLI debugging, AI patterns (`step.ai.wrap`, `step.ai.infer`). |

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

**Auto-sync (June 2026 update):** Function definitions are now automatically synced with Inngest Cloud on every server startup via `src/instrumentation.ts`. The Next.js instrumentation hook sends a `PUT /api/inngest` request 5 seconds after server start, registering all function definitions with Inngest Cloud. No manual `curl -X PUT` is needed after deploys.

The auto-sync:
- Only runs in production (`INNGEST_DEV` is not set)
- Only runs on the Node.js server runtime (not during build)
- Is non-fatal — if the sync fails, Inngest Cloud will also poll the endpoint periodically
- Uses `INNGEST_SERVE_ORIGIN` if set, otherwise falls back to `http://localhost:3000`

Manual sync is still available as a fallback:
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
  "smartrecruiters",  // Added June 29 2026 — corpus expansion (B5 newsletters, D4 remote boards)
  "recruitee",        // Added June 29 2026 — corpus expansion (D4 remote boards, D5 WWR)
  "workable",         // Added June 29 2026 — corpus expansion (B1 Workable Meta-Search)
]);

export const companyTierEnum = pgEnum("company_tier", [
  "active_hot",  // Tier A+: companies with recent approved matches → poll every 3h (G1, added June 29 2026)
  "active",      // Tier A: posted a job in last 14 days → poll every 12h
  "dormant",     // Tier B: no jobs in >14 days → poll weekly
  "dead",        // Tier C: endpoint returns 404 or 3+ consecutive failures → stop
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
  "httparchive",         // BigQuery volume seeder (B6)
  "hn_algolia",          // Hacker News delta seeder (D2)
  "crt_sh",              // Certificate Transparency stealth seeder (B8 — implemented Sprint 4, June 30 2026)
  "hn_custom_url",       // HN comment with non-ATS URL → CNAME/probe resolved
  "manual",              // Admin-added via dashboard
  // ── Corpus expansion sources (added June 29 2026, migrations 0016-0028) ──
  "workable_meta_search",  // B1: Workable meta-search API
  "google_cse",            // B2/D1: Google CSE (DISABLED — replaced by Brave Search in Sprint 3)
  "yc_directory",          // B3: YC Directory (Algolia API, isHiring filter)
  "vc_portfolio",          // B4: VC portfolio page mining
  "newsletter_archive",    // B5: Developer newsletter archives
  "wayback_cdx",           // B7: Wayback Machine CDX API
  "rapid7_fdns",           // B8: Rapid7 FDNS v2 CNAME reversal (SKIPPED — commercial licensing, replaced by crt.sh)
  "cross_pollination",     // B9: Company names from existing job descriptions
  "sitemap_probe",         // B10: Sitemap.xml probing for failed Slugger rescues
  "certstream",            // D6: CertStream CT log domain matching
  "meta_ads",              // D13: Meta Ads Library hiring ad companies
  // ── Corpus-persona alignment sources (added July 7 2026, migration 0045) ──
  "github_probe",          // v2: GitHub Events API poller for YC/VC-funded orgs (P1-2)
  "funding_signal",        // v2: RSS/Atom funding feed sourcing (TechCrunch, etc.)
  "frontend_job_scanner",  // P2-2: Brave Search for frontend-keyword job postings on ATS domains
  // Note: D3-D5, D7-D12 use "hn_algolia" as discovery_source due to enum limitation.
  // The Slugger resolves all non-direct-slug sources through the same code path.
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
    canonicalName: text("canonical_name"),  // Added June 29 2026 — normalized name for dedup across sources
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

    // ── Company Scoring (added July 7 2026, migrations 0041-0044) ──────────
    // Used by company-scorer.ts to compute company_size_score and recommend tier.
    employeeCount: integer("employee_count"),  // Estimated headcount (YC=30, VC=100, big-tech registry fallback)
    companySizeScore: real("company_size_score").default(0),  // Clamped [-0.30, +0.30], feeds dashboard display score
    isAgency: boolean("is_agency").default(false),  // Staffing agency/aggregator flag → tier=dead, score -40
    isPublic: boolean("is_public").default(false),  // Publicly listed company → score -20

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
- **`companyTierEnum` is separate from `companyHealthEnum`** — Tier (active_hot/active/dormant/dead) is about polling cadence. Health (healthy/degraded/rate_limited/blocked/error/dead) is about last poll result. These are orthogonal.
- **`active_hot` tier (added June 29 2026)** — Companies with recent approved Gate 3 matches are polled every 3h (vs. 12h for active). This ensures hot companies are checked more frequently for new job postings.
- **`canonicalName` column (added June 29 2026)** — Normalized company name for cross-source dedup. When the Slugger resolves a company name to an ATS slug, the canonical name is stored to prevent the same company from being inserted multiple times under different discovery sources.
- **`lastJobPostedAt` drives tier transitions** — The decay algorithm doesn't need a separate tracking table. The poller updates this field; tier recalculation runs as a daily scheduled query.
- **`consecutiveFailures` with threshold of 3** — Automatic `→ dead` transition. Three consecutive poll failures mark the company as dead and stop polling.
- **No FK to `job` table** — The relationship is logical (jobs matched by `atsSource + atsSlug`), not enforced. This prevents poller failures when a job arrives for a slug not yet in the registry.
- **`employeeCount` column (added July 7 2026)** — Estimated headcount for company scoring. YC-sourced companies default to 30, VC-sourced to 100. Big-tech registry (`src/lib/jobs/company-enrichment/big-tech-registry.ts`) provides exact counts for 30+ known companies. Null = graceful degradation (score 0 from this signal).
- **`companySizeScore` column (added July 7 2026)** — Clamped to [-0.30, +0.30], computed by `src/lib/jobs/company-scorer.ts` from 5 signals: employee count, agency flag, public listing, source origin, maturity (disabled — `discoveredAt` is not a valid company-age proxy). Feeds into the dashboard display score (0.17 weight bucket).
- **`isAgency` / `isPublic` columns (added July 7 2026)** — Boolean flags for company scoring. Agency/aggregator → score -40 + tier=dead override. Publicly listed → score -20. Resolved via big-tech registry fallback when not explicitly set.

### 4.0a The `slugger_retry` Table — Slugger Retry Queue `[Status: Implemented — June 29 2026]`

The Slugger (`src/lib/jobs/seeders/slugger.ts`) resolves company names to ATS slugs by trying each ATS platform's API. When resolution fails (company not on any ATS), the company is added to a retry queue instead of being discarded. The `fundingSignalSeeder` (D7) processes this queue daily, retrying companies whose websites may have added an ATS since the last attempt.

**Drizzle Path:** `src/db/schemas/jobs/sluggerRetry.ts`

```typescript
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

**Retry strategy:** Companies are retried after 30/60/90 days — companies may configure an ATS later, especially post-funding. The `fundingSignalSeeder` (D7) cron at 11:00 UTC processes the retry queue.

### 4.0b The `ingestionLog` Table — Observability `[Status: Implemented]`

Without observability, the pipeline is a black box. Every seeder and poller run is logged here.

**Drizzle Path:** `src/db/schemas/jobs/ingestionLog.ts`

```typescript
export const ingestionLogTypeEnum = pgEnum("ingestion_log_type", [
  "seed",         // Seeder ran (HN, BigQuery, crt.sh)
  "poll",         // Poller polled a company
  "batch_poll",   // Batch poll tier ran (G5 — polls N companies per run) [Sprint 7]
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

The existing `job` table (§2.1) needs these additions for Module B:

1. **`externalJobId` (text, notNull)** — The ATS's internal job ID (e.g. Greenhouse's numeric `id`, Lever's UUID string). Used for deduplication via upsert.
2. **`lastSeenAt` (timestamp, notNull, default now)** — When the job was last seen in a poll. Updated on every re-poll. Drives stale detection.
3. **`status` (text, notNull, default 'active')** — `active` | `stale` | `gone` | `rejected` | `normalization_failed`. Jobs not seen in 7 days → `stale`. Not seen in 30 days → `gone`. Module C's Gate 1+2 query must filter `WHERE status = 'active'`. `rejected` and `normalization_failed` are Module C statuses (set by `jobIngestedHandler`).
4. **`normalizedText` (text, nullable, added June 29 2026 — G7)** — The cleaned full-text extracted from `rawJson` during normalization. After normalization, `rawJson` is NULLed and `normalizedText` retains the ~3KB cleaned text (vs. ~15KB rawJson). This is an 80% storage reduction per job. One-time backfill script: `scripts/backfill-normalized-text.ts` (4,491 jobs processed, ~31MB reclaimed).
5. **`publishedAt` (timestamp, nullable, added July 2026)** — When the job was first published, extracted from ATS metadata where available (Greenhouse `first_published`, Lever `createdAt`, Ashby `publishedAt`, SmartRecruiters/Recruitee `releasedDate`, Workable `created_at`). Drives two independent freshness gates: (a) the 30-day injection-age cap prevents old listings from entering the corpus, and (b) the 60-day active-job age boundary determines when an already-ingested job should be marked `stale` by the daily cleanup. A `NULL` `publishedAt` is treated as unverified and rejected at injection time because all supported ATS sources provide a publish date.

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

Do not scrape career pages dynamically. Seed the database with known ATS slugs. The system is fully autonomous — unresolvable discoveries are added to the Slugger retry queue (daily retries with exponential backoff) or discarded after 7 failed attempts.

**Timescale separation — three operational patterns (updated June 29 2026):**

| Component | Schedule | Implementation | Failure Mode |
|-----------|----------|----------------|--------------|
| BigQuery Volume Seeder (B6) | Monthly (Inngest scheduled) | Inngest function `bigQuerySeeder` with `cron: "0 0 1 * *"` (multi-partition scan: last 6 monthly crawls, ~90 GB per run) | Query fails → no new companies → retry next month |
| HN Algolia Delta Seeder (existing) | Daily (first 7 days of month) | Inngest function `hnAlgoliaSeeder` with `cron: "0 0 * * *"` (skips days 8-31) | API fails → Inngest automatic retry (3 attempts) |
| Batch Source Flush (B1-B10) | One-time (event-triggered) | `scripts/fire-flush.ts` sends `batch/*` events to Inngest | Individual source failure → logged, other sources continue |
| Daily Sources (D2-D13) | Staggered cron schedule | 12 Inngest functions with staggered crons (see §4.1.4) | API fails → Inngest automatic retry |
| crt.sh Stealth Seeder (B8) | Monthly (Inngest scheduled) | Inngest function `batchSourceB8CrtSh` with monthly cron | API fails → Inngest automatic retry |

#### 4.1.0 The Slugger — Company Name → ATS Slug Resolution `[Status: Implemented — June 29 2026]`

**Drizzle Path:** `src/lib/jobs/seeders/slugger.ts`

The Slugger is the core resolution engine for daily sources (D3-D13) that discover company names but not ATS slugs. It takes a company name (and optionally a website) and tries to find the company's ATS slug by:

1. **Canonical name normalization** (`canonicalizeCompanyName`) — lowercases, strips suffixes (Inc., LLC, Ltd.), removes punctuation.
2. **Slug variant generation** (`generateSlugVariants`) — generates candidate slugs from the canonical name (e.g. "Acme Corp" → ["acme-corp", "acmecorp", "acme"]).
3. **ATS API probe** — for each variant, tries each ATS platform's API (`boards-api.greenhouse.io/v1/boards/{slug}/jobs`, `api.lever.co/v0/postings/{slug}?mode=json`, `api.ashbyhq.com/posting-api/job-board/{slug}`). If any returns valid JSON with jobs, the slug is found.
4. **DB cache check** (`checkDbCache`) — before probing, checks if the company name was already resolved (avoids redundant API calls).
5. **Retry queue** (`addToRetryQueue`) — if resolution fails, the company is added to `slugger_retry` for daily retries by the funding signal seeder (D7).
6. **Company insertion** (`insertResolvedCompany`) — when resolved, inserts the company into the `company` table with the discovered ATS slug.

**Key option:** `insertCompany: true` (default) — when set, the Slugger inserts the company into the `company` table after resolution. When `false`, it only returns the resolved slug (used by sources that handle insertion themselves).

#### 4.1.1 HTTPArchive BigQuery (The Volume Seeder — B6) `[Status: Implemented]`

**⚠️ CRITICAL: The `httparchive.technologies` table no longer exists.** As of April 2025, the HTTP Archive reorganized their BigQuery dataset. The data now lives in `httparchive.crawl.pages` (~30 TB/month) as a nested `technologies.technology` array field within each page record. The old query strategy (`WHERE technology = 'Next.js'` against a standalone table) will not run.

**Cost optimization strategy (updated June 25 2026):**
- BigQuery free tier: 1 TB free query processing per month (requires billing-enabled project, but costs $0 at MVP scale — $300 free credit covers overage).
- BigQuery charges per column scanned, not per filter complexity. Adding technologies to `IN UNNEST()` costs the same as querying for one.
- **Always pin `date` to a specific monthly crawl** (partition filter is mandatory — table is 30 TB/month).
- Filter on `client = 'desktop'` (halves scan volume) and `is_root_page = true` (only homepages).
- **CRITICAL: Never scan the `payload` column.** It contains full webpage contents as JSON and costs ~4 TB per monthly partition. The optimized query uses only the `technologies` column (Wappalyzer detection) which costs ~15 GB per partition — a **270x cost reduction**.
- Wappalyzer detects Greenhouse and Lever as technologies with category "Recruitment & staffing". Ashby is NOT detected by Wappalyzer (too niche) — HN seeder catches Ashby companies.
- All domains go through slug probe resolution (CNAME check + ATS API probe). The `ats_source` from Wappalyzer is passed as a hint to the resolver so it only probes one ATS instead of three (3x fewer API calls).

**Technology subset for the query (4 tiers):**

| Tier | Technologies | Rationale |
|------|-------------|-----------|
| **Tier 1 — Core web frameworks** | `Next.js`, `React`, `Vue.js`, `Nuxt.js`, `Svelte`, `SvelteKit`, `Angular`, `Astro`, `Remix`, `Gatsby`, `Solid.js` | Persona-defining for target users |
| **Tier 2 — Backend/runtime** | `Node.js`, `Express`, `NestJS`, `Fastify`, `Deno`, `Bun` | Catches backend-heavy shops without a JS frontend framework |
| **Tier 3 — Build tools & CSS** | `Tailwind CSS`, `Vite`, `esbuild`, `TypeScript`, `Playwright`, `Vitest` | High correlation with modern dev teams |
| **Tier 4 — Legacy (detectable)** | `PHP`, `WordPress`, `Laravel`, `Drupal`, `Symfony`, `Ruby on Rails` | These heavily influence frontend HTML structure, headers, and cookies — detectable via HTTPArchive unlike pure Go/Rust backends |

**Note on Tier 4:** Unlike pure Go or Rust backends (which leave no frontend fingerprint), PHP/Rails/WordPress stacks are detectable because they generate distinctive HTML structures, HTTP headers (`X-Powered-By: PHP/X.Y`), session cookies (`PHPSESSID`, `_rails_session`), and meta generator tags. These companies still hire frontend developers and full-stack engineers — excluding them would miss a significant portion of the market.

**Optimized query (June 25 2026 — uses technologies column, NOT payload):**
```sql
SELECT DISTINCT
  root_page,
  page,
  CASE
    WHEN EXISTS (SELECT 1 FROM UNNEST(technologies) t WHERE t.technology = 'Greenhouse') THEN 'greenhouse'
    WHEN EXISTS (SELECT 1 FROM UNNEST(technologies) t WHERE t.technology = 'Lever') THEN 'lever'
  END AS ats_source
FROM `httparchive.crawl.pages`
WHERE
  date = '2026-06-01'
  AND client = 'desktop'
  AND is_root_page
  AND EXISTS (
    SELECT 1 FROM UNNEST(technologies) t WHERE
    t.technology = 'Next.js' OR t.technology = 'React' /* ... full tier list ... */
  )
  AND EXISTS (
    SELECT 1 FROM UNNEST(technologies) t
    WHERE t.technology IN ('Greenhouse', 'Lever')
  );
```

**Cost comparison (measured June 25 2026):**

| Query approach | Bytes scanned | Free tier runs/month |
|---|---|---|
| `payload` column scan (REGEXP_EXTRACT) | 4,129 GB | 0 (exceeds 1 TB limit) |
| `technologies` column only (Wappalyzer) | 15 GB | 60+ |

**HTTPArchive homepage-only limitation — the workaround:**

HTTPArchive only crawls homepages (`/`). The `technologies` column uses Wappalyzer which detects ATS scripts loaded on the homepage. If a company embeds their ATS widget only on `company.com/careers`, Wappalyzer won't detect it. The workaround:

1. **Phase 1 (BigQuery):** Query for domains running our target tech stack AND with Greenhouse/Lever detected by Wappalyzer. Returns `root_page` + `ats_source` (which ATS was detected).
2. **Phase 2 (Slug probe):** For each domain, the resolver (`resolveCustomUrl`) tries CNAME check + slug probe against the detected ATS only (using `atsHint` parameter — 3x fewer API calls than probing all three). ~40% hit rate on real data (362 resolved out of 914 domains in June 2026 run).

**Implementation notes `[Status: Implemented — optimized June 25 2026]`:**

| File | Role |
|------|------|
| `src/lib/jobs/seeders/bq-schemas.ts` | Zod schemas for BigQuery query result rows. Fields: `root_page`, `page` (optional), `ats_source` (enum: "greenhouse" \| "lever"). No slug columns — all slug resolution via probe. |
| `src/lib/jobs/seeders/bigquery-seeder.ts` | Domain logic with injectable `BigQueryFn`. SQL builder (`buildBigQuerySql`) using `technologies` column, `processBigQueryRows` (all rows go through slug probe with `ats_source` hint), `createDefaultBigQueryFn` (supports `GOOGLE_APPLICATION_CREDENTIALS_B64` for Coolify, `GOOGLE_APPLICATION_CREDENTIALS_JSON` for local dev, `GOOGLE_APPLICATION_CREDENTIALS` file path for ADC). |
| `src/lib/jobs/seeders/resolve-custom-url.ts` | URL resolver with `atsHint` parameter — when ATS source is known (from BigQuery Wappalyzer detection), only probes that ATS instead of all three. |
| `scripts/seed-bigquery.ts` | Manual script wrapper (`npx tsx scripts/seed-bigquery.ts --date 2026-06-01 --limit 100`). |

**Key implementation decisions:**
- The SQL query uses the `technologies` column (Wappalyzer detection) — NOT the `payload` column. This reduces scan cost from ~4 TB to ~15 GB (270x cheaper).
- Wappalyzer detects Greenhouse and Lever. Ashby is NOT detected — HN seeder catches Ashby companies.
- All domains go through slug probe resolution. The `ats_source` from Wappalyzer is passed as a hint to `resolveCustomUrl` so it only probes one ATS (3x fewer API calls).
- GCP credentials for Coolify: `GOOGLE_APPLICATION_CREDENTIALS_B64` (base64-encoded JSON — Docker-safe, no special characters that break `ARG` instructions). Encode with `base64 -i key.json \| tr -d '\n'`.
- The BigQuery client is injectable (`BigQueryFn = (sql: string) => Promise<BigQueryRow[]>`) for testing without real GCP credentials.
- Dual execution: manual script (`scripts/seed-bigquery.ts`) + Inngest scheduled function (`bigQuerySeeder`, monthly cron `0 0 1 * *`). Both call `runBigQuerySeeder()`.
- **Multi-partition scan (June 2026 update):** The Inngest function scans the last 3 monthly crawl dates in a single query (`generateCrawlDates(3)` + `date IN (...)`). This catches companies added between monthly crawls. Cost: ~45 GB per run (3 × 15 GB), well within the 1 TB/month free tier (20+ runs/month). The `DISTINCT` clause deduplicates root_page across partitions. The manual script supports `--partitions N` (default 3) or `--date YYYY-MM-DD` for a single partition.
- Test coverage: 32 unit tests (12 schema tests + 20 seeder tests) with mocked BQ client.
- Real-data results (June 25 2026 run): 914 domains found, 362 resolved (40% hit rate), 278 companies inserted.

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
   - `jobs.ashbyhq.com/{slug}` — Ashby hosted board (primary pattern)

   These map directly to `company` table rows.

2. **Non-ATS URLs** (e.g. `mystartup.com/careers`): The system attempts autonomous resolution via a two-stage process:
   - **Stage 1 — DNS CNAME check:** For `careers.mystartup.com`, do a DNS CNAME lookup. If it resolves to `boards.greenhouse.io` or `lever.co`, the ATS is found.
   - **Stage 2 — Slug probe:** If CNAME fails, extract the company name from the URL and try `boards-api.greenhouse.io/v1/boards/{slug}/jobs`, `api.lever.co/v0/postings/{slug}?mode=json`, `api.ashbyhq.com/posting-api/job-board/{slug}`. If any returns valid JSON, the ATS slug is found.
   - **If both fail: discard the URL.** The system is fully autonomous — no manual review queue. Unresolvable URLs are logged in `ingestionLog` for observability but not acted upon. If practice shows the majority of HN job listings fall into this unresolvable category, alternative resolution strategies will be considered.

**Implementation:** The HN seeder runs as an Inngest scheduled function (`seeder/hn-algolia`, weekly on Monday). The custom-URL resolver runs as a separate Inngest function (`seeder/resolve-custom-url`), triggered by events from the HN seeder. This separation keeps the HN seeder fast (text parsing only) and isolates network-dependent logic.

#### 4.1.3 crt.sh (The Stealth Seeder) `[Status: Implemented — Sprint 4, June 30 2026]`

**Implementation:** `src/lib/jobs/seeders/batch-sources/crt-sh.ts` queries Certificate Transparency logs via `crt.sh/?q=%25.boards.greenhouse.io&output=json` for historical ATS domain discoveries. Replaces the disabled Rapid7 FDNS source (B8). Monthly refresh cron.

**Approach:**
- Queries the crt.sh HTTP API with wildcard patterns for ATS domains (`%.boards.greenhouse.io`, `%.jobs.lever.co`, `%.jobs.ashbyhq.com`).
- Extracts company slugs from certificate DNS names.
- **Two-stage verification:** (1) CNAME lookup, (2) slug probe against ATS APIs. If both fail, discard — no manual review.
- Monthly refresh cron ensures new certificates are discovered over time.

#### 4.1.3a Batch Sources (B1-B10) — One-Time Flush `[Status: Implemented — June 29 2026]`

The Continuous Company Acquisition Pipeline (TDD `docs/reports/CORPUS_EXPANSION_TDD.md`) adds 10 batch sources for one-time corpus bootstrapping. Each source is an Inngest function triggered by a `batch/*` event (sent via `scripts/fire-flush.ts`).

**Source inventory:**

| ID | Source | Discovery Method | Est. Yield | Actual Yield | Status |
|----|--------|-----------------|------------|--------------|--------|
| B1 | Workable Meta-Search | `jobs.workable.com/api/v1/jobs` — extract company slugs from `company.url` | 300-600 | 26 (test run) | ✅ Fixed (API schema drift) |
| B2 | Google CSE | `site:boards.greenhouse.io` searches via Google CSE API | 200-500 | 0 | ❌ Disabled (API discontinued) |
| B3 | YC Directory | Algolia API — `yc-organizations` index, `isHiring:true` filter | 150-400 | 374 | ✅ Success |
| B4 | VC Portfolios | Cheerio HTML scraping of curated VC portfolio pages (a16z, Sequoia, etc.) | 500-2,000 | 36 | ✅ Success |
| B5 | Newsletter Archives | Crawl JS Weekly, React Status, etc. — extract ATS URLs from issue links | 200-500 | 257 | ✅ Success |
| B6 | BigQuery (existing) | HTTPArchive Wappalyzer detection — monthly cron | 300-500 | 316 | ✅ Already running |
| B7 | Wayback CDX | `web.archive.org/cdx/search` — query ATS domains, extract slugs from archived URLs | 200-500 | 4,163 | ✅ Top source |
| B8 | Rapid7 FDNS / crt.sh | Rapid7 FDNS v2 (skipped — commercial licensing) → replaced by crt.sh CT log query (`crt.sh/?q=%25.boards.greenhouse.io`) | 500-2,000 | 0 (Rapid7) / implemented Sprint 4 | ✅ Replaced by crt.sh (Sprint 4) |
| B9 | Cross-Pollination | Extract company names from existing `job` table, run through Slugger | 50-150 | 11 | ✅ Success |
| B10 | Sitemap Probe | Probe `sitemap.xml`, `jobs/sitemap.xml` for companies where Slugger failed | rescues 20-30% | 0 | ✅ Ran too soon after others |

**Flush results (June 29 2026):** 449 → 5,290 companies (106% of 5,000 target). Total: 4,841 new companies inserted. Tier distribution: 475 active, 4,815 dormant.

**Critical decisions:**
- **B2 Google CSE disabled:** Google's Programmable Search Engine API is discontinued for new customers ("This API is not available for new customers." — Jan 2027 sunset for existing). Bing Search API also retired (August 11, 2025). **Revisit with Brave Search API** ($5/1K requests, $5 free monthly, supports `site:` operator). See `docs/reports/CORPUS_EXPANSION_HANDOFF.md` §"Search API Alternatives".
- **B8 Rapid7 FDNS skipped:** Rapid7 Open Data now requires commercial licensing. D6 CertStream covers the same CNAME-based discovery approach via Certificate Transparency logs (free, real-time).
- **B1 Workable API schema drift fixed:** The Workable meta-search API changed its response format (June 2026): `company.name` → `company.title`, `company.shortName` removed, `company.url` added. Slug now extracted from `company.url` (`/company/{id}/jobs-at-{slug}`) via `extractSlugFromCompanyUrl()`. 23 tests (8 new for slug extraction).

**File locations:**
- Batch source seeders: `src/lib/jobs/seeders/batch-sources/` (10 files: workable-meta-search, google-cse, yc-directory, vc-portfolios, newsletter-archives, wayback-cdx, crt-sh, cross-pollination, sitemap-probe, brave-search)
- Inngest functions: `src/inngest/functions.ts` (lines 2200-2850 — `batchSourceB1Workable` through `batchSourceB10SitemapProbe`)
- Flush script: `scripts/fire-flush.ts`

#### 4.1.3b Daily Sources (D1-D13) — Continuous Discovery `[Status: Implemented — June 29 2026]`

13 daily-native sources run on staggered cron triggers to continuously discover new companies. The staggered schedule (TDD §2.2) avoids concurrent execution contention.

**Daily source schedule (all times UTC):**

| ID | Source | Cron | Method | Slugger? |
|----|--------|------|--------|----------|
| D1 | Google CSE Daily | `0 0,14 * * *` | `site:` searches | Direct | ❌ DISABLED |
| D2 | HN Algolia Daily | `0 1,16 * * *` | ATS URL extraction from comments | Direct |
| D3 | Reddit RSS | `0 2,18 * * *` | RSS feed parsing (r/forhire, r/jobbit) | Direct |
| D4 | Remote Job Boards | `0 3 * * *` | Remote OK + Remotive + Himalayas APIs | Slugger |
| D5 | WWR RSS | `0 4 * * *` | We Work Remotely + Jobicy RSS feeds | Slugger |
| D6 | CertStream | `0 10 * * *` | WebSocket to crt.sh CertStream — CT log domain matching | Slugger |
| D7 | Funding Signal | `0 11 * * *` | Process Slugger retry queue + Crunchbase funding news | Slugger |
| D8 | Product Hunt | `0 5 * * *` | Product Hunt API — daily launches | Slugger |
| D9 | Engineering Blogs | `0 6 * * *` | RSS feeds of tech company engineering blogs | Slugger |
| D10 | GitHub Trending | `0 7 * * *` | GitHub trending page + CONTRIBUTING.md scanning | Slugger |
| D11 | Tech News RSS | `0 8 * * *` | TechCrunch, Verge, etc. — LLM extracts company names from funding articles | Slugger |
| D12 | NPM Registry | `0 9 * * *` | NPM search API — org-scoped packages → org websites | Slugger |
| D13 | Meta Ads | `0 12 * * *` | Meta Ads Library API — hiring-related ad companies | Slugger |

**Key implementation details:**
- All daily sources use `discoverySource: "hn_algolia"` (existing enum limitation — the Slugger code path is shared)
- D6 CertStream: Connects to `wss://certstream.calidog.io/`, collects certificate updates for 60s, filters for career-page subdomains (careers.*, jobs.*, boards.*, etc.), does DNS CNAME lookups, matches against ATS CNAME targets, runs through Slugger. Reuses `matchAtsCname` from rapid7-cname.ts. 28 tests.
- D13 Meta Ads: Searches Meta Ads Library API for hiring-related ads ("we're hiring", "join our team"), extracts company names from `page_name`, deduplicates, runs through Slugger. Uses `META_ADS_ACCESS_TOKEN` env var. 27 tests.
- D7 Funding Signal: Dual purpose — (1) processes the Slugger retry queue (up to 50 companies per run with exponential backoff), (2) queries Crunchbase API for recently funded companies and runs them through the Slugger.

**File locations:**
- Daily source seeders: `src/lib/jobs/seeders/daily-sources/` (15 files: 12 original D2-D13 + github-events-probe + frontend-job-scanner + funding-signal-rss)
- Inngest functions: `src/inngest/functions.ts` (lines 1803-2200 — `dailySourceD2HnAlgolia` through `dailySourceD13MetaAds`)
- Tests: `src/lib/jobs/seeders/daily-sources/__tests__/` (7 test files, 150+ tests)

#### 4.1.3c v2 Frontend-Targeted Sources — Corpus-Persona Alignment `[Status: Implemented — July 7 2026]`

Three new daily sources added during the corpus-persona alignment session to target frontend/web developer jobs specifically. These inverts the discovery model: instead of "find companies with ATS → poll all their jobs → hope some are frontend", they become "find frontend jobs → extract the company → add to polling."

**v2 source inventory:**

| ID | Source | Inngest Function | Method | Env Var |
|----|--------|-----------------|--------|---------|
| v2-GH | GitHub Events Probe | `v2GithubEventsProbe` | GitHub Events API polls 129 frontend-ecosystem orgs (React, Next.js, Vue, Angular, Svelte, Tailwind, Vite, etc.) for new repos with ATS-bearing career pages | `GITHUB_TOKEN` |
| v2-FS | Frontend Job Scanner | `v2FrontendJobScanner` | Brave Search `site:boards.greenhouse.io/jobs "React" OR "Next.js" OR "TypeScript" OR "Frontend"` → extract company slug from URL pattern | `BRAVE_SEARCH_API_KEY` |
| v2-FUND | Funding Signal RSS | `v2FundingSignalRss` | RSS/Atom feeds from TechCrunch, SaaStr, etc. — LLM extracts company names from funding articles | — |

**P1-3 Brave Search Frontend Queries (batch source enhancement):**
The existing `brave-search.ts` batch source was enhanced with 6 frontend-targeted search queries:
1. `site:boards.greenhouse.io "React" OR "Next.js" developer`
2. `site:jobs.lever.co "React" OR "Next.js" developer`
3. `site:jobs.ashbyhq.com "React" OR "Next.js" developer`
4. `site:boards.greenhouse.io "TypeScript" OR "Frontend" developer`
5. `site:jobs.lever.co "TypeScript" OR "Frontend" developer`
6. `site:jobs.ashbyhq.com "TypeScript" OR "Frontend" developer`

**Key implementation details:**
- `github-events-probe.ts`: Expanded `YC_VC_FUNDED_ORGS` from 53 to 129 frontend-ecosystem orgs. Uses GitHub Events API (`/orgs/{org}/events`) to detect new repos, then probes for ATS-bearing career pages.
- `frontend-job-scanner.ts`: Uses Brave Search API with `site:` operator to find frontend job postings on ATS domains. Extracts company slug from URL patterns (`boards.greenhouse.io/{slug}/jobs/{id}`, `jobs.lever.co/{slug}/{id}`, `jobs.ashbyhq.com/{slug}/{id}`). Inserts with `discovery_source = 'frontend_job_scanner'`.
- Both sources require their respective API keys in `.env` to function. Without keys, the Inngest functions log a warning and skip.

**File locations:**
- `src/lib/jobs/seeders/daily-sources/github-events-probe.ts`
- `src/lib/jobs/seeders/daily-sources/frontend-job-scanner.ts`
- `src/lib/jobs/seeders/batch-sources/brave-search.ts` (enhanced with frontend queries)
- Tests: `src/lib/jobs/seeders/daily-sources/__tests__/frontend-job-scanner.test.ts`, `github-events-probe-orglist.test.ts`

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
    hostedBoard: (slug: string) => `https://jobs.ashbyhq.com/${slug}`,
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
  location: z.string().optional(),
  descriptionHtml: z.string().optional(),
  descriptionPlain: z.string().optional(),
  jobUrl: z.url().optional(),
  applyUrl: z.url().optional(),
  workplaceType: z.string().nullable().optional(),
  employmentType: z.string().nullable().optional(),
  isRemote: z.union([z.boolean(), z.string()]).nullable().optional(),
  department: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  shouldDisplayCompensationOnJobPostings: z.boolean().optional(),
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

### 4.4 The "Phalanx" Poller `[Status: Implemented — G5/G6 Batch Polling Architecture, June 29 2026]`

Do not use AWS API Gateway for Native ATS endpoints. They do not run TLS fingerprinting.

#### 4.4.1 Four Optimizations for Production Scalability

Polling 100,000 HTTP requests daily from a single Hetzner CX33 (2 vCPU / 8GB RAM) will exhaust resources, max out the Neon database connection pool, and likely get the server's IP blacklisted. Four optimizations prevent this:

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
| **Tier A+ (Active Hot)** | Companies with recent approved Gate 3 matches | Every 3 hours (G1, added June 29 2026) |
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

**Optimization 4 — G5/G6 Batch Polling Architecture (June 29 2026):**

The original per-company fan-out pattern (1 Inngest function per company poll) does not scale to 5,000+ companies. At 5,290 companies with the fan-out pattern, the Inngest Hobby plan (50K executions/month) would be exhausted in ~10 days. The batch polling architecture replaces fan-out with batched execution:

- **`batchPollTier`** (`src/lib/jobs/poller/batch-poll.ts`) — polls up to 100 companies per function run. Each company is polled sequentially within the function (rate-limited via bottleneck). This reduces Inngest execution count by 50-100x.
- **Three cron triggers map to three tiers:**
  - `batchPollActiveHot` (`cron: "0 */3 * * *"`) — polls `active_hot` tier companies every 3h.
  - `batchPollActive` (`cron: "0 */12 * * *"`) — polls `active` tier companies every 12h.
  - `batchPollDormant` (`cron: "0 3 * * 1"`) — polls `dormant` tier companies weekly (Monday 3am UTC).
- **Execution math:** 5,290 companies / 100 per batch = 53 batches per tier cycle. Active hot (every 3h, ~50 companies) = 1 batch × 8 cycles/day = 8 executions/day. Active (every 12h, ~475 companies) = 5 batches × 2 cycles/day = 10 executions/day. Dormant (weekly, ~4,815 companies) = 49 batches × 1 cycle/week = 49 executions/week. Total: ~18 + 49/7 ≈ 25 executions/day = 750/month. Well within the 50K/month Hobby plan limit.
- **Per-company error isolation:** If one company's poll fails (404, Zod validation error, network timeout), it's logged and the batch continues to the next company. A single failure does not abort the entire batch.
- **Bootstrap Poll (June 2026 update):** When seeders insert new companies, they immediately emit `poller/poll-company` events for them — eliminating the 7-day cold-start delay where new companies waited for the weekly dormant fan-out. This is implemented in the `hnAlgoliaSeeder`, `customUrlResolver`, and `bigQuerySeeder` Inngest functions.

**Company Revival Sweep (June 2026 update):** `poller-company-revival` (`cron: "0 5 * * *"`) — daily function that re-enables polling for dead companies after a 7-day cooldown. Without this, dead companies are permanently stuck (the tier recalculation only updates `WHERE polling_enabled = true`). The revival sweep resets `health = "healthy"`, `consecutiveFailures = 0`, and `pollingEnabled = true`, then emits bootstrap poll events to immediately re-test the revived companies.

**Normalization Retry Sweep (June 2026 update):** `poller-normalization-retry` (`cron: "0 6 * * *"`) — daily function that re-emits `job/ingested` events for up to 50 `normalization_failed` jobs. These jobs have no `normalizedAt` (by design — they're retryable), so the `jobIngestedHandler` idempotency guard will re-process them. If the failure was transient (OpenAI timeout), the retry succeeds. If persistent, the job fails again and is retried the next day.

**Do NOT create per-company Inngest scheduled functions** — 100,000 scheduled functions would overwhelm Inngest. The batch polling pattern (3 scheduled functions → N batches of 100 companies each) is the correct architecture for 5,000+ companies.

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

#### 4.4.4 The Stale Job Problem — Detection, Retention, and Cleanup

Jobs that have been filled or deleted by the company must be detected and excluded from matching. The retention model now uses three time horizons: a **30-day injection-age cap** (keeps old listings out), a **60-day active-job age boundary** (marks aged active jobs as stale), and a **90-day hard-delete boundary** (permanently removes ancient rows).

**Phase 0 — Injection freshness gate (per job, inside `phalanx-poller.ts`):**
Before a job is upserted, `isJobFreshForInjection(publishedAt)` checks whether `publishedAt` is within `MAX_JOB_INJECTION_AGE_DAYS` (default 30 days). Jobs older than this threshold are rejected at ingestion and reported as `jobsTooOld` in the poll result. A `NULL` `publishedAt` is also rejected because all supported ATS sources provide a publish date; treating a missing date as fresh would let unverifiable legacy postings bypass the gate.

**Active/closed status gate (per job, inside `phalanx-poller.ts`):**
`NormalizedJob.metadata.isActive` is set per source. Sources that expose explicit status (SmartRecruiters, Recruitee) reject jobs whose status is `closed`, `archived`, `filled`, `inactive`, etc. Sources whose public APIs only return live postings by contract (Greenhouse, Lever, Ashby, Workable) are assumed active. This filtering happens before the injection freshness gate.

**Phase 1 — Mark as stale (after each poll):**
After polling a company, jobs in the database for that `(atsSource, atsSlug)` that were *not* in the current fetch have their `lastSeenAt` left unchanged. Jobs that *were* in the fetch get `lastSeenAt = now()` and `status = "active"` (resurrected if previously stale).

**Phase 2 — Mark as gone / stale-by-age (daily Inngest function `poller/mark-stale-jobs`, `cron: "0 3 * * *"`):**
Two mechanisms run in the same cleanup window:

1. **Visibility-based cleanup** (unchanged): jobs not seen in 7 days → `stale`; jobs already `stale` and not seen in 30 days → `gone`.
2. **Age-based cleanup** (added July 2026): active jobs whose `publishedAt` is older than `MAX_JOB_AGE_DAYS` (currently 60 days, relative to the cleanup run date) are marked `stale`. This catches postings that remain live on the ATS but are too old to be useful for candidates.

```sql
-- Visibility-based stale/gone transitions
UPDATE job SET status = 'stale'
WHERE status = 'active' AND last_seen_at < NOW() - INTERVAL '7 days';

UPDATE job SET status = 'gone'
WHERE status = 'stale' AND last_seen_at < NOW() - INTERVAL '30 days';

-- Age-based staleness
UPDATE job SET status = 'stale'
WHERE status = 'active'
  AND published_at IS NOT NULL
  AND published_at < NOW() - INTERVAL '60 days';
```

**Phase 3 — Hard delete ancient jobs (daily Inngest `aggressiveCleanup` + one-time script):**
Jobs older than 90 days are permanently deleted because they have no matching value and consume storage/embedding budget. The `aggressiveCleanup` Inngest function calls `deleteAncientJobs(retentionDays = 90)`, which deletes `job` rows where `published_at < NOW() - INTERVAL '90 days'`. `match_queue` rows cascade automatically. A standalone one-time script, `scripts/hard-delete-ancient-jobs.ts`, is available for manual backfills; it defaults to dry-run mode and requires `DRY_RUN=false` to execute.

**Operational note:** The first production run of the age-based purge (July 2026) marked 1,741 active jobs as `stale` and the subsequent hard-delete script removed 2,676 jobs older than 90 days.

**Module C integration:** The 3-Gate query (§5.2) must filter `WHERE j.status = 'active'`. This ensures stale and gone jobs are never matched.

**Why hard-delete instead of keeping gone jobs forever?** Neon free-tier storage is capped at 512 MB. At scale, tens of thousands of `gone` jobs consume meaningful space and increase query/index maintenance. The 90-day hard delete removes rows that are extremely unlikely to be re-posted with the same `externalJobId`. Match history is intentionally sacrificed for storage sustainability; this is acceptable because the primary value is current matches, not historical archives.

**Why not delete gone jobs during normal cleanup?** The normal `staleCleanup` function marks jobs `gone` but does not delete them, so a re-posted job (same `externalJobId`) can be resurrected by the upsert. The separate 90-day hard-delete path is an explicit, auditable retention decision rather than an accidental data loss.

#### 4.4.5 Implementation Notes `[Status: Implemented]`

**File map (all domain logic in `src/lib/jobs/poller/`):**

| File | Role |
|------|------|
| `ats-adapters.ts` | Fetch + Zod validate + normalize per ATS platform. Returns unified `NormalizedJob[]`. Uses original JSON for `rawJson` to preserve all fields. Injectable `FetchFn`. **[Sprint 7]** Uses `fetchWithTimeout` for the jobs-list fetch (10s timeout). |
| `job-repository.ts` | Job table upserts (`onConflictDoUpdate`), new job detection (for B→C handoff), stale cleanup (Phase 2: 7d→stale, 30d→gone), active job count. |
| `company-state.ts` | Company polling state updates (lastPolledAt, health, consecutiveFailures). Auto-disables polling after 3 consecutive failures. HTTP status → health mapping (429→rate_limited, 403→blocked, 404→dead, 500+→error). **[July 2026]** Added `backfillCompanyActiveJobCounts()` to recompute every company's `activeJobCount` after bulk purges. |
| `tier-queries.ts` | Tier-based company queries for batch polling (active_hot every 3h, active every 12h, dormant weekly). Daily tier recalculation SQL (uses `::company_tier` enum cast for PostgreSQL compatibility). Single-company lookup by ID. |
| `phalanx-poller.ts` | Core orchestrator: fetch → Gate 0 filter → active-status filter → injection freshness gate → detail enrichment (SmartRecruiters/Greenhouse) → upsert → emit `job/ingested` → update company state. Never throws — all errors caught and returned in `PollResult`. |
| `batch-poll.ts` | G5/G6 batch polling: polls up to 100 companies per function run. Per-company error isolation. Used by `batchPollActiveHot`, `batchPollActive`, `batchPollDormant` Inngest functions. |
| `rate-limiter.ts` | Per-ATS Bottleneck limiters (2 req/s, 1 concurrent per platform). |
| `schemas.ts` | Zod schemas for Inngest event payloads (`pollCompanyEventSchema`, `pollerRunEventSchema`, `jobIngestedEventSchema`). |
| `fetch-with-timeout.ts` | **[Sprint 7]** Wraps injectable `FetchFn` with `AbortController`-based 10s timeout. Prevents indefinite hangs on unresponsive ATS endpoints. Used by `ats-adapters.ts` and `smartrecruiters-detail.ts`. |
| `ingestion-log.ts` | **[Sprint 7]** `writeIngestionLog()` helper — fire-and-forget insert into `ingestionLog` table. Used by `batchPollTier` and `normalizationRetrySweep`. |
| `cleanup-queries.ts` | **[July 2026]** SQL helpers for stale/age cleanup and hard-delete ancient jobs. Called by `staleCleanup` and `aggressiveCleanup`. |
| `smartrecruiters-detail.ts` | **[Sprint 4]** Selective Tier 2 detail fetch for SmartRecruiters. **[July 2026]** Also checks the detail response `status` field and drops jobs reported as closed/archived/filled/etc. before upsert. |
| `greenhouse-detail.ts` | **[Sprint 4]** Selective Tier 2 detail fetch for Greenhouse. Result shape includes `droppedInactive` for consistency with SmartRecruiters. |

**Inngest function map (in `src/inngest/functions.ts`):**

| Function | Trigger | Role |
|----------|---------|------|
| `pollCompanyFn` | `poller/poll-company` event | Per-company fan-out target (bootstrap polls). Concurrency cap 50. Fetches → Gate 0 → upsert → emits `job/ingested`. |
| `batchPollTier` | cron `0 */3 * * *`, `0 */12 * * *`, `0 3 * * 1` | **[Sprint 7 refactor]** G5/G6 batch poll for all three tiers. Polls 100 companies per run in `POLL_CHUNK_SIZE` (10) chunks — each chunk is a separate `step.run()` so progress is checkpointed. After polling, queries DB for unnormalized jobs and emits `job/ingested` events (robust fallback for timeout/retry). Writes `batch_poll` ingestion log entries. Concurrency cap 5. |
| `phalanxPoller` | `poller/run` event (manual) | Single-company poll by companyId (admin/testing). |
| `tierRecalc` | cron `0 4 * * *` (daily 04:00 UTC) | Recalculates all company tiers based on activity. |
| `staleCleanup` | cron `0 3 * * *` (daily 03:00 UTC) | Marks stale (7d visibility), gone (30d visibility), and age-stale (`publishedAt` older than `MAX_JOB_AGE_DAYS`, currently 60d) jobs. |
| `aggressiveCleanup` | cron `0 2 * * *` (daily 02:00 UTC) | **[July 2026]** Hard-deletes jobs older than 90 days and purges normalization-failed / rejected jobs when storage is critical. Runs before `staleCleanup`. |
| `normalizationRetrySweep` | cron `0 6 * * *` (daily 06:00 UTC) | **[Sprint 7]** Re-emits `job/ingested` for stuck jobs: `normalization_failed` OR `active + normalizedAt IS NULL`. **[Sprint 8]** Limit raised to 500/run to clear backlog faster. |
| `pipelineHealthMonitor` | cron `*/30 * * * *` (every 30 min) | **[Sprint 7]** Collects 8 pipeline metrics, evaluates thresholds, creates/resolves `pipeline_health` alerts. **[Sprint 8]** Expanded with 4 new metrics: approvedMatches24h, gate3ApprovalRate7d, unmatchedEmbeddedJobs, avgGate3Confidence. See §4.7.10. |
| `matchBulkReprocess` | `match/bulk-reprocess` event (manual) | **[Sprint 8]** Retroactively matches existing active+embedded jobs against personas. Queries jobs NOT in match_queue (LIMIT 1000), processes in batches of 25 with parallel `Promise.all` Gate 1+2 calls, fans out Gate 3 events per batch. Concurrency limit 1. Triggered via admin dashboard "Run Bulk Reprocess" button. |
| `matchRetrySweep` | cron `0 7 * * *` (daily 07:00 UTC) | **[Sprint 8]** Catches jobs missed by normal pipeline — queries active+embedded jobs older than 1h with no match_queue entry, processes in batches of 25 with parallel Gate 1+2. |

**Test coverage:** 32 unit tests (20 ATS adapter tests + 12 poller orchestrator tests) with mocked fetch + mocked DB. All 1,623 project tests pass (86 files). Live-tested against real ATS APIs and real Neon dev branch (June 2026) — see blueprint §4.1.2 testing strategy for results.

### 4.5 The B→C Handoff Contract `[Status: Implemented — G7 rawJson Pruning, June 29 2026]`

**Module B owns:** fetching, validating (Zod), filtering (Gate 0), and persisting raw job data.
**Module C owns:** normalization (tag extraction), embedding generation, rawJson pruning (G7), and matching.

**The handoff:** The poller emits one `job/ingested` Inngest event per **newly inserted** job (not upserted jobs — only genuinely new jobs). This prevents Module C from re-normalizing jobs it's already processed.

```
Module B (Poller)                          Module C (Router)
─────────────────                          ─────────────────
1. Fetch JSON from ATS API
2. Validate with Zod schema (safeParse)
3. Gate 0: regex title filter
4. Active-status filter (SmartRecruiters/Recruitee explicit status)
5. Injection freshness gate (publishedAt within 30 days; NULL rejected)
6. Detail enrichment (SmartRecruiters/Greenhouse Tier 2) — drops closed jobs
7. Upsert into job table:
   - extractedTags = []  (empty)
   - jobEmbedding = null
   - status = "active"
   - rawJson = full ATS response (~15KB)
8. If NEW job (not upsert):
   emit "job/ingested" { jobId }  ──────►  1. Receive "job/ingested" event
                                             2. Fetch job from DB
                                             3. Extract canonical tags
                                             4. Generate embedding
                                             5. G7: Extract normalizedText from rawJson
                                                - UPDATE job SET normalizedText = cleaned text
                                                - UPDATE job SET rawJson = NULL  (80% storage reduction)
                                             6. UPDATE job SET tags + embedding + normalizedAt
                                             7. Run Gate 1 + Gate 2 SQL query
                                             8. Insert into match_queue
                                             9. Fan out Gate 3 LLM evaluation
```

**G7 rawJson pruning (June 29 2026):** After normalization, the job's `rawJson` (~15KB) is NULLed and the cleaned text is stored in `normalizedText` (~3KB) — an 80% storage reduction per job. This prevents the `job` table from exceeding Neon's 512MB row limit when ATS responses are large (some Ashby responses are 50KB+). The `normalizedText` column was added via migration 0016. A one-time backfill script (`scripts/backfill-normalized-text.ts`) processed 4,491 existing jobs, reclaiming ~31MB. New jobs are pruned automatically by `jobIngestedHandler` during normalization. The dashboard's `extractJobContent` function reads from `normalizedText` (falling back to `rawJson` for pre-G7 jobs).

**Why this boundary:**
- **Testability:** Module B is tested by asserting `job` rows with `extractedTags = []` and `jobEmbedding = null`. Module C is tested by feeding it a job row and asserting tags/embedding are populated.
- **Failure isolation:** If the embedding service is down, Module B still inserts raw jobs. Module C catches up when it recovers.
- **Cost control:** Embedding every job costs money. By separating insertion from embedding, only jobs that passed Gate 0 (relevant titles) get embedded.

**Sprint 7 enhancement (July 1 2026):** `batchPollTier` now emits `job/ingested` events for unnormalized jobs found via DB query AFTER polling — not just for genuinely new jobs. This is a robust fallback for the timeout/retry failure mode: when the `poll-batch` (now `poll-chunk-N`) step times out and retries, `upsertJobs` finds the jobs already exist → `newJobIds = []`, but the DB query (`status = 'active' AND normalizedAt IS NULL`) still finds them as unnormalized. The `jobIngestedHandler` idempotency guard (§4.6) ensures already-normalized jobs are skipped, so duplicate events are safe. The `normalizationRetrySweep` daily cron (06:00 UTC) catches any remaining stuck jobs across the entire `job` table (not just polled companies). See §4.7.10 for full details.

### 4.6 ATS Platform Coverage

| ATS | Market Share | Public JSON API? | VectorMatch Priority |
|-----|-------------|-------------------|---------------------|
| Workday | ~32% | No (enterprise auth only) | Skip |
| Greenhouse | ~18% | Yes (`boards-api.greenhouse.io`) | **MVP** |
| Lever | ~12% | Yes (`api.lever.co/v0`) | **MVP** |
| iCIMS | ~10% | No | Skip |
| Ashby | ~5% (fastest-growing) | Yes (`api.ashbyhq.com`) | **MVP** |
| SmartRecruiters | ~3% | Yes (`api.smartrecruiters.com/v1`) | **Implemented (June 29 2026)** — added for corpus expansion (B5 newsletters, D4 remote boards) |
| Recruitee | ~2% | Yes (`api.recruitee.com`) | **Implemented (June 29 2026)** — added for corpus expansion (D4 remote boards, D5 WWR) |
| Workable | ~2% | Yes (meta-search `jobs.workable.com/api/v1/jobs`) | **Implemented (June 29 2026)** — B1 Workable Meta-Search source. API schema drift fixed (June 2026: `company.name`→`company.title`, slug extracted from `company.url`) |

**Greenhouse + Lever + Ashby = ~35% of total market but ~60–70% of the startup/mid-size tech company market** — which is the target segment. Workday dominates enterprise (Fortune 500), which is not the target user's sweet spot. The corpus expansion (June 29 2026) added SmartRecruiters, Recruitee, and Workable support, bringing total ATS coverage to ~40% of the total market and ~75-80% of the startup/mid-size tech company market.

---

### 4.7 Sprint 2: Quality Architecture (G1, Q2, Q3, Q4, Q5) `[Status: Implemented — June 30 2026]`

Sprint 2 implements the quality architecture from CORPUS_EXPANSION_TDD §3.1–§3.4. These five features work together to ensure that high-quality companies are polled more frequently, low-quality companies are demoted, and newly discovered companies get an immediate bootstrap poll.

#### 4.7.1 G1: Adaptive Polling Cadence `[Status: Implemented]`

**File:** `src/lib/jobs/poller/tier-queries.ts` — `recalculateTiers()`

The daily tier recalculation now promotes companies to `active_hot` when they have approved matches in the last 30 days. The tier transition logic (evaluated in order — first match wins):

```
1. health = "dead" OR consecutiveFailures >= 3 → tier = "dead"
2. approved match_queue entry in last 30 days → tier = "active_hot"
3. discovered within last 48 hours (Q4 bootstrap) → tier = "active_hot"
4. lastJobPostedAt within 14 days → tier = "active"
5. otherwise → tier = "dormant"
```

The `active_hot` check uses an EXISTS subquery that joins `match_queue` → `job` on `(ats_source, ats_slug)` and correlates to `company`. This is the logical relationship — there is no FK from company to job (by design, see §4.0).

**Cron schedule:** The `batchPollTier` Inngest function runs on three cron schedules:
- `active_hot`: every 3h (`0 */3 * * *`)
- `active`: every 12h (`0 */12 * * *`)
- `dormant`: weekly (`0 3 * * 1`)

**Tests:** `src/lib/jobs/poller/__tests__/tier-recalc.test.ts` (9 tests)

#### 4.7.2 Q4: Bootstrap Polling `[Status: Implemented]`

**Schema change:** `company.tier` default changed from `"dormant"` to `"active_hot"` (migration `0029_q4_bootstrap_default_active_hot.sql`).

New companies default to `active_hot` for the first 48h after discovery (poll every 3h). This gives new companies an immediate chance to be polled and their ATS endpoint tested. After 48h, the daily tier recalc demotes them to `active` or `dormant` based on job count.

The 48h protection is in `recalculateTiers()` — the `discovered_at > NOW() - INTERVAL '48 hours'` check preserves `active_hot` for new companies. The Q2 quality flywheel demotion also respects this 48h window (won't demote companies discovered within 48h).

#### 4.7.3 Q2: Adversarial Quality Flywheel `[Status: Implemented]`

**New table:** `company_quality_score` (migration `0030_q2_quality_flywheel_score.sql`)

```typescript
export const companyQualityScore = pgTable("company_quality_score", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => company.id, { onDelete: "cascade" }),
  score: integer("score").notNull().default(0), // 0-100
  approvedMatches: integer("approved_matches").notNull().default(0),
  rejectedMatches: integer("rejected_matches").notNull().default(0),
  totalJobsProcessed: integer("total_jobs_processed").notNull().default(0),
  lastApprovedAt: timestamp("last_approved_at"),
  calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
});
```

**Files:**
- `src/db/schemas/jobs/companyQualityScore.ts` — Drizzle schema
- `src/lib/jobs/quality/quality-flywheel.ts` — Recalculation logic
- `src/inngest/functions.ts` — `qualityFlywheelRecalc` Inngest function (cron `0 4 * * *`)

**Daily recalculation (`recalculateQualityScores()`):**
1. Aggregates match_queue data per company (approved/rejected/total counts) via JOIN match_queue → job → company
2. Upserts into `company_quality_score` with `ON CONFLICT (company_id) DO UPDATE`
3. Promotes high-quality companies: `score > 50 AND approved_matches > 3` → `active_hot`
4. Demotes low-quality companies: `score < 10 AND total_jobs_processed > 20` → `dormant` (respects Q4 48h bootstrap protection)
5. Counts purge candidates: `0 approved in 90 days` (logged, not auto-deleted)

**Score formula:** `score = (approvedMatches / totalJobsProcessed) * 100` (0 if no jobs processed)

**Tests:** `src/lib/jobs/quality/__tests__/quality-flywheel.test.ts` (16 tests)

#### 4.7.4 Q3: Layoff Signal Checker `[Status: Implemented]`

**Files:**
- `src/lib/jobs/quality/layoff-signals.ts` — RSS parsing + name matching + demotion
- `src/inngest/functions.ts` — `layoffSignalChecker` Inngest function (cron `0 5 * * *`)

**Daily check:**
1. Fetches `https://layoffs.fyi/rss-feed/` RSS feed
2. Parses company names from `<title>` elements (handles CDATA, HTML entities, suffix stripping)
3. Matches against `company.company_name` and `company.canonical_name` using ILIKE
4. Demotes matched companies from `active_hot` to `active` (not dormant — they may still have open roles, just reduce polling frequency)

**Name normalization:** `normalizeCompanyName()` lowercases, strips suffixes (Inc, LLC, Ltd, Corp, etc.), removes punctuation. `namesMatch()` checks exact match after normalization or substring containment.

**Tests:** `src/lib/jobs/quality/__tests__/layoff-signals.test.ts` (20 tests)

#### 4.7.5 Q5: Multi-Intent Fusion Scoring `[Status: Implemented]`

**Schema changes:**
- `company.fusion_score` column (integer, default 1) — migration `0031_q5_fusion_score.sql`
- New table: `company_discovery_sources` — tracks which sources discovered each company

```typescript
export const companyDiscoverySources = pgTable("company_discovery_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull().references(() => company.id, { onDelete: "cascade" }),
  discoverySource: discoverySourceEnum("discovery_source").notNull(),
  discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
}, (table) => ({
  uniqueCompanySource: uniqueIndex("company_discovery_sources_unique").on(table.companyId, table.discoverySource),
}));
```

**Files:**
- `src/db/schemas/jobs/companyDiscoverySources.ts` — Drizzle schema
- `src/lib/jobs/quality/fusion-score.ts` — `recordDiscoverySource()`, `getDiscoverySources()`, `hasBeenDiscoveredBy()`
- `src/lib/jobs/seeders/slugger.ts` — Integrated into `finalizeResolution()` — after company insertion or duplicate detection, calls `recordDiscoverySource()`

**How it works:**
1. When the Slugger resolves a company, it calls `recordDiscoverySource(companyId, source)`
2. The function tries to insert a new `(companyId, discoverySource)` row into `company_discovery_sources`
3. If the insert succeeds (new source for this company), `fusion_score` is incremented
4. If the insert fails (unique constraint — source already recorded), `fusion_score` is NOT incremented (prevents double-counting)
5. High-fusion companies (discovered by HN + YC + VC portfolio, etc.) get priority for polling

**Tests:** `src/lib/jobs/quality/__tests__/fusion-score.test.ts` (7 tests)

#### 4.7.6 Inngest Function Registration

All Sprint 2 functions are registered in `src/app/api/inngest/route.ts`:

| Function | ID | Cron | Purpose |
|----------|-----|------|---------|
| `qualityFlywheelRecalc` | `quality-flywheel-recalc` | `0 4 * * *` | Q2: Daily quality score recalculation + tier promotion/demotion |
| `layoffSignalChecker` | `layoff-signal-checker` | `0 5 * * *` | Q3: Daily layoff signal check + demotion |

The tier recalc (`tierRecalc`, `0 4 * * *`) runs at 04:00 UTC. The quality flywheel (`qualityFlywheelRecalc`, `30 4 * * *`) now runs at 04:30 UTC — staggered 30 minutes after tierRecalc to avoid race conditions on the `company.tier` column (Sprint 3 Task 8). The layoff checker runs at 05:00 UTC, after both have completed.

#### 4.7.7 Sprint 3 — Production Hardening `[Status: Implemented — June 30 2026]`

Ten hardening tasks implemented addressing production stability and reliability issues. See `CORPUS_EXPANSION_HANDOFF.md` "Sprint 3 Hardening" section for the full task specifications and completion report.

**G8 (Aggressive Job Cleanup):** New `aggressiveCleanup` Inngest function (cron `0 2 * * *`) deletes terminal-state jobs (rejected >1d, gone >7d, normalization_failed >7d), archives old match_queue rows (approved/rejected >90d), deletes old ingestion_log entries (>30d) and exhausted slugger_retry entries. New `vacuumAnalyze` function (cron `0 2 * * 0`) for weekly dead tuple reclamation. Files: `src/lib/jobs/poller/cleanup-queries.ts`.

**Gate 2 Threshold Tuning:** `GATE2_MAX_COSINE_DISTANCE` in `src/lib/jobs/matching-config.ts` is now env-configurable via `process.env.GATE2_MAX_COSINE_DISTANCE` (default lowered from 0.48 to 0.50). Tunable without redeploy.

**B1 Workable Slug Fix:** `validateWorkableSlug()` in `src/lib/jobs/seeders/batch-sources/workable-meta-search.ts` — fast-path HEAD request to Workable widget API. Invalid slugs route through `resolveSlugger({ insertCompany: true })`.

**Circuit Breakers:** New `source_health` table (migration `0032_source_health.sql`) — tracks per-source `consecutiveFailures`, `lastSuccessAt`, `lastFailureAt`, `status` (active/degraded/disabled). All 22 source Inngest functions wrapped with check-health/record-success/record-failure steps. Auto-degrades at 3 consecutive failures, hard shutdown at 5. Files: `src/db/schemas/jobs/sourceHealth.ts`, `src/lib/jobs/source-health.ts`.

**Batch Source Refresh Crons:** B1 (monthly `0 0 1 * *`), B3/B7 (quarterly `0 0 1 */3 *`), B4/B5/B9 (monthly), B10 (weekly `0 0 * * 1`). Batch sources now refresh periodically, not just flush-once.

**Slugger Retry Processor:** New `sluggerRetryProcessor` Inngest function (cron `0 0 * * 1`) — retries failed Slugger resolutions with exponential backoff (7d→14d→28d), max 3 retries. Files: `src/lib/jobs/seeders/slugger-retry-processor.ts`.

**Brave Search API (replaces Google CSE):** New `brave-search.ts` seeder. D1/B2 Inngest functions replaced. Old Google CSE functions removed from route registration. `google-cse.ts` marked deprecated (extraction functions still reused by brave-search.ts). Env var: `BRAVE_SEARCH_API_KEY`.

**pendingQueueSweep Reduced:** Cron changed from `0,15,30,45 * * * *` (2,880 runs/mo) to `0,30 * * * *` (1,440 runs/mo) — halves Inngest execution cost.

**Q5 Fusion Score Backfill:** `insertDiscoveredCompanies` in `src/lib/jobs/seeders/company-repository.ts` now calls `recordDiscoverySource()` after direct inserts. Backfill script: `scripts/backfill-fusion-scores.ts` (supports `--dry-run`, `--limit`, `--source`).

**Verification:** 1,441 tests pass (70 files), 0 TS errors, 1 new migration (0032). 65 new tests across 4 new test files.

#### 4.7.8 Sprint 4 — Hardening + Observability + Admin Dashboard `[Status: Implemented — June 30 2026]`

Eight tasks implemented across two sub-sessions (Sprint 4 + Sprint 4b). See `CORPUS_EXPANSION_HANDOFF.md` "Sprint 4 Hardening" and "Sprint 4b — Admin Interactivity" sections for full task specifications and completion reports.

**SmartRecruiters Tier 1 Enrichment:** `extractJobContent` for SmartRecruiters in `src/lib/jobs/job-normalizer.ts` now synthesizes a pseudo-description from metadata fields (title + department + employment type + location + company name) instead of title-only. Zero API cost — uses fields already present in the list endpoint response.

**crt.sh Batch Seeder (B8):** New `src/lib/jobs/seeders/batch-sources/crt-sh.ts` — queries Certificate Transparency logs via `crt.sh/?q=%25.boards.greenhouse.io&output=json` for historical ATS domain discoveries. Extracts company slugs from certificate common names. Replaces disabled Rapid7 FDNS. Monthly refresh cron (`0 0 1 * *`). `batchSourceB8CrtSh` Inngest function with circuit breaker.

**VC Portfolio Expansion (B4):** `VC_PORTFOLIO_SOURCES` in `src/lib/jobs/seeders/batch-sources/vc-portfolios.ts` expanded from 53 to 76 entries. Added European VCs (Cherry Ventures, Earlybird, Speedinvest, Project A, La Famiglia, b2venture, Heartfelt, btov, Connexa, InReach, Kizoo, Molten), APAC VCs (Peak XV, Jungle, Monk's Hill, Beenext, Qualgro, Ananta, Gateway, Helion), and niche/vertical VCs (Lux Capital, Obvious, Congruent, Energy Impact Partners, Engine Ventures, E14 Fund, Ridge, Bowery, Social Capital, G2 Venture Partners, Powerhouse, Amity).

**Newsletter Expansion (B5):** `NEWSLETTER_SOURCES` in `src/lib/jobs/seeders/batch-sources/newsletter-archives.ts` expanded from 5 to 14 entries. Added Frontend Focus, Ruby Weekly, Go Weekly, Postgres Weekly, iOS Dev Weekly, Python Weekly, PyCoder's Weekly, DevOps Weekly, Kubernetes Weekly, Android Weekly, TLDR Newsletter.

**Pre-Flight Storage Check:** New `src/lib/jobs/storage-check.ts` module — `getDatabaseSizeMb()` queries `pg_database_size()`, `isStorageSafeForRefresh()` returns false if storage > 450MB (88% of 512MB Neon free tier limit). Integrated as `check-storage` step in all 9 batch source Inngest functions — skips refresh and logs warning if storage is near limit.

**Admin Dashboard — Infrastructure Health:** `src/components/admin/InfrastructureHealth.tsx` Server Component — displays Neon storage usage (current/limit/percentage, color-coded), Gate 2 threshold, and source health table with circuit breaker status per source. Data fetched via `src/lib/jobs/admin-queries.ts` (`getInfraStats`, `getAllSourceHealth`).

**Admin Dashboard — Matching Funnel:** `src/components/admin/MatchingFunnel.tsx` Server Component — displays funnel analysis (total jobs → Gate 0 passed → Gate 1+2 candidates → Gate 3 approved → approval rate), tier distribution, quality score distribution, fusion score distribution, top companies by quality, and purge candidates. Data fetched via `src/lib/jobs/admin-queries.ts` (`getFunnelStats`, `getTierDistribution`, `getQualityScoreDistribution`, `getFusionScoreDistribution`, `getTopCompaniesByQuality`, `getPurgeCandidates`).

**SmartRecruiters Tier 2 Selective Detail Fetch:** New `src/lib/jobs/poller/smartrecruiters-detail.ts` — `enrichSmartRecruitersJobs()` fetches the detail endpoint (`/v1/companies/{slug}/postings/{postingId}`) only for jobs where the Tier 1 pseudo-description is < 100 chars, capped at 10 fetches per poll cycle. Best-effort — failures are non-fatal (Tier 1 data is kept). Integrated into `phalanx-poller.ts` AFTER Gate 0 filtering to avoid wasting API calls on rejected jobs. `smartRecruitersJobDetailSchema` added to `ats-schemas.ts`. `job-normalizer.ts` SmartRecruiters case updated to extract full description from `jobAd.sections` when present (Tier 2), falling back to Tier 1 synthesis.

**Alerting System:** New `alerts` table (migration `0033_alerts.sql`) with `alert_type` enum (`storage_near_limit`, `storage_critical`, `schema_validation_spike`, `circuit_breaker_trip`, `pipeline_health` [Sprint 7]) and `alert_severity` enum (`info`, `warning`, `critical`). `src/lib/jobs/alerting.ts` module with `createAlert`, `hasActiveAlert`, `resolveAlert`, `resolveAlertsByType`, `getActiveAlerts`, `getRecentAlerts`, `checkStorageAlerts`, `checkSchemaValidationAlerts`, `createCircuitBreakerAlert` — all with deduplication via `hasActiveAlert`. `dailyHealthCheck` Inngest function (cron `0 6 * * *`) runs storage + schema validation checks. Circuit breaker integration in `source-health.ts` auto-creates `circuit_breaker_trip` alerts on source disable. Schema validation monitoring queries `ingestion_log` for `error_message LIKE '%Zod validation failed%'` and alerts on failure rate > 20% over 60 minutes. **Sprint 7 addition:** `pipeline_health` alert type added (migration `0034`) for the `pipelineHealthMonitor` function — see §4.7.10.

**Admin Interactivity (Sprint 4b):** New `src/actions/admin.ts` Server Actions — `disableSourceAction`, `enableSourceAction`, `resolveAlertAction`, `resolveAlertsByTypeAction` with `requireRole("admin")` auth checks, Zod input validation, `revalidatePath("/dashboard/admin")` on success, and `resolvedBy` audit trail (`admin:{email}`). New `src/components/admin/AlertResolveButton.tsx` client component using `useTransition` — renders "Resolve" button per alert with loading state. New `src/components/admin/SourceToggleButton.tsx` client component — shows "Enable" for disabled sources, "Disable" for active/degraded, with loading state. Admin sidebar navigation fixed in `DashboardSidebarNav.tsx` — "Admin" now links to `/dashboard/admin` with "Dashboard" and "Users" sub-items.

**Verification:** 1,564 tests pass (78 files), 0 TS errors, 1 new migration (0033). 123 new tests across 8 new test files. 3 pre-existing Biome warnings (Sprint 1 files, require `--unsafe` to fix).

#### 4.7.9 Sprint 5 — Inngest Self-Hosting Migration `[Status: Implemented — June 30 2026]`

Migrated Inngest operations from Inngest Cloud (free plan: 5 concurrent steps, 50K executions/month) to self-hosted Inngest on the existing Hetzner CX33 / Coolify v4.1.2 infrastructure. This is primarily a deployment and configuration task — the only code change is a one-line improvement to `src/instrumentation.ts`.

**Self-Hosted Architecture:** Three-container Docker Compose service deployed via Coolify REST API (`POST /api/v1/services` with base64-encoded `docker_compose_raw`):
- **Inngest server** (`inngest/inngest:v1.34.0`) — Event API, Runner, Queue, Executor, Dashboard, GraphQL API. Ports 8288 (API + Dashboard) and 8289 (Connect WebSocket). Healthcheck: `inngest alpha doctor healthcheck`.
- **PostgreSQL** (`postgres:17`) — Persistence for event history, function definitions, apps, run results. Internal only (port 5432). Healthcheck: `pg_isready`.
- **Redis** (`redis:7`) — Queue + state store for runs. Internal only (port 6379). Healthcheck: `redis-cli ping`.

**Coolify Service:** UUID `otrzmmwzdh8z6hcg5at9yi03`, name `inngest`, FQDN `https://inngest.vectormatch.dev` (routed via Cloudflare wildcard `*.vectormatch.dev` → Traefik v3.6.21 → Inngest container). Service env vars: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (hex, 64 chars), `INNGEST_POSTGRES_PASSWORD` — referenced via `${...}` substitution in the compose file. Status: `running:healthy`.

**VectorMatch App Configuration:** Updated 4 env vars via Coolify REST API (`PATCH /api/v1/applications/{uuid}/envs/bulk` — upsert by key):
- `INNGEST_BASE_URL` = `https://inngest.vectormatch.dev` (new — runtime only)
- `INNGEST_EVENT_KEY` = (self-hosted event key, overwrote Cloud key)
- `INNGEST_SIGNING_KEY` = (self-hosted signing key, overwrote Cloud key)
- `INNGEST_SERVE_ORIGIN` = `https://vectormatch.dev` (unchanged — was already set)
- `INNGEST_DEV` = unset (production mode — no action needed)

**Auto-Sync:** `src/instrumentation.ts` sends a `PUT` to `{INNGEST_SERVE_ORIGIN}/api/inngest` 5 seconds after server startup. After redeploy, the Inngest SDK's serve handler pushed all 45 function definitions to the self-hosted server. Log confirmed: `[instrumentation] Inngest sync successful: 200 {"message":"Successfully registered","modified":true}`.

**Event API:** Events are sent to `POST /e/{INNGEST_EVENT_KEY}` (event key in URL path, not Authorization header). The Inngest SDK handles this automatically via `INNGEST_BASE_URL` + `INNGEST_EVENT_KEY`. The `/v1/events` endpoint is the REST API for *listing* events (GET, requires signing key auth), not for sending.

**Code Change — instrumentation.ts Fallback:** The `INNGEST_SERVE_ORIGIN` fallback was improved to use `NEXT_PUBLIC_SITE_URL` as a secondary fallback before `http://localhost:3000`:
```typescript
const baseUrl =
  process.env.INNGEST_SERVE_ORIGIN ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "http://localhost:3000";
```
This ensures the auto-sync works in production even if `INNGEST_SERVE_ORIGIN` is not explicitly set, since `NEXT_PUBLIC_SITE_URL` is always set in production.

**Verification:** App registered in Inngest dashboard (functionCount=45, SDK v4.8.0, framework nextjs, sync URL `https://vectormatch.dev/api/inngest`). All 45 functions visible via `GET /v2/apps/vectormatch/functions?limit=100` (40 cron triggers, 16 event triggers). Test event `poller/run` accepted via `POST /e/{EVENT_KEY}` (ID `01KWD5GYBTM25S3F1BNRJ7SZ63`), triggered function run `01KWD5GYJ4RCS6N0FTCTC6M8JY` → status `Completed` in 433ms. VectorMatch app `running:healthy`. 1,584 tests pass (83 files), 0 TS errors in changed file, 0 new migrations. Inngest Cloud project kept active for 48h rollback window.

#### 4.7.10 Sprint 7 — Pipeline Activation & Monitoring `[Status: Implemented — July 1 2026]`

Eight tasks implemented to fix a critical production issue (2,006 new jobs detected but not normalized/embedded, zero new matches for 32 hours) and establish comprehensive pipeline monitoring. The root cause was a combination of three bugs: (1) `batchPollTier`'s monolithic `poll-batch` step polled 100 companies sequentially with no fetch timeout — one hanging ATS endpoint stalled the entire batch, and Inngest retries reset progress to zero; (2) `source_health` recording used UPDATE-only instead of UPSERT, leaving the table permanently empty; (3) `normalizationRetrySweep` only processed `normalization_failed` jobs, missing jobs that were never normalized at all.

**Task 1+7+3 (CRITICAL — batchPollTier refactor):** The `batchPollTier` function (`src/inngest/functions.ts`) no longer performs inline normalization. New flow:
1. `get-batch` step: Query up to 100 companies for the tier (unchanged).
2. `poll-chunk-N` steps: Poll companies in `POLL_CHUNK_SIZE` (10) sub-batches, each its own `step.run()`. Inngest checkpoints each completed chunk — if a later chunk times out and the function retries, already-completed chunks are NOT re-run, so progress accumulates monotonically instead of resetting to zero.
3. `find-unnormalized` step: Query the DB for unnormalized jobs from the polled companies (`status = 'active' AND normalizedAt IS NULL` OR `status = 'normalization_failed'`, filtered by `inArray(atsSource, ...)` and `inArray(atsSlug, ...)`). This is a robust fallback that works even when the poll step timed out and retried (jobs already in DB → `newJobIds: []`, but the DB query still finds them as unnormalized). Limited to 500 jobs per run.
4. `emit-job-ingested` step: Emit `job/ingested` Inngest events for all unnormalized jobs. The `jobIngestedHandler` handles normalization + embedding + Gate 1+2 + Gate 3 fan-out. Its idempotency guard (§4.6) ensures already-normalized jobs are skipped, so duplicate events are safe.
5. `write-log` step: Write a `batch_poll` entry to `ingestion_log` for observability (status: `success` or `partial` based on error count).

**Task 2 (CRITICAL — normalizationRetrySweep):** The `normalizationRetrySweep` Inngest function (`src/inngest/functions.ts`, cron `0 6 * * *`) now processes two categories of stuck jobs:
1. `status = 'normalization_failed'` — jobs where the normalizer or LLM fallback threw an error (retryable).
2. `status = 'active' AND normalizedAt IS NULL` — jobs that were detected and inserted but NEVER entered the normalization loop (the batchPollTier timeout/retry failure mode).

Both categories are re-emitted as `job/ingested` events. Limit raised from 50 to 200 jobs per run to handle the backlog. The `jobIngestedHandler` idempotency guard ensures safe re-processing. Files: `src/inngest/functions.ts`.

**Task 4 (HIGH — source_health UPSERT):** `recordSourceSuccess` and `recordSourceFailure` in `src/lib/jobs/source-health.ts` converted from UPDATE-only to UPSERT (`INSERT ... ON CONFLICT (source_name) DO UPDATE`). The previous UPDATE-only implementation silently affected 0 rows on first run (no row existed yet for a new source), leaving the `source_health` table permanently empty — circuit breakers never tripped because there was no row to check. The UPSERT creates the row on first run and updates it on subsequent runs. The `status` field in the ON CONFLICT SET clause uses a `CASE WHEN` to preserve manual disables: `CASE WHEN status = 'disabled' THEN 'disabled' ELSE 'active' END`. Files: `src/lib/jobs/source-health.ts`, `src/lib/jobs/__tests__/source-health.test.ts`.

**Task 5 (HIGH — normalization error logging):** The `jobIngestedHandler` in `src/inngest/functions.ts` now logs normalization failures with `console.error`:
```typescript
console.error(
  `[jobIngestedHandler] Normalization failed for job ${jobId} (atsSource=${decision.job.atsSource}):`,
  normalization.error ?? "unknown error",
);
```
Previously, normalization errors were silently swallowed — making it impossible to diagnose why jobs were failing (e.g. OpenAI API key not set, rate limiting, malformed SmartRecruiters detail data). The error is logged but does NOT change the control flow (the job is still marked `normalization_failed` and remains retryable).

**Task 6 (HIGH — pipeline health monitor):** New `pipelineHealthMonitor` Inngest function (cron `*/30 * * * *` — every 30 min) and admin dashboard component for real-time pipeline monitoring.

*Pipeline Health Metrics* (`src/lib/jobs/pipeline-health.ts`): `getPipelineHealthMetrics()` collects 8 metrics in parallel via `Promise.all`:
| Metric | Query | Alert Threshold |
|---|---|---|
| `unnormalizedJobs` | `count(*) FROM job WHERE status='active' AND normalized_at IS NULL AND detected_at < NOW() - 1h` | > 50 |
| `unembeddedJobs` | `count(*) FROM job WHERE status='active' AND job_embedding IS NULL AND normalized_at IS NOT NULL` | > 50 |
| `companiesPolled4h` | `count(*) FROM company WHERE last_polled_at > NOW() - 4h` | = 0 (stale poller) |
| `matches24h` | `count(*) FROM match_queue WHERE created_at > NOW() - 24h` | = 0 (no matches) |
| `sourceHealthRows` | `count(*) FROM source_health` | = 0 (empty) |
| `dbSizeMb` | `pg_database_size()` via `getDatabaseSizeMb()` | > 450 MB |
| `pendingMatchesStale` | `count(*) FROM match_queue WHERE status='pending' AND created_at < NOW() - 30min` | > 10 |
| `normalizationFailed` | `count(*) FROM job WHERE status='normalization_failed' AND normalized_at IS NULL` | (informational) |

`evaluateAlerts(metrics)` returns an array of alert message strings for any metrics that breach their thresholds. The `pipelineHealthMonitor` function creates a deduplicated `pipeline_health` alert (severity: `warning`) when any alerts are present, and auto-resolves it when all metrics return to healthy ranges. Uses `resolveAlertsByType("pipeline_health")` + `createAlert()` to update the existing alert's message on each run.

*Admin Dashboard Component* (`src/components/admin/PipelineHealthMonitor.tsx`): Server Component that calls `getPipelineHealthMetrics()` directly and renders a grid of metric cards with color-coded status indicators (healthy/warning/critical). Integrated into the admin dashboard page (`src/app/dashboard/admin/page.tsx`) alongside `InfrastructureHealth` and `MatchingFunnel`.

**HTTP Fetch Timeout:** New `src/lib/jobs/poller/fetch-with-timeout.ts` utility — wraps any injectable `FetchFn` call with an `AbortController`-based timeout (default 10s). A timeout surfaces as a normal `AbortError`, which the existing try/catch blocks in `ats-adapters.ts` and `smartrecruiters-detail.ts` already treat as a recoverable ("network"/failed) result. Integrated into:
- `ats-adapters.ts` — `fetchJobsFromAts` uses `fetchWithTimeout(fetchFn, url)` for the jobs-list fetch.
- `smartrecruiters-detail.ts` — detail fetches use `fetchWithTimeout(fetchFn, url)` for the per-posting detail endpoint.

This prevents a single unresponsive ATS endpoint from blocking the entire `batchPollTier` sequential poll loop indefinitely.

**Ingestion Log Helper** (`src/lib/jobs/poller/ingestion-log.ts`): New `writeIngestionLog()` function — fire-and-forget insert into the `ingestionLog` table. Used by `batchPollTier` and `normalizationRetrySweep` for observability. Types: `IngestionLogType` (`seed | poll | batch_poll | tier_recalc | stale_cleanup`), `IngestionLogStatus` (`success | partial | failed`). Log write failures are swallowed (observability is best-effort — never crashes the pipeline).

**Migration 0034** (`src/db/migrations/0034_sprint7_enum_additions.sql`): Adds two enum values:
- `batch_poll` to `ingestion_log_type` — for `batchPollTier` ingestion log entries.
- `pipeline_health` to `alert_type` — for pipeline health monitor alerts.

Both are additive `ALTER TYPE ... ADD VALUE IF NOT EXISTS` — no data loss, no downtime.

**Verification:** 1,594 tests pass (84 files), 0 TS errors, 1 new migration (0034). 30 new tests across 3 new test files (`pipeline-health.test.ts`, updated `source-health.test.ts`, `fetch-with-timeout` tests). Biome clean. Production health check confirmed: app `running:healthy`, Inngest server `running:healthy`, `source_health` UPSERT fix verified (1 row now exists that wouldn't have under old code), DB storage stable at 136MB/512MB.

**Production deployment note:** The `batchPollTier` chunking fix and `fetchWithTimeout` are the critical changes — without them, the pipeline makes near-zero progress per cron cycle (observed: ~3-6 companies polled per 3h cycle vs. 100 target). After deploying these fixes, the next `batchPollTier` cron fire should make real progress, and `SELECT count(*) FROM ingestion_log WHERE type='batch_poll'` should be non-zero.

#### 4.7.11 Sprint 8 — Match Delivery Fix & Bulk Reprocessing `[Status: Implemented — July 1 2026]`

Ten tasks implemented to fix the broken matching pipeline. Despite successfully ingesting 9,637 companies and 9,126 active jobs, only 62 matches existed (1 approved, 61 rejected) — the same as before the corpus expansion campaign. Root cause: 6 distinct issues identified via live DB funnel analysis.

**Task 1 (CRITICAL — Bulk Reprocessing):** New `matchBulkReprocess` Inngest function (`src/inngest/functions.ts`, event-triggered via `match/bulk-reprocess`, concurrency limit 1). Queries active+embedded jobs NOT in match_queue (LIMIT 1000 to stay under Inngest response body size limit), processes in batches of 25 with parallel `Promise.all` Gate 1+2 calls, fans out Gate 3 events per batch inside the step (avoids returning large arrays in step response). Admin dashboard "Run Bulk Reprocess" button (`BulkReprocessButton.tsx`) triggers via `triggerBulkReprocess` Server Action in `src/actions/admin.ts`. Uses raw SQL array literal for UUID batch queries (Drizzle's parameterized array binding doesn't work with `ANY()` — expands to record type, not array).

**Task 2a (Normalization Retry Limit):** `normalizationRetrySweep` limit raised from 200 to 500 jobs/run to clear the 4,083-job unnormalized backlog faster.

**Task 3 (Cross-Posting Dedup Relaxed):** Gate 1+2 dedup clause in `src/lib/jobs/gate-1-2.ts` now blocks only `approved` matches (added `AND mq.status = 'approved'` to the NOT EXISTS subquery). Previously blocked ALL matches including rejected ones — a job rejected for Persona A was never evaluated for Persona B. This was blocking 12 valid candidate pairs.

**Task 4 (Workplace Pre-Filter Removed):** Removed `workplace_type` vs. `assignment_types` pre-filter from Gate 1+2 in `src/lib/jobs/gate-1-2.ts`. Previously blocked 113 of 198 candidate pairs (74 on-site + 39 hybrid) before Gate 3 could evaluate them. Gate 3 (LLM) now makes the final determination.

**Task 5 (Gate 3 Prompt Tuned):** All 3 prompt variants in `src/lib/jobs/gate-3.ts` updated with: international contractor guidance (W-8BEN compliance context — "US only" remote jobs may accept international contractors), hybrid as soft concern (not auto-reject), and balanced approach (replaced "be conservative" bias that contributed to 1.6% approval rate).

**Task 6 (Periodic Re-Matching Sweep):** New `matchRetrySweep` Inngest function (cron `0 7 * * *` — daily 07:00 UTC). Catches jobs missed by normal pipeline — queries active+embedded jobs older than 1h with no match_queue entry (via persona JOIN for tag overlap), processes in batches of 25 with parallel Gate 1+2. Uses `SELECT DISTINCT j.id, j.detected_at` (detected_at in select list for ORDER BY compatibility with DISTINCT).

**Task 7 (Match Monitoring Metrics):** Added 4 new metrics to `src/lib/jobs/pipeline-health.ts`:
| Metric | Query | Alert Threshold |
|---|---|---|
| `approvedMatches24h` | `count(*) FROM match_queue WHERE status='approved' AND created_at > NOW() - 24h` | < 5 (LOW_APPROVAL_RATE) |
| `gate3ApprovalRate7d` | `approved / total WHERE evaluated_at > NOW() - 7d` | < 0.02 (2%) |
| `unmatchedEmbeddedJobs` | `count(DISTINCT j.id) FROM job j JOIN persona p ON tag overlap WHERE j.active+embedded AND NOT EXISTS match_queue` | > 100 |
| `avgGate3Confidence` | `avg(llm_confidence) FROM match_queue WHERE evaluated_at > NOW() - 7d` | (informational) |

Updated `PipelineHealthMonitor.tsx` with new metric cards and alert display.

**Task 8 (Verification Tests):** New test files: `gate-1-2.test.ts` (relaxed dedup, no workplace filter), `gate-3.test.ts` (prompt tuning, international contractor guidance), `pipeline-health.test.ts` (new metrics), `parse-vector.test.ts` (vector string parsing utility).

**Task 9 (personaUpdatedHandler Enhanced):** `personaUpdatedHandler` in `src/inngest/functions.ts` now emits a `match/bulk-reprocess` event after re-evaluating rejected matches — triggers bulk reprocess for new jobs that were never matched against the updated persona.

**Task 10 (Rejection Pattern Analysis):** New queries in `src/lib/jobs/admin-queries.ts` (`getRejectionPatternAnalysis`, `getApprovalRateByPromptVariant`, `getApprovalRateByPersona`, `getApprovalRateByAtsSource`). New `RejectionPatternAnalysis.tsx` admin dashboard component with reusable `ApprovalRateTable` sub-component.

**SQL Fixes (post-deploy):**
1. `SELECT DISTINCT ... ORDER BY` incompatibility — removed unnecessary `DISTINCT` from `matchBulkReprocess` query (no JOIN, so no duplicates). Added `j.detected_at` to select list for `matchRetrySweep` (DISTINCT needed due to persona JOIN).
2. `cannot cast type record to uuid[]` — replaced Drizzle parameterized array `${batchIds}::uuid[]` with raw SQL array literal `ARRAY[...]::uuid[]` using `sql.raw()`. Drizzle expands JS arrays into individual params `($1, $2, ...)` which Postgres treats as a record type, not an array.
3. **Performance:** Parallelized Gate 1+2 calls within batches using `Promise.all` — reduced bulk reprocess runtime from ~41 min (sequential) to ~3-5 min (parallel, limited by Neon connection pool).

**Verification:** 1,623 tests pass (86 files), 0 TS errors, 0 new migrations. Biome clean.

#### 4.7.12 Sprint 9 — Storage Monitoring, Gate 0.5, Work Authorization & WAL Protection `[Status: Implemented — July 4 2026]`

Six critical changes implemented across storage monitoring, matching pipeline, and emergency purge. These address a Neon synthetic storage alert, three geo-fencing false positive patterns, and work authorization compliance.

**Gate 0.5 Geo-Fencing Pre-Filter:** New hard-blocker pre-filter (`src/lib/jobs/gate-zero-pre-filter.ts`) inserted between normalization (Step 1) and Gate 1+2 routing (Step 2) in `jobIngestedHandler`. Catches three geo-fencing patterns that the 3-Gate funnel could not detect:
1. **Title region tags** — Companies embed regional restrictions in job titles (e.g., "Software Engineer - Latam"). The location field says "Remote" but the title geo-fences to a region excluding the applicant.
2. **Location country lists** — Some jobs list specific allowed countries in the location field (e.g., "Mexico, Argentina, Colombia, India"). The applicant's country is not on the list.
3. **No remote designation** — Greenhouse jobs with a location name but no remote/hybrid keywords were classified as `workplaceType = null`. In reality, absence of remote designation = on-site at the stated location.

Five checks run in priority order (see §5.1.5 for full table). Checks 4-5 (compensation, experience) are soft-fail-open — only fire when both job and applicant data are available. Migration 0039 adds 8 columns to `job` and 2 columns to `applicant`. Full design in `docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md`.

**Work Authorization Filtering + Risk Flagging:** New `applicant.workAuthorizations` (text array) and `matchQueue.workAuthRiskFlag` (boolean) columns (migration 0040). Gate 3 LLM now checks job work-auth requirements against the applicant's permits — hard blocker if required permit is missing. Supported permits: `eu_citizen`, `rwr_card_plus`, `blue_card_eu`, `uk_settled`, `uk_pre_settled`, `us_green_card`, `us_citizen`, `canadian_pr`, `swiss_permit_c`, `other_permit`. A dynamic Work Authorization Directive is injected into the prompt when the applicant has permits set. The `workAuthRiskFlag` is set to `true` when the JD is silent on work auth but the role is hybrid/single-country-remote (not global) — warns the user to verify before applying. See §5.3 for full implementation details.

**Neon API Integration for Storage Monitoring:** New `src/lib/jobs/neon-api.ts` module fetches `synthetic_storage_size` from the Neon API — the enforced storage limit, which is ~12% larger than `pg_database_size()` because it includes WAL, history retention, and Neon overhead. Dual-threshold strategy:
- **Hot-path ingestion guard** (`storage-check.ts`): Uses `pg_database_size()` with `STORAGE_LIMIT_MB = 460` (safety margin below 512 MB hard limit) — fast, no external API call.
- **Hourly storage monitor** (`hourlyStorageMonitor` Inngest function): Uses Neon API `synthetic_storage_size` with the true 512 MB limit — accurate, runs hourly with a 60s Next.js cache.

New env vars: `NEON_API_KEY`, `NEON_PROJECT_ID`. The Neon API endpoint is `GET https://console.neon.tech/api/v2/projects/{projectId}` with a Bearer token, returning `project.data.stores[0].size * 1024 * 1024` (bytes → MB).

**Simplified Storage Alerting:** Removed unnormalized backlog checks and email notifications from `checkStorageAlerts()` in `src/lib/jobs/alerting.ts`. Alerts now create database records only (no email), focused solely on storage percentage. Thresholds: warning at 80%, critical at 88% of `STORAGE_LIMIT_MB`. Backlog monitoring is handled by the separate `pipelineHealthMonitor` Inngest function (Sprint 7). This simplification reduces alert noise and eliminates the need for `ADMIN_ALERT_EMAIL` in storage alerts.

**WAL Inflation Protection in Emergency Purge:** The `runEmergencyPurge` function (`src/lib/jobs/poller/cleanup-queries.ts`) was enhanced to detect and abort when DELETE operations generate more WAL than they reclaim. This prevents a "death spiral" where aggressive purging exacerbates the storage problem:
- **WAL inflation detection:** Storage is measured before and after each batch. If `synthetic_storage_size` increases for `PURGE_MAX_WAL_INFLATION_BATCHES = 2` consecutive checks, the purge aborts immediately with a specific alert message.
- **`active_fifo` batch size reduced:** `PURGE_ACTIVE_FIFO_BATCH_SIZE` reduced from 1000 to 500 to limit per-batch WAL generation in the last-resort tier.
- **Recovery threshold corrected:** Recovery checks now use `STORAGE_LIMIT_MB` (460 MB) instead of the hardcoded 512 MB — the purge should stop when storage drops below the safety margin, not the hard limit.
- **Per-batch VACUUM (July 2026 fix):** VACUUM ANALYZE runs after each batch within a tier (not just between tiers). Without this, `pg_database_size()` still counts dead tuples as used space, and the recovery check at the top of the loop never fires within a tier — causing a false "not recovered" result even though actual storage dropped well below the threshold. This was the root cause of a misleading production alert that said "still above recovery threshold" when storage was actually at 35.2% (162MB / 460MB).
- **Alert messages updated:** Storage alert emails and database records now reference `STORAGE_LIMIT_MB` and include specific messages for WAL inflation abort vs. normal purge completion.

**Active FIFO Corpus Protection (July 2026):** The `active_fifo` last-resort tier received three safeguards to prevent a corpus wipe scenario discovered in production — when Gate 3 was broken (zero approved matches), the purge had no restraint and deleted the entire active corpus (3000 jobs) in a single run:
1. **48h age protection** (`PURGE_ACTIVE_FIFO_MIN_AGE_HOURS = 48`): Jobs younger than 48 hours are excluded from the FIFO tier. Newly ingested jobs deserve a chance to be normalized, embedded, and matched before being purged. Without this, a storage emergency right after a large poll burst would delete jobs that the normalizer hasn't even processed yet.
2. **Normalized-only filter:** The `purgeActiveFifo` SQL now requires `normalized_at IS NOT NULL AND raw_json IS NULL`. Jobs still carrying `raw_json` (~25KB each) are in the normalizer's queue, not the purger's — deleting them destroys data that the normalizer would have pruned (raw_json → normalizedText, 80% size reduction) and matched. This decouples the purge from the unnormalized backlog: the backlog threshold (`MAX_UNNORMALIZED_BACKLOG = 3000`) pauses ingestion, while the purge only targets jobs that have already been through the normalizer.
3. **Corpus percentage guard** (`PURGE_ACTIVE_FIFO_MAX_CORPUS_FRACTION = 0.2`): At most 20% of the active corpus can be deleted by the `active_fifo` tier in a single purge run. The orchestrator calls `countActiveJobs()` at the start to calculate the budget (`activeCorpusAtStart × 0.2`). If cumulative `active_fifo` deletions exceed this budget, the purge aborts with `corpusGuardTriggered = true` and a "Corpus percentage guard" stop reason. The alert email includes the budget and corpus size. If storage can't be recovered within the 20% budget, the purge surfaces a "cannot recover without major data loss" alert instead of silently destroying the corpus.

**Emergency Purge Button:** Admin dashboard `EmergencyPurgeButton.tsx` component triggers the purge manually via `triggerEmergencyPurge` Server Action. Shows confirmation dialog with tier descriptions before executing.

**Migrations:**
- `0039_reflective_caretaker.sql` — Gate 0.5 metadata: 8 job columns + 2 applicant columns + `job_title_region_tag_idx` index.
- `0040_lazy_freak.sql` — Work authorization: `applicant.work_authorizations` (text array) + `match_queue.work_auth_risk_flag` (boolean).

**Verification:** 1,761 tests pass (90 files), 0 TS errors, 2 new migrations (0039, 0040). Biome clean. New test files: `gate-zero-pre-filter.test.ts`, `neon-api.test.ts`, updated `storage-check.test.ts`, `alerting.test.ts`, `admin-queries.test.ts`, `cleanup-queries.test.ts` (including per-batch VACUUM regression test and corpus percentage guard test).

#### 4.7.13 Sprint 10 — Corpus-Persona Alignment `[Status: Implemented — July 7 2026]`

Thirteen tasks implemented to align the job corpus with the mission of serving frontend/web developers seeking remote startup roles. Company registry grew from 5,290 to 10,114 companies. Full session report at `docs/reports/CORPUS_ALIGNMENT_SESSION_HANDOFF.md`.

**P1-1 (Employee Count Backfill):** New `scripts/backfill-employee-count.ts` populates `company.employee_count` for YC-sourced (default 30) and VC-sourced (default 100) companies. 1,431 companies updated. Applied before P0-1 to ensure correct company scoring. Supports `--dry-run` and `--apply` flags.

**P0-1 (Company Scorer Backfill):** New `src/lib/jobs/company-scorer.ts` computes `company_size_score` from 5 signals:
1. **Employee count** (`scoreEmployeeCount`): >5000 → -25, 1000-5000 → -15, 250-1000 → -5, 50-250 → 0, 20-50 → +15, <20 → +25. Null → 0.
2. **Agency/aggregator** (`scoreAgency`): `isAgency = true` → -40 (+ tier=dead override).
3. **Public listing** (`scorePublicListing`): `isPublic = true` → -20.
4. **Source origin** (`scoreSourceOrigin`): YC/VC/github_probe/funding_signal/frontend_job_scanner → +15, workable_meta_search → +10, hn_algolia/hn_custom_url → +5, other → 0.
5. **Maturity** (`scoreMaturity`): DISABLED (returns 0) — `discoveredAt` is not a valid company-age proxy. Retained for re-enablement when a `founded_date` column is added.

Score clamped to [-0.30, +0.30]. Tier assignment: score > 15 → `active_hot`, score < -20 → `dormant`, agency flag → `dead` (override). Helper functions `resolveEmployeeCount()` and `resolveIsPublic()` fall back to `src/lib/jobs/company-enrichment/big-tech-registry.ts` (30+ big-tech companies with known employee counts + public listing status, including 6 defense companies added for demotion).

**4 Scorer Bugs Fixed:**
1. `scoreMaturity()` was active but `discoveredAt` is not a valid age proxy → disabled.
2. `resolveEmployeeCount()` and `resolveIsPublic()` missing `atsSlug` fallback for big-tech registry lookup → added.
3. `applyCompanyTier()` didn't allow demotion to `active` → updated.
4. 6 defense companies (Lockheed Martin, Raytheon, BAE Systems, etc.) missing from big-tech registry → added for demotion.

Backfill applied via `scripts/backfill-company-scores.ts --apply`: 932 → `active_hot`, 9,126 → `active`, 36 → `dormant`, 2 → `dead`. All 10 defense companies demoted as intended.

**P0-3 (Remote-Scope Backfill):** New `scripts/backfill-remote-scope.ts` uses the v2 `src/lib/jobs/remote-scope-extractor.ts` (2-step extraction ladder):
- **Step 1 (Deterministic, zero LLM cost):**
  - 1a: ATS-native `workplaceType` trust path (Lever/Ashby only; Greenhouse skipped due to ~85% miss rate).
  - 1b: Cheerio-based main-content extraction (strips nav/footer/header/aside, targets semantic containers).
  - 1c: Regex hard-signals with confidence-scoring (`HIGH_CONFIDENCE_SIGNALS`, `MEDIUM_CONFIDENCE`, `NEGATIVE_SIGNALS`).
  - 1d: Strip company HQ from scope inference.
  - → High-confidence → accept. Inconclusive → route to Step 2.
- **Step 2 (LLM extraction, gpt-4o-mini):** Structured Zod output `{ remoteScope, allowedCountries, workAuthRequired, confidence }`. `workAuthRequired` extracted but NOT persisted (no consumer). Hard-fail → `undetermined` + `normalization_failed` (retryable).

3,217 jobs classified, ~$0.71 LLM cost. Supports `--dry-run` and `--apply` flags.

**P1-2 (GitHub Events Probe Expansion):** `YC_VC_FUNDED_ORGS` in `src/lib/jobs/seeders/daily-sources/github-events-probe.ts` expanded from 53 to 129 frontend-ecosystem orgs (React, Next.js, Vue, Angular, Svelte, Tailwind, Vite, Remix, Astro, etc.). Requires `GITHUB_TOKEN` env var.

**P1-3 (Brave Search Frontend Queries):** 6 frontend-targeted search queries added to `src/lib/jobs/seeders/batch-sources/brave-search.ts` (React, Next.js, Vue, Angular, Svelte, TypeScript job postings on Greenhouse/Lever/Ashby domains). Requires `BRAVE_SEARCH_API_KEY` env var.

**P2-2 (Frontend Job Scanner):** New daily source `src/lib/jobs/seeders/daily-sources/frontend-job-scanner.ts` scans Greenhouse/Lever/Ashby job boards for frontend-keyword postings via Brave Search. Extracts company slug from URL patterns. Registered as `v2FrontendJobScanner` Inngest function. New `frontend_job_scanner` value added to `discoverySourceEnum` (migration 0045).

**P2-1 (BigQuery Re-run):** `scripts/seed-bigquery.ts` re-run with 6 monthly partitions (Feb-Jul 2026). 3,778 domains found, 448 slugs resolved, 0 new companies inserted (corpus saturated from previous monthly runs). `dotenv.config()` added to script for local execution.

**P0-4 (Backlog Normalization):** `scripts/direct-normalize-backlog.ts` supports `--dry-run`/`--apply` flags. Applied: 1,237 jobs processed in 195s (1,104 normalized, 109 rejected as garbage, 24 failed on >8192 token limit — pre-existing normalizer issue with oversized `rawJson`).

**Circuit Breaker (5-Tier):** New `src/lib/jobs/circuit-breaker.ts` implements a 5-tier action chain:
- **Tier 1:** Per-source early-warning (3 consecutive provisional fails → pause 15min, escalation → 1hr).
- **Tier 2:** Provisional backlog throttle (>15% → rate reduce 50%, >25% → rate reduce 90%, >30% → pause until clear).
- **Tier 3:** Unknown sub-floor guard (≥30% unknown at 3hr → force reclassify; per-source unknown yield ≥40% → force reclassify).
- **Tier 4:** Corpus-ratio breaker (global/(global+country_fenced) < 50% → halt non-global ingestion; reset at <15%).
- **Tier 5:** Daily source ban (3 escalations in 24hr → 24h ban).

Severity stack: `hard_pause` > `rate_reduction` > `normal`. Three-bucket denominator model: known-scope ratio (global / (global + country_fenced)) ≥ 50%, unknown sub-floor (unknown / total) ≤ 30%.

**Migrations:**
- `0041-0044` — `employee_count`, `company_size_score`, `is_agency`, `is_public` columns on `company` table.
- `0045_tidy_hiroim.sql` — `frontend_job_scanner` added to `discovery_source` enum.

**Verification:** 2,260 tests pass (110 files), 0 TS errors, 0 Biome errors. 28 new tests (company-scorer, big-tech-registry, brave-search-frontend, frontend-job-scanner, github-events-probe-orglist). Fallow false positives addressed via `.fallowrc.json` ignoreExports.

#### 4.7.14 Sprint 11 — Ingestion Freshness & Retention Governance `[Status: Implemented — July 2026]`

Post-alignment cleanup session focused on preventing stale/legacy job postings from entering the corpus, surfacing freshness to candidates and admins, and establishing explicit data-retention boundaries.

**Injection Freshness Gate:** New 30-day hard cap in `src/lib/jobs/poller/phalanx-poller.ts` (`MAX_JOB_INJECTION_AGE_DAYS`, default 30). Jobs whose `publishedAt` is older than 30 days are rejected before upsert and reported as `jobsTooOld`. Jobs with `NULL` `publishedAt` are also rejected because all supported ATS sources provide a publish date. This prevents legacy/all-time postings from polluting the corpus. Tests updated in `phalanx-poller.test.ts` to include `first_published`/`releasedDate` in fixtures.

**Active/Closed Status Filtering:** `JobMetadata` now includes `isActive`. Sources that expose explicit status (SmartRecruiters, Recruitee) reject closed/archived/filled/inactive postings. Sources whose public APIs only return live postings by contract (Greenhouse, Lever, Ashby, Workable) are assumed active. Filtering is applied in `phalanx-poller.ts` before the injection freshness gate.

**Detail Enrichment Active-Status Check:** `src/lib/jobs/poller/smartrecruiters-detail.ts` now checks the detail response `status` field and drops jobs reported as closed/archived/filled/etc. before they reach the upsert. `src/lib/jobs/poller/greenhouse-detail.ts` result shape updated to include `droppedInactive: 0` for consistency. The dropped count feeds into the poller's `inactiveCount` metric.

**Age-Based Stale Marking + Hard Delete:**
- `MAX_JOB_AGE_DAYS` is set to 60 days. Active jobs whose `publishedAt` is older than 60 days are marked `stale` by the daily cleanup.
- New `scripts/purge-stale-jobs-by-age.ts` one-time backfill marked 1,741 active jobs as `stale` (relative to 2026-05-08).
- New 90-day hard-delete boundary: `scripts/hard-delete-ancient-jobs.ts` deletes jobs older than 90 days (defaults to dry-run; requires `DRY_RUN=false` to execute). First run removed 2,676 jobs.
- `src/lib/jobs/poller/cleanup-queries.ts` → `deleteAncientJobs(retentionDays = 90)` is wired into the existing `aggressiveCleanup` Inngest function (daily 02:00 UTC). `match_queue` rows cascade automatically.

**Company Active Job Count Backfill:** `src/lib/jobs/poller/company-state.ts` → `backfillCompanyActiveJobCounts()` recomputes every company's `activeJobCount` from current active `job` rows (joined by `atsSource` + `atsSlug`). New script `scripts/backfill-active-job-counts.ts` runs it. Use after bulk purges to keep company counts accurate.

**Admin Dashboard — Staleness Analytics:**
- `src/lib/jobs/ingestion-analytics.ts` → `getJobStalenessDistribution()` buckets active jobs by age (`<1d`, `2-7d`, `8-30d`, `30-60d`, `>60d`) overall and per source.
- `src/components/admin/JobStalenessDistribution.tsx` displays the distribution in two tables (overall + per source). `8-30d` is highlighted yellow, `30-60d` and `>60d` red.
- `src/components/admin/StalenessDistributionChart.tsx` adds a Recharts bar chart to the same card using the same color scheme.

**Admin Dashboard — Old-Job Rate Alert:**
- `src/lib/jobs/ingestion-analytics.ts` → `getHighOldJobRateAlerts()` queries recent `ingestion_log` entries and flags any source where >30% of fetched jobs were rejected as too old for injection.
- `src/components/admin/OldJobRateAlertPanel.tsx` renders a yellow alert card on the Ingestion tab when triggered.
- Refactored from an async Server Component to a `"use client"` component that receives alerts via props; `src/components/admin/IngestionAnalytics.tsx` fetches them server-side and passes them down.

**Public Listings — Freshness Badges:** `src/components/jobs/JobCard.tsx` now renders a color-coded "Posted X ago" badge: green (<7d), yellow (7–30d), red (>30d). Tooltip explains the scale and that the date is `publishedAt` (or `detectedAt` fallback).

**Hydration Fix — Radix Tooltip in Server Components:** `src/components/admin/InfrastructureHealth.tsx` was a Server Component that rendered `Tooltip`/`TooltipTrigger` inline, causing a React hydration mismatch because Radix injects client-only attributes. Fixed by extracting the tooltip-wrapped progress bar into a dedicated `"use client"` component (`src/components/admin/NeonStorageTooltip.tsx`) and using it from the Server Component. Pattern applies to any Server Component using Radix client primitives.

**Files touched:** `src/lib/jobs/poller/phalanx-poller.ts`, `src/lib/jobs/poller/company-state.ts`, `src/lib/jobs/poller/cleanup-queries.ts`, `src/lib/jobs/poller/smartrecruiters-detail.ts`, `src/lib/jobs/poller/greenhouse-detail.ts`, `src/lib/jobs/ingestion-analytics.ts`, `src/lib/jobs/job-normalizer.ts` (metadata `isActive`), `src/components/jobs/JobCard.tsx`, `src/components/admin/IngestionAnalytics.tsx`, `src/components/admin/JobStalenessDistribution.tsx`, `src/components/admin/StalenessDistributionChart.tsx`, `src/components/admin/OldJobRateAlertPanel.tsx`, `src/components/admin/InfrastructureHealth.tsx`, `src/components/admin/NeonStorageTooltip.tsx`, `src/inngest/functions.ts`, plus new scripts under `scripts/`.

**Verification:** `npm run build`, `npx tsc --noEmit`, `npx biome check`, and targeted Vitest poller/detail tests pass. No new migrations required.

---

## 5. MODULE C: EVENT-DRIVEN ROUTING (THE 3-GATE FUNNEL) `[Status: Implemented — Real-Data Calibrated (Self-Use Yield Analysis)]`

**Goal:** Solve the O(N*M) compute cost problem using Inngest and Postgres.

**Implementation reference:** `docs/reports/MODULE_C_DECISIONS.md` is the primary design document for all Module C features. Calibration findings: `docs/reports/calibration-report.md`.

**Feature breakdown (14 features, all implemented):**
- **C0** — Schema & contracts hardening: `matchQueue` columns (including `promptVariant`, `workAuthRiskFlag`, `staleAt`), `job.status` values, `normalizedAt`, Module C event types (`match/gate-3-evaluate`, `match/approved`, `persona/updated`), `matching-config.ts`, `db.ts` pooler guard, `seniority_level` enum + `applicant.seniority_levels` column, `applicant.workAuthorizations` column.
- **C1** — Job normalization: `job-normalizer.ts` + `job-embedder.ts`, wired into `jobIngestedHandler`.
- **C5** — Seed script: `scripts/seed-routing-engine.ts` (synthetic data for calibration).
- **C0.5** — Gate 0.5 hard-blocker pre-filter: `gate-zero-pre-filter.ts` (geo-fencing, compensation, experience checks), wired into `jobIngestedHandler` between normalization and Gate 1+2. Added July 2026.
- **C2** — Gate 1+2 SQL router: `gate-1-2.ts` with workplace type pre-filter, wired into `jobIngestedHandler`.
- **C3** — Gate 3 LLM evaluator: `gate-3.ts` (3 A/B test prompt variants, seniority-aware matching, country-specific remote checks, work authorization filtering + risk flagging) + `gate3Evaluator` Inngest function.
- **C3b** — Gate 3 feedback loop: `pendingQueueSweep` (cron every 30 min) + `personaUpdatedHandler` (event-driven re-evaluation + bulk reprocess trigger) + `matchBulkReprocess` (manual bulk reprocessing) + `matchRetrySweep` (daily re-matching sweep). Added June 28 2026, enhanced July 1 2026.
- **C4** — Dashboard query layer + UI: `dashboard-queries.ts` (status-filtered queries, pagination, resilient unread badge) + `matches.ts` Server Actions + `/dashboard/jobs` list page + `/dashboard/jobs/[matchId]` detail page + sidebar unread badge.
- **C6** — Calibration: `scripts/calibrate-routing-engine.ts` + `docs/reports/calibration-report.md` + yield analysis (June 28 2026).
- **C7** — Persona consolidation & diversification: 3 TypeScript personas consolidated to 2 distinct + 1 new PHP/Laravel persona. `CANONICAL_TAGS` expanded to 146 entries (added `wordpress`, `docker`). Added June 28 2026.
- **C8** — Work authorization filtering + risk flagging: `applicant.workAuthorizations` permits, `matchQueue.workAuthRiskFlag` advisory flag, dynamic work authorization directive in Gate 3 prompt. Added July 4 2026.
- **C9** — Remote-scope extraction (v2): `src/lib/jobs/remote-scope-extractor.ts` — 2-step ladder (deterministic regex + ATS-native + Cheerio → LLM gpt-4o-mini fallback). Classifies jobs as `global`, `country_fenced`, `region_fenced`, `onsite`, or `undetermined`. Used during normalization and via `scripts/backfill-remote-scope.ts`. Added July 7 2026.
- **C10** — Company scoring matrix: `src/lib/jobs/company-scorer.ts` + `src/lib/jobs/company-enrichment/big-tech-registry.ts` — 5-signal scoring (employee count, agency, public listing, source origin, maturity[disabled]) clamped to [-0.30, +0.30]. Feeds dashboard display score (0.17 weight bucket). Added July 7 2026.
- **C11** — Circuit breaker (5-tier): `src/lib/jobs/circuit-breaker.ts` — per-source early-warning, provisional backlog throttle, unknown sub-floor guard, corpus-ratio breaker, daily source ban. Severity stack: `hard_pause` > `rate_reduction` > `normal`. Added July 7 2026.

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
*   **Error logging (Sprint 7, July 1 2026):** Normalization failures are now logged with `console.error` including `jobId`, `atsSource`, and the error message. Previously silently swallowed — making it impossible to diagnose OpenAI API key issues, rate limiting, or malformed SmartRecruiters detail data. The error is logged but does NOT change control flow (the job is still marked `normalization_failed` and remains retryable).
*   **Retry sweep (Sprint 7, July 1 2026):** The `normalizationRetrySweep` Inngest function (cron `0 6 * * *`) now processes TWO categories of stuck jobs: (1) `status = 'normalization_failed'` (retryable failures), AND (2) `status = 'active' AND normalizedAt IS NULL` (never normalized — the batchPollTier timeout/retry failure mode). Limit raised from 50 to 200 jobs per run. Both categories are re-emitted as `job/ingested` events; the idempotency guard ensures safe re-processing. See §4.7.10 for full details.

### 5.1.5 Step 1.5: Gate 0.5 Hard-Blocker Pre-Filter `[Status: Implemented — July 2026]`

After normalization succeeds but before Gate 1+2 routing, a new hard-blocker pre-filter runs to catch jobs that are fundamentally ineligible regardless of technical match. This addresses three geo-fencing patterns discovered in production that the 3-Gate funnel could not detect:

1. **Title region tags** — Companies embed regional restrictions in job titles (e.g., "Software Engineer - Latam"). The location field says "Remote" but the title geo-fences to a region excluding the applicant.
2. **Location country lists** — Some jobs list specific allowed countries in the location field (e.g., "Mexico, Argentina, Colombia, India"). The applicant's country is not on the list.
3. **No remote designation** — Greenhouse jobs with a location name but no remote/hybrid keywords were classified as `workplaceType = null`. In reality, absence of remote designation = on-site at the stated location.

**Why scoring couldn't fix this:** The display score's 8% location weight was insufficient to suppress these false positives — a perfect technical match (55% from similarity + overlap) overwhelms the 8% location penalty. Hard blockers require hard rejection, not soft scoring penalties.

**Implementation:** `src/lib/jobs/gate-zero-pre-filter.ts` — pure logic, no DB access, fully unit-testable. Five checks run in priority order:

| Check | Pattern | Soft-fail-open? | Description |
|---|---|---|---|
| 1 | `title_region_tag` | No | Parse job title for region suffixes. Reject if region is not friendly to applicant's country. |
| 2 | `location_country_list` | No | Check structured `locationCountries` or parse `locationName` for a country list. Reject if applicant's country is not included. |
| 3 | `default_on_site` / `explicit_on_site` | No | If `workplaceType` is null/on-site and location doesn't mention applicant's country, reject. |
| 4 | `compensation_mismatch` | Yes | If both job compensation and applicant expected minimum are available, reject if max < 70% of minimum. |
| 5 | `experience_gap` / `inverted_experience_band` | Yes | If both job experience range and applicant years are available, reject if applicant is significantly overqualified. |

Checks 4 and 5 are **soft-fail-open**: they only fire when both job and applicant data are available. This prevents blocking jobs just because we don't have compensation or experience data yet.

**Normalizer fix (Pattern 3):** The Greenhouse `extractGreenhouseMetadata()` function was fixed — when a job has a location name but no remote/hybrid keywords are found, `workplaceType` now defaults to `'on-site'` instead of `null`. This is the correct assumption: if a job doesn't say it's remote, it isn't.

**Integration:** Gate 0.5 is a new step (`gate-0-5-pre-filter`) in the `jobIngestedHandler` Inngest function, between `write-normalization` and `gate-1-2-router`. It is a **job-level** filter (not job-persona-pair) — it checks whether the job is fundamentally eligible for the applicant(s) regardless of persona. Jobs that fail are tombstoned (`status='rejected'`, `rejectionPattern` set) and never enter the matching pipeline.

**Schema changes:** 8 new columns on `job` (`title_region_tag`, `location_countries`, `experience_min_years`, `experience_max_years`, `compensation_min`, `compensation_max`, `compensation_currency`, `rejection_pattern`) and 2 new columns on `applicant` (`expected_comp_min`, `years_of_experience`). See migration `0039_reflective_caretaker.sql`.

**Backward compatibility:** Existing jobs have NULL for all new columns — Checks 4 and 5 are skipped (soft-fail-open). The workplace type fix only affects NEW jobs. Existing approved matches are not automatically re-evaluated. The applicant's new fields are NULL until set via onboarding/profile management — until then, Checks 4 and 5 are no-ops.

**Full design document:** `docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md`

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
| `GATE2_MAX_COSINE_DISTANCE` | `0.50` (env-configurable) | Calibrated against real data. Tightened from 0.55 to 0.48 (June 28 2026 yield analysis) to cut LLM costs. Loosened back to 0.50 (Sprint 3, June 30 2026) and made env-configurable via `GATE2_MAX_COSINE_DISTANCE` env var — tunable without redeploy. At 0.55, the funnel produced 160 candidates (85% were weak matches that Gate 3 rejected). At 0.48, the funnel produces 24 candidates — an 85% reduction in LLM calls with no loss of true positives. Sprint 8 (July 1 2026) uses 0.50 as the default to slightly widen the funnel after removing the workplace pre-filter. Previous values: 0.50 (Sprint 3+), 0.48 (June 28 2026), 0.55 (June 25 2026), 0.35 (blocked all real matches). |
| `GATE_ROUTER_LIMIT` | `8` | Uncalibrated — doing all filtering on synthetic data. |
| `GATE1_WEIGHT` | `0.6` | Uncalibrated guess. |
| `GATE2_WEIGHT` | `0.4` | Uncalibrated guess. `GATE1_WEIGHT + GATE2_WEIGHT = 1.0`. |

**Workplace type pre-filter (added June 28 2026, REMOVED July 1 2026):** The Gate 1+2 SQL previously included a `workplace_type` filter that joined `applicant.assignment_types` against `job.workplace_type`. This pre-filter eliminated on-site/hybrid jobs for remote-only applicants BEFORE the LLM call. **Removed in Sprint 8** because it was too aggressive — it blocked 113 of 198 candidate pairs (74 on-site + 39 hybrid) before Gate 3 could evaluate them. The LLM (Gate 3) now makes the final determination, especially for hybrid roles that may offer remote options. This trades a small increase in Gate 3 LLM costs for a significant increase in match coverage.

**Edge cases handled:**
- Empty `jobTags`: Skip Gate 1, rely on Gate 2 alone. Log warning.
- No personas pass: Return empty array. No Gate 3 fan-out.
- All candidates blocklisted: Filtered by `NOT (p.blocklist_tags && ...)`.
- Null `jobEmbedding`: Defensive fallback to Gate 1 only with `LIMIT 8`.
- **Cross-posting duplicates** (added June 25 2026, RELAXED July 1 2026): ATS APIs list the same job multiple times with different `external_job_id` values (e.g. for different locations/teams). The `NOT EXISTS` subquery checks if a match already exists for the same `(ats_slug, title, persona_id)` before inserting — prevents duplicate matches and saves Gate 3 LLM calls. Discovered when 19% of active jobs were duplicates (449 out of 2,348). **Sprint 8 relaxation (July 1 2026):** The dedup now blocks only `approved` matches (not rejected/pending). Previously, it blocked ALL matches including rejected ones — meaning a job rejected for Persona A was never evaluated for Persona B. This was blocking 12 valid candidate pairs. The relaxed dedup allows re-evaluation of jobs previously rejected for a different persona, while still preventing duplicate approved matches.

**Performance:** `EXPLAIN ANALYZE` (verified by `scripts/verify-gate-explain.mts`) confirms both GIN and HNSW indexes are used. At MVP scale (~1,000 personas), the composite ORDER BY may cause an in-memory sort (HNSW index is optimized for pure KNN, not composite expressions) — this is <5ms at 1k rows. At 100k+ scale, a two-phase query (KNN + re-rank) may be needed (post-MVP).

### 5.3 Step 3: Gate 3 (The LLM Arbiter) `[Status: Implemented]`
*   `jobIngestedHandler` fans out one `match/gate-3-evaluate` Inngest event per candidate row inserted by Gate 1+2. The `gate3Evaluator` function in `src/inngest/functions.ts` receives these events.
*   **One event per candidate** (not a batch) — maximum parallelism, maximum failure isolation. If one candidate's LLM call fails, the others are unaffected.
*   `src/lib/jobs/gate-3.ts`:
    *   `buildGate3Prompt` constructs a structured prompt with: job title + description + extracted tags, persona label + embedding summary + must-have/blocklist tags, and applicant constraints (country, work hours, compliance, modalities, assignment types, **seniority levels**).
    *   `evaluateGate3` calls `gpt-4o-mini` via Vercel AI SDK `generateObject` with a strict Zod schema (`gate3VerdictSchema`): verdict (`approved`/`rejected`), confidence (0.0–1.0), reasoning (1–3 sentences), and blockers (array of strings).
    *   `mapVerdict` maps the LLM verdict to `match_queue` status.
*   **Verdict writing:** `llm_verdict`, `llm_reasoning`, `llm_confidence`, `llm_blockers`, `llm_model`, `prompt_variant`, `evaluated_at` written to `match_queue`. If approved, `status = 'approved'` and `match/approved` event emitted. The `llm_confidence` and `llm_blockers` columns (migrations `0010` + `0011`) persist the LLM's actual confidence score and rejection reasons — critical for calibration via the dashboard UI.
*   **`match/approved` event:** MVP — nothing listens (dashboard polls `match_queue` directly). Defined now so Module D (cold email generation) has a stable contract post-MVP.
*   **Error recovery:** Unparseable output or exhausted retries → `status = 'pending'`, `llm_verdict = 'error'`. Recoverable by the `pendingQueueSweep` Inngest function (see below).

**Seniority-aware matching (added June 28 2026, updated July 2026):**
The `Gate3Context` type now includes `persona.seniorityLevels` — the per-persona seniority levels from `persona.seniority_levels`. The `buildGate3Prompt` function includes these in the persona section (not the applicant section), and all three prompt variants instruct the LLM to check the job's inferred seniority against this list and reject mismatches. If `persona.seniorityLevels` is empty, the LLM treats it as "any" and does not reject on seniority. This addresses the yield analysis finding that seniority mismatch was a top-3 rejection reason, and the per-persona design allows the same applicant to have different seniority levels for different tech stacks (e.g., senior for React/Next.js, mid for PHP/Laravel). The `applicant.seniorityLevels` field remains as the onboarding default that pre-populates persona seniority during signup.

**A/B test prompt variants (added June 28 2026):**
Gate 3 now supports three prompt variants for A/B testing approval rates:
- **`balanced`** (control): The default prompt, balanced between precision and recall.
- **`strict`**: More conservative — requires ≥2 of the persona's must-have tags in the job's core required skills, and only approves if highly confident.
- **`thorough`**: More detailed reasoning — considers transferable skills, doesn't reject solely on years-of-experience differences, and leans toward approving when the core tech stack aligns with no hard blockers.

The `gate3Evaluator` Inngest function randomly assigns a variant per candidate via `pickPromptVariant()` and stores it in `matchQueue.promptVariant`. After enough data is collected, analyze approval rates per variant:
```sql
SELECT prompt_variant, COUNT(*) FILTER (WHERE status='approved') AS approved,
       COUNT(*) AS total,
       ROUND(COUNT(*) FILTER (WHERE status='approved')::numeric / COUNT(*) * 100, 1) AS approval_pct
FROM match_queue WHERE prompt_variant IS NOT NULL GROUP BY prompt_variant;
```

**Country-specific remote restrictions (added June 28 2026, updated July 4 2026):**
All three prompt variants now explicitly instruct the LLM to scan the job description for geographic limitations like "remote (US only)", "must be located in [country]", "must reside in [country]". If the applicant's country doesn't match, this is a HARD BLOCKER. This addresses the yield analysis finding that location mismatch was the #1 rejection reason — many remote jobs restrict applications to specific countries/regions. **Dynamic compliance directive (added July 4 2026):** When the applicant has `w8ben` or `ic_global` compliance, a dynamic directive is injected into the prompt that distinguishes contractor-friendly postings (approve — mentions "contractor", "1099", "B2B") from W-2-only postings (hard blocker — mentions "W-2", "employee", "visa sponsorship", "green card"). This prevents false rejections of US-only remote jobs that accept international contractors.

**Work authorization filtering + risk flagging (added July 4 2026):**
Gate 3 now supports work authorization permit checking. The `Gate3Context.applicant.workAuthorizations` field passes the applicant's permits to the LLM. Supported permits: `eu_citizen`, `rwr_card_plus`, `blue_card_eu`, `uk_settled`, `uk_pre_settled`, `us_green_card`, `us_citizen`, `canadian_pr`, `swiss_permit_c`, `other_permit`. The LLM checks job work-auth requirements against the applicant's permits — if the job requires a specific permit the applicant doesn't have, it's a HARD BLOCKER. A dynamic **Work Authorization Directive** is injected into the prompt when the applicant has permits set, explaining permit coverage (e.g., "eu_citizen: right to work in ALL EU/EEA member states").

The `gate3VerdictSchema` now includes a `workAuthRiskFlag` boolean field. It is set to `true` when the JD is silent on work authorization but the role is hybrid or single-country-remote (not global) — this warns the user to verify before applying, as many employers hide citizenship/permit requirements in the application form. The LLM is instructed to check the JD text for global remote indicators ("global, remote-first", "work from anywhere", "worldwide", "distributed team") before flagging — if the JD says global remote, `workAuthRiskFlag` is set to `false` even if the location field says a specific country.

**⚠️ CRITICAL schema note:** The `workAuthRiskFlag` field in `gate3VerdictSchema` must NOT use `.default(false)` — OpenAI's strict JSON schema mode requires all properties to be in the `required` array, and Zod's `.default()` marks the field as optional, causing a schema validation error (`Invalid schema for response_format 'response': Missing 'workAuthRiskFlag'`). The field must be a plain `z.boolean().describe(...)` without `.default()`.

**Gate 3 feedback loop (added June 28 2026, ENHANCED July 1 2026):**
Four Inngest functions provide resilience, re-evaluation, and bulk processing:

1. **`pendingQueueSweep`** (cron every 30 minutes): Finds `match_queue` rows stuck in `pending` status for >10 minutes and emits `match/gate-3-evaluate` events for them. This handles cases where the original Gate 3 event was lost (e.g. script ran without Inngest event key, or an event was dropped). Without this sweep, pending rows would sit forever.

2. **`personaUpdatedHandler`** (event: `persona/updated`): When a user updates their persona's `must_have_tags`, `blocklist_tags`, or `embedding_summary` via `updatePersonasAction`, the action emits a `persona/updated` Inngest event. This function finds all `rejected` match_queue rows for that persona (where the job is still active), resets them to `pending`, and emits `match/gate-3-evaluate` events for re-evaluation. Limited to 50 re-evaluations per persona update to control LLM costs. **Sprint 8 enhancement (July 1 2026):** Now also emits a `match/bulk-reprocess` event to trigger `matchBulkReprocess` for new jobs that were never matched against the updated persona.

3. **`matchBulkReprocess`** (event: `match/bulk-reprocess`, added July 1 2026): Manually triggered via admin dashboard. Queries active+embedded jobs NOT in match_queue (LIMIT 1000), processes in batches of 25 with parallel `Promise.all` Gate 1+2 calls, fans out Gate 3 events per batch. Concurrency limit 1. Designed for retroactive matching when personas are created/updated or when pipeline fixes unlock previously unmatchable jobs.

4. **`matchRetrySweep`** (cron daily 07:00 UTC, added July 1 2026): Catches jobs missed by the normal pipeline — queries active+embedded jobs older than 1h with no match_queue entry (via persona JOIN for tag overlap), processes in batches of 25 with parallel Gate 1+2. Daily safety net for timing errors, filter changes, and edge cases.

**Sprint 8 prompt tuning (July 1 2026):**
All three prompt variants updated with:
- **International contractor guidance:** Explicitly instructs the LLM to consider W-8BEN compliance — "US only" remote jobs may accept international contractors if the applicant has `preferred_compliance = {w8ben, ic_global}`. The LLM should not auto-reject based solely on geographic restrictions without considering compliance context.
- **Hybrid as soft concern:** Hybrid workplace is now a soft concern (not an auto-reject). The LLM should evaluate whether the hybrid requirement is a hard blocker or if remote options may be negotiable.
- **Balanced approach:** Replaced the "be conservative: only approve if you are confident" bias with a more balanced instruction that doesn't bias toward rejection. The previous wording contributed to a 1.6% approval rate (target: 2-4%).
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
*   `getMatches(userId, status, limit, offset)` — status-filtered (approved/rejected/pending/all), paginated, applicant-scoped list of matches with job title, ATS source/slug, persona label, **composite match score (0–100)** derived from Gate 1/2 signals + workplace/location/seniority alignment + company quality + negative mismatch penalties, cosine distance, overlap score, LLM verdict, LLM reasoning, LLM confidence, LLM blockers, status, isRead, createdAt.
*   `getMatchesCount(userId, status)` — total count for pagination controls.
*   `getApprovedMatches(userId, limit, offset)` — backward-compat wrapper around `getMatches` with `status='approved'`.
*   `getUnreadBadgeCount(userId)` — count of approved + unread matches for the sidebar badge. Resilient — returns 0 on DB error instead of crashing the dashboard layout.
*   `getMatchDetail(userId, matchQueueId)` — full match detail with job `rawJson`, extracted tags, persona embedding summary, must-have tags, blocklist tags, LLM confidence, LLM blockers, LLM model, evaluatedAt.

**Display match score formula (implemented July 2026):** `src/lib/jobs/dashboard-queries.ts` computes a 0–100 composite score in SQL, ordered by the score in the dashboard list. The formula is intentionally separate from the Gate 1+2 router's composite ordering score (used only for candidate ranking) and is calibrated to reflect user-facing match quality.

| Signal | Weight | Direction |
|---|---|---|
| Semantic similarity (`1 - cosineDistance`) | 25% | Positive |
| Tag overlap (`1 - exp(-0.4 * min(overlapScore, 5))`) | 30% | Positive |
| Workplace alignment (assignment type vs. `job.workplaceType`) | 12% | Positive |
| Location alignment (country vs. `job.locationName`) | 8% | Positive |
| Seniority alignment (title inference vs. `persona.seniorityLevels`) | 8% | Positive |
| Company quality score (`companyQualityScore`) | 17% | Positive |
| Blocklist tag hit | 10% | Negative (flat) |
| Coverage gap (`1 - overlap / min(mustHaveCount, jobTagCount)`) | 10% | Negative |
| Secondary domain mismatch | 8% | Negative |

*Negative signals are subtracted from the positive sum and the result is clamped to `[0, 100]`. The coverage gap penalizes missing persona must-have tags. The secondary domain mismatch penalizes alternative framework/language tags (e.g., `wordpress`, `vue`, `angular`, `php`, `laravel`, `csharp`, `.net`, mobile stacks) present in the job but not in the persona's must-have tags. General-purpose languages used in AI/full-stack roles (`python`, `go`, `java`, `rust`, `django`, `flask`, `fastapi`) are intentionally excluded from the penalty list to avoid over-penalizing legitimate secondary skills.*

**Server Actions** (`src/actions/matches.ts`):
*   `markMatchRead(matchQueueId)` — sets `is_read = true`, scoped to `applicant_id = session.user.id`.
*   `markAllMatchesRead()` — sets `is_read = true` for all approved unread matches.

**List view** (`/dashboard/jobs`, Server Component):
*   Status filter tabs (Approved / Rejected / Pending / All) with per-status counts.
*   Paginated match cards (10 per page) with: job title, ATS source + slug, persona label, **composite match score (0–100, 5-star visual)**, cosine distance (raw number), overlap score (raw number), LLM confidence (color-coded: green >0.7, yellow 0.4–0.7, red <0.4), LLM reasoning (1–3 sentences), blockers (as badges), status badge, unread indicator.
*   "Mark all read" button + per-card "Mark as read" action (Server Action + `router.refresh()`).
*   "View on ATS" link to the company's hosted career page (via `ATS_ENDPOINTS[source].hostedBoard(slug)`).
*   Empty state with link to profile management.
*   Client component: `src/components/dashboard/MatchList.tsx` (handles tabs, mark-as-read actions, pagination).

**Detail view** (`/dashboard/jobs/[matchId]`, Server Component):
*   Full job description parsed from `rawJson` via `extractJobContent` (ATS-source-aware: Greenhouse `content`, Lever `descriptionPlain`/`description`, Ashby `descriptionPlain`/`descriptionHtml`).
*   **Match score panel (0–100) with component breakdown**: semantic similarity, tag overlap, workplace/location/seniority alignment, company quality, blocklist penalty, coverage gap, secondary domain mismatch.
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

### 5.5 Calibration (Feature C6) `[Status: Implemented — Funnel Thresholds Calibrated; Display Score Calibration In Progress]`

**⚠️ LAUNCH-BLOCKING (for public access):** Funnel routing thresholds (`GATE2_MAX_COSINE_DISTANCE`, `GATE_ROUTER_LIMIT`) are now calibrated against live `match_queue` data. The dashboard display score, however, is still being tuned — the current weights are empirical guesses refined against real data, but the next targeted signal (experience gap) is not yet implemented. No non-developer user sees Module C output until the display score is fully calibrated.

**Self-use calibration path:** The "20–30 real pairs" requirement is correct for opening the app to the public, but overly cautious for solo developer use. The developer's own usage IS the calibration:
1. Onboard with a real CV (Module A — done)
2. Run Module B seeders/poller to ingest real jobs
3. The 3-Gate funnel processes them and populates `match_queue`
4. Inspect matches via `/dashboard/jobs` (cosine distance, overlap score, LLM confidence, LLM reasoning, composite match score, and component breakdown all visible)
5. Tune `GATE2_MAX_COSINE_DISTANCE` and `GATE_ROUTER_LIMIT` based on observed false positives/negatives
6. Tune the display score weights and negative signals (blocklist penalty, coverage gap, secondary domain mismatch) using `scripts/analyze-approved-matches.ts` and `scripts/analyze-rejected-matches.ts`
7. Document tuned values in `docs/reports/calibration-report.md`

The dashboard UI was built specifically as the calibration debugging interface. Synthetic seed data has been cleaned from the production database (via `scripts/cleanup-seed-data.ts`); the next step is ingesting real jobs.

**Calibration scripts:**
- `scripts/calibrate-routing-engine.ts` — runs Gate 1+2 against seed data, collects cosine distance + overlap score distributions, measures true candidate counts at different thresholds (no LIMIT), and optionally evaluates Gate 3 verdicts on a sample.
- `scripts/analyze-approved-matches.ts` — live-data analysis: per-match score breakdown, SQL-vs-manual verification, approved-match distribution, high-confidence/low-score outliers.
- `scripts/analyze-rejected-matches.ts` — live-data analysis: rejected-match distribution, overlap with approved scores, top false negatives.
- `scripts/investigate-wordpress-matching.ts` — targeted case study for WordPress/Vue secondary-domain mismatch behavior.

**Key findings (synthetic data, 100 personas + 500 jobs):**
- `GATE2_MAX_COSINE_DISTANCE = 0.35` was a no-op — seed embeddings cluster tightly (mean 0.19, max 0.21). 222 candidates pass per job; the LIMIT 8 does all filtering.
- Gate 3 correctly approved archetype-matched candidates (4/5) and rejected a skill-emphasis mismatch (SolidJS primary vs React persona) despite perfect tag overlap and low cosine distance — validating the 3-Gate architecture.
- Confidence scores are high (0.90–0.95) on synthetic data. Real data will produce a wider distribution with borderline cases (0.4–0.6).

**Key findings (real data, June 25 2026 — 449 companies, 3,061 jobs, 2 personas):**
- `GATE2_MAX_COSINE_DISTANCE = 0.35` blocked ALL real matches. Real embeddings cluster at 0.45–0.60 minimum distance. `text-embedding-3-small` produces wider spread on real job descriptions than synthetic Gaussian noise.
- Threshold raised to `0.55` — produces relevant candidates without excessive false positives. See `docs/reports/calibration-report.md` §8 for details.
- Cross-posting duplication: 19% of active jobs (449/2,348) were ATS duplicates (same title, different `external_job_id`). Fixed via `NOT EXISTS` dedup in Gate 1+2.
- First real approved matches: 5 distinct jobs (Palantir ×2, Mapbox ×2, Teramind ×1) matched to Full-Stack TypeScript Engineer persona.

**Key findings (yield analysis, June 28 2026 — 449 companies, 4,086 active jobs, 3 personas):**
- **Gate 2 threshold tightened from 0.55 to 0.48.** At 0.55, the funnel produced 160 candidates but Gate 3 rejected 85% of them (mostly weak semantic matches). At 0.48, the funnel produces 24 candidates — an 85% reduction in LLM calls with no loss of true positives. All 24 candidates have cosine distance < 0.48 (strong semantic matches, avg 0.4255, min 0.3213).
- **Top Gate 3 rejection reasons (ranked):**
  1. **Location mismatch** (38%): Remote jobs restricted to specific countries (e.g., "remote (US only)") that don't match the applicant's country. → Fixed by adding country-specific remote check to all Gate 3 prompt variants.
  2. **Wrong tech stack** (24%): Jobs that passed Gate 1+2 on tag overlap but whose core required skills don't align with the persona. → Partially addressed by the "strict" A/B test variant which requires ≥2 must-have tags in core skills.
  3. **Seniority mismatch** (18%): Senior persona matched against mid-level jobs or vice versa. → Fixed by adding `seniorityLevels` to the applicant schema and Gate 3 context.
  4. **Role type mismatch** (12%): Full-stack persona matched against frontend-only or backend-only roles. → Addressed by persona consolidation (3 → 2 distinct TypeScript personas).
  5. **Other** (8%): Blocklist tags, domain irrelevance, etc.
- **Persona consolidation (3 → 2 TypeScript + 1 PHP/Laravel):** The "Senior React Engineer" persona (tags: typescript, react, nodejs, graphql, zustand) had 34 candidates and 0 approvals. Root cause: niche tags (graphql, zustand) created a mismatch impression for standard React jobs. Consolidated into:
  1. **Full-Stack TypeScript Engineer** (typescript, react, nodejs, postgresql, docker) — broad full-stack coverage
  2. **Senior Frontend React Engineer** (typescript, react, nextjs, tailwindcss, graphql) — frontend-focused coverage
  3. **PHP/Laravel Developer** (php, laravel, mysql, wordpress, javascript) — new persona for diversified job matching (0 candidates in current corpus — expected, corpus is TypeScript-focused)
- **CANONICAL_TAGS expanded:** Added `wordpress` (persona_defining, backend) and `docker` (persona_defining, devops) to support the new PHP/Laravel persona and full-stack persona. Total: 146 entries.
- **Company corpus is the bottleneck:** At 449 companies (~29 new jobs/day), the funnel produces ~1-2 approved matches/week. Quadrupling to 1,800+ companies would produce ~4-8 approved matches/week. See `docs/governing/company-corpus-expansion-prompt.md` for the dedicated expansion session plan.

**Key findings (display score calibration, July 2026 — live `match_queue` data):**
- **Composite display score introduced.** The dashboard now shows a single 0–100 match score instead of raw Gate 1/2 numbers. The score combines positive signals (semantic similarity, tag overlap, workplace/location/seniority alignment, company quality) with negative signals (blocklist tag hit, coverage gap, secondary domain mismatch).
- **Negative signals added to better reflect LLM rejection reasons:**
  - **Blocklist penalty:** Flat 10-point penalty if a job's extracted tags overlap with the persona's `blocklistTags`.
  - **Coverage gap:** Penalty proportional to the fraction of persona must-have tags missing from the job (`1 - overlap / min(mustHaveCount, jobTagCount)`), weighted at 10%.
  - **Secondary domain mismatch:** Penalty for alternative framework/language tags present in the job but not in the persona's must-have tags (`min(count / 3, 1.0) * 8%`). Tracks `wordpress`, `vue`, `nuxt`, `angular`, `svelte`, `solidjs`, `php`, `laravel`, `ruby`, `rails`, `csharp`, `dotnet`, `aspnet`, `swift`, `kotlin`, `flutter`, `ios`, `android`. Excludes general-purpose languages (`python`, `go`, `java`, `rust`, `django`, `flask`, `fastapi`) to avoid penalizing AI/full-stack secondary skills.
- **Calibration results:**
  - Approved matches average **54.1/100**, rejected matches average **39.9/100** — a 14.2-point gap.
  - WordPress/Vue-heavy roles for React/Next.js personas dropped by ~8–10 points (e.g., gohighlevel "SDE III - Fullstack" from 56 to 48), while the PHP/Laravel persona on the dedicated WordPress role dropped by only 5 points (52 → 47), confirming the signal correctly weights persona-specific vs. off-domain tags.
  - The remaining high-scoring rejected matches are dominated by location restrictions (e.g., "Japan only", "London on-site") and experience gaps (e.g., 8+ years required vs. persona's 7+ years) — signals not yet captured by the formula.
- **Tools added:** `scripts/analyze-approved-matches.ts`, `scripts/analyze-rejected-matches.ts`, `scripts/investigate-wordpress-matching.ts` for empirical score analysis and SQL-vs-manual verification.
- **Status:** Real-data calibration for the *funnel* thresholds (`GATE2_MAX_COSINE_DISTANCE`, `GATE_ROUTER_LIMIT`) is complete. Display score calibration is ongoing; the next targeted improvement is an experience-gap signal (extract `min_experience_years` from job descriptions and compare to persona-inferred experience).

**Key findings (post-flush, June 29 2026 — 5,290 companies, 4,086 active jobs, 3 personas):**
- **Corpus expansion complete:** 449 → 5,290 companies (106% of 5,000 target) via 10 batch sources + 13 daily-native sources. Top source: Wayback CDX (4,163 companies). See `docs/reports/CORPUS_EXPANSION_TDD.md` and `docs/reports/CORPUS_EXPANSION_HANDOFF.md`.
- **Expected job volume increase:** At 5,290 companies with an average of 5-50 open engineering roles each (after Gate 0 filtering), the active job count is expected to grow from 4,086 to ~21,500-50,000 once the batch poller processes all companies. This is an 5-12x increase in funnel input.
- **Expected match rate improvement:** At 449 companies, the funnel produced ~1-2 approved matches/week. At 5,290 companies (11.8x), the expected rate is ~12-24 approved matches/week (1.7-3.4/day). This exceeds the 5-10 approved matches/day target.
- **Next steps:** (1) Batch poller processes 5,290 companies on its cron schedule (active_hot every 3h, active every 12h, dormant weekly). (2) Module C normalizes and embeds new jobs. (3) Calibration thresholds (`GATE2_MAX_COSINE_DISTANCE = 0.48`, `GATE_ROUTER_LIMIT = 8`) may need re-tuning once the job volume increases — the current values were calibrated against 4,086 jobs, not 50,000.
- **G7 rawJson pruning applied:** 4,491 existing jobs processed, ~31MB reclaimed. New jobs are pruned automatically during normalization. This prevents Neon storage issues at 50K+ job scale.
- **Two sources disabled:** D1/B2 Google CSE (API discontinued — revisit with Brave Search API), B8 Rapid7 FDNS (commercial licensing — D6 CertStream covers same approach). See `docs/reports/CORPUS_EXPANSION_HANDOFF.md` §"Post-Flush Update".
- **Workable API schema drift fixed:** June 2026 API revision changed response format. `company.name`→`company.title`, `company.shortName` removed, slug extracted from `company.url`. 23 tests (8 new for slug extraction).

**Full report:** `docs/reports/calibration-report.md`

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

Status: Final decision — implemented via self-hosted PaaS (Hetzner Cloud + Coolify). Deployed and running (healthy) as of July 7 2026.

### 7.0 Self-Hosted Inngest (Sprint 5, June 30 2026)

Inngest operations migrated from Inngest Cloud (free plan: 5 concurrent steps, 50K executions/month) to self-hosted Inngest on the existing Hetzner/Coolify infrastructure. Deployed as a 3-container Docker Compose service (`inngest/inngest:v1.34.0` + `postgres:17` + `redis:7`) via Coolify REST API as a new service (UUID `otrzmmwzdh8z6hcg5at9yi03`) in the VectorMatch project, accessible at `https://inngest.vectormatch.dev` through Cloudflare → Traefik.

Env vars (runtime-only, set via Coolify dashboard or REST API):
- `INNGEST_DEV` — `1` for local dev, `0` or unset for production.
- `INNGEST_BASE_URL` — Self-hosted Inngest URL (e.g., `https://inngest.vectormatch.dev`).
- `INNGEST_EVENT_KEY` — Event authentication key (hex string).
- `INNGEST_SIGNING_KEY` — Request signing key (hex string).
- `INNGEST_SERVE_ORIGIN` — Public URL reachable from Inngest server (e.g., `https://vectormatch.dev`).

`src/instrumentation.ts` auto-syncs all registered functions on server startup. Inngest Cloud project kept active for 48h rollback window post-migration.

### 7.0a Neon API Integration (Sprint 9, July 4 2026)

New `src/lib/jobs/neon-api.ts` module fetches `synthetic_storage_size` from the Neon API for accurate storage monitoring. Neon's `synthetic_storage_size` is the enforced storage limit — it is ~12% larger than `pg_database_size()` because it includes WAL, history retention, and Neon overhead.

Env vars:
- `NEON_API_KEY` — Neon API Bearer token (generate from Neon console → Account → API keys).
- `NEON_PROJECT_ID` — Neon project ID (visible in Neon console URL or project settings).

The module caches the API response for 60 seconds using Next.js `revalidate` to avoid hitting the Neon API on every storage check. The `hourlyStorageMonitor` Inngest function uses this module for accurate storage monitoring; the hot-path ingestion guard (`storage-check.ts`) continues using `pg_database_size()` with a 460 MB safety margin for speed (no external API call).

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
*  **Inngest sync:** Automatic via `src/instrumentation.ts` — function definitions are synced with Inngest Cloud on every server startup (see §3.9.4). No manual intervention required.
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