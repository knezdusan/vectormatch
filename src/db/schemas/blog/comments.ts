import { type AnyPgColumn, integer, pgTable, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";
import { timestamps } from "@/lib/utils";
import { user as usersTable } from "../auth/user";
import { postsTable } from "./posts";

/** @deprecated Superseded by static MDX blog. Do not use in new code. */
export const commentsTable = pgTable("comment", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parentId: integer("parent_id").references(
    (): AnyPgColumn => commentsTable.id,
    {
      onDelete: "set null",
    },
  ),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  postId: integer("post_id")
    .notNull()
    .references(() => postsTable.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const commentSchema = createInsertSchema(commentsTable, {
  content: (schema) => schema.min(1),
  userId: (schema) => schema.min(1),
  postId: (schema) => schema.min(1),
}).pick({
  content: true,
  userId: true,
  parentId: true,
  postId: true,
});

export type CommentSchema = z.infer<typeof commentSchema>;

export type Comment = typeof commentsTable.$inferSelect;
export type NewComment = typeof commentsTable.$inferInsert;
