// ============================================================================
// BLOG SCHEMAS
// ⚠️ DEPRECATED — RETAINED HISTORICALLY (see vectormatch-blueprint.md)
// The blog is now static MDX (src/app/(public)/blog/_posts/*.mdx). These
// tables are kept ONLY to preserve migration history. DO NOT import or
// reference categoriesTable, tagsTable, postsTable, postTagsTable, or
// commentsTable in any new application code. Comments are fully superseded
// by Giscus.
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
// BLOG
export * from "./blog/categories";
export * from "./blog/comments";
export * from "./blog/posts";
export * from "./blog/tags";
// JOBS
export * from "./jobs/applicant";
export * from "./jobs/company";
export * from "./jobs/cvUpload";
export * from "./jobs/enums";
export * from "./jobs/ingestionLog";
export * from "./jobs/job";
export * from "./jobs/matchQueue";
export * from "./jobs/persona";
export * from "./jobs/sluggerRetry";
export * from "./jobs/tagsExperience";
export * from "./jobs/workingHistory";

import { account } from "./auth/account";
import { session } from "./auth/session";
import { user as usersTable } from "./auth/user";
import { categoriesTable } from "./blog/categories";
import { commentsTable } from "./blog/comments";
import { postsTable, postTagsTable } from "./blog/posts";
import { tagsTable } from "./blog/tags";
import { applicant } from "./jobs/applicant";
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
  // posts: many(postsTable),
  // comments: many(commentsTable),
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
}));

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

// RELATIONS - BLOG

export const categoryRelations = relations(categoriesTable, ({ many }) => ({
  posts: many(postsTable),
}));

export const tagRelations = relations(tagsTable, ({ many }) => ({
  postTags: many(postTagsTable),
}));

export const postRelations = relations(postsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [postsTable.userId],
    references: [usersTable.id],
  }),
  category: one(categoriesTable, {
    fields: [postsTable.categoryId],
    references: [categoriesTable.id],
  }),
  postTags: many(postTagsTable),
  comments: many(commentsTable),
}));

export const postTagRelations = relations(postTagsTable, ({ one }) => ({
  post: one(postsTable, {
    fields: [postTagsTable.postId],
    references: [postsTable.id],
  }),
  tag: one(tagsTable, {
    fields: [postTagsTable.tagId],
    references: [tagsTable.id],
  }),
}));

export const commentRelations = relations(commentsTable, ({ one, many }) => ({
  user: one(usersTable, {
    fields: [commentsTable.userId],
    references: [usersTable.id],
  }),
  post: one(postsTable, {
    fields: [commentsTable.postId],
    references: [postsTable.id],
  }),
  parent: one(commentsTable, {
    fields: [commentsTable.parentId],
    references: [commentsTable.id],
    relationName: "comment_replies",
  }),
  replies: many(commentsTable, { relationName: "comment_replies" }),
}));
