import { date, integer, pgTable, text, varchar } from "drizzle-orm/pg-core";

import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { isValidAge } from "../../lib/utils";
import { timestamps } from "./index";

export const usersTable = pgTable("user", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: varchar("name", { length: 255 }).notNull(),
  dateOfBirth: date("date_of_birth"),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  ...timestamps,
});

const userFieldsSchema = createInsertSchema(usersTable, {
  name: (schema) => schema.min(1),
  email: (schema) => schema.email(),
  password: (schema) => schema.min(8),
  dateOfBirth: (schema) =>
    schema.refine(
      isValidAge,
      "Date of birth must be between 14 and 99 years ago",
    ),
}).pick({
  name: true,
  email: true,
  password: true,
  dateOfBirth: true,
});

export const userSchema = z.discriminatedUnion("mode", [
  userFieldsSchema.extend({
    mode: z.literal("signUp"),
  }),
  userFieldsSchema
    .pick({
      email: true,
      password: true,
    })
    .extend({
      mode: z.literal("signIn"),
    }),
  userFieldsSchema
    .pick({
      name: true,
      dateOfBirth: true,
    })
    .extend({
      mode: z.literal("update"),
      id: z.number().int().min(1),
    }),
]);

export type UserSchema = z.infer<typeof userSchema>;

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;
