// D18 — Run the actual gate router against specific jobs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const targets = [
    { slug: "ruby-labs", title: "Senior AI Engineer" },
    {
      slug: "brigit",
      title: "Senior Software Engineer - Fullstack, US Remote",
    },
    { slug: "brigit", title: "Software Engineer - Fullstack, US Remote" },
  ];

  for (const target of targets) {
    const job = await sql`
      SELECT id, title, ats_slug, remote_scope, extracted_tags,
             job_embedding::text AS embedding_str
      FROM job
      WHERE ats_slug = ${target.slug}
      AND title = ${target.title}
      AND status = 'active'
      LIMIT 1
    `;
    if (job.length === 0) {
      console.log(`NOT FOUND: ${target.slug} / ${target.title}`);
      continue;
    }
    const j = job[0];
    const tags: string[] = j.extracted_tags;

    console.log(`=== ${j.title} (${j.ats_slug}) ===`);
    console.log(`  scope: ${j.remote_scope}`);
    console.log(`  tags (${tags.length}): ${tags.slice(0, 10).join(", ")}...`);

    if (!j.embedding_str) {
      console.log("  NO EMBEDDING");
      continue;
    }

    // Run the gate router SQL using proper parameterized array
    const candidates = await sql`
      SELECT
        p.id AS persona_id,
        p.persona_label,
        (p.persona_embedding <=> ${j.embedding_str}::vector) AS cosine_distance,
        (
          SELECT count(*) FROM unnest(p.must_have_tags) AS t(tag)
          WHERE t.tag = ANY(${tags}::text[])
        ) AS overlap_score
      FROM persona p
      WHERE
        p.must_have_tags && ${tags}::text[]
        AND NOT (p.blocklist_tags && ${tags}::text[])
        AND (SELECT count(*) FROM unnest(p.must_have_tags) AS t(tag) WHERE t.tag = ANY(${tags}::text[])) >= 2::int
        AND (p.persona_embedding <=> ${j.embedding_str}::vector) < 0.50::real
        AND p.persona_embedding IS NOT NULL
      LIMIT 8
    `;

    console.log(
      `  Gate router (threshold=0.50): ${candidates.length} candidates`,
    );
    for (const c of candidates) {
      console.log(
        `    → ${c.persona_label} | dist: ${Number(c.cosine_distance).toFixed(4)} | overlap: ${c.overlap_score}`,
      );
    }

    // Also try at 0.55
    const candidates055 = await sql`
      SELECT
        p.id AS persona_id,
        p.persona_label,
        (p.persona_embedding <=> ${j.embedding_str}::vector) AS cosine_distance,
        (
          SELECT count(*) FROM unnest(p.must_have_tags) AS t(tag)
          WHERE t.tag = ANY(${tags}::text[])
        ) AS overlap_score
      FROM persona p
      WHERE
        p.must_have_tags && ${tags}::text[]
        AND NOT (p.blocklist_tags && ${tags}::text[])
        AND (SELECT count(*) FROM unnest(p.must_have_tags) AS t(tag) WHERE t.tag = ANY(${tags}::text[])) >= 2::int
        AND (p.persona_embedding <=> ${j.embedding_str}::vector) < 0.55::real
        AND p.persona_embedding IS NOT NULL
      LIMIT 8
    `;

    console.log(
      `  Gate router (threshold=0.55): ${candidates055.length} candidates`,
    );
    for (const c of candidates055) {
      console.log(
        `    → ${c.persona_label} | dist: ${Number(c.cosine_distance).toFixed(4)} | overlap: ${c.overlap_score}`,
      );
    }

    // Check: does the gate-1-2.ts SQL also check the job's remote_scope?
    // Let me read the actual SQL from the file
    console.log();
  }

  // Now let's check: the gate-1-2.ts SQL has additional WHERE clauses
  // that check jm.remote_scope = 'global', NOT jm.is_fenced, etc.
  // These are checks on the JOB row. But the gate router is called with
  // just the jobId, tags, and embedding — the job's scope is checked
  // by joining with the job table in the SQL.
  // Let me check if the gate router SQL actually has these checks.

  // From the code read earlier (gate-1-2.ts lines 311-348):
  // WHERE
  //   p.must_have_tags && ${tagsArraySql}
  //   AND NOT (p.blocklist_tags && ${tagsArraySql})
  //   AND ov.overlap_score >= ${GATE1_MIN_OVERLAP}
  //   AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${GATE2_MAX_COSINE_DISTANCE}
  //   AND p.persona_embedding IS NOT NULL
  //   AND jm.remote_scope = 'global'
  //   AND NOT jm.is_fenced
  //   AND NOT jm.is_natsec
  //   AND NOT jm.is_qa
  //   ${stackDisjointClause}
  //   AND NOT EXISTS (dedup checks)

  // The jm alias refers to the job table. But wait — the gate router
  // is called PER JOB. Does the SQL join with the job table?
  // Let me check the actual SQL query structure.

  console.log("=== Reading gate-1-2.ts SQL structure ===");
  // The SQL uses jm as an alias for the job table
  // But the gate router function receives jobId, jobTags, jobEmbedding
  // It does NOT receive the job's remote_scope or fence flags
  // The SQL must join with the job table to check these

  // Let me check: does the SQL query in gate-1-2.ts join with the job table?
  // From the code: the query is a SELECT from persona p with LATERAL
  // But it also has jm.remote_scope = 'global' — where does jm come from?

  // Actually, looking at the code more carefully, the gate router SQL
  // might be structured differently than I thought. Let me read the full SQL.
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
