// Slugger Retry Queue — F1 (TDD §1.4)
// src/db/schemas/jobs/sluggerRetry.ts
//
// Companies that fail Slugger resolution (no ATS found via DB cache, CNAME, or
// slug probe) are stored here with `nextRetryAt` timestamps. A daily Inngest
// function retries them after 30/60/90 days — companies may configure an ATS
// later, especially post-funding.

import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { discoverySourceEnum } from "./enums";

export const sluggerRetry = pgTable("slugger_retry", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyName: text("company_name").notNull(),
  website: text("website"),
  discoverySource: discoverySourceEnum("discovery_source").notNull(),
  discoveryContext: text("discovery_context"),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type SluggerRetry = typeof sluggerRetry.$inferSelect;
export type NewSluggerRetry = typeof sluggerRetry.$inferInsert;
