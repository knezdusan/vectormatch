import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

import { applicant } from "./applicant";

// TAGS EXPERIENCE TABLE
// src/db/schemas/jobs/tagsExperience.ts
//
// Single source of truth for the user's skills and years of experience per
// skill. This table is NOT populated by the LLM directly — it is computed by
// recomputeTagsExperience(applicantId), which reads workingHistory, merges
// overlapping date ranges per canonical tag, and upserts the results here.
//
// This table is the source for:
// - persona.mustHaveTags selection (the UI offers tags from this table)
// - applicant.allTags (rebuilt as union of active canonicalTag values)
// - Experience level derivation (junior/mid/senior based on yearsOfExperience)
//
// The `active` flag lets users deactivate non-critical skills without deleting
// the row. Deactivated tags are excluded from allTags and from persona tag
// selection, but remain for audit/re-activation.
//
// recomputeTagsExperience() must be wrapped in a Drizzle transaction
// (db.transaction) — see MODULE_A_DECISIONS.md AR1. If it fails halfway, the
// entire operation rolls back to prevent persona corruption.
//
// Note: isPersonaDefining is NOT stored here (it's a global static property of
// the tag in CANONICAL_TAGS). Derive it at query time via PERSONA_DEFINING_TAGS
// Set from src/lib/jobs/tech-tags.ts.
export const tagsExperience = pgTable(
  "tags_experience",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),

    canonicalTag: text("canonical_tag").notNull(),
    yearsOfExperience: numeric("years_of_experience", {
      precision: 3,
      scale: 1,
    }).notNull(),
    active: boolean("active").default(true).notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    tagIdx: index("tags_experience_tag_idx").on(table.canonicalTag),
    applicantIdIdx: index("tags_experience_applicant_id_idx").on(
      table.applicantId,
    ),
    // Unique constraint enables upsert (INSERT ... ON CONFLICT UPDATE) during
    // recomputeTagsExperience(). Without this, re-aggregation could create
    // duplicate rows for the same (applicantId, canonicalTag) pair.
    uniqueApplicantTag: uniqueIndex("tags_experience_unique").on(
      table.applicantId,
      table.canonicalTag,
    ),
  }),
);

export const tagsExperienceSchema = createInsertSchema(tagsExperience);
export type TagsExperienceSchema = z.infer<typeof tagsExperienceSchema>;

export type TagsExperience = typeof tagsExperience.$inferSelect;
export type NewTagsExperience = typeof tagsExperience.$inferInsert;
