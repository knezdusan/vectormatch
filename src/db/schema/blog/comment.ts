import {
  type AnyPgColumn,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { postsTable, usersTable } from "../index";

export const commentsTable = pgTable("comment", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  parentId: integer("parent_id").references(
    (): AnyPgColumn => commentsTable.id,
    {
      onDelete: "set null",
    },
  ),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  postId: integer("post_id")
    .notNull()
    .references(() => postsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Comment = typeof commentsTable.$inferSelect;
export type NewComment = typeof commentsTable.$inferInsert;
