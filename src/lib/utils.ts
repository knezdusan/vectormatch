import { type ClassValue, clsx } from "clsx";
import { timestamp } from "drizzle-orm/pg-core";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// fallow-ignore-next-line
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
