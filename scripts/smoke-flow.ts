/**
 * FLOW SMOKE TEST (D25) — Delta assertions over a triggered pipeline run.
 *
 * Unlike smoke-e2e.ts which checks 24h deltas passively, this script:
 * 1. Captures a baseline snapshot of all pipeline stage counters
 * 2. Triggers the pipeline manually (batch poll + pending sweep)
 * 3. Waits for the pipeline to process
 * 4. Captures a post-run snapshot
 * 5. Asserts that at least ONE stage advanced (delta > 0)
 *
 * This proves the pipeline is functionally alive — not just that it
 * produced output sometime in the last 24 hours.
 *
 * Usage:
 *   npx tsx scripts/smoke-flow.ts                    # local (needs DATABASE_URL)
 *   docker exec <app-container> node /app/scripts/smoke-flow.js  # on VPS
 *
 * Exit code 0 = flow confirmed, 1 = pipeline is stalled.
 */

import { Client } from "pg";

interface StageSnapshot {
  totalJobs: number;
  normalizedJobs: number;
  embeddedJobs: number;
  matchQueueTotal: number;
  matchQueueApproved: number;
  matchQueuePending: number;
  matchQueueRejected: number;
  globalUnfencedJobs: number;
  dashboardVisible: number;
  pgbossQueued: number;
  pgbossCompleted: number;
  pgbossFailed: number;
}

