// D18 — Trace why specific jobs that pass all gates aren't in match_queue
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const jobs = [
    { slug: "ruby-labs", title: "Senior AI Engineer" },
    {
      slug: "brigit",
      title: "Senior Software Engineer - Fullstack, US Remote",
    },
    { slug: "brigit", title: "Software Engineer - Fullstack, US Remote" },
    { slug: "zenrows", title: "Staff Frontend Engineer" },
    { slug: "ruby-labs", title: "Senior React Native Developer" },
  ];

  for (const target of jobs) {
    const job = await sql`
      SELECT id, title, ats_slug, remote_scope, extracted_tags, normalized_text, text_hash
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

    const dists = await sql`
      SELECT p.id, p.persona_label,
             (j.job_embedding <=> p.persona_embedding) as dist,
             p.must_have_tags
      FROM job j, persona p
      WHERE j.id = ${j.id}::uuid
      AND p.persona_embedding IS NOT NULL
    `;

    const mq = await sql`
      SELECT id, persona_id, status
      FROM match_queue
      WHERE job_id = ${j.id}::uuid
    `;

    const dedup = await sql`
      SELECT mq.id, mq.persona_id, mq.status, j2.title
      FROM match_queue mq
      JOIN job j2 ON mq.job_id = j2.id
      WHERE j2.ats_slug = ${j.ats_slug}
      AND j2.title = ${j.title}
      AND mq.status = 'approved'
    `;

    let thDedup: Array<{
      id: string;
      persona_id: string;
      status: string;
      title: string;
      ats_slug: string;
    }> = [];
    if (j.text_hash) {
      thDedup = (await sql`
        SELECT mq2.id, mq2.persona_id, mq2.status, j3.title, j3.ats_slug
        FROM match_queue mq2
        JOIN job j3 ON mq2.job_id = j3.id
        WHERE j3.text_hash = ${j.text_hash}
        AND j3.text_hash IS NOT NULL
        AND mq2.status = 'approved'
        AND mq2.job_id != ${j.id}::uuid
      `) as typeof thDedup;
    }

    // Check applicant_company_block
    const blocked = await sql`
      SELECT acb.user_id, acb.ats_slug
      FROM applicant_company_block acb
      WHERE acb.ats_slug = ${j.ats_slug}
    `;

    console.log("Job:", j.title, "| slug:", j.ats_slug);
    console.log("  scope:", j.remote_scope, "| text_hash:", j.text_hash);
    console.log("  tags:", j.extracted_tags?.slice(0, 10));
    for (const d of dists) {
      const overlap =
        j.extracted_tags?.filter((t: string) =>
          d.must_have_tags?.includes(t),
        ) || [];
      console.log(
        "  →",
        d.persona_label,
        "| dist:",
        Number(d.dist).toFixed(4),
        "| overlap:",
        overlap.length,
        overlap,
      );
    }
    console.log("  match_queue:", mq.length, "entries");
    console.log("  dedup (same slug+title approved):", dedup.length);
    console.log("  text_hash dedup:", thDedup.length);
    console.log("  applicant_company_block:", blocked.length);
    console.log();
  }

  // Also check: the gate router's stackDisjointClause
  // This clause rejects jobs where the persona's stack is completely disjoint
  // from the job's tags AFTER removing process-noise tags
  console.log("=== Checking stack-disjoint clause ===");
  // Read the stackDisjointClause from gate-1-2.ts
  // It checks: if the job has tags from a DIFFERENT stack (e.g., Java, Python, Ruby)
  // and NO tags from the persona's stack, reject it
  // But our jobs DO have persona tags (typescript, react, nodejs)...

  // Let's check if the issue is the GATE1_MIN_OVERLAP = 2
  // The zenrows job has tags: cursor, go, react, agile, scrum
  // Node persona tags: typescript, nextjs, react, nodejs, prompt-engineering
  // Overlap: react (1) — FAILS GATE1_MIN_OVERLAP = 2!
  const zenrows = await sql`
    SELECT id, title, extracted_tags
    FROM job
    WHERE ats_slug = 'zenrows'
    AND title = 'Staff Frontend Engineer'
    AND status = 'active'
    LIMIT 1
  `;
  if (zenrows.length > 0) {
    const z = zenrows[0];
    const nodeTags = [
      "typescript",
      "nextjs",
      "react",
      "nodejs",
      "prompt-engineering",
    ];
    const overlap = z.extracted_tags.filter((t: string) =>
      nodeTags.includes(t),
    );
    console.log("Zenrows Staff Frontend Engineer:");
    console.log("  tags:", z.extracted_tags);
    console.log("  Node overlap:", overlap.length, overlap);
    console.log(
      "  GATE1_MIN_OVERLAP = 2 →",
      overlap.length >= 2 ? "PASS" : "FAIL",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
