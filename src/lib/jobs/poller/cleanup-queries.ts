// Aggressive Job Cleanup + Retention Policies — G8 (CORPUS_EXPANSION_TDD §1.8)
// src/lib/jobs/poller/cleanup-queries.ts
//
// Pure DB query functions for the `aggressiveCleanup` Inngest function (cron
// `0 2 * * *` — daily at 02:00 UTC, before `staleCleanup` at 03:00).
//
// Each function executes a single DELETE against a terminal-state slice of a
// high-growth table, returning `{ deletedCount: number }` for ingestion-log
// metrics. The `job` table has `ON DELETE CASCADE` from `match_queue`, so
// deleting jobs automatically reclaims their match_queue rows.
//
// Retention policy (per CORPUS_EXPANSION_HANDOFF.md Task 1):
//   - rejected jobs                → delete after 1 day
//   - gone jobs                    → delete after 7 days (since last_seen_at)
//   - normalization_failed jobs    → delete after 7 days (since normalized_at)
//   - approved/rejected matches    → delete after 90 days
//   - ingestion_log entries        → delete after 30 days
//   - exhausted slugger_retry rows → delete after 30 days (retry_count >= 3)
//
// All functions are individually testable by mocking `db.execute(sql\`...\`)`.
// No function mutates shared test state — they only issue DELETEs against the
// production schema, which tests mock at the `@/db/db` boundary.

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { STORAGE_LIMIT_MB } from "@/lib/jobs/storage-check";

export interface CleanupStepResult {
  deletedCount: number;
}

/**
 * Coerce a Drizzle `db.execute` result into a row count. Drizzle returns
 * `rowCount` for DELETE/UPDATE on the neon-serverless driver, but the field
 * may be `null` or `undefined` on some driver paths — default to 0 in that
 * case so the ingestion log always has a numeric metric.
 */
function toDeletedCount(result: unknown): number {
  if (result && typeof result === "object" && "rowCount" in result) {
    const rowCount = (result as { rowCount?: number | null }).rowCount;
    return typeof rowCount === "number" ? rowCount : 0;
  }
  return 0;
}

// ── Step 1a — Rejected jobs (terminal, no retry value) ───────────────────────

/**
 * Delete `job` rows in `rejected` status older than 1 day. Rejected jobs are
 * tombstoned by Gate 3 — they have no retry value and only consume storage.
 */
export async function deleteRejectedJobs(): Promise<CleanupStepResult> {
  const result = await db.execute(
    sql`DELETE FROM job WHERE status = 'rejected' AND normalized_at < NOW() - INTERVAL '1 day'`,
  );
  return { deletedCount: toDeletedCount(result) };
}

// ── Step 1b — Gone jobs (company left the ATS) ───────────────────────────────

/**
 * Delete `job` rows in `gone` status older than 7 days (since `last_seen_at`).
 * A `gone` job means the company removed it from the ATS — it is permanently
 * dead and will never return to `active`.
 */
export async function deleteGoneJobs(): Promise<CleanupStepResult> {
  const result = await db.execute(
    sql`DELETE FROM job WHERE status = 'gone' AND last_seen_at < NOW() - INTERVAL '7 days'`,
  );
  return { deletedCount: toDeletedCount(result) };
}

// ── Step 1c — Normalization-failed jobs (retried for 7 days, give up) ────────

/**
 * Delete `job` rows in `normalization_failed` status older than 7 days (since
 * `detected_at`).
 *
 * BUGFIX (Sprint 8): The original implementation used `normalized_at`, but per
 * the schema contract (job.ts lines 67–70, job-normalizer.ts line 48),
 * `normalized_at` is NEVER set on `normalization_failed` jobs — setting it
 * would turn them into permanent tombstones identical to `rejected`,
 * defeating the two-status split. As a result, the daily cleanup never
 * matched any rows and `normalization_failed` jobs accumulated indefinitely.
 *
 * `detected_at` is set on insertion and never changes, making it a reliable
 * age proxy for the retry-window cutoff.
 */