async function captureSnapshot(client: Client): Promise<StageSnapshot> {
  const [jobs, mq, dash, pgboss] = await Promise.all([
    client.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE normalized_at IS NOT NULL)::int AS normalized,
        count(*) FILTER (WHERE job_embedding IS NOT NULL)::int AS embedded,
        count(*) FILTER (WHERE status='active' AND remote_scope='global'
                         AND is_fenced=false AND is_natsec=false
                         AND is_qa=false AND job_embedding IS NOT NULL)::int AS global_unfenced
      FROM job
    `),
    client.query(`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status='approved')::int AS approved,
        count(*) FILTER (WHERE status='pending')::int AS pending,
        count(*) FILTER (WHERE status='rejected')::int AS rejected
      FROM match_queue
    `),
    client.query(`
      SELECT count(*)::int AS cnt
      FROM match_queue mq
      INNER JOIN job j ON mq.job_id = j.id
      WHERE j.remote_scope='global' AND j.is_fenced=false
        AND j.is_natsec=false AND j.is_qa=false
        AND mq.status='approved'
    `),
    // pg-boss queue stats (if the schema exists)
    client
      .query(`
      SELECT
        count(*) FILTER (WHERE state='created')::int AS queued,
        count(*) FILTER (WHERE state='completed')::int AS completed,
        count(*) FILTER (WHERE state='failed')::int AS failed
      FROM pgboss.job
    `)
      .catch(() => ({ rows: [{ queued: 0, completed: 0, failed: 0 }] })),
  ]);

  return {
    totalJobs: jobs.rows[0].total,
    normalizedJobs: jobs.rows[0].normalized,
    embeddedJobs: jobs.rows[0].embedded,
    matchQueueTotal: mq.rows[0].total,
    matchQueueApproved: mq.rows[0].approved,
    matchQueuePending: mq.rows[0].pending,
    matchQueueRejected: mq.rows[0].rejected,
    globalUnfencedJobs: jobs.rows[0].global_unfenced,
    dashboardVisible: dash.rows[0].cnt,
    pgbossQueued: pgboss.rows[0].queued,
    pgbossCompleted: pgboss.rows[0].completed,
    pgbossFailed: pgboss.rows[0].failed,
  };
}

function computeDelta(
  before: StageSnapshot,
  after: StageSnapshot,
): Record<string, number> {
  return {
    totalJobs: after.totalJobs - before.totalJobs,
    normalizedJobs: after.normalizedJobs - before.normalizedJobs,
    embeddedJobs: after.embeddedJobs - before.embeddedJobs,
    matchQueueTotal: after.matchQueueTotal - before.matchQueueTotal,
    matchQueueApproved: after.matchQueueApproved - before.matchQueueApproved,
    matchQueuePending: after.matchQueuePending - before.matchQueuePending,
    matchQueueRejected: after.matchQueueRejected - before.matchQueueRejected,
    globalUnfencedJobs: after.globalUnfencedJobs - before.globalUnfencedJobs,
    dashboardVisible: after.dashboardVisible - before.dashboardVisible,
    pgbossQueued: after.pgbossQueued - before.pgbossQueued,
    pgbossCompleted: after.pgbossCompleted - before.pgbossCompleted,
    pgbossFailed: after.pgbossFailed - before.pgbossFailed,
  };
}

async function main() {
  console.log("FLOW SMOKE TEST (D25)");
  console.log("=====================");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(
    `DB: ${process.env.DATABASE_URL ? "connected" : "NO DATABASE_URL — will fail"}`,
  );
  console.log("");

  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── Phase 1: Capture baseline ──────────────────────────────────────────
  console.log("Phase 1: Capturing baseline snapshot...");
  const before = await captureSnapshot(client);
  console.log("  Baseline:", JSON.stringify(before, null, 2));
  console.log("");

  // ── Phase 2: Trigger the pipeline ──────────────────────────────────────
  console.log("Phase 2: Triggering pipeline...");
  console.log("  → Running batch poll tier (active)...");
  try {
    const { runBatchPollTier } = await import("../src/scheduler/pipeline");
    const pollResult = await runBatchPollTier("0 */3 * * *");
    console.log("  → Batch poll result:", JSON.stringify(pollResult));
  } catch (e) {
    console.error("  → Batch poll failed:", e instanceof Error ? e.message : e);
  }

  console.log("  → Running pending queue sweep...");
  try {
    const { runPendingQueueSweep } = await import("../src/scheduler/pipeline");
    const sweepResult = await runPendingQueueSweep();
    console.log("  → Pending sweep result:", JSON.stringify(sweepResult));
  } catch (e) {
    console.error(
      "  → Pending sweep failed:",
      e instanceof Error ? e.message : e,
    );
  }
  console.log("");

  // ── Phase 3: Wait for Gate 3 evaluations to complete ───────────────────
  // Gate 3 runs asynchronously via pg-boss. Wait up to 60 seconds.
  console.log("Phase 3: Waiting for Gate 3 evaluations (up to 60s)...");
  const waitStart = Date.now();
  const WAIT_MS = 60000;
  const POLL_MS = 5000;

  while (Date.now() - waitStart < WAIT_MS) {
    const pending = await client.query(`
      SELECT count(*)::int AS cnt FROM match_queue
      WHERE status='pending' AND created_at > now() - interval '5 minutes'
    `);
    const pendingCount = pending.rows[0].cnt;
    if (pendingCount === 0) {
      console.log(
        `  All pending matches resolved (${Math.round((Date.now() - waitStart) / 1000)}s)`,
      );
      break;
    }
    console.log(
      `  ${pendingCount} pending matches, waiting ${POLL_MS / 1000}s...`,
    );
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log("");

  // ── Phase 4: Capture post-run snapshot ─────────────────────────────────
  console.log("Phase 4: Capturing post-run snapshot...");
  const after = await captureSnapshot(client);
  console.log("  Post-run:", JSON.stringify(after, null, 2));
  console.log("");

  // ── Phase 5: Compute deltas and assert ─────────────────────────────────
  console.log("Phase 5: Delta Analysis");
  const delta = computeDelta(before, after);

  const stages: Array<{ name: string; delta: number; required: boolean }> = [
    { name: "ingestion", delta: delta.totalJobs, required: false },
    { name: "normalization", delta: delta.normalizedJobs, required: false },
    { name: "embedding", delta: delta.embeddedJobs, required: false },
    { name: "gate-1-2-routing", delta: delta.matchQueueTotal, required: false },
    {
      name: "gate-3-evaluation",
      delta: delta.matchQueueApproved + delta.matchQueueRejected,
      required: false,
    },
    {
      name: "dashboard-visible",
      delta: delta.dashboardVisible,
      required: false,
    },
  ];

  let anyAdvanced = false;
  for (const stage of stages) {
    const status = stage.delta > 0 ? "ADVANCED" : "FLAT";
    const icon = stage.delta > 0 ? "▲" : "▶";
    console.log(`  ${icon} ${stage.name}: ${status} (delta=${stage.delta})`);
    if (stage.delta > 0) anyAdvanced = true;
  }

  // pg-boss queue health
  console.log("");
  console.log("pg-boss Queue Health:");
  console.log(`  Queued: ${after.pgbossQueued} (delta=${delta.pgbossQueued})`);
  console.log(
    `  Completed: ${after.pgbossCompleted} (delta=${delta.pgbossCompleted})`,
  );
  console.log(`  Failed: ${after.pgbossFailed} (delta=${delta.pgbossFailed})`);

  await client.end();

  // ── Verdict ────────────────────────────────────────────────────────────
  console.log("");
  console.log("=====================");
  console.log("FLOW SMOKE TEST — VERDICT");
  console.log("=====================");

  if (anyAdvanced) {
    const advanced = stages.filter((s) => s.delta > 0).map((s) => s.name);
    console.log(
      `  PASS — Pipeline is alive. Advanced stages: ${advanced.join(", ")}`,
    );
    process.exit(0);
  } else {
    console.log("  FAIL — Pipeline is stalled. No stage advanced.");
    console.log("");
    console.log("  Possible causes:");
    console.log(
      "    1. No new jobs to poll (all companies already polled recently)",
    );
    console.log("    2. All polled jobs are fenced/probation (no embedding)");
    console.log("    3. No persona matches (Gate 1+2 returned 0 candidates)");
    console.log("    4. Gate 3 evaluator not running (pg-boss not started)");
    console.log("    5. Database connection issues");
    console.log("");
    console.log("  Check:");
    console.log(
      "    - pg-boss queue: SELECT state, count(*) FROM pgboss.job GROUP BY state",
    );
    console.log(
      "    - Recent ingestion: SELECT count(*) FROM job WHERE detected_at > now() - interval '1 hour'",
    );
    console.log(
      "    - Pending matches: SELECT count(*) FROM match_queue WHERE status='pending'",
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
