## The Context
The web development job market faces a profound crisis as rapid AI advancement increasingly reduces the demand for human developers. Traditional job search platforms like LinkedIn and Freelancer.com, and others which were the primary hubs for job discovery are now oversaturated, with hundreds of developers competing for each open position. This saturation makes it nearly impossible for qualified candidates to stand out or find opportunities that genuinely match their skill-sets. VectorMatch.dev addresses this challenge by providing an AI-powered alternative that intelligently matches developers with relevant job opportunities based on their actual experience and technical capabilities.

## Mission & Concept
VectorMatch.dev bypasses traditional HR bottlenecks by connecting software engineers directly to major Applicant Tracking Systems (ATS) platforms like Greenhouse, Lever, and Workday. Instead of competing in oversaturated job boards, developers upload their CVs which are analyzed by AI to extract chronological experience and technical skill-sets. This structured data powers intelligent matching against live ATS job postings, enabling developers to discover and apply for opportunities that precisely match their capabilities—before they ever reach human recruiters. 

## Breakdown of the Application Technical Implementation
The TDD (Technical Development Design) system is architected into four distinct modules:
- **Module A: Developer-Centric Onboarding (Frontend & API)**

  Converts raw, messy developer resumes (PDFs) into structured, validated data using client-side extraction and a specialized server-side AI overlap merge algorithm to accurately calculate years of experience. It also handles the "5 Major Skills" drag-and-drop constraint to create a clean user persona without muddy vector overlap.  

- **Module B: Seeding & Ingestion Engine**

  An automated discovery engine for raw, untapped corporate data sources.
  Discovers job boards and candidate companies for $0 by pulling from public data sets like Google BigQuery, Hacker News, and SSL certificates. It feeds these discovered targets into a rate-limited background worker (the "Phalanx" Poller) to fetch live job postings.

  **BigQuery MCP Integration**: Uses Google BigQuery MCP server (configured in `.devin/config.json`) for AI-assisted public dataset analysis. See `docs/bigquery-mcp-setup.md` for setup and usage details. Leverages BigQuery Sandbox tier (no billing required) for HTTP Archive, Hacker News, and other public datasets.  

- **Module C: Event-Driven Routing (The 3-Gate Funnel)**

  The core matching brain. It processes incoming jobs by indexing them and running an optimized, ultra-fast 3-gate funnel (Exact Filtering $\rightarrow$ Semantic Vector Similarity $\rightarrow$ Parallel High-Fidelity LLM Evaluation) to match jobs to users.  

- **Module D: Business Logic & Compliance (Go-To-Market)**

  Generates automated, personalized, peer-to-peer cold outreach emails ("Minute Zero" pitches) for developers to send directly to CTOs, and bundles them with a B2B contract compliance legal sheet (W-8BEN instructions) to lower the corporate friction of hiring independent contractors.  

- **Module E: Infrastructure & Deployment Architecture**

  Handles the complete deployment infrastructure using self-hosted PaaS (Hetzner Cloud + Coolify) with Docker-based Next.js standalone output, Neon PostgreSQL in Frankfurt for minimal query latency, and Cloudflare edge protection for critical API endpoints. It includes operational constraints around filesystem caching with horizontal scaling and requires manual maintenance through the Coolify dashboard.

## Status Designation Legend
To maintain absolute alignment between this blueprint and the active codebase, every component, module, and table is labeled with one of the following statuses:
- **`[Status: Implemented]`**: The feature or component is fully written, integrated, and active in the current codebase.
- **`[Status: Partially Implemented]`**: The UI structure, routing, or database placeholders exist in the codebase, but core matching logic, background jobs, or third-party integrations are not yet wired up.
- **`[Status: Planned / TO DO]`**: The feature or module is technically architected but has not yet been introduced to the codebase.
- **`[Status: Deprecated — Retained Historically]`**: The code/table exists in the codebase but has been superseded by a newer architectural decision. It is intentionally kept (e.g. to preserve migration history) and must not be referenced by new application code.


## Build Sequence `[Status: Tracking]`

Bottom-up order for solo implementation. Update the status tag as each step completes.

