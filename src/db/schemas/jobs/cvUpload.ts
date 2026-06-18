import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

import { applicant } from "./applicant";
import { cvUploadStatusEnum } from "./enums";

// CV UPLOAD TABLE
// src/db/schemas/jobs/cvUpload.ts
//
// Persists every CV upload attempt — the raw extracted text (from the pdfjs-dist
// Web Worker), the full LLM extraction payload (Schema 1, for audit/re-parse),
// and a lifecycle status that drives the onboarding state machine.
//
// This table is the anchor for `workingHistory` rows (each role is associated
// with the CV it was extracted from via `cvUploadId`). A user may have multiple
// CV uploads (paid tier); the `status` field distinguishes active, abandoned,
// and invalid uploads.
//
// State machine mapping (Module A §2d):
//   State 1 (no CV) → user uploads → row created with status="processing"
//   Worker + LLM complete → status="valid" (enters State 2 review) or "invalid" (back to State 1)
//   User abandons onboarding → status="abandoned" (orphan, cleanup-eligible)
//   User completes onboarding → workingHistory/tagsExperience/persona rows created from this upload
export const cvUpload = pgTable(
  "cv_upload",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),

    // The mandatory user-provided name for this CV (blueprint: "CV upload modal
    // with mandatory CV naming field"). E.g., "Senior React CV 2024".
    label: text("label").notNull(),

    // The original filename from the user's filesystem. Stored for display in
    // the CV list view; not used for parsing (parsing uses rawText).
    originalFileName: text("original_file_name"),

    // Raw text extracted client-side by the pdfjs-dist Web Worker. This is the
    // input to the LLM extraction. Retained so we can re-parse with an updated
    // ResumeExtractionSchema without requiring the user to re-upload.
    rawText: text("raw_text").notNull(),

    // The full Schema 1 LLM output payload (gpt-4o extraction result). Stored
    // as JSONB for structural validation and potential partial queries. This is
    // the audit trail — the structured data lives in workingHistory and
    // tagsExperience rows derived from this payload.
    extractedJson: jsonb("extracted_json"),

    // Lifecycle status — see cvUploadStatusEnum above.
    status: cvUploadStatusEnum("status").notNull().default("processing"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    applicantIdIdx: index("cv_upload_applicant_id_idx").on(table.applicantId),
    // Composite index for the common query: "find the user's valid/active CVs"
    applicantStatusIdx: index("cv_upload_applicant_status_idx").on(
      table.applicantId,
      table.status,
    ),
  }),
);

export const cvUploadSchema = createInsertSchema(cvUpload);
export type CvUploadSchema = z.infer<typeof cvUploadSchema>;

export type CvUpload = typeof cvUpload.$inferSelect;
export type NewCvUpload = typeof cvUpload.$inferInsert;
