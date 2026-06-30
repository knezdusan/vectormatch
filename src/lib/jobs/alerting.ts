// Alerting System (Sprint 4 Task 8)
// src/lib/jobs/alerting.ts
//
// Functions to create, query, and resolve alerts in the `alerts` table.
// Called by:
//   - The storage check (when storage exceeds warning/critical thresholds)
//   - The schema validation monitor (when Zod validation failure rate spikes)
//   - The circuit breaker (when a source is auto-disabled)
//   - The admin dashboard (to display and resolve alerts)
//
// Server-only: touches the database.

import "server-only";

import { and, desc, eq, gte } from "drizzle-orm";

import { db } from "@/db/db";
import { type Alert, alerts } from "@/db/schemas/jobs/alerts";

// Re-export the Alert type for consumers (admin dashboard components)
export type { Alert };

import {
  getDatabaseSizeMb,
  STORAGE_CRITICAL_THRESHOLD,
  STORAGE_LIMIT_MB,
  STORAGE_WARNING_THRESHOLD,
} from "@/lib/jobs/storage-check";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CreateAlertInput {
  type: (typeof alerts.type.enumValues)[number];
  severity: (typeof alerts.severity.enumValues)[number];
  message: string;
  details?: string;
  sourceName?: string;
}

// ── Alert Creation ───────────────────────────────────────────────────────────

/**
 * Create a new alert. Does NOT deduplicate — the caller should check for
 * existing active alerts of the same type before calling this.
 */
export async function createAlert(input: CreateAlertInput): Promise<Alert> {
  const [row] = await db
    .insert(alerts)
    .values({
      type: input.type,
      severity: input.severity,
      message: input.message,
      details: input.details,
      sourceName: input.sourceName,
      status: "active",
    })
    .returning();
  return row;
}

/**
 * Check if an active alert of the given type already exists.
 * Used for deduplication — avoids creating duplicate alerts for the same
 * ongoing condition.
 */
export async function hasActiveAlert(
  type: string,
  sourceName?: string,
): Promise<boolean> {
  const conditions = [
    eq(alerts.type, type as never),
    eq(alerts.status, "active"),
  ];
  if (sourceName) {
    conditions.push(eq(alerts.sourceName, sourceName));
  }
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(and(...conditions))
    .limit(1);
  return rows.length > 0;
}

// ── Alert Resolution ─────────────────────────────────────────────────────────

/**
 * Resolve an alert by ID. Sets status to "resolved" and records who resolved it.
 */
export async function resolveAlert(
  alertId: string,
  resolvedBy = "auto",
): Promise<void> {
  await db
    .update(alerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy })
    .where(eq(alerts.id, alertId));
}

/**
 * Resolve all active alerts of a given type. Used when the underlying condition
 * clears (e.g., storage drops below the warning threshold).
 */
export async function resolveAlertsByType(
  type: string,
  resolvedBy = "auto",
): Promise<number> {
  const result = await db
    .update(alerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy })
    .where(and(eq(alerts.type, type as never), eq(alerts.status, "active")))
    .returning({ id: alerts.id });
  return result.length;
}

// ── Alert Queries ────────────────────────────────────────────────────────────

/**
 * Get all active alerts, ordered by severity (critical first) and creation time
 * (newest first).
 */
export async function getActiveAlerts(): Promise<Alert[]> {
  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.status, "active"))
    .orderBy(
      // critical first, then warning, then info
      sql`CASE ${alerts.severity}
            WHEN 'critical' THEN 0
            WHEN 'warning' THEN 1
            ELSE 2
          END`,
      desc(alerts.createdAt),
    );
  return rows;
}

/**
 * Get recent alerts (active + resolved) from the last N days.
 */
export async function getRecentAlerts(daysBack = 7): Promise<Alert[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const rows = await db
    .select()
    .from(alerts)
    .where(gte(alerts.createdAt, cutoff))
    .orderBy(desc(alerts.createdAt));
  return rows;
}

// ── Storage Alert Check ──────────────────────────────────────────────────────

/**
 * Check storage and create/resolve alerts as needed.
 * Called by the daily health check Inngest function.
 *
 * - If storage > critical threshold → create "storage_critical" alert
 * - If storage > warning threshold → create "storage_near_limit" alert
 * - If storage < warning threshold → resolve any existing storage alerts
 */
