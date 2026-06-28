# MODULE A — IMPLEMENTATION HANDOFF (Step 6)

**Status:** Implemented. All Module A onboarding features (CV upload + parsing, review, finalization, rate limiting, State 3 editing, persona embedding regeneration, and orphaned CV cleanup) are in production code.
**Date:** June 2026
**Scope:** This document records the implementation of Module A Step 6. It specifies exact file paths, function signatures, dependency commands, subtask order, and test plan. All subtasks are implemented and verified.

**Governing documents (read these first):**
- `docs/reports/MODULE_A_DECISIONS.md` — 12 locked decisions
- `docs/reports/RESEARCH_NOTE_schemas.md` — Schema 1/2/3 definitions, CANONICAL_TAGS/CANONICAL_ROLES rationale
- `docs/governing/VectorMatchTechicalImplementation.md` §3.1-3.8 — the TDD (updated this session)
- `docs/governing/vectormatch-blueprint.md` — the blueprint (updated this session)

---

## 0. Current Codebase State (Verified End of Session)

### Already implemented and compiling:
- **DB tables:** `cvUpload`, `workingHistory`, `tagsExperience` in `src/db/schemas/jobs/` (all compile, migration `0007_module_a_onboarding_tables.sql` generated)
- **DB relations:** All 3 new tables have relations defined in `src/db/schemas/index.ts`
- **CANONICAL_TAGS:** ~130 entries in `src/lib/jobs/tech-tags.ts` with derived lookups (`CANONICAL_TAG_MAP`, `PERSONA_DEFINING_TAGS`, `TAGS_BY_CATEGORY`, `normalizeToCanonicalTag()`, `isPersonaDefining()`)
- **CANONICAL_ROLES:** ~90 entries in `src/lib/jobs/roles.ts` with `CANONICAL_ROLE_LABELS`, `CANONICAL_ROLE_SET`, `isCanonicalRole()`
- **Zod schemas:** `resumeExtractionSchema` (Schema 1) and `onboardingPayloadSchema` (Schema 2) in `src/lib/onboarding/schemas.ts` with `.refine()` validations and `validateCvRawText()` pre-LLM check
- **DB client:** `src/db/db.ts` uses `@neondatabase/serverless` + `drizzle-orm/neon-http` (HTTP driver, not WebSocket)
- **Auth:** `src/lib/auth.ts` exports `getAuthSession()` (returns session with user) and `AuthSession` type
- **Existing Server Action pattern:** `src/actions/auth.ts` uses `"use server"` + `ActionState` type pattern + `FormData` input
- **Dashboard layout:** `src/app/dashboard/layout.tsx` wraps all dashboard pages with auth check + sidebar
- **Sidebar nav:** `src/components/dashboard/DashboardSidebarNav.tsx` line 20 has `{ href: "/dashboard/cv", label: "CV", icon: FileText }` — **MUST BE UPDATED** to `/dashboard/profile-management`

### NOT yet implemented (this is what Step 6 builds):
- No `pdfjs-dist`, `ai`, `@ai-sdk/openai`, `react-hook-form`, `@dnd-kit/*` dependencies installed
- No Web Worker files
- No Server Actions for onboarding (parse or finalize)
- No `/dashboard/profile-management` route (only stub `/dashboard/cv` exists)
- No `recomputeTagsExperience()` function
- No embedding generation utility
- No OPENAI_API_KEY in `.env.example`

---

## 1. Dependency Installation

Run this first. All packages are new.

