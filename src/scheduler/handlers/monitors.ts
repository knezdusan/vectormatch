// D27: Monitor & alert handlers for pg-boss scheduler
// src/scheduler/handlers/monitors.ts

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import {
  checkSchemaValidationAlerts,
  checkStorageAlerts,
  createAlert,
  hasActiveAlert,
  resolveAlertsByType,
} from "@/lib/jobs/alerting";
import {
  evaluateAlerts,
  evaluateStageAlerts,
  getPipelineHealthMetrics,
  getStageDailyCounters,
} from "@/lib/jobs/pipeline-health";
import { writeIngestionLog } from "@/lib/jobs/poller/ingestion-log";
import { checkLayoffSignals } from "@/lib/jobs/quality/layoff-signals";
import { isStorageSafeForIngestion } from "@/lib/jobs/storage-check";
import { scheduler } from "../scheduler";

// ── breakerCheck ────────────────────────────────────────────────────────────
// Cron: "5 * * * *" (every hour at :05)

export async function runBreakerCheck(): Promise<void> {
  const { evaluateBreaker, applyBreakerActions } = await import(
    "@/lib/jobs/circuit-breaker"
  );

  // evaluateBreaker evaluates all 5 tiers at once and returns a single result
  const evaluation = await evaluateBreaker();
  // Apply all triggered actions at once
  await applyBreakerActions(evaluation);

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "circuit_breaker_check",
    itemsProcessed: evaluation.evaluations.length,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── sourceBanRecoveryCheck ──────────────────────────────────────────────────
// Cron: "0 6 * * *" (daily 06:00 UTC)

export async function runSourceBanRecoveryCheck(): Promise<void> {
  const { recoverBannedSources } = await import("@/lib/jobs/circuit-breaker");
  const recovered = await recoverBannedSources();

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "source_ban_recovery",
    itemsProcessed: recovered.length,
    itemsInserted: 0,
    itemsUpdated: recovered.length,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── dailyHealthCheck ────────────────────────────────────────────────────────
// Cron: "0 6 * * *" (daily 06:00 UTC)

export async function runDailyHealthCheck(): Promise<void> {
  await checkStorageAlerts();
  await checkSchemaValidationAlerts();
  console.info(
    "[daily-health-check] Storage + schema validation checks complete",
  );
}

// ── storageMonitor ──────────────────────────────────────────────────────────
// Cron: "0 */6 * * *" (every 6 hours)

export async function runStorageMonitor(): Promise<void> {
  await checkStorageAlerts();
  const status = await isStorageSafeForIngestion();
  console.info(
    `[storage-monitor] allow=${status.allow} percentage=${(status.percentage * 100).toFixed(1)}% currentMb=${status.currentMb}`,
  );
}

// ── pipelineHealthMonitor ───────────────────────────────────────────────────
// Cron: "0 */4 * * *" (every 4 hours)

export async function runPipelineHealthMonitor(): Promise<void> {
  const metrics = await getPipelineHealthMetrics();
  const alertMessages = evaluateAlerts(metrics);
  const stageCounters = await getStageDailyCounters();
  const stageAlertMessages = evaluateStageAlerts(stageCounters);

  // Create a pipeline_health alert if any threshold is breached
  const allMessages = [...alertMessages, ...stageAlertMessages];
  if (allMessages.length > 0) {
    const exists = await hasActiveAlert("pipeline_health");
    if (!exists) {
      await createAlert({
        type: "pipeline_health",
        severity: "warning",
        message: allMessages[0] ?? "Pipeline health threshold breached",
        details: allMessages.join("\n"),
      });
    }
  } else {
    // Resolve if no alerts
    await resolveAlertsByType("pipeline_health");
  }
}

// ── inngestHealthMonitor ────────────────────────────────────────────────────
// Cron: "0 */2 * * *" (every 2 hours)
// D27: This monitor now checks pg-boss health instead of Inngest.

export async function runSchedulerHealthMonitor(): Promise<void> {
  // Check pg-boss queue health
  const queueHealth = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM pgboss.job WHERE state = 'created') AS pending_jobs,
      (SELECT count(*) FROM pgboss.job WHERE state = 'active') AS active_jobs,
      (SELECT count(*) FROM pgboss.job WHERE state = 'failed') AS failed_jobs,
      (SELECT count(*) FROM pgboss.job WHERE state = 'completed' AND createdon > NOW() - INTERVAL '24 hours') AS completed_24h,
      (SELECT count(*) FROM pgboss.schedule) AS active_schedules
  `);

  const row = queueHealth.rows[0] as {
    pending_jobs: string;
    active_jobs: string;
    failed_jobs: string;
    completed_24h: string;
    active_schedules: string;
  };

  const failedCount = Number(row.failed_jobs);
  const pendingCount = Number(row.pending_jobs);
  const activeSchedules = Number(row.active_schedules);

  console.info(
    `[scheduler-health] pending=${pendingCount} active=${row.active_jobs} failed=${failedCount} completed24h=${row.completed_24h} schedules=${activeSchedules}`,
  );

  // Alert on stuck queue or no schedules — use inngest_server_down type
  // (closest existing type for scheduler infrastructure issues)
  if (activeSchedules === 0) {
    const exists = await hasActiveAlert("inngest_server_down");
    if (!exists) {
      await createAlert({
        type: "inngest_server_down",
        severity: "critical",
        message:
          "pg-boss has 0 registered schedules — scheduler may not be running",
        details: `activeSchedules=${activeSchedules}`,
      });
    }
  } else {
    await resolveAlertsByType("inngest_server_down");
  }

  if (failedCount > 50) {
    const exists = await hasActiveAlert("inngest_function_failures");
    if (!exists) {
      await createAlert({
        type: "inngest_function_failures",
        severity: "warning",
        message: `${failedCount} failed jobs in pg-boss queue`,
        details: `failedCount=${failedCount}`,
      });
    }
  } else {
    await resolveAlertsByType("inngest_function_failures");
  }

  if (pendingCount > 500) {
    const exists = await hasActiveAlert("inngest_pipeline_stall");
    if (!exists) {
      await createAlert({
        type: "inngest_pipeline_stall",
        severity: "warning",
        message: `${pendingCount} pending jobs in pg-boss queue`,
        details: `pendingCount=${pendingCount}`,
      });
    }
  } else {
    await resolveAlertsByType("inngest_pipeline_stall");
  }
}

// ── northStarDailyReport ────────────────────────────────────────────────────
// Cron: "0 7 * * *" (daily 07:00 UTC)

export async function runNorthStarDailyReport(): Promise<void> {
  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM match_queue WHERE status = 'approved' AND evaluated_at > NOW() - INTERVAL '24 hours') AS approved_24h,
      (SELECT count(*) FROM match_queue WHERE status = 'approved' AND would_apply = true AND evaluated_at > NOW() - INTERVAL '24 hours') AS would_apply_24h,
      (SELECT count(*) FROM match_queue WHERE status = 'dismissed' AND evaluated_at > NOW() - INTERVAL '24 hours') AS dismissed_24h,
      (SELECT count(*) FROM match_queue WHERE status = 'approved' AND evaluated_at > NOW() - INTERVAL '7 days') AS approved_7d,
      (SELECT count(*) FROM job WHERE status = 'active') AS active_jobs,
      (SELECT count(*) FROM job WHERE status = 'active' AND normalized_at IS NOT NULL) AS normalized_jobs,
      (SELECT count(*) FROM job WHERE status = 'active' AND job_embedding IS NOT NULL) AS embedded_jobs
  `);

  const metrics = result.rows[0] as Record<string, string>;
  const report = {
    approved24h: Number(metrics.approved_24h),
    wouldApply24h: Number(metrics.would_apply_24h),
    dismissed24h: Number(metrics.dismissed_24h),
    approved7d: Number(metrics.approved_7d),
    activeJobs: Number(metrics.active_jobs),
    normalizedJobs: Number(metrics.normalized_jobs),
    embeddedJobs: Number(metrics.embedded_jobs),
    generatedAt: new Date().toISOString(),
  };

  console.info("[north-star-daily-report]", JSON.stringify(report));

  // Emit event for any downstream consumers
  await scheduler.send("north-star/daily", report);
}

