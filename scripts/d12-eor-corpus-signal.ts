// Directive 12 — Step 3.2: Corpus-side EOR signal test
// scripts/d12-eor-corpus-signal.ts
//
// Tests the EOR signal: how many existing jobs mention "via Deel / Remote.com /
// Oyster / our EOR partner" in text, and what is THEIR genuine-global rate
// vs baseline?
//
// Also resolves the standing contradiction: remotecom = top-3 KEEP with 31
// addressable in Devin's own retro-triage vs "very low yield" in the D11 probe.

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("=== CORPUS-SIDE EOR SIGNAL TEST ===\n");

  // 1. Count jobs mentioning EOR providers in text
  const eorJobs = await sql`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE remote_scope = 'global') as global,
      count(*) FILTER (WHERE remote_scope = 'country_fenced') as fenced,
      count(*) FILTER (WHERE remote_scope = 'onsite') as onsite,
      count(*) FILTER (WHERE remote_scope IS NULL) as null_scope,
      count(*) FILTER (WHERE status = 'active') as active,
      count(DISTINCT ats_slug) as unique_companies
    FROM job
    WHERE normalized_text ILIKE '%via deel%'
       OR normalized_text ILIKE '%via remote.com%'
       OR normalized_text ILIKE '%via remote %'
       OR normalized_text ILIKE '%via oyster%'
       OR normalized_text ILIKE '%eor partner%'
       OR normalized_text ILIKE '%through deel%'
       OR normalized_text ILIKE '%through remote%'
       OR normalized_text ILIKE '%through oyster%'
       OR normalized_text ILIKE '%deel.com%'
       OR normalized_text ILIKE '%oysterhr%'
       OR normalized_text ILIKE '%our eor%'
       OR normalized_text ILIKE '%employer of record%'
  `;

  console.log("Jobs mentioning EOR providers in text:");
  console.log(`  Total: ${eorJobs[0].total}`);
  console.log(`  Active: ${eorJobs[0].active}`);
  console.log(`  Global scope: ${eorJobs[0].global}`);
  console.log(`  Fenced scope: ${eorJobs[0].fenced}`);
  console.log(`  Onsite scope: ${eorJobs[0].onsite}`);
  console.log(`  Null scope: ${eorJobs[0].null_scope}`);
  console.log(`  Unique companies: ${eorJobs[0].unique_companies}`);

  // 2. Baseline: all jobs global rate
  const baseline = await sql`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE remote_scope = 'global') as global,
      count(*) FILTER (WHERE status = 'active') as active
    FROM job
  `;
  const baselineGlobalRate = (Number(baseline[0].global) / Number(baseline[0].total) * 100).toFixed(1);
  console.log(`\nBaseline: ${baseline[0].total} total jobs, ${baseline[0].global} global (${baselineGlobalRate}%)`);

  if (Number(eorJobs[0].total) > 0) {
    const eorGlobalRate = (Number(eorJobs[0].global) / Number(eorJobs[0].total) * 100).toFixed(1);
    console.log(`EOR jobs global rate: ${eorGlobalRate}% vs baseline ${baselineGlobalRate}%`);
  }

  // 3. remotecom specifically — the contradiction
  console.log("\n── remotecom slug analysis (KEEP contradiction) ──\n");

  const remotecom = await sql`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE status = 'active') as active,
      count(*) FILTER (WHERE remote_scope = 'global') as global,
      count(*) FILTER (WHERE remote_scope = 'country_fenced') as fenced,
      count(*) FILTER (WHERE remote_scope = 'onsite') as onsite,
      count(*) FILTER (WHERE job_embedding IS NOT NULL) as embedded,
      count(DISTINCT title) as unique_titles
    FROM job
    WHERE ats_slug = 'remotecom' OR ats_slug ILIKE '%remotecom%'
  `;
  console.log(`remotecom jobs: ${remotecom[0].total} total, ${remotecom[0].active} active`);
  console.log(`  Global: ${remotecom[0].global}, Fenced: ${remotecom[0].fenced}, Onsite: ${remotecom[0].onsite}`);
  console.log(`  Embedded: ${remotecom[0].embedded}`);
  console.log(`  Unique titles: ${remotecom[0].unique_titles}`);

  // Sample remotecom job titles
  const remotecomSample = await sql`
    SELECT title, remote_scope, location_name, status
    FROM job
    WHERE ats_slug = 'remotecom' OR ats_slug ILIKE '%remotecom%'
    ORDER BY detected_at DESC
    LIMIT 20
  `;
  console.log("\nSample remotecom jobs:");
  for (const j of remotecomSample) {
    console.log(`  [${j.status}] ${j.title?.slice(0, 60)} | scope=${j.remote_scope} | loc=${j.location_name}`);
  }

  // 4. Check if remotecom is in the company table and its tier
  const remotecomCompany = await sql`
    SELECT ats_slug, company_name, tier, active_job_count, last_polled_at
    FROM company
    WHERE ats_slug = 'remotecom' OR ats_slug ILIKE '%remotecom%'
  `;
  console.log("\nremotecom in company table:");
  for (const c of remotecomCompany) {
    console.log(`  ${c.ats_slug}: tier=${c.tier}, jobs=${c.active_job_count}, last_polled=${c.last_polled_at?.toISOString()?.slice(0, 10) ?? "never"}`);
  }

  // 5. Check the "31 addressable" claim from the retro-triage
  // Look for jobs from remotecom that are active + global + embedded
  const addressable = await sql`
    SELECT count(*) as cnt
    FROM job
    WHERE (ats_slug = 'remotecom' OR ats_slug ILIKE '%remotecom%')
    AND status = 'active'
    AND remote_scope = 'global'
    AND job_embedding IS NOT NULL
  `;
  console.log(`\nremotecom addressable (active + global + embedded): ${addressable[0].cnt}`);

  // 6. Check for EOR-related companies in the company table
  const eorCompanies = await sql`
    SELECT ats_slug, company_name, tier, active_job_count
    FROM company
    WHERE company_name ILIKE '%deel%' OR company_name ILIKE '%oyster%' OR company_name ILIKE '%remote.com%' OR company_name ILIKE '%remote inc%'
    ORDER BY active_job_count DESC
  `;
  console.log("\nEOR-related companies in registry:");
  for (const c of eorCompanies) {
    console.log(`  ${c.ats_slug} (${c.company_name}): tier=${c.tier}, jobs=${c.active_job_count}`);
  }

  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