export async function deleteNormalizationFailedJobs(): Promise<CleanupStepResult> {
  const result = await db.execute(
    sql`DELETE FROM job WHERE status = 'normalization_failed' AND detected_at < NOW() - INTERVAL '7 days'`,
  );
  return { deletedCount: toDeletedCount(result) };
}

// ── Step 2 — Old terminal-state match_queue rows ─────────────────────────────

/**
 * Delete `match_queue` rows in `approved` or `rejected` status older than 90
 * days. These matches are no longer actionable — the user has already seen and
 * acted on them (or let them lapse). Pending/stale/error matches are preserved
 * because they may still be re-evaluated by Gate 3 or the stale verifier.
 */
export async function deleteOldTerminalMatches(): Promise<CleanupStepResult> {
  const result = await db.execute(
    sql`DELETE FROM match_queue WHERE status IN ('approved', 'rejected') AND created_at < NOW() - INTERVAL '90 days'`,
  );
  return { deletedCount: toDeletedCount(result) };
}

// ── Step 3 — Old ingestion_log entries ───────────────────────────────────────

/**
 * Delete `ingestion_log` entries older than 30 days. The ingestion log is an
 * observability surface — 30 days is enough to diagnose a regression without
 * unbounded growth (the table is high-write: every seeder + poller run appends
 * a row).
 */
export async function deleteOldIngestionLogs(): Promise<CleanupStepResult> {
  const result = await db.execute(
    sql`DELETE FROM ingestion_log WHERE created_at < NOW() - INTERVAL '30 days'`,
  );
  return { deletedCount: toDeletedCount(result) };
}

// ── Step 4 — Exhausted slugger_retry entries ─────────────────────────────────

/**
 * Delete `slugger_retry` rows that have been retried 3+ times AND are past
 * their retry date by 30 days. These have exhausted the exponential-backoff
 * schedule (7d → 14d → 28d) and are no longer actionable — they're kept for
 * 30 days past `next_retry_at` for manual review, then reclaimed.
 */
export async function deleteExhaustedSluggerRetries(): Promise<CleanupStepResult> {
  const result = await db.execute(
    sql`DELETE FROM slugger_retry WHERE next_retry_at < NOW() - INTERVAL '30 days' AND retry_count >= 3`,
  );
  return { deletedCount: toDeletedCount(result) };
}

// ── Weekly VACUUM ANALYZE ────────────────────────────────────────────────────

/**
 * Run `VACUUM ANALYZE` to reclaim space from dead tuples left by the daily
 * DELETEs above. Unlike `VACUUM FULL`, this does not require an exclusive
 * lock and will not block queries — it's safe to run during normal traffic.
 *
 * Only schedule `VACUUM FULL` (exclusive lock) if storage exceeds 480MB and
 * during a maintenance window — not handled here.
 *
 * Returns `{ deletedCount: 0 }` to keep the result shape uniform; VACUUM does
 * not report a row count.
 */
export async function vacuumAnalyze(): Promise<CleanupStepResult> {
  await db.execute(sql`VACUUM ANALYZE`);
  return { deletedCount: 0 };
}

