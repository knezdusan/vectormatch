"use server";

// Profile Editing Server Actions — State 3 full editing (post-onboarding)
// src/actions/profile.ts
//
// These actions power the editable Profile Management view. Each action:
//   - Authenticates the caller.
//   - Re-validates the payload with Zod.
//   - Performs the mutation inside a transaction where appropriate.
//   - Recomputes derived state (tagsExperience, allTags, embeddings) when
//     underlying data changes.

import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { and, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/db";
import { applicant, cvUpload, persona, workingHistory } from "@/db/schemas";
import { inngest } from "@/inngest/client";
import { generateEmbeddings } from "@/lib/ai/embeddings";
import { getAuthSession } from "@/lib/auth";
import { CANONICAL_TAGS, PERSONA_DEFINING_TAGS } from "@/lib/jobs/tech-tags";
import {
  reparseCvSchema,
  updatePersonasPayloadSchema,
  updatePreferencesSchema,
  updateWorkHistoryPayloadSchema,
} from "@/lib/onboarding/profile-schemas";
import { recomputeTagsExperience } from "@/lib/onboarding/recompute-tags";
import {
  resumeExtractionSchema,
  validateCvDomain,
  validateCvRawText,
} from "@/lib/onboarding/schemas";

// =============================================================================
// Shared helpers
// =============================================================================

export type ActionState = { error: string | null; success: boolean } | null;

function yyyyMmToDateString(yyyyMm: string): string {
  return `${yyyyMm}-01`;
}

function fail(message: string): ActionState {
  return { error: message, success: false };
}

function ok(): ActionState {
  return { error: null, success: true };
}

// Reused from parseCvAction — kept in sync with the canonical taxonomy.
const CANONICAL_TAG_LIST = CANONICAL_TAGS.map((t) => t.tag).join(", ");
const PERSONA_DEFINING_TAG_LIST = Array.from(PERSONA_DEFINING_TAGS).join(", ");

const PARSE_CV_SYSTEM_PROMPT = `You are a CV parser. Extract work history and skills from the CV text.

You MUST map all skills to the CANONICAL_TAGS list below. Never invent tags that are not in this list. If a skill from the CV does not have an exact match, choose the closest canonical tag.

CANONICAL_TAGS (use only these): ${CANONICAL_TAG_LIST}

PERSONA_DEFINING_TAGS (at least 1 of these must appear in each proposed stack's must_have_tags): ${PERSONA_DEFINING_TAG_LIST}

For each role, extract: company, title, start_date (YYYY-MM), end_date (YYYY-MM or null if current), is_current, summary, canonical_skills_detected (mapped to CANONICAL_TAGS), raw_skills_detected (as written in CV).

Propose 1-2 personas (proposed_stacks) based on the extracted skills. Each must have exactly 5 must_have_tags, at least 1 of which must be persona_defining. The embedding_summary must be 50-500 characters, 3 dense sentences describing the persona for semantic matching.

Also infer the applicant's overall seniority level (inferred_seniority) based on years of experience, role titles, and career progression. Use one of: junior (0-2 years), mid (2-5 years), senior (5-8 years), lead (8-12 years), staff (12+ years), principal (15+ years). Choose the level that best represents the applicant's current career stage.`;

// =============================================================================
// 1. Update applicant preferences
// =============================================================================

export async function updateApplicantPreferencesAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthSession();
  if (!session) return fail("Not authenticated");

  const payloadJson = formData.get("payload") as string | null;
  if (!payloadJson) return fail("Missing payload");

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return fail("Invalid JSON payload");
  }

  const parsed = updatePreferencesSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  try {
    await db
      .update(applicant)
      .set({
        country: parsed.data.country,
        canWorkUsHours: parsed.data.canWorkUsHours,
        assignmentTypes: parsed.data.assignmentTypes,
        modalities: parsed.data.modalities,
        preferredCompliance: parsed.data.preferredCompliance,
        seniorityLevels: parsed.data.seniorityLevels,
      })
      .where(eq(applicant.userId, session.user.id));

    return ok();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unknown error");
  }
}

