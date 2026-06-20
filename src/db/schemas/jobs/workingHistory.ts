import {
  boolean,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

import { applicant } from "./applicant";
import { cvUpload } from "./cvUpload";

// WORKING HISTORY TABLE
// src/db/schemas/jobs/workingHistory.ts
//
// Single source of truth for the user's work history. Each row represents one
// employment entry extracted from a CV (by the LLM) or added manually by the
// user post-onboarding.
//
// This table is the input to recomputeTagsExperience() — the function that
// merges date ranges per canonical tag and populates tagsExperience. It is
// also the source for the role dropdown in the persona creation UI
// (CANONICAL_ROLES provides the dropdown options; this table stores what the
// user actually selected/edited).
//
// Each row is associated with a specific cvUpload via cvUploadId (CASCADE
// delete). If a CV is deleted, its work history entries are deleted too.
export const workingHistory = pgTable(
  "working_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),
    cvUploadId: uuid("cv_upload_id")
      .notNull()
      .references(() => cvUpload.id, { onDelete: "cascade" }),

    company: text("company").notNull(),
    role: text("role").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    isCurrent: boolean("is_current").notNull(),

    // Deferred feature (Q9 decision): nullable, not populated in MVP UI, but
    // column exists to avoid a painful backfill migration when Gate 3 needs
    // historical role context later.
    summary: text("summary"),

    canonicalSkillsDetected: text("canonical_skills_detected")
      .array()
      .notNull(),
    rawSkillsDetected: text("raw_skills_detected").array().notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    roleIdx: index("working_history_role_idx").on(table.role),
    applicantIdIdx: index("working_history_applicant_id_idx").on(
      table.applicantId,
    ),
    cvUploadIdIdx: index("working_history_cv_upload_id_idx").on(
      table.cvUploadId,
    ),
  }),
);

export const workingHistorySchema = createInsertSchema(workingHistory);
export type WorkingHistorySchema = z.infer<typeof workingHistorySchema>;

export type WorkingHistory = typeof workingHistory.$inferSelect;
export type NewWorkingHistory = typeof workingHistory.$inferInsert;
