// Source Function Helpers — Shared boilerplate for daily and batch sources
// src/inngest/source-helpers.ts
//
// Every daily/batch source Inngest function repeats the same three patterns:
//   1. Circuit-breaker check via isSourceEnabled
//   2. (Batch only) Storage safety check via isStorageSafeForRefresh
//   3. try/execute → record-success + write-log / catch → record-failure
//
// runSourceFunction collapses all three into a single call, keeping each
// Inngest function body to the minimum: config + the seeder call.
//
// Inngest step IDs ("check-health", "check-storage", "record-success",
// "record-failure", "write-log") are kept identical to their inline
// counterparts so that existing run histories are not broken.

import type { GetStepTools } from "inngest";
import type { IngestionLogEntry } from "@/lib/jobs/poller/ingestion-log";
import type { inngest } from "./client";

// ── Types ─────────────────────────────────────────────────────────────────────

/** The Inngest step context passed to every function handler. */
type StepContext = GetStepTools<typeof inngest>;

/** Fields the caller supplies to build the ingestion log row. */
interface LogFields {
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated?: number;
  itemsRejected: number;
  itemsSkipped: number;
}

interface RunSourceFunctionOptions<TResult> {
  /** Inngest step context from the function handler. */
  step: StepContext;
  /**
   * Circuit-breaker key — must match the Inngest function `id`.
   * E.g. "daily-source-brave-search".
   */
  sourceName: string;
  /**
   * Value written to ingestionLog.source.
   * E.g. "brave_search", "yc_directory".
   */
  logSource: string;
  /**
   * Set to true for batch sources that must also pass the storage-safety check.
   * Daily sources omit the storage check and should leave this false (default).
   */
  checkStorage?: boolean;
  /**
   * The actual seeder work, wrapped in a single step.run() call.
   * The string is the step ID shown in the Inngest dashboard.
   */
  execute: () => Promise<TResult>;
  /**
   * Maps the result of execute() to the four counter fields of the
   * ingestion log row.  Called only when execute() resolves successfully.
   */
  buildLogEntry: (result: TResult) => LogFields;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Shared execution wrapper for daily and batch source Inngest functions.
 *
 * Returns the seeder result unchanged on success, or one of the well-known
 * skip objects when a guard check fires.
 */
export async function runSourceFunction<
  TResult extends { error?: string | null },
>({
  step,
  sourceName,
  logSource,
  checkStorage = false,
  execute,
  buildLogEntry,
}: RunSourceFunctionOptions<TResult>): Promise<
  | TResult
  | { skipped: true; reason: "circuit-breaker-open" }
  | {
      skipped: true;
      reason: "storage-near-limit";
      safe: boolean;
      percentage: number;
      currentMb: number;
      limitMb: number;
    }
> {
  // ── 1. Circuit-breaker check ─────────────────────────────────────────────
  const enabled = await step.run("check-health", async () => {
    const { isSourceEnabled } = await import("@/lib/jobs/source-health");
    return isSourceEnabled(sourceName);
  });
  if (!enabled) {
    return { skipped: true, reason: "circuit-breaker-open" } as const;
  }

  // ── 2. Storage safety check (batch sources only) ─────────────────────────
  if (checkStorage) {
    const storage = await step.run("check-storage", async () => {
      const { isStorageSafeForRefresh } = await import(
        "@/lib/jobs/storage-check"
      );
      return isStorageSafeForRefresh();
    });
    if (!storage.safe) {
      console.warn(
        `Storage at ${(storage.percentage * 100).toFixed(1)}% (${storage.currentMb}MB / ${storage.limitMb}MB) — skipping batch refresh`,
      );
      return {
        skipped: true,
        reason: "storage-near-limit",
        ...storage,
      } as const;
    }
  }

  // ── 3. Execute → success path ────────────────────────────────────────────
  const { writeIngestionLog } = await import("@/lib/jobs/poller/ingestion-log");
  const startedAt = new Date();

  try {
    const result = await execute();

    await step.run("record-success", async () => {
      const { recordSourceSuccess } = await import("@/lib/jobs/source-health");
      return recordSourceSuccess(sourceName);
    });

    const fields = buildLogEntry(result);
    await step.run("write-log", async () => {
      const entry: IngestionLogEntry = {
        type: "seed",
        status: result.error ? "failed" : "success",
        source: logSource,
        itemsProcessed: fields.itemsProcessed,
        itemsInserted: fields.itemsInserted,
        itemsUpdated: fields.itemsUpdated ?? 0,
        itemsRejected: fields.itemsRejected,
        itemsSkipped: fields.itemsSkipped,
        errorMessage: result.error ?? undefined,
        startedAt,
        finishedAt: new Date(),
      };
      return writeIngestionLog(entry);
    });

    return result;
  } catch (error) {
    // ── 4. Execute → failure path ──────────────────────────────────────────
    await step.run("record-failure", async () => {
      const { recordSourceFailure } = await import("@/lib/jobs/source-health");
      return recordSourceFailure(sourceName, String(error));
    });
    throw error;
  }
}