1. **Database & Schema Layer** `[Status: Implemented]` — Drizzle schemas for `applicant`, `job`, `persona`, `matchQueue`, `cvUpload`, `workingHistory`, `tagsExperience` with GIN + HNSW indexes. (Completed in schema-cleanup session + Module A schema phase, June 2026.)
2. **Module A Contracts** `[Status: Implemented]` — `CANONICAL_TAGS` (144 entries, `src/lib/jobs/tech-tags.ts`), `CANONICAL_ROLES` (~90 entries, `src/lib/jobs/roles.ts`), `resumeExtractionSchema` + `onboardingPayloadSchema` Zod schemas (`src/lib/onboarding/schemas.ts`). (Completed in Module A contract phase, June 2026.)
3. **Client-Side PDF Extraction & AI Parsing** `[Status: Implemented]` — `pdfjs-dist` in main-thread "fake worker" mode (`src/lib/onboarding/pdf-worker-client.ts`) + `generateObject` call against `resumeExtractionSchema` (Schema 1) with dynamic canonical tag list in system prompt. (Completed in Module A implementation, June 2026. Revised from Web Worker to main-thread due to browser nested-Worker limitation — see TDD §3.3.)
4. **Onboarding UI** `[Status: Implemented]` — `/dashboard/profile-management` page with 3-presentation state machine (CV upload → onboarding review → profile management), React Hook Form + Server Actions via `useActionState` + `startTransition`, 5-Major-Skills drag-and-drop constraint, inline validation errors, sonner toast notifications, persona save + embedding generation. (Completed in Module A implementation, June 2026.)
5. **Inngest Orchestration Base** `[Status: Implemented]` — `app/api/inngest/route.ts` serve handler (Next.js App Router, `maxDuration: 300`), typed Inngest v4 client (`src/inngest/client.ts` with `VectorMatchEvents` catalog), function registry (`src/inngest/functions.ts` with 10 functions — 7 fully implemented, 3 placeholders for Module C), barrel exports (`src/inngest/index.ts`), dev server scripts (`npm run inngest:dev`), MCP integration in `.devin/config.json`, and coding agent resources (`docs/inngest-agent-resources.md`). (Completed June 2026.)
6. **Module B Schema Layer** `[Status: Implemented]` — `company` table (ATS slug registry with tier/health/polling state, unique index on `(atsSource, atsSlug)`), `ingestionLog` table (observability), `job` table updates (`externalJobId`, `lastSeenAt`, `status`, unique constraint for dedup). Migration `0008_module_b_ingestion_tables.sql` applied. (Completed June 2026.)
7. **Module B Contracts** `[Status: Implemented]` — ATS endpoint registry (`src/lib/jobs/ats-endpoints.ts`), defensive Zod schemas for Greenhouse/Lever/Ashby (`src/lib/jobs/ats-schemas.ts`), Gate 0 regex title filter (`src/lib/jobs/gate-zero.ts`), seeder schemas (`src/lib/jobs/seeders/schemas.ts`), URL parser (`src/lib/jobs/seeders/url-parser.ts`), company repository (`src/lib/jobs/seeders/company-repository.ts`), HN Algolia schemas (`src/lib/jobs/seeders/hn-schemas.ts`). All with comprehensive Vitest test coverage. (Completed June 2026.)
8. **Seeders** `[Status: Implemented]` — HN Algolia delta seeder domain logic fully implemented (`src/lib/jobs/seeders/hn-algolia.ts`, `resolve-custom-url.ts`) with Zod validation, CNAME resolution, slug probe, and company insertion. Inngest function wrappers registered (`hnAlgoliaSeeder`, `customUrlResolver` in `src/inngest/functions.ts`) with weekly cron trigger and event-driven custom-URL resolution. BigQuery volume seeder domain logic implemented (`src/lib/jobs/seeders/bigquery-seeder.ts`) with injectable BQ client, SQL builder, two-phase slug extraction (direct REGEXP_EXTRACT + slug probe fallback), and manual script wrapper (`scripts/seed-bigquery.ts`). Inngest function `bigQuerySeeder` wired up with monthly cron trigger. crt.sh deferred to Phase 2. All with comprehensive Vitest test coverage (103 seeder tests). (Completed June 2026.)
9. **Ingestion Poller** `[Status: Implemented]` — Phalanx Poller core ingestion loop fully implemented: ATS adapters (`src/lib/jobs/poller/ats-adapters.ts`) with fetch + Zod validate + normalize per platform, job repository (`src/lib/jobs/poller/job-repository.ts`) with upsert + new job detection + stale cleanup, company state updater (`src/lib/jobs/poller/company-state.ts`) with health tracking + auto-disable after 3 failures, tier queries (`src/lib/jobs/poller/tier-queries.ts`) for fan-out polling, and orchestrator (`src/lib/jobs/poller/phalanx-poller.ts`) with injectable fetch. Inngest functions wired up: `pollCompanyFn` (per-company fan-out target, concurrency 50), `tierActiveFanOut` (every 12h), `tierDormantFanOut` (weekly), `phalanxPoller` (manual single-company), `tierRecalc` (daily), `staleCleanup` (daily). Per-ATS bottleneck rate limiter (`src/lib/jobs/poller/rate-limiter.ts`, 2 req/s per platform). All with comprehensive Vitest test coverage (32 poller tests). (Completed June 2026.)
10. **3-Gate Routing Logic** `[Status: Planned / TO DO]` — Combined GIN + HNSW Drizzle query (Module C, section 5.2).


## Technical Architecture

### Core Tech Stack `[Status: Partially Implemented]`
- **Framework**: Next.js 16 (App Router + Cache Components)
- **Database**: PostgreSQL (Neon) with `pgvector` extension for similarity search
- **ORM**: Drizzle ORM for schema management and type-safe querying
- **Auth**: Better Auth for secure user management and authentication
- **Orchestration**: Inngest v4 for durable, event-driven background jobs and workflows
- **AI SDK**: Vercel AI SDK (`gpt-4o` for complex reasoning, `gpt-4o-mini` for scale, `text-embedding-3-small` for vector generation)
- **Styling & UI**: Tailwind CSS v4 + Shadcn UI (using CSS-first `@theme` configuration)
- **Blog / Content**: File-based **MDX** (`next-mdx-remote/rsc` + `gray-matter`) stored in-repo at `src/app/(public)/blog/_posts/*.mdx`. Statically generated, zero database dependency. Comments via **Giscus** (GitHub Discussions). See *Blog & Content Architecture* below.
- **Hosting:** Hetzner Cloud (Frankfurt) + Coolify (self-hosted PaaS). 

### Database Schema & Performance Tuning
- **`users` table** `[Status: Implemented]`: Managed by Better Auth.
  - *Drizzle Path*: `src/db/schemas/auth/user.ts`
- **`applicant` table** `[Status: Implemented]`: 1:1 extension of `users`. Primary key `user_id` is a foreign key to `user.id` with CASCADE delete.
  - *Drizzle Path*: `src/db/schemas/jobs/applicant.ts`
  - *Enum Definitions*: `src/db/schemas/jobs/enums.ts` (`assignment_type`, `modality`, `compliance`, `cv_upload_status`)
  - *Onboarding State*: `is_onboarded` (boolean), `country` (ISO 3166-1 alpha-2), `can_work_us_hours` (boolean)
  - *Work Preferences*: `assignment_types` (enum array), `modalities` (enum array), `preferred_compliance` (enum array)
  - *Gate 3 Knowledge Base `[Status: Implemented]`*: Contains `all_tags` (text array) — the global knowledge base used by the LLM arbitrator during high-fidelity candidate evaluation. Rebuilt as union of active `tagsExperience.canonical_tag` values by `recomputeTagsExperience()`.
- **`persona` table** `[Status: Implemented]`: Supports multi-persona matching. Contains `persona_label`, `embedding_summary`, `persona_embedding` (vector 1536), `must_have_tags` (text array), and `blocklist_tags` (text array).
  - *Gate 1 Optimization*: `must_have_tags` and `blocklist_tags` are indexed using a **Postgres GIN index** to support instant `&&` (overlap) query operations.
  - *Gate 2 Optimization*: Indexed using **HNSW** (`USING hnsw (persona_embedding vector_cosine_ops)`) to achieve sub-millisecond vector similarity calculation during routing.
  - *Business Rule*: To prevent abuse, users are strictly limited to a maximum of 3 personas, enforced at the API/Zod validation layer.
- **`cv_upload` table** `[Status: Implemented]`: Persists every CV upload attempt — raw extracted text (from `pdfjs-dist` in main-thread "fake worker" mode via `src/lib/onboarding/pdf-worker-client.ts`), the full LLM extraction payload (Schema 1 JSONB), and a lifecycle status (`processing`, `valid`, `invalid`, `abandoned`) that drives the onboarding state machine.
  - *Drizzle Path*: `src/db/schemas/jobs/cvUpload.ts`
- **`working_history` table** `[Status: Implemented]`: Single source of truth for the user's work history. Each row represents one employment entry extracted from a CV (by the LLM) or added manually post-onboarding. Linked to `cv_upload` via `cv_upload_id` (CASCADE delete). This table is the input to `recomputeTagsExperience()`.
  - *Drizzle Path*: `src/db/schemas/jobs/workingHistory.ts`
