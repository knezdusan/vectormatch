// Profile Editing Schemas (post-onboarding mutations)
// src/lib/onboarding/profile-schemas.ts
//
// Zod contracts for the State 3 full-editing Server Actions. These are separate
// from the onboarding schemas because the payloads are partial updates and the
// UI/UX constraints differ from the initial onboarding flow.

import { z } from "zod";

import {
  assignmentTypesEnum,
  modalitiesEnum,
  preferredComplianceEnum,
  seniorityLevelsEnum,
  validateAdjacentSeniority,
  workAuthorizationsEnum,
} from "./schemas";

// =============================================================================
// Preferences update
// =============================================================================

export const updatePreferencesSchema = z.object({
  country: z
    .string()
    .length(2, "Country must be ISO 3166-1 alpha-2 (2 characters)"),
  canWorkUsHours: z.boolean(),
  assignmentTypes: z
    .array(assignmentTypesEnum)
    .min(1, "At least 1 assignment type is required"),
  modalities: z.array(modalitiesEnum).min(1, "At least 1 modality is required"),
  preferredCompliance: z
    .array(preferredComplianceEnum)
    .min(1, "At least 1 compliance preference is required"),
  seniorityLevels: z
    .array(seniorityLevelsEnum)
    .min(1, "At least 1 seniority level is required"),
  // Work authorizations are optional — the user may not hold any named permits.
  // When empty, Gate 3 soft-fail-opens on the work-auth check but may still set
  // workAuthRiskFlag for hybrid/single-country-remote roles.
  workAuthorizations: z.array(workAuthorizationsEnum).default([]),
  // WI4: Compensation expectation (annual, USD). Nullable — user may skip.
  // Stored as numeric in the DB (expected_comp_min). Drizzle returns string,
  // so we accept number | null here and convert to string in the action.
  expectedCompMin: z
    .number()
    .int("Expected compensation must be an integer")
    .min(0, "Expected compensation cannot be negative")
    .max(1000000, "Expected compensation seems unreasonably high")
    .nullable()
    .default(null),
  // WI4: Years of experience. Nullable — user may skip.
  // Stored as integer in the DB (years_of_experience).
  yearsOfExperience: z
    .number()
    .int("Years of experience must be an integer")
    .min(0, "Years of experience cannot be negative")
    .max(60, "Years of experience seems unreasonably high")
    .nullable()
    .default(null),
});

// =============================================================================
// Work history CRUD
// =============================================================================

const workHistoryEntrySchema = z.object({
  id: z.string().uuid().optional(), // omitted for new entries
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
  canonicalSkillsDetected: z
    .array(z.string())
    .min(1, "At least 1 skill is required"),
  rawSkillsDetected: z.array(z.string()).default([]),
  cvUploadId: z.string().uuid().optional(), // resolved by the action if omitted
});

export const updateWorkHistoryPayloadSchema = z.object({
  entries: z.array(workHistoryEntrySchema),
});

// =============================================================================
// Persona CRUD
// =============================================================================

const personaSchema = z.object({
  id: z.string().uuid().optional(), // omitted for new personas
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
  // consecutive (adjacent). Initialized from applicant's inferred seniority.
  seniorityLevels: z.array(seniorityLevelsEnum).max(3).default([]),
});

export const updatePersonasPayloadSchema = z
  .object({
    personas: z
      .array(personaSchema)
      .min(1, "At least 1 persona is required")
      .max(3, "At most 3 personas allowed"),
  })
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

export type PersonaInput = z.input<typeof personaSchema>;

// =============================================================================
// CV re-parse
// =============================================================================

export const reparseCvSchema = z.object({
  cvUploadId: z.string().uuid("Invalid CV upload ID"),
});
