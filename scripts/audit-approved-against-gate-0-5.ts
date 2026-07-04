// @ts-nocheck
// Audit approved matches against the new Gate 0.5 + work-auth protocols.
//
// Fetches all approved matches from the live database, runs each through
// runHardBlockerPreFilter (the actual Gate 0.5 logic), and checks work-auth
// risk flag conditions. Reports which jobs would be caught by the new
// protocols and which genuinely pass.
//
// Usage: npx tsx scripts/audit-approved-against-gate-0-5.ts

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { runHardBlockerPreFilter } from "@/lib/jobs/gate-zero-pre-filter";

function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "{}" || trimmed === "") return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed
        .slice(1, -1)
        .split(",")
        .filter(Boolean)
        .map((s) => s.trim().replace(/^"|"$/g, ""));
    }
    return trimmed.split(",").filter(Boolean);
  }
  return [];
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

// Work-auth risk flag heuristic (mirrors Gate 3 criterion 7):
// Set when the JD is silent on work authorization BUT the role is hybrid
// or single-country-remote (not global remote).
//
// IMPORTANT: The location field alone is not enough. Many ATS systems set
// the location to a specific city/country even for global remote roles.
// We check the JD text for explicit global remote indicators ("global,
// remote-first", "work from anywhere", "across N countries", etc.) before
// flagging. If the JD explicitly says global, we do NOT flag.
function checkWorkAuthRiskFlag(
  workplaceType: string | null,
  locationName: string | null,
  normalizedText: string | null,
): boolean {
  const text = `${locationName ?? ""} ${normalizedText ?? ""}`.toLowerCase();

  // 1. If the JD explicitly mentions work auth / visa / citizenship, no risk
  //    flag — it's handled as a hard blocker or explicit pass by Gate 3.
  const hasExplicitWorkAuth =
    /eu citizenship|eu citizen|work permit|visa sponsorship|no sponsorship|green card|permanent resident|us citizen|rwr card|blue card|settled status|pre-settled|authorized to work|work authorization|right to work/i.test(
      text,
    );
  if (hasExplicitWorkAuth) return false;

  // 2. If the JD or location explicitly says global remote, no risk flag.
  //    This catches cases like HighLevel ("global, remote-first organization")
  //    where the location field says "India" or "Delhi" but the JD clarifies
  //    the role is genuinely global.
  const isGlobalRemote =
    /remote.*global|remote.*worldwide|remote.*anywhere|global.*remote|remote-first.*global|global.*remote-first|work from anywhere|work from any location|across \d+ countries|distributed (team|workforce)|any country|any location/i.test(
      text,
    );
  if (isGlobalRemote) return false;

  // 3. Hybrid roles with a specific location → risk flag
  //    (hybrid means you need to be in that location part of the week,
  //    which implies work authorization for that country)
  if (workplaceType === "hybrid") return true;

  // 4. Remote but single-country/region (not global) → risk flag
  if (workplaceType === "remote") {
    const loc = (locationName ?? "").toLowerCase();
    // Check if location mentions a specific country/region (not just "remote")
    const hasCountryMention =
      /united states|usa|u\.s\.|canada|uk|united kingdom|europe|eu|germany|france|ireland|netherlands|spain|portugal|poland|romania|serbia|brazil|argentina|mexico|colombia|india|australia|japan|singapore|austria|switzerland|sweden|norway|denmark|finland|belgium|italy|balkans|latam|apac|emea|north america|kraków|pune|delhi|london|new york|ljubljana/i.test(
        loc,
      );
    if (hasCountryMention) return true;
  }

  return false;
}