// ── Emergency Storage Purge (Sprint 8) ───────────────────────────────────────
//
// Tiered purge strategy for when the database hits the 88% ingestion halt
// threshold. Each tier deletes jobs with ZERO matching impact before touching
// the active corpus. The caller (emergencyStoragePurge Inngest function) runs
// tiers in order and stops when storage drops below the recovery threshold.
//
// Tier priority (safest first):
//   1. normalization_failed — no embedding, no matching value, fat raw_json
//   2. rejected             — garbage tombstones, terminal, never resurrected
//   3. gone                 — permanently dead, never matched
//   4. stale                — not currently matched, resurrected if re-posted
//   5. active (FIFO)        — LAST RESORT. Oldest detected_at first.
//                             Excludes jobs with approved matches.
//                             Smaller batch size to limit WAL spikes.
//
// All tiers delete in batches with a LIMIT clause to avoid massive WAL spikes
// on Neon. The caller runs VACUUM ANALYZE between tiers.
//
// WAL INFLATION PROTECTION (added July 2026):
// Neon's synthetic_storage_size includes WAL retained for history. Large DELETE
// batches generate WAL that can push synthetic storage ABOVE the hard limit even
// though pg_database_size drops. The purge now:
//   1. Uses STORAGE_LIMIT_MB (460, safety-margined) instead of 512 for recovery
//      checks — this accounts for the ~12% gap between pg_database_size and
//      Neon's synthetic storage.
//   2. Tracks storage before/after each batch. If storage INCREASES after a
//      batch (WAL inflation exceeding the dead-tuple reclaim), the purge stops
//      immediately — continuing would make the situation worse.
//   3. Uses a smaller batch size (500) for the active_fifo tier to limit
//      per-batch WAL generation on the last-resort tier.

/** Maximum rows to delete in a single batch (Neon WAL spike protection). */
export const PURGE_BATCH_SIZE = 1000;

/** Smaller batch size for the active_fifo tier (last resort — limits WAL). */
export const PURGE_ACTIVE_FIFO_BATCH_SIZE = 500;

/**
 * Storage fraction at which the emergency purge stops.
 * 75% of STORAGE_LIMIT_MB (460) = 345 MB. This is conservative because
 * pg_database_size underestimates Neon's synthetic storage by ~12%.
 */
export const PURGE_RECOVERY_THRESHOLD = 0.75;

/**
 * Maximum number of consecutive batches where storage increased (WAL inflation)
 * before the purge aborts. This prevents a death spiral where each DELETE batch
 * generates more WAL than it reclaims, pushing synthetic storage higher.
 */
export const PURGE_MAX_WAL_INFLATION_BATCHES = 2;

export interface PurgeTierResult {
  /** Tier label for logging. */
  tier: string;
  /** Total rows deleted across all batches in this tier. */
  deletedCount: number;
  /** Whether this tier had any rows to delete. */
  hadRows: boolean;
}

export interface EmergencyPurgeResult {
  /** All tier results in execution order. */
  tiers: PurgeTierResult[];
  /** Total rows deleted across all tiers. */
  totalDeleted: number;
  /** Storage size (MB) before the purge. */
  storageBeforeMb: number;
  /** Storage size (MB) after the purge + VACUUM. */
  storageAfterMb: number;
  /** Whether storage dropped below the recovery threshold. */
  recovered: boolean;
  /** Reason the purge stopped. */
  stopReason: string;
  /** Whether the purge aborted due to WAL inflation (storage increasing). */
  walInflationDetected: boolean;
}

// ── Tier 1: normalization_failed (any age) ───────────────────────────────────

/**
 * Delete up to `limit` `normalization_failed` jobs regardless of age. These
 * jobs carry fat `raw_json` (~25KB each), have no embedding, and have zero
 * matching value. The retry sweep has had its chance; in a storage emergency
 * we sacrifice the retry queue.
 */
export async function purgeNormalizationFailed(
  limit: number = PURGE_BATCH_SIZE,
): Promise<PurgeTierResult> {
  const result = await db.execute(sql`
    DELETE FROM job
    WHERE id IN (
      SELECT id FROM job
      WHERE status = 'normalization_failed'
      ORDER BY detected_at ASC
      LIMIT ${limit}
    )
  `);
  const deleted = toDeletedCount(result);
  return {
    tier: "normalization_failed",
    deletedCount: deleted,
    hadRows: deleted > 0,
  };
}

// ── Tier 2: rejected (any age) ───────────────────────────────────────────────

/**
 * Delete up to `limit` `rejected` jobs regardless of age. These are Gate 0/0.5/3
 * tombstones — garbage jobs that will never be matched or resurrected. The
 * daily cleanup only deletes ones older than 1 day; this catches the rest.
 */
