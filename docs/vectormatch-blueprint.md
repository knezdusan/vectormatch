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

1. **Database & Schema Layer** `[Status: Implemented]` — Drizzle schemas for `applicant`, `job`, `persona`, `matchQueue` with GIN + HNSW indexes. (Completed in schema-cleanup session, June 2026.)
2. **Client-Side PDF Worker & AI Extraction** `[Status: In Progress]` — `pdfjs-dist` Web Worker + `generateObject` call against `ResumeExtractionSchema`.
3. **Onboarding UI** `[Status: Planned / TO DO]` — React Hook Form ingesting the AI payload, 5-Major-Skills constraint, persona save + embedding generation.
4. **Inngest Orchestration Base** `[Status: Planned / TO DO]` — `app/api/inngest/route.ts` setup.
5. **3-Gate Routing Logic** `[Status: Planned / TO DO]` — Combined GIN + HNSW Drizzle query (Module C, section 5.2).
6. **Ingestion Poller** `[Status: Planned / TO DO]` — Greenhouse/Lever background worker feeding the 3-Gate router (Module B).
7. **Seeders** `[Status: Planned / TO DO]` — HN Algolia + BigQuery scripts for initial company list (Module B).


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
  - *Enum Definitions*: `src/db/schemas/jobs/enums.ts` (`assignment_type`, `modality`, `compliance`)
  - *Onboarding State*: `is_onboarded` (boolean), `country` (ISO 3166-1 alpha-2), `can_work_us_hours` (boolean)
  - *Work Preferences*: `assignment_types` (enum array), `modalities` (enum array), `preferred_compliance` (enum array)
  - *Gate 3 Knowledge Base `[Status: Implemented]`*: Contains `all_tags` (text array) — the global knowledge base used by the LLM arbitrator during high-fidelity candidate evaluation.
- **`persona` table** `[Status: Implemented]`: Supports multi-persona matching. Contains `persona_label`, `embedding_summary`, `persona_embedding` (vector 1536), `must_have_tags` (text array), and `blocklist_tags` (text array).
  - *Gate 1 Optimization*: `must_have_tags` and `blocklist_tags` are indexed using a **Postgres GIN index** to support instant `&&` (overlap) query operations.
  - *Gate 2 Optimization*: Indexed using **HNSW** (`USING hnsw (persona_embedding vector_cosine_ops)`) to achieve sub-millisecond vector similarity calculation during routing.
  - *Business Rule*: To prevent abuse, users are strictly limited to a maximum of 3 personas, enforced at the API/Zod validation layer.
- **`jobs` table** `[Status: Implemented]: Stores job listings with `ats_slug`, `title`, `raw_json`, and `extracted_tags` (text array).
- **`match_queue` table** `[Status: Implemented]: Maps `job_id` to `user_id` with a `status` state (pending, approved, rejected) to buffer and queue high-fidelity LLM evaluations.
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

**Smart Dashboard Redirection Logic** `[Status: Planned / TO DO]`
- **On Sign-Up (New Users)**:
  - Once signed-up, the user must be automatically redirected to the `/dashboard/cv` page. This ensures a natural onboarding workflow where the user is immediately prompted to upload and parse their CV.
- **On Log-In (Existing Users)**:
  - When an existing user logs in, they should be intelligently redirected based on their profile completion:
    - **a) If the user does not have a parsed CV** in the database: redirect them to the `/dashboard/cv` page to complete onboarding.
    - **b) If the user has a parsed CV** in the database: redirect them to the `/dashboard/jobs` page to view active matches.

### Dashboard Area (Authenticated User Workspace)
**Navigation Structure** `[Status: Implemented]`
- Collapsible sidebar with role-based navigation items
- Main navigation items: Account, CV, Jobs
- Admin-only navigation: Admin panel (for user management and system oversight). *Note: there is no blog management in the dashboard — blog content is authored as MDX files in the repository, so the previously scaffolded admin Blog page and its sidebar entry are removed.*
- Responsive design supporting mobile and desktop layouts

**Core Dashboard Sections**

**Account Management** `[Status: Partially Implemented]`
- Profile information and settings `[Status: Implemented]`
- Security settings: password changing is `[Status: Implemented]`. Two-Factor Authentication (2FA) is `[Status: Planned / Post-Traction]` (to be implemented only once/if the application gets user traction).
- Subscription plan management `[Status: Planned / TO DO]`
- Account deletion option `[Status: Implemented]`

**CV Management & Onboarding Flow** `[Status: Planned / TO DO]` (Navigation link is `[Status: Implemented]`)
- List view of all uploaded CVs with edit/delete actions
- "Add New CV" prominent action button (Multiple CV upload allowed only for paid users)
- CV upload modal with mandatory CV naming field
- **Phase 1: Zero-Tax Client-Side Extraction & Streaming API**:
  - The browser loads `pdfjs-dist` inside a background **Web Worker** to extract raw text directly in the client, bypassing Vercel memory limits.
  - *Worker Communication*: The Worker sends the text back to the React Main Thread via `postMessage`.
  - *API & Streaming*: The Main Thread calls the Vercel AI SDK `useObject` hook pointing to a dedicated API route (`/api/onboarding/parse`). This route is kept as a standard API route (not a Server Action) to allow real-time JSON streaming to the UI and to enable strict Cloudflare WAF URL-level rate limiting (protecting OpenAI API costs).
  - *AI Processing*: `gpt-4o` applies a Chain-of-Thought Overlap Merge Algorithm to calculate deduplicated years of experience, forcing all extracted skills to match a predefined `CANONICAL_TAGS` dictionary.
- **Phase 2: Developer-Centric Customization (The UI State)**:
  - Extracted data populates a responsive dashboard interface divided into three sections:
    1. **Applicant Section**: Basic profile and mandatory fields (location, assignment_types, modalities).
    2. **Skills Section**: A read-only list of all LLM-extracted skills mapped against `CANONICAL_TAGS`. Users can deactivate irrelevant skills, but cannot arbitrarily type new ones (maintaining taxonomy integrity).
    3. **Persona Section**: The LLM auto-generates 1-2 initial Personas based on the user's main tech stacks.
  - **The "5 Major Skills" Constraint**: Users use a drag-and-drop UI to refine up to 5 Core Skills per Persona. This prevents "muddy" vector overlap in the database.
- **Phase 3: The Hybrid Mutation Pattern (Save & Vectorize)**:
  - The complex dashboard form state is managed via **React Hook Form (RHF)** to handle drag-and-drop interactions and real-time client validation without performance-blocking re-renders.
  - Upon submission, RHF passes a JSON-stringified payload via `FormData` to a Next.js **Server Action** (`useActionState`). 
  - *Architectural Trade-off & Security*: By passing stringified JSON, we explicitly accept the loss of progressive enhancement (the form requires JS to submit). However, the Server Action **strictly enforces double-validation** by re-running `Zod.safeParse()` on the server before interacting with the database or generating the `text-embedding-3-small` vectors.
- **Onboarding Completion Rule**: The applicant's `isOnboarded` flag is set to `true` strictly when they have successfully saved at least one Persona AND completed all mandatory profile fields.

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
3. **Onboarding**: Redirected dynamically based on profile status: to `/dashboard/cv` for initial CV upload, or `/dashboard/jobs` if CV has already been parsed `[Status: Planned / TO DO]`
4. **Engagement**: User manages CVs, reviews matched job opportunities `[Status: Planned / TO DO]`
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