```bash
# AI SDK + OpenAI provider (for generateObject + text-embedding-3-small)
npm add ai @ai-sdk/openai

# PDF parsing (client-side Web Worker)
npm add pdfjs-dist

# Form management + drag-and-drop
npm add react-hook-form @hookform/resolvers
npm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**Note:** Check `package.json` before installing — some may already be present. The `zod` package (v4.4.3) is already installed.

**After installation, add to `.env.example`:**
```
# OpenAI (Module A — CV extraction + embeddings)
OPENAI_API_KEY=""
```

---

## 2. Subtask Implementation Order

Execute in this exact order. Each subtask depends on the previous one.

### Subtask 1: Sidebar Nav Update + Route Skeleton
**Files:**
- EDIT `src/components/dashboard/DashboardSidebarNav.tsx` — change line 20 from `{ href: "/dashboard/cv", label: "CV", icon: FileText }` to `{ href: "/dashboard/profile-management", label: "Profile Management", icon: FileText }`
- DELETE `src/app/dashboard/cv/` directory (stub page)
- CREATE `src/app/dashboard/profile-management/page.tsx` — server component that reads `applicant.isOnboarded` and renders the correct presentation
- CREATE `src/app/dashboard/profile-management/layout.tsx` (if needed) or reuse dashboard layout

**Page logic:**
```typescript
// Pseudocode for src/app/dashboard/profile-management/page.tsx
import { getAuthSession } from "@/lib/auth";
import { db } from "@/db/db";
import { applicant, cvUpload } from "@/db/schemas";
import { eq } from "drizzle-orm";

export default async function ProfileManagementPage() {
  const session = await getAuthSession();
  if (!session) redirect("/auth");

  const userApplicant = await db.query.applicant.findFirst({
    where: eq(applicant.userId, session.user.id),
  });

  // State 3: already onboarded → profile management
  if (userApplicant?.isOnboarded) {
    return <ProfileManagement applicant={userApplicant} />;
  }

  // State 1 or 2: check if there's a valid cvUpload
  const latestCv = await db.query.cvUpload.findFirst({
    where: eq(cvUpload.applicantId, session.user.id),
    orderBy: (cvUpload, { desc }) => [desc(cvUpload.createdAt)],
  });

  if (latestCv?.status === "valid" && latestCv.extractedJson) {
    // State 2: onboarding review
    return <OnboardingReview cvUpload={latestCv} applicant={userApplicant} />;
  }

  // State 1: CV upload form
  return <CvUploadForm />;
}
```

**Verification:** `npx tsc --noEmit` passes, page renders (even if components are stubs).

### Subtask 2: PDF Web Worker
**Files:**
- CREATE `src/workers/pdf-extract.worker.ts` — Web Worker that imports `pdfjs-dist` and extracts raw text
- CREATE `src/lib/onboarding/pdf-worker-client.ts` — main-thread wrapper that instantiates the worker, sends the File, and receives raw text via `postMessage`

**Worker implementation notes:**
```typescript
// src/workers/pdf-extract.worker.ts
// pdfjs-dist worker setup for Next.js 16 (Turbopack)
// The pdfjs-dist library needs its own worker file. In Next.js 16 with
// Turbopack, the approach is:
// 1. Import pdfjs-dist in the Web Worker file
// 2. Set workerSrc to a URL created from the pdfjs-dist worker
// 3. The Web Worker itself is loaded via new Worker(new URL('./pdf-extract.worker.ts', import.meta.url))

import * as pdfjsLib from "pdfjs-dist";

// Set the pdfjs worker source — use the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

self.onmessage = async (e: MessageEvent<{ file: File }>) => {
  const { file } = e.data;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ") + "\n";
    }
    self.postMessage({ rawText: fullText.trim(), error: null });
  } catch (error) {
    self.postMessage({ rawText: null, error: (error as Error).message });
  }
};
```

**Known friction point:** Next.js 16 + Turbopack Web Worker bundling. If `new URL('./pdf-extract.worker.ts', import.meta.url)` doesn't work, the fallback is to use `new Worker(new URL('./pdf-extract.worker.ts', import.meta.url), { type: 'module' })` in the client file. Check Next.js 16 docs for the current recommended pattern. The `pdfjs-dist` worker URL may need to be set differently depending on whether Turbopack bundles `.mjs` files correctly.

**Client wrapper:**
```typescript
// src/lib/onboarding/pdf-worker-client.ts
export function extractPdfText(file: File): Promise<{ rawText: string; error: string | null }> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("../../workers/pdf-extract.worker.ts", import.meta.url),
      { type: "module" }
    );
    worker.onmessage = (e) => {
      resolve(e.data);
      worker.terminate();
    };
    worker.onerror = (e) => {
      reject(new Error(e.message));
      worker.terminate();
    };
    worker.postMessage({ file });
  });
}
```

**Verification:** Write a temporary test page that lets you upload a PDF and logs the extracted text. Delete after verifying.

### Subtask 3: Server Action — Parse CV
**Files:**
- CREATE `src/actions/onboarding.ts` — contains `parseCvAction` and `finalizeOnboardingAction`

**`parseCvAction` signature:**
```typescript
"use server";

