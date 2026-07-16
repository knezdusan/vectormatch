// Per-User Company Blacklist (Directive 11, Fix 5)
// src/db/schemas/jobs/applicantCompanyBlock.ts
//
// Allows users to block companies from appearing in their match results.
// When a user marks a company as "not interested" (e.g., Redhorsecorp), the
// system excludes all jobs from that company from future matching.
//
// The block is per-user (not global) — one user's block doesn't affect other
// users. Multi-user blocks feed the audit stream as a corpus-quality signal.

import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "../auth/user";

export const applicantCompanyBlock = pgTable(
  "applicant_company_block",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The user who blocked the company
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // The ATS slug of the blocked company (e.g., "redhorsecorp")
    // This matches the ats_slug column in the job table
    atsSlug: text("ats_slug").notNull(),
    // Optional: the company name as displayed to the user (for audit/display)
    companyName: text("company_name"),
    // Optional: reason for blocking (for the audit stream)
    reason: text("reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // One block per user per company
    uniqueIndex("applicant_company_block_unique_idx").on(
      table.userId,
      table.atsSlug,
    ),
  ],
);

export type ApplicantCompanyBlock = typeof applicantCompanyBlock.$inferSelect;
export type NewApplicantCompanyBlock =
  typeof applicantCompanyBlock.$inferInsert;
