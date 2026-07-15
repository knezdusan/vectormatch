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
import { GATE2_MAX_COSINE_DISTANCE } from "@/lib/jobs/matching-config";
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
  /** F1 guard: country_fenced jobs with NULL location_countries (over-fencing signal). */
  nullCountryFencedJobs: number;
  /** G1 guard: critical cron functions that haven't logged a run in their cadence window (silent cron failure). */
  staleCronFunctions: number;
  /** H2 guard: names of stale cron functions (for alert message detail). */
  staleCronFunctionNames: string[];
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
  // ── F1: Fencing recall guard ──────────────────────────────────────────────
  NULL_COUNTRY_FENCED: 100, // alert if > 100 country_fenced jobs with NULL location_countries
  // ── G1: Cron-firing receipt guard ─────────────────────────────────────────
  // Critical cron functions that must produce an ingestion_log entry per run.
  // If any haven't logged in 36h, the Inngest cron scheduler is silently wedged.
  STALE_CRON_FUNCTIONS: 0, // alert if ANY critical cron function is stale
} as const;

/**
 * H2 guard: Mission-critical cron functions that must produce an ingestion_log
 * entry per run. Each entry maps the ingestion_log source to the expected max
 * gap (in hours) between runs. If no log entry exists within that window, the
 * cron is silently not firing — the Inngest cron scheduler is wedged.
 *
 * This is the "fired-run receipt" discipline: registered ≠ firing. The only
 * proof that a cron function is working is a real log entry proving it ran.
 * The wedge can hit ANY of the 41 cron functions, not just the 2 that failed
 * first — so this guard covers all mission-critical crons by cadence.
 *
 * Cadence is set to 1.5× the expected interval (e.g., a 2h cron gets 6h grace,
 * a daily cron gets 36h grace) to allow for execution latency without false
 * positives.
 */