- **`tags_experience` table** `[Status: Implemented]`: Single source of truth for the user's skills and years of experience per skill. NOT populated by the LLM directly — computed by `recomputeTagsExperience(applicantId)` which reads `working_history`, merges overlapping date ranges per canonical tag, and upserts results here. The `active` flag lets users deactivate non-critical skills. Unique constraint on `(applicant_id, canonical_tag)` enables upsert.
  - *Drizzle Path*: `src/db/schemas/jobs/tagsExperience.ts`
- **`jobs` table** `[Status: Implemented]`: Stores job listings with `ats_slug`, `title`, `raw_json`, and `extracted_tags` (text array).
- **`match_queue` table** `[Status: Implemented]`: Maps `job_id` to `user_id` with a `status` state (pending, approved, rejected) to buffer and queue high-fidelity LLM evaluations.
- **`blog_categories`, `blog_tags`, `blog_posts`, `blog_post_tags`, and `blog_comments` tables** `[Status: Deprecated — Retained Historically]`: A full relational blog and nested commenting schema that predates the architectural decision to move the blog to file-based MDX.
  - *Drizzle Path*: `src/db/schemas/blog/` (defines `posts.ts`, `categories.ts`, `tags.ts`, `comments.ts`)
  - *Decision*: The blog is now implemented as static **MDX** (see *Blog & Content Architecture*). These tables, their relations, and migrations are **retained as historical artifacts** and **must not be referenced by any new application code**. They are not deleted to preserve migration history. The `blog_comments` table is fully superseded by Giscus.

## Application Architecture & User Flow

### Public Area (Marketing & Onboarding)
**Homepage Structure** `[Status: Implemented]`
- **Navigation Bar**: Logo (homepage link), main navigation links (Home, Blog, Pricing), authentication actions (Sign Up/Sign In)
- **Hero Section**: Compelling value proposition, standard action button ("Start Your AI Job Hunt") redirecting to authentication, and visual presentation of the ATS matching concept
- **How It Works Section**: Step-by-step explanation of the CV analysis → ATS matching → application workflow
- **Pitch Section**: Benefits and differentiators compared to traditional job boards
- **Footer**: Standard links (Copyright, About, FAQ, Terms, Privacy Policy)

### Blog & Content Architecture `[Status: Implemented]`
The blog is a static, file-based MDX system whose purpose is organic SEO acquisition, product/ATS education, developer career guidance, and conversion of anonymous visitors into registered users. It is deliberately **decoupled from the core product database** — no Neon reads, no CMS, no admin UI — so engineering effort stays focused on the matching pipeline.

- **Content Storage**: Articles live in-repo as `src/app/(public)/blog/_posts/*.mdx`. Publishing a post is a commit + deploy; no admin panel required. Frontmatter schema: `title`, `description`, `publishedAt`, `updatedAt`, `author`, `tags[]`, `featured`, `coverImage`, `category` (slug derived from filename).
- **Rendering**: `next-mdx-remote/rsc` + `gray-matter`. All blog routes are **fully static** under Next.js Cache Components — filesystem reads are wrapped with `'use cache'` + `cacheLife('max')`, and dynamic routes export `generateStaticParams`. No request-time data and no runtime content fetches.
- **Routes**: `/blog` (index), `/blog/[slug]` (article), `/blog/category/[category]`, `/blog/tag/[tag]`. URLs are permanent/stable. Rendered under the existing `(public)` layout (inherits Navbar + Footer).
- **Content Layer**: `src/lib/blog/` exposes `getAllPosts()`, `getPostBySlug()`, `getAllSlugs()`, and category/tag helpers, with Zod-validated frontmatter. A static JSON search index is generated for future local search (no Algolia/external search initially).
- **MDX Component Library** (`src/components/mdx/`, styled to the dark-first design system): `Callout`, `CTA` (primary signup conversion → `/signup?ref=blog-cta`), `ArticleCard` (build-time resolved internal post promotion, never a runtime fetch), `Badge` (ATS-platform variants via `@theme` tokens), `TechStack` (Simple Icons logos), and `YouTube` (privacy-friendly embed).
- **Comments**: **Giscus** (GitHub Discussions), mapped to article URLs and configured via `NEXT_PUBLIC_GISCUS_*` env vars. No comment database, moderation UI, or spam handling required.
- **SEO Foundation**: Per-post Open Graph + Twitter metadata, `Article`/`BreadcrumbList` JSON-LD, an auto-generated `sitemap.xml`, `robots.ts`, and an RSS feed at `/rss.xml` (with a `rel="alternate"` link in the document head). Performance targets: Lighthouse ≥ 95, LCP < 2.5s, CLS < 0.1, TTFB < 500ms.
- **Future Flexibility**: If a CMS becomes necessary later (Sanity, Contentful, Payload, etc.), content can migrate without changing URL structures.

### User Acquisition & Authentication Flow
**Standard Authentication Flow** `[Status: Implemented]`
- Users must authenticate before accessing any dashboard features.
- Primary conversion element is a call-to-action button linking directly to the separate `/auth` page.
- Fully supports traditional sign-up/sign-in forms with email/password authentication (as well as Google/GitHub OAuth integrations).

**Smart Dashboard Redirection Logic** `[Status: Implemented]`
- **On Sign-Up (New Users)**:
  - Once signed-up, the user must be automatically redirected to the `/dashboard/profile-management` page. This ensures a natural onboarding workflow where the user is immediately prompted to upload and parse their CV (State 1 of the 3-presentation state machine).
- **On Log-In (Existing Users)**:
  - When an existing user logs in, they should be intelligently redirected based on their profile completion:
    - **a) If the user is not onboarded** (`applicant.is_onboarded = false`): redirect them to the `/dashboard/profile-management` page to complete onboarding.
    - **b) If the user is onboarded** (`applicant.is_onboarded = true`): redirect them to the `/dashboard/jobs` page to view active matches.

### Dashboard Area (Authenticated User Workspace)
**Navigation Structure** `[Status: Implemented]`
- Collapsible sidebar with role-based navigation items
- Main navigation items: Account, Profile Management, Jobs
- Admin-only navigation: Admin panel (for user management and system oversight). *Note: there is no blog management in the dashboard — blog content is authored as MDX files in the repository, so the previously scaffolded admin Blog page and its sidebar entry are removed.*
- Responsive design supporting mobile and desktop layouts

**Core Dashboard Sections**

