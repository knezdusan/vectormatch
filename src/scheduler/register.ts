// D25: Scheduler registration — maps cron schedules and event handlers
// src/scheduler/register.ts
//
// Registers all pipeline functions with the pg-boss scheduler.
// Called from instrumentation.ts on server startup.
//
// This replaces the Inngest function registration in route.ts.
// Only the critical path functions are registered here. Non-critical
// functions (seeders, discovery, maintenance) remain on Inngest for now
// and will be migrated in a follow-up.

import {
  runBatchPollTier,
  runDirectJobBoardIngestion,
  runGate3Evaluation,
  runJobPipeline,
  runPendingQueueSweep,
} from "./pipeline";
import { scheduler } from "./scheduler";

/**
 * Register all critical-path pipeline functions with the scheduler.
 * Must be called before scheduler.start().
 */
export function registerPipelineFunctions(): void {
  // ── Cron-triggered functions ──────────────────────────────────────────────

  // Batch Poll Tier — every 3 hours (matches the old Inngest cron)
  scheduler.registerCron({
    id: "batch-poll-tier",
    name: "Batch Poll Tier",
    cron: "0 */3 * * *",
    handler: async () => {
      await runBatchPollTier("0 */3 * * *");
    },
  });

  // Direct Job Board Ingestion — every 3 hours (D26: increased from 6h
  // to 3h to poll remote-native boards harder, per the strategic inversion)
  scheduler.registerCron({
    id: "direct-job-board-ingestion",
    name: "Direct Job Board Ingestion",
    cron: "0 */3 * * *",
    handler: async () => {
      await runDirectJobBoardIngestion();
    },
  });

  // Pending Queue Sweep — every 2 hours (was daily at 6am in Inngest,
  // but the D24 report recommended more frequent sweeps)
  scheduler.registerCron({
    id: "pending-queue-sweep",
    name: "Pending Queue Sweep",
    cron: "0 */2 * * *",
    handler: async () => {
      await runPendingQueueSweep();
    },
  });

  // ── Event-triggered functions ─────────────────────────────────────────────

  // Gate 3 Evaluator — triggered by match/gate-3-evaluate events
  // Concurrency: 10 (matches the old Inngest concurrency limit)
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
    concurrency: 10,
    retries: 5,
  });

  // Job Ingested Handler — triggered by job/ingested events
  // Replaces the Inngest jobIngestedHandler. Runs the full pipeline:
  // normalize → embed → Gate 0.5 → Gate 1+2 → fan out Gate 3.
  // Emitted by: phalanxPoller (Inngest, re-routed), normalizationRetrySweep
  // (Inngest, re-routed), admin "re-trigger ingestion" action.
  scheduler.registerEvent({
    event: "job/ingested",
    name: "Job Ingested — Full Pipeline",
    handler: async (data) => {
      const { jobId } = data as { jobId: string };
      await runJobPipeline(jobId);
    },
    concurrency: 10,
    retries: 3,
  });

  console.info(
    "[scheduler] Registered pipeline functions (3 crons, 2 event handlers)",
  );
}