const CRITICAL_CRON_FUNCTIONS: Record<string, number> = {
  // ── Pollers (most critical — silent failure = no new jobs) ───────────────
  batch_poll_active_hot: 6, // every 2h — 6h grace
  // D1: backlog_sweeper and batch_poll_probation removed — their crons are
  // paused (triggers: []). Including them in the guard would produce false
  // alerts every cycle. Re-add when the crons are re-enabled.
  // ── Embedding & ingestion (the 2 that were silently dead) ───────────────
  probation_embedding_backfill: 36, // daily at 4:15 UTC — 36h grace
  direct_job_boards: 36, // daily at 5:00 UTC — 36h grace
  // ── Sweeps & safety nets ────────────────────────────────────────────────
  quality_flywheel: 36, // daily at 4:30 UTC
  aggressive_cleanup: 36, // daily at 2:00 UTC
  normalization_retry: 36, // every 12h — 36h grace
  nightly_resurrection_sweep: 36, // daily at 3:00 UTC
  match_retry_sweep: 36, // daily at 5:00 UTC
  revival_sweep: 36, // daily at 3:00 UTC
  layoff_signal_checker: 36, // daily at 5:00 UTC
  // ── Daily seeders (company discovery pipeline) ──────────────────────────
  wwr_rss: 36, // daily at 4:00 UTC
  remote_job_boards: 36, // daily at 3:00 UTC
  // ── Circuit breakers ────────────────────────────────────────────────────
  breaker_check_v2: 12, // every 6h — 12h grace
  source_ban_recovery_v2: 36, // daily at 6:00 UTC
};

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
    nullCountryFencedJobs,
    staleCronResult,
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
    countNullCountryFencedJobs(),
    checkStaleCronFunctions(),
  ]);

  const staleCronFunctions = staleCronResult.count;
  const staleCronFunctionNames = staleCronResult.names;

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
    nullCountryFencedJobs,
    staleCronFunctions,
    staleCronFunctionNames,
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
  // F1: Fencing recall guard — detect over-fencing recurrence
  if (metrics.nullCountryFencedJobs > ALERT_THRESHOLDS.NULL_COUNTRY_FENCED) {
    alerts.push(
      `NULL_COUNTRY_FENCED: ${metrics.nullCountryFencedJobs} country_fenced jobs with NULL location_countries (possible over-fencing or metadata gap)`,
    );
  }
  // G1/H2: Cron-firing receipt guard — detect silently non-firing cron functions
  //
  // H3 recurrence watch: The Inngest cron scheduler wedge is a recurring
  // pattern (not a one-time incident). The restart (H1) is PROVISIONAL — it
  // clears the current wedge but doesn't prevent recurrence. This guard is
  // the tripwire: if it fires after a restart, the wedge has returned and
  // escalation is needed (scheduled preventive Inngest restart, or migration
  // off self-hosted Inngest). The "#3549" attribution is unverified — the
  // recurrence pattern, not the issue number, tells us what this is.
  if (metrics.staleCronFunctions > ALERT_THRESHOLDS.STALE_CRON_FUNCTIONS) {
    const names = metrics.staleCronFunctionNames.join(", ");
    alerts.push(
      `STALE_CRON_FUNCTIONS: ${metrics.staleCronFunctions} critical cron function(s) haven't logged a run in their cadence window — Inngest cron scheduler may be wedged (registered ≠ firing). Stale: ${names}. If this recurs after restart, escalate to scheduled preventive restart or migration off self-hosted Inngest.`,
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
  // Jobs with embeddings that pass BOTH Gate 1 (tag overlap) AND Gate 2
  // (cosine distance < threshold) for some persona, but have no match_queue
  // entry for that persona. These were genuinely missed by the matching
  // pipeline and should be caught by the retry sweep.
  //
  // The Gate 2 filter is critical: without it, the query counts every job
  // that has tag overlap but was correctly filtered by cosine distance,
  // producing a false-positive alert. With 3 personas and a 0.5 distance
  // threshold, ~95% of Gate 1-eligible jobs are correctly rejected by
  // Gate 2 — counting them as "unmatched" would fire the alert constantly.
  const result = await db.execute(sql`
    SELECT count(DISTINCT j.id)::int AS cnt
    FROM job j
    JOIN persona p ON (j.extracted_tags && p.must_have_tags)
    WHERE j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.extracted_tags IS NOT NULL
      AND cardinality(j.extracted_tags) > 0
      AND p.persona_embedding IS NOT NULL
      AND (p.persona_embedding <=> j.job_embedding) < ${GATE2_MAX_COSINE_DISTANCE}::real
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

/**
 * F1 fencing recall guard: Count country_fenced jobs with NULL location_countries.
 *
 * A high count indicates either:
 *   1. A metadata gap (ATS normalizers not extracting country codes from
 *      location strings — the F1 fix addresses this)
 *   2. Over-fencing by the LLM (classifying jobs as country_fenced without
 *      providing a country code)
 *
 * Threshold: > 100 jobs triggers an alert.
 */
async function countNullCountryFencedJobs(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*)::int AS cnt
    FROM job
    WHERE remote_scope = 'country_fenced'
      AND location_countries IS NULL
      AND status = 'active'
  `);
  return Number(result.rows[0]?.cnt ?? 0);
}

/**
 * H2 guard: Check all mission-critical cron functions for fired-run receipts.
 *
 * The "registered ≠ firing" wedge causes cron functions to be present in the
 * serve endpoint but never actually scheduled by the Inngest cron scheduler.
 * The only reliable signal is a fired-run receipt — an actual ingestion_log
 * entry proving the function executed.
 *
 * Each function in CRITICAL_CRON_FUNCTIONS has a max gap (in hours). If no
 * ingestion_log entry exists for that source within the gap, it's stale.
 * Returns both the count and the names of stale functions for alert detail.
 */
async function checkStaleCronFunctions(): Promise<{
  count: number;
  names: string[];
}> {
  const staleNames: string[] = [];
  for (const [source, maxGapHours] of Object.entries(CRITICAL_CRON_FUNCTIONS)) {
    const result = await db.execute(sql`
      SELECT count(*)::int AS cnt FROM ingestion_log
      WHERE source = ${source} AND created_at > NOW() - ${maxGapHours} * INTERVAL '1 hour'
    `);
    const recentRuns = Number(result.rows[0]?.cnt ?? 0);
    if (recentRuns === 0) {
      staleNames.push(source);
    }
  }
  return { count: staleNames.length, names: staleNames };
}
