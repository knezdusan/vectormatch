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

**Post-LLM (reject parse result, ask for better CV):**
- ≥1 employment entry with both start and end dates
- ≥3 skills mapped to CANONICAL_TAGS

## 11. Experience Level — Derived, Not Stored

Experience level (junior/mid/senior/staff/lead) is derived purely at query time from `tagsExperience.yearsOfExperience`. No stored enum field on `applicant`. This avoids stale data when work history changes.

## 12. Persona Embedding Auto-Regeneration

Persona embeddings are **automatically regenerated** when `mustHaveTags` change. The `recomputeTagsExperience()` flow triggers embedding regeneration for any persona whose `mustHaveTags` were affected.
