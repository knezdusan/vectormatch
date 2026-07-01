// Pipeline Health Metrics — Sprint 7 Monitoring Guardrails
// src/lib/jobs/pipeline-health.ts
//
// Query functions for pipeline health monitoring. Used by:
//   - The `pipelineHealthMonitor` Inngest function (every 30 min) for alerting
//   - The admin dashboard "Pipeline Health" component for display
//
// All queries are read-only and safe to run frequently. They use COUNT
// aggregations on indexed columns for sub-millisecond performance.
//
// Server-only: touches the database.

import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/db";
import { getDatabaseSizeMb } from "@/lib/jobs/storage-check";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PipelineHealthMetrics {
  /** Jobs with status='active' and normalized_at IS NULL, detected > 1h ago. */
  unnormalizedJobs: number;
  /** Jobs with status='active', normalized_at IS NOT NULL, but no embedding. */
  unembeddedJobs: number;
  /** Companies polled in the last 4 hours (poller liveness signal). */
  companiesPolled4h: number;
  /** Match queue entries created in the last 24 hours. */
  matches24h: number;
  /** Rows in the source_health table (circuit breaker coverage). */
  sourceHealthRows: number;
  /** Database size in MB. */
  dbSizeMb: number;
  /** Match queue entries with status='pending' older than 30 minutes. */
  pendingMatchesStale: number;
  /** Jobs with status='normalization_failed' (retryable failures). */
  normalizationFailed: number;
}

// ── Thresholds ───────────────────────────────────────────────────────────────

export const ALERT_THRESHOLDS = {
  UNNORMALIZED_JOBS: 50,
  UNEMBEDDED_JOBS: 50,
  STALE_POLLER: 0, // alert if 0 companies polled in 4h
  NO_MATCHES: 0, // alert if 0 matches in 24h
  SOURCE_HEALTH_EMPTY: 0, // alert if 0 source_health rows
  DB_STORAGE_MB: 450, // alert if DB > 450 MB (512 MB limit)
  PENDING_MATCHES_STALE: 10, // alert if > 10 pending matches older than 30min
} as const;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Collect all pipeline health metrics in a single call. Each metric is queried
 * independently so a failure in one query doesn't block the others.
 */
export async function getPipelineHealthMetrics(): Promise<PipelineHealthMetrics> {
  const [
    unnormalizedJobs,
    unembeddedJobs,
    companiesPolled4h,
    matches24h,
    sourceHealthRows,
    dbSizeMb,
    pendingMatchesStale,
    normalizationFailed,
  ] = await Promise.all([
    countUnnormalizedJobs(),
    countUnembeddedJobs(),
    countCompaniesPolledRecently(4),
    countRecentMatches(24),
    countSourceHealthRows(),
    getDatabaseSizeMb(),
    countStalePendingMatches(),
    countNormalizationFailed(),
  ]);

  return {
    unnormalizedJobs,
    unembeddedJobs,
    companiesPolled4h,
    matches24h,
    sourceHealthRows,
    dbSizeMb,
    pendingMatchesStale,
    normalizationFailed,
  };
}

/**
 * Evaluate metrics against thresholds and return alert messages for any that
 * breach their thresholds. Used by the pipelineHealthMonitor Inngest function.
 */
export function evaluateAlerts(metrics: PipelineHealthMetrics): string[] {
  const alerts: string[] = [];

  if (metrics.unnormalizedJobs > ALERT_THRESHOLDS.UNNORMALIZED_JOBS) {
    alerts.push(
      `UNNORMALIZED_JOBS: ${metrics.unnormalizedJobs} jobs older than 1h without normalization`,
    );
  }
  if (metrics.unembeddedJobs > ALERT_THRESHOLDS.UNEMBEDDED_JOBS) {
    alerts.push(
      `UNEMBEDDED_JOBS: ${metrics.unembeddedJobs} normalized jobs without embeddings`,
    );
  }
  if (metrics.companiesPolled4h === ALERT_THRESHOLDS.STALE_POLLER) {
    alerts.push("STALE_POLLER: No companies polled in last 4h");
  }
  if (metrics.matches24h === ALERT_THRESHOLDS.NO_MATCHES) {
    alerts.push("NO_MATCHES: No matches generated in 24h");
  }
  if (metrics.sourceHealthRows === ALERT_THRESHOLDS.SOURCE_HEALTH_EMPTY) {
    alerts.push("SOURCE_HEALTH_EMPTY: source_health table is empty");
  }
  if (metrics.dbSizeMb > ALERT_THRESHOLDS.DB_STORAGE_MB) {
    alerts.push(`DB_STORAGE_HIGH: ${metrics.dbSizeMb.toFixed(0)}MB / 512MB`);
  }
  if (metrics.pendingMatchesStale > ALERT_THRESHOLDS.PENDING_MATCHES_STALE) {
    alerts.push(
      `QUEUE_BACKLOG: ${metrics.pendingMatchesStale} pending matches older than 30min`,
    );
  }

  return alerts;
}

// ── Individual Metric Queries ────────────────────────────────────────────────

async function countUnnormalizedJobs(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM job
    WHERE status = 'active' AND normalized_at IS NULL
      AND raw_json IS NOT NULL
      AND detected_at < NOW() - INTERVAL '1 hour'
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function countUnembeddedJobs(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM job
    WHERE status = 'active' AND job_embedding IS NULL
      AND normalized_at IS NOT NULL
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function countCompaniesPolledRecently(hours: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM company
    WHERE last_polled_at > NOW() - ${hours} * INTERVAL '1 hour'
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function countRecentMatches(hours: number): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM match_queue
    WHERE created_at > NOW() - ${hours} * INTERVAL '1 hour'
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function countSourceHealthRows(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM source_health
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function countStalePendingMatches(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM match_queue
    WHERE status = 'pending' AND created_at < NOW() - INTERVAL '30 minutes'
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function countNormalizationFailed(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM job
    WHERE status = 'normalization_failed' AND normalized_at IS NULL
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}
