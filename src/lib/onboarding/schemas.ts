// Resume Extraction & Onboarding Schemas (Schema 1 + Schema 2)
// src/lib/onboarding/schemas.ts
//
// The two Zod contracts that govern Module A data flow:
//
// Schema 1 (ResumeExtractionSchema) — what gpt-4o returns from parsing PDF
// text. Stored in cvUpload.extractedJson. Probabilistic, pre-user-review.
//
// Schema 2 (OnboardingPayloadSchema) — what the user submits after reviewing
// and confirming the extraction in the onboarding UI. This is the complete
// form payload that the Server Action persists to the DB (Schema 3).
//
// See RESEARCH_NOTE_schemas.md §2-3 and MODULE_A_DECISIONS.md for the locked
// decisions encoded here.

import { z } from "zod";

import { PERSONA_DEFINING_TAGS } from "@/lib/jobs/tech-tags";

// =============================================================================
// SCHEMA 1: Raw LLM Extraction Output
// =============================================================================
// What gpt-4o returns from parsing the PDF text via generateObject().
// This is the shape of cvUpload.extractedJson.
//
// Design principle: the LLM returns raw roles[] data. The server computes
// yearsOfExperience from merged date ranges — the LLM does NOT return a
// top-level calculated_years_of_experience. The LLM shows its work (date
// ranges); the math is done in TypeScript. (MODULE_A_DECISIONS.md §11)
// =============================================================================

export const schema1Role = z.object({
  company: z.string().describe("Company name as written in CV"),
  title: z.string().describe("Job title as written in CV"),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format")
    .describe("YYYY-MM format. If only year is available, use YYYY-01"),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Must be YYYY-MM format")
    .nullable()
    .describe("YYYY-MM format. Null if is_current is true"),
  is_current: z
    .boolean()
    .describe("True if this is the user's current position"),
  summary: z
    .string()
    .nullable()
    .describe(
      "1-2 sentence role description if present in CV. Null if absent.",
    ),
  canonical_skills_detected: z
    .array(z.string())
    .describe("Skills from this role, normalized against CANONICAL_TAGS"),
  raw_skills_detected: z
    .array(z.string())
    .describe("Skills as written in CV, before normalization"),
});

export const schema1ProposedStack = z.object({
  anchor_tag: z
    .string()
    .describe("The persona_defining tag that anchors this stack"),
  persona_label: z
    .string()
    .describe("Proposed persona label, e.g. 'Senior React Developer'"),
  persona_id: z
    .string()
    .describe("Proposed persona ID slug, e.g. 'react_frontend'"),
  must_have_tags: z
    .array(z.string())
    .length(5, "Each stack must have exactly 5 must_have_tags")
    .describe("Exactly 5 canonical tags for this stack"),
  embedding_summary: z
    .string()
    .min(50, "Embedding summary must be at least 50 characters")
    .max(500, "Embedding summary must be at most 500 characters")
    .describe("3-sentence dense summary for embedding generation"),
});

export const resumeExtractionSchema = z
  .object({
    // Per-role data — the single source for workingHistory
    roles: z
      .array(schema1Role)
      .min(1, "At least 1 employment entry is required for CV validity"),

    // Aggregated across all roles (union of per-role arrays)
    canonical_skills_detected: z
      .array(z.string())
      .describe("Union of all canonical_skills_detected across all roles"),
    raw_skills_detected: z
      .array(z.string())
      .describe("Union of all raw_skills_detected across all roles"),

    // LLM-proposed stacks (1-2) — NOT persisted to persona until user confirms
    proposed_stacks: z
      .array(schema1ProposedStack)
      .min(1, "At least 1 proposed stack is required")
      .max(2, "At most 2 proposed stacks"),
  })
  // Q8 decision: .refine() ensures the LLM obeys the "at least one
  // persona_defining tag" rule for each proposed stack.
  .refine(
    (data) =>
      data.proposed_stacks.every((stack) =>
        stack.must_have_tags.some((tag) => PERSONA_DEFINING_TAGS.has(tag)),
      ),
    {
      message:
        "Each proposed stack must contain at least 1 persona_defining tag",
    },
  )
  // CV validity check (post-LLM): at least 3 skills mapped to CANONICAL_TAGS
  .refine((data) => data.canonical_skills_detected.length >= 3, {
    message:
      "At least 3 skills must be mapped to CANONICAL_TAGS for CV validity",
  });

export type ResumeExtractionOutput = z.infer<typeof resumeExtractionSchema>;
export type Schema1Role = z.infer<typeof schema1Role>;
export type Schema1ProposedStack = z.infer<typeof schema1ProposedStack>;

// =============================================================================
// SCHEMA 2: Validated Onboarding Submission
// =============================================================================
// What the Server Action receives from the onboarding form submission.
// This is the complete payload that gets persisted to Schema 3 (DB tables).
//
// Includes:
// - User-collected fields (country, work preferences) — never from LLM
// - LLM-extracted, user-confirmed work history
// - LLM-proposed, user-confirmed personas
// =============================================================================

