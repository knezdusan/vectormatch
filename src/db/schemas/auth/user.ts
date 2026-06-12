import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("ban_reason"),
  banExpires: timestamp("ban_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// Base insert schema: user-provided fields with validation (omits all auto-generated fields)
export const userSchema = createInsertSchema(user, {
  name: (schema) =>
    schema
      .min(2, "Name must be at least 2 characters")
      .max(50, "Name too long"),
  email: (schema) =>
    schema.email("Invalid email address").max(255, "Email too long"),
  image: (schema) => schema.url("Invalid image URL"),
}).pick({
  name: true,
  email: true,
  image: true,
});

// Sign-up form: name + email (from userSchema) + plain-text password
export const signUpSchema = userSchema.omit({ image: true }).extend({
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password too long"),
});

// Sign-in form: email (reuses userSchema validation) + plain-text password
export const signInSchema = userSchema.pick({ email: true }).extend({
  password: z.string().min(1, "Password is required"),
});

export type UserSchema = z.infer<typeof userSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
