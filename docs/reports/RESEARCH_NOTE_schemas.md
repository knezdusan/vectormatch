# RESEARCH NOTE: Module A Schemas, CANONICAL_TAGS, and CANONICAL_ROLES

**Status:** Step 1 deliverable (Research Phase) — for review before Step 2 (Decision Phase)
**Date:** June 2026
**Scope:** Module A (Developer-Centric Onboarding) — defines the data contracts that all subsequent implementation depends on

---

## 0. Executive Summary

This document resolves three research questions that block Module A implementation:

1. **CV extraction schema standard** — JSON Resume is adopted as the structural base for Schema 1 (LLM output), extended with VectorMatch-specific canonical/raw tag dual-storage.
2. **CANONICAL_TAGS content** — seeded from the Stack Overflow Developer Survey 2025 technology taxonomy, classified into `persona_defining` vs `supporting` and grouped by `category`. Drafted as a markdown table of ~120 entries (initial pass; target ~300 after real-CV testing).
3. **CANONICAL_ROLES content** — seeded from O*NET SOC 15-0000 (Computer and Mathematical Occupations) and cross-referenced with Stack Overflow's developer-type self-identification categories. Drafted as a markdown table of ~90 entries.

**Key decision required from you:** Review the `persona_defining` vs `supporting` classifications in Section 4 — these are judgment calls that affect persona creation and must be validated against your domain understanding before they become code.

---

## 1. CV Extraction Schema Research

### 1.1 Candidates Evaluated

| Standard | License | Format | Fit for VectorMatch | Verdict |
|---|---|---|---|---|
| **JSON Resume** | MIT | JSON Schema | Strong — developer-native, `work[]` maps to `workingHistory`, `skills[].keywords[]` maps to canonical tags | **ADOPTED** |
| schema.org Person + Occupation | CC BY-SA | RDF/JSON-LD | Weak — designed for SEO structured data, too coarse (`jobTitle`, `knowsAbout`) | Rejected (SEO only) |
| LinkedIn Profile API | Proprietary | JSON | Reference only — fields optimized for LinkedIn's social graph (endorsements, recommendations) | Rejected (proprietary) |
| HR-XML / OAGIS | Commercial | XML | Overkill — enterprise HR standard covering payroll, benefits, recruiting workflows | Rejected (scope) |

### 1.2 JSON Resume Structure (v1.0.0)

The full JSON Resume schema defines these top-level sections:

```json
{
  "basics": { "name", "label", "email", "phone", "url", "summary", "location": {}, "profiles": [] },
  "work": [{ "name", "position", "url", "startDate", "endDate", "summary", "highlights": [] }],
  "volunteer": [...],
  "education": [{ "institution", "area", "studyType", "startDate", "endDate", "score", "courses": [] }],
  "awards": [...],
  "certificates": [...],
  "publications": [...],
  "skills": [{ "name", "level", "keywords": [] }],
  "languages": [...],
  "interests": [...],
  "references": [...],
  "projects": [{ "name", "startDate", "endDate", "description", "highlights": [], "url" }]
}
```

### 1.3 What We Adopt from JSON Resume

**Adopted (MVP):**
- `work[]` array structure → maps to our `workingHistory` table
  - `work[].name` → `workingHistory.company`
  - `work[].position` → `workingHistory.role`
  - `work[].startDate` → `workingHistory.startDate`
  - `work[].endDate` → `workingHistory.endDate`
  - `work[].summary` → (not stored in MVP; could add later for Gate 3 context)
  - `work[].highlights` → (not stored in MVP)

**Adopted with modification:**
- `skills[].keywords[]` concept → we split this into `canonicalSkillsDetected` + `rawSkillsDetected` per role. JSON Resume doesn't separate canonical from raw; this is our VectorMatch-specific extension for tag normalization.

