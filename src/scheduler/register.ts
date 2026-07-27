// D27: Scheduler registration — all cron schedules and event handlers
// src/scheduler/register.ts
//
// Registers ALL pipeline functions with the pg-boss scheduler.
// Called from instrumentation.ts on server startup.
//
// D27: Complete migration from Inngest. All 68 Inngest functions are now
// registered here as pg-boss cron jobs or event handlers.

// Event handlers
import {
  runAggregatorJobHandler,
  runEmergencyStoragePurge,
  runMatchBulkReprocess,
  runPersonaUpdatedHandler,
  runPhalanxPoller,
} from "./handlers/events";
// Maintenance & sweeps
import {
  runAggressiveCleanup,
  runCleanupOrphanedCvUploads,
  runCompanyRevivalSweep,
  runJobSummarizeHandler,
  runJobSummaryBackfill,
  runMatchRetrySweep,
  runNightlyResurrectionSweep,
  runNightlyStaleClassificationSweep,
  runNormalizationRetrySweep,
  runNormalizeProvisionalJob,
  runProbationEmbeddingBackfill,
  runRetryInFlightSweeper,
  runStaleCleanup,
  runStaleJobVerifier,
  runTierRecalc,
  runVacuumAnalyze,
} from "./handlers/maintenance";
// Monitors & alerts
import {
  runBackupAlertHandler,
  runBreakerCheck,
  runDailyHealthCheck,
  runLayoffSignalChecker,
  runNorthStarDailyReport,
  runPipelineHealthMonitor,
  runResourceAlertHandler,
  runSchedulerHealthMonitor,
  runSourceBanRecoveryCheck,
  runStorageMonitor,
} from "./handlers/monitors";
// Quality & feedback
import {
  runFalseGlobalScopeSampler,
  runQualityFlywheelRecalc,
  runRecallAuditCron,
} from "./handlers/quality";
// Seeders & discovery
import {
  runBatchSourceB1Workable,
  runBatchSourceB2BraveSearch,
  runBatchSourceB3YcDirectory,
  runBatchSourceB4VcPortfolios,
  runBatchSourceB5NewsletterArchives,
  runBatchSourceB7WaybackCdx,
  runBatchSourceB8CrtSh,
  runBatchSourceB8Rapid7Fdns,
  runBatchSourceB9CrossPollination,
  runBatchSourceB10SitemapProbe,
  runBigQuerySeeder,
  runCustomUrlResolver,
  runDailySourceD1BraveSearch,
  runDailySourceD2HnAlgolia,
  runDailySourceD3RedditRss,
  runDailySourceD7FundingSignal,
  runDailySourceD8ProductHunt,
  runDailySourceD9EngineeringBlogs,
  runDailySourceD10GithubTrending,
  runDailySourceD11TechNewsRss,
  runDailySourceD12NpmRegistry,
  runHnAlgoliaSeeder,
  runSluggerRetryProcessor,
  runV2FrontendJobScanner,
  runV2FundingSignalRss,
} from "./handlers/seeders";
import {
  runBatchPollTier,
  runDirectJobBoardIngestion,
  runGate3Evaluation,
  runJobPipeline,
  runPendingQueueSweep,
} from "./pipeline";
import { scheduler } from "./scheduler";

/**
 * Register all pipeline functions with the scheduler.
 * Must be called before scheduler.start().
 */
