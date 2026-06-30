// Slugger Retry Queue Processor — Sprint 3 Task 6
// src/lib/jobs/seeders/slugger-retry-processor.ts
//
// Pure functions for the `sluggerRetryProcessor` Inngest function (cron
// `0 0 * * 1` — weekly, Monday 00:00 UTC). Re-runs the Slugger for companies
// that failed initial resolution and were added to the `slugger_retry` queue.
//
// Retry policy (CORPUS_EXPANSION_HANDOFF.md Task 6):
//   - Select entries where next_retry_at < NOW() AND retry_count < 3 (LIMIT 100)
//   - For each, call resolveSlugger({ companyName, website, discoverySource,
//     insertCompany: true })
//   - Success → delete the slugger_retry row (company is now in the corpus)
//   - Failure → increment retry_count, set next_retry_at = NOW() + 7d * 2^retry
//     (exponential backoff: 7d, 14d, 28d). If retry_count >= 3, leave in table
//     for manual review (G8 cleanup deletes it after 30 days).
//
// All functions are individually testable by mocking `@/db/db` and the Slugger.

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import type { SluggerRetry } from "@/db/schemas/jobs/sluggerRetry";
import { sluggerRetry } from "@/db/schemas/jobs/sluggerRetry";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryProcessorResult {
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}

// ── Pure query functions ─────────────────────────────────────────────────────

/**
 * Select retryable entries: rows where `next_retry_at < NOW()` and
 * `retry_count < 3`, ordered by `next_retry_at` ascending, limited to 100 per
 * run (to stay within Inngest step time limits).
 */
export async function selectRetryableEntries(): Promise<SluggerRetry[]> {
  const rows = await db
    .select()
    .from(sluggerRetry)
    .where(
      sql`${sluggerRetry.nextRetryAt} < NOW() AND ${sluggerRetry.retryCount} < 3`,
    )
    .orderBy(sql`${sluggerRetry.nextRetryAt} ASC`)
    .limit(100);
  return rows as SluggerRetry[];
}

/**
 * Delete a slugger_retry row after successful resolution. The company is now
 * in the corpus — the retry entry is no longer needed.
 */
export async function deleteRetryEntry(id: string): Promise<void> {
  await db.execute(sql`DELETE FROM slugger_retry WHERE id = ${id}`);
}

/**
 * Increment the retry count and schedule the next retry with exponential
 * backoff: `next_retry_at = NOW() + INTERVAL '7 days' * POWER(2, retry_count)`.
 *
 * At retry_count = 0 → next retry in 7 days
 * At retry_count = 1 → next retry in 14 days
 * At retry_count = 2 → next retry in 28 days
 *
 * If retry_count reaches 3 after this increment, the row stays in the table
 * for manual review — the G8 aggressive cleanup (Task 1) deletes it after
 * 30 days past `next_retry_at`.
 */
export async function incrementRetryCount(id: string): Promise<void> {
  await db.execute(
    sql`UPDATE slugger_retry SET
  retry_count = retry_count + 1,
  next_retry_at = NOW() + INTERVAL '7 days' * POWER(2, retry_count)
WHERE id = ${id}`,
  );
}

// ── Main processor ───────────────────────────────────────────────────────────

/**
 * Process the slugger retry queue. For each retryable entry, re-run the
 * Slugger. On success, delete the entry. On failure, increment the retry
 * count with exponential backoff.
 *
 * The Slugger is imported dynamically to avoid a circular dependency
 * (slugger.ts → company-repository → schemas, this module → slugger.ts).
 *
 * @returns Summary counts for ingestion logging.
 */
export async function processRetryQueue(): Promise<RetryProcessorResult> {
  const entries = await selectRetryableEntries();
  const errors: string[] = [];
  let succeeded = 0;
  let failed = 0;

  const { resolveSlugger } = await import("@/lib/jobs/seeders/slugger");

  for (const entry of entries) {
    try {
      const result = await resolveSlugger(
        {
          companyName: entry.companyName,
          website: entry.website ?? undefined,
          discoverySource: entry.discoverySource,
          discoveryContext: entry.discoveryContext ?? undefined,
        },
        { insertCompany: true, addToRetryOnFailure: false },
      );

      if (result.success) {
        await deleteRetryEntry(entry.id);
        succeeded++;
      } else {
        await incrementRetryCount(entry.id);
        failed++;
      }
    } catch (error) {
      errors.push(
        `${entry.companyName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't let one failure stop the whole batch — continue to the next entry
      failed++;
    }
  }

  return {
    processed: entries.length,
    succeeded,
    failed,
    errors,
  };
}
