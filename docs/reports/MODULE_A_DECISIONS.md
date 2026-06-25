# Module A Decisions — Locked

**Status:** Step 2 deliverable (Decision Phase)
**Date:** June 2026
**Scope:** Records the final binding decisions for Module A implementation. These supersede any conflicting guidance in the TDD or blueprint.

---

## 1. CANONICAL_TAGS Classifications (Final)

| Tag | Classification | Rationale |
|---|---|---|
| `aws`, `azure`, `gcp` | `persona_defining` | Dedicated Cloud Architects are major B2B personas. LLM stack-clustering prevents mislabeling. |
| `kubernetes` | `persona_defining` | Has dedicated admins (CKA certification). Distinct professional identity. |
| `terraform` | `supporting` | Tool used by DevOps/Cloud engineers, not an identity itself. |
| `tensorflow`, `pytorch`, `spark` | `persona_defining` | Anchor identities for ML/Data Engineer personas. |
| `scikit-learn`, `langchain`, `huggingface` | `supporting` | Tools used by an AI Engineer, not the anchor identity. |
| `nextjs` | `persona_defining` | Breakout market velocity — companies hire "Next.js Devs" specifically. |
| `nuxt`, `sveltekit`, `remix`, `astro` | `supporting` | Still hired as "Vue/Svelte/React Devs", not by meta-framework name. |
| `php`, `ruby` | `persona_defining` | Waning market share does not erase distinct B2B developer identities. |

## 2. CANONICAL_ROLES Decisions

- **Seniority:** Inline in role titles (Junior, Mid-level, Senior, Staff, Principal, Lead). No separate DB column. True seniority derived dynamically via `tagsExperience.yearsOfExperience` math.
- **Product Manager:** Included in CANONICAL_ROLES (for work history accuracy). Excluded from CANONICAL_TAGS (LLLM must never anchor a persona on it).

## 3. Schema 1 `proposed_stacks`

- **Kept.** The LLM proposes 1-2 personas during extraction.
- **Zod `.refine()`** enforces that each proposed stack contains at least 1 `persona_defining` tag.
- Rationale: gpt-4o stack-clustering is superior to heuristic client-side TypeScript.

## 4. Work History `summary` Field

- **Deferred as a feature** (not populated in MVP UI).
- **DB column added now** (nullable `text` on `workingHistory`). Avoids painful backfill migration when Gate 3 needs historical context.

## 5. Architectural Refinements

### AR1: Transactional Re-aggregation

`recomputeTagsExperience(applicantId)` must be wrapped in a Drizzle PostgreSQL transaction:

```typescript
await db.transaction(async (tx) => {
  // 1. Read all workingHistory rows for applicant
  // 2. Merge date ranges per canonical tag
  // 3. Delete existing tagsExperience rows
  // 4. Insert recomputed tagsExperience rows
  // 5. Rebuild applicant.allTags as union of active tags
});
```

If any step fails, the entire operation rolls back. Persona data cannot be left in a corrupted half-state.

### AR2: Orphaned cvUpload Cleanup (Follow-up Task)

An Inngest cron job (to be implemented post-MVP) deletes `cvUpload` rows where:
- `status` = `processing` or `valid` (not yet consumed by onboarding)
- `createdAt` is older than 24 hours
- The associated `applicant.isOnboarded` = `false`

This prevents orphaned rows from users who uploaded a CV but abandoned onboarding (State 2 → left the page).

**Not blocking for Module A MVP.** Documented as a follow-up task for the Inngest orchestration phase.

## 6. API Route vs Server Action

- **PDF parse step:** Server Action (called from main thread after Web Worker returns `rawText`). Application-level rate limiting (3 parses/hour/user).
- **Persona finalization:** Server Action (mutation — writes to DB).
- **API route reserved only if** Cloudflare WAF URL-based rate limiting on the parse endpoint becomes a hard requirement. Default is Server Action.

## 7. React Hook Form + Server Actions

These compose, they do not compete:
- **React Hook Form** manages client-side form state (field values, validation, drag-and-drop).
- **`useActionState`** wraps the server-side submission (Server Action).
- **Zod** validates at both layers (RHF resolver for client, Server Action for server).

## 8. UI Structure — Single Route, Three Presentations

Route: `/dashboard/profile-management` (renamed from `/dashboard/cv`)

| State | Condition | Presentation |
|---|---|---|
| State 1 | `isOnboarded=false`, no CV parsed | CV upload form |
| State 2 | `isOnboarded=false`, CV parsed (in session/`cvUpload` row exists) | Onboarding review (LLM data + user fields + persona confirmation) |
| State 3 | `isOnboarded=true` | Profile management (full editing) |

Server-side render branch based on `isOnboarded` and `cvUpload` existence. Not three routes — one route, three modes.

## 9. Onboarding Completion Constraints

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

## 10. CV Validity Checks

**Pre-LLM (reject upload immediately):**
- Raw text length > 200 characters
- Contains at least one date-like pattern (year mention)
- Contains at least one software development marker (§13 Layer 1 — `validateCvDomain`)

**Post-LLM (reject parse result, ask for better CV):**
- ≥1 employment entry with both start and end dates
- ≥3 skills mapped to CANONICAL_TAGS
- ≥1 persona_defining tag in `canonical_skills_detected` (§13 Layer 2)

## 11. Experience Level — Derived, Not Stored