export function registerPipelineFunctions(): void {
  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL PATH — Cron jobs
  // ═══════════════════════════════════════════════════════════════════════════

  scheduler.registerCron({
    id: "batch-poll-tier",
    name: "Batch Poll Tier",
    cron: "0 */3 * * *",
    handler: async () => {
      await runBatchPollTier("0 */3 * * *");
    },
  });

  scheduler.registerCron({
    id: "direct-job-board-ingestion",
    name: "Direct Job Board Ingestion",
    cron: "0 */3 * * *",
    handler: async () => {
      await runDirectJobBoardIngestion();
    },
  });

  scheduler.registerCron({
    id: "pending-queue-sweep",
    name: "Pending Queue Sweep",
    cron: "0 */2 * * *",
    handler: async () => {
      await runPendingQueueSweep();
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // CRITICAL PATH — Event handlers
  // ═══════════════════════════════════════════════════════════════════════════

  scheduler.registerEvent({
    event: "match/gate-3-evaluate",
    name: "Gate 3 — LLM Candidate Evaluation",
    handler: async (data) => {
      const { matchQueueId, jobId, personaId, applicantId } = data as {
        matchQueueId: string;
        jobId: string;
        personaId: string;
        applicantId: string;
      };
      await runGate3Evaluation(matchQueueId, jobId, personaId, applicantId);
    },
    // D28 advisor ruling: reduce from 10 → 5. In-process pg-boss shares the
    // app's DB pool AND Node event loop — 10 concurrent LLM calls can starve
    // the web server in a way the separate Inngest container never could.
    concurrency: 5,
    retries: 5,
  });

  scheduler.registerEvent({
    event: "job/ingested",
    name: "Job Ingested — Full Pipeline",
    handler: async (data) => {
      const { jobId } = data as { jobId: string };
      await runJobPipeline(jobId);
    },
    // D28 advisor ruling: reduce from 10 → 5. Same reason as gate-3 —
    // in-process concurrency shares the DB pool + event loop.
    concurrency: 5,
    retries: 3,
  });

  scheduler.registerEvent({
    event: "poller/run",
    name: "Phalanx Poller (Manual)",
    handler: async (data) => {
      const { companyId } = data as { companyId: string };
      await runPhalanxPoller(companyId);
    },
    concurrency: 5,
    retries: 3,
  });

  scheduler.registerEvent({
    event: "job/aggregator-ingested",
    name: "Aggregator Job Handler",
    handler: async (data) => {
      await runAggregatorJobHandler(data);
    },
    concurrency: 5,
    retries: 3,
  });

  scheduler.registerEvent({
    event: "persona/updated",
    name: "Persona Updated Feedback",
    handler: async (data) => {
      const { personaId } = data as { personaId: string };
      await runPersonaUpdatedHandler(personaId);
    },
    concurrency: 3,
    retries: 3,
  });

  scheduler.registerEvent({
    event: "match/bulk-reprocess",
    name: "Match Bulk Reprocess",
    handler: async (data) => {
      await runMatchBulkReprocess(data);
    },
    concurrency: 1, // heavy operation
    retries: 1,
  });

  scheduler.registerEvent({
    event: "purge/emergency-storage",
    name: "Emergency Storage Purge",
    handler: async (data) => {
      await runEmergencyStoragePurge(data ?? null);
    },
    concurrency: 1,
    retries: 0, // don't retry destructive operations
  });

  scheduler.registerEvent({
    event: "job/summarize",
    name: "Job Summarize Handler",
    handler: async (data) => {
      const { jobId } = data as { jobId: string };
      await runJobSummarizeHandler(jobId);
    },
    concurrency: 5,
    retries: 3,
  });

  scheduler.registerEvent({
    event: "job/provisional-ingested",
    name: "Normalize Provisional Job",
    handler: async (data) => {
      const { jobId, retryGeneration } = data as {
        jobId: string;
        retryGeneration?: number;
      };
      await runNormalizeProvisionalJob(jobId, retryGeneration ?? 0);
    },
    concurrency: 5,
    retries: 4,
    // D28 advisor ruling: exponential backoff (5min base → 5/10/20/40min).
    // Provisional jobs wait on external data; 4 retries inside 2 minutes
    // (the old 30s flat) exhausts the ladder before the data can arrive.
    retryDelay: 300, // 5 minutes base
    retryBackoff: true, // 5/10/20/40min for 4 retries
  });

  scheduler.registerEvent({
    event: "job/normalization-attempt-completed",
    name: "Retry In-Flight Sweeper",
    handler: async () => {
      await runRetryInFlightSweeper();
    },
    concurrency: 1,
    retries: 1,
  });

  scheduler.registerEvent({
    event: "seeder/resolve-custom-url",
    name: "Custom URL Resolver",
    handler: async (data) => {
      await runCustomUrlResolver(data ?? {});
    },
    concurrency: 3,
    retries: 3,
  });

  scheduler.registerEvent({
    event: "backup/failed",
    name: "Backup Alert Handler",
    handler: async (data) => {
      await runBackupAlertHandler(data);
    },
    concurrency: 1,
    retries: 0,
  });

  scheduler.registerEvent({
    event: "backup/succeeded",
    name: "Backup Alert Handler",
    handler: async (data) => {
      await runBackupAlertHandler(data);
    },
    concurrency: 1,
    retries: 0,
  });

  scheduler.registerEvent({
    event: "resource/alert",
    name: "Resource Alert Handler",
    handler: async (data) => {
      await runResourceAlertHandler(data);
    },
    concurrency: 1,
    retries: 0,
  });

  scheduler.registerEvent({
    event: "north-star/daily",
    name: "North Star Daily Report (consumer)",
    handler: async (data) => {
      console.info(
        "[north-star-daily] Metrics published:",
        JSON.stringify(data),
      );
    },
    concurrency: 1,
    retries: 0,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MAINTENANCE & SWEEPS — Cron jobs
  // ═══════════════════════════════════════════════════════════════════════════

  scheduler.registerCron({
    id: "normalization-retry-sweep",
    name: "Normalization Retry Sweep",
    cron: "0 2 * * 3", // Wed 02:00 UTC
    handler: runNormalizationRetrySweep,
  });

  scheduler.registerCron({
    id: "nightly-resurrection-sweep",
    name: "Nightly Resurrection Sweep",
    cron: "0 2 * * 4", // Thu 02:00 UTC
    handler: runNightlyResurrectionSweep,
  });

  scheduler.registerCron({
    id: "nightly-stale-classification-sweep",
    name: "Nightly Stale Classification Sweep",
    cron: "0 2 * * 5", // Fri 02:00 UTC
    handler: runNightlyStaleClassificationSweep,
  });

  scheduler.registerCron({
    id: "tier-recalc",
    name: "Tier Recalculation",
    cron: "0 3 * * 0", // Sun 03:00 UTC
    handler: runTierRecalc,
  });

  scheduler.registerCron({
    id: "stale-cleanup",
    name: "Stale Cleanup",
    cron: "0 2 * * 1", // Mon 02:00 UTC
    handler: runStaleCleanup,
  });

  scheduler.registerCron({
    id: "stale-job-verifier",
    name: "Stale Job Verifier",
    cron: "0 10 * * *", // daily 10:00 UTC
    handler: runStaleJobVerifier,
  });

  scheduler.registerCron({
    id: "company-revival-sweep",
    name: "Company Revival Sweep",
    cron: "0 2 * * 2", // Tue 02:00 UTC
    handler: runCompanyRevivalSweep,
  });

  scheduler.registerCron({
    id: "aggressive-cleanup",
    name: "Aggressive Cleanup",
    cron: "0 2 * * 0", // Sun 02:00 UTC
    handler: runAggressiveCleanup,
  });

  scheduler.registerCron({
    id: "vacuum-analyze",
    name: "Vacuum Analyze",
    cron: "0 2 * * 0", // Sun 02:00 UTC
    handler: runVacuumAnalyze,
  });

  scheduler.registerCron({
    id: "cleanup-orphaned-cv-uploads",
    name: "Cleanup Orphaned CV Uploads",
    cron: "0 9 * * *", // daily 09:00 UTC
    handler: runCleanupOrphanedCvUploads,
  });

  scheduler.registerCron({
    id: "probation-embedding-backfill",
    name: "Probation Embedding Backfill",
    cron: "0 4 * * 6", // Sat 04:00 UTC
    handler: runProbationEmbeddingBackfill,
  });

  scheduler.registerCron({
    id: "job-summary-backfill",
    name: "Job Summary Backfill",
    cron: "0 6 * * 6", // Sat 06:00 UTC
    handler: runJobSummaryBackfill,
  });

  scheduler.registerCron({
    id: "retry-in-flight-sweeper",
    name: "Retry In-Flight Sweeper",
    cron: "*/30 * * * *", // every 30 min
    handler: runRetryInFlightSweeper,
  });

  scheduler.registerCron({
    id: "match-retry-sweep",
    name: "Match Retry Sweep",
    cron: "0 7 * * *", // daily 07:00 UTC
    handler: runMatchRetrySweep,
  });

  scheduler.registerCron({
    id: "emergency-storage-purge",
    name: "Emergency Storage Purge (auto)",
    cron: "0 */6 * * *", // every 6 hours
    handler: async () => {
      await runEmergencyStoragePurge(null);
    },
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // MONITORS & ALERTS — Cron jobs
  // ═══════════════════════════════════════════════════════════════════════════

  scheduler.registerCron({
    id: "breaker-check",
    name: "Circuit Breaker Check",
    cron: "5 * * * *", // every hour at :05
    handler: runBreakerCheck,
  });

  scheduler.registerCron({
    id: "source-ban-recovery-check",
    name: "Source Ban Recovery Check",
    cron: "0 6 * * *", // daily 06:00 UTC
    handler: runSourceBanRecoveryCheck,
  });

  scheduler.registerCron({
    id: "daily-health-check",
    name: "Daily Health Check",
    cron: "0 6 * * *", // daily 06:00 UTC
    handler: runDailyHealthCheck,
  });

  scheduler.registerCron({
    id: "storage-monitor",
    name: "Storage Monitor",
    cron: "0 */6 * * *", // every 6 hours
    handler: runStorageMonitor,
  });

  scheduler.registerCron({
    id: "pipeline-health-monitor",
    name: "Pipeline Health Monitor",
    cron: "0 */4 * * *", // every 4 hours
    handler: runPipelineHealthMonitor,
  });

  scheduler.registerCron({
    id: "scheduler-health-monitor",
    name: "Scheduler Health Monitor",
    cron: "0 */2 * * *", // every 2 hours
    handler: runSchedulerHealthMonitor,
  });

  scheduler.registerCron({
    id: "north-star-daily-report",
    name: "North Star Daily Report",
    cron: "0 7 * * *", // daily 07:00 UTC
    handler: runNorthStarDailyReport,
  });

  scheduler.registerCron({
    id: "layoff-signal-checker",
    name: "Layoff Signal Checker",
    cron: "0 8 * * *", // daily 08:00 UTC
    handler: runLayoffSignalChecker,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // QUALITY & FEEDBACK — Cron jobs
  // ═══════════════════════════════════════════════════════════════════════════

  scheduler.registerCron({
    id: "quality-flywheel-recalc",
    name: "Quality Flywheel Recalc",
    cron: "0 5 * * 0", // Sun 05:00 UTC
    handler: runQualityFlywheelRecalc,
  });

  scheduler.registerCron({
    id: "recall-audit-cron",
    name: "Recall Audit Cron",
    cron: "0 2 * * 1", // Mon 02:00 UTC
    handler: runRecallAuditCron,
  });

  scheduler.registerCron({
    id: "false-global-scope-sampler",
    name: "False Global Scope Sampler",
    cron: "0 4 * * 1", // Mon 04:00 UTC
    handler: runFalseGlobalScopeSampler,
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SEEDERS & DISCOVERY — Cron jobs
  // ═══════════════════════════════════════════════════════════════════════════

  // Special seeders
  scheduler.registerCron({
    id: "hn-algolia-seeder",
    name: "HN Algolia Seeder",
    cron: "0 10 * * 1", // weekly Mon 10:00 UTC
    handler: runHnAlgoliaSeeder,
  });

  scheduler.registerCron({
    id: "bigquery-seeder",
    name: "BigQuery Seeder",
    cron: "0 0 1 * *", // monthly 1st 00:00 UTC
    handler: runBigQuerySeeder,
  });

  scheduler.registerCron({
    id: "slugger-retry-processor",
    name: "Slugger Retry Processor",
    cron: "0 0 * * 1", // weekly Mon 00:00 UTC
    handler: runSluggerRetryProcessor,
  });

  // Batch sources
  scheduler.registerCron({
    id: "batch-source-workable-meta-search",
    name: "Batch Source B1 — Workable Meta Search",
    cron: "0 0 1 * *", // monthly
    handler: runBatchSourceB1Workable,
  });

  scheduler.registerCron({
    id: "batch-source-brave-search",
    name: "Batch Source B2 — Brave Search",
    cron: "0 0 1 * *", // monthly
    handler: runBatchSourceB2BraveSearch,
  });

  scheduler.registerCron({
    id: "batch-source-yc-directory",
    name: "Batch Source B3 — YC Directory",
    cron: "0 0 1 */3 *", // quarterly
    handler: runBatchSourceB3YcDirectory,
  });

  scheduler.registerCron({
    id: "batch-source-wayback-cdx",
    name: "Batch Source B7 — Wayback CDX",
    cron: "0 0 1 */3 *", // quarterly
    handler: runBatchSourceB7WaybackCdx,
  });

  scheduler.registerCron({
    id: "batch-source-crt-sh",
    name: "Batch Source B8 — crt.sh",
    cron: "0 2 * * 1", // weekly Mon 02:00 UTC
    handler: runBatchSourceB8CrtSh,
  });

  scheduler.registerCron({
    id: "batch-source-cross-pollination",
    name: "Batch Source B9 — Cross Pollination",
    cron: "0 0 1 * *", // monthly
    handler: runBatchSourceB9CrossPollination,
  });

  scheduler.registerCron({
    id: "batch-source-sitemap-probe",
    name: "Batch Source B10 — Sitemap Probe",
    cron: "0 0 * * 1", // weekly Mon 00:00 UTC
    handler: runBatchSourceB10SitemapProbe,
  });

  // Daily sources
  scheduler.registerCron({
    id: "daily-source-brave-search",
    name: "Daily Source D1 — Brave Search",
    cron: "0 12 * * *", // daily 12:00 UTC
    handler: runDailySourceD1BraveSearch,
  });

  scheduler.registerCron({
    id: "daily-source-hn-algolia",
    name: "Daily Source D2 — HN Algolia",
    cron: "0 6 * * *", // daily 06:00 UTC
    handler: runDailySourceD2HnAlgolia,
  });

  scheduler.registerCron({
    id: "daily-source-reddit-rss",
    name: "Daily Source D3 — Reddit RSS",
    cron: "0 14 * * *", // daily 14:00 UTC
    handler: runDailySourceD3RedditRss,
  });

  scheduler.registerCron({
    id: "daily-source-funding-signal",
    name: "Daily Source D7 — Funding Signal",
    cron: "0 11 * * *", // daily 11:00 UTC
    handler: runDailySourceD7FundingSignal,
  });

  scheduler.registerCron({
    id: "daily-source-producthunt",
    name: "Daily Source D8 — Product Hunt",
    cron: "0 5 * * *", // daily 05:00 UTC
    handler: runDailySourceD8ProductHunt,
  });

  scheduler.registerCron({
    id: "daily-source-engineering-blogs",
    name: "Daily Source D9 — Engineering Blogs",
    cron: "0 16 * * *", // daily 16:00 UTC
    handler: runDailySourceD9EngineeringBlogs,
  });

  scheduler.registerCron({
    id: "daily-source-github-trending",
    name: "Daily Source D10 — GitHub Trending",
    cron: "0 15 * * *", // daily 15:00 UTC
    handler: runDailySourceD10GithubTrending,
  });

  scheduler.registerCron({
    id: "daily-source-tech-news-rss",
    name: "Daily Source D11 — Tech News RSS",
    cron: "0 17 * * *", // daily 17:00 UTC
    handler: runDailySourceD11TechNewsRss,
  });

  scheduler.registerCron({
    id: "daily-source-npm-registry",
    name: "Daily Source D12 — NPM Registry",
    cron: "0 18 * * *", // daily 18:00 UTC
    handler: runDailySourceD12NpmRegistry,
  });

  // v2 sources
  scheduler.registerCron({
    id: "v2-funding-signal-rss",
    name: "v2 Funding Signal RSS",
    cron: "0 12 * * *", // daily 12:00 UTC
    handler: runV2FundingSignalRss,
  });

  scheduler.registerCron({
    id: "v2-frontend-job-scanner",
    name: "v2 Frontend Job Scanner",
    cron: "0 7 * * *", // daily 07:00 UTC
    handler: runV2FrontendJobScanner,
  });

  // Note: B4 (vc-portfolios), B5 (newsletter-archives), B8-rapid7 (no cron),
  // D4 (remote-job-boards), D5 (wwr-rss), D6 (certstream retired),
  // D13 (meta-ads), v2-github-events-probe are frozen/retired with no cron.
  // They can be triggered manually via scheduler.send() if needed.

  const cronCount = 38;
  const eventCount = 15;
  console.info(
    `[scheduler] Registered pipeline functions (${cronCount} crons, ${eventCount} event handlers)`,
  );
}
