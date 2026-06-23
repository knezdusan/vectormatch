import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

import { company } from "./company";
import { ingestionLogStatusEnum, ingestionLogTypeEnum } from "./enums";

// INGESTION LOG TABLE — Observability
// src/db/schemas/jobs/ingestionLog.ts
//
// Without observability the pipeline is a black box. Every seeder and poller
// run is logged here, plus the two daily maintenance jobs (tier recalculation
// and stale cleanup). The admin ingestion dashboard reads from this table.
//
// companyId is nullable: seed runs and stale_cleanup runs are not tied to a
// single company, so companyId is left null for those log types. poll and
// tier_recalc entries reference the affected company.
//
// errorDetails is JSONB — stores structured diagnostics (Zod error issues,
// HTTP status codes, partial-failure breakdowns) for debugging without
// requiring a schema migration when the diagnostic shape evolves.
export const ingestionLog = pgTable(
  "ingestion_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: ingestionLogTypeEnum("type").notNull(),
    status: ingestionLogStatusEnum("status").notNull(),
    companyId: uuid("company_id") // FK to company.id (nullable for seed/cleanup)
      .references(() => company.id, { onDelete: "set null" }),
    source: text("source"), // e.g. "hn_algolia", "httparchive", "greenhouse"
    // Metrics
    itemsProcessed: integer("items_processed").notNull().default(0),
    itemsInserted: integer("items_inserted").notNull().default(0),
    itemsUpdated: integer("items_updated").notNull().default(0),
    itemsRejected: integer("items_rejected").notNull().default(0), // Failed Gate 0 or Zod
    itemsSkipped: integer("items_skipped").notNull().default(0), // Duplicates
    // Error details
    errorMessage: text("error_message"),
    errorDetails: jsonb("error_details"), // Zod error issues, HTTP status codes, etc.
    // Duration
    startedAt: timestamp("started_at").notNull(),
    finishedAt: timestamp("finished_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    typeIdx: index("ingestion_log_type_idx").on(table.type, table.createdAt),
    companyIdx: index("ingestion_log_company_idx").on(
      table.companyId,
      table.createdAt,
    ),
    statusIdx: index("ingestion_log_status_idx").on(
      table.status,
      table.createdAt,
    ),
  }),
);

export const ingestionLogSchema = createInsertSchema(ingestionLog);
export type IngestionLogSchema = z.infer<typeof ingestionLogSchema>;

export type IngestionLog = typeof ingestionLog.$inferSelect;
export type NewIngestionLog = typeof ingestionLog.$inferInsert;