// =============================================================================
// 2. Work history CRUD (and derived skill recompute)
// =============================================================================

export async function updateWorkHistoryAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthSession();
  if (!session) return fail("Not authenticated");

  const payloadJson = formData.get("payload") as string | null;
  if (!payloadJson) return fail("Missing payload");

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return fail("Invalid JSON payload");
  }

  const parsed = updateWorkHistoryPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { entries } = parsed.data;
  const userId = session.user.id;

  try {
    await db.transaction(async (tx) => {
      // Resolve a fallback cvUpload for any new entries that don't provide one.
      // New entries added manually post-onboarding must still satisfy the
      // workingHistory.cvUploadId NOT NULL FK.
      let fallbackCvUploadId: string | null = null;
      const needsFallbackCv = entries.some((e) => !e.id && !e.cvUploadId);
      if (needsFallbackCv) {
        const [latestCv] = await tx
          .select({ id: cvUpload.id })
          .from(cvUpload)
          .where(eq(cvUpload.applicantId, userId))
          .orderBy(desc(cvUpload.createdAt))
          .limit(1);
        if (!latestCv) {
          throw new Error(
            "No CV upload found. Please upload a CV before adding work history.",
          );
        }
        fallbackCvUploadId = latestCv.id;
      }

      // Update existing rows and collect their IDs.
      const keptIds = new Set<string>();
      for (const entry of entries) {
        if (entry.id) {
          await tx
            .update(workingHistory)
            .set({
              company: entry.company,
              role: entry.role,
              startDate: yyyyMmToDateString(entry.startDate),
              endDate: entry.endDate ? yyyyMmToDateString(entry.endDate) : null,
              isCurrent: entry.isCurrent,
              summary: entry.summary,
              canonicalSkillsDetected: entry.canonicalSkillsDetected,
              rawSkillsDetected: entry.rawSkillsDetected,
            })
            .where(
              and(
                eq(workingHistory.id, entry.id),
                eq(workingHistory.applicantId, userId),
              ),
            );
          keptIds.add(entry.id);
        }
      }

      // Insert new rows.
      const newEntries = entries.filter((e) => !e.id);
      if (newEntries.length > 0) {
        await tx.insert(workingHistory).values(
          newEntries.map((entry) => {
            const cvUploadId = entry.cvUploadId ?? fallbackCvUploadId;
            if (!cvUploadId) {
              throw new Error(
                "Could not resolve cvUploadId for new work history entry.",
              );
            }
            return {
              applicantId: userId,
              cvUploadId,
              company: entry.company,
              role: entry.role,
              startDate: yyyyMmToDateString(entry.startDate),
              endDate: entry.endDate ? yyyyMmToDateString(entry.endDate) : null,
              isCurrent: entry.isCurrent,
              summary: entry.summary,
              canonicalSkillsDetected: entry.canonicalSkillsDetected,
              rawSkillsDetected: entry.rawSkillsDetected,
            };
          }),
        );
      }

      // Delete rows that were removed, scoped to this applicant and to the
      // IDs that existed before this update.
      const existingIds = await tx
        .select({ id: workingHistory.id })
        .from(workingHistory)
        .where(eq(workingHistory.applicantId, userId));
      const idsToDelete = existingIds
        .map((r) => r.id)
        .filter((id) => !keptIds.has(id));
      if (idsToDelete.length > 0) {
        await tx
          .delete(workingHistory)
          .where(
            and(
              eq(workingHistory.applicantId, userId),
              inArray(workingHistory.id, idsToDelete),
            ),
          );
      }

      // Recompute derived skills and allTags transactionally.
      await recomputeTagsExperience(tx, userId);
    });

    return ok();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unknown error");
  }
}

// =============================================================================
// 3. Persona CRUD (with embedding regeneration when tags/summary change)
// =============================================================================

