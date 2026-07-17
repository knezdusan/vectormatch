// Directive 12 — Step 2.2: False-rejection audit
// scripts/d12-false-rejection-audit.ts
//
// Samples 30 jobs from each gate's rejects and outputs them for full-text review.
// Gates: fence, natsec, QA, stack-disjoint (JS family)
//
// For each rejected job, outputs: title, location, remote_scope, ats_slug,
// extracted_tags, and a snippet of normalized_text so the reviewer can
// determine if the rejection was correct (true positive) or a false rejection.

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const JS_FAMILY_TAGS = [
  "typescript", "javascript", "react", "nextjs", "nodejs", "vue", "nuxt",
  "express", "graphql", "tailwindcss", "svelte", "sveltekit", "remix",
  "gatsby", "astro", "solidjs", "preact", "angular", "ember", "backbone",
  "jquery", "vite", "webpack", "babel", "esbuild", "rollup", "parcel",
  "redux", "mobx", "zustand", "recoil", "tanstack", "react-query",
  "prisma", "drizzle", "trpc", "hono", "elysia", "fastify", "koa",
  "nestjs", "typeorm", "sequelize", "mongoose", "mongodb",
];

async function main() {
  console.log("=== DIRECTIVE 12 — STEP 2.2: FALSE-REJECTION AUDIT ===\n");

  // ── Gate 1: Fence backstop rejects ──────────────────────────────────────
  console.log("═══ GATE 1: FENCE BACKSTOP REJECTS (30 samples) ═══\n");

  const fenceRejects = await sql`
    SELECT id, title, ats_slug, location_name, remote_scope, workplace_type,
           extracted_tags, left(normalized_text, 500) as text_snippet
    FROM job
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
    ORDER BY RANDOM()
    LIMIT 30
  `;

  for (let i = 0; i < fenceRejects.length; i++) {
    const j = fenceRejects[i];
    console.log(`[${i + 1}] ${j.ats_slug} — ${j.title?.slice(0, 60)}`);
    console.log(`    location: "${j.location_name}"`);
    console.log(`    scope: ${j.remote_scope}, workplace: ${j.workplace_type ?? "null"}`);
    console.log(`    tags: ${JSON.stringify(j.extracted_tags?.slice(0, 10))}`);
    console.log(`    text: ${j.text_snippet?.slice(0, 200)}`);
    console.log();
  }

  // ── Gate 2: Natsec backstop rejects ─────────────────────────────────────
  console.log("═══ GATE 2: NATSEC BACKSTOP REJECTS (30 samples) ═══\n");

  const natsecRejects = await sql`
    SELECT id, title, ats_slug, location_name, remote_scope,
           extracted_tags, left(normalized_text, 800) as text_snippet
    FROM job
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
    AND (
      COALESCE(normalized_text, '') ~* '(security clearance|top secret|ts/sci|secret clearance|confidential clearance|clearance required|active clearance|eligible for clearance)'
      OR COALESCE(normalized_text, '') ~* '(\mitar\M|\mear\M|export control|\mdod\M|department of defense|defense contract)'
      OR COALESCE(normalized_text, '') ~* '(national security|homeland security|intelligence community)'
      OR COALESCE(normalized_text, '') ~* '(e-verify|everify|public trust|polygraph|counterintelligence)'
    )
    ORDER BY RANDOM()
    LIMIT 30
  `;

  for (let i = 0; i < natsecRejects.length; i++) {
    const j = natsecRejects[i];
    console.log(`[${i + 1}] ${j.ats_slug} — ${j.title?.slice(0, 60)}`);
    console.log(`    location: "${j.location_name}"`);
    console.log(`    tags: ${JSON.stringify(j.extracted_tags?.slice(0, 10))}`);
    // Find which keyword triggered the match
    const text = (j.text_snippet ?? "").toLowerCase();
    const triggers: string[] = [];
    if (text.includes("security clearance")) triggers.push("security clearance");
    if (text.includes("top secret")) triggers.push("top secret");
    if (text.includes("ts/sci")) triggers.push("ts/sci");
    if (text.includes("secret clearance")) triggers.push("secret clearance");
    if (text.includes("confidential")) triggers.push("confidential");
    if (text.includes("clearance")) triggers.push("clearance");
    if (/\bitar\b/.test(text)) triggers.push("itar");
    if (/\bear\b/.test(text)) triggers.push("ear");
    if (text.includes("export control")) triggers.push("export control");
    if (/\bdod\b/.test(text)) triggers.push("dod");
    if (text.includes("department of defense")) triggers.push("department of defense");
    if (text.includes("defense contract")) triggers.push("defense contract");
    if (text.includes("national security")) triggers.push("national security");
    if (text.includes("homeland security")) triggers.push("homeland security");
    if (text.includes("intelligence community")) triggers.push("intelligence community");
    if (text.includes("e-verify") || text.includes("everify")) triggers.push("e-verify");
    if (text.includes("public trust")) triggers.push("public trust");
    if (text.includes("polygraph")) triggers.push("polygraph");
    if (text.includes("counterintelligence")) triggers.push("counterintelligence");
    if (text.includes("background investigation")) triggers.push("background investigation");
    console.log(`    TRIGGERS: ${triggers.join(", ")}`);
    console.log(`    text: ${j.text_snippet?.slice(0, 400)}`);
    console.log();
  }

  // ── Gate 3: QA role rejects ─────────────────────────────────────────────
  console.log("═══ GATE 3: QA ROLE REJECTS (all, max 30) ═══\n");

  const qaRejects = await sql`
    SELECT id, title, ats_slug, location_name, remote_scope,
           extracted_tags, left(normalized_text, 300) as text_snippet
    FROM job
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
    AND title ~* '(qa engineer|qa automation|quality assurance|software engineer in test|software development engineer in test|sdet|test automation engineer|automation tester|test engineer|qa lead|quality engineer)'
    ORDER BY RANDOM()
    LIMIT 30
  `;

  for (let i = 0; i < qaRejects.length; i++) {
    const j = qaRejects[i];
    console.log(`[${i + 1}] ${j.ats_slug} — ${j.title?.slice(0, 60)}`);
    console.log(`    tags: ${JSON.stringify(j.extracted_tags?.slice(0, 10))}`);
    console.log(`    text: ${j.text_snippet?.slice(0, 200)}`);
    console.log();
  }

  // ── Gate 4: Stack-disjoint rejects (JS family) ──────────────────────────
  console.log("═══ GATE 4: STACK-DISJOINT REJECTS (zero JS-family tags, 30 samples) ═══\n");

  const stackRejects = await sql`
    SELECT id, title, ats_slug, location_name, remote_scope,
           extracted_tags, left(normalized_text, 300) as text_snippet
    FROM job
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
    AND NOT (extracted_tags && ARRAY[${JS_FAMILY_TAGS}]::text[])
    ORDER BY RANDOM()
    LIMIT 30
  `;

  for (let i = 0; i < stackRejects.length; i++) {
    const j = stackRejects[i];
    console.log(`[${i + 1}] ${j.ats_slug} — ${j.title?.slice(0, 60)}`);
    console.log(`    tags: ${JSON.stringify(j.extracted_tags)}`);
    console.log(`    text: ${j.text_snippet?.slice(0, 200)}`);
    console.log();
  }

  // ── Summary counts ──────────────────────────────────────────────────────
  console.log("═══ SUMMARY ═══\n");
  console.log(`Fence rejects sampled: ${fenceRejects.length}`);
  console.log(`Natsec rejects sampled: ${natsecRejects.length}`);
  console.log(`QA rejects sampled: ${qaRejects.length}`);
  console.log(`Stack-disjoint rejects sampled: ${stackRejects.length}`);
  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
