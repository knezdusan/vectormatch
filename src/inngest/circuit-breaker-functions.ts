// v2 Corpus Expansion — Circuit Breaker Inngest Functions
// src/inngest/circuit-breaker-functions.ts
//
// Two Inngest functions that drive the 5-tier circuit breaker:
//   1. breakerCheck — hourly cron that evaluates all 5 tiers and applies actions
//   2. sourceBanRecoveryCheck — daily cron that recovers banned sources after 24hr
//
// ── breakerCheck Scheduling ──────────────────────────────────────────────────
// Per governing doc: "breakerCheck Inngest event scheduled at T+3hr via
// independent cron-linked event (not onComplete). Per-source breaker evaluates
// first; corpus-ratio evaluates second at same checkpoint via sequential
// Inngest steps."
//
// Implementation: hourly cron scans for jobs hitting the 3hr checkpoint
// (detectedAt BETWEEN now()-4hr AND now()-3hr). Within the function, per-source
// tiers (1, 2, 5) evaluate first, then corpus-wide tiers (3, 4) evaluate
// second — matching the governing doc's sequential order.
//
// See docs/governing/company-corpus-expansion-new.md Criterion 3.

import { inngest } from "@/inngest/client";

// ── breakerCheck — hourly cron evaluating 3hr checkpoints ────────────────────

/**
 * breakerCheck — evaluates the 5-tier circuit breaker every hour.
 *
 * Triggered by: cron (every hour, at minute 5 — avoids the top of the hour
 * where multiple cron functions cluster).
 *
 * Step graph (sequential, per governing doc):
 *   1. evaluate-breaker — fetch corpus + source metrics, evaluate all 5 tiers
 *   2. apply-actions — apply triggered actions (per-source first, then corpus)
 *   3. write-log — record the breaker evaluation result
 *
 * Per-source tiers (1, 2, 5) evaluate first within evaluateBreaker().
 * Corpus-wide tiers (3, 4) evaluate second. This matches the governing doc's
 * "Per-source breaker evaluates first; corpus-ratio evaluates second at same
 * checkpoint via sequential Inngest steps."
 *
 * The hourly cadence captures the T+3hr checkpoint in batches — any job with
 * detectedAt between now()-4hr and now()-3hr is at its 3hr checkpoint during
 * this run. Per-job onComplete scheduling would create one scheduled event per
 * provisional job and explode the Inngest execution budget.
 */
export const breakerCheck = inngest.createFunction(
  {
    id: "breaker-check",
    name: "Circuit Breaker Check (v2 5-Tier)",
    triggers: [{ cron: "5 * * * *" }], // every hour at :05
  },
  async ({ step }) => {
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    // ── Step 1: Evaluate all 5 tiers ────────────────────────────────────────
    // Per-source tiers (1, 2, 5) evaluate first, then corpus-wide tiers (3, 4).
    // This is the sequential order specified by the governing doc.
    const evaluation = await step.run("evaluate-breaker", async () => {
      const { evaluateBreaker } = await import("@/lib/jobs/circuit-breaker");
      return evaluateBreaker();
    });

    // ── Step 2: Apply triggered actions ─────────────────────────────────────
    // Actions are applied in tier order (1 → 2 → 3 → 4 → 5) so that the
    // severity stack resolves correctly (hard pause from a higher tier
    // suppresses rate reductions from lower tiers).
    const appliedCount = await step.run("apply-actions", async () => {
      const { applyBreakerActions } = await import(
        "@/lib/jobs/circuit-breaker"
      );
      await applyBreakerActions(evaluation);
      return evaluation.actions.length;
    });

    // ── Step 3: Write ingestion log ─────────────────────────────────────────
    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        status: "success",
        source: "breaker_check_v2",
        itemsProcessed: evaluation.evaluations.length,
        itemsInserted: 0,
        itemsUpdated: appliedCount,
        itemsRejected: 0,
        itemsSkipped: evaluation.evaluations.length - appliedCount,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return {
      dominantSeverity: evaluation.dominantSeverity,
      actionsTriggered: appliedCount,
      corpusMetrics: {
        globalCount: evaluation.corpusMetrics.globalCount,
        countryFencedCount: evaluation.corpusMetrics.countryFencedCount,
        unknownCount: evaluation.corpusMetrics.unknownCount,
        provisionalCount: evaluation.corpusMetrics.provisionalCount,
        knownScopeRatio: evaluation.corpusMetrics.knownScopeRatio,
        unknownSubFloorRatio: evaluation.corpusMetrics.unknownSubFloorRatio,
      },
    };
  },
);

// ── sourceBanRecoveryCheck — daily cron for banned source recovery ───────────

/**
 * sourceBanRecoveryCheck — recovers banned sources after their 24hr cooldown.
 *
 * Triggered by: cron (daily at 06:00 UTC — after tierRecalc at 04:00 and
 * qualityFlywheelRecalc at 04:30, before the daily source functions start
 * at 07:00).
 *
 * Per governing doc Tier 5: "24hr cooldown via daily Inngest cron
 * (sourceBanRecoveryCheck). On recovery: set source_status = 'degraded',
 * reset escalation_count = 0, run single-test retry. Success → 'healthy' +
 * resume. Fail → re-ban immediately."
 *
 * Step graph:
 *   1. recover-banned-sources — find banned sources past 24hr cooldown, recover
 *   2. write-log — record recovery result
 *
 * The "single-test retry" is implicit: the next ingestion cycle for the
 * recovered source serves as the test. If it fails, the per-source breaker
 * (Tier 1) will re-escalate and potentially re-ban via Tier 5.
 */
export const sourceBanRecoveryCheck = inngest.createFunction(
  {
    id: "source-ban-recovery-check",
    name: "Source Ban Recovery Check (v2 Tier 5)",
    triggers: [{ cron: "0 6 * * *" }], // daily at 06:00 UTC
  },
  async ({ step }) => {
    const { writeIngestionLog } = await import(
      "@/lib/jobs/poller/ingestion-log"
    );

    const startedAt = new Date();

    // ── Step 1: Recover banned sources past their 24hr cooldown ─────────────
    const recovered = await step.run("recover-banned-sources", async () => {
      const { recoverBannedSources } = await import(
        "@/lib/jobs/circuit-breaker"
      );
      return recoverBannedSources();
    });

    // ── Step 2: Write ingestion log ─────────────────────────────────────────
    await step.run("write-log", async () => {
      return writeIngestionLog({
        type: "tier_recalc",
        status: "success",
        source: "source_ban_recovery_v2",
        itemsProcessed: recovered.length,
        itemsInserted: 0,
        itemsUpdated: recovered.length,
        itemsRejected: 0,
        itemsSkipped: 0,
        startedAt,
        finishedAt: new Date(),
      });
    });

    return {
      recoveredSources: recovered,
      recoveredCount: recovered.length,
    };
  },
);
