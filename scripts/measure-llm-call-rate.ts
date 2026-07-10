/**
 * Measure LLM-call rate per 1,000 ingested jobs after pipeline reorder.
 *
 * User priority #1: "LLM-call rate per 1,000 ingested jobs after pipeline reorder"
 *
 * Inlines the deterministic multi-probe logic to avoid the `server-only` import
 * chain that breaks when running via tsx outside Next.js.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// ── Inlined deterministic multi-probe (from remote-scope-patterns.ts) ──────

const FENCING_PATTERNS = [
  /poland/i,
  /germany/i,
  /india/i,
  /ukraine/i,
  /brazil/i,
  /pakistan/i,
  /nigeria/i,
  /serbia/i,
  /romania/i,
  /hungary/i,
  /czech/i,
  /spain/i,
  /portugal/i,
  /italy/i,
  /france/i,
  /netherlands/i,
  /belgium/i,
  /sweden/i,
  /norway/i,
  /denmark/i,
  /finland/i,
  /ireland/i,
  /greece/i,
  /bulgaria/i,
  /lithuania/i,
  /latvia/i,
  /estonia/i,
  /mexico/i,
  /argentina/i,
  /colombia/i,
  /chile/i,
  /peru/i,
  /costa rica/i,
  /guatemala/i,
  /united kingdom|uk\b|london|manchester|england/i,
  /canada|toronto|vancouver|montreal|ottawa|calgary/i,
  /united states|\busa\b|\bus\b|san francisco|new york|chicago|boston|seattle|austin|denver|remote.*us/i,
  /emea/i,
  /apac|asia/i,
  /latam|latin america/i,
  /europe/i,
  /hong kong/i,
  /china/i,
  /philippines/i,
  /indonesia/i,
  /turkey/i,
  /egypt/i,
  /singapore/i,
  /vietnam/i,
  /thailand/i,
  /malaysia/i,
  /japan/i,
  /korea/i,
  /taiwan/i,
  /australia/i,
  /new zealand/i,
  /south africa/i,
  /kenya/i,
  /morocco/i,
  /são paulo/i,
  /buenos aires/i,
  /mexico city/i,
  /dublin/i,
  /berlin/i,
  /paris/i,
  /amsterdam/i,
  /stockholm/i,
  /warsaw/i,
  /krakow/i,
  /athens/i,
  /lisbon/i,
  /madrid/i,
  /remote.*u\.?s/i,
  /remote.*canada/i,
  /remote.*uk/i,
  /remote.*eu/i,
  /u\.?s\.?\s*remote/i,
  /remote.*can/i,
];

function isLocationFenced(location: string): boolean {
  if (!location) return false;
  const lower = location.toLowerCase();
  const hasRemoteIndicator = [
    "remote",
    "global",
    "worldwide",
    "anywhere",
    "distributed",
    "work from",
  ].some((ind) => lower.includes(ind));
  if (!hasRemoteIndicator) return true;
  return FENCING_PATTERNS.some((p) => p.test(lower));
}

// Global signals (high confidence)
const GLOBAL_HIGH_PATTERNS = [
  /\bworldwide\b/i,
  /\bwork\s+from\s+anywhere\b/i,
  /\bglobally\s+remote\b/i,
  /\bremote\s*[-–—]\s*global\b/i,
  /\bremote\s*[-–—]\s*worldwide\b/i,
  /\bdistributed\s+team\b/i,
  /\bfully\s+remote\s+(?:across|throughout)\s+the\s+world\b/i,
  /\bany\s+(?:country|location|timezone)\b/i,
  /\bremote-first\b/i,
  /\bremote\s+anywhere\b/i,
  /\bglobal\s+remote\b/i,
  /\bhire\s+(?:from\s+)?anywhere\b/i,
  /\bwork\s+from\s+any\s+country\b/i,
];

// Country-fenced patterns (high confidence)
const COUNTRY_FENCED_PATTERNS = [
  /\bmust\s+(?:be\s+)?(?:based|located|reside|live)\s+in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/i,
  /\bonly\s+(?:accepting|hiring|considering)\s+(?:candidates\s+)?(?:from|in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/i,
  /\beligible\s+to\s+work\s+(?:in|for)\s+(?:the\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/i,
];

// Region-fencing probes (multi-probe)
const REGION_FENCING_PROBES: {
  pattern: RegExp;
  severity: "high" | "medium";
}[] = [
  { pattern: /\bUTC[-+]\d+\s+to\s+UTC[-+]?\d+\b/i, severity: "high" },
  { pattern: /\bGMT[-+]\d+\s+to\s+GMT[-+]?\d+\b/i, severity: "high" },
  {
    pattern:
      /\b(?:working\s+hours|timezone|time\s+zone).*?(?:UTC|GMT|EST|PST|CET|EET|IST|JST|AEST)\b/i,
    severity: "high",
  },
  {
    pattern:
      /\b(?:EMEA|APAC|Latam|Americas|Europe|Asia|Africa)\s+(?:hours|timezone|time)\b/i,
    severity: "high",
  },
  {
    pattern:
      /\bmust\s+(?:be\s+)?(?:based|located|reside|live)\s+in\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam|the\s+EU|the\s+UK|the\s+US)\b/i,
    severity: "high",
  },
  {
    pattern:
      /\bcandidates\s+(?:from|in|based\s+in)\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam)\b/i,
    severity: "high",
  },
  {
    pattern:
      /\b(?:eligible|authorized)\s+to\s+work\s+(?:in|for)\s+(?:the\s+)?(?:US|USA|UK|EU|Germany|France|India|Poland|Brazil|Canada|Australia|Singapore|Netherlands|Ireland)\b/i,
    severity: "high",
  },
  {
    pattern:
      /\bmust\s+(?:have|possess|hold)\s+(?:a\s+)?(?:work\s+)?(?:visa|permit)\s+(?:for|in)\s+/i,
    severity: "high",
  },
  {
    pattern:
      /\bonly\s+(?:accepting|considering|hiring)\s+(?:candidates\s+)?(?:from|in)\s+/i,
    severity: "high",
  },
  {
    pattern:
      /\b(?:salary|compensation|pay).*?(?:EUR|GBP|PLN|INR|BRL|CAD|AUD|SGD|ZAR|AED|SEK|NOK|DKK|CHF)\b/i,
    severity: "medium",
  },
  {
    pattern: /\b(?:core|business)\s+hours\s+(?:overlap|with)\s+/i,
    severity: "medium",
  },
  {
    pattern: /\bduring\s+(?:our|the)\s+(?:business|core|working)\s+hours\b/i,
    severity: "medium",
  },
  { pattern: /\boverlap\s+(?:with|of)\s+\d+\s+hours?\b/i, severity: "medium" },
];

function deterministicClassify(
  text: string,
  workplaceType: string | null,
  location: string | null,
): { scope: string; resolvedBy: string } {
  if (!text || text.length < 50) {
    return { scope: "unknown", resolvedBy: "text_too_short" };
  }

  // Step 1a: ATS-native trust (on-site/hybrid)
  if (workplaceType === "on-site")
    return { scope: "onsite", resolvedBy: "ats_native" };
  if (workplaceType === "hybrid")
    return { scope: "onsite", resolvedBy: "ats_native" };

  // Step 1c: Regex hard-signals
  for (const p of GLOBAL_HIGH_PATTERNS) {
    if (p.test(text)) {
      // Check for location conflict
      if (location && isLocationFenced(location)) {
        // Conflict: regex says global, location is specific
        // → run multi-probe to resolve
        break;
      }
      return { scope: "global", resolvedBy: "regex_global" };
    }
  }

  for (const p of COUNTRY_FENCED_PATTERNS) {
    if (p.test(text))
      return { scope: "country_fenced", resolvedBy: "regex_country" };
  }

  // Step 1e: Location-based fallback (only if no regex signal)
  const hasGlobalSignal = GLOBAL_HIGH_PATTERNS.some((p) => p.test(text));
  if (
    !hasGlobalSignal &&
    (workplaceType === "remote" || workplaceType === null) &&
    location
  ) {
    if (isLocationFenced(location)) {
      if (workplaceType === "remote")
        return { scope: "country_fenced", resolvedBy: "location_fenced" };
      return { scope: "onsite", resolvedBy: "location_onsite" };
    }
  }

  // Step 1h: Deterministic multi-probe
  const firedHigh = REGION_FENCING_PROBES.filter(
    (p) => p.severity === "high" && p.pattern.test(text),
  ).length;
  const firedMedium = REGION_FENCING_PROBES.filter(
    (p) => p.severity === "medium" && p.pattern.test(text),
  ).length;

  if (firedHigh >= 1)
    return { scope: "region_fenced", resolvedBy: "multi_probe_high" };
  if (firedMedium >= 2)
    return { scope: "region_fenced", resolvedBy: "multi_probe_medium" };

  // If regex found global and multi-probe is clean → confirm global
  if (hasGlobalSignal)
    return { scope: "global", resolvedBy: "multi_probe_clean" };

  // No deterministic signal
  return { scope: "unknown", resolvedBy: "no_signal" };
}

async function main() {
  console.log("=== LLM-Call Rate Measurement (Post-Pipeline-Reorder) ===\n");

  const jobs = await sql`
    SELECT
      id, title, workplace_type, ats_source, location_name,
      normalized_text, remote_scope, extracted_tags
    FROM job
    WHERE status = 'active' AND normalized_at IS NOT NULL
    LIMIT 5000
  `;
  console.log("Total active normalized jobs sampled:", jobs.length);

  const personas = await sql`
    SELECT must_have_tags FROM persona WHERE must_have_tags IS NOT NULL
  `;
  console.log("Total personas with must_have_tags:", personas.length);

  const personaTagSet = new Set<string>();
  for (const p of personas) {
    if (p.must_have_tags) {
      for (const tag of p.must_have_tags) {
        personaTagSet.add(tag.toLowerCase());
      }
    }
  }
  console.log("Unique persona tags:", personaTagSet.size, "\n");

  let totalJobs = 0;
  let deterministicResolved = 0;
  let deterministicGlobal = 0;
  let deterministicFenced = 0;
  let stillUnknown = 0;
  let unknownAndPassesGate1 = 0;
  let alreadyFenced = 0;
  let alreadyGlobal = 0;
  let alreadyUnknown = 0;
  let llmCallsOldPipeline = 0;
  let llmCallsNewPipeline = 0;

  const resolvedByBreakdown: Record<string, number> = {};

  for (const j of jobs) {
    totalJobs++;

    const currentScope = j.remote_scope;
    if (
      currentScope === "country_fenced" ||
      currentScope === "region_fenced" ||
      currentScope === "onsite"
    ) {
      alreadyFenced++;
      continue;
    }
    if (currentScope === "global") {
      alreadyGlobal++;
      continue;
    }
    if (
      currentScope === "unknown" ||
      currentScope === "undetermined" ||
      currentScope === null
    ) {
      alreadyUnknown++;
    }

    // OLD PIPELINE: every "unknown" job gets LLM at Step 4.4
    llmCallsOldPipeline++;

    // NEW PIPELINE: run deterministic pass first (regex + multi-probe, no LLM)
    const result = deterministicClassify(
      j.normalized_text,
      j.workplace_type,
      j.location_name,
    );

    resolvedByBreakdown[result.resolvedBy] =
      (resolvedByBreakdown[result.resolvedBy] || 0) + 1;

    if (result.scope !== "unknown") {
      deterministicResolved++;
      if (result.scope === "global") deterministicGlobal++;
      else deterministicFenced++;
      continue;
    }

    stillUnknown++;

    // Check if this job would pass Gate 1 (tag overlap with personas)
    const jobTags = (j.extracted_tags || []) as string[];
    const hasTagOverlap = jobTags.some((tag) =>
      personaTagSet.has(tag.toLowerCase()),
    );

    if (hasTagOverlap) {
      unknownAndPassesGate1++;
      llmCallsNewPipeline++;
    }
  }

  console.log("=== Results ===\n");
  console.log("Total jobs sampled:", totalJobs);
  console.log("\n--- Current remoteScope distribution ---");
  console.log("Already fenced (country/region/onsite):", alreadyFenced);
  console.log("Already global:", alreadyGlobal);
  console.log("Already unknown/undetermined:", alreadyUnknown);
  console.log("\n--- Deterministic pass (regex + multi-probe, NO LLM) ---");
  console.log("Resolved to definitive scope:", deterministicResolved);
  console.log("  → global:", deterministicGlobal);
  console.log("  → fenced:", deterministicFenced);
  console.log("Still unknown after deterministic:", stillUnknown);
  console.log("\n--- Resolved-by breakdown ---");
  console.table(resolvedByBreakdown);
  console.log("\n--- Gate 1 simulation (tag overlap with personas) ---");
  console.log("Unknown jobs that pass Gate 1:", unknownAndPassesGate1);
  console.log("\n--- LLM-call comparison ---");
  console.log(
    "OLD pipeline (LLM on all unknown at ingest):",
    llmCallsOldPipeline,
    "calls",
  );
  console.log(
    "NEW pipeline (LLM only on unknown + passes Gate 1):",
    llmCallsNewPipeline,
    "calls",
  );
  const reduction =
    llmCallsOldPipeline > 0
      ? ((1 - llmCallsNewPipeline / llmCallsOldPipeline) * 100).toFixed(1)
      : "N/A";
  console.log("Reduction:", `${reduction}%`);
  console.log("\n--- LLM-call rate per 1,000 ingested jobs ---");
  const oldRate = totalJobs > 0 ? (llmCallsOldPipeline / totalJobs) * 1000 : 0;
  const newRate = totalJobs > 0 ? (llmCallsNewPipeline / totalJobs) * 1000 : 0;
  console.log("OLD pipeline:", oldRate.toFixed(1), "LLM calls per 1,000 jobs");
  console.log("NEW pipeline:", newRate.toFixed(1), "LLM calls per 1,000 jobs");
  if (oldRate > 0) {
    console.log(
      "Cost reduction:",
      `${((1 - newRate / oldRate) * 100).toFixed(1)}%`,
    );
  }

  const costPerCall = 0.000105;
  const oldCostPer1k = oldRate * costPerCall;
  const newCostPer1k = newRate * costPerCall;
  console.log("\n--- Cost estimate (gpt-4o-mini) ---");
  console.log("OLD pipeline: $", oldCostPer1k.toFixed(4), "per 1,000 jobs");
  console.log("NEW pipeline: $", newCostPer1k.toFixed(4), "per 1,000 jobs");
  console.log(
    "Savings per 1,000 jobs: $",
    (oldCostPer1k - newCostPer1k).toFixed(4),
  );

  // Project at scale: 10,000 jobs/day ingestion rate
  const dailyIngest = 10000;
  console.log("\n--- Projected at scale (10,000 jobs/day) ---");
  console.log(
    "OLD pipeline:",
    ((oldRate * dailyIngest) / 1000).toFixed(0),
    "LLM calls/day = $",
    (((oldRate * dailyIngest) / 1000) * costPerCall).toFixed(2),
    "/day",
  );
  console.log(
    "NEW pipeline:",
    ((newRate * dailyIngest) / 1000).toFixed(0),
    "LLM calls/day = $",
    (((newRate * dailyIngest) / 1000) * costPerCall).toFixed(2),
    "/day",
  );
  console.log(
    "Monthly savings: $",
    ((((oldRate - newRate) * dailyIngest) / 1000) * costPerCall * 30).toFixed(
      2,
    ),
  );

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
