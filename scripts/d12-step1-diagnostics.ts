// Directive 12 — Step 1 Diagnostics
// scripts/d12-step1-diagnostics.ts
//
// Runs all Step 1 queries in one script:
// 1.2: Reconcile match_queue count vs dashboard-visible count
// 1.3: List the 3 (or N) matches with company, title, persona, scope evidence
// 2.1: Per-gate regeneration funnel (how many jobs each gate rejected)
// 4.1: slugger_retry breakdown by discovery_source

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("=== DIRECTIVE 12 — STEP 1 DIAGNOSTICS ===\n");

  // ── 1.2: Reconcile match_queue vs dashboard ─────────────────────────────
  console.log("── 1.2: match_queue vs dashboard reconciliation ──\n");

  const matchQueueAll = await sql`
    SELECT status, count(*) as cnt
    FROM match_queue
    GROUP BY status
    ORDER BY cnt DESC
  `;
  console.log("match_queue by status:");
  for (const r of matchQueueAll) console.log(`  ${r.status}: ${r.cnt}`);
  const totalMQ = matchQueueAll.reduce((s, r) => s + Number(r.cnt), 0);
  console.log(`  TOTAL: ${totalMQ}\n`);

  // Dashboard typically shows non-rejected, non-stale matches
  const dashboardVisible = await sql`
    SELECT count(*) as cnt
    FROM match_queue
    WHERE status NOT IN ('rejected')
    AND stale_at IS NULL
  `;
  console.log(
    `Dashboard-visible (non-rejected, non-stale): ${dashboardVisible[0].cnt}\n`,
  );

  // Check if there's a persona filter on the dashboard
  const matchesByPersona = await sql`
    SELECT p.id as persona_id, p.persona_label as persona_name,
           mq.status, count(*) as cnt
    FROM match_queue mq
    JOIN persona p ON mq.persona_id = p.id
    GROUP BY p.id, p.persona_label, mq.status
    ORDER BY p.persona_label, mq.status
  `;
  console.log("Matches by persona + status:");
  for (const r of matchesByPersona)
    console.log(
      `  ${r.persona_name} (${r.persona_id.slice(0, 8)}): ${r.status} = ${r.cnt}`,
    );
  console.log();

  // ── 1.3: List the matches ───────────────────────────────────────────────
  console.log("── 1.3: List all non-rejected matches ──\n");

  const matches = await sql`
    SELECT
      mq.id as match_id,
      mq.status,
      mq.overlap_score,
      mq.cosine_distance,
      mq.llm_verdict,
      mq.llm_confidence,
      j.title as job_title,
      j.ats_slug,
      j.location_name,
      j.remote_scope,
      j.workplace_type,
      j.extracted_tags,
      p.persona_label as persona_name,
      p.must_have_tags,
      p.applicant_id
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    JOIN persona p ON mq.persona_id = p.id
    WHERE mq.status NOT IN ('rejected')
    ORDER BY mq.created_at DESC
  `;

  console.log(`Found ${matches.length} non-rejected matches:\n`);
  for (const m of matches) {
    console.log(`  Match ${m.match_id.slice(0, 8)} [${m.status}]`);
    console.log(`    Company: ${m.ats_slug}`);
    console.log(`    Title: ${m.job_title}`);
    console.log(`    Persona: ${m.persona_name}`);
    console.log(`    Location: ${m.location_name ?? "null"}`);
    console.log(`    Remote scope: ${m.remote_scope ?? "null"}`);
    console.log(`    Workplace type: ${m.workplace_type ?? "null"}`);
    console.log(`    Overlap score: ${m.overlap_score}`);
    console.log(
      `    Cosine distance: ${m.cosine_distance?.toFixed(4) ?? "null"}`,
    );
    console.log(`    LLM verdict: ${m.llm_verdict ?? "pending"}`);
    console.log(`    LLM confidence: ${m.llm_confidence ?? "null"}`);
    console.log(`    Job tags: ${JSON.stringify(m.extracted_tags)}`);
    console.log(`    Persona tags: ${JSON.stringify(m.must_have_tags)}`);
    console.log();
  }

  // Also list ALL matches (including rejected) for completeness
  const allMatches = await sql`
    SELECT
      mq.id as match_id,
      mq.status,
      j.title as job_title,
      j.ats_slug,
      j.location_name,
      j.remote_scope,
      p.persona_label as persona_name,
      mq.llm_verdict,
      mq.llm_reasoning
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    JOIN persona p ON mq.persona_id = p.id
    ORDER BY mq.created_at DESC
  `;
  console.log(`All matches (including rejected): ${allMatches.length}`);
  for (const m of allMatches) {
    console.log(
      `  [${m.status}] ${m.ats_slug} — ${m.job_title?.slice(0, 60)} → ${m.persona_name} | scope=${m.remote_scope} | loc=${m.location_name}`,
    );
    if (m.llm_verdict) console.log(`    verdict: ${m.llm_verdict}`);
    if (m.llm_reasoning)
      console.log(`    reasoning: ${m.llm_reasoning?.slice(0, 200)}`);
  }
  console.log();

  // ── 2.1: Per-gate regeneration funnel ───────────────────────────────────
  console.log("── 2.1: Per-gate regeneration funnel ──\n");

  // Total active jobs
  const totalActive = await sql`
    SELECT count(*) as cnt FROM job WHERE status = 'active'
  `;
  console.log(`Total active jobs: ${totalActive[0].cnt}`);

  // Active with embeddings
  const totalEmbedded = await sql`
    SELECT count(*) as cnt FROM job
    WHERE status = 'active' AND job_embedding IS NOT NULL
  `;
  console.log(`Active + embedded: ${totalEmbedded[0].cnt}`);

  // Active + embedded + global
  const totalGlobalEmbedded = await sql`
    SELECT count(*) as cnt FROM job
    WHERE status = 'active' AND job_embedding IS NOT NULL AND remote_scope = 'global'
  `;
  console.log(
    `Active + embedded + global: ${totalGlobalEmbedded[0].cnt} (this is the funnel input)\n`,
  );

  // Now count how many each gate would reject
  // Gate 1: Fence backstop
  const fenceRejected = await sql`
    SELECT count(*) as cnt FROM job
    WHERE status = 'active' AND job_embedding IS NOT NULL AND remote_scope = 'global'
    AND (
      COALESCE(location_name, '') ~* '(United States|USA|Canada|Argentina|Brazil|Colombia|Mexico|Germany|France|Spain|Italy|Portugal|Netherlands|Poland|Ukraine|India|Pakistan|Philippines|Australia|United Kingdom|England|Scotland|Wales|Ireland|Sweden|Norway|Denmark|Finland|Belgium|Switzerland|Austria|Greece|Romania|South Africa|Nigeria|Kenya|Egypt|Morocco|Israel|Turkey|Japan|South Korea|Singapore|Hong Kong|New Zealand)'
      OR (length(trim(COALESCE(location_name, ''))) <= 5 AND COALESCE(location_name, '') ~* '\mus\M')
      OR (
        COALESCE(location_name, '') != ''
        AND COALESCE(location_name, '') !~* '(remote|worldwide|global|anywhere)'
        AND (COALESCE(location_name, '') ~* ';' OR COALESCE(location_name, '') ~* '^[a-z].*,\s*[a-z]' OR length(trim(COALESCE(location_name, ''))) < 50)
      )
    )
  `;
  console.log(`Rejected by fence backstop: ${fenceRejected[0].cnt}`);

  // Gate 2: Natsec backstop
  const natsecRejected = await sql`
    SELECT count(*) as cnt FROM job
    WHERE status = 'active' AND job_embedding IS NOT NULL AND remote_scope = 'global'
    AND (
      COALESCE(normalized_text, '') ~* '(security clearance|top secret|ts/sci|secret clearance|confidential clearance|clearance required|active clearance|eligible for clearance)'
      OR COALESCE(normalized_text, '') ~* '(\mitar\M|\mear\M|export control|\mdod\M|department of defense|defense contract)'
      OR COALESCE(normalized_text, '') ~* '(national security|homeland security|intelligence community)'
      OR COALESCE(normalized_text, '') ~* '(e-verify|everify|public trust|polygraph|counterintelligence)'
    )
  `;
  console.log(`Rejected by natsec backstop: ${natsecRejected[0].cnt}`);

  // Gate 3: QA role backstop
  const qaRejected = await sql`
    SELECT count(*) as cnt FROM job
    WHERE status = 'active' AND job_embedding IS NOT NULL AND remote_scope = 'global'
    AND title ~* '(qa engineer|qa automation|quality assurance|software engineer in test|software development engineer in test|sdet|test automation engineer|automation tester|test engineer|qa lead|quality engineer)'
  `;
  console.log(`Rejected by QA role backstop: ${qaRejected[0].cnt}`);

  // Gate 4: Stack-disjoint (need to check against personas)
  // This is harder in pure SQL — we need to check each job against each persona
  // For now, count jobs that have NO JS-family tags (the most common persona family)
  const jsFamilyTags = [
    "typescript",
    "javascript",
    "react",
    "nextjs",
    "nodejs",
    "vue",
    "nuxt",
    "express",
    "graphql",
    "tailwindcss",
    "svelte",
    "sveltekit",
    "remix",
    "gatsby",
    "astro",
    "solidjs",
    "preact",
    "angular",
    "ember",
    "backbone",
    "jquery",
    "vite",
    "webpack",
    "babel",
    "esbuild",
    "rollup",
    "parcel",
    "redux",
    "mobx",
    "zustand",
    "recoil",
    "tanstack",
    "react-query",
    "prisma",
    "drizzle",
    "trpc",
    "hono",
    "elysia",
    "fastify",
    "koa",
    "nestjs",
    "typeorm",
    "sequelize",
    "mongoose",
    "mongodb",
  ];

  const noJsTags = await sql`
    SELECT count(*) as cnt FROM job
    WHERE status = 'active' AND job_embedding IS NOT NULL AND remote_scope = 'global'
    AND NOT (extracted_tags && ARRAY[${jsFamilyTags}]::text[])
  `;
  console.log(
    `Jobs with zero JS-family tags (stack-disjoint for JS persona): ${noJsTags[0].cnt}`,
  );

  // Gate 5: Distance + overlap (cosine > 0.5 or overlap < 2)
  // This depends on persona embeddings — we'll count how many of the remaining
  // jobs have cosine distance > 0.5 to ALL personas
  const distanceOverlapRejected = await sql`
    SELECT count(DISTINCT j.id) as cnt
    FROM job j
    CROSS JOIN persona p
    WHERE j.status = 'active' AND j.job_embedding IS NOT NULL AND j.remote_scope = 'global'
    AND p.persona_embedding IS NOT NULL
    AND (p.persona_embedding <=> j.job_embedding::vector) >= 0.5
    AND NOT EXISTS (
      SELECT 1 FROM match_queue mq
      WHERE mq.job_id = j.id AND mq.persona_id = p.id
    )
  `;
  console.log(
    `Jobs with no persona within cosine < 0.5: ${distanceOverlapRejected[0].cnt} (approximate — excludes already-matched)`,
  );

  // Surviving jobs (input to matching)
  const survivingJobs = await sql`
    SELECT count(*) as cnt FROM job
    WHERE status = 'active' AND job_embedding IS NOT NULL AND remote_scope = 'global'
    AND NOT (
      COALESCE(location_name, '') ~* '(United States|USA|Canada|Argentina|Brazil|Colombia|Mexico|Germany|France|Spain|Italy|Portugal|Netherlands|Poland|Ukraine|India|Pakistan|Philippines|Australia|United Kingdom|England|Scotland|Wales|Ireland|Sweden|Norway|Denmark|Finland|Belgium|Switzerland|Austria|Greece|Romania|South Africa|Nigeria|Kenya|Egypt|Morocco|Israel|Turkey|Japan|South Korea|Singapore|Hong Kong|New Zealand)'
      OR (length(trim(COALESCE(location_name, ''))) <= 5 AND COALESCE(location_name, '') ~* '\mus\M')
      OR (
        COALESCE(location_name, '') != ''
        AND COALESCE(location_name, '') !~* '(remote|worldwide|global|anywhere)'
        AND (COALESCE(location_name, '') ~* ';' OR COALESCE(location_name, '') ~* '^[a-z].*,\s*[a-z]' OR length(trim(COALESCE(location_name, ''))) < 50)
      )
    )
    AND NOT (
      COALESCE(normalized_text, '') ~* '(security clearance|top secret|ts/sci|secret clearance|confidential clearance|clearance required|active clearance|eligible for clearance)'
      OR COALESCE(normalized_text, '') ~* '(\mitar\M|\mear\M|export control|\mdod\M|department of defense|defense contract)'
      OR COALESCE(normalized_text, '') ~* '(national security|homeland security|intelligence community)'
      OR COALESCE(normalized_text, '') ~* '(e-verify|everify|public trust|polygraph|counterintelligence)'
    )
    AND NOT (title ~* '(qa engineer|qa automation|quality assurance|software engineer in test|software development engineer in test|sdet|test automation engineer|automation tester|test engineer|qa lead|quality engineer)')
  `;
  console.log(`Jobs surviving all SQL backstops: ${survivingJobs[0].cnt}`);
  console.log(
    `(These go into Gate 1+2 tag overlap + cosine distance matching)\n`,
  );

  // ── 4.1: slugger_retry by discovery_source ──────────────────────────────
  console.log("── 4.1: slugger_retry by discovery_source ──\n");

  const bySource = await sql`
    SELECT discovery_source, count(*) as cnt,
      count(DISTINCT company_name) as unique_companies,
      avg(retry_count)::numeric(10,2) as avg_retries
    FROM slugger_retry
    GROUP BY discovery_source
    ORDER BY cnt DESC
  `;
  console.log("slugger_retry by discovery_source:");
  for (const r of bySource) {
    console.log(
      `  ${r.discovery_source ?? "null"}: ${r.cnt} rows, ${r.unique_companies} unique companies, avg retries: ${r.avg_retries}`,
    );
  }
  console.log();

  // Sample from each source
  for (const r of bySource) {
    const source = r.discovery_source;
    const samples = await sql`
      SELECT company_name, retry_count, next_retry_at, created_at
      FROM slugger_retry
      WHERE discovery_source = ${source}
      ORDER BY created_at DESC
      LIMIT 10
    `;
    console.log(`Samples from ${source}:`);
    for (const s of samples) {
      console.log(
        `  "${s.company_name?.slice(0, 60)}" retries=${s.retry_count} next=${s.next_retry_at?.toISOString()?.slice(0, 10) ?? "null"}`,
      );
    }
    console.log();
  }

  // ── text_hash status ────────────────────────────────────────────────────
  console.log("── text_hash status ──\n");

  const textHashStatus = await sql`
    SELECT
      count(*) FILTER (WHERE text_hash IS NOT NULL) as with_hash,
      count(*) FILTER (WHERE text_hash IS NULL) as without_hash,
      count(*) as total
    FROM job
    WHERE status = 'active'
  `;
  console.log(`Active jobs with text_hash: ${textHashStatus[0].with_hash}`);
  console.log(
    `Active jobs without text_hash: ${textHashStatus[0].without_hash}`,
  );
  console.log(`Total active: ${textHashStatus[0].total}\n`);

  // Check for duplicates by text_hash
  const duplicates = await sql`
    SELECT text_hash, count(*) as cnt,
      array_agg(ats_slug) as slugs,
      array_agg(title) as titles
    FROM job
    WHERE text_hash IS NOT NULL AND status = 'active'
    GROUP BY text_hash
    HAVING count(*) > 1
    ORDER BY cnt DESC
    LIMIT 20
  `;
  console.log(
    `Duplicate groups (same text_hash, active jobs): ${duplicates.length}`,
  );
  for (const d of duplicates) {
    console.log(
      `  hash=${d.text_hash.slice(0, 12)}... count=${d.cnt} slugs=${JSON.stringify(d.slugs)}`,
    );
    console.log(
      `    titles: ${JSON.stringify(d.titles?.map((t: string) => t?.slice(0, 50)))}`,
    );
  }
  console.log();

  // ── Neon storage ────────────────────────────────────────────────────────
  console.log("── Neon storage (for ledger) ──\n");

  const storage =
    await sql`SELECT pg_database_size(current_database()) as size_bytes`;
  const sizeMb = Number(storage[0].size_bytes) / (1024 * 1024);
  console.log(`pg_database_size: ${sizeMb.toFixed(1)} MB`);
  console.log(`Limit: 512 MB (Neon free tier)`);
  console.log(`Usage: ${((sizeMb / 512) * 100).toFixed(1)}%`);
  console.log();

  console.log("=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
