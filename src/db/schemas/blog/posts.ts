import {
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  varchar,
} from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { timestamps } from "@/lib/utils";
import { user as usersTable } from "../auth/user";
import { categoriesTable } from "./categories";
import { tagsTable } from "./tags";

export const statusEnum = pgEnum("status", ["draft", "published", "archived"]);

export const postsTable = pgTable("post", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 500 }).notNull(),
  slug: varchar("slug", { length: 500 }).notNull().unique(),
  shortDescription: text("short_description"),
  content: text("content").notNull(),
  categoryId: integer("category_id").references(() => categoriesTable.id, {
    onDelete: "set null",
  }),
  status: statusEnum("status").notNull().default("draft"),
  ...timestamps,
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

const postFieldsSchema = createInsertSchema(postsTable, {
  title: (schema) => schema.min(1),
  slug: (schema) => schema.min(1),
  shortDescription: (schema) => schema.min(1).max(255).optional(),
  content: (schema) => schema.min(1),
  userId: (schema) => schema.min(1),
  categoryId: (schema) => schema.min(1).optional(),
})
  .pick({
    title: true,
    slug: true,
    shortDescription: true,
    content: true,
    userId: true,
    categoryId: true,
  })
  .extend({
    tagIds: z.array(z.number().int().min(1)),
  });

export const postSchema = z.discriminatedUnion("mode", [
  postFieldsSchema.extend({
    mode: z.literal("create"),
  }),
  postFieldsSchema.extend({
    mode: z.literal("edit"),
    id: z.number().int().min(1),
  }),
]);

export type PostSchema = z.infer<typeof postSchema>;

export const postTagSchema = createInsertSchema(postTagsTable);
export type PostTagSchema = z.infer<typeof postTagSchema>;

export type Post = typeof postsTable.$inferSelect;
export type NewPost = typeof postsTable.$inferInsert;
export type PostTag = typeof postTagsTable.$inferSelect;
