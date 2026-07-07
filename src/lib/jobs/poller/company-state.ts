// Company State Updater — Polling State + Health Tracking
// src/lib/jobs/poller/company-state.ts
//
// Updates the `company` table after each poll. The poller owns runtime state
// (lastPolledAt, health, consecutiveFailures, lastJobPostedAt, activeJobCount).

// Seeders only discover; this module manages the poller's view of company health.
//
// See TDD §4.0 (company table) and §4.4 (Phalanx Poller).

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { job } from "@/db/schemas/jobs/job";

// ── Types ────────────────────────────────────────────────────────────────────

export type CompanyHealth =
  | "healthy"
  | "degraded"
  | "rate_limited"
  | "blocked"
  | "error"
  | "dead";

export interface CompanyStateUpdate {
  health: CompanyHealth;
  lastErrorMessage?: string;
  /** Whether this poll succeeded (resets consecutiveFailures) or failed (increments). */
  success: boolean;
  /** When the most recent job was posted (if any jobs were found). */
  lastJobPostedAt?: Date;
  /** Active job count (from countActiveJobs). */
  activeJobCount?: number;
}

// ── Update ───────────────────────────────────────────────────────────────────

/**
 * Update a company's polling state after a poll attempt.
 *
 * On success:
 *   - health = "healthy" (or "degraded" if Zod validation failed)
 *   - consecutiveFailures = 0
 *   - lastPolledAt = now()
 *   - lastJobPostedAt = now() (if jobs were found)
 *   - activeJobCount = updated
 *
 * On failure:
 *   - health = appropriate error state ("rate_limited", "blocked", "error")
 *   - consecutiveFailures += 1
 *   - If consecutiveFailures >= 3, health = "dead" and pollingEnabled = false
 *   - lastPolledAt = now()
 *
 * @param companyId  The company UUID
 * @param update     The state update to apply
 */
export async function updateCompanyState(
  companyId: string,
  update: CompanyStateUpdate,
): Promise<void> {
  const now = new Date();

  if (update.success) {
    // Successful poll — reset failure counter, update health.
    await db
      .update(company)
      .set({
        lastPolledAt: now,
        health: update.health,
        consecutiveFailures: 0,
        lastErrorMessage: null,
        lastJobPostedAt: update.lastJobPostedAt ?? now,
        activeJobCount: update.activeJobCount ?? 0,
      })
      .where(sql`${company.id} = ${companyId}`);
  } else {
    // Failed poll — increment failure counter, update health, and
    // conditionally disable polling + mark as dead — all in a single
    // UPDATE to avoid partial state if the process crashes between queries.
    await db
      .update(company)
      .set({
        lastPolledAt: now,
        health: sql`CASE WHEN ${company.consecutiveFailures} + 1 >= 3 THEN 'dead' ELSE ${update.health} END`,
        lastErrorMessage: update.lastErrorMessage ?? null,
        consecutiveFailures: sql`${company.consecutiveFailures} + 1`,
        pollingEnabled: sql`CASE WHEN ${company.consecutiveFailures} + 1 >= 3 THEN false ELSE ${company.pollingEnabled} END`,
      })
      .where(sql`${company.id} = ${companyId}`);
  }
}

// ── Health mapping ───────────────────────────────────────────────────────────

/**
 * Map an HTTP status code or error kind to a company health state.
 * Used by the poller to set the appropriate health after a failed fetch.
 */
export function healthFromHttpError(statusCode: number): CompanyHealth {
  if (statusCode === 429) return "rate_limited";
  if (statusCode === 403) return "blocked";
  if (statusCode === 404) return "dead"; // Endpoint gone
  if (statusCode >= 500) return "error";
  return "error";
}

/**
 * Map a Zod validation failure to a company health state.
 */
export function healthFromValidationError(): CompanyHealth {
  return "degraded";
}

/**
 * Map a network error to a company health state.
 */
export function healthFromNetworkError(): CompanyHealth {
  return "error";
}

// ── Backfill ───────────────────────────────────────────────────────────────────

/**
 * Recompute and persist activeJobCount for every company. Use after bulk
 * purges or backfills where jobs were deleted outside the normal poll cycle.
 */
export async function backfillCompanyActiveJobCounts(): Promise<{
  updated: number;
}> {
  const rows = await db
    .select({
      companyId: job.companyId,
      count: sql<number>`count(*)::int`,
    })
    .from(job)
    .where(sql`${job.status} = 'active'`)
    .groupBy(job.companyId);

  const counts = new Map(rows.map((r) => [r.companyId, r.count]));

  const companies = await db.select({ id: company.id }).from(company);

  let updated = 0;
  for (const { id } of companies) {
    await db
      .update(company)
      .set({ activeJobCount: counts.get(id) ?? 0 })
      .where(sql`${company.id} = ${id}`);
    updated++;
  }

  return { updated };
}
