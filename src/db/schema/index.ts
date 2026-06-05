import { relations } from "drizzle-orm";

export { timestamps } from "@/lib/utils";

export * from "./blog/category";
export * from "./blog/comment";
export * from "./blog/post";
export * from "./blog/tag";
export * from "./user";

import { categoriesTable } from "./blog/category";
import { commentsTable } from "./blog/comment";
import { postsTable, postTagsTable } from "./blog/post";
import { tagsTable } from "./blog/tag";
import { usersTable } from "./user";

export const userRelations = relations(usersTable, ({ many }) => ({
  posts: many(postsTable),
  comments: many(commentsTable),
}));

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
