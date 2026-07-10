// Migration Tracking — out-of-band migration reconciliation (A5 hardening)
// src/db/schemas/jobs/migrationTracking.ts
//
// Drizzle's __drizzle_migrations table only records migrations applied via
// `drizzle-kit migrate`. Migrations applied manually out-of-band (e.g. via
// Neon SQL editor or psql) are invisible to it, causing the tracking table
// to diverge from the repo journal. A0 found 47 entries in
// __drizzle_migrations but 50 in the repo journal (0047-0049 applied
// manually).
//
// This table provides a single source of truth that accounts for BOTH
// drizzle-kit-applied and manually-applied migrations. It is updated by
// drizzle-kit (for automated applies) and by the admin (for manual applies),
// and can be reconciled against the repo's migration journal to detect drift.

import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

export const migrationTracking = pgTable("migration_tracking", {
  // The migration number from the repo journal (e.g. "0049")
  migrationNumber: text("migration_number").primaryKey(),
  // The Drizzle-generated migration name (e.g. "powerful_gamora")
  migrationName: text("migration_name").notNull(),
  // SHA-256 hash of the SQL file content (for integrity verification)
  hash: text("hash").notNull(),
  // How the migration was applied:
  //   "drizzle_kit" — via `drizzle-kit migrate` (also recorded in __drizzle_migrations)
  //   "manual_sql"  — applied out-of-band via Neon SQL editor / psql
  appliedBy: text("applied_by").notNull().default("drizzle_kit"),
  // When the migration was applied
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
  // Git commit SHA at the time of application (for correlating with deploys)
  gitCommit: text("git_commit"),
  // Whether this migration has been verified against the repo journal
  // (set to true after reconciliation confirms the DB matches the journal)
  verified: boolean("verified").notNull().default(false),
});

export const migrationTrackingSchema = createInsertSchema(migrationTracking);
export type MigrationTrackingSchema = z.infer<typeof migrationTrackingSchema>;

export type MigrationTracking = typeof migrationTracking.$inferSelect;
export type NewMigrationTracking = typeof migrationTracking.$inferInsert;