import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { db } from "@/db/db";
import { cvUpload } from "@/db/schemas";
import { getAuthSession } from "@/lib/auth";
import { resumeExtractionSchema, validateCvRawText } from "@/lib/onboarding/schemas";
import { eq } from "drizzle-orm";

export type ParseCvState = {
  error: string | null;
  cvUploadId: string | null;
  extraction: ResumeExtractionOutput | null;
} | null;

export async function parseCvAction(
  _prevState: ParseCvState,
  formData: FormData,
): Promise<ParseCvState> {
  const session = await getAuthSession();
  if (!session) return { error: "Not authenticated", cvUploadId: null, extraction: null };

  const label = formData.get("label") as string;
  const originalFileName = formData.get("originalFileName") as string;
  const rawText = formData.get("rawText") as string;

  if (!label || !rawText) {
    return { error: "Missing label or raw text", cvUploadId: null, extraction: null };
  }

  // Pre-LLM validity check
  const validityError = validateCvRawText(rawText);
  if (validityError) {
    return { error: validityError, cvUploadId: null, extraction: null };
  }

  // Rate limiting: 3 parses/hour/user (implemented in src/actions/onboarding.ts)

  // Create cvUpload row with status=processing
  const [upload] = await db
    .insert(cvUpload)
    .values({
      applicantId: session.user.id,
      label,
      originalFileName,
      rawText,
      status: "processing",
    })
    .returning({ id: cvUpload.id });

  try {
    const { object: extraction } = await generateObject({
      model: openai("gpt-4o"),
      schema: resumeExtractionSchema,
      system: `You are a CV parser. Extract work history and skills from the CV text.
Map all skills to CANONICAL_TAGS. Never invent tags.
For each role, extract: company, title, start_date (YYYY-MM), end_date (YYYY-MM or null if current), is_current, summary, canonical_skills_detected, raw_skills_detected.
Propose 1-2 personas (proposed_stacks) based on the extracted skills. Each must have exactly 5 must_have_tags, at least 1 of which must be persona_defining.`,
      prompt: rawText,
    });

    // Update cvUpload with extraction result
    await db
      .update(cvUpload)
      .set({ extractedJson: extraction, status: "valid" })
      .where(eq(cvUpload.id, upload.id));

    return { error: null, cvUploadId: upload.id, extraction };
  } catch (error) {
    await db
      .update(cvUpload)
      .set({ status: "invalid" })
      .where(eq(cvUpload.id, upload.id));
    return {
      error: `LLM extraction failed: ${(error as Error).message}`,
      cvUploadId: upload.id,
      extraction: null,
    };
  }
}
```

**Verification:** Can call from a test form, see the cvUpload row created in DB, LLM extraction returns structured JSON.

### Subtask 4: `recomputeTagsExperience()` Function
**Files:**
- CREATE `src/lib/onboarding/recompute-tags.ts`

**Function signature:**
```typescript
import { db } from "@/db/db";
import { workingHistory, tagsExperience, applicant, persona } from "@/db/schemas";
import { eq, sql } from "drizzle-orm";
import { generateEmbeddings } from "@/lib/onboarding/embeddings";

/**
 * Recompute tagsExperience from workingHistory for a given applicant.
 * MUST be called inside a db.transaction() — see usage below.
 *
 * Algorithm:
 * 1. Read all workingHistory rows for the applicant
 * 2. For each canonical tag, collect all date ranges where it appears
 * 3. Merge overlapping date ranges (the overlap algorithm)
 * 4. Calculate total years of experience per tag
 * 5. Delete existing tagsExperience rows
 * 6. Insert recomputed rows (upsert via unique constraint)
 * 7. Rebuild applicant.allTags as union of active tags
 * 8. If any persona.mustHaveTags changed, regenerate persona embeddings
 */
