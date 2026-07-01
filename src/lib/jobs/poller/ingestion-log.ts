// Ingestion Logger — Observability for Seeders and Poller
// src/lib/jobs/poller/ingestion-log.ts
//
// Writes observability rows to the `ingestionLog` table after every seeder
// and poller run. The admin ingestion dashboard reads from this table.
//
// See TDD §4.0b (ingestionLog table) for the full specification.

import { db } from "@/db/db";
import { ingestionLog } from "@/db/schemas/jobs/ingestionLog";

// ── Types ────────────────────────────────────────────────────────────────────

export type IngestionLogType =
  | "seed"
  | "poll"
  | "batch_poll"
  | "tier_recalc"
  | "stale_cleanup";

export type IngestionLogStatus = "success" | "partial" | "failed";

export interface IngestionLogEntry {
  type: IngestionLogType;
  status: IngestionLogStatus;
  companyId?: string;
  source?: string;
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsSkipped: number;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
  startedAt: Date;
  finishedAt?: Date;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Write an ingestion log entry. Called after every seeder/poller run.
 * This is fire-and-forget — if the log write fails, the pipeline continues.
 */
export async function writeIngestionLog(
  entry: IngestionLogEntry,
): Promise<void> {
  try {
    await db.insert(ingestionLog).values({
      type: entry.type,
      status: entry.status,
      companyId: entry.companyId ?? null,
      source: entry.source ?? null,
      itemsProcessed: entry.itemsProcessed,
      itemsInserted: entry.itemsInserted,
      itemsUpdated: entry.itemsUpdated,
      itemsRejected: entry.itemsRejected,
      itemsSkipped: entry.itemsSkipped,
      errorMessage: entry.errorMessage ?? null,
      errorDetails: entry.errorDetails ?? null,
      startedAt: entry.startedAt,
      finishedAt: entry.finishedAt ?? new Date(),
    });
  } catch (error) {
    // Log write failure should never crash the pipeline.
    // The error is swallowed — observability is best-effort.
    console.error("[ingestion-log] Failed to write log entry:", error);
  }
}
