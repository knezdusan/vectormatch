// Regenerate Matches — Directive 11, Step 2
// scripts/regenerate-matches.ts
//
// Re-runs Gate 1+2 for all active global jobs with embeddings.
// Uses the actual detectCountryFence, isNationalSecurityJob, and isQARole
// functions from gate-zero.ts and stack-families.ts for filtering.

import { neon } from "@neondatabase/serverless";

import {
  detectCountryFence,
  isNationalSecurityJob,
} from "../src/lib/jobs/gate-zero";
import { isQARole } from "../src/lib/jobs/stack-families";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  // Get all active global jobs with embeddings
  const jobs = await sql`
    SELECT id, title, ats_slug, extracted_tags, remote_scope, location_name,
           normalized_text
    FROM job
    WHERE status = 'active'
    AND remote_scope = 'global'
    AND job_embedding IS NOT NULL
    ORDER BY detected_at DESC
  `;

  console.log(`Found ${jobs.length} active global jobs with embeddings`);

  let fenceFiltered = 0;
  let natsecFiltered = 0;
  let qaFiltered = 0;
  let matched = 0;
  let errors = 0;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];

    // Check fence gate using the actual detectCountryFence function
    const fence = detectCountryFence(job.title, job.location_name);
    if (fence !== null) {
      fenceFiltered++;
      continue;
    }

    // Check natsec gate using the actual isNationalSecurityJob function
    if (isNationalSecurityJob(job.title, job.normalized_text ?? null)) {
      natsecFiltered++;
      continue;
    }

    // Check QA role gate
    if (isQARole(job.title, job.extracted_tags ?? [])) {
      qaFiltered++;
      continue;
    }

    // Run Gate 1+2 matching
    const tags = job.extracted_tags || [];

    try {
      const result = await sql`
        WITH job_meta AS (
          SELECT ats_slug, title, remote_scope, location_name,
                 false AS is_fenced,
                 false AS is_natsec,
                 false AS is_qa
          FROM job WHERE id = ${job.id}::uuid
        )
        INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
        SELECT
          ${job.id}::uuid,
          p.id,
          p.applicant_id,
          ov.overlap_score,
          (p.persona_embedding <=> j.job_embedding::vector) AS cosine_distance,
          'pending'
        FROM persona p
        CROSS JOIN job_meta jm
        CROSS JOIN LATERAL (
          SELECT count(*) AS overlap_score
          FROM unnest(p.must_have_tags) AS t(tag)
          WHERE t.tag = ANY(${tags}::text[])
        ) ov
        CROSS JOIN job j
        WHERE j.id = ${job.id}::uuid
          AND p.must_have_tags && ${tags}::text[]
          AND NOT (p.blocklist_tags && ${tags}::text[])
          AND ov.overlap_score >= 2
          AND (p.persona_embedding <=> j.job_embedding::vector) < 0.5
          AND p.persona_embedding IS NOT NULL
          AND jm.remote_scope = 'global'
        ORDER BY
          (
            (1 - EXP(-0.4 * LEAST(ov.overlap_score, 5))) * 0.6
            + (1 - (p.persona_embedding <=> j.job_embedding::vector)) * 0.4
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
        RETURNING id, persona_id
      `;

      if (result.length > 0) {
        matched++;
        console.log(
          `  [${i + 1}/${jobs.length}] ${job.title?.slice(0, 50)} → ${result.length} matches`,
        );
      }
    } catch (e) {
      errors++;
      if (errors <= 3) {
        console.error(
          `  Error for job ${job.id} (${job.title?.slice(0, 30)}):`,
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }

  console.log(`\n=== REGENERATION SUMMARY ===`);
  console.log(`Total jobs processed: ${jobs.length}`);
  console.log(`Filtered by fence gate: ${fenceFiltered}`);
  console.log(`Filtered by natsec gate: ${natsecFiltered}`);
  console.log(`Filtered by QA gate: ${qaFiltered}`);
  console.log(`Jobs with matches: ${matched}`);
  console.log(`Errors: ${errors}`);

  // Final count
  const total = await sql`SELECT count(*) as cnt FROM match_queue`;
  const byStatus = await sql`
    SELECT status, count(*) as cnt
    FROM match_queue
    GROUP BY status
    ORDER BY cnt DESC
  `;
  console.log(`\nTotal match_queue rows: ${total[0].cnt}`);
  for (const r of byStatus) {
    console.log(`  ${r.status}: ${r.cnt}`);
  }
}

main().catch(console.error);