export async function recomputeTagsExperience(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  applicantId: string,
): Promise<void> {
  // 1. Read all working history
  const history = await tx
    .select()
    .from(workingHistory)
    .where(eq(workingHistory.applicantId, applicantId));

  // 2-4. Merge date ranges per tag and calculate years
  const tagYearsMap = new Map<string, number>();
  for (const entry of history) {
    for (const tag of entry.canonicalSkillsDetected) {
      const ranges = tagRangesMap.get(tag) ?? [];
      ranges.push({
        start: new Date(entry.startDate),
        end: entry.endDate ? new Date(entry.endDate) : new Date(),
      });
      tagRangesMap.set(tag, ranges);
    }
  }

  // Merge overlapping ranges and sum years per tag
  const tagYears = new Map<string, number>();
  for (const [tag, ranges] of tagRangesMap) {
    const mergedRanges = mergeOverlappingRanges(ranges);
    const totalYears = mergedRanges.reduce(
      (sum, r) => sum + (r.end.getTime() - r.start.getTime()) / (1000 * 60 * 60 * 24 * 365.25),
      0,
    );
    tagYears.set(tag, Math.round(totalYears * 10) / 10); // round to 0.1
  }

  // 5. Delete existing tagsExperience
  await tx.delete(tagsExperience).where(eq(tagsExperience.applicantId, applicantId));

  // 6. Insert recomputed rows
  if (tagYears.size > 0) {
    await tx.insert(tagsExperience).values(
      Array.from(tagYears.entries()).map(([tag, years]) => ({
        applicantId,
        canonicalTag: tag,
        yearsOfExperience: years.toString(),
        active: true,
      })),
    );
  }

  // 7. Rebuild applicant.allTags
  const activeTags = Array.from(tagYears.keys());
  await tx
    .update(applicant)
    .set({ allTags: activeTags })
    .where(eq(applicant.userId, applicantId));

  // 8. Regenerate persona embeddings if mustHaveTags changed
  // (Compare current persona.mustHaveTags against new activeTags,
  // regenerate embedding for any persona whose tags are no longer all active)
  const personas = await tx.select().from(persona).where(eq(persona.applicantId, applicantId));
  for (const p of personas) {
    // Check if all mustHaveTags are still in activeTags
    const allTagsPresent = p.mustHaveTags.every((t) => activeTags.includes(t));
    if (!allTagsPresent) {
      // Regenerate embedding from embeddingSummary
      const embedding = await generateEmbeddings([p.embeddingSummary]);
      await tx
        .update(persona)
        .set({ personaEmbedding: embedding[0] })
        .where(eq(persona.id, p.id));
    }
  }
}

// Helper: merge overlapping date ranges
function mergeOverlappingRanges(
  ranges: { start: Date; end: Date }[],
): { start: Date; end: Date }[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = new Date(Math.max(last.end.getTime(), sorted[i].end.getTime()));
    } else {
      merged.push(sorted[i]);
    }
  }
  return merged;
}
```

**Critical:** This function receives the transaction object `tx` as a parameter — it does NOT create its own transaction. The caller wraps the entire operation in `db.transaction()`.

### Subtask 5: Embedding Generation Utility
**Files:**
- CREATE `src/lib/onboarding/embeddings.ts`

```typescript
import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";

