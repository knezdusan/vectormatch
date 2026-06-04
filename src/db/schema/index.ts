export * from "./blog/category";
export * from "./blog/comment";
export * from "./blog/post";
export * from "./blog/tag";
export * from "./user";

import { relations } from "drizzle-orm";
import { categoriesTable } from "./blog/category";
import { commentsTable } from "./blog/comment";
import { postsTable, postTagsTable } from "./blog/post";
import { tagsTable } from "./blog/tag";
import { usersTable } from "./user";

export const usersRelations = relations(usersTable, ({ many }) => ({
  posts: many(postsTable),
  comments: many(commentsTable),
}));

export const categoriesRelations = relations(categoriesTable, ({ many }) => ({
  posts: many(postsTable),
}));

export const tagsRelations = relations(tagsTable, ({ many }) => ({
  postTags: many(postTagsTable),
}));

export const postsRelations = relations(postsTable, ({ one, many }) => ({
  author: one(usersTable, {
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

export const postTagsRelations = relations(postTagsTable, ({ one }) => ({
  post: one(postsTable, {
    fields: [postTagsTable.postId],
    references: [postsTable.id],
  }),
  tag: one(tagsTable, {
    fields: [postTagsTable.tagId],
    references: [tagsTable.id],
  }),
}));

export const commentsRelations = relations(commentsTable, ({ one, many }) => ({
  author: one(usersTable, {
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
