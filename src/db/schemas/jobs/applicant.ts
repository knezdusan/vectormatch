import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";

import { user } from "../auth/user";
import {
  assignmentTypeEnum,
  complianceEnum,
  modalityEnum,
  seniorityLevelEnum,
} from "./enums";

export const applicant = pgTable("applicant", {
  // 1:1 Relationship constraint & Primary Key
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),

  isOnboarded: boolean("is_onboarded").default(false),
  country: text("country"), // ISO 3166-1 alpha-2
  canWorkUsHours: boolean("can_work_us_hours"),

  assignmentTypes: assignmentTypeEnum("assignment_types").array(),
  modalities: modalityEnum("modalities").array(),
  preferredCompliance: complianceEnum("preferred_compliance").array(),

  // Seniority levels the applicant wants to match against. Pre-selected from
  // the LLM-inferred level during CV parsing; user can adjust in onboarding
  // and profile management. Multi-select so users can match multiple levels
  // (e.g., "senior" + "lead"). Gate 3 LLM checks the job's inferred seniority
  // against this list.
  seniorityLevels: seniorityLevelEnum("seniority_levels").array(),

  // The global knowledge base for Gate 3 LLM evaluation
  allTags: text("all_tags").array().notNull().default(sql`'{}'::text[]`),

  // ── Gate 0.5 hard-blocker preferences (added July 2026) ──────────────────
  // Minimum acceptable annual compensation in USD. NULL until the user sets
  // it via onboarding/profile management. When NULL, the compensation check
  // in Gate 0.5 is skipped (soft-fail-open). See GATE_0_5_GEO_FENCING_HANDOFF.md.
  expectedCompMin: numeric("expected_comp_min"),
  // Total years of professional experience. NULL until the user sets it.
  // When NULL, the experience band check in Gate 0.5 is skipped.
  yearsOfExperience: integer("years_of_experience"),

  // ── Work authorization permits (added July 2026) ────────────────────────
  // Work permits and citizenship statuses the applicant holds. Used by Gate 3
  // to check against jobs that require specific work authorization (e.g., "EU
  // citizenship required", "RWR Card Plus", "Blue Card EU", "UK settled
  // status"). Stored as text[] (not a pgEnum) so new permit types can be added
  // without a DB migration. NULL/empty until the user sets it via
  // onboarding/profile management. When empty, Gate 3's work-auth check is
  // soft-fail-open (the job is not blocked just because we don't know the
  // applicant's permits — but workAuthRiskFlag may still be set for hybrid /
  // single-country-remote roles with silent JDs).
  // Valid values: eu_citizen, rwr_card_plus, blue_card_eu, uk_settled,
  // uk_pre_settled, us_green_card, us_citizen, canadian_pr, swiss_permit_c,
  // other_permit.
  workAuthorizations: text("work_authorizations").array(),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const applicantSchema = createInsertSchema(applicant);
export type ApplicantSchema = z.infer<typeof applicantSchema>;

export type Applicant = typeof applicant.$inferSelect;
export type NewApplicant = typeof applicant.$inferInsert;