Experience level (junior/mid/senior/staff/lead) is derived purely at query time from `tagsExperience.yearsOfExperience`. No stored enum field on `applicant`. This avoids stale data when work history changes.

## 12. Persona Embedding Auto-Regeneration

Persona embeddings are **automatically regenerated** when `mustHaveTags` change. The `recomputeTagsExperience()` flow triggers embedding regeneration for any persona whose `mustHaveTags` were affected.

## 13. CV Domain Gate — Three-Layer Developer Detection

**Problem:** The system's target audience is software developers and engineers (per blueprint §1). The CANONICAL_TAGS taxonomy (8 categories, all software development technologies) and CANONICAL_ROLES (seeded from O*NET SOC 15-0000 Computer & Mathematical Occupations) implicitly encode this scope. However, the existing validity checks (§10) only catch garbage files (short text, no dates) and completely non-technical CVs (<3 canonical skills). They leak for **adjacent-but-out-of-scope roles** — a web designer who knows some HTML/CSS/JavaScript, a QA analyst with basic scripting — who pass the ≥3 canonical skills threshold with marginal tag mappings and produce low-quality personas that pollute the matching pool.

**Consequence of leaking:** False matches erode user trust faster than no matches. A web designer onboarded with a thin `javascript` persona receives React Developer job notifications that are obviously wrong. Worse, if that persona feeds a "Minute Zero" cold email to a CTO, the bad match damages VectorMatch's credibility with the exact audience the product needs to impress. At pre-traction, precision is the right optimization target. A gate can always be loosened post-traction; a bad cold email cannot be un-sent.

**Decision:** A three-layer explicit gate, layered across points in the flow where cost and confidence of detection differ:

### Layer 1 — Pre-LLM Heuristic (zero cost, low confidence)

`validateCvDomain(rawText: string): string | null` — a keyword-presence scan on the raw PDF text, before any LLM call. Checks whether the text contains any of a derived marker set:

- **Derived markers:** `label` fields from all `persona_defining` CANONICAL_TAGS, excluding ambiguous short labels that are common English words/letters (`C`, `R`, `Go` — these would false-match on non-developer CVs). Excluded tags are still enforced at Layer 2.
- **Supplemental markers:** A small curated list of dev-culture terms not in CANONICAL_TAGS (`github`, `gitlab`, `stackoverflow`, `vscode`, `visual studio code`, `intellij`, `leetcode`, `hackerrank`, `npm`, `pnpm`, `webpack`, `vite`, `eslint`, `golang`, `programming`, `software engineer`, `software developer`, `web developer`).
- **Matching:** Word-boundary regex (case-insensitive) using `\b{label}(?![\w])` — not naive `includes()`, which would false-match short tag names inside common words (e.g., `includes("go")` matches "going", `includes("c")` matches almost every English text). The `(?![\w])` negative lookahead handles labels ending in non-word characters like `C#`, `C++`, `Next.js`.

If zero markers are found, reject immediately: *"VectorMatch is built for software developers and engineers. Your CV doesn't appear to contain technical development experience. Please upload a developer CV."*

**False-rejection risk:** Essentially zero. A software developer's CV will mention at least one programming language, framework, or dev tool. A career-changer who just learned Python will have "Python" in their CV. The excluded ambiguous labels (`C`, `R`, `Go`) are still caught at Layer 2.

**Location:** `src/lib/onboarding/schemas.ts` alongside `validateCvRawText()` — both are pre-LLM validators, same concern, same file.

### Layer 2 — Post-LLM Schema 1 Refine (one LLM call cost, high confidence)

One additional `.refine()` on `resumeExtractionSchema`: the top-level `canonical_skills_detected` array (union of all per-role skills) must contain at least one `persona_defining` tag. This is distinct from the existing Q8 refine (which checks `proposed_stacks[].must_have_tags`) — this checks the raw detected skills, not the proposed persona stacks.

**What this catches that Layer 1 doesn't:** A web designer whose CV mentions "HTML", "CSS", and "JavaScript" (passing Layer 1 on "JavaScript") but whose LLM extraction maps only to `html`, `css`, `git` (non-persona-defining) — perhaps the LLM didn't map "JavaScript" because it appeared in a non-technical context. The ≥3 canonical skills check passes, but the ≥1 persona_defining check fails.

**What this catches that the existing ≥3 check doesn't:** `html + css + git` passes ≥3 canonical skills but fails ≥1 persona_defining. A junior React developer with `react + html + css` passes both — `react` is persona_defining.

**Error message:** *"Your CV must include at least one primary programming language or framework (such as JavaScript, Python, React, Node.js) to proceed."*

### Layer 3 — Persona Confirmation Gate (no extra cost, final backstop)

Already decided in §3 (Q8): each proposed stack in `proposed_stacks` must contain at least 1 `persona_defining` tag in `must_have_tags`, enforced by `.refine()`. This is the final backstop ensuring no persona is created without a real technology anchor, even if Layers 1 and 2 somehow passed an edge case.

### Implementation Scope

- **Zero new tables, zero new API calls, zero CANONICAL_TAGS changes**
- Layer 1: `validateCvDomain()` function (~30 lines), called in `parseCvAction` after `validateCvRawText()`
- Layer 2: one `.refine()` on `resumeExtractionSchema`, using existing `PERSONA_DEFINING_TAGS` Set
- Layer 3: already implemented (§3)
- Marker list derived from `PERSONA_DEFINING_TAGS` at module load — no drift risk when new tags are added to CANONICAL_TAGS