/**
 * Generate embeddings using text-embedding-3-small (1536 dimensions).
 * Returns an array of Float32Array, one per input text.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: openai.embedding("text-embedding-3-small"),
    values: texts,
  });
  return embeddings;
}
```

### Subtask 6: Server Action — Finalize Onboarding
**File:** Add to `src/actions/onboarding.ts`

```typescript
export type FinalizeOnboardingState = {
  error: string | null;
  success: boolean;
} | null;

export async function finalizeOnboardingAction(
  _prevState: FinalizeOnboardingState,
  formData: FormData,
): Promise<FinalizeOnboardingState> {
  const session = await getAuthSession();
  if (!session) return { error: "Not authenticated", success: false };

  // Extract JSON payload from FormData
  const payloadJson = formData.get("payload") as string;
  if (!payloadJson) return { error: "Missing payload", success: false };

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { error: "Invalid JSON payload", success: false };
  }

  // Strict double-validation (never trust client)
  const parsed = onboardingPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0].message,
      success: false,
    };
  }

  const data = parsed.data;

  try {
    // Generate persona embeddings (before transaction — API call)
    const embeddings = await generateEmbeddings(
      data.personas.map((p) => p.embeddingSummary),
    );

    // Everything else in a single transaction
    await db.transaction(async (tx) => {
      // 1. Upsert applicant
      await tx
        .insert(applicant)
        .values({
          userId: session.user.id,
          country: data.country,
          canWorkUsHours: data.canWorkUsHours,
          assignmentTypes: data.assignmentTypes,
          modalities: data.modalities,
          preferredCompliance: data.preferredCompliance,
          isOnboarded: true,
        })
        .onConflictDoUpdate({
          target: applicant.userId,
          set: {
            country: data.country,
            canWorkUsHours: data.canWorkUsHours,
            assignmentTypes: data.assignmentTypes,
            modalities: data.modalities,
            preferredCompliance: data.preferredCompliance,
            isOnboarded: true,
          },
        });

      // 2. Insert workingHistory rows
      await tx.insert(workingHistory).values(
        data.workHistory.map((entry) => ({
          applicantId: session.user.id,
          cvUploadId: data.cvUploadId,
          company: entry.company,
          role: entry.role,
          startDate: entry.startDate,
          endDate: entry.endDate,
          isCurrent: entry.isCurrent,
          summary: entry.summary,
          canonicalSkillsDetected: entry.canonicalSkillsDetected,
          rawSkillsDetected: entry.rawSkillsDetected,
        })),
      );

      // 3. Recompute tagsExperience (transactional)
      await recomputeTagsExperience(tx, session.user.id);

      // 4. Insert personas with embeddings
      await tx.insert(persona).values(
        data.personas.map((p, i) => ({
          applicantId: session.user.id,
          personaId: p.personaId,
          personaLabel: p.personaLabel,
          embeddingSummary: p.embeddingSummary,
          personaEmbedding: embeddings[i],
          mustHaveTags: p.mustHaveTags,
          blocklistTags: p.blocklistTags,
        })),
      );
    });

    return { error: null, success: true };
  } catch (error) {
    return {
      error: `Onboarding failed: ${(error as Error).message}`,
      success: false,
    };
  }
}
```

### Subtask 7: UI — State 1 (CV Upload Form)
**Files:**
- CREATE `src/components/onboarding/CvUploadForm.tsx`
- CREATE `src/components/onboarding/CvUploadFormInner.tsx` (client component with worker logic)

**Component tree:**
```
CvUploadForm (client component, useActionState)
  ├── File input (PDF only, accept=".pdf")
  ├── Label input (mandatory CV name)
  ├── Submit button (disabled until file + label present)
  └── On submit:
      1. Call extractPdfText(file) — Web Worker
      2. Show "Extracting text..." status
      3. On success, call parseCvAction with { label, originalFileName, rawText }
      4. Show "AI parsing CV..." status
      5. On success, router.refresh() — server re-renders as State 2
      6. On error, show error message
```

### Subtask 8: UI — State 2 (Onboarding Review)
**Files:**
- CREATE `src/components/onboarding/OnboardingReview.tsx` (client component)
- CREATE `src/components/onboarding/ApplicantSection.tsx`
- CREATE `src/components/onboarding/SkillsSection.tsx`
- CREATE `src/components/onboarding/PersonaSection.tsx`
- CREATE `src/components/onboarding/SkillDragAndDrop.tsx` (the 5 Major Skills DnD using @dnd-kit)

**Component tree:**
```
OnboardingReview (receives cvUpload + extraction as props)
  └── React Hook Form (formState)
      ├── ApplicantSection
      │   ├── Editable work history list (from extraction.roles[])
      │   │   └── Each row: company, role (dropdown from CANONICAL_ROLES), dates, skills
      │   └── User-collected fields: country, canWorkUsHours, assignmentTypes, modalities, preferredCompliance
      ├── SkillsSection (read-only)
      │   └── Lists all canonical_skills_detected from extraction, grouped by TAGS_BY_CATEGORY
      │       with toggle to deactivate (not in MVP — just display)
      └── PersonaSection
          └── For each proposed_stack in extraction.proposed_stacks:
              ├── personaLabel (editable)
              ├── embeddingSummary (editable textarea)
              └── SkillDragAndDrop (5 must_have_tags, draggable from SkillsSection list)
          └── "Add another persona" button (max 3)
      └── Submit button → finalizeOnboardingAction
```

**RHF + useActionState composition:**
```typescript
// The pattern: RHF manages form state, useActionState handles submission
const [formState, formAction] = useActionState(finalizeOnboardingAction, null);
const form = useForm<OnboardingPayload>({
  resolver: zodResolver(onboardingPayloadSchema),
  defaultValues: { /* from extraction */ },
});