export async function updatePersonasAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthSession();
  if (!session) return fail("Not authenticated");

  const payloadJson = formData.get("payload") as string | null;
  if (!payloadJson) return fail("Missing payload");

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return fail("Invalid JSON payload");
  }

  const parsed = updatePersonasPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { personas: personasInput } = parsed.data;
  const userId = session.user.id;

  // Enforce at least one persona-defining tag per persona (same rule as onboarding).
  const allPersonasDefining = personasInput.every((p) =>
    p.mustHaveTags.some((t) => PERSONA_DEFINING_TAGS.has(t)),
  );
  if (!allPersonasDefining) {
    return fail("Each persona must contain at least 1 persona-defining tag");
  }

  try {
    // Read existing personas to detect deletes and to compare old vs new tags
    // for embedding regeneration.
    const existingPersonas = await db
      .select()
      .from(persona)
      .where(eq(persona.applicantId, userId));

    const existingById = new Map(existingPersonas.map((p) => [p.id, p]));
    const updatedIds = new Set<string>();
    for (const p of personasInput) {
      if (p.id) updatedIds.add(p.id);
    }

    // Determine which personas need new embeddings.
    // A new embedding is needed when:
    //   - the persona is new (no id)
    //   - the embeddingSummary changed
    //   - the mustHaveTags set changed (order-insensitive)
    const summariesToEmbed: { index: number; summary: string }[] = [];
    for (let i = 0; i < personasInput.length; i++) {
      const p = personasInput[i];
      if (!p.id) {
        summariesToEmbed.push({ index: i, summary: p.embeddingSummary });
        continue;
      }
      const existing = existingById.get(p.id);
      if (!existing) continue;

      const summaryChanged = existing.embeddingSummary !== p.embeddingSummary;
      const tagsChanged =
        new Set(existing.mustHaveTags).size !== new Set(p.mustHaveTags).size ||
        p.mustHaveTags.some((t) => !existing.mustHaveTags.includes(t));

      if (summaryChanged || tagsChanged) {
        summariesToEmbed.push({ index: i, summary: p.embeddingSummary });
      }
    }

    // Generate embeddings outside the transaction so a failed API call does not
    // hold a DB transaction open.
    const embeddings = await generateEmbeddings(
      summariesToEmbed.map((s) => s.summary),
    );
    const embeddingByIndex = new Map(
      summariesToEmbed.map((s, i) => [s.index, embeddings[i]]),
    );

    await db.transaction(async (tx) => {
      // Update or insert each persona.
      for (let i = 0; i < personasInput.length; i++) {
        const p = personasInput[i];
        const embedding = embeddingByIndex.get(i);
        const baseValues = {
          applicantId: userId,
          personaId: p.personaId,
          personaLabel: p.personaLabel,
          embeddingSummary: p.embeddingSummary,
          mustHaveTags: p.mustHaveTags,
          blocklistTags: p.blocklistTags,
          seniorityLevels: p.seniorityLevels ?? [],
        };

        if (p.id) {
          const setValues = embedding
            ? { ...baseValues, personaEmbedding: embedding }
            : baseValues;
          await tx
            .update(persona)
            .set(setValues)
            .where(and(eq(persona.id, p.id), eq(persona.applicantId, userId)));
        } else {
          if (!embedding) {
            throw new Error("Missing embedding for new persona");
          }
          await tx.insert(persona).values({
            ...baseValues,
            personaEmbedding: embedding,
          });
        }
      }

      // Delete personas not present in the payload, scoped to this applicant.
      const idsToDelete = existingPersonas
        .map((p) => p.id)
        .filter((id) => !updatedIds.has(id));
      if (idsToDelete.length > 0) {
        await tx
          .delete(persona)
          .where(
            and(
              eq(persona.applicantId, userId),
              inArray(persona.id, idsToDelete),
            ),
          );
      }
    });

    // Gate 3 Feedback Loop: emit persona/updated events for personas whose
    // tags or embedding summary changed. The personaUpdatedHandler Inngest
    // function re-evaluates rejected match_queue rows for these personas.
    const changedPersonaIds: string[] = [];
    for (let i = 0; i < personasInput.length; i++) {
      const p = personasInput[i];
      if (!p.id) continue;
      const existing = existingPersonas.find((ep) => ep.id === p.id);
      if (!existing) continue;
      const summaryChanged = existing.embeddingSummary !== p.embeddingSummary;
      const tagsChanged =
        new Set(existing.mustHaveTags).size !== new Set(p.mustHaveTags).size ||
        p.mustHaveTags.some((t) => !existing.mustHaveTags.includes(t));
      const blocklistChanged =
        new Set(existing.blocklistTags).size !==
          new Set(p.blocklistTags).size ||
        p.blocklistTags.some((t) => !existing.blocklistTags.includes(t));
      const seniorityChanged =
        new Set(existing.seniorityLevels ?? []).size !==
          new Set(p.seniorityLevels ?? []).size ||
        (p.seniorityLevels ?? []).some(
          (s) => !(existing.seniorityLevels ?? []).includes(s),
        );
      if (
        summaryChanged ||
        tagsChanged ||
        blocklistChanged ||
        seniorityChanged
      ) {
        changedPersonaIds.push(p.id);
      }
    }

    if (changedPersonaIds.length > 0) {
      await inngest.send(
        changedPersonaIds.map((pid) => ({
          id: `persona-updated-${pid}-${Date.now()}`,
          name: "persona/updated" as const,
          data: { personaId: pid },
        })),
      );
    }

    return ok();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unknown error");
  }
}

