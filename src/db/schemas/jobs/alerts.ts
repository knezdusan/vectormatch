// Alerts Table — Alerting System (Sprint 4 Task 8)
// src/db/schemas/jobs/alerts.ts
//
// Records infrastructure and pipeline alerts for the admin dashboard:
//   - storage_near_limit: Neon storage approaching 512MB limit
//   - schema_validation_spike: Zod validation failure rate spiked
//   - circuit_breaker_trip: A source circuit breaker opened (auto-disabled)
//   - storage_critical: Neon storage at critical level (>94%)
//
// Alerts are created by the alerting module (src/lib/jobs/alerting.ts) and
// displayed on the admin dashboard. They can be resolved manually or
// automatically when the underlying condition clears.

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

// ── Enums ────────────────────────────────────────────────────────────────────

export const alertSeverityEnum = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
]);

export const alertTypeEnum = pgEnum("alert_type", [
  "storage_near_limit",
  "storage_critical",
  "schema_validation_spike",
  "circuit_breaker_trip",
]);

// ── Table ────────────────────────────────────────────────────────────────────

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── Alert Identity ──────────────────────────────────────────────────────
    type: alertTypeEnum("type").notNull(),
    severity: alertSeverityEnum("severity").notNull(),

    // Human-readable message for the dashboard
    message: text("message").notNull(),

    // Structured details (JSON string) for debugging
    details: text("details"),

    // ── Source ──────────────────────────────────────────────────────────────
    // The source that triggered the alert (e.g., "batch-source-crt-sh" for
    // circuit breaker trips, null for storage alerts)
    sourceName: text("source_name"),

    // ── Lifecycle ───────────────────────────────────────────────────────────
    // active | resolved. Alerts start as "active" and are resolved when the
    // underlying condition clears or an admin manually resolves them.
    status: text("status").notNull().default("active"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
    resolvedBy: text("resolved_by"), // "auto" or user ID
  },
  (table) => ({
    // Index for querying active alerts (dashboard)
    statusIdx: index("alerts_status_idx").on(table.status),
    // Index for finding alerts by type (deduplication checks)
    typeIdx: index("alerts_type_idx").on(table.type),
    // Index for finding alerts by source (circuit breaker trips)
    sourceIdx: index("alerts_source_name_idx").on(table.sourceName),
  }),
);

export const alertSchema = createInsertSchema(alerts);
export type AlertSchema = z.infer<typeof alertSchema>;

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
