// D18 — Check company tiers and gate router invocation
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const slugs = [
    "ruby-labs",
    "brigit",
    "zenrows",
    "runway-ml",
    "mongodb",
    "supabase",
    "amplify",
    "simspace-corporation",
  ];

  console.log("=== Company tiers ===");
  for (const slug of slugs) {
    const companies = await sql`
      SELECT id, ats_source, ats_slug, company_name, tier
      FROM company
      WHERE ats_slug = ${slug}
    `;
    for (const c of companies) {
      console.log(
        `  ${c.company_name} | slug: ${c.ats_slug} | source: ${c.ats_source} | tier: ${c.tier}`,
      );
    }
    if (companies.length === 0) {
      console.log(`  NOT FOUND: ${slug}`);
    }
  }

  // Check: were these jobs embedded at ingestion time or later?
  // If the company was on probation, the embedding was skipped
  // and a backfill was needed
  console.log();
  console.log("=== Job normalization timeline ===");
  for (const slug of slugs) {
    const jobs = await sql`
      SELECT id, title, ats_slug, status, remote_scope,
             job_embedding IS NOT NULL as has_embed,
             normalized_at, updated_at,
             length(normalized_text) as text_len
      FROM job
      WHERE ats_slug = ${slug}
      AND status = 'active'
      ORDER BY normalized_at DESC
      LIMIT 3
    `;
    for (const j of jobs) {
      console.log(`  ${j.title?.slice(0, 45)} | slug: ${j.ats_slug}`);
      console.log(
        `    scope: ${j.remote_scope} | embed: ${j.has_embed} | text_len: ${j.text_len}`,
      );
      console.log(
        `    normalized: ${j.normalized_at?.toISOString?.() ?? "NULL"} | updated: ${j.updated_at?.toISOString?.()}`,
      );
    }
  }

  // Check: is there a GATE2_MAX_COSINE_DISTANCE env var set?
  // We can't directly check production env vars, but we can check
  // if the .env file has one
  console.log();
  console.log("=== Checking .env for GATE2_MAX_COSINE_DISTANCE ===");
  const envValue = process.env.GATE2_MAX_COSINE_DISTANCE;
  console.log(
    `  GATE2_MAX_COSINE_DISTANCE = ${envValue ?? "NOT SET (default: 0.55 in code, 0.50 in undeployed prod)"}`,
  );

  // Check: how many total match_queue entries have EVER existed?
  // If Gate 3 rejects and deletes entries, the sweep would find them again
  console.log();
  console.log("=== Match queue analysis ===");
  const mqByStatus = await sql`
    SELECT status, count(*) as cnt
    FROM match_queue
    GROUP BY status
  `;
  for (const r of mqByStatus) {
    console.log(`  ${r.status}: ${r.cnt}`);
  }

  // Check: are there any rejected match_queue entries?
  const rejected = await sql`
    SELECT mq.id, mq.status, mq.cosine_distance, mq.overlap_score,
           mq.llm_verdict, mq.llm_blockers,
           j.title, j.ats_slug,
           p.persona_label
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    JOIN persona p ON mq.persona_id = p.id
    WHERE mq.status != 'approved'
    LIMIT 10
  `;
  console.log();
  console.log("=== Non-approved match_queue entries ===");
  console.log(`Count: ${rejected.length}`);
  for (const r of rejected) {
    console.log(
      `  ${r.title?.slice(0, 40)} | ${r.persona_label} | status: ${r.status} | dist: ${Number(r.cosine_distance).toFixed(4)} | verdict: ${r.llm_verdict}`,
    );
  }

  // If there are NO rejected entries, it means either:
  // 1. Gate 3 never ran (no candidates were ever inserted)
  // 2. Gate 3 rejected and DELETED entries (not just set status='rejected')
  // 3. The gate router never inserted any candidates

  // Let's check: does Gate 3 delete rejected entries or set status='rejected'?
  // From the gate-1-2.ts ON CONFLICT clause, it sets status='pending'
  // Gate 3 should set status='approved' or 'rejected'
  // If there are 0 rejected entries, the gate router never inserted anything

  // Check: total match_queue entries ever (including deleted?)
  // We can't check deleted entries, but we can check the current state
  const totalMq = await sql`
    SELECT count(*) as cnt FROM match_queue
  `;
  console.log();
  console.log(`Total match_queue entries: ${totalMq[0].cnt}`);

  // Check: how many jobs have been through the gate router?
  // The gate router INSERTs into match_queue. If only 3 entries exist,
  // the gate router has only successfully inserted 3 times.
  // But the sweep keeps finding 14-26 jobs per run.
  // This means the gate router is NOT inserting for those jobs.

  // The most likely explanation: the bulk reprocess function is failing
  // or not running. Let me check if there's an Inngest issue.

  // Check: are there any ingestion_log entries for match_bulk_reprocess?
  const bulkLogs = await sql`
    SELECT type, source, status, items_processed, items_inserted, error_message, created_at
    FROM ingestion_log
    WHERE source = 'match_bulk_reprocess'
    ORDER BY created_at DESC
    LIMIT 10
  `;
  console.log();
  console.log("=== match_bulk_reprocess logs ===");
  for (const l of bulkLogs) {
    console.log(
      `  ${l.created_at?.toISOString?.()?.slice(0, 19)} | processed: ${l.items_processed} | inserted: ${l.items_inserted} | status: ${l.status} | error: ${(l.error_message ?? "").slice(0, 80)}`,
    );
  }
  if (bulkLogs.length === 0) {
    console.log(
      "  NO LOGS — bulk reprocess has never run or doesn't write logs!",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
