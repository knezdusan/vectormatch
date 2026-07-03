// Source Health Query Functions — Circuit Breakers (Sprint 3 Task 4)
// src/lib/jobs/source-health.ts
//
// Pure DB query functions for the per-source circuit breaker that wraps every
// batch + daily source Inngest function. Each source function checks
// `isSourceEnabled` before running; on success it calls `recordSourceSuccess`,
// on failure `recordSourceFailure`.
//
// Circuit breaker semantics:
//   - consecutiveFailures >= 3  → status = "degraded" (soft signal, still runs)
//   - consecutiveFailures >= 5  → hard open: isSourceEnabled returns false
//   - manual disableSource()    → status = "disabled", isSourceEnabled = false
//   - recordSourceSuccess()     → resets consecutiveFailures to 0, status to
//                                 "active" (unless manually disabled)
//
// All functions are individually testable by mocking `@/db/db`.

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import {
  DEGRADED_FAILURE_THRESHOLD,
  HARD_CIRCUIT_BREAKER_THRESHOLD,
  sourceHealth,
} from "@/db/schemas/jobs/sourceHealth";

// ── Types ────────────────────────────────────────────────────────────────────

type SourceHealthStatus = "active" | "degraded" | "disabled";

interface SourceHealthRow {
  sourceName: string;
  status: SourceHealthStatus;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  totalRuns: number;
  totalFailures: number;
  disabledAt: Date | null;
  disabledReason: string | null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the health row for a source. Returns `null` if the source has never been
 * tracked (first run). The caller should treat a missing row as "active" —
 * `isSourceEnabled` does this implicitly.
 */
async function getSourceHealth(
  sourceName: string,
): Promise<SourceHealthRow | null> {
  const rows = await db
    .select()
    .from(sourceHealth)
    .where(sql`${sourceHealth.sourceName} = ${sourceName}`);
  const row = rows[0];
  if (!row) return null;
  return row as SourceHealthRow;
}

/**
 * Circuit breaker check. Returns `true` if the source should run, `false` if it
 * should be skipped.
 *
 * A source is disabled (returns `false`) when:
 *   - status === "disabled" (manual or auto), OR
 *   - consecutiveFailures >= 5 (hard circuit breaker)
 *
 * A missing row (first run) or a `degraded` source returns `true` — degraded
 * sources still run, they're just flagged for review.
 */
export async function isSourceEnabled(sourceName: string): Promise<boolean> {
  const health = await getSourceHealth(sourceName);
  if (!health) return true; // first run — no history, allow
  if (health.status === "disabled") return false;
  if (health.consecutiveFailures >= HARD_CIRCUIT_BREAKER_THRESHOLD) {
    // Sprint 4 Task 8: Create a circuit breaker trip alert (deduplicated by
    // hasActiveAlert — only one alert per source until resolved)
    try {
      const { createCircuitBreakerAlert } = await import("@/lib/jobs/alerting");
      await createCircuitBreakerAlert(
        sourceName,
        health.consecutiveFailures,
        health.lastError ?? "unknown error",
      );
    } catch {
      // Non-fatal: alert creation failure should not block the circuit breaker
    }
    return false;
  }
  return true;
}

/**
 * Record a successful source run. Resets `consecutiveFailures` to 0, sets
 * `lastSuccessAt`, increments `totalRuns`, and flips `status` back to "active"
 * (unless the source was manually disabled — manual disable is sticky and only
 * `enableSource()` can clear it).
 *
 * Uses UPSERT (INSERT ... ON CONFLICT DO UPDATE) so the first run creates the
 * row. The previous UPDATE-only implementation silently affected 0 rows on
 * first run (no row existed yet), leaving `source_health` permanently empty.
 */
export async function recordSourceSuccess(sourceName: string): Promise<void> {
  await db
    .insert(sourceHealth)
    .values({
      sourceName,
      status: "active",
      consecutiveFailures: 0,
      lastSuccessAt: new Date(),
      totalRuns: 1,
    })
    .onConflictDoUpdate({
      target: sourceHealth.sourceName,
      set: {
        consecutiveFailures: 0,
        lastSuccessAt: new Date(),
        // Only flip back to "active" if not manually disabled. A manually
        // disabled source stays disabled even if a stray success sneaks in
        // (e.g. a manual event trigger while disabled).
        status: sql`CASE WHEN ${sourceHealth.status} = 'disabled' THEN 'disabled' ELSE 'active' END`,
        totalRuns: sql`${sourceHealth.totalRuns} + 1`,
      },
    });
}

/**
 * Record a failed source run. Increments `consecutiveFailures` and
 * `totalFailures`, sets `lastFailureAt` and `lastError`. Automatically flips
 * `status` to "degraded" when `consecutiveFailures >= 3`. The source is NOT
 * auto-disabled here — the hard circuit breaker (`consecutiveFailures >= 5`)
 * is enforced by `isSourceEnabled`, not by mutating status. This keeps the
 * "disabled" status reserved for manual kills, making it easy to see at a
 * glance which sources were manually vs. automatically stopped.
 *
 * Uses UPSERT (INSERT ... ON CONFLICT DO UPDATE) so the first run creates the
 * row. The previous UPDATE-only implementation silently affected 0 rows on
 * first run (no row existed yet), leaving `source_health` permanently empty.
 */
export async function recordSourceFailure(
  sourceName: string,
  error: string,
): Promise<void> {
  await db
    .insert(sourceHealth)
    .values({
      sourceName,
      status: "degraded",
      consecutiveFailures: 1,
      totalFailures: 1,
      totalRuns: 1,
      lastFailureAt: new Date(),
      lastError: error,
    })
    .onConflictDoUpdate({
      target: sourceHealth.sourceName,
      set: {
        consecutiveFailures: sql`${sourceHealth.consecutiveFailures} + 1`,
        totalFailures: sql`${sourceHealth.totalFailures} + 1`,
        totalRuns: sql`${sourceHealth.totalRuns} + 1`,
        lastFailureAt: new Date(),
        lastError: error,
        status: sql`CASE WHEN ${sourceHealth.consecutiveFailures} + 1 >= ${DEGRADED_FAILURE_THRESHOLD} THEN 'degraded' ELSE ${sourceHealth.status} END`,
      },
    });
}

/**
 * Manually disable a source. Sets `status = "disabled"`, records the reason
 * and timestamp. `isSourceEnabled` will return `false` for this source until
 * `enableSource()` is called.
 */
export async function disableSource(
  sourceName: string,
  reason: string,
): Promise<void> {
  await db
    .update(sourceHealth)
    .set({
      status: "disabled",
      disabledAt: new Date(),
      disabledReason: reason,
    })
    .where(sql`${sourceHealth.sourceName} = ${sourceName}`);
}

/**
 * Manually re-enable a previously disabled source. Resets
 * `consecutiveFailures` to 0 (gives the source a fresh start), clears the
 * disable metadata, and sets `status = "active"`.
 */
export async function enableSource(sourceName: string): Promise<void> {
  await db
    .update(sourceHealth)
    .set({
      status: "active",
      consecutiveFailures: 0,
      disabledAt: null,
      disabledReason: null,
    })
    .where(sql`${sourceHealth.sourceName} = ${sourceName}`);
}

// Re-export the thresholds for callers that want to surface them in dashboards.
export {
  DEGRADED_FAILURE_THRESHOLD,
  HARD_CIRCUIT_BREAKER_THRESHOLD,
} from "@/db/schemas/jobs/sourceHealth";
