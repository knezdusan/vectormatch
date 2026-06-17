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
export * from "./jobs/enums";
export * from "./jobs/job";
export * from "./jobs/matchQueue";
export * from "./jobs/persona";

import { account } from "./auth/account";
import { session } from "./auth/session";
import { user as usersTable } from "./auth/user";
import { categoriesTable } from "./blog/categories";
import { commentsTable } from "./blog/comments";
import { postsTable, postTagsTable } from "./blog/posts";
import { tagsTable } from "./blog/tags";
import { applicant } from "./jobs/applicant";
import { job } from "./jobs/job";
import { matchQueue } from "./jobs/matchQueue";
import { persona } from "./jobs/persona";

// RELATIONS - AUTH

export const userRelations = relations(usersTable, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  posts: many(postsTable),
  comments: many(commentsTable),
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
}));

export const jobRelations = relations(job, ({ many }) => ({
  matches: many(matchQueue),
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
