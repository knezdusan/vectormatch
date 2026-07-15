/**
 * Multi-Probe Analysis: How clean is remote_scope='global'?
 *
 * The L2 thesis is "enlist companies by how globally-remote they are."
 * But if "global" is assigned from a single CET-biased perspective, EMEA-fenced
 * jobs will be mislabeled as global. This script measures the current contamination.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log(
    "=== Multi-Probe Analysis: How clean is remote_scope=global? ===\n",
  );

  // 1. Current remote_scope distribution
  const scopeDist = await sql`
    SELECT remote_scope, COUNT(*) as cnt
    FROM job WHERE status = 'active'
    GROUP BY remote_scope ORDER BY cnt DESC
  `;
  console.log("remote_scope distribution (active jobs):");
  console.table(scopeDist);

  // 2. For jobs marked remote_scope='global', what do their locations say?
  const globalLocations = await sql`
    SELECT location_name, COUNT(*) as cnt
    FROM job
    WHERE status = 'active' AND remote_scope = 'global'
      AND location_name IS NOT NULL AND location_name != ''
    GROUP BY location_name
    ORDER BY cnt DESC
    LIMIT 30
  `;
  console.log("\nTop 30 locations for jobs marked remote_scope=global:");
  console.table(globalLocations);

  // 3. How many 'global' jobs have location strings that suggest fencing?
  const suspiciousGlobal = await sql`
    SELECT COUNT(*) as cnt FROM job
    WHERE status = 'active' AND remote_scope = 'global'
      AND (
        location_name ILIKE '%Poland%' OR
        location_name ILIKE '%Germany%' OR
        location_name ILIKE '%India%' OR
        location_name ILIKE '%Ukraine%' OR
        location_name ILIKE '%EMEA%' OR
        location_name ILIKE '%APAC%' OR
        location_name ILIKE '%Latam%' OR
        location_name ILIKE '%Europe%' OR
        location_name ILIKE '%UK%' OR
        location_name ILIKE '%London%' OR
        location_name ILIKE '%Berlin%' OR
        location_name ILIKE '%Toronto%' OR
        location_name ILIKE '%Canada%' OR
        location_name ILIKE '%Serbia%' OR
        location_name ILIKE '%Brazil%' OR
        location_name ILIKE '%Pakistan%' OR
        location_name ILIKE '%Bangalore%' OR
        location_name ILIKE '%Delhi%' OR
        location_name ILIKE '%Lagos%' OR
        location_name ILIKE '%Nigeria%' OR
        location_name ILIKE '%San Francisco%' OR
        location_name ILIKE '%New York%' OR
        location_name ILIKE '%US%' OR
        location_name ILIKE '%USA%'
      )
  `;
  const totalGlobal = await sql`
    SELECT COUNT(*) as cnt FROM job
    WHERE status = 'active' AND remote_scope = 'global'
  `;

  const suspiciousCount = Number(suspiciousGlobal[0].cnt);
  const totalCount = Number(totalGlobal[0].cnt);
  const suspiciousRate =
    totalCount > 0 ? ((suspiciousCount / totalCount) * 100).toFixed(1) : "N/A";

  console.log("\n=== Contamination Analysis ===");
  console.log(`Total "global" jobs: ${totalCount}`);
  console.log(
    `"global" jobs with suspicious location strings: ${suspiciousCount}`,
  );
  console.log(`Contamination rate: ${suspiciousRate}%`);

  // 4. Show some examples of suspicious "global" jobs
  const suspiciousExamples = await sql`
    SELECT title, location_name, remote_scope, ats_slug
    FROM job
    WHERE status = 'active' AND remote_scope = 'global'
      AND (
        location_name ILIKE '%Poland%' OR
        location_name ILIKE '%Germany%' OR
        location_name ILIKE '%India%' OR
        location_name ILIKE '%Ukraine%' OR
        location_name ILIKE '%EMEA%' OR
        location_name ILIKE '%APAC%' OR
        location_name ILIKE '%Europe%' OR
        location_name ILIKE '%London%' OR
        location_name ILIKE '%Berlin%' OR
        location_name ILIKE '%Canada%' OR
        location_name ILIKE '%San Francisco%' OR
        location_name ILIKE '%US%' OR
        location_name ILIKE '%USA%'
      )
    LIMIT 15
  `;
  console.log("\nSuspicious 'global' examples (location suggests fencing):");
  console.table(suspiciousExamples);

  // 5. The multi-probe design
  console.log("\n=== Multi-Probe Design for L2 ===");
  console.log(
    "Problem: remote_scope is assigned from a single CET-biased perspective.",
  );
  console.log(
    "A job that says 'Remote within EMEA' may be labeled 'region_fenced' (correct),",
  );
  console.log(
    "but a job that says 'Remote' with location 'London' may be labeled 'global'",
  );
  console.log("if the extractor does not catch the London-specific fencing.");
  console.log("");
  console.log(
    "Solution: Add geographically disjoint probe personas (e.g., LATAM, SE Asia).",
  );
  console.log(
    "Award 'global' only when a job clears probes across disjoint regions/timezones.",
  );
  console.log(
    "This makes the remote-density score (the L2 targeting signal) mean",
  );
  console.log("'worldwide-global,' not 'global-from-CET.'");
  console.log("");
  console.log(
    "Implementation: The remote-scope-extractor currently uses a single-applicant",
  );
  console.log(
    "perspective. For L2, add a multi-probe check: a job is only 'global' if it",
  );
  console.log(
    "passes geo-fencing checks from 3+ disjoint regions (CET, LATAM, SE Asia).",
  );
  console.log(
    "This prevents EMEA-fenced jobs from being mislabeled as global and enlisted",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Multi-probe analysis failed:", err);
  process.exit(1);
});
