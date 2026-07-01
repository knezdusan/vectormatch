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
  // ── Sprint 8: Match-specific metrics ──────────────────────────────────────
  /** Approved matches in the last 24 hours. */
  approvedMatches24h: number;
  /** Gate 3 approval rate (approved / total evaluated, last 7 days). */
  gate3ApprovalRate7d: number;
  /** Jobs with embeddings but no match_queue entries (missed by matching). */
  unmatchedEmbeddedJobs: number;
  /** Average Gate 3 LLM confidence for recent evaluations (last 7 days). */
  avgGate3Confidence: number;
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
  // ── Sprint 8: Match-specific thresholds ───────────────────────────────────
  APPROVED_MATCHES_24H: 3, // alert if < 3 approved matches in 24h
  GATE3_APPROVAL_RATE_7D: 0.01, // alert if < 1% approval rate over 7 days
  UNMATCHED_EMBEDDED_JOBS: 100, // alert if > 100 embedded jobs have no match_queue entry
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
    approvedMatches24h,
    gate3ApprovalRate7d,
    unmatchedEmbeddedJobs,
    avgGate3Confidence,
  ] = await Promise.all([
    countUnnormalizedJobs(),
    countUnembeddedJobs(),
    countCompaniesPolledRecently(4),
    countRecentMatches(24),
    countSourceHealthRows(),
    getDatabaseSizeMb(),
    countStalePendingMatches(),
    countNormalizationFailed(),
    countApprovedMatches24h(),
    calcGate3ApprovalRate7d(),
    countUnmatchedEmbeddedJobs(),
    calcAvgGate3Confidence7d(),
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
    approvedMatches24h,
    gate3ApprovalRate7d,
    unmatchedEmbeddedJobs,
    avgGate3Confidence,
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
  // Sprint 8: match-specific alerts
  if (metrics.approvedMatches24h < ALERT_THRESHOLDS.APPROVED_MATCHES_24H) {
    alerts.push(
      `LOW_APPROVAL_RATE: only ${metrics.approvedMatches24h} approved matches in 24h (target: 5-10)`,
    );
  }
  if (metrics.gate3ApprovalRate7d < ALERT_THRESHOLDS.GATE3_APPROVAL_RATE_7D) {
    alerts.push(
      `GATE3_APPROVAL_RATE_LOW: ${(metrics.gate3ApprovalRate7d * 100).toFixed(1)}% Gate 3 approval rate over 7 days (target: 2-4%)`,
    );
  }
  if (
    metrics.unmatchedEmbeddedJobs > ALERT_THRESHOLDS.UNMATCHED_EMBEDDED_JOBS
  ) {
    alerts.push(
      `UNMATCHED_EMBEDDED: ${metrics.unmatchedEmbeddedJobs} embedded jobs with no match_queue entry`,
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

// ── Sprint 8: Match-Specific Metric Queries ──────────────────────────────────

async function countApprovedMatches24h(): Promise<number> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt FROM match_queue
    WHERE status = 'approved'
      AND evaluated_at > NOW() - INTERVAL '24 hours'
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function calcGate3ApprovalRate7d(): Promise<number> {
  const result = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'approved')::float
      / NULLIF(count(*) FILTER (WHERE status IN ('approved', 'rejected')), 0)
      AS rate
    FROM match_queue
    WHERE evaluated_at > NOW() - INTERVAL '7 days'
  `);
  return Number(result.rows[0]?.rate ?? 0);
}

async function countUnmatchedEmbeddedJobs(): Promise<number> {
  // Jobs with embeddings that have tag overlap with any persona but no
  // match_queue entry for that persona. These were missed by the matching
  // pipeline and should be caught by the retry sweep.
  const result = await db.execute(sql`
    SELECT count(DISTINCT j.id)::int AS cnt
    FROM job j
    JOIN persona p ON (j.extracted_tags && p.must_have_tags)
    WHERE j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.extracted_tags IS NOT NULL
      AND cardinality(j.extracted_tags) > 0
      AND NOT EXISTS (
        SELECT 1 FROM match_queue mq
        WHERE mq.job_id = j.id AND mq.persona_id = p.id
      )
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

async function calcAvgGate3Confidence7d(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(avg(llm_confidence), 0)::float AS avg_conf
    FROM match_queue
    WHERE evaluated_at > NOW() - INTERVAL '7 days'
      AND llm_confidence IS NOT NULL
  `);
  return Number(result.rows[0]?.avg_conf ?? 0);
}