const onSubmit = form.handleSubmit((data) => {
  // Pass to server action via FormData
  const formData = new FormData();
  formData.append("payload", JSON.stringify(data));
  formAction(formData);
});
```

### Subtask 9: UI — State 3 (Profile Management)
**Files:**
- CREATE `src/components/onboarding/ProfileManagement.tsx`

This is State 2 but in "edit mode" — same sections, but data comes from DB instead of extraction JSON. Can reuse most State 2 components with different data source.

**Implemented:** Full State 3 editing is live. `ProfileManagement` supports editing preferences, work history, personas, and CV re-parse. The skills section is read-only because skills are derived from work history.

### Subtask 10: Tests
**Files:**
- CREATE `src/lib/onboarding/__tests__/schemas.test.ts` — Zod schema validation tests
- CREATE `src/lib/onboarding/__tests__/recompute-tags.test.ts` — overlap algorithm tests
- CREATE `src/lib/jobs/__tests__/tech-tags.test.ts` — CANONICAL_TAGS integrity tests
- CREATE `src/app/dashboard/profile-management/__tests__/page.test.tsx` — page rendering tests (3 states)

**Test plan:**

**Vitest unit tests (`schemas.test.ts`):**
- `resumeExtractionSchema` accepts valid extraction with 1 role + 1 stack
- `resumeExtractionSchema` rejects 0 roles
- `resumeExtractionSchema` rejects proposed_stack with 0 persona_defining tags
- `resumeExtractionSchema` rejects < 3 canonical_skills_detected
- `onboardingPayloadSchema` accepts valid payload
- `onboardingPayloadSchema` rejects missing country
- `onboardingPayloadSchema` rejects empty assignmentTypes array
- `onboardingPayloadSchema` rejects persona with 4 mustHaveTags (not 5)
- `validateCvRawText` rejects < 200 chars
- `validateCvRawText` rejects text with no year patterns
- `validateCvRawText` accepts valid CV text

**Vitest unit tests (`recompute-tags.test.ts`):**
- `mergeOverlappingRanges` merges fully overlapping ranges
- `mergeOverlappingRanges` merges partially overlapping ranges
- `mergeOverlappingRanges` does not merge non-overlapping ranges
- `mergeOverlappingRanges` handles single range
- `mergeOverlappingRanges` handles empty array
- `recomputeTagsExperience` calculates correct years for single role
- `recomputeTagsExperience` sums years across multiple roles with same tag
- `recomputeTagsExperience` handles overlapping roles (deduplicates overlap)

**Vitest unit tests (`tech-tags.test.ts`):**
- All CANONICAL_TAGS have unique `tag` slugs
- All CANONICAL_TAGS have non-empty `label`
- `PERSONA_DEFINING_TAGS` contains only tags with `classification === "persona_defining"`
- `CANONICAL_TAG_MAP` has same size as CANONICAL_TAGS array
- `normalizeToCanonicalTag` returns correct slug for known tag
- `normalizeToCanonicalTag` returns null for unknown tag
- `isPersonaDefining` returns true for `react`, false for `css`

**Vitest page tests (`page.test.tsx`):**
- Renders State 1 (CV upload form) when `isOnboarded=false` and no cvUpload
- Renders State 2 (onboarding review) when `isOnboarded=false` and valid cvUpload exists
- Renders State 3 (profile management) when `isOnboarded=true`
- Redirects to `/auth` when not authenticated

**Playwright E2E (defer to post-MVP or manual testing):**
- File location: `e2e/onboarding.spec.ts` (NOT in `src/` — per AGENTS.md test separation rules)
- Full flow: sign up → upload PDF → see extraction → fill fields → submit → see "onboarded" state
- **Better Auth rate limit warning:** sign-up/sign-in endpoints are limited to 3 attempts per 10 seconds. Create the session via Better Auth API once and use Playwright `storageState` to reuse it. Do NOT repeatedly submit auth forms through the UI.

---

## 3. Critical AGENTS.md Rules (Must Follow)

These rules are from `AGENTS.md` at project root and are non-negotiable:

1. **NEVER run Git commands** — no `git add`, `git commit`, `git push`, `git checkout`, etc. All version control is the user's responsibility.
2. **NEVER delete directories without explicit user confirmation** — this includes `src/app/dashboard/cv/`. Leave it in place; add the new route alongside it.
3. **Biome only** — never ESLint/Prettier. Run `npx biome check --write src/` (not `--apply`).
4. **Shadcn/ui integrity** — NEVER modify files under `src/components/ui/`. Compose wrappers in your own component files. Style via `className` only.
5. **Tailwind CSS v4** — NO `tailwind.config.js` or `tailwind.config.ts`. All theme extensions via `@theme` in `src/app/globals.css`. Read `https://tailwindcss.com/docs` if syntax fails.
6. **Next.js 16.2** — Read relevant guides in `node_modules/next/dist/docs/` before writing code. APIs may differ from training data.
7. **Test separation** — Vitest tests in `src/**/__tests__/` with `.test.ts`/`.test.tsx`. Playwright E2E tests in `e2e/` with `.spec.ts`. Never mix.
8. **Server Components by default** — add `"use client"` only when necessary (interactivity, hooks, browser APIs).
9. **Dark mode default** — all new UI must use dark mode as default.
10. **Destructive operations** — NEVER perform irreversible operations without explicit user confirmation for that specific action.

