import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const categoriesTable = pgTable("category", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull().unique(),
});

export type Category = typeof categoriesTable.$inferSelect;
export type NewCategory = typeof categoriesTable.$inferInsert;