export async function purgeRejected(
  limit: number = PURGE_BATCH_SIZE,
): Promise<PurgeTierResult> {
  const result = await db.execute(sql`
    DELETE FROM job
    WHERE id IN (
      SELECT id FROM job
      WHERE status = 'rejected'
      ORDER BY normalized_at ASC NULLS LAST
      LIMIT ${limit}
    )
  `);
  const deleted = toDeletedCount(result);
  return {
    tier: "rejected",
    deletedCount: deleted,
    hadRows: deleted > 0,
  };
}

// ── Tier 3: gone (any age) ───────────────────────────────────────────────────

/**
 * Delete up to `limit` `gone` jobs regardless of age. These are jobs not seen
 * in 30+ days — permanently dead. They will be re-inserted if a company
 * re-posts the same job (the upsert resurrects `gone` → `active`).
 */
export async function purgeGone(
  limit: number = PURGE_BATCH_SIZE,
): Promise<PurgeTierResult> {
  const result = await db.execute(sql`
    DELETE FROM job
    WHERE id IN (
      SELECT id FROM job
      WHERE status = 'gone'
      ORDER BY last_seen_at ASC
      LIMIT ${limit}
    )
  `);
  const deleted = toDeletedCount(result);
  return {
    tier: "gone",
    deletedCount: deleted,
    hadRows: deleted > 0,
  };
}

// ── Tier 4: stale (any age) ──────────────────────────────────────────────────

/**
 * Delete up to `limit` `stale` jobs regardless of age. These are jobs not seen
 * in 7–30 days. They are not currently matched but can be resurrected to
 * `active` if the company re-posts. In a storage emergency, sacrificing them
 * is acceptable — re-polling will recover any that come back.
 */
export async function purgeStale(
  limit: number = PURGE_BATCH_SIZE,
): Promise<PurgeTierResult> {
  const result = await db.execute(sql`
    DELETE FROM job
    WHERE id IN (
      SELECT id FROM job
      WHERE status = 'stale'
      ORDER BY last_seen_at ASC
      LIMIT ${limit}
    )
  `);
  const deleted = toDeletedCount(result);
  return {
    tier: "stale",
    deletedCount: deleted,
    hadRows: deleted > 0,
  };
}

// ── Tier 5: active FIFO (LAST RESORT) ────────────────────────────────────────

/**
 * Delete up to `limit` `active` jobs by FIFO (oldest `detected_at` first).
 *
 * This is the last-resort tier — it directly reduces matching recall. Safeguards:
 *   - Excludes jobs that have produced `approved` matches (users may still be
 *     in the application process).
 *   - Orders by `detected_at` ASC so the oldest jobs (longest time in the
 *     matching pool, most chances to match) are sacrificed first.
 *   - Uses a smaller default batch size (PURGE_ACTIVE_FIFO_BATCH_SIZE = 500)
 *     to limit per-batch WAL generation on this destructive tier.
 */
export async function purgeActiveFifo(
  limit: number = PURGE_ACTIVE_FIFO_BATCH_SIZE,
): Promise<PurgeTierResult> {
  const result = await db.execute(sql`
    DELETE FROM job
    WHERE id IN (
      SELECT j.id FROM job j
      WHERE j.status = 'active'
        AND j.id NOT IN (
          SELECT mq.job_id FROM match_queue mq WHERE mq.status = 'approved'
        )
      ORDER BY j.detected_at ASC
      LIMIT ${limit}
    )
  `);
  const deleted = toDeletedCount(result);
  return {
    tier: "active_fifo",
    deletedCount: deleted,
    hadRows: deleted > 0,
  };
}

// ── Orchestrator: run tiers until storage recovers ───────────────────────────