async function main() {
  console.log("=".repeat(80));
  console.log("AUDIT: Approved matches vs. new Gate 0.5 + work-auth protocols");
  console.log("=".repeat(80) + "\n");

  // Fetch all approved matches with full job + applicant data
  const rows = await db.execute(sql`
    SELECT
      mq.id AS match_queue_id,
      mq.status,
      mq.overlap_score,
      mq.cosine_distance,
      mq.llm_confidence,
      mq.llm_reasoning,
      mq.llm_blockers,
      mq.created_at,
      mq.work_auth_risk_flag,
      j.id AS job_id,
      j.title AS job_title,
      j.ats_source,
      j.ats_slug,
      j.company_name AS job_company_name,
      j.workplace_type AS job_workplace_type,
      j.location_name AS job_location_name,
      j.normalized_text AS job_normalized_text,
      j.title_region_tag,
      j.location_countries,
      j.experience_min_years,
      j.experience_max_years,
      j.compensation_min,
      j.compensation_max,
      j.compensation_currency,
      j.rejection_pattern,
      j.extracted_tags AS job_extracted_tags,
      a.country AS applicant_country,
      a.assignment_types,
      a.preferred_compliance,
      a.work_authorizations,
      a.expected_comp_min,
      a.years_of_experience,
      p.persona_label,
      p.must_have_tags AS persona_must_have_tags
    FROM match_queue mq
    INNER JOIN job j ON mq.job_id = j.id
    INNER JOIN applicant a ON mq.applicant_id = a.user_id
    INNER JOIN persona p ON mq.persona_id = p.id
    WHERE mq.status = 'approved'
    ORDER BY mq.created_at DESC
  `);

  const matches = rows.rows ?? rows;

  console.log(`Total approved matches found: ${matches.length}\n`);

  if (matches.length === 0) {
    console.log("No approved matches to audit.");
    return;
  }

  interface AuditResult {
    matchQueueId: string;
    jobId: string;
    company: string;
    title: string;
    location: string;
    workplaceType: string | null;
    atsSource: string;
    personaLabel: string;
    gate05Result: {
      passes: boolean;
      blockers: string[];
      patternDetected: string | null;
    };
    workAuthRiskFlag: boolean;
    workAuthRiskReason: string;
    verdict: "PASS" | "GATE_0_5_BLOCKED" | "WORK_AUTH_RISK";
  }

  const results: AuditResult[] = [];
  const blocked: AuditResult[] = [];
  const riskFlag: AuditResult[] = [];
  const passed: AuditResult[] = [];

  for (const row of matches) {
    const jobTitle = row.job_title ?? "Unknown";
    const companyName = row.job_company_name ?? "Unknown";
    const locationName = row.job_location_name;
    const workplaceType = row.job_workplace_type;
    const normalizedText = row.job_normalized_text;
    const applicantCountry = row.applicant_country;
    const assignmentTypes = parseTextArray(row.assignment_types);
    const preferredCompliance = parseTextArray(row.preferred_compliance);
    const workAuthorizations = parseTextArray(row.work_authorizations);
    const expectedCompMin = toNumber(row.expected_comp_min);
    const yearsOfExperience = toNumber(row.years_of_experience);

    // Run Gate 0.5 hard-blocker pre-filter
    const gate05Result = runHardBlockerPreFilter({
      job: {
        title: jobTitle,
        locationName: locationName,
        workplaceType: workplaceType as "remote" | "hybrid" | "on-site" | null,
        normalizedText: normalizedText,
        titleRegionTag: row.title_region_tag,
        locationCountries: parseTextArray(row.location_countries),
        experienceMinYears: toNumber(row.experience_min_years),
        experienceMaxYears: toNumber(row.experience_max_years),
        compensationMin: toNumber(row.compensation_min),
        compensationMax: toNumber(row.compensation_max),
        compensationCurrency: row.compensation_currency,
      },
      applicant: {
        country: applicantCountry,
        assignmentTypes: assignmentTypes,
        preferredCompliance: preferredCompliance,
        expectedCompMin: expectedCompMin,
        yearsOfExperience: yearsOfExperience,
      },
    });

    // Check work-auth risk flag
    const workAuthRisk = checkWorkAuthRiskFlag(
      workplaceType,
      locationName,
      normalizedText,
    );

    const result: AuditResult = {
      matchQueueId: row.match_queue_id,
      jobId: row.job_id,
      company: companyName,
      title: jobTitle,
      location: locationName ?? "not specified",
      workplaceType: workplaceType,
      atsSource: row.ats_source,
      personaLabel: row.persona_label,
      gate05Result: {
        passes: gate05Result.passes,
        blockers: gate05Result.blockers,
        patternDetected: gate05Result.patternDetected,
      },
      workAuthRiskFlag: workAuthRisk,
      workAuthRiskReason: workAuthRisk
        ? "JD silent on work auth + hybrid or single-country-remote"
        : "N/A",
      verdict: gate05Result.passes
        ? workAuthRisk
          ? "WORK_AUTH_RISK"
          : "PASS"
        : "GATE_0_5_BLOCKED",
    };

    results.push(result);

    if (!gate05Result.passes) {
      blocked.push(result);
    } else if (workAuthRisk) {
      riskFlag.push(result);
    } else {
      passed.push(result);
    }
  }

  // ── Report: Blocked by Gate 0.5 ──────────────────────────────────────────
  console.log("─".repeat(80));
  console.log(`BLOCKED BY GATE 0.5: ${blocked.length} jobs`);
  console.log("─".repeat(80) + "\n");

  for (const r of blocked) {
    console.log(`  ❌ ${r.company} — "${r.title}"`);
    console.log(`     Location: ${r.location}`);
    console.log(`     Workplace: ${r.workplaceType ?? "null"}`);
    console.log(`     ATS: ${r.atsSource} | Persona: ${r.personaLabel}`);
    console.log(`     Pattern: ${r.gate05Result.patternDetected}`);
    for (const blocker of r.gate05Result.blockers) {
      console.log(`     Blocker: ${blocker}`);
    }
    console.log(`     Job ID: ${r.jobId}`);
    console.log("");
  }

  // ── Report: Work-auth risk flag ──────────────────────────────────────────
  console.log("─".repeat(80));
  console.log(
    `WORK-AUTH RISK FLAG (not blocked, but needs verification): ${riskFlag.length} jobs`,
  );
  console.log("─".repeat(80) + "\n");

  for (const r of riskFlag) {
    console.log(`  ⚠  ${r.company} — "${r.title}"`);
    console.log(`     Location: ${r.location}`);
    console.log(`     Workplace: ${r.workplaceType ?? "null"}`);
    console.log(`     ATS: ${r.atsSource} | Persona: ${r.personaLabel}`);
    console.log(`     Reason: ${r.workAuthRiskReason}`);
    console.log(`     Job ID: ${r.jobId}`);
    console.log("");
  }

  // ── Report: Genuinely passed ─────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log(
    `GENUINE MATCHES (pass all new protocols): ${passed.length} jobs`,
  );
  console.log("─".repeat(80) + "\n");

  for (const r of passed) {
    console.log(`  ✅ ${r.company} — "${r.title}"`);
    console.log(`     Location: ${r.location}`);
    console.log(`     Workplace: ${r.workplaceType ?? "null"}`);
    console.log(`     ATS: ${r.atsSource} | Persona: ${r.personaLabel}`);
    console.log(`     Job ID: ${r.jobId}`);
    console.log("");
  }

  // ── Summary table ────────────────────────────────────────────────────────
  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  console.log(`  Total approved matches audited:  ${results.length}`);
  console.log(`  Blocked by Gate 0.5:             ${blocked.length}`);
  console.log(`  Work-auth risk flag (verify):    ${riskFlag.length}`);
  console.log(`  Genuine matches (all pass):      ${passed.length}`);
  console.log("");

  // ── Pattern breakdown ────────────────────────────────────────────────────
  if (blocked.length > 0) {
    console.log("Gate 0.5 pattern breakdown:");
    const patternCounts: Record<string, number> = {};
    for (const r of blocked) {
      const p = r.gate05Result.patternDetected ?? "unknown";
      patternCounts[p] = (patternCounts[p] ?? 0) + 1;
    }
    for (const [pattern, count] of Object.entries(patternCounts).sort(
      (a, b) => b[1] - a[1],
    )) {
      console.log(`  ${pattern}: ${count}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
