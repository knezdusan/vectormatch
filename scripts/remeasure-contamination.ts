/**
 * Re-measure remote_scope contamination after classifier fix
 *
 * The fix moves the location-based country fencing check to run BEFORE the
 * regex, so a job with workplace_type='remote' and location_name='Poland'
 * is classified as country_fenced regardless of JD text.
 *
 * This script re-classifies all existing 'global' jobs using the fixed logic
 * (location cross-reference) and reports the new contamination rate.
 * It does NOT modify the DB — it's a measurement only.
 *
 * Usage: npx tsx scripts/remeasure-contamination.ts
 */
import { neon } from "@neondatabase/serverless";
import { isSpecificLocation, extractLocationCountry } from "../src/lib/jobs/location-utils.ts";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  console.log("=== Re-measure: remote_scope='global' contamination after classifier fix ===\n");

  // 1. Get all jobs currently labeled 'global'
  const globalJobs = await sql`
    SELECT id, title, location_name, workplace_type, remote_scope,
           ats_source::text as ats_source, ats_slug
    FROM job
    WHERE status = 'active' AND remote_scope = 'global'
  `;
  console.log(`Total 'global' jobs in DB: ${globalJobs.length}`);

  // 2. Re-classify each using the fixed logic
  let wouldStayGlobal = 0;
  let wouldBecomeFenced = 0;
  let wouldBecomeOnsite = 0;
  const reclassified: any[] = [];

  for (const job of globalJobs) {
    const loc = job.location_name || "";
    const workplace = job.workplace_type;

    // Apply the fixed logic:
    // 1. If workplace='remote' and location is specific → country_fenced
    // 2. If workplace=null and location is specific → onsite (Rule 6)
    // 3. If workplace='remote' and location has remote indicator + country → country_fenced
    // 4. Otherwise → stays global (regex/LLM result unchanged)

    let newScope = "global";
    let reason = "no change";

    if (workplace === "remote" && loc && isSpecificLocation(loc)) {
      newScope = "country_fenced";
      reason = `remote + specific location "${loc}"`;
    } else if (workplace === null && loc && isSpecificLocation(loc)) {
      newScope = "onsite";
      reason = `null workplace + specific location "${loc}"`;
    } else if ((workplace === "remote" || workplace === null) && loc) {
      const lowerLoc = loc.toLowerCase();
      if (lowerLoc.includes("remote") || lowerLoc.includes("worldwide") || lowerLoc.includes("anywhere")) {
        const country = extractLocationCountry(loc);
        if (country) {
          newScope = "country_fenced";
          reason = `remote indicator + country ${country} in "${loc}"`;
        }
      }
    }

    if (newScope === "global") {
      wouldStayGlobal++;
    } else if (newScope === "country_fenced") {
      wouldBecomeFenced++;
      reclassified.push({
        id: job.id.substring(0, 8),
        title: job.title?.substring(0, 40),
        location: loc.substring(0, 40),
        workplace: workplace,
        old: "global",
        new: newScope,
        reason: reason.substring(0, 60),
      });
    } else if (newScope === "onsite") {
      wouldBecomeOnsite++;
      reclassified.push({
        id: job.id.substring(0, 8),
        title: job.title?.substring(0, 40),
        location: loc.substring(0, 40),
        workplace: workplace,
        old: "global",
        new: newScope,
        reason: reason.substring(0, 60),
      });
    }
  }

  // 3. Results
  console.log(`\n=== Re-classification Results ===`);
  console.log(`Would stay 'global':         ${wouldStayGlobal} (${((wouldStayGlobal / globalJobs.length) * 100).toFixed(1)}%)`);
  console.log(`Would become 'country_fenced': ${wouldBecomeFenced} (${((wouldBecomeFenced / globalJobs.length) * 100).toFixed(1)}%)`);
  console.log(`Would become 'onsite':         ${wouldBecomeOnsite} (${((wouldBecomeOnsite / globalJobs.length) * 100).toFixed(1)}%)`);

  const newContaminationRate = ((wouldBecomeFenced + wouldBecomeOnsite) / globalJobs.length) * 100;
  console.log(`\nOld contamination rate: 48.5%`);
  console.log(`New contamination rate: ${newContaminationRate.toFixed(1)}% (jobs that would be reclassified)`);
  console.log(`\nNote: This is the location-based fix only. The full fix also includes`);
  console.log(`multi-probe calibration (≥3 disjoint region probes) which would catch`);
  console.log(`additional cases where the location is "Remote" but the JD text`);
  console.log(`contains region-specific language (e.g., "must work EMEA hours").`);

  // 4. Show reclassified examples
  console.log(`\n=== Reclassified Examples (first 30) ===`);
  console.table(reclassified.slice(0, 30));

  // 5. Per-source breakdown
  console.log(`\n=== Per-Source Breakdown ===`);
  const bySource: Record<string, { total: number; stayGlobal: number; fenced: number; onsite: number }> = {};
  for (const job of globalJobs) {
    const source = job.ats_source;
    if (!bySource[source]) bySource[source] = { total: 0, stayGlobal: 0, fenced: 0, onsite: 0 };
    bySource[source].total++;

    const loc = job.location_name || "";
    const workplace = job.workplace_type;
    if (workplace === "remote" && loc && isSpecificLocation(loc)) {
      bySource[source].fenced++;
    } else if (workplace === null && loc && isSpecificLocation(loc)) {
      bySource[source].onsite++;
    } else if ((workplace === "remote" || workplace === null) && loc) {
      const lowerLoc = loc.toLowerCase();
      if (lowerLoc.includes("remote") || lowerLoc.includes("worldwide") || lowerLoc.includes("anywhere")) {
        const country = extractLocationCountry(loc);
        if (country) bySource[source].fenced++;
        else bySource[source].stayGlobal++;
      } else {
        bySource[source].stayGlobal++;
      }
    } else {
      bySource[source].stayGlobal++;
    }
  }
  console.table(
    Object.entries(bySource).map(([source, s]) => ({
      source,
      total: s.total,
      stay_global: s.stayGlobal,
      become_fenced: s.fenced,
      become_onsite: s.onsite,
      fix_rate: `${(((s.fenced + s.onsite) / s.total) * 100).toFixed(1)}%`,
    }))
  );

  // 6. What the "global" set looks like after the fix
  console.log(`\n=== Post-Fix 'global' Set ===`);
  console.log(`Jobs that would remain 'global': ${wouldStayGlobal}`);
  console.log(`These are jobs where the location is NOT a specific place — either:`);
  console.log(`  - Location is "Remote" (no country)`);
  console.log(`  - Location is "Global" / "Worldwide" / "Anywhere"`);
  console.log(`  - Location is null/empty`);
  console.log(`  - Location is a broad region (EMEA, APAC, etc.)`);
  console.log(`These would need the multi-probe calibration to further validate.`);

  process.exit(0);
}

main().catch(err => {
  console.error("Re-measurement failed:", err);
  process.exit(1);
});
