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

import { sendStorageAlertEmail } from "@/lib/jobs/storage-alert";
import {
  getDatabaseSizeMb,
  getIngestionBacklog,
  MAX_UNNORMALIZED_BACKLOG,
  STORAGE_EARLY_WARNING_THRESHOLD,
  STORAGE_INGESTION_HALT_THRESHOLD,
  STORAGE_LIMIT_MB,
  UNNORMALIZED_BACKLOG_ALERT_THRESHOLD,
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

/**
 * Resolve every active alert regardless of type. Used by the admin dashboard
 * "Resolve all" bulk action.
 */
export async function resolveAllAlerts(resolvedBy = "auto"): Promise<number> {
  const result = await db
    .update(alerts)
    .set({ status: "resolved", resolvedAt: new Date(), resolvedBy })
    .where(eq(alerts.status, "active"))
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
 * Check storage and the unnormalized backlog, then create/resolve alerts as
 * needed. Called by the daily health check and the hourly storage monitor.
 *
 * Thresholds:
 *   - Early warning: storage >= 80% OR backlog >= 2,500 → "storage_near_limit"
 *   - Critical: storage >= 88% OR backlog >= 3,000 → "storage_critical"
 *   - Healthy: below all thresholds → resolve existing storage alerts
 *
 * Sends an email alert to ADMIN_ALERT_EMAIL when a new alert is created.
 */
export async function checkStorageAlerts(): Promise<void> {
  const sizeMb = await getDatabaseSizeMb();
  const percentage = sizeMb / STORAGE_LIMIT_MB;
  const unnormalizedCount = await getIngestionBacklog();
  const storageCritical = percentage >= STORAGE_INGESTION_HALT_THRESHOLD;
  const storageWarning =
    percentage >= STORAGE_EARLY_WARNING_THRESHOLD && !storageCritical;
  const backlogCritical = unnormalizedCount >= MAX_UNNORMALIZED_BACKLOG;
  const backlogWarning =
    unnormalizedCount >= UNNORMALIZED_BACKLOG_ALERT_THRESHOLD &&
    !backlogCritical;
  const critical = storageCritical || backlogCritical;
  const warning = storageWarning || backlogWarning;

  if (critical) {
    const storagePart = storageCritical
      ? `storage at ${(percentage * 100).toFixed(1)}% (${sizeMb.toFixed(0)}MB / ${STORAGE_LIMIT_MB}MB)`
      : "";
    const backlogPart = backlogCritical
      ? `normalization backlog at ${unnormalizedCount} jobs`
      : "";
    const reason = [storagePart, backlogPart].filter(Boolean).join(" + ");
    const message = `Neon ${reason} — ingestion is halted`;

    if (!(await hasActiveAlert("storage_critical"))) {
      await createAlert({
        type: "storage_critical",
        severity: "critical",
        message,
        details: JSON.stringify({
          sizeMb,
          limitMb: STORAGE_LIMIT_MB,
          percentage,
          unnormalizedCount,
          maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
          ingestionHalted: true,
        }),
      });
      await sendStorageAlertEmail({
        severity: "critical",
        currentMb: sizeMb,
        limitMb: STORAGE_LIMIT_MB,
        percentage,
        unnormalizedCount,
        maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
        reason: message,
        ingestionHalted: true,
      });
    }
    // Resolve any warning alert because critical supersedes it.
    await resolveAlertsByType("storage_near_limit");
  } else if (warning) {
    const storagePart = storageWarning
      ? `storage at ${(percentage * 100).toFixed(1)}% (${sizeMb.toFixed(0)}MB / ${STORAGE_LIMIT_MB}MB)`
      : "";
    const backlogPart = backlogWarning
      ? `normalization backlog at ${unnormalizedCount} jobs`
      : "";
    const reason = [storagePart, backlogPart].filter(Boolean).join(" + ");
    const message = `Neon ${reason} — ingestion will halt soon`;

    if (!(await hasActiveAlert("storage_near_limit"))) {
      await createAlert({
        type: "storage_near_limit",
        severity: "warning",
        message,
        details: JSON.stringify({
          sizeMb,
          limitMb: STORAGE_LIMIT_MB,
          percentage,
          unnormalizedCount,
          maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
          ingestionHalted: false,
        }),
      });
      await sendStorageAlertEmail({
        severity: "warning",
        currentMb: sizeMb,
        limitMb: STORAGE_LIMIT_MB,
        percentage,
        unnormalizedCount,
        maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
        reason: message,
        ingestionHalted: false,
      });
    }
    // Resolve critical alerts if the condition dropped below critical.
    await resolveAlertsByType("storage_critical");
  } else {
    // Storage and backlog are healthy — resolve any existing storage alerts.
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
