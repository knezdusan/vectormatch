/**
 * Recall Check: Newly-Fenced Ashby Jobs
 *
 * The classifier fix auto-fences when workplace_type='remote' and location is
 * specific. But genuinely global roles often list the HQ city in location out
 * of ATS habit while the JD says "work from anywhere." This script measures
 * the false-negative rate: how many newly-fenced ashby jobs are actually global?
 *
 * Method:
 *   1. Find all ashby jobs currently labeled 'global' in the DB
 *   2. Apply the fix logic to identify which would be reclassified to 'country_fenced'
 *   3. For each, fetch the JD text from the DB (normalized_text or rawJson)
 *   4. Check for high-confidence global signals in the JD text
 *   5. If JD says "work from anywhere" / "worldwide" but location is "San Francisco"
 *      → that's a FALSE NEGATIVE (we wrongly fenced a real global job)
 *
 * Usage: npx tsx scripts/recall-check-ashby-fenced.ts
 */
import { neon } from "@neondatabase/serverless";
import {
  extractLocationCountry,
  isSpecificLocation,
} from "../src/lib/jobs/location-utils.ts";

const sql = neon(process.env.DATABASE_URL!);

// High-confidence global signals (from remote-scope-patterns.ts GLOBAL_HIGH)
const GLOBAL_HIGH_SIGNALS = [
  /\banywhere\s+in\s+the\s+world\b/i,
  /\bworldwide\b/i,
  /\bwork\s+from\s+anywhere\b/i,
  /\bwork\s+from\s+any\s+location\b/i,
  /\bany\s+country\b/i,
  /\bany\s+location\b/i,
  /\bremote[- ]first\b/i,
  /\bdistributed\s+(?:team|company|workforce|organization)\b/i,
  /\bglobal\s+remote\b/i,
  /\bremote\s*[-–]\s*(?:global|worldwide|anywhere)\b/i,
  /\bfully\s+remote\s+worldwide\b/i,
  /\b(?:global[,\s]+remote|remote[,\s]+global)\b/i,
  /\bno\s+location\s+restrictions?\b/i,
  /\blocation\s+independent\b/i,
  /\bborderless\b/i,
  /\bteam\s+members\s+across\s+\d+\s+countries\b/i,
  /\boperates?\s+in\s+\d+\s+countries\b/i,
];

// Medium-confidence global signals
const GLOBAL_MEDIUM_SIGNALS = [
  /\bfully\s+remote\b/i,
  /\b100\s?%\s+remote\b/i,
  /\bremote\s+work\s+(?:available|option|opportunity)\b/i,
];

// Negative signals that negate global (from remote-scope-patterns.ts)
const NEGATIVE_SIGNALS = [
  /\brelocation\s+(?:required|offered|provided|assistance)\b/i,
  /\blocal\s+candidates?\s+(?:only|preferred)\b/i,
  /\bmust\s+(?:be\s+)?(?:in|based\s+in)\s+[A-Z][a-z]+/i,
  /\bmust\s+(?:be\s+)?(?:in|based\s+in)\s+(?:the\s+)?(?:US|USA|UK|EU|APAC|EMEA|Latam)/i,
  /\bonly\s+(?:accepting|considering)\s+(?:candidates\s+)?(?:from|in)\s+/i,
  /\beligible\s+to\s+work\s+(?:in|for)\s+/i,
  /\bwork\s+authorization\s+(?:required|needed)\s+(?:in|for)\s+/i,
  /\bmust\s+(?:have|possess)\s+(?:work\s+)?(?:visa|permit)\s+(?:for|in)\s+/i,
];

// Region-fencing signals (hidden behind "Remote" location)
const REGION_FENCING_SIGNALS = [
  /\bUTC[-+]\d+\s+to\s+UTC[-+]\d+\b/i,
  /\bGMT[-+]\d+\s+to\s+GMT[-+]\d+\b/i,
  /\bworking\s+hours.*(?:UTC|GMT|EST|PST|CET|EET|IST|JST)/i,
  /\btimezone.*(?:UTC|GMT|EST|PST|CET|EET|IST|JST)/i,
  /\boverlap\s+(?:with|of)\s+\d+\s+hours?\b/i,
  /\bduring\s+(?:our|the)\s+(?:business|core)\s+hours\b/i,
  /\b(?:EMEA|APAC|Latam|Americas|Europe|Asia)\s+(?:hours|timezone|time)\b/i,
  /\bsalary.*(?:EUR|GBP|PLN|INR|BRL|CAD|AUD|SGD)\b/i,
  /\bcompensation.*(?:EUR|GBP|PLN|INR|BRL|CAD|AUD|SGD)\b/i,
  /\bmust\s+(?:be\s+)?(?:based|located)\s+in\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam)\b/i,
  /\bcandidates\s+(?:from|in|based\s+in)\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam)\b/i,
];

