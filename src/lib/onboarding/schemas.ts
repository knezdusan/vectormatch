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

import { CANONICAL_TAGS, PERSONA_DEFINING_TAGS } from "@/lib/jobs/tech-tags";

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

const schema1Role = z.object({
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

const schema1ProposedStack = z.object({
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

    // LLM-inferred seniority level — pre-selects the seniority checkbox in
    // the onboarding form. The user can adjust or add more levels.
    inferred_seniority: z
      .enum(["junior", "mid", "senior", "lead", "staff", "principal"])
      .describe(
        "The applicant's inferred seniority level based on years of experience and role titles in the CV",
      ),
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
  })
  // CV domain gate Layer 2 (MODULE_A_DECISIONS.md §13): at least 1
  // persona_defining tag in the aggregated canonical_skills_detected. This
  // catches adjacent-but-out-of-scope roles (web designers, QA analysts) who
  // pass the ≥3 canonical skills check with only supporting tags (html, css,
  // git) but have no identity-anchoring technology.
  .refine(
    (data) =>
      data.canonical_skills_detected.some((tag) =>
        PERSONA_DEFINING_TAGS.has(tag),
      ),
    {
      message:
        "Your CV must include at least one primary programming language or framework (such as JavaScript, Python, React, Node.js) to proceed.",
    },
  );

export type ResumeExtractionOutput = z.infer<typeof resumeExtractionSchema>;

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
export const seniorityLevelsEnum = z.enum([
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
]);

/**
 * The canonical ordering of seniority levels (junior → principal).
 * Used by validateAdjacentSeniority to check that selected levels are
 * consecutive (no gaps) and at most 3.
 */
export const SENIORITY_ORDER: readonly SeniorityLevel[] = [
  "junior",
  "mid",
  "senior",
  "lead",
  "staff",
  "principal",
] as const;

/**
 * Validate that a set of seniority levels is:
 *   1. At most 3 selected
 *   2. Consecutive (adjacent) in the SENIORITY_ORDER — no gaps
 *
 * Returns null if valid, or an error message string.
 *
 * Examples:
 *   ["senior"]                    → null (valid, 1 level)
 *   ["senior", "lead"]            → null (valid, 2 adjacent)
 *   ["mid", "senior", "lead"]     → null (valid, 3 adjacent)
 *   ["junior", "senior"]          → "must be consecutive" (gap: mid missing)
 *   ["junior", "mid", "senior", "lead"] → "at most 3" (4 selected)
 *   []                            → null (empty is valid; Gate 3 treats as "any")
 */
export function validateAdjacentSeniority(levels: string[]): string | null {
  if (levels.length === 0) return null;
  if (levels.length > 3) {
    return "Select at most 3 seniority levels per persona";
  }
  // Map each level to its index in SENIORITY_ORDER
  const indices = levels
    .map((l) => SENIORITY_ORDER.indexOf(l as SeniorityLevel))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  if (indices.length !== levels.length) {
    return "Invalid seniority level";
  }
  // Check consecutiveness: each index should be prev + 1
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) {
      return "Selected seniority levels must be consecutive (e.g., mid, senior, lead — not junior, senior)";
    }
  }
  return null;
}