**Rejected for MVP (scope creep — not needed for the 3-gate funnel):**
- `volunteer[]` — not relevant for job matching
- `education[]` — could be useful for Gate 3 later, but not in MVP
- `awards[]`, `certificates[]`, `publications[]` — not needed
- `languages[]` — not needed (we store `country` on `applicant`)
- `interests[]`, `references[]` — not needed
- `projects[]` — not needed (work history covers this)
- `basics.profiles[]` — not needed (we don't scrape social media)

### 1.4 What We Add Beyond JSON Resume

| Addition | Reason |
|---|---|
| `canonicalSkillsDetected` per role | Tag normalization against `CANONICAL_TAGS` — enables GIN index overlap in Gate 1 |
| `rawSkillsDetected` per role | Audit trail of original CV text before normalization — enables re-normalization if `CANONICAL_TAGS` changes |
| `isCurrent` per role | JSON Resume uses `endDate` absence for current roles; we make it explicit for query clarity |
| Top-level `canonicalSkillsDetected` / `rawSkillsDetected` aggregates | Convenience for the UI — the union of all per-role tags |

---

## 2. Schema 1 — Raw LLM Extraction Output

**Definition:** What `gpt-4o` returns from parsing the PDF text. This is the `extractedJson` column in the `cvUpload` table. It is inherently probabilistic — confidence varies per field, some fields may be null, dates may be ambiguous. It is NOT persisted to `workingHistory` or `tagsExperience` until the user reviews and confirms (Schema 2).

**Design principle:** The LLM returns raw `roles[]` data. The server computes `yearsOfExperience` from the merged date ranges — the LLM does NOT return a top-level `calculated_years_of_experience`. This is the anti-hallucination principle: the LLM shows its work (the date ranges), but the math is done in TypeScript.

### Schema 1 Shape (Zod — to be finalized in Step 4)

```typescript
// Schema 1: Raw LLM extraction output (stored in cvUpload.extractedJson)
// This is what gpt-4o returns. Messy, probabilistic, pre-user-review.

const Schema1Role = z.object({
  company: z.string().describe("Company name as written in CV"),
  title: z.string().describe("Job title as written in CV"),
  start_date: z.string().describe("YYYY-MM format. If only year is available, use YYYY-01"),
  end_date: z.string().nullable().describe("YYYY-MM format. Null if is_current is true"),
  is_current: z.boolean().describe("True if this is the user's current position"),
  summary: z.string().nullable().describe("1-2 sentence role description if present in CV. Null if absent."),
  canonical_skills_detected: z.array(z.string())
    .describe("Skills from this role, normalized against CANONICAL_TAGS"),
  raw_skills_detected: z.array(z.string())
    .describe("Skills as written in CV, before normalization"),
});

const Schema1LLMOutput = z.object({
  // Per-role data — the single source for workingHistory
  roles: z.array(Schema1Role).min(1),

  // Aggregated across all roles (union of per-role arrays)
  canonical_skills_detected: z.array(z.string())
    .describe("Union of all canonical_skills_detected across all roles"),
  raw_skills_detected: z.array(z.string())
    .describe("Union of all raw_skills_detected across all roles"),

  // LLM-proposed stacks (1-2) — NOT persisted to persona until user confirms
  proposed_stacks: z.array(z.object({
    anchor_tag: z.string().describe("The persona_defining tag that anchors this stack"),
    persona_label: z.string().describe("Proposed persona label, e.g. 'Senior React Developer'"),
    persona_id: z.string().describe("Proposed persona ID slug, e.g. 'react_frontend'"),
    must_have_tags: z.array(z.string()).length(5)
      .describe("Exactly 5 canonical tags for this stack"),
    embedding_summary: z.string()
      .describe("3-sentence dense summary for embedding generation"),
  })).min(1).max(2),
})
// Refinement: each proposed stack must contain at least 1 persona_defining tag
.refine(
  (data) => data.proposed_stacks.every(stack =>
    stack.must_have_tags.some(tag => PERSONA_DEFINING_TAGS.has(tag))
  ),
  { message: "Each proposed stack must contain at least 1 persona_defining tag" }
);
```

**Note on `proposed_stacks`:** This is new in this research note. The LLM doesn't just extract data — it also proposes 1-2 stacks (personas) based on the extracted skills. These are *proposals* that the user reviews and confirms in the onboarding UI (State 2). They are NOT persisted to the `persona` table until the user submits the onboarding form.

---

## 3. Schema 2 — Validated/Normalized Applicant Data

**Definition:** What's left after the user reviews, corrects, and confirms the Schema 1 extraction in the onboarding UI, PLUS the user-collected fields (country, work preferences). This is what's safe to persist. It is a superset of Schema 3 (the DB schema).

**Design principle:** Schema 2 is the complete onboarding payload submitted by the form. It includes:
- Corrected/confirmed work history (from Schema 1, possibly edited)
- Corrected/confirmed skills (from Schema 1, possibly with deactivations)
- User-collected personal/preferences data (never from LLM)
- Confirmed persona(s) (from Schema 1 `proposed_stacks`, possibly edited)

### Schema 2 Shape (Zod — to be finalized in Step 4)

```typescript
// Schema 2: Validated onboarding submission (the complete form payload)
// This is what the Server Action receives and persists to Schema 3.

const Schema2WorkHistoryEntry = z.object({
  company: z.string().min(1),
  role: z.string().min(1),  // Validated against CANONICAL_ROLES (dropdown) or free-text
  startDate: z.string().regex(/^\d{4}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
  isCurrent: z.boolean(),
  summary: z.string().nullable(),  // Deferred feature, but column exists (Q9 decision)
  canonicalSkillsDetected: z.array(z.string()),
  rawSkillsDetected: z.array(z.string()),
});

const Schema2Persona = z.object({
  personaId: z.string().min(1),
  personaLabel: z.string().min(1),
  embeddingSummary: z.string().min(50).max(500),
  mustHaveTags: z.array(z.string()).length(5),  // Exactly 5, validated against CANONICAL_TAGS
  blocklistTags: z.array(z.string()).default([]),
});

const Schema2OnboardingPayload = z.object({
  // User-collected (never from LLM)
  country: z.string().length(2),  // ISO 3166-1 alpha-2
  canWorkUsHours: z.boolean(),
  assignmentTypes: z.array(z.enum([...])).min(1),
  modalities: z.array(z.enum([...])).min(1),
  preferredCompliance: z.array(z.enum([...])).min(1),

  // LLM-extracted, user-confirmed
  cvUploadId: z.string().uuid(),
  workHistory: z.array(Schema2WorkHistoryEntry).min(1),

  // LLM-proposed, user-confirmed
  personas: z.array(Schema2Persona).min(1).max(3),
});
```

---

## 4. Schema 3 — DB Schema (Current State + Required Additions)

**Definition:** The actual Drizzle ORM tables. This is a subset and transformation of Schema 2, not a copy. Schema 3 is the single source of truth for the application at runtime.

### 4.1 Current Tables (Implemented)

| Table | Status | Notes |
|---|---|---|
| `applicant` | Implemented | Needs no structural changes for Module A |
| `persona` | Implemented | Needs no structural changes |
| `job` | Implemented | Module B/C concern |
| `matchQueue` | Implemented | Module C concern |

### 4.2 New Tables (Required for Module A)

| Table | Status | Purpose |
|---|---|---|
| `cvUpload` | **Generated** (this session) | Stores raw CV text + LLM extraction JSON + lifecycle status |
| `workingHistory` | **Pending** (Step 3) | Single source of truth for user's work history, per-CV |
| `tagsExperience` | **Pending** (Step 3) | Single source of truth for user's skills + years of experience |

### 4.3 Schema 3 → Schema 2 Mapping

| Schema 2 field | Schema 3 destination |
|---|---|
| `country`, `canWorkUsHours`, `assignmentTypes`, `modalities`, `preferredCompliance` | `applicant` table (upsert) |
| `cvUploadId` | `cvUpload.id` (already exists from parse step) |
| `workHistory[]` | `workingHistory` table (insert, linked to `cvUploadId`) |
| (derived from `workHistory`) | `tagsExperience` table (computed by `recomputeTagsExperience()`) |
| `personas[]` | `persona` table (insert, with `personaEmbedding` generated from `embeddingSummary`) |
| (derived from `tagsExperience`) | `applicant.allTags` (rebuilt as union of active tags) |
| — | `applicant.isOnboarded` set to `true` |

---

## 5. CANONICAL_TAGS Research

### 5.1 Source: Stack Overflow Developer Survey 2025

The Stack Overflow Developer Survey is the most empirically grounded classification of "what developers actually use." The 2025 survey (~31,000 respondents) uses these technology categories:

1. **Programming, scripting, and markup languages** — JavaScript, Python, TypeScript, Java, C#, etc.
2. **Web frameworks and technologies** — React, Node.js, Next.js, Express, Django, etc.
3. **Databases** — PostgreSQL, MySQL, MongoDB, Redis, SQLite, etc.
4. **Cloud platforms and tools** — AWS, Docker, Kubernetes, Terraform, etc.
5. **Other frameworks and libraries** — .NET, Pandas, NumPy, TensorFlow, etc.
6. **Embedded technologies** — Raspberry Pi, Arduino (out of scope for MVP)

### 5.2 Our Category Mapping

We map the SO categories to our `category` field, with one addition (`methodology` for non-technology process tags):

| Our `category` | SO Survey equivalent | Examples |
|---|---|---|
| `language` | Programming languages | javascript, typescript, python, go, rust |
| `frontend` | Web frameworks (frontend) | react, vue, angular, svelte, solid |
| `backend` | Web frameworks (backend) + runtimes | node, express, django, fastapi, spring |
| `database` | Databases | postgresql, mysql, mongodb, redis |
| `devops` | Cloud platforms + tools | aws, docker, kubernetes, terraform |
| `library` | Other frameworks and libraries | pandas, tensorflow, prisma, drizzle |
| `mobile` | (SO mobile frameworks) | swift, kotlin, flutter, react-native |
| `methodology` | (not in SO survey) | agile, scrum, kanban, ci-cd, tdd |

### 5.3 Classification Criteria: `persona_defining` vs `supporting`

**`persona_defining`** — A tag that can be the primary professional identity of a developer. A developer whose primary stack is this tag would have a job title like "[Tag] Developer" or "[Tag] Engineer."

Test: "Is there a common job title that has this tag as its primary noun?"
- `react` → "React Developer" ✓ → persona_defining
- `python` → "Python Developer" / "Python Engineer" ✓ → persona_defining
- `postgresql` → "PostgreSQL DBA" exists, but most PostgreSQL users are "Backend Developers" not "PostgreSQL Developers" ✗ → supporting
- `docker` → "Docker Engineer" is not a common title ✗ → supporting
- `css` → "CSS Developer" is not a real job title ✗ → supporting

**`supporting`** — Technologies and methodologies that enhance a persona but don't define one. A developer doesn't call themselves a "[Tag] Developer" based on this tag alone.

### 5.4 Draft CANONICAL_TAGS Table

**Scope note:** This is an initial draft of ~120 entries. The target is ~300 after real-CV testing reveals gaps. Entries are grouped by category. The `persona_defining`/`supporting` classification is a judgment call — **please review and flag any you disagree with.**

#### Languages

| tag | label | classification | category |
|---|---|---|---|
| javascript | JavaScript | persona_defining | language |
| typescript | TypeScript | persona_defining | language |
| python | Python | persona_defining | language |
| java | Java | persona_defining | language |
| csharp | C# | persona_defining | language |
| go | Go | persona_defining | language |
| rust | Rust | persona_defining | language |
| php | PHP | persona_defining | language |
| ruby | Ruby | persona_defining | language |
| swift | Swift | persona_defining | language |
| kotlin | Kotlin | persona_defining | language |
| c | C | persona_defining | language |
| cpp | C++ | persona_defining | language |
| cplusplus | C++ | persona_defining | language |
| scala | Scala | persona_defining | language |
| elixir | Elixir | persona_defining | language |
| clojure | Clojure | persona_defining | language |
| haskell | Haskell | persona_defining | language |
| dart | Dart | persona_defining | language |
| lua | Lua | persona_defining | language |
| r | R | persona_defining | language |
| julia | Julia | persona_defining | language |
| sql | SQL | supporting | language |
| html | HTML | supporting | language |
| css | CSS | supporting | language |
| bash | Bash/Shell | supporting | language |
| powershell | PowerShell | supporting | language |

#### Frontend Frameworks

| tag | label | classification | category |
|---|---|---|---|
| react | React | persona_defining | frontend |
| nextjs | Next.js | persona_defining | frontend |
| vue | Vue | persona_defining | frontend |
| nuxt | Nuxt | supporting | frontend |
| angular | Angular | persona_defining | frontend |
| svelte | Svelte | persona_defining | frontend |
| sveltekit | SvelteKit | supporting | frontend |
| solidjs | SolidJS | persona_defining | frontend |
| astro | Astro | supporting | frontend |
| remix | Remix | supporting | frontend |
| gatsby | Gatsby | persona_defining | frontend |
| jquery | jQuery | supporting | frontend |
| htmx | HTMX | supporting | frontend |
| alpinejs | Alpine.js | supporting | frontend |
| tailwindcss | Tailwind CSS | supporting | frontend |
| bootstrap | Bootstrap | supporting | frontend |
| sass | Sass/SCSS | supporting | frontend |
| styled-components | Styled Components | supporting | frontend |
| redux | Redux | supporting | frontend |
| zustand | Zustand | supporting | frontend |
| react-query | React Query | supporting | frontend |
| tanstack-query | TanStack Query | supporting | frontend |

#### Backend Frameworks & Runtimes

| tag | label | classification | category |
|---|---|---|---|
| nodejs | Node.js | persona_defining | backend |
| express | Express | persona_defining | backend |
| fastify | Fastify | persona_defining | backend |
| nestjs | NestJS | persona_defining | backend |
| deno | Deno | persona_defining | backend |
| bun | Bun | persona_defining | backend |
| django | Django | persona_defining | backend |
| flask | Flask | persona_defining | backend |
| fastapi | FastAPI | persona_defining | backend |
| rails | Ruby on Rails | persona_defining | backend |
| spring | Spring | persona_defining | backend |
| spring-boot | Spring Boot | persona_defining | backend |
| laravel | Laravel | persona_defining | backend |
| aspnet | ASP.NET | persona_defining | backend |
| gin | Gin | persona_defining | backend |
| phoenix | Phoenix | persona_defining | backend |
| actix | Actix | persona_defining | backend |
| graphql | GraphQL | supporting | backend |
| apollo | Apollo | supporting | backend |
| trpc | tRPC | supporting | backend |
| prisma | Prisma | supporting | backend |
| drizzle | Drizzle ORM | supporting | backend |
| typeorm | TypeORM | supporting | backend |
| sequelize | Sequelize | supporting | backend |
| sqlalchemy | SQLAlchemy | supporting | backend |
| mongoose | Mongoose | supporting | backend |
| redis | Redis | supporting | backend |
| websocket | WebSocket | supporting | backend |
| grpc | gRPC | supporting | backend |
| rest | REST API | supporting | backend |

#### Databases

| tag | label | classification | category |
|---|---|---|---|
| postgresql | PostgreSQL | supporting | database |
| mysql | MySQL | supporting | database |
| mongodb | MongoDB | supporting | database |
| sqlite | SQLite | supporting | database |
| mariadb | MariaDB | supporting | database |
| mssql | Microsoft SQL Server | supporting | database |
| oracle | Oracle DB | supporting | database |
| dynamodb | DynamoDB | supporting | database |
| cassandra | Cassandra | supporting | database |
| elasticsearch | Elasticsearch | supporting | database |
| supabase | Supabase | supporting | database |
| firebase | Firebase | supporting | database |
| planetscale | PlanetScale | supporting | database |
| neo4j | Neo4j | supporting | database |
| influxdb | InfluxDB | supporting | database |

#### DevOps, Cloud & Infrastructure

| tag | label | classification | category |
|---|---|---|---|
| aws | AWS | persona_defining | devops |
| azure | Azure | persona_defining | devops |
| gcp | Google Cloud | persona_defining | devops |
| docker | Docker | supporting | devops |
| kubernetes | Kubernetes | persona_defining | devops |
| terraform | Terraform | supporting | devops |
| ansible | Ansible | supporting | devops |
| helm | Helm | supporting | devops |
| ci-cd | CI/CD | supporting | devops |
| github-actions | GitHub Actions | supporting | devops |
| gitlab-ci | GitLab CI | supporting | devops |
| jenkins | Jenkins | supporting | devops |
| nginx | Nginx | supporting | devops |
| traefik | Traefik | supporting | devops |
| vercel | Vercel | supporting | devops |
| netlify | Netlify | supporting | devops |
| cloudflare | Cloudflare | supporting | devops |
| linux | Linux | supporting | devops |
| prometheus | Prometheus | supporting | devops |
| grafana | Grafana | supporting | devops |

#### Mobile

| tag | label | classification | category |
|---|---|---|---|
| react-native | React Native | persona_defining | mobile |
| flutter | Flutter | persona_defining | mobile |
| xamarin | Xamarin | persona_defining | mobile |
| ionic | Ionic | persona_defining | mobile |
| android | Android | persona_defining | mobile |
| ios | iOS | persona_defining | mobile |

#### Data & AI/ML Libraries

| tag | label | classification | category |
|---|---|---|---|
| tensorflow | TensorFlow | persona_defining | library |
| pytorch | PyTorch | persona_defining | library |
| pandas | Pandas | supporting | library |
| numpy | NumPy | supporting | library |
| scikit-learn | scikit-learn | supporting | library |
| openai | OpenAI API | supporting | library |
| langchain | LangChain | supporting | library |
| huggingface | Hugging Face | supporting | library |
| spark | Apache Spark | persona_defining | library |
| kafka | Apache Kafka | supporting | library |
| rabbitmq | RabbitMQ | supporting | library |

#### Methodologies & Practices

| tag | label | classification | category |
|---|---|---|---|
| agile | Agile | supporting | methodology |
| scrum | Scrum | supporting | methodology |
| kanban | Kanban | supporting | methodology |
| tdd | TDD | supporting | methodology |
| bdd | BDD | supporting | methodology |
| git | Git | supporting | methodology |
| code-review | Code Review | supporting | methodology |
| pair-programming | Pair Programming | supporting | methodology |

#### Testing

| tag | label | classification | category |
|---|---|---|---|
| jest | Jest | supporting | library |
| vitest | Vitest | supporting | library |
| playwright | Playwright | supporting | library |
| cypress | Cypress | supporting | library |
| selenium | Selenium | supporting | library |
| testing-library | Testing Library | supporting | library |
| junit | JUnit | supporting | library |
| pytest | pytest | supporting | library |

**Draft total: ~130 entries.** The target of ~300 will be reached by:
- Adding more niche languages (OCaml, Erlang, Crystal, Zig, Nim)
- Adding more frontend libraries (Three.js, D3.js, Chart.js, Framer Motion)
- Adding more backend tools (Bull, Temporal, Inngest, Resend)
- Adding more DevOps tools (Pulumi, ArgoCD, Spinnaker)
- Adding more data tools (dbt, Airflow, Dagster, Databricks)
- These additions should be driven by real CV parsing, not speculation

---

## 6. CANONICAL_ROLES Research

### 6.1 Sources

**Primary: O*NET SOC 15-0000 (Computer and Mathematical Occupations)**

The U.S. Department of Labor's O*NET database provides government-maintained, principled taxonomy of computer occupations. The relevant SOC codes:

| SOC Code | O*NET Title | Bright Outlook |
|---|---|---|
| 15-1211.00 | Computer Systems Analysts | ✓ |
| 15-1211.01 | Health Informatics Specialists | ✓ |
| 15-1212.00 | Information Security Analysts | ✓ |
| 15-1221.00 | Computer and Information Research Scientists | ✓ |
| 15-1231.00 | Computer Network Support Specialists | |
| 15-1232.00 | Computer User Support Specialists | |
| 15-1241.00 | Computer Network Architects | ✓ |
| 15-1241.01 | Telecommunications Engineering Specialists | ✓ |
| 15-1242.00 | Database Administrators | |
| 15-1243.00 | Database Architects | ✓ |
| 15-1243.01 | Data Warehousing Specialists | ✓ |
| 15-1244.00 | Network and Computer Systems Administrators | |
| 15-1251.00 | Computer Programmers | |
| 15-1252.00 | Software Developers | ✓ |
| 15-1253.00 | Software Quality Assurance Analysts and Testers | ✓ |
| 15-1254.00 | Web Developers | ✓ |
| 15-1255.00 | Web and Digital Interface Designers | ✓ |
| 15-1255.01 | Video Game Designers | ✓ |
| 15-1299.01 | Web Administrators | ✓ |
| 15-1299.02 | Geographic Information Systems Technologists | ✓ |
| 15-1299.03 | Document Management Specialists | |
| 15-1299.04 | Penetration Testers | |
| 15-1299.05 | Information Security Engineers | |
| 15-1299.06 | Digital Forensics Analysts | |
| 15-1299.07 | Blockchain Engineers | ✓ |
| 15-1299.08 | Computer Systems Engineers/Architects | ✓ |
| 15-1299.09 | Information Technology Project Managers | |

**Secondary: Stack Overflow Developer Survey 2025 — Developer Type**

The SO survey asks developers to self-identify their role. The top responses (2025):
- Developer, full-stack (27%)
- Developer, back-end (14.2%)
- Architect, software or solutions (6.1%)
- Developer, desktop or enterprise applications (4.3%)
- Developer, front-end (4.3%)
- Developer, mobile (3%)
- Developer, embedded applications or devices (2.8%)
- Engineering manager (2.4%)
- DevOps engineer or professional (2.3%)
- Data engineer (1.7%)
- AI/ML engineer (1.4%)
- Data scientist (1.2%)
- Cybersecurity or InfoSec professional (1.1%)
- System administrator (1%)
- Cloud infrastructure engineer (1%)
- Developer, game or graphics (0.9%)
- Data or business analyst (0.9%)
- Developer, QA or test (0.8%)
- Site reliability engineer (0.1%)

### 6.2 Synthesis Strategy

O*NET gives us ~27 official titles. Stack Overflow gives us ~20 self-identification labels. Neither is sufficient alone:
- O*NET is too formal ("Computer and Information Research Scientists" — no CV uses this)
- SO is too informal ("Developer, back-end" — CVs say "Backend Developer")

We synthesize by:
1. Starting with O*NET as the authoritative base
2. Adding common industry variants (Senior, Lead, Staff prefixes; Frontend/Backend/Fullstack specializations)
3. Adding SO developer types that map to real CV job titles
4. Adding modern/emerging roles not yet in O*NET (ML Engineer, Platform Engineer, DevRel)

### 6.3 Draft CANONICAL_ROLES Table

**Scope note:** ~90 entries. The `workingHistory.role` column is free-text (not an enum), so this list is for the UI dropdown with "Other" fallback. It does not need to be exhaustive — it needs to cover the ~90% case.

#### Software Development (Core)

| Role | O*NET SOC | Notes |
|---|---|---|
| Software Developer | 15-1252 | O*NET base title |
| Software Engineer | 15-1252 | Industry standard variant |
| Junior Software Engineer | 15-1252 | Junior variant |
| Mid-level Software Engineer | 15-1252 | Mid-level variant |
| Senior Software Engineer | 15-1252 | Senior variant |
| Staff Software Engineer | 15-1252 | Staff variant |
| Principal Software Engineer | 15-1252 | Principal variant |
| Lead Software Engineer | 15-1252 | Lead variant |
| Full Stack Developer | 15-1252/1254 | SO: most common self-ID |
| Junior Full Stack Developer | 15-1252/1254 | Junior variant |
| Senior Full Stack Engineer | 15-1252/1254 | Senior variant |
| Frontend Developer | 15-1254 | SO: "Developer, front-end" |
| Junior Frontend Developer | 15-1254 | Junior variant |
| Senior Frontend Developer | 15-1254 | Senior variant |
| Frontend Engineer | 15-1254 | Engineer variant |
| Backend Developer | 15-1252 | SO: "Developer, back-end" |
| Junior Backend Developer | 15-1252 | Junior variant |
| Senior Backend Developer | 15-1252 | Senior variant |
| Backend Engineer | 15-1252 | Engineer variant |
| Web Developer | 15-1254 | O*NET base title |
| Junior Web Developer | 15-1254 | Junior variant |
| Senior Web Developer | 15-1254 | Senior variant |
| Computer Programmer | 15-1251 | O*NET base title |

#### Architecture & Systems

| Role | O*NET SOC | Notes |
|---|---|---|
| Software Architect | 15-1299.08 | O*NET: "Computer Systems Engineers/Architects" |
| Solutions Architect | 15-1299.08 | O*NET sample title |
| Systems Architect | 15-1299.08 | O*NET sample title |
| Cloud Architect | 15-1241 | Derived from Computer Network Architects |
| Data Architect | 15-1243 | O*NET: "Database Architects" |
| Enterprise Architect | 15-1299.08 | Industry variant |
| Technical Architect | 15-1299.08 | Industry variant |
| Platform Engineer | 15-1299.08 | Modern emerging role |
| Infrastructure Engineer | 15-1299.08 | O*NET sample title |
| Systems Engineer | 15-1299.08 | O*NET sample title |

#### DevOps & SRE

| Role | O*NET SOC | Notes |
|---|---|---|
| DevOps Engineer | 15-1299.08 | SO: "DevOps engineer or professional" |
| Senior DevOps Engineer | 15-1299.08 | Senior variant |
| Site Reliability Engineer | 15-1299.08 | SO: "SRE" |
| SRE | 15-1299.08 | Abbreviation variant |
| Cloud Infrastructure Engineer | 15-1299.08 | SO: "Cloud infrastructure engineer" |
| Release Engineer | 15-1299.08 | Industry variant |
| Build Engineer | 15-1299.08 | Industry variant |
| Automation Engineer | 15-1299.08 | Industry variant |

#### Data & AI/ML

| Role | O*NET SOC | Notes |
|---|---|---|
| Data Scientist | 15-2051 | O*NET: "Data Scientists" |
| Senior Data Scientist | 15-2051 | Senior variant |
| Data Engineer | 15-1252 | SO: "Data engineer" |
| Senior Data Engineer | 15-1252 | Senior variant |
| Machine Learning Engineer | 15-1252 | SO: "AI/ML engineer" |
| ML Engineer | 15-1252 | Abbreviation variant |
| AI Engineer | 15-1252 | Industry variant |
| Data Analyst | 15-2031 | Industry variant |
| Business Intelligence Analyst | 15-2031 | Industry variant |
| BI Developer | 15-2031 | Industry variant |
| Data Analyst | 15-2031 | O*NET adjacent |
| Statistician | 15-2041 | O*NET base title |

#### Mobile & Specialized Development

| Role | O*NET SOC | Notes |
|---|---|---|
| Mobile Developer | 15-1252 | SO: "Developer, mobile" |
| iOS Developer | 15-1252 | Platform-specific |
| Android Developer | 15-1252 | Platform-specific |
| React Native Developer | 15-1252 | Framework-specific |
| Flutter Developer | 15-1252 | Framework-specific |
| Game Developer | 15-1255.01 | O*NET: "Video Game Designers" |
| Graphics Programmer | 15-1255.01 | Industry variant |
| Embedded Systems Engineer | 15-1252 | SO: "Developer, embedded" |
| Firmware Engineer | 15-1252 | Industry variant |
| IoT Developer | 15-1252 | Industry variant |

#### Quality Assurance & Testing

| Role | O*NET SOC | Notes |
|---|---|---|
| QA Engineer | 15-1253 | O*NET: "Software Quality Assurance Analysts and Testers" |
| QA Analyst | 15-1253 | Analyst variant |
| Test Engineer | 15-1253 | Engineer variant |
| Automation Test Engineer | 15-1253 | Automation variant |
| SDET | 15-1253 | Software Development Engineer in Test |

#### Security

| Role | O*NET SOC | Notes |
|---|---|---|
| Security Engineer | 15-1299.05 | O*NET: "Information Security Engineers" |
| Cybersecurity Engineer | 15-1212 | SO: "Cybersecurity or InfoSec professional" |
| Information Security Analyst | 15-1212 | O*NET base title |
| Penetration Tester | 15-1299.04 | O*NET base title |
| Security Architect | 15-1299.05 | Architect variant |

#### Database & Administration

| Role | O*NET SOC | Notes |
|---|---|---|
| Database Administrator | 15-1242 | O*NET base title |
| DBA | 15-1242 | Abbreviation variant |
| Database Engineer | 15-1243 | Industry variant |
| Data Warehousing Specialist | 15-1243.01 | O*NET base title |
| System Administrator | 15-1244 | SO: "System administrator" |
| Network Administrator | 15-1244 | O*NET base title |
| Network Engineer | 15-1241 | Industry variant |
| Computer Network Architect | 15-1241 | O*NET base title |

#### Management & Leadership

| Role | O*NET SOC | Notes |
|---|---|---|
| Engineering Manager | 11-3021 | SO: "Engineering manager" |
| Tech Lead | 15-1252 | Industry variant |
| Technical Lead | 15-1252 | Industry variant |
| Team Lead | 15-1252 | Industry variant |
| CTO | 11-3021 | SO: "Senior executive" |
| VP of Engineering | 11-3021 | Industry variant |
| Head of Engineering | 11-3021 | Industry variant |
| Director of Engineering | 11-3021 | Industry variant |
| IT Manager | 11-3021 | O*NET: "Computer and Information Systems Managers" |
| Project Manager | 15-1299.09 | O*NET: "Information Technology Project Managers" |
| Technical Project Manager | 15-1299.09 | Industry variant |
| Product Manager | (none) | SO: "Product manager" — not in O*NET 15-0000 |
| Technical Product Manager | (none) | Industry variant |

#### Design & Frontend-Adjacent

| Role | O*NET SOC | Notes |
|---|---|---|
| UX Designer | 15-1255 | O*NET: "Web and Digital Interface Designers" |
| UI Designer | 15-1255 | Industry variant |
| UX/UI Designer | 15-1255 | Combined variant |
| Product Designer | 15-1255 | Industry variant |
| Web Designer | 15-1255 | Industry variant |
| UX Researcher | 15-1255 | Industry variant |

#### Emerging & Specialized

| Role | O*NET SOC | Notes |
|---|---|---|
| Blockchain Engineer | 15-1299.07 | O*NET base title |
| Developer Advocate | (none) | SO: "Dev Advocate" — not in O*NET |
| DevRel Engineer | (none) | Industry variant |
| Platform Developer | 15-1252 | Industry variant |
| API Developer | 15-1252 | Industry variant |
| Backend API Developer | 15-1252 | Industry variant |

**Draft total: ~90 entries.** The target of ~300 will be reached by adding more seniority variants (Junior, Mid-level), more specialization variants (e.g., "AWS Cloud Engineer", "Kubernetes Administrator"), and more niche roles. As with CANONICAL_TAGS, these additions should be driven by real CV parsing.

---

## 7. Locked Decisions (Step 2 — Resolved)

All 9 open questions have been resolved. The classifications below are **final** and have been applied to the tables in Section 5.

### 7.1 CANONICAL_TAGS classification disputes — RESOLVED

| # | Question | Final Decision | Rationale |
|---|---|---|---|
| Q1 | Cloud platforms (AWS/Azure/GCP) | **`persona_defining`** — kept | Dedicated "Cloud Architects" are massive B2B personas. LLM stack-clustering prevents mislabeling frontend devs. |
| Q2 | Kubernetes vs Terraform | **`kubernetes` = persona_defining, `terraform` = supporting** | K8s has dedicated admins (CKA certification). Terraform is a tool used by DevOps/Cloud engineers, not an identity itself. |
| Q3 | ML libraries | **`tensorflow`, `pytorch`, `spark` = persona_defining. `scikit-learn`, `langchain`, `huggingface` = supporting** | LangChain/HuggingFace are tools used by an AI Engineer, not the anchor identity. |
| Q4 | Meta-frameworks | **`nextjs` = persona_defining. `nuxt`, `sveltekit`, `remix`, `astro` = supporting** | Next.js has breakout market velocity (companies hire "Next.js Devs"). The others are still hired as "Vue/Svelte/React Devs". |
| Q5 | PHP / Ruby | **Both `persona_defining`** — kept | Waning market share does not erase their status as distinct, lucrative B2B developer identities. |

### 7.2 CANONICAL_ROLES scope — RESOLVED

| # | Question | Final Decision | Rationale |
|---|---|---|---|
| Q6 | Seniority in role list vs separate DB column | **Inline in CANONICAL_ROLES. No separate DB column. Add Junior/Mid variants.** | Normalizing seniority into a separate DB column creates mapping nightmares ("Staff" vs "Lead"). True seniority is derived dynamically via `tagsExperience` math. |
| Q7 | Product Manager | **Include in CANONICAL_ROLES, exclude from CANONICAL_TAGS.** | Devs who transitioned from PM need to accurately record work history without gaps. But the LLM must never anchor a matching persona on it. |

### 7.3 Schema 1 `proposed_stacks` — RESOLVED

| # | Question | Final Decision | Rationale |
|---|---|---|---|
| Q8 | LLM-proposed personas vs UI-derived | **Keep `proposed_stacks` in Schema 1. Add a Zod `.refine()` check.** | Offloading stack-clustering to gpt-4o is superior to writing heuristic client-side TS. The `.refine()` ensures the LLM obeys the "at least one persona_defining tag" rule. |

### 7.4 JSON Resume `work[].summary` field — RESOLVED

| # | Question | Final Decision | Rationale |
|---|---|---|---|
| Q9 | Store work summary in DB? | **Defer feature, but add nullable DB column now.** | Adding a nullable `summary` text column now costs nothing and saves a painful backfill migration later when Gate 3 needs historical context. |

### 7.5 Architectural Refinements — ADOPTED

| # | Refinement | Implementation |
|---|---|---|
| AR1 | `recomputeTagsExperience()` must be transactional | Wrap in `db.transaction(async (tx) => {...})`. If it fails halfway, roll back so the user's persona doesn't get corrupted. |
| AR2 | Orphaned `cvUpload` cleanup | Add an Inngest cron job (later) that deletes `cvUpload` rows older than 24 hours where `applicant.isOnboarded = false`. Not blocking for Module A MVP but documented as a follow-up task. |

---

## 8. Next Steps

All decisions are locked. Proceeding to:

- **Step 3 (Schema Phase):** Write the Drizzle schema files for `workingHistory` and `tagsExperience` tables, plus update `src/db/schemas/index.ts` with relations.
- **Step 4 (Contract Phase):** Convert the approved CANONICAL_TAGS and CANONICAL_ROLES markdown tables into `src/lib/jobs/tech-tags.ts` and `src/lib/jobs/roles.ts` TS files. Write the final `ResumeExtractionSchema` Zod schema.
- **Step 5 (TDD Update):** Rewrite Module A §3.1–3.3 in the TDD.
- **Step 6 (Implementation):** Server Action → Worker → UI → tests.