## 4. Known Friction Points

### 4.1 Next.js 16 + Turbopack Web Worker bundling
The `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` pattern is the standard, but Turbopack may have quirks with `pdfjs-dist`'s internal worker (`pdf.worker.min.mjs`). If the build fails:
1. Try importing `pdfjs-dist/legacy/build/pdf.mjs` instead
2. Try setting `pdfjsLib.GlobalWorkerOptions.workerSrc` to a CDN URL as a fallback
3. Check Next.js 16 docs for Web Worker support changes

### 4.2 `db.transaction()` with Neon HTTP driver
The current DB client (`src/db/db.ts`) uses `drizzle-orm/neon-http` (HTTP driver). **The Neon HTTP driver does NOT support transactions.** You will need to either:
- **Option A (recommended):** Switch to `drizzle-orm/neon-serverless` with the WebSocket driver for transaction support. This requires changing `src/db/db.ts` to use `Pool` from `@neondatabase/serverless` instead of raw `neon()`.
- **Option B:** Use Neon's HTTP transaction endpoint if available (check Drizzle docs).
- **Option C:** Restructure `finalizeOnboardingAction` to not use a transaction (risky — violates AR1 decision).

**Option A is the correct path.** The change to `src/db/db.ts`:
```typescript
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schemas from "./schemas";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema: schemas });
```
This is a breaking change to the DB client — verify all existing queries still work after the switch.

### 4.3 `generateObject` with Zod 4.x
The `ai` package's `generateObject` function needs a Zod schema. Zod 4.x has some API changes from Zod 3.x. If `generateObject` fails with schema errors:
- Check that `resumeExtractionSchema` is a valid Zod schema (it is — it compiles)
- The `ai` package may need a specific Zod version — check `ai` package peer deps
- If `ai` requires Zod 3, you may need to downgrade or use `zod-to-json-schema` as an intermediary

### 4.4 RHF + `useActionState` composition
These are not mutually exclusive but the composition pattern is non-obvious. The key insight:
- RHF's `handleSubmit` calls a client-side function with validated data
- That function creates `FormData` and calls the server action via `formAction`
- The server action's `prevState` comes from `useActionState`, not RHF
- RHF's `formState.errors` shows client validation errors; `useActionState`'s state shows server errors

