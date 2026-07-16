// ============================================================================
// BLOG SCHEMAS — REMOVED
// The blog has migrated from MDX to WordPress + Elementor (see
// feat/wordpress-blog-migration branch). The deprecated blog_* tables
// (categories, tags, posts, post_tags, comments) have been dropped via
// Drizzle migration. This section is intentionally left empty as a
// placeholder for future non-blog schema additions.
// ============================================================================

import { relations } from "drizzle-orm";

export { timestamps } from "@/lib/utils";

// AUTH
export * from "./auth/account";
export * from "./auth/rateLimit";
export * from "./auth/session";

export * from "./auth/user";
export { user as usersTable } from "./auth/user";
export * from "./auth/verification";
// JOBS
export * from "./jobs/alerts";
export * from "./jobs/applicant";
export * from "./jobs/applicantCompanyBlock";
export * from "./jobs/company";
export * from "./jobs/companyDiscoverySources";
export * from "./jobs/companyQualityScore";
export * from "./jobs/cvUpload";
export * from "./jobs/enums";
export * from "./jobs/excludedCountries";
export * from "./jobs/inboundEmail";
export * from "./jobs/ingestionLog";
export * from "./jobs/job";
export * from "./jobs/matchQueue";
export * from "./jobs/migrationTracking";
export * from "./jobs/persona";
export * from "./jobs/sentEmail";
export * from "./jobs/sluggerRetry";
export * from "./jobs/sourceHealth";
export * from "./jobs/tagsExperience";
export * from "./jobs/workingHistory";

import { account } from "./auth/account";
import { session } from "./auth/session";
import { user as usersTable } from "./auth/user";
import { applicant } from "./jobs/applicant";
import { applicantCompanyBlock } from "./jobs/applicantCompanyBlock";
import { company } from "./jobs/company";
import { cvUpload } from "./jobs/cvUpload";
import { ingestionLog } from "./jobs/ingestionLog";
import { job } from "./jobs/job";
import { matchQueue } from "./jobs/matchQueue";
import { persona } from "./jobs/persona";
import { tagsExperience } from "./jobs/tagsExperience";
import { workingHistory } from "./jobs/workingHistory";

// RELATIONS - AUTH

export const userRelations = relations(usersTable, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(usersTable, {
    fields: [session.userId],
    references: [usersTable.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(usersTable, {
    fields: [account.userId],
    references: [usersTable.id],
  }),
}));

// RELATIONS - JOBS

export const applicantRelations = relations(applicant, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [applicant.userId],
    references: [usersTable.id],
  }),
  personas: many(persona),
  matches: many(matchQueue),
  cvUploads: many(cvUpload),
  workingHistory: many(workingHistory),
  tagsExperience: many(tagsExperience),
  companyBlocks: many(applicantCompanyBlock),
}));

export const applicantCompanyBlockRelations = relations(
  applicantCompanyBlock,
  ({ one }) => ({
    user: one(usersTable, {
      fields: [applicantCompanyBlock.userId],
      references: [usersTable.id],
    }),
  }),
);

export const jobRelations = relations(job, ({ many }) => ({
  matches: many(matchQueue),
}));

// NOTE: company ↔ job is a LOGICAL relationship (matched by atsSource +
// atsSlug), not a Drizzle relation — see TDD §4.0. No FK is enforced to avoid
// poller failures when a job arrives for a slug not yet in the registry.
export const companyRelations = relations(company, ({ many }) => ({
  ingestionLogs: many(ingestionLog),
}));

export const ingestionLogRelations = relations(ingestionLog, ({ one }) => ({
  company: one(company, {
    fields: [ingestionLog.companyId],
    references: [company.id],
  }),
}));

export const personaRelations = relations(persona, ({ one }) => ({
  applicant: one(applicant, {
    fields: [persona.applicantId],
    references: [applicant.userId],
  }),
}));

export const matchQueueRelations = relations(matchQueue, ({ one }) => ({
  job: one(job, {
    fields: [matchQueue.jobId],
    references: [job.id],
  }),
  applicant: one(applicant, {
    fields: [matchQueue.applicantId],
    references: [applicant.userId],
  }),
}));

export const cvUploadRelations = relations(cvUpload, ({ one, many }) => ({
  applicant: one(applicant, {
    fields: [cvUpload.applicantId],
    references: [applicant.userId],
  }),
  workingHistory: many(workingHistory),
}));

export const workingHistoryRelations = relations(workingHistory, ({ one }) => ({
  applicant: one(applicant, {
    fields: [workingHistory.applicantId],
    references: [applicant.userId],
  }),
  cvUpload: one(cvUpload, {
    fields: [workingHistory.cvUploadId],
    references: [cvUpload.id],
  }),
}));

export const tagsExperienceRelations = relations(tagsExperience, ({ one }) => ({
  applicant: one(applicant, {
    fields: [tagsExperience.applicantId],
    references: [applicant.userId],
  }),
}));
