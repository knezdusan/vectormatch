/**
 * Fingerprint Validation: Are the 49 Addressable Companies Genuinely Worldwide?
 *
 * The 49 ashby addressable companies form the L2 targeting rubric. But if some
 * are region-fenced-behind-"Remote" (like bjakcareer — SEA fintech with
 * location="Remote" but plausibly SEA-region-only), the rubric imports
 * contamination into the targeting signal.
 *
 * This script validates each of the 49 by:
 *   1. Fetching all jobs for each company from the DB
 *   2. Checking each job's JD text for region-fencing signals:
 *      - Timezone requirements (UTC+1 to UTC+5, "EMEA hours", etc.)
 *      - Salary currency (EUR, GBP, PLN, INR → region-fenced)
 *      - "Must be based in [region]" language
 *      - Work authorization requirements for specific countries
 *   3. Checking location distribution — if all jobs say "Remote" but the
 *      company is HQ'd in a specific region, that's a red flag
 *   4. Scoring each company: genuinely_global, likely_region_fenced, or ambiguous
 *
 * Usage: npx tsx scripts/validate-fingerprint-49.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Region-fencing signals (hidden behind "Remote" location)
const REGION_FENCING_SIGNALS: {
  pattern: RegExp;
  region: string;
  severity: "high" | "medium";
}[] = [
  // Timezone restrictions
  {
    pattern: /\bUTC[-+]\d+\s+to\s+UTC[-+]?\d+\b/i,
    region: "timezone_range",
    severity: "high",
  },
  {
    pattern: /\bGMT[-+]\d+\s+to\s+GMT[-+]?\d+\b/i,
    region: "timezone_range",
    severity: "high",
  },
  {
    pattern: /\bworking\s+hours.*(?:UTC|GMT|EST|PST|CET|EET|IST|JST|AEST)/i,
    region: "timezone_named",
    severity: "high",
  },
  {
    pattern: /\btimezone.*(?:UTC|GMT|EST|PST|CET|EET|IST|JST|AEST)/i,
    region: "timezone_named",
    severity: "high",
  },
  {
    pattern: /\b(?:within|during)\s+(?:our|the)\s+(?:business|core)\s+hours\b/i,
    region: "business_hours",
    severity: "medium",
  },
  {
    pattern: /\boverlap\s+(?:with|of)\s+\d+\s+hours?\b/i,
    region: "overlap_requirement",
    severity: "medium",
  },
  // Region-named restrictions
  {
    pattern:
      /\b(?:EMEA|APAC|Latam|Americas|Europe|Asia|Africa)\s+(?:hours|timezone|time)\b/i,
    region: "region_hours",
    severity: "high",
  },
  {
    pattern:
      /\bmust\s+(?:be\s+)?(?:based|located)\s+in\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam)\b/i,
    region: "region_must_be",
    severity: "high",
  },
  {
    pattern:
      /\bcandidates\s+(?:from|in|based\s+in)\s+(?:Europe|Asia|Africa|South\s+America|North\s+America|EMEA|APAC|Latam)\b/i,
    region: "region_candidates",
    severity: "high",
  },
  // Country-specific work authorization
  {
    pattern:
      /\beligible\s+to\s+work\s+(?:in|for)\s+(?:the\s+)?(?:US|USA|UK|EU|Germany|France|India|Poland|Brazil|Canada|Australia|Singapore)\b/i,
    region: "work_auth",
    severity: "high",
  },
  {
    pattern:
      /\bwork\s+(?:authorization|permit|visa)\s+(?:required|needed)\s+(?:in|for|to\s+work\s+in)\s+/i,
    region: "work_auth",
    severity: "high",
  },
  // Salary currency indicators (strong region signal)
  {
    pattern: /\bsalary.*(?:EUR|GBP|PLN|INR|BRL|CAD|AUD|SGD|ZAR|AED)\b/i,
    region: "salary_currency",
    severity: "medium",
  },
  {
    pattern: /\bcompensation.*(?:EUR|GBP|PLN|INR|BRL|CAD|AUD|SGD|ZAR|AED)\b/i,
    region: "salary_currency",
    severity: "medium",
  },
  // Specific country/region in JD text (not location field)
  {
    pattern:
      /\bonly\s+(?:accepting|considering|hiring)\s+(?:candidates\s+)?(?:from|in)\s+/i,
    region: "only_from",
    severity: "high",
  },
  {
    pattern: /\bmust\s+(?:reside|live|be\s+located)\s+in\s+/i,
    region: "must_reside",
    severity: "high",
  },
];

// Global signals (positive — indicates genuinely worldwide)
const GLOBAL_SIGNALS: { pattern: RegExp; strength: "high" | "medium" }[] = [
  { pattern: /\banywhere\s+in\s+the\s+world\b/i, strength: "high" },
  { pattern: /\bworldwide\b/i, strength: "high" },
  { pattern: /\bwork\s+from\s+anywhere\b/i, strength: "high" },
  { pattern: /\bany\s+country\b/i, strength: "high" },
  { pattern: /\bno\s+location\s+restrictions?\b/i, strength: "high" },
  { pattern: /\blocation\s+independent\b/i, strength: "high" },
  { pattern: /\bborderless\b/i, strength: "high" },
  {
    pattern: /\bteam\s+members\s+across\s+\d+\s+countries\b/i,
    strength: "high",
  },
  { pattern: /\bfully\s+remote\b/i, strength: "medium" },
  { pattern: /\b100\s?%\s+remote\b/i, strength: "medium" },
  {
    pattern: /\bdistributed\s+(?:team|company|workforce)\b/i,
    strength: "medium",
  },
];

function analyzeJd(text: string): {
  fencingSignals: { region: string; severity: string }[];
  globalSignals: { strength: string }[];
  fencingScore: number;
  globalScore: number;
} {
  const fencingSignals: { region: string; severity: string }[] = [];
  const globalSignals: { strength: string }[] = [];

  for (const sig of REGION_FENCING_SIGNALS) {
    if (sig.pattern.test(text)) {
      fencingSignals.push({ region: sig.region, severity: sig.severity });
    }
  }

  for (const sig of GLOBAL_SIGNALS) {
    if (sig.pattern.test(text)) {
      globalSignals.push({ strength: sig.strength });
    }
  }

  const fencingScore =
    fencingSignals.filter((s) => s.severity === "high").length * 2 +
    fencingSignals.filter((s) => s.severity === "medium").length;
  const globalScore =
    globalSignals.filter((s) => s.strength === "high").length * 2 +
    globalSignals.filter((s) => s.strength === "medium").length;

  return { fencingSignals, globalSignals, fencingScore, globalScore };
}

async function main() {
  console.log(
    "=== Fingerprint Validation: Are the 49 Genuinely Worldwide? ===\n",
  );

  // 1. Get the 49 addressable companies (same logic as fingerprint script)
  const ashbyCompanies = await sql`
    SELECT id, ats_slug, company_name, active_job_count
    FROM company
    WHERE ats_source::text = 'ashby'
      AND polling_enabled = true
      AND active_job_count > 0
      AND health = 'healthy'
    ORDER BY active_job_count DESC
  `;

  const MAINSTACK_KEYWORDS = [
    "react",
    "nextjs",
    "typescript",
    "javascript",
    "node",
    "graphql",
    "frontend",
    "fullstack",
    "full stack",
    "full-stack",
    "web developer",
    "web engineer",
    "software engineer",
    "software developer",
    "engineer",
    "developer",
    "react native",
    "lead",
    "senior",
    "staff",
    "principal",
  ];

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
  ];

  function isFenced(location: string): boolean {
    return FENCING_PATTERNS.some((p) => p.test(location.toLowerCase()));
  }
  function isRemote(workplace: string | null, location: string): boolean {
    const w = (workplace || "").toLowerCase();
    const l = (location || "").toLowerCase();
    return w === "remote" || w === "hybrid" || l.includes("remote");
  }
  function isMainstream(title: string): boolean {
    const t = title.toLowerCase();
    return MAINSTACK_KEYWORDS.some((k) => t.includes(k));
  }

  // 2. Identify the 49 addressable companies
  const addressableSlugs = new Set<string>();
  for (const c of ashbyCompanies) {
    const jobs = await sql`
      SELECT id, title, location_name, workplace_type
      FROM job WHERE ats_source::text = 'ashby' AND ats_slug = ${c.ats_slug}
        AND status = 'active'
    `;
    if (jobs.length === 0) continue;
    let addressableJobs = 0;
    for (const j of jobs) {
      const loc = j.location_name || "";
      if (
        isRemote(j.workplace_type, loc) &&
        !isFenced(loc) &&
        isMainstream(j.title)
      ) {
        addressableJobs++;
      }
    }
    if (addressableJobs > 0) addressableSlugs.add(c.ats_slug);
  }
  console.log(`Addressable companies: ${addressableSlugs.size}\n`);

  // 3. For each addressable company, validate all jobs
  const validations: any[] = [];
  let genuinelyGlobal = 0;
  let likelyRegionFenced = 0;
  let ambiguous = 0;

  for (const c of ashbyCompanies) {
    if (!addressableSlugs.has(c.ats_slug)) continue;

    const jobs = await sql`
      SELECT id, title, location_name, workplace_type, normalized_text, raw_json
      FROM job WHERE ats_source::text = 'ashby' AND ats_slug = ${c.ats_slug}
        AND status = 'active'
    `;

    let totalFencingScore = 0;
    let totalGlobalScore = 0;
    let jobsWithFencing = 0;
    let jobsWithGlobal = 0;
    const allFencingSignals: string[] = [];
    const allGlobalSignals: string[] = [];
    const locations = new Set<string>();

    for (const job of jobs) {
      const loc = job.location_name || "";
      if (loc) locations.add(loc);

      // Get JD text
      let jdText = job.normalized_text || "";
      if (!jdText && job.raw_json) {
        try {
          const raw = JSON.parse(job.raw_json);
          jdText =
            raw.descriptionPlain ||
            raw.descriptionHtml ||
            raw.description ||
            "";
        } catch {
          jdText = "";
        }
      }

      const analysis = analyzeJd(jdText);
      totalFencingScore += analysis.fencingScore;
      totalGlobalScore += analysis.globalScore;
      if (analysis.fencingScore > 0) {
        jobsWithFencing++;
        allFencingSignals.push(...analysis.fencingSignals.map((s) => s.region));
      }
      if (analysis.globalScore > 0) {
        jobsWithGlobal++;
        allGlobalSignals.push(...analysis.globalSignals.map((s) => s.strength));
      }
    }

    // Score the company
    const avgFencingScore =
      jobs.length > 0 ? totalFencingScore / jobs.length : 0;
    const avgGlobalScore = jobs.length > 0 ? totalGlobalScore / jobs.length : 0;
    const fencingRate = jobs.length > 0 ? jobsWithFencing / jobs.length : 0;
    const globalRate = jobs.length > 0 ? jobsWithGlobal / jobs.length : 0;

    let verdict = "genuinely_global";
    let reason = "";

    if (avgFencingScore >= 1.0 && fencingRate >= 0.3) {
      verdict = "likely_region_fenced";
      reason = `${jobsWithFencing}/${jobs.length} jobs have fencing signals (avg score ${avgFencingScore.toFixed(1)})`;
      likelyRegionFenced++;
    } else if (
      avgFencingScore >= 0.5 ||
      (fencingRate >= 0.15 && avgGlobalScore < 1.0)
    ) {
      verdict = "ambiguous";
      reason = `Some fencing signals (${jobsWithFencing}/${jobs.length} jobs), weak global signals`;
      ambiguous++;
    } else {
      genuinelyGlobal++;
      reason = `${jobsWithGlobal}/${jobs.length} jobs have global signals, minimal fencing`;
    }

    // Deduplicate signals
    const uniqueFencing = [...new Set(allFencingSignals)];
    const uniqueGlobal = [...new Set(allGlobalSignals)];

    validations.push({
      slug: c.ats_slug,
      name: (c.company_name || c.ats_slug).substring(0, 25),
      jobs: jobs.length,
      locations: [...locations].slice(0, 3).join(" | ").substring(0, 50),
      fencing_jobs: jobsWithFencing,
      fencing_rate: `${(fencingRate * 100).toFixed(0)}%`,
      fencing_signals: uniqueFencing.slice(0, 3).join(","),
      global_jobs: jobsWithGlobal,
      global_signals: uniqueGlobal.slice(0, 2).join(","),
      verdict,
      reason: reason.substring(0, 60),
    });
  }

  // 4. Results
  console.log("=== Validation Results ===");
  console.log(`Genuinely global:     ${genuinelyGlobal}`);
  console.log(`Likely region-fenced: ${likelyRegionFenced}`);
  console.log(`Ambiguous:            ${ambiguous}`);
  console.log(`Total:                ${validations.length}\n`);

  // 5. Show likely region-fenced companies (the contamination)
  const fenced = validations.filter(
    (v) => v.verdict === "likely_region_fenced",
  );
  if (fenced.length > 0) {
    console.log("=== LIKELY REGION-FENCED (contamination in fingerprint) ===");
    console.table(
      fenced.map((v) => ({
        slug: v.slug,
        name: v.name,
        jobs: v.jobs,
        fencing_jobs: v.fencing_jobs,
        fencing_rate: v.fencing_rate,
        fencing_signals: v.fencing_signals,
        locations: v.locations,
      })),
    );
  }

  // 6. Show ambiguous companies
  const amb = validations.filter((v) => v.verdict === "ambiguous");
  if (amb.length > 0) {
    console.log("\n=== AMBIGUOUS (need manual review) ===");
    console.table(
      amb.map((v) => ({
        slug: v.slug,
        name: v.name,
        jobs: v.jobs,
        fencing_jobs: v.fencing_jobs,
        fencing_signals: v.fencing_signals,
        global_jobs: v.global_jobs,
      })),
    );
  }

  // 7. Show genuinely global companies (the validated fingerprint)
  const global = validations.filter((v) => v.verdict === "genuinely_global");
  console.log("\n=== GENUINELY GLOBAL (validated fingerprint) ===");
  console.table(
    global.map((v) => ({
      slug: v.slug,
      name: v.name,
      jobs: v.jobs,
      global_jobs: v.global_jobs,
      global_signals: v.global_signals,
      locations: v.locations,
    })),
  );

  // 8. Summary
  console.log("\n=== SUMMARY ===");
  console.log(
    `Validated fingerprint: ${genuinelyGlobal} genuinely global companies`,
  );
  console.log(
    `Contamination removed: ${likelyRegionFenced} likely region-fenced companies`,
  );
  console.log(`Needs manual review: ${ambiguous} ambiguous companies`);
  console.log("");
  console.log("VERDICT:");
  if (likelyRegionFenced === 0 && ambiguous === 0) {
    console.log(
      "  All 49 companies validated as genuinely worldwide — fingerprint is trustworthy.",
    );
  } else if (likelyRegionFenced <= 3) {
    console.log(
      `  Low contamination (${likelyRegionFenced} region-fenced) — fingerprint is usable with minor cleanup.`,
    );
  } else {
    console.log(
      `  High contamination (${likelyRegionFenced} region-fenced) — fingerprint needs cleanup before L2 targeting.`,
    );
    console.log(
      "  RECOMMENDATION: Remove region-fenced companies from the reference set before scoring L2 sources.",
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fingerprint validation failed:", err);
  process.exit(1);
});
