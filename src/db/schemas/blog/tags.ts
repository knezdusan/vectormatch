import { integer, pgTable, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";

/** @deprecated Superseded by static MDX blog. Do not use in new code. */
export const tagsTable = pgTable("tag", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export const tagSchema = createInsertSchema(tagsTable);
export type TagSchema = z.infer<typeof tagSchema>;

export type Tag = typeof tagsTable.$inferSelect;
export type NewTag = typeof tagsTable.$inferInsert;
