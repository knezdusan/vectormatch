// D18 — Investigate why 7 jobs pass all gates but aren't in match_queue
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const jobIds = [
    "7b71f25d", // Product Engineer (overlap=3, dist=0.5157)
    "223fd6a3", // Senior AI Engineer (overlap=3, dist=0.4727)
    "2900f7a7", // Senior Software Engineer (overlap=3, dist=0.5462)
    "cc773b0d", // Software Engineer 3, Documentation Platform (overlap=3, dist=0.5417)
    "9f729878", // Control Plane Engineer (overlap=2, dist=0.5430)
    "e9860782", // Engineering Manager (Core UI) (overlap=2, dist=0.5126)
    "1679f8a0", // Senior Software Engineer - Fullstack, US Remote (overlap=2, dist=0.4922)
  ];

  for (const shortId of jobIds) {
    const job = await sql`
      SELECT id, title, ats_slug, status, remote_scope,
             job_embedding IS NOT NULL as has_embed,
             normalized_at, source_fetched_at, job_version,
             extracted_tags
      FROM job
      WHERE id::text LIKE ${shortId + "%"}
    `;
    if (job.length === 0) continue;
    const j = job[0];

    const mq = await sql`
      SELECT mq.id, mq.persona_id, mq.status, mq.cosine_distance, mq.overlap_score,
             p.persona_label
      FROM match_queue mq
      JOIN persona p ON mq.persona_id = p.id
      WHERE mq.job_id = ${j.id}::uuid
    `;

    console.log("Job:", j.title?.slice(0, 50), "| slug:", j.ats_slug);
    console.log("  status:", j.status, "| scope:", j.remote_scope, "| embed:", j.has_embed);
    console.log("  normalized_at:", j.normalized_at);
    console.log("  tags:", j.extracted_tags);
    console.log("  match_queue entries:", mq.length);
    for (const m of mq) {
      console.log(
        "    → persona:", m.persona_label,
        "| status:", m.status,
        "| dist:", m.cosine_distance?.toFixed(4),
        "| overlap:", m.overlap_score,
      );
    }
    if (mq.length === 0) {
      console.log("    → NO match_queue entries for ANY persona");
    }
    console.log();
  }

  // Check the gate router invocation path
  // The gate router is called by:
  // 1. job-ingested-handler (event: job/ingested) — runs on every new job
  // 2. match-retry-sweep (cron: 0 7 * * *) — catches missed jobs
  // Let's check if these jobs were ever sent through the gate router

  console.log("=== Checking gate router invocation ===");
  // The job-ingested-handler calls routeJobToPersonas() which calls the gate-1-2 SQL
  // If the job has an embedding at ingestion time, it should be routed immediately
  // If not, it waits for the embedding backfill, then the match-retry-sweep catches it

  // Check: do these jobs have embeddings NOW? (they should, we already checked)
  // Check: were they ingested before or after the embedding was generated?
  // Check: is there a mismatch between normalized_at and embedding generation?

  for (const shortId of jobIds.slice(0, 3)) {
    const job = await sql`
      SELECT id, title, ats_slug, created_at, updated_at, normalized_at,
             job_embedding IS NOT NULL as has_embed,
             length(normalized_text) as text_len
      FROM job
      WHERE id::text LIKE ${shortId + "%"}
    `;
    if (job.length === 0) continue;
    const j = job[0];

    console.log("Job:", j.title?.slice(0, 40));
    console.log("  created:", j.created_at);
    console.log("  updated:", j.updated_at);
    console.log("  normalized_at:", j.normalized_at);
    console.log("  has_embed:", j.has_embed);
    console.log("  text_len:", j.text_len);

    // Check if the gate router would have been called for this job
    // The job-ingested-handler fires on 'job/ingested' event
    // But if the job was ingested without an embedding, the handler skips gate routing
    // and the job waits for the match-retry-sweep

    // Let's check the match-retry-sweep logic
    // It looks for jobs that pass Gate 1+2 but have no match_queue entry
    // If the sweep is frozen (D17 A2), it won't run!
    console.log();
  }

  // Check if match-retry-sweep is frozen
  console.log("=== match-retry-sweep cron status ===");
  console.log("D17 A2 froze match-retry-sweep? Let's check...");

  // Actually, match-retry-sweep was NOT frozen — it's one of the 8 active crons
  // It runs daily at 07:00 UTC
  // But the question is: does it actually find these jobs?

  // Let's check the match-retry-sweep query
  // It should find jobs that:
  // 1. Are active, global, embedded
  // 2. Have tag overlap with some persona
  // 3. Pass Gate 2 (cosine < threshold)
  // 4. Are NOT in match_queue

  // Let's run the exact query the sweep uses
  console.log();
  console.log("=== Running match-retry-sweep query manually ===");
  const unmatched = await sql`
    SELECT j.id, j.title, j.ats_slug,
           j.extracted_tags && ARRAY['typescript','nextjs','react','nodejs','prompt-engineering']::text[] as has_node_tags
    FROM job j
    WHERE j.status = 'active'
    AND j.remote_scope = 'global'
    AND j.job_embedding IS NOT NULL
    AND COALESCE(j.is_fenced, false) = false
    AND COALESCE(j.is_natsec, false) = false
    AND COALESCE(j.is_qa, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM match_queue mq
      WHERE mq.job_id = j.id
    )
    AND j.extracted_tags && (
      SELECT array_agg(tag) FROM (
        SELECT unnest(must_have_tags) as tag FROM persona
      ) all_tags
    )
    ORDER BY j.updated_at DESC
    LIMIT 20
  `;
  console.log("Unmatched jobs (active+global+embedded, tag overlap, no match_queue):", unmatched.length);
  for (const u of unmatched) {
    console.log("  ", u.title?.slice(0, 50), "| slug:", u.ats_slug, "| node_tags:", u.has_node_tags);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
