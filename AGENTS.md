<!-- BEGIN:nextjs-agent-rules -->
# Multi-Tenant Next.js AI Job Routing SaaS

## Project Overview
This is a 3-gate job-matching SaaS that routes unstructured ATS job postings to user personas using GIN indexing (Gate 1), HNSW vector similarity (Gate 2), and LLM arbitration (Gate 3). 
Prioritize performance, accuracy, and developer-centric UX.

## Technology Stack (Strict)
- **Next.js 16.2** (App Router only — no Pages Router)
- **TypeScript** (strict mode - enforced in tsconfig.json)
- **Tailwind CSS 4.3.0** + **Shadcn/ui 4.8.0**
- **Drizzle ORM** + PostgreSQL (Neon) with `pgvector`
- **Better Auth** for authentication
- **Inngest v3** for durable background jobs and workflows
- **Vercel AI SDK** (gpt-4o for complex reasoning, gpt-4o-mini for scale, text-embedding-3-small)
- **Biome** as linter + formatter (never ESLint/Prettier)
- **useActionState + Zod** for forms

# This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Core Architecture Rules
- Use **App Router** exclusively (`app/` directory)
- **Server Components by default** — add `"use client"` only when necessary (interactivity, hooks, browser APIs)
- All database operations must go through **Drizzle ORM** (no raw SQL unless for complex vector/GIN queries)
- Background jobs and ATS polling **must** use **Inngest** durable execution
- Prefer Server Actions for mutations
- Use **Cache Components** for data caching (see `node_modules/next/dist/docs/` for reference)

## Coding Standards
- **Formatting**: Always use Biome (`biome check --apply`)
- **Imports**: Organized automatically by Biome
- **Naming**: `camelCase` for variables/functions, `PascalCase` for components/types
- **Error Handling**: Always handle errors gracefully (never silent failures)
- **Types**: Use strict TypeScript (enforced) + Zod schemas for all external data (ATS payloads, forms)
- **Performance**: Keep queries under 20ms for Gate 1+2. Use indexes properly.

## Data & Caching
- Use **Cache Components** for data caching (see `node_modules/next/dist/docs/` for reference)
- Cache expensive database queries using `cacheLife` and `cacheTag`
- Use `revalidatePath` and `revalidateTag` for cache invalidation

## UI/UX Rules
- Use Shadcn/ui components consistently
- Forms: useActionState + Zod
- Drag-and-drop: `@dnd-kit`
- All new UI must be responsive and accessible
<!-- END:nextjs-agent-rules -->



<!--
BEGIN:agent-rules-on-hold - DISABLED UNTIL FURTHER NOTICE
## Database & Matching Rules (Critical)
- Follow the exact schema in `db/schema.ts` (users, userPersonas, jobs, matchQueue)
- Gate 1: Always use GIN index overlap on `must_have_tags` / `blocklist_tags`
- Gate 2: Use HNSW cosine similarity on persona embeddings (`<=>` operator)
- Gate 3: Use `gpt-4o` or `gpt-4o-mini` for nuanced final evaluation
- Never hallucinate experience years — strictly follow the date-merging algorithm from the TDD
- Use Cache Components for database query caching where appropriate


## Onboarding & PDF Parsing
- PDF parsing must happen **client-side** using `pdfjs-dist` in a Web Worker
- Skill extraction must follow the mandatory Chain-of-Thought algorithm (merge overlapping date ranges, no double-counting)
- Limit "Major Skills" to maximum 5 for `mustHaveTags`

## ATS Ingestion Rules
- Use native Greenhouse/Lever JSON APIs
- Respect rate limits (max 2 req/s per platform using `bottleneck`)
- Seed using HTTP Archive BigQuery + HN Algolia + crt.sh
- Never scrape HTML career pages

## Security & Compliance
- Never expose sensitive ATS credentials
- Position the app as a "User-Driven Job Intelligence Tool"
- Include proper legal framing in cold emails (W-8BEN, B2B compliance)
- Use environment variables for all secrets (never hardcode)

## Development Workflow
- Run `biome check --apply .` before every commit
- Use Inngest dev server for local testing
- Always test the full 3-gate funnel after major changes
END:agent-rules-on-hold
-->
