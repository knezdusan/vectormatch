import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type { z } from "zod";

export const rateLimit = pgTable(
  "rate_limit",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    // Better Auth v1.6+ sliding-window algorithm stores last request as Unix ms.
    // Must be bigint — Date.now() exceeds INTEGER max (~2.1 billion).
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("rate_limit_expires_at_idx").on(table.expiresAt)],
);

export const rateLimitSchema = createInsertSchema(rateLimit);
export type RateLimitSchema = z.infer<typeof rateLimitSchema>;

export type RateLimit = typeof rateLimit.$inferSelect;
export type NewRateLimit = typeof rateLimit.$inferInsert;
