// D18 — Trigger Gate 3 evaluation for the 56 pending candidates
// Sends match/gate-3-evaluate events via the Inngest client
//
// Usage: npx tsx --env-file=.env scripts/d18-trigger-gate3.ts

import { neon } from "@neondatabase/serverless";
import { inngest } from "../src/inngest/client";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Find all pending match_queue entries
  const pending = await sql`
    SELECT mq.id, mq.job_id, mq.persona_id, mq.applicant_id,
           mq.cosine_distance, mq.overlap_score,
           j.title, p.persona_label
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    JOIN persona p ON mq.persona_id = p.id
    WHERE mq.status = 'pending'
    ORDER BY mq.cosine_distance ASC
  `;

  console.log(`=== Triggering Gate 3 for ${pending.length} pending candidates ===`);
  console.log();

  if (pending.length === 0) {
    console.log("No pending candidates to evaluate.");
    return;
  }

  // Send Gate 3 events via Inngest
  const events = pending.map((row) => ({
    id: `gate-3-d18-trigger-${row.id}-${Date.now()}`,
    name: "match/gate-3-evaluate" as const,
    data: {
      matchQueueId: row.id,
      jobId: row.job_id,
      personaId: row.persona_id,
      applicantId: row.applicant_id,
    },
  }));

  // Send in batches of 10 to avoid overwhelming Inngest
  const BATCH = 10;
  for (let i = 0; i < events.length; i += BATCH) {
    const batch = events.slice(i, i + BATCH);
    try {
      await inngest.send(batch);
      console.log(`  Sent batch ${Math.floor(i / BATCH) + 1}: ${batch.length} events`);
      for (const e of batch) {
        const row = pending[i + (e === events[i] ? 0 : 0)];
      }
    } catch (e) {
      console.error(`  Error sending batch ${Math.floor(i / BATCH) + 1}:`, e);
    }
  }

  // Print summary
  console.log();
  console.log("=== Events sent ===");
  for (const p of pending.slice(0, 10)) {
    console.log(
      `  ${p.title?.slice(0, 45)} | ${p.persona_label} | dist: ${Number(p.cosine_distance).toFixed(4)} | overlap: ${p.overlap_score}`,
    );
  }
  if (pending.length > 10) {
    console.log(`  ... and ${pending.length - 10} more`);
  }

  console.log();
  console.log("Gate 3 events sent. The Inngest Gate 3 evaluator will process them.");
  console.log("Check the dashboard in a few minutes for approved matches.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
