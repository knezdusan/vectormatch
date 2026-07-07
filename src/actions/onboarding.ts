"use server";

// Onboarding Server Actions — parseCvAction + finalizeOnboardingAction
// src/actions/onboarding.ts
//
// Two Server Actions drive the Module A onboarding state machine:
//
//   parseCvAction          — State 1 → State 2 transition. Receives the raw
//                            text extracted client-side by the pdfjs-dist Web
//                            Worker, runs gpt-4o extraction via generateObject,
//                            and persists the result to cvUpload.extractedJson.
//
//   finalizeOnboardingAction — State 2 → State 3 transition. Receives the full
//                            user-confirmed onboarding payload (Schema 2),
//                            double-validates with onboardingPayloadSchema,
//                            generates persona embeddings, then persists
//                            applicant + workingHistory + tagsExperience +
//                            persona in a single Drizzle transaction (AR1).
//
// Both actions follow the existing project pattern (src/actions/auth.ts):
//   - "use server" directive at the top
//   - (prevState, formData) => Promise<State> signature for useActionState
//   - Auth check via getAuthSession() at the top
//   - Never trust client data — re-validate on the server

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { and, count, eq, gt } from "drizzle-orm";

import { db } from "@/db/db";
import { applicant, cvUpload, persona, workingHistory } from "@/db/schemas";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { getAuthSession } from "@/lib/auth";
import { CANONICAL_TAGS, PERSONA_DEFINING_TAGS } from "@/lib/jobs/tech-tags";
import { recomputeTagsExperience } from "@/lib/onboarding/recompute-tags";
import {
  type OnboardingPayload,
  onboardingPayloadSchema,
  type ResumeExtractionOutput,
  resumeExtractionSchema,
  validateCvDomain,
  validateCvRawText,
} from "@/lib/onboarding/schemas";

// =============================================================================
// parseCvAction — State 1 → State 2
// =============================================================================

export type ParseCvState = {
  error: string | null;
  cvUploadId: string | null;
  extraction: ResumeExtractionOutput | null;
} | null;

// Build the system prompt with the full canonical tag list so the LLM can
// map skills accurately. Without the tag list, generateObject fails because
// the LLM invents tags that don't pass the Zod schema validation.
const CANONICAL_TAG_LIST = CANONICAL_TAGS.map((t) => t.tag).join(", ");
const PERSONA_DEFINING_TAG_LIST = Array.from(PERSONA_DEFINING_TAGS).join(", ");

// Rate limiting: 3 CV parses per user per hour (MODULE_A_DECISIONS.md §6).
const CV_PARSE_LIMIT = 3;
const CV_PARSE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const PARSE_CV_SYSTEM_PROMPT = `You are a CV parser. Extract work history and skills from the CV text.

You MUST map all skills to the CANONICAL_TAGS list below. Never invent tags that are not in this list. If a skill from the CV does not have an exact match, choose the closest canonical tag.

CANONICAL_TAGS (use only these): ${CANONICAL_TAG_LIST}

PERSONA_DEFINING_TAGS (at least 1 of these must appear in each proposed stack's must_have_tags): ${PERSONA_DEFINING_TAG_LIST}

For each role, extract: company, title, start_date (YYYY-MM), end_date (YYYY-MM or null if current), is_current, summary, canonical_skills_detected (mapped to CANONICAL_TAGS), raw_skills_detected (as written in CV).

Propose 1-2 personas (proposed_stacks) based on the extracted skills. Each must have exactly 5 must_have_tags, at least 1 of which must be persona_defining. The embedding_summary must be 50-500 characters, 3 dense sentences describing the persona for semantic matching.

Also infer the applicant's overall seniority level (inferred_seniority) based on years of experience, role titles, and career progression. Use one of: junior (0-2 years), mid (2-5 years), senior (5-8 years), lead (8-12 years), staff (12+ years), principal (15+ years). Choose the level that best represents the applicant's current career stage.`;