**Account Management** `[Status: Partially Implemented]`
- Profile information and settings `[Status: Implemented]`
- Security settings: password changing is `[Status: Implemented]`. Two-Factor Authentication (2FA) is `[Status: Planned / Post-Traction]` (to be implemented only once/if the application gets user traction).
- Subscription plan management `[Status: Planned / TO DO]`
- Account deletion option `[Status: Implemented]`

**Profile Management & Onboarding Flow** `[Status: Implemented]` (Navigation link is `[Status: Implemented]`)

This is a single route (`/dashboard/profile-management`) with three different presentations depending on the user's onboarding status. The three presentations are not three routes — they're one route with a server-side render branch based on `isOnboarded` and whether a CV parse result exists.

**The 3-Presentation State Machine:**

- **State 1 — CV Upload Form** (`isOnboarded=false`, no CV parsed):
  - This is the first page a new user sees after sign-up (default redirect target).
  - CV upload modal with mandatory CV naming field (`label`).
  - "Add New CV" prominent action button (Multiple CV upload allowed only for paid users).
  - List view of all uploaded CVs with edit/delete actions (post-onboarding).

- **State 2 — Onboarding Review** (`isOnboarded=false`, CV parse result in session):
  - After the user submits a CV and the Web Worker parsing + LLM extraction is complete.
  - Shows the LLM-extracted data (read-only summary with "edit" toggles for corrections).
  - Shows the LLM-proposed persona(s) — 1 or 2, with 5 `mustHaveTags` pre-filled.
  - User fills in mandatory user-collected fields (country, work preferences).
  - User confirms or adjusts the 5 skills per persona.
  - Single submit → creates `applicant` + `persona(s)` + `workingHistory` + `tagsExperience` + sets `isOnboarded=true`.
  - *Goal: under 3 minutes from upload to "onboarded."*

- **State 3 — Profile Management** (`isOnboarded=true`) `[Status: Partially Implemented]`:
  - Same page, but now in "management mode" (user is already onboarded).
  - Full Applicant section (edit employment history, add jobs, skills update) `[Status: Planned / TO DO]` — currently read-only display of onboarding data.
  - Skills section (view all, deactivate non-critical) `[Status: Planned / TO DO]` — currently read-only display.
  - Persona section (edit existing, add up to 3, delete) `[Status: Planned / TO DO]` — currently read-only display.
  - *Note*: State 3 is implemented as a read-only MVP for Module A. Full editing capabilities (add/remove jobs, deactivate skills, edit/delete personas) are a post-MVP follow-up.

**The 3 UI Sections (States 2 and 3):**

1. **Applicant Section**: Form reflecting user data collected from the CV with possibility to edit existing data and add new data. Also contains mandatory fields not present in the CV (country, `can_work_us_hours`, `assignment_types`, `modalities`, `preferred_compliance`). Editing employment history here is the only way to add/modify skills — skills are derived from work history, maintaining the single-source-of-truth principle.

2. **Skills Section**: Read-only list of all user skills extracted by the LLM, mapped against `CANONICAL_TAGS`. Users cannot delete skills but can only deactivate skills that are not critical for the job position. Users can add skills only by editing the Applicant section form (e.g., adding a new job position with new skills). The content of this form is validated against the `CANONICAL_TAGS` array and is the single source of truth for the skillset selection form used in the Persona section.

3. **Persona Section**: One or multiple (max 3) personas (editable forms) based on one or multiple stacks derived from the user data and skills. Each stack contains core and optional skills, is based on exactly 5 skills (the "5 Major Skills" constraint), and is validated against `CANONICAL_TAGS`. The LLM proposes 1-2 initial personas based on the parsed CV data; the user then edits, adds, or deletes personas. Users must have at least one persona.

**Phase 1: Zero-Tax Client-Side Extraction & Server Action** `[Status: Implemented]`:
  - The browser loads `pdfjs-dist` in **main-thread "fake worker" mode** to extract raw text directly in the client, bypassing server memory limits. The original Web Worker approach was revised because browsers do not allow `pdfjs-dist` to spawn its own internal Worker from inside a custom Web Worker (nested Worker spawning fails silently, producing near-empty text). In fake-worker mode, `pdfjs-dist` detects `globalThis.pdfjsWorker.WorkerMessageHandler` and runs parsing in the same thread. For typical CV PDFs (1-5 pages), extraction takes <500ms on the main thread. See TDD §3.3 for the full architectural rationale.
  - *SSR Compatibility*: `pdfjs-dist` references browser-only APIs (`DOMMatrix`) at module evaluation time. The `extractPdfText()` function uses dynamic `import()` inside the function body so the library only loads in the browser, never during SSR.
  - *Server Action (Parse)*: The client component constructs a `FormData` with the raw text, label, and original filename, then calls the Server Action via `formAction(formData)` inside a `startTransition()` (required by `useActionState` in React 19). The Server Action calls `gpt-4o` via Vercel AI SDK `generateObject()` with `resumeExtractionSchema` (Schema 1). Application-level rate limiting: 3 parses/hour/user.
  - *System Prompt with Canonical Tags*: The `generateObject()` system prompt is built dynamically at runtime to include the full `CANONICAL_TAGS` and `PERSONA_DEFINING_TAGS` lists. Without the tag list, the LLM invents tag names that fail Zod schema validation. The prompt and schema read from the same source (`src/lib/jobs/tech-tags.ts`), so new tags automatically appear in both.
  - *Applicant Row Upsert*: The `parseCvAction` upserts an `applicant` row (with `onConflictDoNothing`) before inserting into `cv_upload`, because the FK constraint requires `applicant.user_id` to exist. First-time users have a Better Auth `user` record but no `applicant` row yet.
  - *Pre-LLM CV Validity*: Before calling the LLM, `validateCvRawText()` rejects raw text < 200 characters or text with no year-like patterns.
  - *AI Processing*: `gpt-4o` applies a Chain-of-Thought Overlap Merge Algorithm to merge overlapping employment date ranges. All extracted skills are normalized against the `CANONICAL_TAGS` dictionary (`src/lib/jobs/tech-tags.ts`). The LLM also proposes 1-2 personas (`proposed_stacks`) with 5 `must_have_tags` each.
  - *Persistence on Parse*: The `cvUpload` row is created immediately (status=`processing`), then updated with `extractedJson` and status=`valid` or `invalid` when the LLM completes. This survives page refreshes.
  - *Toast Notifications*: Sonner toasts provide prominent success/error feedback at the CV upload transition (green toast on successful parse, red toast with error message on failure).

