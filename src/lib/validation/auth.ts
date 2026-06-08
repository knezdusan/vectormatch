import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { user } from "@/db/schemas/auth";

// Infer schema from user table for signup
export const signUpSchema = createInsertSchema(user, {
  name: (schema) =>
    schema
      .min(2, "Name must be at least 2 characters")
      .max(100, "Name too long"),
  email: (schema) =>
    schema.email("Invalid email address").max(255, "Email too long"),
})
  .pick({
    name: true,
    email: true,
  })
  .extend({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password too long"),
  });

// Sign in schema (email and password only)
export const signInSchema = z.object({
  email: z.string().email("Invalid email address").max(255, "Email too long"),
  password: z.string().min(1, "Password is required"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