### 4.5 `@dnd-kit` with React 19
`@dnd-kit/core` and `@dnd-kit/sortable` should work with React 19, but verify. If there are peer dep warnings, use `--legacy-peer-deps` or check for React 19-compatible versions.

---

## 5. File Manifest (All files to be created or edited)

### New files (17):
| File | Subtask |
|---|---|
| `src/workers/pdf-extract.worker.ts` | 2 |
| `src/lib/onboarding/pdf-worker-client.ts` | 2 |
| `src/lib/onboarding/embeddings.ts` | 5 |
| `src/lib/onboarding/recompute-tags.ts` | 4 |
| `src/actions/onboarding.ts` | 3, 6 |
| `src/app/dashboard/profile-management/page.tsx` | 1 |
| `src/components/onboarding/CvUploadForm.tsx` | 7 |
| `src/components/onboarding/OnboardingReview.tsx` | 8 |
| `src/components/onboarding/ApplicantSection.tsx` | 8 |
| `src/components/onboarding/SkillsSection.tsx` | 8 |
| `src/components/onboarding/PersonaSection.tsx` | 8 |
| `src/components/onboarding/SkillDragAndDrop.tsx` | 8 |
| `src/components/onboarding/ProfileManagement.tsx` | 9 |
| `src/lib/onboarding/__tests__/schemas.test.ts` | 10 |
| `src/lib/onboarding/__tests__/recompute-tags.test.ts` | 10 |
| `src/lib/jobs/__tests__/tech-tags.test.ts` | 10 |
| `src/app/dashboard/profile-management/__tests__/page.test.tsx` | 10 |

### Edited files (4):
| File | Change |
|---|---|
| `src/components/dashboard/DashboardSidebarNav.tsx` | Line 20: `/dashboard/cv` → `/dashboard/profile-management`, label `CV` → `Profile Management` |
| `src/db/db.ts` | Switch from `neon-http` to `neon-serverless` Pool for transaction support |
| `.env.example` | Add `OPENAI_API_KEY=""` |
| `package.json` | Add 6 new dependencies (via `npm add`) |

### Deleted files (1):
| File | Reason |
|---|---|
| `src/app/dashboard/cv/` (directory) | Replaced by `src/app/dashboard/profile-management/` |

**⚠️ CRITICAL — AGENTS.md rule:** Deleting directories requires **explicit user confirmation**. Do NOT delete `src/app/dashboard/cv/` without asking the user first. Instead, leave it in place initially and just add the new `/dashboard/profile-management` route. The old route can be removed later once the new one is verified working.

---

## 6. Verification Checklist (Run After Each Subtask)

After each subtask, run:
```bash
npx tsc --noEmit --pretty    # Type check
npx biome check --write src/  # Lint + format (use --write, NOT --apply)
```

After all subtasks:
```bash
npx vitest run               # All unit tests
npm run build                # Full build (catches worker bundling issues)
```

---

## 7. Post-Implementation Follow-up Tasks

These are documented in MODULE_A_DECISIONS.md. Items 1–3 below are now implemented:

1. **Orphaned cvUpload cleanup** — Implemented as `cleanupOrphanedCvUploads` Inngest cron job (`src/inngest/functions.ts`).
2. **Rate limiting** — Implemented in `parseCvAction` (`src/actions/onboarding.ts`): 3 parses/hour/user by counting `cvUpload` rows created in the last hour.
3. **State 3 full editing** — Implemented in `src/actions/profile.ts` and `src/components/onboarding/ProfileManagement.tsx`. Editable sections: preferences, work history, personas, and CV re-parse. Skills section is read-only because skills are derived from work history.
4. **Playwright E2E** — Profile-management editing flow is covered by `e2e/profile-management.spec.ts`. A full end-to-end onboarding flow test with a real PDF is still pending and can be added once the project is ready to run real LLM calls in E2E.
5. **CANONICAL_TAGS expansion** — After real-CV testing, expand from ~130 to ~300 entries (still pending).
6. **Multiple CV Upload / CV List View** — Skipped for MVP; tied to paid-tier feature (post-launch).