/**
 * Run the tiered emergency purge until storage drops below the recovery
 * threshold or all tiers are exhausted.
 *
 * For each tier, deletes in batches until the tier is empty or storage recovers.
 * Runs `VACUUM ANALYZE` after each tier to reclaim dead tuples so the storage
 * check reflects reality.
 *
 * WAL INFLATION PROTECTION:
 * Neon's synthetic_storage_size includes WAL. Large DELETE batches can generate
 * more WAL than the dead tuples they reclaim, causing pg_database_size to drop
 * while synthetic storage increases. The purge tracks storage before/after each
 * batch. If storage increases for `PURGE_MAX_WAL_INFLATION_BATCHES` consecutive
 * batches, the purge aborts immediately — continuing would make things worse.
 *
 * @param storageCheckMb  Function that returns the current DB size in MB.
 *                        Injected to avoid a circular import with storage-check.ts.
 * @returns               Full purge result with per-tier counts and storage delta.
 */
export async function runEmergencyPurge(
  storageCheckMb: () => Promise<number>,
): Promise<EmergencyPurgeResult> {
  const storageBeforeMb = await storageCheckMb();
  const tiers: PurgeTierResult[] = [];
  let totalDeleted = 0;
  let stopReason = "all tiers exhausted";
  let recovered = false;
  let walInflationDetected = false;
  let consecutiveInflationCount = 0;
  let lastCheckedMb = storageBeforeMb;

  // Tier functions in priority order.
  const tierFns: Array<{
    name: string;
    fn: (limit: number) => Promise<PurgeTierResult>;
    batchSize: number;
  }> = [
    {
      name: "normalization_failed",
      fn: purgeNormalizationFailed,
      batchSize: PURGE_BATCH_SIZE,
    },
    { name: "rejected", fn: purgeRejected, batchSize: PURGE_BATCH_SIZE },
    { name: "gone", fn: purgeGone, batchSize: PURGE_BATCH_SIZE },
    { name: "stale", fn: purgeStale, batchSize: PURGE_BATCH_SIZE },
    {
      name: "active_fifo",
      fn: purgeActiveFifo,
      batchSize: PURGE_ACTIVE_FIFO_BATCH_SIZE,
    },
  ];

  for (const { name, fn, batchSize } of tierFns) {
    let tierDeleted = 0;
    let tierHadRows = false;

    // Delete in batches until the tier is empty or storage recovers.
    for (;;) {
      const currentMb = await storageCheckMb();
      const currentPct = currentMb / STORAGE_LIMIT_MB;
      if (currentPct <= PURGE_RECOVERY_THRESHOLD) {
        recovered = true;
        stopReason = `storage recovered to ${(currentPct * 100).toFixed(1)}% after ${name} tier`;
        break;
      }

      // WAL inflation check: if storage increased since the last check,
      // the DELETE is generating more WAL than it's reclaiming. Abort
      // before the death spiral gets worse.
      if (currentMb > lastCheckedMb) {
        consecutiveInflationCount++;
        if (consecutiveInflationCount >= PURGE_MAX_WAL_INFLATION_BATCHES) {
          walInflationDetected = true;
          stopReason = `WAL inflation detected: storage increased ${consecutiveInflationCount} consecutive checks (${lastCheckedMb.toFixed(0)}MB → ${currentMb.toFixed(0)}MB). Purge aborted to prevent synthetic storage spike.`;
          break;
        }
      } else {
        consecutiveInflationCount = 0;
      }
      lastCheckedMb = currentMb;

      const batch = await fn(batchSize);
      tierDeleted += batch.deletedCount;
      tierHadRows = tierHadRows || batch.hadRows;

      if (!batch.hadRows) {
        break; // Tier exhausted, move to next tier
      }
    }

    tiers.push({
      tier: name,
      deletedCount: tierDeleted,
      hadRows: tierHadRows,
    });
    totalDeleted += tierDeleted;

    // VACUUM after each tier that deleted rows, so the next storage check
    // reflects the reclaimed space.
    if (tierDeleted > 0) {
      await db.execute(sql`VACUUM ANALYZE job`);
    }

    if (recovered || walInflationDetected) {
      break;
    }
  }

  const storageAfterMb = await storageCheckMb();

  return {
    tiers,
    totalDeleted,
    storageBeforeMb,
    storageAfterMb,
    recovered,
    stopReason,
    walInflationDetected,
  };
}
