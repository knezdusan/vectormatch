// @ts-nocheck
// Investigation script: analyze match_queue rows with status='mismatch' to
// find patterns that could be used to harden the matching algorithm.
//
// Run: npx tsx scripts/investigate-mismatch-patterns.ts
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
  console.log("=== MISMATCH INVESTIGATION ===\n");

  // 1. Count mismatched rows overall + by applicant
  const counts = await db.execute(sql`
    SELECT
      COUNT(*) AS total_mismatch,
      COUNT(DISTINCT applicant_id) AS distinct_applicants,
      COUNT(DISTINCT job_id) AS distinct_jobs,
      COUNT(DISTINCT persona_id) AS distinct_personas
    FROM match_queue
    WHERE status = 'mismatch'
  `);
  const c = counts.rows[0] as Record<string, number>;
  console.log("Total mismatch rows:", c.total_mismatch);
  console.log("Distinct applicants:", c.distinct_applicants);
  console.log("Distinct jobs:", c.distinct_jobs);
  console.log("Distinct personas:", c.distinct_personas);

  // 2. Per-applicant breakdown
  const perApplicant = await db.execute(sql`
    SELECT
      mq.applicant_id,
      ap.country,
      ap.preferred_compliance,
      ap.assignment_types,
      ap.modalities,
      ap.work_authorizations,
      COUNT(*) AS mismatch_count
    FROM match_queue mq
    JOIN applicant ap ON ap.user_id = mq.applicant_id
    WHERE mq.status = 'mismatch'
    GROUP BY mq.applicant_id, ap.country, ap.preferred_compliance, ap.assignment_types, ap.modalities, ap.work_authorizations
    ORDER BY mismatch_count DESC
  `);
  console.log("\n=== PER-APPLICANT MISMATCH COUNTS ===");
  for (const row of perApplicant.rows) {
    console.log(`\nApplicant: ${row.applicant_id}`);
    console.log(`  country: ${row.country}`);
    console.log(
      `  preferred_compliance: ${JSON.stringify(row.preferred_compliance)}`,
    );
    console.log(`  assignment_types: ${JSON.stringify(row.assignment_types)}`);
    console.log(`  modalities: ${JSON.stringify(row.modalities)}`);
    console.log(
      `  work_authorizations: ${JSON.stringify(row.work_authorizations)}`,
    );
    console.log(`  mismatch_count: ${row.mismatch_count}`);
  }

  // 3. Per-persona breakdown
  const perPersona = await db.execute(sql`
    SELECT
      mq.persona_id,
      p.persona_label,
      p.must_have_tags,
      p.blocklist_tags,
      p.seniority_levels,
      COUNT(*) AS mismatch_count
    FROM match_queue mq
    JOIN persona p ON p.id = mq.persona_id
    WHERE mq.status = 'mismatch'
    GROUP BY mq.persona_id, p.persona_label, p.must_have_tags, p.blocklist_tags, p.seniority_levels
    ORDER BY mismatch_count DESC
  `);
  console.log("\n=== PER-PERSONA MISMATCH COUNTS ===");
  for (const row of perPersona.rows) {
    console.log(`\nPersona: ${row.persona_label}`);
    console.log(`  id: ${row.persona_id}`);
    console.log(`  must_have_tags: ${JSON.stringify(row.must_have_tags)}`);
    console.log(`  blocklist_tags: ${JSON.stringify(row.blocklist_tags)}`);
    console.log(`  seniority_levels: ${JSON.stringify(row.seniority_levels)}`);
    console.log(`  mismatch_count: ${row.mismatch_count}`);
  }

  // 4. Job-level metadata for all mismatched rows (the core analysis)
  const rows = await db.execute(sql`
    SELECT
      mq.id AS match_id,
      mq.applicant_id,
      mq.persona_id,
      mq.overlap_score,
      mq.cosine_distance,
      mq.llm_verdict,
      mq.llm_confidence,
      mq.llm_blockers,
      mq.llm_reasoning,
      mq.work_auth_risk_flag,
      mq.created_at,
      mq.evaluated_at,
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
      p.persona_label,
      p.must_have_tags,
      p.blocklist_tags,
      p.seniority_levels,
      ap.country,
      ap.preferred_compliance,
      ap.assignment_types,
      ap.modalities,
      ap.work_authorizations,
      ap.expected_comp_min,
      ap.years_of_experience
    FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    JOIN applicant ap ON ap.user_id = mq.applicant_id
    WHERE mq.status = 'mismatch'
    ORDER BY mq.created_at DESC
  `);

  console.log(`\n=== FULL MISMATCH ROWS (${rows.rows.length}) ===\n`);

  // Pattern aggregation buckets
  const patterns: Record<string, number> = {
    on_site_vs_remote_only: 0,
    hybrid_foreign_country: 0,
    country_fenced_remote: 0,
    seniority_gap: 0,
    compensation_too_low: 0,
    wrong_tech_stack: 0,
    blocklist_tag_present: 0,
    llm_rejected_but_user_marked_mismatch: 0,
    llm_approved_but_user_marked_mismatch: 0,
    llm_error_state: 0,
    low_overlap_score: 0,
    high_cosine_distance: 0,
    employment_type_mismatch: 0,
    work_auth_risk: 0,
    no_llm_verdict: 0,
  };

  const jobTitleCounts: Record<string, number> = {};
  const companyCounts: Record<string, number> = {};
  const atsSourceCounts: Record<string, number> = {};
  const workplaceCounts: Record<string, number> = {};
  const remoteScopeCounts: Record<string, number> = {};
  const llmVerdictCounts: Record<string, number> = {};

  for (const r of rows.rows) {
    const jobTags = parseTextArray(r.extracted_tags);
    const mustHave = parseTextArray(r.must_have_tags);
    const blocklist = parseTextArray(r.blocklist_tags);
    const assignmentTypes = parseTextArray(r.assignment_types);
    const modalities = parseTextArray(r.modalities);
    const preferredCompliance = parseTextArray(r.preferred_compliance);
    const llmBlockers = parseTextArray(r.llm_blockers);
    const seniorityLevels = parseTextArray(r.seniority_levels);

    // Aggregate counts
    jobTitleCounts[r.title] = (jobTitleCounts[r.title] ?? 0) + 1;
    companyCounts[r.company_name] = (companyCounts[r.company_name] ?? 0) + 1;
    atsSourceCounts[r.ats_source] = (atsSourceCounts[r.ats_source] ?? 0) + 1;
    workplaceCounts[r.workplace_type ?? "null"] =
      (workplaceCounts[r.workplace_type ?? "null"] ?? 0) + 1;
    remoteScopeCounts[r.remote_scope ?? "null"] =
      (remoteScopeCounts[r.remote_scope ?? "null"] ?? 0) + 1;
    llmVerdictCounts[r.llm_verdict ?? "null"] =
      (llmVerdictCounts[r.llm_verdict ?? "null"] ?? 0) + 1;

    // Pattern detection
    // 1. On-site vs remote-only applicant
    if (
      r.workplace_type === "on-site" &&
      !assignmentTypes.includes("on-site") &&
      !assignmentTypes.includes("hybrid")
    ) {
      patterns.on_site_vs_remote_only++;
    }

    // 2. Hybrid in foreign country
    if (
      r.workplace_type === "hybrid" &&
      r.location_name &&
      r.country &&
      !String(r.location_name)
        .toLowerCase()
        .includes(String(r.country).toLowerCase())
    ) {
      patterns.hybrid_foreign_country++;
    }

    // 3. Country-fenced remote (not matching applicant country)
    if (
      r.workplace_type === "remote" &&
      (r.remote_scope === "country_fenced" ||
        r.remote_scope === "region_fenced")
    ) {
      patterns.country_fenced_remote++;
    }

    // 4. Seniority gap
    if (r.experience_min_years && r.years_of_experience) {
      if (Number(r.experience_min_years) > Number(r.years_of_experience) + 2) {
        patterns.seniority_gap++;
      }
    }

    // 5. Compensation too low
    if (r.compensation_max && r.expected_comp_min) {
      if (Number(r.compensation_max) < Number(r.expected_comp_min)) {
        patterns.compensation_too_low++;
      }
    }

    // 6. Wrong tech stack — none of the persona's must-have tags in job tags
    const hasMustHaveMatch = mustHave.some((t) => jobTags.includes(t));
    if (!hasMustHaveMatch) {
      patterns.wrong_tech_stack++;
    }

    // 7. Blocklist tag present in job tags
    const blocklistHit = blocklist.some((t) => jobTags.includes(t));
    if (blocklistHit) {
      patterns.blocklist_tag_present++;
    }

    // 8/9/10. LLM verdict correlation
    if (r.llm_verdict === "rejected") {
      patterns.llm_rejected_but_user_marked_mismatch++;
    } else if (r.llm_verdict === "approved") {
      patterns.llm_approved_but_user_marked_mismatch++;
    } else if (r.llm_verdict === "error") {
      patterns.llm_error_state++;
    } else {
      patterns.no_llm_verdict++;
    }

    // 11. Low overlap score
    if (Number(r.overlap_score) <= 1) {
      patterns.low_overlap_score++;
    }

    // 12. High cosine distance (weak semantic match)
    if (r.cosine_distance && Number(r.cosine_distance) > 0.45) {
      patterns.high_cosine_distance++;
    }

    // 13. Employment type mismatch (contract job vs full-time-only applicant)
    if (r.employment_type) {
      const et = String(r.employment_type).toLowerCase();
      if (
        (et.includes("contract") ||
          et.includes("freelance") ||
          et.includes("part-time")) &&
        !modalities.some((m) =>
          ["contract", "freelance", "part-time"].includes(
            String(m).toLowerCase(),
          ),
        )
      ) {
        patterns.employment_type_mismatch++;
      }
    }

    // 14. Work auth risk flag
    if (r.work_auth_risk_flag === true) {
      patterns.work_auth_risk++;
    }

    // Print individual row summary
    console.log("---");
    console.log(`Match: ${r.match_id}`);
    console.log(
      `  Job: ${r.title} @ ${r.company_name} (${r.ats_source}/${r.ats_slug})`,
    );
    console.log(`  Persona: ${r.persona_label}`);
    console.log(
      `  Applicant country: ${r.country} | work_auth: ${JSON.stringify(r.work_authorizations)}`,
    );
    console.log(
      `  Job workplace: ${r.workplace_type} | remote_scope: ${r.remote_scope} | location: ${r.location_name}`,
    );
    console.log(
      `  Job employment_type: ${r.employment_type} | exp: ${r.experience_min_years}-${r.experience_max_years}y`,
    );
    console.log(
      `  Job comp: ${r.compensation_min}-${r.compensation_max} ${r.compensation_currency}`,
    );
    console.log(
      `  Applicant exp: ${r.years_of_experience}y | expected_comp_min: ${r.expected_comp_min}`,
    );
    console.log(
      `  overlap_score: ${r.overlap_score} | cosine_distance: ${r.cosine_distance}`,
    );
    console.log(
      `  llm_verdict: ${r.llm_verdict} | llm_confidence: ${r.llm_confidence}`,
    );
    console.log(`  llm_blockers: ${JSON.stringify(llmBlockers)}`);
    console.log(`  work_auth_risk_flag: ${r.work_auth_risk_flag}`);
    console.log(`  job_tags: ${JSON.stringify(jobTags)}`);
    console.log(`  persona must_have: ${JSON.stringify(mustHave)}`);
    console.log(`  persona blocklist: ${JSON.stringify(blocklist)}`);
    console.log(`  persona seniority: ${JSON.stringify(seniorityLevels)}`);
    if (r.llm_reasoning) {
      console.log(`  llm_reasoning: ${r.llm_reasoning}`);
    }
    if (r.short_description) {
      console.log(`  short_desc: ${String(r.short_description).slice(0, 200)}`);
    }
  }

  console.log("\n=== PATTERN AGGREGATION ===");
  const sortedPatterns = Object.entries(patterns).sort((a, b) => b[1] - a[1]);
  for (const [pattern, count] of sortedPatterns) {
    const pct =
      rows.rows.length > 0
        ? ((count / rows.rows.length) * 100).toFixed(1)
        : "0";
    console.log(`  ${pattern}: ${count} (${pct}%)`);
  }

  console.log("\n=== JOB TITLE FREQUENCY (top 20) ===");
  const sortedTitles = Object.entries(jobTitleCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [title, count] of sortedTitles) {
    console.log(`  [${count}] ${title}`);
  }

  console.log("\n=== COMPANY FREQUENCY (top 20) ===");
  const sortedCompanies = Object.entries(companyCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [company, count] of sortedCompanies) {
    console.log(`  [${count}] ${company}`);
  }

  console.log("\n=== ATS SOURCE DISTRIBUTION ===");
  for (const [src, count] of Object.entries(atsSourceCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${src}: ${count}`);
  }

  console.log("\n=== WORKPLACE TYPE DISTRIBUTION ===");
  for (const [wt, count] of Object.entries(workplaceCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${wt}: ${count}`);
  }

  console.log("\n=== REMOTE SCOPE DISTRIBUTION ===");
  for (const [rs, count] of Object.entries(remoteScopeCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${rs}: ${count}`);
  }

  console.log(
    "\n=== LLM VERDICT DISTRIBUTION (at time of mismatch marking) ===",
  );
  for (const [v, count] of Object.entries(llmVerdictCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${v}: ${count}`);
  }

  // Compare mismatch rate vs approved/rejected rates for context
  console.log(
    "\n=== OVERALL MATCH_QUEUE STATUS DISTRIBUTION (for context) ===",
  );
  const overall = await db.execute(sql`
    SELECT status, COUNT(*) AS cnt
    FROM match_queue
    GROUP BY status
    ORDER BY cnt DESC
  `);
  for (const row of overall.rows) {
    console.log(`  ${row.status}: ${row.cnt}`);
  }

  // Cosine distance + overlap score stats for mismatched vs approved
  console.log(
    "\n=== COSINE DISTANCE / OVERLAP STATS: mismatch vs approved ===",
  );
  const stats = await db.execute(sql`
    SELECT
      status,
      COUNT(*) AS cnt,
      ROUND(AVG(cosine_distance)::numeric, 4) AS avg_cosine,
      ROUND(MIN(cosine_distance)::numeric, 4) AS min_cosine,
      ROUND(MAX(cosine_distance)::numeric, 4) AS max_cosine,
      ROUND(AVG(overlap_score)::numeric, 2) AS avg_overlap,
      MIN(overlap_score) AS min_overlap,
      MAX(overlap_score) AS max_overlap
    FROM match_queue
    WHERE status IN ('mismatch', 'approved', 'rejected')
    GROUP BY status
    ORDER BY status
  `);
  for (const row of stats.rows) {
    console.log(
      `  ${row.status}: n=${row.cnt} | cosine avg=${row.avg_cosine} min=${row.min_cosine} max=${row.max_cosine} | overlap avg=${row.avg_overlap} min=${row.min_overlap} max=${row.max_overlap}`,
    );
  }

  console.log("\n=== DONE ===");
  process.exit(0);
}

main().catch((err) => {
  console.error("Investigation failed:", err);
  process.exit(1);
});