/**
 * Parse a CV's raw text with gpt-4o and persist the extraction to cvUpload.
 *
 * Flow:
 *   1. Auth check.
 *   2. Read label + originalFileName + rawText from FormData.
 *   3. Pre-LLM validity check (validateCvRawText) — rejects early to save cost.
 *   4. Insert cvUpload row with status="processing".
 *   5. Call generateObject with resumeExtractionSchema.
 *   6. On success: update row to status="valid" + extractedJson, return extraction.
 *   7. On failure: update row to status="invalid", return error.
 */
export async function parseCvAction(
  _prevState: ParseCvState,
  formData: FormData,
): Promise<ParseCvState> {
  const session = await getAuthSession();
  if (!session) {
    return { error: "Not authenticated", cvUploadId: null, extraction: null };
  }

  const label = formData.get("label") as string | null;
  const originalFileName = formData.get("originalFileName") as string | null;
  const rawText = formData.get("rawText") as string | null;

  if (!label || !rawText) {
    return {
      error: "Missing label or raw text",
      cvUploadId: null,
      extraction: null,
    };
  }

  // Pre-LLM validity check (MODULE_A_DECISIONS.md §10) — reject early.
  const validityError = validateCvRawText(rawText);
  if (validityError) {
    return { error: validityError, cvUploadId: null, extraction: null };
  }

  // Pre-LLM domain gate (MODULE_A_DECISIONS.md §13 Layer 1) — reject non-
  // developer CVs before spending gpt-4o budget. Checks for software development
  // markers in the raw text; rejects if zero found.
  const domainError = validateCvDomain(rawText);
  if (domainError) {
    return { error: domainError, cvUploadId: null, extraction: null };
  }

  // Rate limiting: 3 parses/hour/user (MODULE_A_DECISIONS.md §6).
  // Count all cvUpload rows created in the last hour for this applicant. The
  // count includes every row created by this action (valid, invalid, or still
  // processing) because the cost is the LLM call, not the outcome.
  const oneHourAgo = new Date(Date.now() - CV_PARSE_WINDOW_MS);
  const [{ parseCount }] = await db
    .select({ parseCount: count() })
    .from(cvUpload)
    .where(
      and(
        eq(cvUpload.applicantId, session.user.id),
        gt(cvUpload.createdAt, oneHourAgo),
      ),
    );

  if (parseCount >= CV_PARSE_LIMIT) {
    return {
      error:
        "You have reached the 3 CV parses per hour limit. Please try again later.",
      cvUploadId: null,
      extraction: null,
    };
  }

  // Ensure an applicant row exists (FK target for cv_upload.applicant_id).
  // The applicant row may not exist yet if this is the user's first onboarding
  // action — upsert with defaults (isOnboarded=false, empty arrays).
  await db
    .insert(applicant)
    .values({ userId: session.user.id })
    .onConflictDoNothing({ target: applicant.userId });

  // Create cvUpload row with status="processing" so we have an audit trail even
  // if the LLM call times out.
  const [upload] = await db
    .insert(cvUpload)
    .values({
      applicantId: session.user.id,
      label,
      originalFileName: originalFileName ?? null,
      rawText,
      status: "processing",
    })
    .returning({ id: cvUpload.id });

  try {
    const { object: extraction } = await generateObject({
      model: openai("gpt-4o"),
      schema: resumeExtractionSchema,
      system: PARSE_CV_SYSTEM_PROMPT,
      prompt: rawText,
    });

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
      error: `LLM extraction failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      cvUploadId: upload.id,
      extraction: null,
    };
  }
}

// =============================================================================
// finalizeOnboardingAction — State 2 → State 3
// =============================================================================

export type FinalizeOnboardingState = {
  error: string | null;
  success: boolean;
} | null;

/**
 * Convert a "YYYY-MM" string to a "YYYY-MM-DD" date string (first of month).
 * The workingHistory columns are Drizzle `date()` type, which accepts and
 * returns strings in PostgreSQL date format — not Date objects.
 */
function yyyyMmToDateString(yyyyMm: string): string {
  return `${yyyyMm}-01`;
}

/**
 * Finalize onboarding: persist the user-confirmed payload to the DB.
 *
 * Flow:
 *   1. Auth check.
 *   2. Parse + strictly re-validate the JSON payload with onboardingPayloadSchema.
 *   3. Generate persona embeddings (before the transaction — external API call).
 *   4. In a single db.transaction():
 *      a. Upsert applicant (set isOnboarded=true + user-collected fields).
 *      b. Insert workingHistory rows (converting YYYY-MM → Date).
 *      c. recomputeTagsExperience(tx, userId) — derives tagsExperience + allTags.
 *      d. Insert persona rows with embeddings.
 *   5. On any failure the transaction rolls back (AR1).
 */
export async function finalizeOnboardingAction(
  _prevState: FinalizeOnboardingState,
  formData: FormData,
): Promise<FinalizeOnboardingState> {
  const session = await getAuthSession();
  if (!session) {
    return { error: "Not authenticated", success: false };
  }

  const payloadJson = formData.get("payload") as string | null;
  if (!payloadJson) {
    return { error: "Missing payload", success: false };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return { error: "Invalid JSON payload", success: false };
  }

  // Strict double-validation — never trust the client.
  const parsed = onboardingPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Invalid payload",
      success: false,
    };
  }

  const data: OnboardingPayload = parsed.data;

  try {
    // Generate persona embeddings BEFORE the transaction so a failed API call
    // doesn't hold a DB transaction open (and doesn't leave partial rows).
    const embeddings = await generateEmbeddings(
      data.personas.map((p) => p.embeddingSummary),
    );

    await db.transaction(async (tx) => {
      // 1. Upsert applicant — set isOnboarded=true and the user-collected fields.
      await tx
        .insert(applicant)
        .values({
          userId: session.user.id,
          country: data.country,
          canWorkUsHours: data.canWorkUsHours,
          assignmentTypes: data.assignmentTypes,
          modalities: data.modalities,
          preferredCompliance: data.preferredCompliance,
          seniorityLevels: data.seniorityLevels,
          // WI4: New preference fields
          expectedCompMin:
            data.expectedCompMin !== null ? String(data.expectedCompMin) : null,
          yearsOfExperience: data.yearsOfExperience,
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
            seniorityLevels: data.seniorityLevels,
            // WI4: New preference fields
            expectedCompMin:
              data.expectedCompMin !== null
                ? String(data.expectedCompMin)
                : null,
            yearsOfExperience: data.yearsOfExperience,
            isOnboarded: true,
          },
        });

      // 2. Insert workingHistory rows (convert YYYY-MM strings to Date).
      await tx.insert(workingHistory).values(
        data.workHistory.map((entry) => ({
          applicantId: session.user.id,
          cvUploadId: data.cvUploadId,
          company: entry.company,
          role: entry.role,
          startDate: yyyyMmToDateString(entry.startDate),
          endDate: entry.endDate ? yyyyMmToDateString(entry.endDate) : null,
          isCurrent: entry.isCurrent,
          summary: entry.summary,
          canonicalSkillsDetected: entry.canonicalSkillsDetected,
          rawSkillsDetected: entry.rawSkillsDetected,
        })),
      );

      // 3. Recompute tagsExperience from the freshly-inserted workingHistory.
      //    Also rebuilds applicant.allTags and regenerates any persona embeddings
      //    whose mustHaveTags are no longer covered (no personas exist yet on
      //    first onboarding, so this is a no-op for the embedding step here).
      await recomputeTagsExperience(tx, session.user.id);

      // 4. Insert personas with the pre-generated embeddings.
      await tx.insert(persona).values(
        data.personas.map((p, i) => ({
          applicantId: session.user.id,
          personaId: p.personaId,
          personaLabel: p.personaLabel,
          embeddingSummary: p.embeddingSummary,
          personaEmbedding: embeddings[i],
          mustHaveTags: p.mustHaveTags,
          blocklistTags: p.blocklistTags,
          seniorityLevels: p.seniorityLevels ?? [],
        })),
      );
    });

    return { error: null, success: true };
  } catch (error) {
    return {
      error: `Onboarding failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      success: false,
    };
  }
}
