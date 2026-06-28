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
});

export type UpdatePreferencesInput = z.input<typeof updatePreferencesSchema>;

// =============================================================================
// Work history CRUD
// =============================================================================

export const workHistoryEntrySchema = z.object({
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

export type WorkHistoryEntryInput = z.input<typeof workHistoryEntrySchema>;
export type UpdateWorkHistoryInput = z.input<
  typeof updateWorkHistoryPayloadSchema
>;

// =============================================================================
// Persona CRUD
// =============================================================================

export const personaSchema = z.object({
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
});

export const updatePersonasPayloadSchema = z.object({
  personas: z
    .array(personaSchema)
    .min(1, "At least 1 persona is required")
    .max(3, "At most 3 personas allowed"),
});

export type PersonaInput = z.input<typeof personaSchema>;
export type UpdatePersonasInput = z.input<typeof updatePersonasPayloadSchema>;

// =============================================================================
// CV re-parse
// =============================================================================

export const reparseCvSchema = z.object({
  cvUploadId: z.string().uuid("Invalid CV upload ID"),
});

export type ReparseCvInput = z.input<typeof reparseCvSchema>;
