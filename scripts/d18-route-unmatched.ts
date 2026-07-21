// D18 Part D — Manually route the 42 unmatched jobs through the gate router
// This is a one-time fix to populate match_queue with the jobs that were
// missed by the idempotency trap and the dead bulk reprocess function.
//
// Usage: npx tsx --env-file=.env scripts/d18-route-unmatched.ts

import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Find all unmatched jobs that pass Gate 1 (tag overlap) for any persona
  // and have embeddings, but have NO match_queue entry.
  // Use GATE2_HARD_CEILING = 0.75 as the wide safety net (D18 rank-only mode).
  const unmatched = await sql`
    SELECT DISTINCT j.id, j.title, j.ats_slug, j.extracted_tags,
           j.job_embedding::text AS embedding_str
    FROM job j
    JOIN persona p ON (j.extracted_tags && p.must_have_tags)
    WHERE j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.extracted_tags IS NOT NULL
      AND cardinality(j.extracted_tags) > 0
      AND p.persona_embedding IS NOT NULL
      AND (p.persona_embedding <=> j.job_embedding) < 0.75::real
      AND NOT EXISTS (
        SELECT 1 FROM match_queue mq
        WHERE mq.job_id = j.id AND mq.persona_id = p.id
      )
    ORDER BY j.title
    LIMIT 100
  `;

  console.log(`=== D18 Manual Route: ${unmatched.length} unmatched jobs ===`);
  console.log();

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const job of unmatched) {
    const tags: string[] = job.extracted_tags;
    const embeddingStr = job.embedding_str;

    if (!embeddingStr || tags.length === 0) {
      totalSkipped++;
      continue;
    }

    // Run the gate router SQL directly (D18 rank-only mode: threshold = 0.75)
    try {
      const result = await sql`
        WITH job_meta AS (
          SELECT ats_slug, title, remote_scope, location_name,
                 COALESCE(is_fenced, false) AS is_fenced,
                 COALESCE(is_natsec, false) AS is_natsec,
                 COALESCE(is_qa, false) AS is_qa
          FROM job WHERE id = ${job.id}::uuid
        )
        INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
        SELECT
          ${job.id}::uuid,
          p.id,
          p.applicant_id,
          ov.overlap_score,
          (p.persona_embedding <=> ${embeddingStr}::vector) AS cosine_distance,
          'pending'
        FROM persona p
        CROSS JOIN job_meta jm
        CROSS JOIN LATERAL (
          SELECT count(*) AS overlap_score
          FROM unnest(p.must_have_tags) AS t(tag)
          WHERE t.tag = ANY(${tags}::text[])
        ) ov
        WHERE
          p.must_have_tags && ${tags}::text[]
          AND NOT (p.blocklist_tags && ${tags}::text[])
          AND ov.overlap_score >= 2::int
          AND (p.persona_embedding <=> ${embeddingStr}::vector) < 0.75::real
          AND p.persona_embedding IS NOT NULL
          AND jm.remote_scope = 'global'
          AND NOT jm.is_fenced
          AND NOT jm.is_natsec
          AND NOT jm.is_qa
          AND NOT EXISTS (
            SELECT 1 FROM match_queue mq
            JOIN job j2 ON mq.job_id = j2.id
            WHERE j2.ats_slug = jm.ats_slug
              AND j2.title = jm.title
              AND mq.persona_id = p.id
              AND mq.status = 'approved'
          )
          AND NOT EXISTS (
            SELECT 1 FROM match_queue mq2
            JOIN job j3 ON mq2.job_id = j3.id
            WHERE j3.text_hash = (SELECT text_hash FROM job WHERE id = ${job.id}::uuid)
              AND j3.text_hash IS NOT NULL
              AND mq2.persona_id = p.id
              AND mq2.status = 'approved'
              AND mq2.job_id != ${job.id}::uuid
          )
          AND NOT EXISTS (
            SELECT 1 FROM applicant_company_block acb
            WHERE acb.user_id = p.applicant_id
              AND acb.ats_slug = jm.ats_slug
          )
        ORDER BY
          (
            (1 - EXP(-0.4 * LEAST(ov.overlap_score, 5))) * 0.6::real
            + (1 - (p.persona_embedding <=> ${embeddingStr}::vector)) * 0.4::real
          ) DESC
        LIMIT 8
        ON CONFLICT (job_id, persona_id) DO UPDATE SET
          status = 'pending',
          evaluated_at = NULL,
          llm_verdict = NULL,
          llm_blockers = NULL,
          llm_reasoning = NULL,
          llm_confidence = NULL,
          llm_model = NULL,
          prompt_variant = NULL,
          overlap_score = EXCLUDED.overlap_score,
          cosine_distance = EXCLUDED.cosine_distance
        RETURNING id, persona_id, overlap_score, cosine_distance
      `;

      if (result.length > 0) {
        totalInserted += result.length;
        console.log(
          `  INSERTED ${result.length} candidates: ${job.title?.slice(0, 40)} (${job.ats_slug})`,
        );
        for (const r of result) {
          console.log(
            `    → persona: ${r.persona_id.slice(0, 8)} | dist: ${Number(r.cosine_distance).toFixed(4)} | overlap: ${r.overlap_score}`,
          );
        }
      } else {
        totalSkipped++;
      }
    } catch (e) {
      totalErrors++;
      console.error(
        `  ERROR: ${job.title?.slice(0, 40)} (${job.ats_slug}): ${e}`,
      );
    }
  }

  console.log();
  console.log("=== SUMMARY ===");
  console.log(`  Total jobs processed: ${unmatched.length}`);
  console.log(`  Total candidates inserted: ${totalInserted}`);
  console.log(`  Jobs with no candidates: ${totalSkipped}`);
  console.log(`  Errors: ${totalErrors}`);

  // Verify: how many match_queue entries now?
  const mqTotal = await sql`
    SELECT status, count(*) as cnt
    FROM match_queue
    GROUP BY status
  `;
  console.log();
  console.log("=== Match queue after routing ===");
  for (const r of mqTotal) {
    console.log(`  ${r.status}: ${r.cnt}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
