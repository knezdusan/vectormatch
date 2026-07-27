// D27: pg-boss-compatible source function helper
// src/scheduler/source-helpers.ts
//
// Replaces src/inngest/source-helpers.ts for the pg-boss scheduler.
// Same logic (circuit-breaker check → storage check → execute → record/log)
// but without Inngest's step.run() wrappers. pg-boss retries the entire
// job as a unit, so step-level checkpointing is not needed.

import type { IngestionLogEntry } from "@/lib/jobs/poller/ingestion-log";

interface LogFields {
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated?: number;
  itemsRejected: number;
  itemsSkipped: number;
}

interface RunSourceFunctionOptions<TResult> {
  sourceName: string;
  logSource: string;
  checkStorage?: boolean;
  execute: () => Promise<TResult>;
  buildLogEntry: (result: TResult) => LogFields;
}

/**
 * Shared execution wrapper for daily and batch source pg-boss functions.
 * Same semantics as the Inngest version but without step.run() wrappers.
 */
export async function runSourceFunction<
  TResult extends { error?: string | null },
>({
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
  const { isSourceEnabled } = await import("@/lib/jobs/source-health");
  const enabled = await isSourceEnabled(sourceName);
  if (!enabled) {
    return { skipped: true, reason: "circuit-breaker-open" } as const;
  }

  // ── 2. Storage safety check (batch sources only) ─────────────────────────
  if (checkStorage) {
    const { isStorageSafeForRefresh } = await import(
      "@/lib/jobs/storage-check"
    );
    const storage = await isStorageSafeForRefresh();
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
  const { recordSourceSuccess, recordSourceFailure } = await import(
    "@/lib/jobs/source-health"
  );
  const startedAt = new Date();

  try {
    const result = await execute();

    await recordSourceSuccess(sourceName);

    const fields = buildLogEntry(result);
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
    await writeIngestionLog(entry);

    return result;
  } catch (error) {
    // ── 4. Execute → failure path ──────────────────────────────────────────
    await recordSourceFailure(sourceName, String(error));
    throw error;
  }
}
