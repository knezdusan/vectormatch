// @ts-nocheck
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";

function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "{}" || trimmed === "") return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      return trimmed.slice(1, -1).split(",").filter(Boolean);
    }
    return trimmed.split(",").filter(Boolean);
  }
  return [];
}

async function main() {
  const matchId = "4f46e006-b9db-4903-9516-35d86a19aa80";

  const rows = await db.execute(sql`
    SELECT
      mq.id AS match_id,
      mq.status,
      mq.overlap_score,
      mq.cosine_distance,
      mq.llm_verdict,
      mq.llm_confidence,
      mq.llm_blockers,
      mq.llm_reasoning,
      mq.work_auth_risk_flag,
      mq.created_at,
      j.id AS job_id,
      j.title,
      j.company_name,
      j.ats_source,
      j.ats_slug,
      j.workplace_type,
      j.remote_scope,
      j.employment_type,
      j.location_name,
      j.location_countries,
      j.experience_min_years,
      j.experience_max_years,
      j.compensation_min,
      j.compensation_max,
      j.compensation_currency,
      j.extracted_tags,
      j.short_description,
      j.normalized_text,
      j.rejection_pattern,
      p.persona_label,
      p.must_have_tags,
      p.blocklist_tags,
      p.seniority_levels,
      ap.country,
      ap.preferred_compliance,
      ap.assignment_types,
      ap.modalities,
      ap.work_authorizations,
      ap.all_tags
    FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    JOIN applicant ap ON ap.user_id = mq.applicant_id
    WHERE mq.id = ${matchId}::uuid
  `);

  if (rows.rows.length === 0) {
    console.log("No match found with ID:", matchId);
    process.exit(1);
  }

  const r = rows.rows[0];
  const jobTags = parseTextArray(r.extracted_tags);
  const mustHave = parseTextArray(r.must_have_tags);
  const blocklist = parseTextArray(r.blocklist_tags);
  const allTags = parseTextArray(r.all_tags);
  const seniorityLevels = parseTextArray(r.seniority_levels);
  const assignmentTypes = parseTextArray(r.assignment_types);
  const preferredCompliance = parseTextArray(r.preferred_compliance);

  console.log("=== MATCH DETAILS ===\n");
  console.log("Match ID:", r.match_id);
  console.log("Status:", r.status);
  console.log("Overlap score:", r.overlap_score);
  console.log("Cosine distance:", r.cosine_distance);
  console.log("LLM verdict:", r.llm_verdict);
  console.log("LLM confidence:", r.llm_confidence);
  console.log("LLM blockers:", JSON.stringify(r.llm_blockers));
  console.log("LLM reasoning:", r.llm_reasoning);
  console.log("Work auth risk flag:", r.work_auth_risk_flag);

  console.log("\n=== JOB DETAILS ===\n");
  console.log("Title:", r.title);
  console.log("Company:", r.company_name);
  console.log("ATS:", r.ats_source + "/" + r.ats_slug);
  console.log("Workplace type:", r.workplace_type);
  console.log("Remote scope:", r.remote_scope);
  console.log("Employment type:", r.employment_type);
  console.log("Location name:", r.location_name);
  console.log("Location countries:", JSON.stringify(r.location_countries));
  console.log("Experience:", r.experience_min_years, "-", r.experience_max_years);
  console.log("Compensation:", r.compensation_min, "-", r.compensation_max, r.compensation_currency);
  console.log("Rejection pattern:", r.rejection_pattern);
  console.log("Extracted tags:", JSON.stringify(jobTags));
  console.log("Short description:", r.short_description);
  console.log("\nNormalized text (first 2000 chars):");
  console.log(String(r.normalized_text ?? "").slice(0, 2000));

  console.log("\n=== PERSONA DETAILS ===\n");
  console.log("Label:", r.persona_label);
  console.log("Must-have tags:", JSON.stringify(mustHave));
  console.log("Blocklist tags:", JSON.stringify(blocklist));
  console.log("Seniority levels:", JSON.stringify(seniorityLevels));

  console.log("\n=== APPLICANT DETAILS ===\n");
  console.log("Country:", r.country);
  console.log("Preferred compliance:", JSON.stringify(preferredCompliance));
  console.log("Assignment types:", JSON.stringify(assignmentTypes));
  console.log("All tags:", JSON.stringify(allTags));

  // Analysis: would our fixes catch this?
  console.log("\n=== FIX IMPACT ANALYSIS ===\n");

  // Fix 1: inferRemoteScope — remote + specific location → country_fenced
  const isRemote = r.workplace_type === "remote";
  const locationStr = String(r.location_name ?? "").toLowerCase();
  const remoteIndicators = ["remote", "global", "worldwide", "anywhere", "distributed", "work from", "any location", "any country"];
  const broadRegions = ["european union", "eu", "emea", "apac", "latam", "north america", "south america", "europe", "asia", "africa", "middle east", "balkans", "eastern europe", "western europe", "central europe", "nordics", "benelux", "dach"];
  const hasRemoteIndicator = remoteIndicators.some((ind) => locationStr.includes(ind));
  const hasBroadRegion = broadRegions.some((region) => locationStr.includes(region));
  const isSpecificLocation = !hasRemoteIndicator && !hasBroadRegion && locationStr.length > 0;

  console.log("Fix 1 (inferRemoteScope):");
  console.log("  workplace_type is remote:", isRemote);
  console.log("  location has remote indicator:", hasRemoteIndicator);
  console.log("  location has broad region:", hasBroadRegion);
  console.log("  isSpecificLocation:", isSpecificLocation);
  console.log("  Would Fix 1 classify as country_fenced?", isRemote && isSpecificLocation ? "YES" : "NO");

  // Fix 2: Gate 0.5 Check 2b — remote + specific foreign location + unknown/undetermined scope
  const scopeIsAmbiguous = r.remote_scope === "unknown" || r.remote_scope === "undetermined";
  console.log("\nFix 2 (Gate 0.5 Check 2b):");
  console.log("  remote_scope:", r.remote_scope);
  console.log("  scope is unknown/undetermined:", scopeIsAmbiguous);
  console.log("  Would Fix 2 fire?", isRemote && isSpecificLocation && scopeIsAmbiguous ? "YES" : "NO");
  if (r.remote_scope === "country_fenced") {
    console.log("  (remote_scope is already country_fenced — Check 2 would handle it)");
  }
  if (r.remote_scope === "global") {
    console.log("  (remote_scope is global — Check 2 passes, Check 2b does NOT fire)");
  }

  // Check if location mentions applicant's country
  const country = String(r.country ?? "").toUpperCase();
  const countryNames: Record<string, string[]> = {
    RS: ["serbia", "rs"],
    PL: ["poland", "pl"],
  };
  const names = countryNames[country] ?? [country.toLowerCase()];
  const locationMentionsCountry = names.some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`).test(locationStr);
  });
  console.log("  Location mentions applicant country (" + country + "):", locationMentionsCountry);

  // Tech stack analysis
  console.log("\n=== TECH STACK ANALYSIS ===\n");
  const mustHaveInJobTags = mustHave.filter((t) => jobTags.includes(t));
  const mustHaveNotInJobTags = mustHave.filter((t) => !jobTags.includes(t));
  const jobTagsNotInMustHave = jobTags.filter((t) => !mustHave.includes(t));
  console.log("Persona must-have tags found in job tags:", JSON.stringify(mustHaveInJobTags));
  console.log("Persona must-have tags NOT in job tags:", JSON.stringify(mustHaveNotInJobTags));
  console.log("Job tags NOT in persona must-have:", JSON.stringify(jobTagsNotInMustHave));
  console.log("Java in persona must-have?", mustHave.includes("java"));
  console.log("Java in applicant all_tags?", allTags.includes("java"));
  console.log("Java in job tags?", jobTags.includes("java"));

  // Check if job title declares a primary stack
  const titleLower = String(r.title ?? "").toLowerCase();
  const titleDeclaresStack = /\b(java|python|golang|rust|c\+\+|ruby|php|kotlin|swift)\b/i.test(titleLower);
  console.log("\nJob title declares primary stack?", titleDeclaresStack);
  console.log("Title:", r.title);

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
