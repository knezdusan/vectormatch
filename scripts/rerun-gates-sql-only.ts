#!/usr/bin/env tsx
// Re-run Gate 1+2 SQL only — no Inngest event emission
// scripts/rerun-gates-sql-only.ts
//
// This is a simplified version of rerun-gates.ts that only runs the bulk
// Gate 1+2 SQL query to populate match_queue. It does NOT emit Gate 3
// events to Inngest Cloud (useful when INNGEST_EVENT_KEY is not available).
//
// After running this script, pending match_queue rows will be evaluated by
// Gate 3 when:
//   - The deployment syncs Inngest functions
//   - You run rerun-gates.ts with a real INNGEST_EVENT_KEY
//   - Or the pending-queue-sweep Inngest function picks them up
//
// Usage:
//   node --conditions react-server --import tsx scripts/rerun-gates-sql-only.ts
//   node --conditions react-server --import tsx scripts/rerun-gates-sql-only.ts --clean

import { config } from "dotenv";
import { sql } from "drizzle-orm";

config();

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
  process.exit(1);
});

async function main(): Promise<void> {
  const { db } = await import("@/db/db");
  const {
    GATE_ROUTER_LIMIT,
    GATE1_WEIGHT,
    GATE2_MAX_COSINE_DISTANCE,
    GATE2_WEIGHT,
  } = await import("@/lib/jobs/matching-config");

  const args = process.argv.slice(2);
  const shouldClean = args.includes("--clean");

  console.log("=".repeat(70));
  console.log("Re-run Gate 1+2 SQL only (no Inngest events)");
  console.log("=".repeat(70));
  console.log();
  console.log(
    `Threshold: GATE2_MAX_COSINE_DISTANCE = ${GATE2_MAX_COSINE_DISTANCE}`,
  );
  console.log(`Weights:   GATE1=${GATE1_WEIGHT}  GATE2=${GATE2_WEIGHT}`);
  console.log(`Limit:     GATE_ROUTER_LIMIT = ${GATE_ROUTER_LIMIT}`);
  console.log();

  if (shouldClean) {
    console.log("--clean flag set: truncating match_queue...");
    await db.execute(sql`TRUNCATE TABLE match_queue`);
    console.log("   match_queue truncated.");
    console.log();
  }

  console.log("Running bulk Gate 1+2 for all active+embedded jobs...");
  const startedAt = Date.now();

  const result = await db.execute(sql`
    WITH ranked_jobs AS (
      SELECT
        j.id,
        j.ats_slug,
        j.title,
        j.extracted_tags,
        j.job_embedding,
        j.workplace_type,
        p.id AS persona_id,
        p.applicant_id,
        ov.overlap_score,
        (p.persona_embedding <=> j.job_embedding) AS cosine_distance,
        ROW_NUMBER() OVER (
          PARTITION BY j.ats_slug, j.title, p.id
          ORDER BY
            ov.overlap_score * ${GATE1_WEIGHT}::real
            + (1 - (p.persona_embedding <=> j.job_embedding)) * ${GATE2_WEIGHT}::real DESC
        ) AS rn
      FROM job j
      CROSS JOIN persona p
      CROSS JOIN LATERAL (
        SELECT count(*) AS overlap_score
        FROM unnest(p.must_have_tags) AS t(tag)
        WHERE t.tag = ANY(j.extracted_tags)
      ) ov
      LEFT JOIN applicant a ON a.user_id = p.applicant_id
      WHERE
        j.status = 'active'
        AND j.job_embedding IS NOT NULL
        AND p.persona_embedding IS NOT NULL
        AND p.must_have_tags && j.extracted_tags
        AND NOT (p.blocklist_tags && j.extracted_tags)
        AND (p.persona_embedding <=> j.job_embedding) < ${GATE2_MAX_COSINE_DISTANCE}::real
        AND (
          j.workplace_type IS NULL
          OR (
            j.workplace_type = 'remote'
            AND ('remote' = ANY(a.assignment_types) OR 'remote_local' = ANY(a.assignment_types))
          )
          OR (
            j.workplace_type = 'hybrid'
            AND ('hybrid' = ANY(a.assignment_types))
          )
          OR (
            j.workplace_type = 'on-site'
            AND ('on-site' = ANY(a.assignment_types) OR 'hybrid' = ANY(a.assignment_types))
          )
        )
    )
    INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
    SELECT id, persona_id, applicant_id, overlap_score, cosine_distance, 'pending'
    FROM ranked_jobs
    WHERE rn = 1
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

    // Per-persona breakdown
    const personaMap = new Map<string, number>();
    for (const c of candidates) {
      personaMap.set(c.persona_id, (personaMap.get(c.persona_id) ?? 0) + 1);
    }
    console.log();
    console.log("  Per-persona breakdown:");
    for (const [pid, count] of personaMap) {
      console.log(`    ${pid}: ${count} candidates`);
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Done! Match_queue populated with pending candidates.");
  console.log("=".repeat(70));
  console.log();
  console.log("Next steps:");
  console.log("  1. Deploy the code changes (Inngest functions will sync)");
  console.log(
    "  2. Gate 3 will evaluate pending rows via the pending-queue-sweep",
  );
  console.log(
    "     or when you run rerun-gates.ts with a real INNGEST_EVENT_KEY",
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