function checkJdForSignals(text: string): {
  hasHighGlobal: boolean;
  hasMediumGlobal: boolean;
  hasNegative: boolean;
  hasRegionFencing: boolean;
  highSignals: string[];
  negativeSignals: string[];
  regionSignals: string[];
} {
  const highSignals: string[] = [];
  const negativeSignals: string[] = [];
  const regionSignals: string[] = [];

  for (const sig of GLOBAL_HIGH_SIGNALS) {
    if (sig.test(text)) {
      highSignals.push(sig.source.substring(0, 40));
    }
  }

  for (const sig of NEGATIVE_SIGNALS) {
    if (sig.test(text)) {
      negativeSignals.push(sig.source.substring(0, 40));
    }
  }

  for (const sig of REGION_FENCING_SIGNALS) {
    if (sig.test(text)) {
      regionSignals.push(sig.source.substring(0, 40));
    }
  }

  return {
    hasHighGlobal: highSignals.length > 0,
    hasMediumGlobal: GLOBAL_MEDIUM_SIGNALS.some((s) => s.test(text)),
    hasNegative: negativeSignals.length > 0,
    hasRegionFencing: regionSignals.length > 0,
    highSignals,
    negativeSignals,
    regionSignals,
  };
}

async function main() {
  console.log("=== Recall Check: Newly-Fenced Ashby Jobs ===\n");

  // 1. Get all ashby jobs currently labeled 'global'
  const globalJobs = await sql`
    SELECT id, title, location_name, workplace_type, remote_scope,
           normalized_text, raw_json
    FROM job
    WHERE ats_source::text = 'ashby' AND remote_scope = 'global'
      AND status = 'active'
  `;
  console.log(`Ashby jobs currently labeled 'global': ${globalJobs.length}`);

  // 2. Apply the fix logic to identify which would be reclassified
  const wouldFence: any[] = [];
  const wouldStayGlobal: any[] = [];

  for (const job of globalJobs) {
    const loc = job.location_name || "";
    const workplace = job.workplace_type;

    let wouldReclassify = false;
    if (workplace === "remote" && loc && isSpecificLocation(loc)) {
      wouldReclassify = true;
    } else if (workplace === null && loc && isSpecificLocation(loc)) {
      wouldReclassify = true; // → onsite
    }

    if (wouldReclassify) {
      wouldFence.push(job);
    } else {
      wouldStayGlobal.push(job);
    }
  }

  console.log(`Would be reclassified (fenced/onsite): ${wouldFence.length}`);
  console.log(`Would stay 'global': ${wouldStayGlobal.length}`);
  console.log(
    `Reclassification rate: ${((wouldFence.length / globalJobs.length) * 100).toFixed(1)}%\n`,
  );

  // 3. For each newly-fenced job, check JD text for global signals
  let falseNegatives = 0;
  let trueNegatives = 0;
  let ambiguous = 0;
  const results: any[] = [];

  for (const job of wouldFence) {
    // Get JD text from normalized_text or rawJson
    let jdText = job.normalized_text || "";
    if (!jdText && job.raw_json) {
      try {
        const raw = JSON.parse(job.raw_json);
        jdText =
          raw.descriptionPlain || raw.descriptionHtml || raw.description || "";
      } catch {
        jdText = "";
      }
    }

    const signals = checkJdForSignals(jdText);
    const country = extractLocationCountry(job.location_name || "");

    let verdict = "true_negative"; // correctly fenced
    let reason = "no global signal in JD";

    if (signals.hasHighGlobal && !signals.hasNegative) {
      verdict = "false_negative"; // wrongly fenced — JD says global
      reason = `JD has high-confidence global signal: ${signals.highSignals.join(", ")}`;
      falseNegatives++;
    } else if (signals.hasHighGlobal && signals.hasNegative) {
      verdict = "ambiguous";
      reason = `JD has global signal BUT also negative signal: ${signals.negativeSignals.join(", ")}`;
      ambiguous++;
    } else if (signals.hasMediumGlobal && !signals.hasNegative) {
      verdict = "ambiguous";
      reason = "JD has medium-confidence global signal (fully remote)";
      ambiguous++;
    } else {
      trueNegatives++;
    }

    results.push({
      id: job.id.substring(0, 8),
      title: job.title?.substring(0, 35),
      location: (job.location_name || "").substring(0, 30),
      workplace: job.workplace_type,
      country,
      verdict,
      reason: reason.substring(0, 60),
      has_region_fencing: signals.hasRegionFencing,
      region_signals: signals.regionSignals.join("; ").substring(0, 50),
    });
  }

  // 4. Results
  console.log("=== Recall Check Results ===");
  console.log(`True negatives (correctly fenced): ${trueNegatives}`);
  console.log(`False negatives (wrongly fenced):  ${falseNegatives}`);
  console.log(`Ambiguous (needs LLM adjudication): ${ambiguous}`);
  console.log(
    `\nFalse-negative rate: ${((falseNegatives / wouldFence.length) * 100).toFixed(1)}%`,
  );
  console.log(
    `Ambiguous rate: ${((ambiguous / wouldFence.length) * 100).toFixed(1)}%`,
  );

  // 5. Show false negatives (the recall failures)
  const fns = results.filter((r) => r.verdict === "false_negative");
  if (fns.length > 0) {
    console.log("\n=== FALSE NEGATIVES (wrongly fenced global jobs) ===");
    console.table(
      fns.map((r) => ({
        id: r.id,
        title: r.title,
        location: r.location,
        country: r.country,
        reason: r.reason,
      })),
    );
  } else {
    console.log("\n=== No false negatives found ===");
  }

  // 6. Show ambiguous cases
  const ambs = results.filter((r) => r.verdict === "ambiguous");
  if (ambs.length > 0) {
    console.log("\n=== AMBIGUOUS CASES (need LLM adjudication) ===");
    console.table(
      ambs.map((r) => ({
        id: r.id,
        title: r.title,
        location: r.location,
        reason: r.reason,
      })),
    );
  }

  // 7. Show sample of true negatives
  const tns = results.filter((r) => r.verdict === "true_negative");
  console.log("\n=== Sample TRUE NEGATIVES (correctly fenced) ===");
  console.table(
    tns.slice(0, 15).map((r) => ({
      id: r.id,
      title: r.title,
      location: r.location,
      country: r.country,
      region_fencing: r.has_region_fencing ? r.region_signals : "",
    })),
  );

  // 8. Also check the "would stay global" set for region-fencing-behind-Remote
  console.log("\n=== Region-Fencing Check on 'Would Stay Global' Jobs ===");
  let regionFenced = 0;
  const regionFencedResults: any[] = [];
  for (const job of wouldStayGlobal) {
    let jdText = job.normalized_text || "";
    if (!jdText && job.raw_json) {
      try {
        const raw = JSON.parse(job.raw_json);
        jdText =
          raw.descriptionPlain || raw.descriptionHtml || raw.description || "";
      } catch {
        jdText = "";
      }
    }
    const signals = checkJdForSignals(jdText);
    if (signals.hasRegionFencing) {
      regionFenced++;
      regionFencedResults.push({
        id: job.id.substring(0, 8),
        title: job.title?.substring(0, 35),
        location: (job.location_name || "").substring(0, 30),
        region_signals: signals.regionSignals.join("; ").substring(0, 60),
      });
    }
  }
  console.log(
    `Jobs that would stay 'global' but have region-fencing signals: ${regionFenced} / ${wouldStayGlobal.length}`,
  );
  if (regionFencedResults.length > 0) {
    console.table(regionFencedResults.slice(0, 20));
  }

  // 9. Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Ashby global jobs: ${globalJobs.length}`);
  console.log(
    `  Would be reclassified: ${wouldFence.length} (${((wouldFence.length / globalJobs.length) * 100).toFixed(1)}%)`,
  );
  console.log(`    True negatives (correctly fenced): ${trueNegatives}`);
  console.log(
    `    False negatives (wrongly fenced): ${falseNegatives} (${((falseNegatives / wouldFence.length) * 100).toFixed(1)}% of fenced)`,
  );
  console.log(`    Ambiguous (need adjudication): ${ambiguous}`);
  console.log(`  Would stay global: ${wouldStayGlobal.length}`);
  console.log(
    `    With region-fencing signals: ${regionFenced} (${((regionFenced / wouldStayGlobal.length) * 100).toFixed(1)}% of stay-global)`,
  );
  console.log("");
  console.log("VERDICT:");
  if (falseNegatives === 0) {
    console.log(
      "  No false negatives — the fix did not wrongly fence any genuine global jobs.",
    );
  } else {
    console.log(
      `  ${falseNegatives} false negatives found — the fix wrongly fenced ${((falseNegatives / wouldFence.length) * 100).toFixed(1)}% of jobs.`,
    );
    console.log(
      "  RECOMMENDATION: Refine rule to route location-vs-JD conflicts to LLM adjudication.",
    );
  }
  if (regionFenced > 0) {
    console.log(
      `  ${regionFenced} stay-global jobs have region-fencing signals — multi-probe needed.`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Recall check failed:", err);
  process.exit(1);
});
