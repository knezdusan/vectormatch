import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const tagsTable = pgTable("tag", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 100 }).notNull().unique(),
});

export type Tag = typeof tagsTable.$inferSelect;
export type NewTag = typeof tagsTable.$inferInsert;
