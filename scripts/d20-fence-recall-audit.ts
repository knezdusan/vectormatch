/**
 * D20 JOB 2.1: Fence recall audit — 30-sample of the +1746 newly-fenced jobs.
 *
 * The D19 migration backfilled is_fenced using the gate-1-2.ts regex. Before
 * D19: 1180 fenced. After: 2926 fenced. The +1746 newly-fenced jobs are the
 * audit target.
 *
 * Stratification:
 *  - TITLE-HIT: title matches US-remote / country-remote patterns (lines 30-35)
 *    → high confidence fence (explicit country in title)
 *  - LOCATION-HIT: location_name matches country/region/short-string patterns
 *    (lines 36-50) → medium confidence (location may be noisy)
 *  - BODY-HIT: normalized_text matches E-Verify / work-authorization patterns
 *    (lines 52-54) → medium confidence (body text may be boilerplate)
 *
 * Sample 10 from each stratum (30 total). For each sample, output:
 *  - id, title, location_name, remote_scope, ats_source
 *  - which pattern matched (title / location / body)
 *  - a snippet of normalized_text (for body-hits)
 *
 * Manual inspection: is the fence correct? (true positive = job is genuinely
 * country-restricted; false positive = job is actually global but matched a
 * noisy pattern)
 *
 * Run with: npx tsx scripts/d20-fence-recall-audit.ts
 */
import "dotenv/config";
import { db } from "../src/db/db";
import { sql } from "drizzle-orm";

// Title-hit patterns (from migration lines 30-35)
const TITLE_FENCE_REGEX = `(
  title ~* '(U\\.?S\\.?A?\\.?|United States)\\s*[-/]?\\s*Remote'
  OR title ~* 'Remote\\s*[-/]\\s*(U\\.?S\\.?A?\\.?|United States|USA)\\b'
  OR title ~* 'Remote\\s*[\\[(]\\s*(U\\.?S\\.?A?\\.?|United States|USA)\\s*[\\])]'
  OR title ~* 'Remote\\s*[,;:-]\\s*(U\\.?S\\.?A?\\.?|United States|USA)\\b'
  OR title ~* 'Remote\\s+within\\s+'
  OR title ~* 'Remote\\s*[;,-]\\s*(Argentina|Brazil|Colombia|Mexico|Canada|Germany|France|Spain|Italy|Portugal|Netherlands|Poland|Ukraine|India|Pakistan|Philippines|Australia|United Kingdom|UK|Ireland|Sweden|Norway|Denmark|Finland|Belgium|Switzerland|Austria|Greece|Romania|South Africa|Nigeria|Israel|Turkey|Japan|South Korea|Singapore|Hong Kong|New Zealand)'
)`;

// Body-hit patterns (E-Verify / work-authorization — from migration lines 52-54)
const BODY_FENCE_REGEX = `(
  COALESCE(normalized_text, '') ~* '\\be-?verify\\b'
  OR COALESCE(normalized_text, '') ~* '\\beligibility\\s+to\\s+work\\s+in\\s+(?:the\\s+)?(?:u\\.?s\\.?a?\\.?|united\\s+states)\\b'
  OR COALESCE(normalized_text, '') ~* '\\bauthorized\\s+to\\s+work\\s+in\\s+(?:the\\s+)?(?:u\\.?s\\.?a?\\.?|united\\s+states)\\b'
)`;

async function main() {
  // Count fenced jobs by stratum
  const counts = await db.execute(sql`
    SELECT
      CASE
        WHEN ${sql.raw(TITLE_FENCE_REGEX)} THEN 'title-hit'
        WHEN ${sql.raw(BODY_FENCE_REGEX)} THEN 'body-hit'
        ELSE 'location-hit'
      END AS stratum,
      count(*)::int AS c
    FROM job
    WHERE is_fenced = true
    GROUP BY stratum
    ORDER BY c DESC
  `);

  console.log("\n=== Fenced jobs by stratum (all 2926) ===");
  for (const row of counts.rows as Array<{ stratum: string; c: number }>) {
    console.log(`  ${row.stratum.padEnd(18)} ${row.c}`);
  }

  // Sample 10 from each stratum — use RANDOM() for unbiased sampling
  const SAMPLE_SIZE = 10;

  for (const stratum of ["title-hit", "location-hit", "body-hit"]) {
    let whereClause: string;
    if (stratum === "title-hit") {
      whereClause = `is_fenced = true AND ${TITLE_FENCE_REGEX}`;
    } else if (stratum === "body-hit") {
      whereClause = `is_fenced = true AND NOT ${TITLE_FENCE_REGEX} AND ${BODY_FENCE_REGEX}`;
    } else {
      whereClause = `is_fenced = true AND NOT ${TITLE_FENCE_REGEX} AND NOT ${BODY_FENCE_REGEX}`;
    }

    const sample = await db.execute(
      sql.raw(`
      SELECT
        id,
        title,
        location_name,
        remote_scope,
        ats_source,
        status,
        substring(coalesce(normalized_text, '') from 1 for 300) as text_snippet
      FROM job
      WHERE ${whereClause}
      ORDER BY RANDOM()
      LIMIT ${SAMPLE_SIZE}
    `),
    );

    console.log(`\n=== ${stratum.toUpperCase()} SAMPLE (10 jobs) ===`);
    console.log(
      "id".padEnd(10) +
        "title".padEnd(45) +
        "location".padEnd(25) +
        "scope".padEnd(12) +
        "source".padEnd(18),
    );
    for (const row of sample.rows as Array<{
      id: string;
      title: string;
      location_name: string | null;
      remote_scope: string;
      ats_source: string;
      status: string;
      text_snippet: string | null;
    }>) {
      console.log(
        row.id.slice(0, 8).padEnd(10) +
          (row.title ?? "").slice(0, 43).padEnd(45) +
          (row.location_name ?? "null").slice(0, 23).padEnd(25) +
          (row.remote_scope ?? "").padEnd(12) +
          (row.ats_source ?? "").padEnd(18),
      );
      if (stratum === "body-hit" && row.text_snippet) {
        // Show the E-Verify / work-auth context
        const snippet = row.text_snippet.replace(/\n/g, " ").slice(0, 200);
        console.log(`          text: ${snippet}...`);
      }
    }
  }

  // Also: count how many fenced jobs have remote_scope = 'global' (potential false fences)
  const globalFenced = await db.execute(sql`
    SELECT count(*)::int AS c
    FROM job
    WHERE is_fenced = true AND remote_scope = 'global'
  `);
  const totalFenced = await db.execute(sql`
    SELECT count(*)::int AS c FROM job WHERE is_fenced = true
  `);
  console.log("\n=== Cross-check: fenced jobs with remote_scope='global' ===");
  console.log(
    `  ${globalFenced.rows[0]?.c} of ${totalFenced.rows[0]?.c} fenced jobs are marked remote_scope='global'`,
  );
  console.log(
    "  (These are the most likely false fences — fence says 'restricted' but scope says 'global')",
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