// ── layoffSignalChecker ─────────────────────────────────────────────────────
// Cron: "0 8 * * *" (daily 08:00 UTC)

export async function runLayoffSignalChecker(): Promise<void> {
  const result = await checkLayoffSignals();

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "layoff_signal_checker",
    itemsProcessed: result.layoffsParsed,
    itemsInserted: 0,
    itemsUpdated: result.companiesDemoted,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── backupAlertHandler (event handler) ──────────────────────────────────────
// Event: "backup/failed", "backup/succeeded"

export async function runBackupAlertHandler(
  data: Record<string, unknown>,
): Promise<void> {
  const success = data.success as boolean;
  if (success) {
    console.info(
      `[backup-alert] Backup succeeded: uri=${data.gcsUri} sizeBytes=${data.sizeBytes} durationSec=${data.durationSeconds}`,
    );
  } else {
    console.error(
      `[backup-alert] Backup FAILED: reason=${data.reason} timestamp=${data.timestamp}`,
    );
    // Use storage_critical as the closest existing type for backup failures
    await createAlert({
      type: "storage_critical",
      severity: "critical",
      message: `Postgres backup failed: ${data.reason}`,
      details: JSON.stringify(data),
    });
  }
}

// ── resourceAlertHandler (event handler) ────────────────────────────────────
// Event: "resource/alert"

export async function runResourceAlertHandler(
  data: Record<string, unknown>,
): Promise<void> {
  const severity = data.severity as string;
  console.warn(
    `[resource-alert] severity=${severity} metric=${data.metric} value=${data.value} threshold=${data.threshold}`,
  );
  if (severity === "critical") {
    // Use storage_critical as the closest existing type for resource alerts
    await createAlert({
      type: "storage_critical",
      severity: "critical",
      message: `VPS resource alert: ${data.metric}=${data.value} (threshold ${data.threshold})`,
      details: JSON.stringify(data),
    });
  }
}
