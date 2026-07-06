/**
 * TEMPORARY diagnostic script — validates the expanded remote-scope pattern
 * dictionary against the live corpus using the ACTUAL step1RegexHardSignals
 * function. Read-only: no mutations, no writes.
 *
 * Run: npx tsx scripts/validate-remote-scope-patterns.ts
 * Delete after use.
 */
import "dotenv/config";
import { Pool } from "@neondatabase/serverless";

// Mock server-only so we can import the extractor in a script context
import { Module } from "module";

const originalResolve = (Module as any)._resolveFilename;
(Module as any)._resolveFilename = function (request: string, ...args: any[]) {
  if (request === "server-only") return require.resolve("path");
  return originalResolve.call(this, request, ...args);
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url, max: 2 });

  // Import the actual function
  const { step1RegexHardSignals } = await import(
    "../src/lib/jobs/remote-scope-extractor"
  );

  try {
    // 1. Count jobs by remote_scope
    const scopeCounts = await pool.query(`
      SELECT remote_scope, count(*) as cnt
      FROM job
      GROUP BY remote_scope
      ORDER BY cnt DESC
    `);
    console.log("=== Current remote_scope distribution ===");
    for (const row of scopeCounts.rows) {
      console.log(`  ${row.remote_scope}: ${row.cnt}`);
    }

    // 2. Count jobs with remote_scope='unknown' that have normalized_text
    const unknownWithText = await pool.query(`
      SELECT count(*) as cnt
      FROM job
      WHERE remote_scope = 'unknown'
        AND normalized_text IS NOT NULL
        AND length(normalized_text) > 50
    `);
    const unknownCount = unknownWithText.rows[0]?.cnt ?? 0;
    console.log(
      `\n=== Jobs with remote_scope='unknown' and non-trivial normalized_text: ${unknownCount} ===`,
    );

    if (unknownCount === 0) {
      console.log("No unknown-scope jobs to validate against. Exiting.");
      return;
    }

    // 3. Sample unknown-scope jobs — get workplaceType + atsSource + text
    //    Filter to jobs with remote-scope-relevant text
    const samples = await pool.query(`
      SELECT id, title, location_name, remote_scope, workplace_type, ats_source,
             left(normalized_text, 2000) as text_sample
      FROM job
      WHERE remote_scope = 'unknown'
        AND normalized_text IS NOT NULL
        AND length(normalized_text) > 50
        AND normalized_text ~* '(remote|anywhere|worldwide|global|distributed|location.independent|borderless|US.only|USA.only|UK.only|EU.only|EMEA|APAC|LATAM|authorized|W-?2|must.reside|must.be.based|right.to.work|relocation|hybrid|on.site|in.office|UTC|CET|EST|PST|fully.remote|100%.remote)'
      LIMIT 300
    `);

    console.log(
      `\n=== Sampled ${samples.rows.length} unknown-scope jobs with remote-scope-relevant text ===`,
    );

    // 4. Test the ACTUAL step1RegexHardSignals against each sample
    let highConfMatches = 0;
    let mediumConfMatches = 0;
    const utcMatches = 0;
    let classifiedOnsite = 0;
    let noMatch = 0;
    const matchExamples: string[] = [];
    const scopeBreakdown: Record<string, number> = {};

    for (const row of samples.rows) {
      const text = row.text_sample ?? "";
      const workplaceType = row.workplace_type as
        | "remote"
        | "hybrid"
        | "on-site"
        | null;

      const result = step1RegexHardSignals(text, workplaceType);

      if (result === null) {
        noMatch++;
        continue;
      }

      // Track by resolvedBy + scope
      const key = `${result.resolvedBy}:${result.remoteScope}`;
      scopeBreakdown[key] = (scopeBreakdown[key] ?? 0) + 1;

      if (result.remoteScope === "onsite") {
        classifiedOnsite++;
      } else if (result.confidence >= 1.0) {
        highConfMatches++;
      } else if (result.confidence >= 0.7) {
        // Could be medium-confidence pattern or UTC range
        mediumConfMatches++;
      }

      if (matchExamples.length < 30) {
        matchExamples.push(
          `  [${result.remoteScope} conf=${result.confidence} by=${result.resolvedBy}] "${row.title}" (workplaceType=${workplaceType}, ats=${row.ats_source})`,
        );
      }
    }

    const totalResolvable =
      highConfMatches + mediumConfMatches + classifiedOnsite;
    const totalSampled = samples.rows.length;
    const resolutionRate = ((totalResolvable / totalSampled) * 100).toFixed(1);

    console.log(
      "\n=== Pattern dictionary validation results (actual step1RegexHardSignals) ===",
    );
    console.log(`  Sample size: ${totalSampled} unknown-scope jobs`);
    console.log(`  High-confidence matches: ${highConfMatches}`);
    console.log(`  Medium-confidence matches: ${mediumConfMatches}`);
    console.log(
      `  Classified as onsite (hybrid/onsite text): ${classifiedOnsite}`,
    );
    console.log(`  No match (would route to LLM): ${noMatch}`);
    console.log(`\n  Total deterministic resolution rate: ${resolutionRate}%`);
    console.log(`  (Target: 75-80% per Task A2 spec)`);

    console.log("\n=== Breakdown by resolvedBy:scope ===");
    for (const [key, count] of Object.entries(scopeBreakdown).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${key}: ${count}`);
    }

    console.log("\n=== Sample matches (first 30) ===");
    for (const ex of matchExamples) {
      console.log(ex);
    }

    // 5. Compare with old MVP patterns (inline, for fair comparison)
    const oldMvpPatterns = [
      /\bremote\s*[-–]\s*(?:global|worldwide|anywhere)\b/i,
      /\b(?:global[,\s]+remote|remote[,\s]+global)\b/i,
      /\bwork\s+from\s+anywhere\b/i,
      /\bwork\s+from\s+any\s+location\b/i,
      /\bany\s+country\b/i,
      /\bany\s+location\b/i,
      /\bworldwide\b/i,
      /\bremote[- ]first\b/i,
      /\bdistributed\s+(?:team|workforce|company|organization)\b/i,
      /\bteam\s+members\s+across\s+\d+\s+countries\b/i,
      /\boperates?\s+in\s+\d+\s+countries\b/i,
      /\bremote\s*[-–]\s*(?:us|usa|united\s+states|u\.s\.)\b/i,
      /\bremote\s*[-–]\s*(?:uk|united\s+kingdom|england)\b/i,
      /\bremote\s*[-–]\s*(?:eu|europe|european\s+union)\b/i,
      /\bremote\s*[-–]\s*(?:germany|france|spain|italy|netherlands|poland|portugal)\b/i,
      /\bremote\s*[-–]\s*(?:canada|australia|india|brazil|mexico|argentina|colombia)\b/i,
      /\bremote\s+(?:within|in|only|restricted)\b/i,
      /\bmust\s+(?:be\s+)?(?:located|reside)\s+in\b/i,
      /\b(?:us|uk|eu)\s+only\b/i,
      /\bnorth\s+america\s+only\b/i,
      /\bauthorized\s+to\s+work\s+in\s+(?:the\s+)?(?:us|u\.s\.|united\s+states)\b/i,
      /\bremote\s*[-–]\s*(?:latam|latin\s+america)\b/i,
      /\bremote\s*[-–]\s*(?:apac|asia[- ]?pacific)\b/i,
      /\bremote\s*[-–]\s*(?:emea|europe[- ]?middle[- ]?east[- ]?africa)\b/i,
      /\bremote\s*[-–]\s*(?:balkans|eastern\s+europe)\b/i,
    ];

    let oldMvpMatches = 0;
    let oldMvpOnsite = 0;
    for (const row of samples.rows) {
      const text = row.text_sample ?? "";
      if (oldMvpPatterns.some((p) => p.test(text))) {
        oldMvpMatches++;
      }
      // Old MVP on-site patterns
      if (/\b(?:hybrid|on[- ]site|in[- ]office)\b/i.test(text)) {
        oldMvpOnsite++;
      }
    }
    const oldTotal = oldMvpMatches + oldMvpOnsite;
    const oldRate = ((oldTotal / totalSampled) * 100).toFixed(1);
    console.log(`\n=== MVP (old) pattern comparison ===`);
    console.log(`  Old MVP remote-scope matches: ${oldMvpMatches}`);
    console.log(
      `  Old MVP hybrid/onsite detected (but NOT classified): ${oldMvpOnsite}`,
    );
    console.log(
      `  Old MVP total (if hybrid→onsite added): ${oldTotal}/${totalSampled} (${oldRate}%)`,
    );
    console.log(
      `  Expanded dictionary total: ${totalResolvable}/${totalSampled} (${resolutionRate}%)`,
    );
    console.log(
      `  Improvement: +${(Number(resolutionRate) - Number(oldRate)).toFixed(1)} percentage points`,
    );

    // 6. Show workplace_type distribution in the sample
    const wtDist: Record<string, number> = {};
    for (const row of samples.rows) {
      const wt = row.workplace_type ?? "null";
      wtDist[wt] = (wtDist[wt] ?? 0) + 1;
    }
    console.log(`\n=== workplace_type distribution in sample ===`);
    for (const [wt, count] of Object.entries(wtDist).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${wt}: ${count}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
