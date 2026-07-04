// Inngest Health Monitor — Health checks and failure rate detection
// src/lib/coolify/inngest-health.ts
//
// Provides functions to check Inngest server health via HTTP, detect
// function failure spikes, and detect pipeline stalls (no jobs processed).
// Used by the inngestHealthMonitor Inngest function (cron every 5 min).
//
// Environment:
//   INNGEST_HEALTH_URL — URL to check Inngest server health (e.g., http://inngest:8288/health)
//                        Falls back to INNGEST_SERVE_ORIGIN + "/health" if not set.
//
// Server-only: makes HTTP requests and database queries.

import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/db/db";

// ── Configuration ────────────────────────────────────────────────────────────

function getInngestHealthUrl(): string | null {
  const direct = process.env.INNGEST_HEALTH_URL;
  if (direct) return direct;
  const serveOrigin = process.env.INNGEST_SERVE_ORIGIN;
  if (serveOrigin) return `${serveOrigin}/health`;
  return null;
}

// Number of consecutive health check failures before alerting
const HEALTH_CHECK_FAILURE_THRESHOLD = 3;

// Function failure rate threshold (percentage of runs that fail in 1h)
const FUNCTION_FAILURE_RATE_THRESHOLD = 0.5; // 50%

// Minimum number of function runs in the window to evaluate failure rate
const MIN_RUNS_FOR_FAILURE_RATE = 10;

// Pipeline stall threshold (hours without any normalized jobs)
const PIPELINE_STALL_THRESHOLD_HOURS = 4;

// ── Types ────────────────────────────────────────────────────────────────────

export type HealthCheckResult = {
  reachable: boolean;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
  checkedAt: string;
};

export type FunctionFailureResult = {
  totalRuns: number;
  failedRuns: number;
  failureRate: number;
  thresholdExceeded: boolean;
  topFailingFunctions: { name: string; failures: number }[];
};

export type PipelineStallResult = {
  jobsNormalizedInWindow: number;
  windowHours: number;
  stalled: boolean;
};

export type InngestHealthReport = {
  healthCheck: HealthCheckResult;
  functionFailures: FunctionFailureResult;
  pipelineStall: PipelineStallResult;
  overallHealthy: boolean;
  alerts: string[];
};

// ── Health Check ─────────────────────────────────────────────────────────────

/**
 * Check if the Inngest server is reachable via HTTP health endpoint.
 * Returns the status code, response time, and any error.
 */
