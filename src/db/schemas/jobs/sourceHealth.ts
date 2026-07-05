// Source Health Tracking — Circuit Breakers (CORPUS_EXPANSION_HANDOFF.md Sprint 3 Task 4)
// src/db/schemas/jobs/sourceHealth.ts
//
// Per-source health row used by the circuit breaker that wraps every batch +
// daily source Inngest function. A source is auto-disabled after 5 consecutive
// failures (hard circuit breaker); it is flagged `degraded` after 3 (soft
// signal for manual review). Manual `disableSource()` / `enableSource()` calls
// override the automatic state.
//
// The table is keyed by `sourceName` (the Inngest function id, e.g.
// "daily-source-hn-algolia") so health lookups are O(1) and there is exactly
// one row per source.

import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

export const sourceHealth = pgTable("source_health", {
  sourceName: text("source_name").primaryKey(),
  // active | degraded | disabled | banned. `degraded` is set automatically
  // after 3 consecutive failures (source still runs). `disabled` is set
  // manually OR automatically when consecutiveFailures >= 5 (hard circuit
  // breaker). `banned` is set by the v2 daily source ban (Tier 5): when
  // escalationCount >= 3 in a sliding 24hr window, the source is banned for
  // 24hr and recovered by the sourceBanRecoveryCheck daily cron.
  status: text("status").notNull().default("active"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastSuccessAt: timestamp("last_success_at"),
  lastFailureAt: timestamp("last_failure_at"),
  lastError: text("last_error"),
  totalRuns: integer("total_runs").notNull().default(0),
  totalFailures: integer("total_failures").notNull().default(0),
  // Set when status flips to `disabled` — records why (manual or auto).
  disabledAt: timestamp("disabled_at"),
  disabledReason: text("disabled_reason"),

  // ── v2 Corpus Expansion: Circuit Breaker escalation (Criterion 3, Tier 5) ─
  // Count of 1hr-pause escalations in the current 24hr sliding window. When
  // this reaches 3, the source is banned for 24hr (status = 'banned'). Reset
  // to 0 by the sourceBanRecoveryCheck daily cron on successful recovery.
  // See docs/governing/company-corpus-expansion-new.md "Daily source ban".
  escalationCount: integer("escalation_count").notNull().default(0),
  // Timestamp of the most recent 1hr-pause escalation. Used to compute the
  // sliding 24hr window for the escalation_count >= 3 ban threshold.
  lastEscalatedAt: timestamp("last_escalated_at"),
});

export const sourceHealthSchema = createInsertSchema(sourceHealth);
export type SourceHealthSchema = z.infer<typeof sourceHealthSchema>;

export type SourceHealth = typeof sourceHealth.$inferSelect;
export type NewSourceHealth = typeof sourceHealth.$inferInsert;

// ── Constants ────────────────────────────────────────────────────────────────

/** Consecutive failures before a source is flagged `degraded` (soft signal). */
export const DEGRADED_FAILURE_THRESHOLD = 3;

/** Consecutive failures before the hard circuit breaker opens (auto-disable). */
export const HARD_CIRCUIT_BREAKER_THRESHOLD = 5;