export async function checkStorageAlerts(): Promise<void> {
  const sizeMb = await getDatabaseSizeMb();
  const percentage = sizeMb / STORAGE_LIMIT_MB;

  if (percentage >= STORAGE_CRITICAL_THRESHOLD) {
    // Create critical alert if none exists
    if (!(await hasActiveAlert("storage_critical"))) {
      await createAlert({
        type: "storage_critical",
        severity: "critical",
        message: `Neon storage at ${sizeMb.toFixed(0)}MB / ${STORAGE_LIMIT_MB}MB (${(percentage * 100).toFixed(1)}%) — immediate action required`,
        details: JSON.stringify({
          sizeMb,
          limitMb: STORAGE_LIMIT_MB,
          percentage,
        }),
      });
    }
  } else if (percentage >= STORAGE_WARNING_THRESHOLD) {
    // Create warning alert if none exists
    if (!(await hasActiveAlert("storage_near_limit"))) {
      await createAlert({
        type: "storage_near_limit",
        severity: "warning",
        message: `Neon storage at ${sizeMb.toFixed(0)}MB / ${STORAGE_LIMIT_MB}MB (${(percentage * 100).toFixed(1)}%) — batch refreshes are being skipped`,
        details: JSON.stringify({
          sizeMb,
          limitMb: STORAGE_LIMIT_MB,
          percentage,
        }),
      });
    }
  } else {
    // Storage is healthy — resolve any existing storage alerts
    await resolveAlertsByType("storage_critical");
    await resolveAlertsByType("storage_near_limit");
  }
}

// ── Schema Validation Alert Check ────────────────────────────────────────────

/**
 * Check Zod validation failure rates and create an alert if the rate spikes.
 *
 * Queries the ingestion_log table for the last hour and calculates the
 * validation failure rate. If > 20% of polls failed with validation errors,
 * creates a "schema_validation_spike" alert.
 *
 * @param failureThreshold  Failure rate threshold (0-1, default 0.20 = 20%)
 * @param windowMinutes     Time window in minutes (default 60)
 */
export async function checkSchemaValidationAlerts(
  failureThreshold = 0.2,
  windowMinutes = 60,
): Promise<void> {
  const cutoff = new Date();
  cutoff.setMinutes(cutoff.getMinutes() - windowMinutes);

  const result = await db.execute(sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'failed' AND error_message LIKE '%Zod validation failed%')::int AS validation_failures
    FROM ingestion_log
    WHERE created_at >= ${cutoff}
  `);

  const row = result.rows[0] as
    | { total?: number; validation_failures?: number }
    | undefined;
  const total = row?.total ?? 0;
  const failures = row?.validation_failures ?? 0;

  if (total < 5) {
    // Not enough data — don't alert on small samples
    return;
  }

  const failureRate = failures / total;
  if (failureRate >= failureThreshold) {
    if (!(await hasActiveAlert("schema_validation_spike"))) {
      await createAlert({
        type: "schema_validation_spike",
        severity: "warning",
        message: `Schema validation failure rate at ${(failureRate * 100).toFixed(1)}% (${failures}/${total} polls in last ${windowMinutes}min) — an ATS API may have changed`,
        details: JSON.stringify({
          failureRate,
          failures,
          total,
          windowMinutes,
          threshold: failureThreshold,
        }),
      });
    }
  } else {
    // Failure rate is normal — resolve any existing alert
    await resolveAlertsByType("schema_validation_spike");
  }
}

// ── Circuit Breaker Alert ────────────────────────────────────────────────────

/**
 * Create a circuit breaker trip alert for a source that was auto-disabled.
 * Called by the source-health module when the hard circuit breaker opens.
 */
export async function createCircuitBreakerAlert(
  sourceName: string,
  consecutiveFailures: number,
  lastError: string,
): Promise<void> {
  if (await hasActiveAlert("circuit_breaker_trip", sourceName)) {
    return; // Already alerted for this source
  }
  await createAlert({
    type: "circuit_breaker_trip",
    severity: "critical",
    message: `Source "${sourceName}" auto-disabled after ${consecutiveFailures} consecutive failures`,
    details: JSON.stringify({ sourceName, consecutiveFailures, lastError }),
    sourceName,
  });
}

// Import sql for raw queries
import { sql } from "drizzle-orm";
