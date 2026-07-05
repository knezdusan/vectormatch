/**
 * TEMPORARY diagnostic — shows sample text from "no match" and "hybrid/onsite"
 * jobs to identify missing patterns. Read-only.
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 2 });

  try {
    // Sample "no match" jobs — jobs with remote-related text that DON'T match
    // any high-confidence or medium-confidence pattern
    const noMatch = await pool.query(`
      SELECT id, title, location_name,
             left(normalized_text, 500) as text_sample
      FROM job
      WHERE remote_scope = 'unknown'
        AND normalized_text IS NOT NULL
        AND length(normalized_text) > 50
        AND normalized_text ~* 'remote'
        AND normalized_text !~* '(worldwide|work.from.anywhere|remote.first|distributed.team|global.remote|remote.-.global|no.location.restriction|location.independent|borderless|US.only|USA.only|UK.only|EU.only|EMEA.only|APAC.only|LATAM.only|W-?2.only|must.reside|must.be.based|right.to.work|authorized.to.work|relocation|hybrid|on.site|in.office)'
      LIMIT 15
    `);

    console.log("=== 'No match' jobs (mention 'remote' but no pattern hit) ===\n");
    for (const row of noMatch.rows) {
      console.log(`--- ${row.title} | location: ${row.location_name} ---`);
      console.log(row.text_sample?.substring(0, 300));
      console.log();
    }

    // Sample "hybrid/onsite" jobs
    const hybrid = await pool.query(`
      SELECT id, title, location_name,
             left(normalized_text, 500) as text_sample
      FROM job
      WHERE remote_scope = 'unknown'
        AND normalized_text IS NOT NULL
        AND length(normalized_text) > 50
        AND normalized_text ~* '(hybrid|on.site|in.office)'
      LIMIT 10
    `);

    console.log("\n=== 'Hybrid/onsite' jobs (should these be classified as onsite?) ===\n");
    for (const row of hybrid.rows) {
      console.log(`--- ${row.title} | location: ${row.location_name} ---`);
      console.log(row.text_sample?.substring(0, 300));
      console.log();
    }

    // Check what remote-related phrases appear most frequently in unknown-scope jobs
    const phraseFreq = await pool.query(`
      SELECT
        count(*) FILTER (WHERE normalized_text ~* 'remote.work') as remote_work,
        count(*) FILTER (WHERE normalized_text ~* 'remote.position') as remote_position,
        count(*) FILTER (WHERE normalized_text ~* 'remote.job') as remote_job,
        count(*) FILTER (WHERE normalized_text ~* 'remote.role') as remote_role,
        count(*) FILTER (WHERE normalized_text ~* 'remote.employment') as remote_employment,
        count(*) FILTER (WHERE normalized_text ~* 'remote.opportunity') as remote_opportunity,
        count(*) FILTER (WHERE normalized_text ~* 'work.from.home') as wfh,
        count(*) FILTER (WHERE normalized_text ~* 'telecommut') as telecommute,
        count(*) FILTER (WHERE normalized_text ~* 'virtual') as virtual,
        count(*) FILTER (WHERE normalized_text ~* 'fully.remote') as fully_remote,
        count(*) FILTER (WHERE normalized_text ~* '100%.remote') as pct_remote,
        count(*) FILTER (WHERE normalized_text ~* 'remote.friendly') as remote_friendly,
        count(*) FILTER (WHERE normalized_text ~* 'remote.optional') as remote_optional,
        count(*) FILTER (WHERE normalized_text ~* 'remote.available') as remote_available,
        count(*) FILTER (WHERE normalized_text ~* 'may.be.remote') as may_be_remote,
        count(*) FILTER (WHERE normalized_text ~* 'open.to.remote') as open_to_remote
      FROM job
      WHERE remote_scope = 'unknown'
        AND normalized_text IS NOT NULL
        AND length(normalized_text) > 50
    `);

    console.log("=== Remote-related phrase frequency in unknown-scope jobs ===");
    const freq = phraseFreq.rows[0];
    for (const [phrase, count] of Object.entries(freq)) {
      if (Number(count) > 0) {
        console.log(`  ${phrase}: ${count}`);
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
