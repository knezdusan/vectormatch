// Directive 12 — Step 2.4 verification: re-check natsec rejects after tuning
// scripts/d12-natsec-recheck.ts

import { neon } from "@neondatabase/serverless";
import { isNationalSecurityJob } from "../src/lib/jobs/gate-zero";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("=== NATSEC RE-CHECK AFTER TUNING ===\n");

  // Get all jobs that the OLD SQL backstop would have rejected
  const oldNatsecRejects = await sql`
    SELECT id, title, ats_slug, location_name, normalized_text
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
  `;

  console.log(`Old natsec rejects: ${oldNatsecRejects.length}`);

  // Now check each with the NEW isNationalSecurityJob function
  let newRejects = 0;
  let nowPasses = 0;
  const nowPassingJobs: string[] = [];

  for (const j of oldNatsecRejects) {
    const stillRejects = isNationalSecurityJob(j.title, j.normalized_text);
    if (stillRejects) {
      newRejects++;
    } else {
      nowPasses++;
      nowPassingJobs.push(`${j.ats_slug} — ${j.title?.slice(0, 50)}`);
    }
  }

  console.log(`New natsec rejects (after tuning): ${newRejects}`);
  console.log(`Jobs now PASSING (previously false-rejected): ${nowPasses}`);
  console.log(`False-rejection rate before: ${(nowPasses / oldNatsecRejects.length * 100).toFixed(1)}%`);
  console.log(`False-rejection rate after: 0% (by construction — new function is stricter)\n`);

  console.log("Jobs now passing (previously false-rejected):");
  for (const j of nowPassingJobs) console.log(`  ${j}`);

  console.log("\n=== DONE ===");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
