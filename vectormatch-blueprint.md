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




## Status Designation Legend
To maintain absolute alignment between this blueprint and the active codebase, every component, module, and table is labeled with one of the following statuses:
- **`[Status: Implemented]`**: The feature or component is fully written, integrated, and active in the current codebase.
- **`[Status: Partially Implemented]`**: The UI structure, routing, or database placeholders exist in the codebase, but core matching logic, background jobs, or third-party integrations are not yet wired up.
- **`[Status: Planned / TO DO]`**: The feature or module is technically architected but has not yet been introduced to the codebase.
- **`[Status: Deprecated — Retained Historically]`**: The code/table exists in the codebase but has been superseded by a newer architectural decision. It is intentionally kept (e.g. to preserve migration history) and must not be referenced by new application code.

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

### Database Schema & Performance Tuning
- **`users` table** `[Status: Partially Implemented]`: Managed by Better Auth.
  - *Drizzle Path*: `src/db/schemas/auth/user.ts`
  - *Planned Extensions `[Status: Planned / TO DO]`*: `location`, `assignment_type`, and `modality` fields.
  - *Gate 1 Optimization `[Status: Planned / TO DO]`*: Contains `must_have_tags` (text array) and `blocklist_tags` (text array) columns. Both are indexed using a **Postgres GIN index** to support instant `&&` (overlap) query operations.
- **`user_personas` table** `[Status: Planned / TO DO]`: Supports multi-persona matching. Contains `persona_label`, `embedding_summary`, and `persona_embedding` (vector 1536).
  - *Gate 2 Optimization*: Indexed using **HNSW** (`USING hnsw (persona_embedding vector_cosine_ops)`) to achieve sub-millisecond vector similarity calculation during routing.
- **`jobs` table** `[Status: Planned / TO DO]`: Stores job listings with `ats_slug`, `title`, `raw_json`, and `extracted_tags` (text array).
- **`match_queue` table** `[Status: Planned / TO DO]`: Maps `job_id` to `user_id` with a `status` state (pending, approved, rejected) to buffer and queue high-fidelity LLM evaluations.
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

**CV Management** `[Status: Planned / TO DO]` (Navigation link is `[Status: Implemented]`)
- List view of all uploaded CVs with edit/delete actions
- "Add New CV" prominent action button (Multiple CV upload allowed only for paid users)
- CV upload modal with mandatory CV naming field
- **Zero-Tax Client-Side Extraction**:
  - The browser loads `pdfjs-dist` inside a background **Web Worker** to extract raw text directly in the client.
  - This avoids Vercel server memory overhead and timeout limitations for large document parsing.
- **AI-Powered Automatic Analysis (Server)**:
  - Extracted text is sent to `gpt-4o` with a structured `zod` schema to guarantee clean JSON.
  - **Overlap Merge Algorithm**: Uses a specialized CoT (Chain-of-Thought) prompt to detect overlapping employment dates and calculate deduplicated, non-double-counted years-of-experience.
  - **Canonical Normalization**: Force matches technologies to a strict list of `CANONICAL_TAGS` (e.g., normalizes "ReactJS", "react.js", and "React" to "react").
  - Extracts chronological employment history, technical skill-sets, and experience level.
- **Developer-Centric Customization**:
  - Extracted data is loaded into a responsive form where users can review and correct errors.
  - **The "5 Major Skills" Constraint**: Users use a drag-and-drop component to select up to 5 major skills. These 5 skills populate the user's active persona and are saved in `must_have_tags` for Gate 1 GIN indexing. This constraint ensures highly targeted matches with zero "muddy" vector overlap.
- Edit modal for reviewing and correcting AI-extracted data
- CV count limits based on subscription tier

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