**Phase 2: The Hybrid Mutation Pattern (Save & Vectorize)** `[Status: Implemented]`:
  - The complex dashboard form state is managed via **React Hook Form (RHF)** to handle drag-and-drop interactions and real-time client validation without performance-blocking re-renders.
  - Upon submission, RHF passes the validated data to a Next.js **Server Action** (`useActionState`). The `formAction(formData)` call is wrapped in `startTransition()` (required by React 19's `useActionState` for correct `isPending` tracking). The component constructs a `FormData` manually and calls `formAction` directly, rather than using `requestSubmit()` with hidden fields (which is unreliable in React 19 + Next.js 16).
  - *Post-Action Side Effects*: `router.refresh()` is called inside a `useEffect` that watches the `useActionState` result, not during render. This ensures the page re-render only fires once after the action completes.
  - *Inline Validation Errors*: The form displays validation errors at two levels: a summary error box listing all failed fields, and inline red error text next to each field (country, assignment types, modalities, preferred compliance, persona label/summary/must-have tags). RHF's `formState.errors` is passed to sub-components (`ApplicantSection`, `PersonaSection`) for field-level display.
  - *Toast Notifications*: Sonner toasts provide prominent success/error feedback at the onboarding completion transition (green toast "Onboarding complete!" on success, red toast with server error on failure).
  - *Strict Double-Validation*: The Server Action independently re-validates with `onboardingPayloadSchema.safeParse()` (Schema 2) before interacting with the database or generating `text-embedding-3-small` vectors.
  - *Transactional Re-aggregation*: `recomputeTagsExperience(applicantId)` runs inside a Drizzle PostgreSQL transaction — if it fails halfway, the entire operation rolls back to prevent persona corruption.
  - *Persona Embedding Auto-Regeneration*: When `mustHaveTags` change on any persona, the embedding is automatically regenerated via `text-embedding-3-small`.

**Onboarding Completion Rule**: The applicant's `isOnboarded` flag is set to `true` strictly when ALL of the following are satisfied:
- *User-collected*: `country`, `can_work_us_hours`, `assignment_types` (≥1), `modalities` (≥1), `preferred_compliance` (≥1)
- *LLM-extracted*: ≥1 employment entry with start/end dates, ≥3 canonical skills mapped to `CANONICAL_TAGS`
- *Derived*: ≥1 persona with exactly 5 `mustHaveTags`, `embedding_summary`, and generated `persona_embedding`
- *Experience level* is derived purely at query time from `tagsExperience.yearsOf_experience` (no stored enum field).

**Module A Pending Items (Post-MVP Follow-up)** `[Status: Planned / TO DO]`:

The Module A MVP is functionally complete — the full onboarding flow works end-to-end. The following items are documented as pending with a prioritized timing strategy. The rationale: Module B (ingestion) and Module C (matching) are the core product value — the current MVP sufficiently populates `persona`, `tagsExperience`, and `applicant.allTags` for Module B/C to consume, so only P3 is done immediately before starting Module B.

| # | Item | Priority | When | Rationale |
|---|------|----------|------|-----------|
| P3 | Smart Dashboard Redirection | ✅ Done | Before Module B | Two-layer redirect: signInAction + /dashboard page check isOnboarded |
| P1 | State 3 Full Editing | Critical (pre-launch) | After Module B/C | Read-only is sufficient for testing matching pipeline; full editing is days of UI work |
| P2 | Rate Limiting (3/hour) | Critical (pre-launch) | After Module B/C | Cost protection; pre-launch LLM cost is natural limiter |
| P4 | Multiple CV Upload | Medium (post-launch) | Post-launch | Feature expansion tied to paid-tier |
| P5 | Orphaned Cleanup | Low (post-launch) | Post-launch | Operational hygiene |

See TDD §3.9 for full technical detail on each item.

**Job Discovery & Management** `[Status: Planned / TO DO]` (Navigation link is `[Status: Implemented]`)
- Paginated job listings (10 per page) with responsive tables and search capabilities.
- Filtering options: technology stack, experience level, location, salary range
- Sorting options: relevance, posting date, salary
- Search functionality across all job attributes
- Job detail view with ATS source information
- Archive/delete functionality with 30-day retention period (auto-deleted via cron).
- Bulk actions for managing multiple listings
- Application tracking and status updates

### Ingestion, Seeding & Routing Pipeline `[Status: Partially Implemented]` — Module B (ingestion) is Implemented & Live-Tested; Module C (3-Gate routing) is Planned / TO DO

#### 1. The Seeding & Ingestion Engine (Module B) `[Status: Implemented & Live-Tested ✅]`

The system is fully autonomous — no human-in-the-loop for routine operations. Unresolvable discoveries are discarded, not queued for manual review. Full technical specification in TDD §4.

**Database Tables (Module B):**
- **`company` table** `[Status: Implemented]` — The ATS slug registry. Stores discovered `(ats_slug, ats_source)` tuples with tier (active/dormant/dead), health status, polling state, and discovery provenance. Unique constraint on `(ats_source, ats_slug)`. Drizzle path: `src/db/schemas/jobs/company.ts`.
- **`ingestionLog` table** `[Status: Implemented]` — Observability. Every seeder and poller run is logged with metrics (items processed/inserted/rejected/skipped), error details, and duration. Drizzle path: `src/db/schemas/jobs/ingestionLog.ts`.
- **`job` table updates** `[Status: Implemented]` — Adds `external_job_id` (for dedup via upsert), `last_seen_at` (for stale detection), and `status` (active/stale/gone). New unique index on `(ats_source, ats_slug, external_job_id)`. Drizzle path: `src/db/schemas/jobs/job.ts`.

**Seeders (Discovery):**
- **Monthly BigQuery Volume Seed** `[Status: Implemented]`:
  - Run queries in Google BigQuery against the public `httparchive` dataset using the BigQuery MCP integration. Sandbox Mode (1 TB/month free, no billing required).
  - **⚠️ The `httparchive.technologies` table no longer exists** (reorganized April 2025). Data now lives in `httparchive.crawl.pages` as a nested `technologies.technology` array. All queries must pin a specific monthly `date` partition (30 TB/month table).
  - Detect domains running modern web tech (4 tiers: core frameworks, backend/runtime, build tools/CSS, legacy detectable stacks like PHP/WordPress/Laravel/Rails) whose pages integrate Greenhouse, Lever, or Ashby widgets.
  - **HTTPArchive homepage-only workaround:** Two-phase approach — (1) BigQuery finds candidate domains by tech stack + REGEXP_EXTRACT for direct slug extraction, (2) slug probe resolver handles domains where the slug couldn't be extracted. No HTML scraping.
  - **AI-Assisted Analysis**: Use `ask_data_insights` and `search_catalog` MCP tools for natural language exploration of HTTP Archive data and rapid prototyping of discovery queries.
  - Implementation: domain logic (`src/lib/jobs/seeders/bigquery-seeder.ts`) with injectable BQ client, manual script (`scripts/seed-bigquery.ts`), and Inngest scheduled function (`bigQuerySeeder`, monthly cron `0 0 1 * *`).
- **Weekly Hacker News Algolia Delta Seed** `[Status: Implemented]`:
  - Automatically parse the monthly "Who is Hiring" threads on Hacker News using the Algolia search API. This is the primary "hidden jobs" discovery engine — surfaces 200–500 companies per month, many first-time posters or small startups not in HTTPArchive.
  - Extracts direct ATS URLs (`boards.greenhouse.io/{slug}`, `jobs.lever.co/{slug}`, `jobs.ashbyhq.com/{slug}`) and non-ATS URLs (`mystartup.com/careers`).
  - **Non-ATS URL resolution (autonomous):** Two-stage — (1) DNS CNAME check, (2) slug probe against all three ATS APIs. If both fail, discard the URL — no manual review.
  - Implementation: Inngest scheduled function (`hnAlgoliaSeeder`, weekly cron `0 0 * * 1`) + event-driven custom URL resolver (`customUrlResolver`).
- **crt.sh Stealth Seeder** `[Status: Planned / TO DO — Phase 2, Post-MVP]`:
  - Deferred. HN Algolia is the superior "hidden jobs" pipeline (curated, self-selecting, high signal-to-noise). crt.sh's wildcard query returns millions of certificate records, most not hiring developers. Will use direct PostgreSQL connection (`postgres://guest@crt.sh:5432/certwatch`) with expanded patterns (`%.careers.*`, `%.jobs.*`, `%.join.*`, `%.work.*`, `%.hiring.*`, `%.talent.*`, `%.apply.*`, `%.team.*`) and date constraints when implemented.

**The "Phalanx" Poller** `[Status: Implemented]`:
- An Inngest-driven background worker dynamically processes collected ATS slugs. Three optimizations for production scalability:
  - **Optimization 1 (Concurrency):** Inngest capped at 50 concurrent steps. `bottleneck` enforces 2 req/s per ATS platform (`maxConcurrent: 1, minTime: 500`).
  - **Optimization 2 (Compute separation):** Poller only fetches JSON + inserts to Postgres. AI embeddings deferred to Module C (`job/ingested` event).
  - **Optimization 3 (Decay polling):** Tier A (active, job posted in last 14 days) → poll every 12h. Tier B (dormant, no jobs in >14 days) → poll weekly. Tier C (dead, 404 or 3+ consecutive failures) → stop polling. Tiers recalculated daily by a scheduled Inngest function.
- **Fan-out architecture:** Two scheduled functions (`tierActiveFanOut` every 12h, `tierDormantFanOut` weekly) emit `poller/poll-company` events. Each event triggers a separate `pollCompanyFn` instance (concurrency cap 50). No per-company scheduled functions.
- Pulls job specs from native public JSON endpoints for Greenhouse, Lever, and Ashby (centralized in `src/lib/jobs/ats-endpoints.ts`). ATS adapters (`src/lib/jobs/poller/ats-adapters.ts`) fetch + Zod validate + normalize to a unified `NormalizedJob` shape.
- **Gate 0 (pre-filter):** Synchronous regex title filter rejects non-engineering jobs before database insertion. Optimized for recall — the 3-Gate funnel handles precision.
- **Defensive Zod schemas:** Every ATS response validated with `safeParse()`. Payload changes degrade gracefully (company flagged as `degraded`) rather than crashing the worker.
- **Deduplication:** Upsert on `(ats_source, ats_slug, external_job_id)` unique constraint. Re-polls refresh `lastSeenAt` and `rawJson`. New jobs detected for the B→C handoff event.
- **Stale job cleanup:** Daily Inngest function (`staleCleanup`, cron `0 3 * * *`) marks jobs not seen in 7 days as `stale`, not seen in 30 days as `gone`. Module C only matches `status = 'active'` jobs.
- **B→C handoff:** Poller emits `job/ingested` Inngest event only for genuinely new jobs (not upserts). Module C owns normalization (tag extraction + embedding).
- **Company health tracking:** `updateCompanyState()` tracks `consecutiveFailures` — after 3 consecutive failures, company is auto-marked `dead` and `pollingEnabled = false`. HTTP status codes map to health states (429→rate_limited, 403→blocked, 404→dead, 500+→error).
- **Automated endpoint health monitoring & LLM recovery** `[Status: Planned / TO DO]`: Periodic endpoint probing detects API changes. When an endpoint degrades, an LLM-powered recovery function researches the ATS provider's current docs, proposes and tests a new endpoint, and updates the registry programmatically.
- *Proxy Routing Fallback* `[Status: Planned / TO DO — Post-MVP]`: Deferred. Rate limiter is sufficient for MVP. Trigger to add: first persistent 403 from an ATS.

#### Neon Database Impact Analysis (Module B) `[Status: Implemented]`

**Concern:** The seeders and poller populate the `company` and `job` tables. Unbounded growth could exhaust Neon storage, connection pool, or compute limits. This section documents the expected scale and the safeguards in place.

**Expected row counts (steady-state estimates):**

| Table | Source | Estimated Rows | Rationale |
|-------|--------|---------------|-----------|
| `company` | BigQuery monthly | ~2,000–5,000/month | HTTPArchive finds ~2k–5k domains per monthly crawl running target tech stacks with ATS script URLs. Many will dedup against existing rows (`onConflictDoNothing` on `atsSource+atsSlug`). |
| `company` | HN Algolia weekly | ~200–500/month | HN "Who is Hiring" surfaces 200–500 companies per month. Most are first-time posters not in HTTPArchive. Dedup via `onConflictDoNothing`. |
| `company` (total) | Both seeders | ~10,000–20,000 | After 6–12 months of seeding, the registry stabilizes. Dead companies are auto-disabled (`pollingEnabled = false`) but rows are NOT deleted (preserves discovery history). |
| `job` | Phalanx Poller | ~50,000–150,000 active | Each company has 5–50 open engineering roles on average. Gate 0 filters out ~60–70% of jobs (non-engineering titles). After stale/gone cleanup, the active set stays bounded. |
| `job` (total including stale/gone) | Poller over time | ~200,000–500,000 | Stale jobs (7 days) and gone jobs (30 days) are NOT deleted — they're kept for match history and potential resurrection. This is the long-term growth table. |

**Storage estimate:** At ~500 bytes per job row (title + rawJson + metadata), 500k rows ≈ 250 MB. Neon's free tier includes 3 GB storage; the paid tier (Launch) starts at 10 GB. The `job` table will not exceed Neon limits for years.

**Safeguards implemented:**

1. **Gate 0 title filter (pre-insertion):** Synchronous regex rejects ~60–70% of jobs (non-engineering titles like "Account Executive", "HR Manager") *before* they touch the database. This is the primary volume control — without it, the `job` table would be 3x larger.
2. **Deduplication via upsert:** The `onConflictDoUpdate` on `(atsSource, atsSlug, externalJobId)` ensures re-polls update existing rows rather than inserting duplicates. A company polled 100 times produces the same number of rows as one poll.
3. **`onConflictDoNothing` on seeders:** The company table uses `onConflictDoNothing` on `(atsSource, atsSlug)` — re-discovering the same company doesn't overwrite its polling state or health data.
4. **Stale/gone cleanup (daily):** Jobs not seen in 7 days → `stale`, 30 days → `gone`. Module C only matches `status = 'active'` jobs. This keeps the *active* set bounded (~50k–150k) even as the total table grows.
5. **Decay polling (tier-based):** Dead companies (3+ consecutive failures) are auto-disabled (`pollingEnabled = false`). Dormant companies (no jobs in 14 days) are polled weekly, not every 12h. This reduces poll volume by ~80% vs. polling all companies daily.
6. **Rate limiting (bottleneck):** 2 req/s per ATS platform prevents overwhelming the Neon connection pool. Inngest's concurrency cap (50) limits simultaneous poll function instances.
7. **Compute separation:** The poller only fetches JSON + inserts to Postgres. AI embeddings (expensive, slow) are deferred to Module C's `job/ingested` handler. This keeps poll transactions fast and connection-pool-friendly.
8. **No deletion policy:** Stale/gone jobs are status-flagged, not deleted. This preserves match history (FK integrity for `matchQueue`) and enables resurrection if a company re-posts the same job. Deletion would be premature optimization at this scale.

**Neon-specific considerations:**
- **Autosuspend:** Neon's serverless compute suspends after 5 minutes of inactivity. The first poll after suspension incurs a ~300ms cold-start penalty. This is acceptable for a background poller (not user-facing).
- **Connection pooling:** Neon's pooled connection string (`-pooler` suffix) should be used for the poller's DB connections. The Inngest concurrency cap (50) + bottleneck rate limiting ensures we never exceed Neon's connection limit.
- **Branching:** Neon branches can be used for testing seeders/poller against a copy of production data without affecting the live database.

**When to revisit:** If the `job` table exceeds 1M rows, consider (1) archiving `gone` jobs to a cold storage table, (2) partitioning the `job` table by `detectedAt` month, (3) adding a TTL policy for `gone` jobs older than 1 year. None of these are needed for MVP.

#### Module B Testing Strategy `[Status: ✅ PASSED — All 3 Layers Complete (June 2026)]`

Module B is feature-complete with 464 unit/integration tests passing (103 seeder tests + 32 poller tests + 329 existing). All 3 live testing layers have been completed against real ATS APIs and a real Neon dev branch (`module-b-testing`).

**Testing approach (3 layers, all PASSED):**

**Layer 1 — Live ATS API smoke test (no DB): ✅ PASSED**
- Ran the ATS adapters against known-active slugs per platform (Greenhouse, Lever, Ashby).
- Command: `npx tsx scripts/smoke-ats-apis.ts`
- Verifies: Zod schemas, normalization, rate limiter integration
- Result: All 3 ATS platforms returned valid responses that passed Zod `safeParse()`.
- **Bug found & fixed:** Greenhouse `metadata[].value` can be boolean instead of string — schema updated to `z.any()` with regression test.

**Layer 2 — HN Algolia seeder live run (with DB): ✅ PASSED**
- Ran the HN seeder against the real HN Algolia API with the Neon dev branch.
- Command: `npx tsx scripts/seed-hn-live.ts`
- Verifies: HN API parsing, URL extraction, ATS classification, company table insertion, dedup
- Result: 501 comments processed, 206 ATS URLs found, 60 unique companies inserted, 782 custom URLs queued for resolver.
- **3 bugs found & fixed:**
  1. **HTML entity decoding** — HN Algolia returns `&#x2F;` for `/`, making URLs unparseable. Added `decodeHtmlEntities()` to `extractUrls()` in `url-parser.ts`.
  2. **Two-phase HN fetch** — The broad full-text search matched "Who wants to be hired" threads (job seekers, no ATS URLs). Changed to find the "Who is hiring?" story by `whoishiring` author, then fetch comments by story ID.
  3. **`job-boards.greenhouse.io` hostname** — Alternate Greenhouse board URL not in `ATS_HOST_PATTERNS`. Added with same slug extractor as `boards.greenhouse.io`.

**Layer 3 — Inngest Dev Server integration test: ✅ PASSED (all 5 sub-layers)**

**Layer 3a — Function sync: ✅ PASSED**
- All 10 Inngest functions synced with the Dev Server: `seeder-hn-algolia`, `seeder-resolve-custom-url`, `seeder-bigquery`, `poller-poll-company`, `poller-tier-active-fanout`, `poller-tier-dormant-fanout`, `phalanx-poller`, `poller-tier-recalc`, `poller-stale-cleanup`, `job-ingested-handler`.

**Layer 3b — HN seeder via Inngest: ✅ PASSED**
- Triggered `seeder-hn-algolia` via `npx inngest-cli@latest api invoke-function`.
- All 3 steps completed: `fetch-and-insert` (8s), `write-log` (0.7s), `emit-custom-url-resolution` (8ms).
- ingestionLog: `[seed] success — processed: 501, inserted: 0, skipped: 60` (duplicates from Layer 2).
- `seeder/resolve-custom-url` event emitted successfully.

**Layer 3c — Per-company poll: ✅ PASSED**
- Triggered `phalanx-poller` for vestwell (Greenhouse) and 3 other companies (livekit, permitflow, weave).
- All 3 steps completed: `get-company`, `poll-company`, `emit-job-ingested`.
- Result: 30 jobs fetched, 1 passed Gate 0 (Staff Software Engineer), 29 rejected (non-engineering).
- Job inserted with `extractedTags: []`, `jobEmbedding: null` (Module B → C handoff).
- Company state updated: `lastPolledAt`, `activeJobCount`, `health: healthy`.
- `job/ingested` events emitted, triggering `job-ingested-handler` (Module C entry point).
- Total: 22 jobs inserted across 4 companies (livekit: 13, permitflow: 7, weave: 1, vestwell: 1).

**Layer 3d — Tier recalc + stale cleanup: ✅ PASSED**
- `poller-tier-recalc`: 60 companies updated — 4 → active (recently polled), 56 → dormant.
- `poller-stale-cleanup`: COMPLETED (0 jobs marked stale/gone — all freshly inserted).
- **Bug found & fixed:** Tier recalc raw SQL `UPDATE` failed with `column "tier" is of type company_tier but expression is of type text`. Fixed by casting each CASE branch to `::company_tier`.

**Layer 3e — Fan-out pattern: ✅ PASSED**
- Triggered `poller-tier-active-fanout` — queried active-tier companies due for polling.
- Emitted `poller/poll-company` event for vestwell (reset `lastPolledAt` to null to make it "due").
- `poller-poll-company` function triggered by the event, polled vestwell, completed successfully.
- ingestionLog: `[poll] success — processed: 30, inserted: 0, updated: 1, rejected: 29`.
- Full fan-out → poll-company → job-ingested chain verified.

**Test data cleanup:** Used Neon dev branch `module-b-testing` (copy of production schema, empty data). Branch can be discarded — no cleanup needed on the production database.

**Bugs found and fixed during live testing (4 total):**
1. Greenhouse `metadata[].value` schema drift (boolean instead of string) — `ats-schemas.ts`
2. HN Algolia HTML entity encoding breaking URL extraction — `url-parser.ts`
3. HN Algolia search strategy matching wrong threads — `hn-algolia.ts`
4. PostgreSQL enum cast in tier recalc UPDATE — `tier-queries.ts`

All fixes include regression tests. Total test count: 48 seeder URL-parser tests + 10 HN Algolia tests + 11 ATS schema tests + 20 poller tests = 89 Module B tests (all passing).

#### 2. The 3-Gate Event-Driven Matching Engine (Module C) `[Status: Planned / TO DO]`
When a new job listing is successfully ingested, an asynchronous workflow is triggered by Inngest:
- **Trigger**: Inngest emits a `job/ingested` event.
- **Step 1 (Job Normalization & Vectorization)**:
  - System extracts canonical tech tags from the job posting.
  - Generates a single high-dimensional embedding utilizing `text-embedding-3-small`.
- **Step 2 (Fast Routing via Gate 1 & Gate 2)**:
  - Inngest runs a highly optimized single-pass database query comparing the job against all user personas:
    - **Gate 1 (Exact Filtering)**: Performs overlapping array operations using GIN indexes:
      ```sql
      (job.extracted_tags && users.must_have_tags) AND NOT (job.extracted_tags && users.blocklist_tags)
      ```
    - **Gate 2 (Semantic Similarity)**: Calculates cosine distance over HNSW indexes to find matching personas:
      ```sql
      MAX(job.vector <=> user_personas.persona_embedding)
      ```
    - The top ~8 matching User IDs with acceptable similarity scores are written directly to the `match_queue`.
- **Step 3 (Gate 3 - High-Fidelity AI Arbitration)**:
  - Inngest fans out 8 parallel `job/evaluate/candidate` events.
  - Each durable step runs `gpt-4o-mini` with strict `zod` schemas to run a nuanced evaluation matching specialized requirements (years of experience, context, specific stack interactions).
  - High-confidence matches automatically trigger a real-time notification push to the user's dashboard.

### User Journey Summary
1. **Discovery**: User lands on homepage, understands value proposition `[Status: Implemented]`
2. **Conversion**: User registers/logs in via standard Auth page `[Status: Implemented]`
3. **Onboarding**: Redirected dynamically based on profile status: to `/dashboard/profile-management` for initial CV upload (if `is_onboarded=false`), or `/dashboard/jobs` if already onboarded `[Status: Implemented]` — onboarding flow (CV upload → review → profile management) and smart redirect logic on sign-in/sign-up are both implemented
4. **Engagement**: User manages CVs and profile via `/dashboard/profile-management`, reviews matched job opportunities `[Status: Partially Implemented]` — profile management (read-only MVP) is `[Status: Implemented]`; job matching and review is `[Status: Planned / TO DO]` (Module C)
5. **Application**: User applies to jobs through ATS integration `[Status: Planned / TO DO]`
6. **Retention**: User returns to track applications and discover new opportunities `[Status: Planned / TO DO]`

## Business, Compliance & Go-To-Market (Module D) `[Status: Planned / TO DO]`

### 1. The Outbound "CTO Pitch" Strategy `[Status: Planned / TO DO]`
To secure responses in an oversaturated market, the system empowers the user to reach out with a unique position of strength:
- **"Minute Zero" Pitch**: The dashboard automatically drafts a personalized cold email template referencing the specific technology stack and architectural challenges of the matched job.
- **Peer-to-Peer Framing**: The email is written from the perspective of an engineering partner offering an "architectural chat" or "technical exchange" rather than a candidate begging for an interview. This bypasses low-level HR screenings entirely.

### 2. The Compliance 1-Pager `[Status: Planned / TO DO]`
To reduce friction when dealing with international/domestic B2B arrangements, the platform generates a professional B2B compliance sheet:
- **Independent Contracting Made Easy**: Includes pre-filled PDF/webpage resources detailing how easy it is to pay the contractor as a SaaS vendor.
- **Key Details Covered**: Explains the W-8BEN form (for non-US developers), 0% US withholding tax arrangements, and seamless setup with payment/contract platforms like Deel, Wise, or Direct Wire.
- **Procurement Alignment**: Frames the engagement in standard corporate procurement terms to facilitate quick B2B contract approvals.

### 3. Legal Protection & Terms of Service (ToS) `[Status: Planned / TO DO]`
Operating a high-throughput search and matching platform against third-party platforms requires strict legal boundaries:
- **"User-Driven Job Intelligence Tool" Framing**: The ToS explicitly defines the platform as an automated user-agent. This ensures the app acts on behalf of the individual user when reading publicly accessible data, protecting against platform-level cease and desist challenges.
- **Indemnification**: Full user indemnification clauses regarding CV accuracy and application outcomes.
- **Public Data Disclaimer**: Formally declares that all matched information is derived from publicly visible employer data feeds with no guarantees of uninterrupted access or platform affiliation.


## Hosting Infrastructure

Self-hosted PaaS (Hetzner Cloud + Coolify), chosen for flat solo-developer cost over Vercel's serverless model, at the deliberate cost of losing Next.js Partial Prerendering. Full rationale, cost model, and binding implementation constraints are documented in **TDD Module E** (Sections 7.1–7.4) — not duplicated here to avoid the two documents drifting apart on a decision this consequential.