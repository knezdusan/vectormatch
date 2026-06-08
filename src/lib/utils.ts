import { type ClassValue, clsx } from "clsx";
import { timestamp } from "drizzle-orm/pg-core";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isValidAge(date: Date | string | null | undefined): boolean {
  if (!date) return true;
  const now = new Date();
  const dob = new Date(date);
  const age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  const adjustedAge =
    monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())
      ? age - 1
      : age;
  return adjustedAge >= 14 && adjustedAge <= 99;
}

export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// DB Helpers ********************
export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
