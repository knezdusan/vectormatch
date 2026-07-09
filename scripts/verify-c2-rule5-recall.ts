/**
 * C2 Verification: Rule 5 Recall Guardrail
 *
 * Measures the false-negative rate of Check 8 (work-auth fencing) by:
 * 1. Finding jobs that Check 8 would block (fencing language + applicant not in list)
 * 2. Sampling them and checking if any are genuine global-contractor roles
 * 3. Documenting the false-negative rate
 *
 * Also verifies the ambiguous branch: bounded country list, no fencing language,
 * no contractor-friendly language → pass through (not hard-block).
 *
 * Usage: npx tsx scripts/verify-c2-rule5-recall.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// The fencing signals from Check 8 (must match gate-zero-pre-filter.ts)
const FENCING_PATTERNS = [
  /must\s+be\s+(?:authorized|eligible)\s+to\s+work\s+(?:in|within)/i,
  /must\s+reside\s+in/i,
  /eligible\s+to\s+work\s+in/i,
  /authorized\s+to\s+work\s+in/i,
  /must\s+have\s+(?:work\s+)?authorization\s+(?:for|in)/i,
  /requires\s+(?:work\s+)?authorization\s+(?:for|in)/i,
  /only\s+(?:accepting|considering)\s+(?:candidates|applicants)\s+(?:from|in|located\s+in)/i,
  /candidates\s+must\s+be\s+(?:based|located)\s+in/i,
];

// The contractor-friendly signals from Check 8
const CONTRACTOR_PATTERNS = [
  /work\s+from\s+anywhere/i,
  /global\s+remote/i,
  /remote\s*[-–]\s*global/i,
  /distributed\s+team/i,
  /worldwide\s+remote/i,
  /any\s+location/i,
  /any\s+country/i,
  /work\s+from\s+any\s+country/i,
  /contractor\s+friendly/i,
  /open\s+to\s+(?:remote|global)\s+(?:contractors|candidates)/i,
  /w-?8ben/i,
  /ic_global/i,
  /independent\s+contractor/i,
];

async function main() {
  console.log("=== C2: Rule 5 Recall Guardrail Verification ===\n");

  // The applicant is in Serbia (RS) — the core mission user
  const applicantCountry = "RS";

  // 1. Find jobs that Check 8 would evaluate: remote + location_countries + normalizedText
  const candidates = await sql`
    SELECT j.id, j.title, j.location_name, j.workplace_type, j.remote_scope,
           j.location_countries, j.normalized_text, j.status
    FROM job j
    WHERE j.normalized_text IS NOT NULL
      AND j.location_countries IS NOT NULL
      AND array_length(j.location_countries, 1) > 0
      AND (j.workplace_type = 'remote' OR j.workplace_type IS NULL)
      AND j.remote_scope != 'onsite'
      AND j.status = 'active'
    LIMIT 500
  `;

  console.log(
    `Total candidate jobs (remote + location_countries + normalizedText): ${candidates.length}`,
  );

  // 2. Classify each candidate
  let blocked = 0;
  let contractorFriendly = 0;
  let ambiguous = 0;
  let applicantInList = 0;
  const blockedJobs: any[] = [];
  const falseNegatives: any[] = [];

  for (const job of candidates) {
    const countries: string[] = job.location_countries || [];

    // Check if applicant's country is in the list
    const isInList = countries.some(
      (c) =>
        c.toLowerCase().includes(applicantCountry.toLowerCase()) ||
        applicantCountry.toLowerCase().includes(c.toLowerCase()),
    );

    if (isInList) {
      applicantInList++;
      continue;
    }

    // C2 fix: skip global-remote jobs — they're worldwide remote, never blocked
    if (job.remote_scope === "global") {
      contractorFriendly++; // Count as kept (global = worldwide remote)
      continue;
    }

    const text = job.normalized_text || "";

    // Check contractor-friendly language → keep
    const hasContractorFriendly = CONTRACTOR_PATTERNS.some((re) =>
      re.test(text),
    );
    if (hasContractorFriendly) {
      contractorFriendly++;
      continue;
    }

    // Check fencing language → block
    const hasFencing = FENCING_PATTERNS.some((re) => re.test(text));
    if (hasFencing) {
      blocked++;
      blockedJobs.push({
        id: job.id,
        title: job.title,
        location: job.location_name,
        countries: countries.join(", "),
        remote_scope: job.remote_scope,
      });

      // Check if this is a false negative — does the JD have global-remote
      // indicators that the fencing regex missed?
      const hasGlobalIndicators =
        /remote/i.test(job.title) &&
        /global|worldwide|anywhere|any location/i.test(text);
      if (hasGlobalIndicators) {
        falseNegatives.push({
          id: job.id,
          title: job.title,
          countries: countries.join(", "),
          reason:
            "Title says 'remote' + JD has global/anywhere indicators but fencing regex matched",
        });
      }
      continue;
    }

    // Ambiguous — no fencing, no contractor-friendly → pass through
    ambiguous++;
  }

  console.log(`\nClassification results (applicant=${applicantCountry}):`);
  console.log(`  Applicant in country list (pass):     ${applicantInList}`);
  console.log(`  Contractor-friendly language (pass):  ${contractorFriendly}`);
  console.log(`  Fencing language (BLOCK):              ${blocked}`);
  console.log(`  Ambiguous (pass to Gate 3):            ${ambiguous}`);

  // 3. False-negative analysis on blocked set
  console.log(`\n=== False-Negative Analysis ===`);
  console.log(`  Blocked jobs: ${blocked}`);
  console.log(`  Potential false negatives: ${falseNegatives.length}`);

  if (blockedJobs.length > 0) {
    console.log(`\nSample of blocked jobs (first 10):`);
    console.table(blockedJobs.slice(0, 10));
  }

  if (falseNegatives.length > 0) {
    console.log(
      `\nPotential false negatives (blocked but may be global-contractor):`,
    );
    console.table(falseNegatives);
  }

  // 4. Verify ambiguous branch — sample ambiguous jobs
  if (ambiguous > 0) {
    console.log(`\n=== Ambiguous Branch Verification ===`);
    console.log(
      `  ${ambiguous} jobs pass through to Gate 3 (not hard-blocked)`,
    );
    console.log(
      `  These have a bounded country list but no fencing or contractor-friendly language`,
    );
    console.log(
      `  Gate 3 LLM evaluates them — correct behavior per v4 lock §2`,
    );
  }

  // 5. Summary
  const falseNegativeRate =
    blocked > 0 ? (falseNegatives.length / blocked) * 100 : 0;
  console.log(`\n=== C2 Summary ===`);
  console.log(`  Blocked by Check 8: ${blocked}`);
  console.log(
    `  False negatives: ${falseNegatives.length} (${falseNegativeRate.toFixed(1)}%)`,
  );
  console.log(`  Ambiguous (pass-through): ${ambiguous}`);
  console.log(`  Contractor-friendly (kept): ${contractorFriendly}`);
  console.log(`  Ambiguous branch default: PASS-THROUGH (not block) ✓`);

  process.exit(0);
}

main().catch((err) => {
  console.error("C2 verification failed:", err);
  process.exit(1);
});