// Re-export the enums from the DB schema for Zod validation
// These must match src/db/schemas/jobs/enums.ts exactly
export const assignmentTypesEnum = z.enum([
  "remote",
  "hybrid",
  "on-site",
  "remote_local",
]);
export const modalitiesEnum = z.enum([
  "full-time",
  "part-time",
  "contract",
  "freelance",
  "internship",
]);
export const preferredComplianceEnum = z.enum([
  "w2",
  "local_employment",
  "eor",
  "b2b",
  "1099",
  "w8ben",
  "ic_global",
]);

export const schema2WorkHistoryEntry = z.object({
  company: z.string().min(1, "Company is required"),
  role: z.string().min(1, "Role is required"),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Start date must be YYYY-MM format"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "End date must be YYYY-MM format")
    .nullable(),
  isCurrent: z.boolean(),
  summary: z.string().nullable(),
  canonicalSkillsDetected: z.array(z.string()),
  rawSkillsDetected: z.array(z.string()),
});

export const schema2Persona = z.object({
  personaId: z.string().min(1, "Persona ID is required"),
  personaLabel: z.string().min(1, "Persona label is required"),
  embeddingSummary: z
    .string()
    .min(50, "Embedding summary must be at least 50 characters")
    .max(500, "Embedding summary must be at most 500 characters"),
  mustHaveTags: z
    .array(z.string())
    .length(5, "Each persona must have exactly 5 mustHaveTags"),
  blocklistTags: z.array(z.string()).default([]),
});

export const onboardingPayloadSchema = z
  .object({
    // User-collected (never from LLM) — mandatory for onboarding completion
    country: z
      .string()
      .length(2, "Country must be ISO 3166-1 alpha-2 (2 characters)"),
    canWorkUsHours: z.boolean(),
    assignmentTypes: z
      .array(assignmentTypesEnum)
      .min(1, "At least 1 assignment type is required"),
    modalities: z
      .array(modalitiesEnum)
      .min(1, "At least 1 modality is required"),
    preferredCompliance: z
      .array(preferredComplianceEnum)
      .min(1, "At least 1 compliance preference is required"),

    // LLM-extracted, user-confirmed
    cvUploadId: z.string().uuid("cvUploadId must be a valid UUID"),
    workHistory: z
      .array(schema2WorkHistoryEntry)
      .min(1, "At least 1 work history entry is required"),

    // LLM-proposed, user-confirmed
    personas: z
      .array(schema2Persona)
      .min(1, "At least 1 persona is required")
      .max(3, "At most 3 personas allowed"),
  })
  // Each persona must have at least 1 persona_defining tag in mustHaveTags
  .refine(
    (data) =>
      data.personas.every((persona) =>
        persona.mustHaveTags.some((tag) => PERSONA_DEFINING_TAGS.has(tag)),
      ),
    {
      message:
        "Each persona must contain at least 1 persona_defining tag in mustHaveTags",
    },
  );

export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;
export type OnboardingPayloadInput = z.input<typeof onboardingPayloadSchema>;
export type Schema2WorkHistoryEntry = z.infer<typeof schema2WorkHistoryEntry>;
export type Schema2Persona = z.infer<typeof schema2Persona>;
export type AssignmentType = z.infer<typeof assignmentTypesEnum>;
export type Modality = z.infer<typeof modalitiesEnum>;
export type PreferredCompliance = z.infer<typeof preferredComplianceEnum>;

// =============================================================================
// CV VALIDITY CHECKS (Pre-LLM)
// =============================================================================
// These run on the raw text BEFORE the LLM call, to reject invalid uploads
// early and save the gpt-4o cost. (MODULE_A_DECISIONS.md §10)
// =============================================================================

/** Minimum raw text length to reject image-only PDFs, corrupt files, blank pages. */
export const MIN_CV_RAW_TEXT_LENGTH = 200;

/** Regex to detect at least one year-like pattern (4-digit year). */
const YEAR_PATTERN = /\b(19|20)\d{2}\b/;

/**
 * Pre-LLM CV validity check. Returns null if valid, or an error message.
 * Called on the raw text extracted by the pdfjs-dist Web Worker, before
 * sending to the LLM.
 */
export function validateCvRawText(rawText: string): string | null {
  if (rawText.length < MIN_CV_RAW_TEXT_LENGTH) {
    return `CV text is too short (${rawText.length} characters). This may be an image-only PDF, a corrupt file, or a blank document. Please upload a text-based PDF resume.`;
  }
  if (!YEAR_PATTERN.test(rawText)) {
    return "No date-like patterns (years) found in the CV text. Please upload a resume that includes employment dates.";
  }
  return null;
}
