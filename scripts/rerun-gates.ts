#!/usr/bin/env tsx
// Re-run Gate 1+2 for existing normalized+embedded jobs — emits Gate 3 events
// scripts/rerun-gates.ts
//
// After changing GATE2_MAX_COSINE_DISTANCE, the 3-Gate funnel needs to re-run
// for jobs that were already processed (normalizedAt set) but produced 0
// match_queue candidates due to the old threshold. The jobIngestedHandler's
// idempotency guard skips jobs where normalizedAt IS NOT NULL, so re-emitting
// job/ingested events won't work.
//
// This script bypasses the Inngest handler and directly:
//   1. Runs a bulk Gate 1+2 SQL query for ALL active+embedded jobs at once,
//      using the stored job_embedding column directly (no JS round-trip)
//   2. Emits match/gate-3-evaluate events for each candidate via the Inngest client
//
// Requires:
//   - DATABASE_URL environment variable (Neon pooler connection string)
//   - INNGEST_EVENT_KEY environment variable (real Inngest Cloud event key)
//   - INNGEST_DEV must NOT be set (or set to 0) so events go to Inngest Cloud
//
// Usage:
//   INNGEST_EVENT_KEY=<your-real-key> npx tsx scripts/rerun-gates.ts
//
// Expected outcome:
//   - match_queue populated with candidates for all active jobs
//   - match/gate-3-evaluate events sent to Inngest Cloud for each candidate
//   - Gate 3 LLM arbitration runs automatically via the gate3Evaluator function

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { inngest } from "@/inngest/client";
import {
  GATE_ROUTER_LIMIT,
  GATE1_WEIGHT,
  GATE2_MAX_COSINE_DISTANCE,
  GATE2_WEIGHT,
} from "@/lib/jobs/matching-config";

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log(
    "Re-run Gate 1+2 — VectorMatch Module C (threshold recalibration)",
  );
  console.log("=".repeat(70));
  console.log();

  // ── Validate environment ──────────────────────────────────────────────────
  if (process.env.INNGEST_DEV === "1") {
    console.error(
      "ERROR: INNGEST_DEV=1 is set — events will go to localhost, not Inngest Cloud.",
    );
    console.error(
      "Unset INNGEST_DEV or set it to 0 before running this script.",
    );
    process.exit(1);
  }

  if (
    !process.env.INNGEST_EVENT_KEY ||
    process.env.INNGEST_EVENT_KEY === "dev-dummy-key"
  ) {
    console.error(
      "ERROR: INNGEST_EVENT_KEY is not set or is the dummy dev key.",
    );
    console.error(
      "Set it to your real Inngest Cloud event key:\n" +
        "  INNGEST_EVENT_KEY=<key> npx tsx scripts/rerun-gates.ts",
    );
    process.exit(1);
  }

  console.log(
    `Threshold: GATE2_MAX_COSINE_DISTANCE = ${GATE2_MAX_COSINE_DISTANCE}`,
  );
  console.log(`Weights:   GATE1=${GATE1_WEIGHT}  GATE2=${GATE2_WEIGHT}`);
  console.log(`Limit:     GATE_ROUTER_LIMIT = ${GATE_ROUTER_LIMIT}`);
  console.log();

  // ── Bulk Gate 1+2 query ───────────────────────────────────────────────────
  // This query processes ALL active+embedded jobs in a single SQL statement.
  // It uses the stored job_embedding column directly (no JS round-trip), and
  // inserts candidates into match_queue with ON CONFLICT DO NOTHING for
  // idempotency (safe to re-run).
  console.log("Running bulk Gate 1+2 for all active+embedded jobs...");
  const startedAt = Date.now();

  const result = await db.execute(sql`
    INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
    SELECT
      j.id,
      p.id,
      p.applicant_id,
      ov.overlap_score,
      (p.persona_embedding <=> j.job_embedding) AS cosine_distance,
      'pending'
    FROM job j
    CROSS JOIN persona p
    CROSS JOIN LATERAL (
      SELECT count(*) AS overlap_score
      FROM unnest(p.must_have_tags) AS t(tag)
      WHERE t.tag = ANY(j.extracted_tags)
    ) ov
    WHERE
      j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND p.persona_embedding IS NOT NULL
      AND p.must_have_tags && j.extracted_tags
      AND NOT (p.blocklist_tags && j.extracted_tags)
      AND (p.persona_embedding <=> j.job_embedding) < ${GATE2_MAX_COSINE_DISTANCE}::real
    ORDER BY
      j.id,
      (
        ov.overlap_score * ${GATE1_WEIGHT}::real
        + (1 - (p.persona_embedding <=> j.job_embedding)) * ${GATE2_WEIGHT}::real
      ) DESC
    ON CONFLICT (job_id, persona_id) DO NOTHING
    RETURNING id, job_id, persona_id, applicant_id, overlap_score, cosine_distance
  `);

  const candidates = result.rows as {
    id: string;
    job_id: string;
    persona_id: string;
    applicant_id: string;
    overlap_score: number;
    cosine_distance: number;
  }[];

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log();
  console.log("=".repeat(70));
  console.log("Gate 1+2 Summary");
  console.log("=".repeat(70));
  console.log(`  Candidates inserted:   ${candidates.length}`);
  console.log(`  Elapsed:               ${elapsed}s`);

  if (candidates.length > 0) {
    const jobsWithMatches = new Set(candidates.map((c) => c.job_id)).size;
    const avgOverlap =
      candidates.reduce((s, c) => s + Number(c.overlap_score), 0) /
      candidates.length;
    const avgDistance =
      candidates.reduce((s, c) => s + Number(c.cosine_distance), 0) /
      candidates.length;
    const minDistance = Math.min(
      ...candidates.map((c) => Number(c.cosine_distance)),
    );
    const maxDistance = Math.max(
      ...candidates.map((c) => Number(c.cosine_distance)),
    );

    console.log(`  Jobs with matches:     ${jobsWithMatches}`);
    console.log(`  Avg overlap score:     ${avgOverlap.toFixed(2)}`);
    console.log(`  Avg cosine distance:   ${avgDistance.toFixed(4)}`);
    console.log(`  Min cosine distance:   ${minDistance.toFixed(4)}`);
    console.log(`  Max cosine distance:   ${maxDistance.toFixed(4)}`);
  }

  console.log();

  if (candidates.length === 0) {
    console.log(
      "No candidates passed Gate 1+2. Check threshold and tag overlap.",
    );
    process.exit(0);
  }

  // ── Emit Gate 3 events to Inngest Cloud ───────────────────────────────────
  console.log("=".repeat(70));
  console.log("Emitting Gate 3 events to Inngest Cloud...");
  console.log("=".repeat(70));

  const gate3Events = candidates.map((c) => ({
    id: `gate-3-${c.id}`,
    name: "match/gate-3-evaluate" as const,
    data: {
      matchQueueId: c.id,
      jobId: c.job_id,
      personaId: c.persona_id,
      applicantId: c.applicant_id,
    },
  }));

  // Batch in groups of 100 to avoid payload size limits.
  const BATCH_SIZE = 100;
  for (let i = 0; i < gate3Events.length; i += BATCH_SIZE) {
    const batch = gate3Events.slice(i, i + BATCH_SIZE);
    await inngest.send(batch);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(gate3Events.length / BATCH_SIZE);
    console.log(
      `  Sent batch ${batchNum}/${totalBatches} (${batch.length} events, ` +
        `${i + batch.length}/${gate3Events.length} total)`,
    );
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Done!");
  console.log("=".repeat(70));
  console.log();
  console.log(`  ${candidates.length} candidates inserted into match_queue.`);
  console.log(`  ${gate3Events.length} Gate 3 events sent to Inngest Cloud.`);
  console.log();
  console.log("The gate3Evaluator function will now process each candidate");
  console.log(
    "automatically (concurrency 5). Check the Inngest Cloud dashboard",
  );
  console.log(
    "to see Gate 3 runs, and check your dashboard for approved matches.",
  );
  console.log();
  console.log("Verify match_queue status:");
  console.log("  SELECT status, COUNT(*) FROM match_queue GROUP BY status;");

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
