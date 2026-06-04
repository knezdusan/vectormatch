import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

import { categoriesTable, tagsTable, usersTable } from "../index";

export const statusEnum = pgEnum("status", ["draft", "published"]);

export const postsTable = pgTable("post", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  shortDescription: text("short_description"),
  content: text("content").notNull(),
  categoryId: integer("category_id").references(() => categoriesTable.id, {
    onDelete: "set null",
  }),
  status: statusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const postTagsTable = pgTable(
  "post_tags",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => postsTable.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tagsTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.tagId] })],
);

export type Post = typeof postsTable.$inferSelect;
export type NewPost = typeof postsTable.$inferInsert;
export type PostTag = typeof postTagsTable.$inferSelect;
