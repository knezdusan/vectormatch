// D7: Funding Signal Seeder (TDD §2.7)
// src/lib/jobs/seeders/daily-sources/funding-signal.ts
//
// Retries companies that previously failed Slugger resolution. Companies may
// configure an ATS later — especially post-funding — so the slugger_retry
// queue is swept daily and each due company is re-run through the Slugger
// with `insertCompany: true`.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Query slugger_retry for rows where nextRetryAt <= now()
// 2. For each row, re-run resolveSlugger with insertCompany: true
//    - discoverySource is set to "hn_algolia" (reusing the existing enum —
//      the original discovery source is preserved in the retry queue row)
//    - discoveryContext is reused from the retry queue entry
// 3. On success: the company is inserted by the Slugger; remove the row from
//    the retry queue.
// 4. On failure: increment retryCount and update nextRetryAt using the
//    30/60/90-day backoff schedule.
//
// See TDD §2.7 (D7) for the full specification.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { sluggerRetry } from "@/db/schemas/jobs/sluggerRetry";
import type { SluggerInput, SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FundingSignalResult {
  /** Total companies retried in this run. */
  totalRetried: number;
  /** Companies that resolved successfully and were inserted. */
  resolved: number;
  /** Companies that failed again and were re-queued. */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

interface RetryQueueRow {
  companyName: string;
  website: string | null;
  discoveryContext: string | null;
  retryCount: number;
}

// ── Pure function: compute next retry timestamp ───────────────────────────────

/**
 * Compute the next retry timestamp based on the retry count using a
 * 30/60/90-day backoff schedule.
 *
 *   retryCount 0 → +30 days
 *   retryCount 1 → +60 days
 *   retryCount 2+ → +90 days
 *
 * @param retryCount  The current retry count (before incrementing)
 * @returns           The next retry timestamp
 */
export function computeNextRetryAt(retryCount: number): Date {
  const days = retryCount === 0 ? 30 : retryCount === 1 ? 60 : 90;
  const next = new Date();
  next.setDate(next.getDate() + days);
  return next;
}

// ── DB query: get due retry companies ─────────────────────────────────────────

/**
 * Query the slugger_retry table for companies due for retry (nextRetryAt <= now).
 *
 * @returns Array of retry queue rows
 */
export async function getDueRetryCompanies(): Promise<RetryQueueRow[]> {
  const rows = await db
    .select({
      companyName: sluggerRetry.companyName,
      website: sluggerRetry.website,
      discoveryContext: sluggerRetry.discoveryContext,
      retryCount: sluggerRetry.retryCount,
    })
    .from(sluggerRetry)
    .where(sql`${sluggerRetry.nextRetryAt} <= now()`);

  return rows;
}

// ── Main seeder function ──────────────────────────────────────────────────────

/**
 * Run the Funding Signal seeder. Sweeps the slugger_retry queue for companies
 * due for retry, re-runs the Slugger on each, and either removes the row
 * (success) or increments the retry count with a new backoff (failure).
 *
 * @param fetchFn  Injectable fetch function (defaults to global fetch)
 * @returns        Result with resolved/unresolved counts
 */
export async function runFundingSignalSeeder(
  fetchFn: FetchFn = fetch,
): Promise<FundingSignalResult> {
  // 1. Query due retry companies
  let dueCompanies: RetryQueueRow[];
  try {
    dueCompanies = await getDueRetryCompanies();
  } catch (err) {
    return {
      totalRetried: 0,
      resolved: 0,
      unresolved: 0,
      error: `Failed to query retry queue: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  let resolved = 0;
  let unresolved = 0;

  // 2. Re-run the Slugger for each due company
  for (const row of dueCompanies) {
    const input: SluggerInput = {
      companyName: row.companyName,
      website: row.website ?? undefined,
      // Reuse the existing "hn_algolia" enum value — the original discovery
      // source is preserved in the retry queue row for auditability.
      discoverySource: "hn_algolia",
      discoveryContext: row.discoveryContext ?? undefined,
    };

    let result: SluggerResult;
    try {
      result = await resolveSlugger(input, {
        fetchFn,
        insertCompany: true,
        // We manage the retry queue ourselves — don't let the Slugger add a
        // duplicate row.
        addToRetryOnFailure: false,
      });
    } catch {
      // Slugger threw unexpectedly — treat as unresolved and re-queue
      unresolved++;
      await requeueCompany(row);
      continue;
    }

    if (result.success) {
      // 3. Success — company was inserted; remove from retry queue
      resolved++;
      try {
        await db
          .delete(sluggerRetry)
          .where(eq(sluggerRetry.companyName, row.companyName));
      } catch {
        // Best-effort removal — don't fail the seeder if the delete errors
      }
    } else {
      // 4. Failure — increment retry count and update nextRetryAt
      unresolved++;
      await requeueCompany(row);
    }
  }

  return {
    totalRetried: dueCompanies.length,
    resolved,
    unresolved,
  };
}

/**
 * Increment the retry count and update nextRetryAt for a retry queue row.
 */
async function requeueCompany(row: RetryQueueRow): Promise<void> {
  const newRetryCount = row.retryCount + 1;
  try {
    await db
      .update(sluggerRetry)
      .set({
        retryCount: newRetryCount,
        nextRetryAt: computeNextRetryAt(newRetryCount),
      })
      .where(eq(sluggerRetry.companyName, row.companyName));
  } catch {
    // Best-effort re-queue — don't fail the seeder if the update errors
  }
}
