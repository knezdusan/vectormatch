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
5. **Inngest Orchestration Base** `[Status: Planned / TO DO]` — `app/api/inngest/route.ts` setup.
6. **3-Gate Routing Logic** `[Status: Planned / TO DO]` — Combined GIN + HNSW Drizzle query (Module C, section 5.2).
7. **Ingestion Poller** `[Status: Planned / TO DO]` — Greenhouse/Lever background worker feeding the 3-Gate router (Module B).
8. **Seeders** `[Status: Planned / TO DO]` — HN Algolia + BigQuery scripts for initial company list (Module B).


## Technical Architecture

### Core Tech Stack `[Status: Partially Implemented]`
- **Framework**: Next.js 16 (App Router + Cache Components)
- **Database**: PostgreSQL (Neon) with `pgvector` extension for similarity search
- **ORM**: Drizzle ORM for schema management and type-safe querying
- **Auth**: Better Auth for secure user management and authentication
- **Orchestration**: Inngest v3 for durable, event-driven background jobs and workflows
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

### Ingestion, Seeding & Routing Pipeline `[Status: Planned / TO DO]`

#### 1. The Seeding & Ingestion Engine (Module B) `[Status: Planned / TO DO]`
- **Monthly Public Dataset Seed**:
  - Run high-throughput queries in Google BigQuery against the public `httparchive` dataset.
  - Detect and extract live web domains running Next.js whose landing pages/source code integrate Greenhouse or Lever widgets (identified via scripts contacting `boards-api.greenhouse.io` or `api.lever.co`).
- **Daily Hacker News Algolia Seed**:
  - Automatically parse the monthly "Who is Hiring" threads on Hacker News using the Algolia search API.
  - Pull out hidden and stealth startup ATS slugs embedded in comment text.
- **The "Phalanx" Poller**:
  - An Inngest-driven background worker dynamically processes collected ATS slugs.
  - Runs on priority intervals based on tenant level (Tier A: every 6 hours, Tier B: every 12 hours).
  - Uses the `bottleneck` package to guarantee rate limiting (maximum 2 requests per second per ATS platform).
  - Pulls job specs from native public JSON endpoints (e.g. `/v1/boards/{slug}/jobs`).
  - *Proxy Routing Fallback*: Automatically routes traffic through low-cost residential proxies (Webshare/Smartproxy) if blocked by rate-limits (429) or Cloudflare walls (403).

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
3. **Onboarding**: Redirected dynamically based on profile status: to `/dashboard/profile-management` for initial CV upload (if `is_onboarded=false`), or `/dashboard/jobs` if already onboarded `[Status: Partially Implemented]` — onboarding flow (CV upload → review → profile management) is `[Status: Implemented]`; smart redirect logic on sign-in/sign-up is `[Status: Planned / TO DO]`
4. **Engagement**: User manages CVs and profile via `/dashboard/profile-management`, reviews matched job opportunities `[Status: Partially Implemented]` — profile management (read-only MVP) is `[Status: Implemented]`; job matching and review is `[Status: Planned / TO DO]`
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