export async function checkInngestHealth(): Promise<HealthCheckResult> {
  const checkedAt = new Date().toISOString();
  const healthUrl = getInngestHealthUrl();

  if (!healthUrl) {
    return {
      reachable: false,
      statusCode: null,
      responseTimeMs: null,
      error: "INNGEST_HEALTH_URL not configured",
      checkedAt,
    };
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(healthUrl, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    return {
      reachable: response.ok,
      statusCode: response.status,
      responseTimeMs: Date.now() - startTime,
      error: response.ok ? null : `HTTP ${response.status}`,
      checkedAt,
    };
  } catch (error) {
    return {
      reachable: false,
      statusCode: null,
      responseTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
      checkedAt,
    };
  }
}

// ── Function Failure Rate ────────────────────────────────────────────────────

/**
 * Check Inngest function failure rate over the last hour.
 * Queries the ingestion_log table for function run outcomes.
 * If the failure rate exceeds the threshold, returns details about
 * the top failing functions.
 */
export async function checkFunctionFailureRate(): Promise<FunctionFailureResult> {
  // Query ingestion_log for function runs in the last hour
  // The ingestion_log table records all pipeline events including failures
  const result = await db.execute(sql`
    WITH runs AS (
      SELECT
        event_type,
        metadata->>'functionName' AS function_name,
        metadata->>'status' AS status
      FROM ingestion_log
      WHERE created_at > NOW() - INTERVAL '1 hour'
        AND event_type IN ('function.completed', 'function.failed')
    )
    SELECT
      count(*)::int AS total_runs,
      count(*) FILTER (WHERE status = 'failed')::int AS failed_runs,
      count(*) FILTER (WHERE status = 'failed')::float / NULLIF(count(*), 0) AS failure_rate
    FROM runs
  `);

  const row = result.rows[0] as
    | {
        total_runs: number;
        failed_runs: number;
        failure_rate: number | null;
      }
    | undefined;

  const totalRuns = row?.total_runs ?? 0;
  const failedRuns = row?.failed_runs ?? 0;
  const failureRate = row?.failure_rate ?? 0;

  // If not enough runs to evaluate, don't alert
  if (totalRuns < MIN_RUNS_FOR_FAILURE_RATE) {
    return {
      totalRuns,
      failedRuns,
      failureRate,
      thresholdExceeded: false,
      topFailingFunctions: [],
    };
  }

  // Get top failing functions
  const topFailing = await db.execute(sql`
    SELECT
      metadata->>'functionName' AS function_name,
      count(*)::int AS failures
    FROM ingestion_log
    WHERE created_at > NOW() - INTERVAL '1 hour'
      AND event_type = 'function.failed'
      AND metadata->>'functionName' IS NOT NULL
    GROUP BY metadata->>'functionName'
    ORDER BY failures DESC
    LIMIT 5
  `);

  const topFailingFunctions = (
    topFailing.rows as {
      function_name: string;
      failures: number;
    }[]
  ).map((r) => ({
    name: r.function_name,
    failures: r.failures,
  }));

  return {
    totalRuns,
    failedRuns,
    failureRate,
    thresholdExceeded: failureRate >= FUNCTION_FAILURE_RATE_THRESHOLD,
    topFailingFunctions,
  };
}

// ── Pipeline Stall Detection ─────────────────────────────────────────────────

/**
 * Check if the pipeline has stalled — no jobs normalized in the last N hours.
 * This could indicate the Inngest server is down or the normalization
 * function is failing repeatedly.
 */
export async function checkPipelineStall(): Promise<PipelineStallResult> {
  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt
    FROM job
    WHERE normalized_at > NOW() - ${PIPELINE_STALL_THRESHOLD_HOURS} * INTERVAL '1 hour'
  `);

  const jobsNormalized = Number(result.rows[0]?.cnt ?? 0);

  return {
    jobsNormalizedInWindow: jobsNormalized,
    windowHours: PIPELINE_STALL_THRESHOLD_HOURS,
    stalled: jobsNormalized === 0,
  };
}

// ── Full Health Report ───────────────────────────────────────────────────────

/**
 * Collect all health signals and return a comprehensive report.
 * Used by the inngestHealthMonitor Inngest function.
 */
export async function getInngestHealthReport(): Promise<InngestHealthReport> {
  const [healthCheck, functionFailures, pipelineStall] = await Promise.all([
    checkInngestHealth(),
    checkFunctionFailureRate(),
    checkPipelineStall(),
  ]);

  const alerts: string[] = [];

  if (!healthCheck.reachable) {
    alerts.push(
      `INNGEST_UNREACHABLE: Health check failed — ${healthCheck.error ?? "unknown error"}`,
    );
  }

  if (functionFailures.thresholdExceeded) {
    const topFns = functionFailures.topFailingFunctions
      .map((f) => `${f.name} (${f.failures})`)
      .join(", ");
    alerts.push(
      `INNGEST_FAILURE_SPIKE: ${(functionFailures.failureRate * 100).toFixed(0)}% failure rate (${functionFailures.failedRuns}/${functionFailures.totalRuns} runs in 1h). Top failures: ${topFns}`,
    );
  }

  if (pipelineStall.stalled) {
    alerts.push(
      `INNGEST_PIPELINE_STALL: No jobs normalized in ${pipelineStall.windowHours}h`,
    );
  }

  return {
    healthCheck,
    functionFailures,
    pipelineStall,
    overallHealthy: alerts.length === 0,
    alerts,
  };
}

// ── Thresholds (exported for tests) ──────────────────────────────────────────

export const THRESHOLDS = {
  HEALTH_CHECK_FAILURE_THRESHOLD,
  FUNCTION_FAILURE_RATE_THRESHOLD,
  MIN_RUNS_FOR_FAILURE_RATE,
  PIPELINE_STALL_THRESHOLD_HOURS,
} as const;