const schema2WorkHistoryEntry = z.object({
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

const schema2Persona = z.object({
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
  // Per-persona seniority levels — drives Gate 3 matching. Max 3, must be
  // consecutive (adjacent) in the seniority enum ordering. Initialized from
  // the applicant's inferred seniority during onboarding.
  seniorityLevels: z.array(seniorityLevelsEnum).max(3).default([]),
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
    seniorityLevels: z
      .array(seniorityLevelsEnum)
      .min(1, "At least 1 seniority level is required"),

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
  )
  // Each persona's seniority levels must be ≤3 and consecutive (adjacent)
  .refine(
    (data) =>
      data.personas.every(
        (persona) =>
          validateAdjacentSeniority(persona.seniorityLevels ?? []) === null,
      ),
    {
      message:
        "Each persona's seniority levels must be at most 3 and consecutive (e.g., mid, senior, lead)",
    },
  );

export type OnboardingPayload = z.infer<typeof onboardingPayloadSchema>;
export type OnboardingPayloadInput = z.input<typeof onboardingPayloadSchema>;
export type Schema2WorkHistoryEntry = z.infer<typeof schema2WorkHistoryEntry>;
export type Schema2Persona = z.infer<typeof schema2Persona>;
export type AssignmentType = z.infer<typeof assignmentTypesEnum>;
export type Modality = z.infer<typeof modalitiesEnum>;
export type PreferredCompliance = z.infer<typeof preferredComplianceEnum>;
export type SeniorityLevel = z.infer<typeof seniorityLevelsEnum>;

// =============================================================================
// CV VALIDITY CHECKS (Pre-LLM)
// =============================================================================
// These run on the raw text BEFORE the LLM call, to reject invalid uploads
// early and save the gpt-4o cost. (MODULE_A_DECISIONS.md §10)
// =============================================================================

/** Minimum raw text length to reject image-only PDFs, corrupt files, blank pages. */
const MIN_CV_RAW_TEXT_LENGTH = 200;

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

// =============================================================================
// CV DOMAIN GATE — Layer 1: Pre-LLM Developer Detection
// (MODULE_A_DECISIONS.md §13)
// =============================================================================
// A keyword-presence scan on the raw PDF text, before any LLM call. If zero
// software development markers are found, the CV is almost certainly not from
// a developer and is rejected immediately — saving the gpt-4o cost.
//
// Markers are derived from PERSONA_DEFINING_TAGS labels (so the list stays in
// sync with the taxonomy automatically) plus a small supplemental list of
// dev-culture terms not in CANONICAL_TAGS. Ambiguous short labels that are
// common English words/letters (C, R, Go) are excluded — they are still
// enforced at Layer 2 (post-LLM persona_defining refine).
//
// Matching uses word-boundary regex (\b{label}(?![\w])) — not naive includes(),
// which would false-match short tag names inside common words (e.g. "go" in
// "going", "c" in almost any text). The (?![\w]) negative lookahead handles
// labels ending in non-word characters (C#, C++, Next.js).
// =============================================================================

/** Labels excluded from Layer 1 matching — common English words/letters
 * that would false-match on a non-developer's CV. Still enforced at Layer 2. */
const AMBIGUOUS_LABELS = new Set(["C", "R", "Go"]);

/** Dev-culture markers not in CANONICAL_TAGS — high-signal terms that would
 * not appear on a non-developer's professional CV. */
const SUPPLEMENTAL_DEV_MARKERS: string[] = [
  "github",
  "gitlab",
  "stackoverflow",
  "vscode",
  "visual studio code",
  "intellij",
  "leetcode",
  "hackerrank",
  "npm",
  "pnpm",
  "webpack",
  "vite",
  "eslint",
  "golang",
  "programming",
  "software engineer",
  "software developer",
  "web developer",
];

/** Escape regex special characters in a string for safe embedding in a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** All marker strings: derived from persona_defining tag labels + supplemental. */
const ALL_DEV_MARKERS: string[] = [
  ...CANONICAL_TAGS.filter(
    (t) =>
      t.classification === "persona_defining" && !AMBIGUOUS_LABELS.has(t.label),
  ).map((t) => t.label),
  ...SUPPLEMENTAL_DEV_MARKERS,
];

/** Pre-compiled word-boundary regexes — one per marker. Built once at module
 * load. The `i` flag makes matching case-insensitive (CVs use varying cases). */
const DEV_MARKER_REGEXES: RegExp[] = ALL_DEV_MARKERS.map(
  (marker) => new RegExp(`\\b${escapeRegex(marker)}(?![\\w])`, "i"),
);

/**
 * Layer 1 pre-LLM domain check. Returns null if the raw text contains at least
 * one software development marker, or an error message if zero markers found.
 * Called on the raw text after validateCvRawText passes, before the LLM call.
 */
export function validateCvDomain(rawText: string): string | null {
  const hasMarker = DEV_MARKER_REGEXES.some((regex) => regex.test(rawText));
  if (!hasMarker) {
    return "VectorMatch is built for software developers and engineers. Your CV doesn't appear to contain technical development experience. Please upload a developer CV.";
  }
  return null;
}