// =============================================================================
// 5. CV re-parse (replace working history for a CV and recompute tags)
// =============================================================================

export async function reparseCvAction(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getAuthSession();
  if (!session) return fail("Not authenticated");

  const payloadJson = formData.get("payload") as string | null;
  if (!payloadJson) return fail("Missing payload");

  let payload: unknown;
  try {
    payload = JSON.parse(payloadJson);
  } catch {
    return fail("Invalid JSON payload");
  }

  const parsed = reparseCvSchema.safeParse(payload);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid payload");
  }

  const { cvUploadId } = parsed.data;
  const userId = session.user.id;

  try {
    // Verify ownership and read the raw text.
    const [upload] = await db
      .select()
      .from(cvUpload)
      .where(and(eq(cvUpload.id, cvUploadId), eq(cvUpload.applicantId, userId)))
      .limit(1);

    if (!upload) return fail("CV upload not found");

    const rawText = upload.rawText;
    const validityError = validateCvRawText(rawText);
    if (validityError) return fail(validityError);

    const domainError = validateCvDomain(rawText);
    if (domainError) return fail(domainError);

    // Run the LLM extraction.
    const { object: extraction } = await generateObject({
      model: openai("gpt-4o"),
      schema: resumeExtractionSchema,
      system: PARSE_CV_SYSTEM_PROMPT,
      prompt: rawText,
    });

    await db.transaction(async (tx) => {
      // Update the cvUpload row with the new extraction.
      await tx
        .update(cvUpload)
        .set({ extractedJson: extraction, status: "valid" })
        .where(eq(cvUpload.id, cvUploadId));

      // Replace workingHistory entries linked to this CV.
      await tx
        .delete(workingHistory)
        .where(eq(workingHistory.cvUploadId, cvUploadId));

      await tx.insert(workingHistory).values(
        extraction.roles.map((role) => ({
          applicantId: userId,
          cvUploadId,
          company: role.company,
          role: role.title,
          startDate: yyyyMmToDateString(role.start_date),
          endDate: role.end_date ? yyyyMmToDateString(role.end_date) : null,
          isCurrent: role.is_current,
          summary: role.summary,
          canonicalSkillsDetected: role.canonical_skills_detected,
          rawSkillsDetected: role.raw_skills_detected,
        })),
      );

      // Recompute derived skills, allTags, and any affected persona embeddings.
      await recomputeTagsExperience(tx, userId);
    });

    return ok();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Unknown error");
  }
}
