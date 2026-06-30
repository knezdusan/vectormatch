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
 * `normalized_at`). The normalization-retry sweep has had 7 days to recover
 * them; if they're still failing, the source payload is unrecoverable.
 */
export async function deleteNormalizationFailedJobs(): Promise<CleanupStepResult> {
  const result = await db.execute(
    sql`DELETE FROM job WHERE status = 'normalization_failed' AND normalized_at < NOW() - INTERVAL '7 days'`,
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
