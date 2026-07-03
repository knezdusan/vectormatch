// @ts-nocheck
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num));
}

function parseTextArray(value: unknown): string[] {
  if (Array.isArray(value)) return value;
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

function computeWorkplaceMatch(
  assignmentTypes: string[] | null,
  workplaceType: string | null,
): number {
  if (!workplaceType || !assignmentTypes || assignmentTypes.length === 0) {
    return 0.5;
  }
  if (assignmentTypes.includes(workplaceType)) return 1.0;
  if (
    workplaceType === "hybrid" &&
    (assignmentTypes.includes("remote") ||
      assignmentTypes.includes("remote_local"))
  ) {
    return 0.5;
  }
  if (workplaceType === "remote" && assignmentTypes.includes("hybrid"))
    return 0.5;
  if (workplaceType === "on-site" && assignmentTypes.includes("hybrid"))
    return 0.5;
  return 0.0;
}

const LOCATION_COUNTRY_MATCHERS: Record<string, RegExp> = {
  RS: /serbia/i,
  US: /united states|u\.s\.|usa| america/i,
  BR: /brazil/i,
  CA: /canada/i,
  GB: /uk|united kingdom|england|scotland|wales/i,
  AU: /australia|aest/i,
  TW: /taiwan/i,
  MY: /malaysia/i,
  CO: /colombia/i,
  NG: /nigeria/i,
  PT: /portugal/i,
  MT: /malta/i,
  CH: /switzerland/i,
  DE: /germany/i,
  RO: /romania/i,
  UA: /ukraine/i,
  IE: /ireland/i,
  FR: /france/i,
  IN: /india/i,
  AR: /argentina/i,
  MX: /mexico/i,
};

const ANY_COUNTRY_REGEX =
  /united states|u\.s\.|usa| america|brazil|canada|argentina|mexico|uk|united kingdom|england|scotland|wales|australia|aest|taiwan|malaysia|colombia|nigeria|portugal|malta|switzerland|germany|romania|ukraine|ireland|france|india|serbia/i;

function computeLocationMatch(
  applicantCountry: string | null,
  locationName: string | null,
): number {
  if (!applicantCountry || !locationName || locationName === "") {
    return 0.5;
  }
  const isRemote = /remote|global|anywhere|worldwide/i.test(locationName);
  if (!isRemote) return 0.5;

  const matcher = LOCATION_COUNTRY_MATCHERS[applicantCountry];
  if (matcher?.test(locationName)) return 1.0;

  if (ANY_COUNTRY_REGEX.test(locationName)) return 0.0;

  return 1.0;
}

function computeSeniorityMatch(
  personaSeniorityLevels: string[] | null,
  jobTitle: string | null,
): number {
  if (!personaSeniorityLevels || personaSeniorityLevels.length === 0) {
    return 0.5;
  }
  const title = jobTitle ?? "";
  if (/junior|associate|entry|intern|trainee/i.test(title)) {
    return personaSeniorityLevels.includes("junior") ? 1.0 : 0.0;
  }
  if (/senior|sr\.|sr /i.test(title)) {
    return personaSeniorityLevels.includes("senior") ? 1.0 : 0.0;
  }
  if (
    /lead|staff|principal|architect|manager|director|head|expert/i.test(title)
  ) {
    const hasLeadershipLevel =
      personaSeniorityLevels.includes("lead") ||
      personaSeniorityLevels.includes("staff") ||
      personaSeniorityLevels.includes("principal");
    return hasLeadershipLevel ? 1.0 : 0.0;
  }
  return 0.5;
}

function computeBlocklistPenalty(
  blocklistTags: string[] | null,
  jobTags: string[] | null,
): number {
  if (
    !blocklistTags ||
    blocklistTags.length === 0 ||
    !jobTags ||
    jobTags.length === 0
  ) {
    return 0.0;
  }
  return blocklistTags.some((tag) => jobTags.includes(tag)) ? 1.0 : 0.0;
}

function computeCoverageGap(
  overlapScore: number,
  mustHaveTags: string[] | null,
  jobTags: string[] | null,
): number {
  const mustHave = mustHaveTags ?? [];
  const job = jobTags ?? [];
  if (mustHave.length === 0 || job.length === 0) {
    return 0.0;
  }
  if (overlapScore === 0) {
    return 1.0;
  }
  const maxPossible = Math.min(mustHave.length, job.length);
  if (maxPossible <= 0) {
    return 0.0;
  }
  return 1 - overlapScore / maxPossible;
}

const SECONDARY_DOMAIN_TAGS = [
  "wordpress",
  "vue",
  "nuxt",
  "angular",
  "svelte",
  "solidjs",
  "php",
  "laravel",
  "ruby",
  "rails",
  "csharp",
  "dotnet",
  "aspnet",
  "swift",
  "kotlin",
  "flutter",
  "ios",
  "android",
];

function computeSecondaryDomainMismatch(
  mustHaveTags: string[] | null,
  jobTags: string[] | null,
): number {
  const mustHave = mustHaveTags ?? [];
  const job = jobTags ?? [];
  if (mustHave.length === 0 || job.length === 0) {
    return 0.0;
  }
  const count = job.filter(
    (tag) => SECONDARY_DOMAIN_TAGS.includes(tag) && !mustHave.includes(tag),
  ).length;
  return Math.min(count / 3, 1.0);
}

function computeMatchScore(
  overlapScore: number,
  cosineDistance: number | null,
  workplaceMatch: number,
  locationMatch: number,
  seniorityMatch: number,
  blocklistPenalty: number,
  coverageGap: number,
  secondaryDomainMismatch: number,
  companyQualityScore: number | null,
): number {
  const similarity = 1 - (cosineDistance ?? 1);
  const overlapNormalized = 1 - Math.exp(-0.4 * Math.min(overlapScore, 5));
  const companyQualityNormalized = (companyQualityScore ?? 50) / 100;
  const score =
    similarity * 0.25 +
    overlapNormalized * 0.3 +
    workplaceMatch * 0.12 +
    locationMatch * 0.08 +
    seniorityMatch * 0.08 +
    companyQualityNormalized * 0.17 -
    blocklistPenalty * 0.1 -
    coverageGap * 0.1 -
    secondaryDomainMismatch * 0.08;
  return Math.round(clamp(score, 0, 1) * 100);
}

async function main() {
  console.log("Analyzing all approved matches in the system\n");

  const rows = await db.execute(sql`
    SELECT
      mq.id AS match_queue_id,
      mq.status,
      mq.overlap_score,
      mq.cosine_distance,
      mq.llm_verdict,
      mq.llm_confidence,
      mq.llm_reasoning,
      mq.llm_blockers,
      mq.created_at,
      j.id AS job_id,
      j.title AS job_title,
      j.ats_source,
      j.ats_slug,
      j.company_name AS job_company_name,
      j.workplace_type AS job_workplace_type,
      j.location_name AS job_location_name,
      p.id AS persona_id,
      p.persona_label,
      p.seniority_levels AS persona_seniority_levels,
      p.must_have_tags AS persona_must_have_tags,
      p.blocklist_tags AS persona_blocklist_tags,
      j.extracted_tags AS job_extracted_tags,
      a.assignment_types,
      a.country AS applicant_country,
      c.company_name AS registry_company_name,
      cqs.score AS company_quality_score,
      ROUND(
        GREATEST(
          0,
          LEAST(
            1,
            (
              (1 - COALESCE(mq.cosine_distance, 1)) * 0.25
              + (1 - EXP(-0.4 * LEAST(COALESCE(mq.overlap_score, 0), 5))) * 0.30
              + (
                CASE
                  WHEN j.workplace_type IS NULL OR COALESCE(array_length(a.assignment_types, 1), 0) = 0 THEN 0.5
                  WHEN j.workplace_type::text = ANY(a.assignment_types::text[]) THEN 1.0
                  WHEN j.workplace_type::text = 'hybrid' AND ('remote' = ANY(a.assignment_types::text[]) OR 'remote_local' = ANY(a.assignment_types::text[])) THEN 0.5
                  WHEN j.workplace_type::text = 'remote' AND 'hybrid' = ANY(a.assignment_types::text[]) THEN 0.5
                  WHEN j.workplace_type::text = 'on-site' AND 'hybrid' = ANY(a.assignment_types::text[]) THEN 0.5
                  ELSE 0.0
                END
              ) * 0.12
              + (
                CASE
                  WHEN a.country IS NULL OR j.location_name IS NULL OR j.location_name = '' THEN 0.5
                  WHEN j.location_name ~* 'remote|global|anywhere|worldwide' THEN
                    CASE
                      WHEN a.country = 'RS' AND j.location_name ~* 'serbia' THEN 1.0
                      WHEN a.country = 'US' AND j.location_name ~* '(united states|u\.s\.|usa| america)' THEN 1.0
                      WHEN a.country = 'BR' AND j.location_name ~* 'brazil' THEN 1.0
                      WHEN a.country = 'CA' AND j.location_name ~* 'canada' THEN 1.0
                      WHEN a.country = 'GB' AND j.location_name ~* '(uk|united kingdom|england|scotland|wales)' THEN 1.0
                      WHEN a.country = 'AU' AND j.location_name ~* '(australia|aest)' THEN 1.0
                      WHEN a.country = 'TW' AND j.location_name ~* 'taiwan' THEN 1.0
                      WHEN a.country = 'MY' AND j.location_name ~* 'malaysia' THEN 1.0
                      WHEN a.country = 'CO' AND j.location_name ~* 'colombia' THEN 1.0
                      WHEN a.country = 'NG' AND j.location_name ~* 'nigeria' THEN 1.0
                      WHEN a.country = 'PT' AND j.location_name ~* 'portugal' THEN 1.0
                      WHEN a.country = 'MT' AND j.location_name ~* 'malta' THEN 1.0
                      WHEN a.country = 'CH' AND j.location_name ~* 'switzerland' THEN 1.0
                      WHEN a.country = 'DE' AND j.location_name ~* 'germany' THEN 1.0
                      WHEN a.country = 'RO' AND j.location_name ~* 'romania' THEN 1.0
                      WHEN a.country = 'UA' AND j.location_name ~* 'ukraine' THEN 1.0
                      WHEN a.country = 'IE' AND j.location_name ~* 'ireland' THEN 1.0
                      WHEN a.country = 'FR' AND j.location_name ~* 'france' THEN 1.0
                      WHEN a.country = 'IN' AND j.location_name ~* 'india' THEN 1.0
                      WHEN a.country = 'AR' AND j.location_name ~* 'argentina' THEN 1.0
                      WHEN a.country = 'MX' AND j.location_name ~* 'mexico' THEN 1.0
                      WHEN j.location_name ~* '(united states|u\.s\.|usa| america|brazil|canada|argentina|mexico|uk|united kingdom|england|scotland|wales|australia|aest|taiwan|malaysia|colombia|nigeria|portugal|malta|switzerland|germany|romania|ukraine|ireland|france|india|serbia)' THEN 0.0
                      ELSE 1.0
                    END
                  ELSE 0.5
                END
              ) * 0.08
              + (
                CASE
                  WHEN COALESCE(array_length(p.seniority_levels, 1), 0) = 0 THEN 0.5
                  WHEN j.title ~* '(junior|associate|entry|intern|trainee)' THEN
                    CASE WHEN 'junior' = ANY(p.seniority_levels::text[]) THEN 1.0 ELSE 0.0 END
                  WHEN j.title ~* '(senior|sr\.|sr )' THEN
                    CASE WHEN 'senior' = ANY(p.seniority_levels::text[]) THEN 1.0 ELSE 0.0 END
                  WHEN j.title ~* '(lead|staff|principal|architect|manager|director|head|expert)' THEN
                    CASE WHEN ('lead' = ANY(p.seniority_levels::text[]) OR 'staff' = ANY(p.seniority_levels::text[]) OR 'principal' = ANY(p.seniority_levels::text[])) THEN 1.0 ELSE 0.0 END
                  ELSE 0.5
                END
              ) * 0.08
              + (COALESCE(cqs.score, 50) / 100.0) * 0.17
            )
            - (
              CASE
                WHEN COALESCE(array_length(p.blocklist_tags, 1), 0) = 0 OR COALESCE(array_length(j.extracted_tags, 1), 0) = 0 THEN 0.0
                WHEN p.blocklist_tags && j.extracted_tags THEN 1.0
                ELSE 0.0
              END
            ) * 0.10
            - (
              CASE
                WHEN COALESCE(array_length(p.must_have_tags, 1), 0) = 0 OR COALESCE(array_length(j.extracted_tags, 1), 0) = 0 THEN 0.0
                WHEN COALESCE(mq.overlap_score, 0) = 0 THEN 1.0
                ELSE 1.0 - (COALESCE(mq.overlap_score, 0)::float / LEAST(array_length(p.must_have_tags, 1), array_length(j.extracted_tags, 1)))
              END
            ) * 0.10
            - (
              LEAST(
                COALESCE(array_length(
                  ARRAY(
                    SELECT unnest(j.extracted_tags)
                    INTERSECT
                    SELECT unnest(ARRAY['wordpress','vue','nuxt','angular','svelte','solidjs','php','laravel','ruby','rails','csharp','dotnet','aspnet','swift','kotlin','flutter','ios','android'])
                    EXCEPT
                    SELECT unnest(p.must_have_tags)
                  ), 1
                ), 0)::float / 3,
                1.0
              )
            ) * 0.08
          )
        ) * 100
      ) AS sql_match_score
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    JOIN persona p ON mq.persona_id = p.id
    JOIN applicant a ON mq.applicant_id = a.user_id
    LEFT JOIN company c ON c.ats_source::text = j.ats_source AND c.ats_slug = j.ats_slug
    LEFT JOIN company_quality_score cqs ON c.id = cqs.company_id
    WHERE mq.status = 'approved'
    ORDER BY sql_match_score DESC, mq.created_at DESC
  `);

  const matches = rows.rows.map((row) => {
    const assignmentTypes = parseTextArray(row.assignment_types);
    const workplaceType = row.job_workplace_type as string | null;
    const workplaceMatch = computeWorkplaceMatch(
      assignmentTypes,
      workplaceType,
    );
    const companyQualityScore = row.company_quality_score as number | null;
    const overlapScore = Number(row.overlap_score ?? 0);
    const cosineDistance =
      row.cosine_distance !== null ? Number(row.cosine_distance) : null;
    const sqlScore = Number(row.sql_match_score ?? 0);
    const locationMatch = computeLocationMatch(
      row.applicant_country as string | null,
      row.job_location_name as string | null,
    );
    const seniorityMatch = computeSeniorityMatch(
      parseTextArray(row.persona_seniority_levels),
      row.job_title as string | null,
    );
    const blocklistTags = parseTextArray(row.persona_blocklist_tags);
    const jobTags = parseTextArray(row.job_extracted_tags);
    const mustHaveTags = parseTextArray(row.persona_must_have_tags);
    const blocklistPenalty = computeBlocklistPenalty(blocklistTags, jobTags);
    const coverageGap = computeCoverageGap(overlapScore, mustHaveTags, jobTags);
    const secondaryDomainMismatch = computeSecondaryDomainMismatch(
      mustHaveTags,
      jobTags,
    );
    const manualScore = computeMatchScore(
      overlapScore,
      cosineDistance,
      workplaceMatch,
      locationMatch,
      seniorityMatch,
      blocklistPenalty,
      coverageGap,
      secondaryDomainMismatch,
      companyQualityScore,
    );
    return {
      ...row,
      assignmentTypes,
      workplaceType,
      workplaceMatch,
      locationMatch,
      seniorityMatch,
      blocklistPenalty,
      coverageGap,
      secondaryDomainMismatch,
      companyQualityScore,
      overlapScore,
      cosineDistance,
      sqlScore,
      manualScore,
      scoreDiff: sqlScore - manualScore,
    };
  });

  console.log(`Found ${matches.length} approved matches\n`);

  if (matches.length === 0) {
    process.exit(0);
  }

  // Summary stats
  const scores = matches.map((m) => m.sqlScore);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const confidences = matches
    .map((m) => m.llm_confidence)
    .filter((c): c is number => c !== null);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0;

  const scoreBuckets = {
    "90-100": matches.filter((m) => m.sqlScore >= 90).length,
    "80-89": matches.filter((m) => m.sqlScore >= 80 && m.sqlScore < 90).length,
    "70-79": matches.filter((m) => m.sqlScore >= 70 && m.sqlScore < 80).length,
    "60-69": matches.filter((m) => m.sqlScore >= 60 && m.sqlScore < 70).length,
    "50-59": matches.filter((m) => m.sqlScore >= 50 && m.sqlScore < 60).length,
    "40-49": matches.filter((m) => m.sqlScore >= 40 && m.sqlScore < 50).length,
    "below 40": matches.filter((m) => m.sqlScore < 40).length,
  };

  console.log("## Summary Statistics\n");
  console.log(`- Average match score: ${avgScore.toFixed(1)}/100`);
  console.log(`- Score range: ${minScore} - ${maxScore}`);
  console.log(`- Average LLM confidence: ${avgConfidence.toFixed(2)}`);
  console.log(`- Score distribution:`);
  for (const [bucket, count] of Object.entries(scoreBuckets)) {
    console.log(`  ${bucket}: ${count}`);
  }

  // Verification
  console.log("\n## SQL vs Manual Score Verification\n");
  const mismatches = matches.filter((m) => m.scoreDiff !== 0);
  if (mismatches.length === 0) {
    console.log("✅ All SQL scores match manual recomputation");
  } else {
    console.log(`⚠️ ${mismatches.length} scores differ:`);
    for (const m of mismatches) {
      console.log(
        `  ${m.job_title}: SQL=${m.sqlScore}, Manual=${m.manualScore}, Diff=${m.scoreDiff}`,
      );
    }
  }

  // Per-job report
  console.log("\n## Per-Match Analysis\n");
  for (const [index, m] of matches.entries()) {
    const stars = Math.round(m.sqlScore / 10) / 2;
    console.log(`### ${index + 1}. ${m.job_title}`);
    console.log(
      `  Company: ${m.job_company_name || m.registry_company_name || m.ats_slug}`,
    );
    console.log(`  Persona: ${m.persona_label}`);
    console.log(`  Status: ${m.status}`);
    console.log(`  Match score: ${m.sqlScore}/100 (${stars}/5 stars)`);
    console.log(`  Cosine distance: ${m.cosineDistance?.toFixed(4) ?? "N/A"}`);
    console.log(`  Overlap: ${m.overlapScore}`);
    console.log(`  LLM confidence: ${m.llm_confidence ?? "N/A"}`);
    console.log(`  LLM verdict: ${m.llm_verdict ?? "N/A"}`);
    console.log(
      `  Workplace: job=${m.workplaceType ?? "N/A"}, applicant=${m.assignmentTypes.join(", ") || "N/A"}, match=${m.workplaceMatch}`,
    );
    console.log(
      `  Location: job=${m.job_location_name ?? "N/A"}, applicant=${m.applicant_country ?? "N/A"}, match=${m.locationMatch}`,
    );
    console.log(
      `  Seniority: persona=${m.persona_seniority_levels ? parseTextArray(m.persona_seniority_levels).join(", ") : "N/A"}, title=${m.job_title}, match=${m.seniorityMatch}`,
    );
    console.log(`  Blocklist penalty: ${m.blocklistPenalty}`);
    console.log(`  Coverage gap: ${m.coverageGap.toFixed(3)}`);
    console.log(
      `  Secondary domain mismatch: ${m.secondaryDomainMismatch.toFixed(3)}`,
    );
    console.log(
      `  Company quality: ${m.companyQualityScore ?? "N/A (default 50)"}`,
    );
    console.log(
      `  Matched at: ${m.created_at ? new Date(m.created_at as string).toISOString() : "N/A"}`,
    );
    if (m.llm_reasoning) {
      console.log(
        `  LLM reasoning: ${String(m.llm_reasoning).replace(/\n/g, " ")}`,
      );
    }
    console.log("");
  }

  // Find outliers
  console.log("\n## Potential Calibration Issues\n");

  const lowScoreApproved = matches.filter((m) => m.sqlScore < 50);
  if (lowScoreApproved.length > 0) {
    console.log(
      `⚠️ ${lowScoreApproved.length} approved matches score below 50/100:`,
    );
    for (const m of lowScoreApproved) {
      console.log(
        `  - ${m.job_title}: ${m.sqlScore}/100 (overlap=${m.overlapScore}, dist=${m.cosineDistance?.toFixed(4)})`,
      );
    }
  } else {
    console.log("✅ No approved matches score below 50/100");
  }

  const highConfidenceLowScore = matches.filter(
    (m) => (m.llm_confidence ?? 0) >= 0.8 && m.sqlScore < 55,
  );
  if (highConfidenceLowScore.length > 0) {
    console.log(
      `\n⚠️ ${highConfidenceLowScore.length} high-confidence (≥0.80) matches have low scores (<55):`,
    );
    for (const m of highConfidenceLowScore) {
      console.log(
        `  - ${m.job_title}: score=${m.sqlScore}, confidence=${m.llm_confidence}`,
      );
    }
  }

  const lowConfidenceHighScore = matches.filter(
    (m) => (m.llm_confidence ?? 0) < 0.5 && m.sqlScore >= 70,
  );
  if (lowConfidenceHighScore.length > 0) {
    console.log(
      `\n⚠️ ${lowConfidenceHighScore.length} low-confidence (<0.50) matches have high scores (≥70):`,
    );
    for (const m of lowConfidenceHighScore) {
      console.log(
        `  - ${m.job_title}: score=${m.sqlScore}, confidence=${m.llm_confidence}`,
      );
    }
  }

  const missingLocation = matches.filter((m) => !m.job_location_name);
  if (missingLocation.length > 0) {
    console.log(
      `\nℹ️ ${missingLocation.length} jobs have no location name (default 0.5 neutral):`,
    );
    for (const m of missingLocation) {
      console.log(`  - ${m.job_title}`);
    }
  }

  const missingSeniority = matches.filter(
    (m) =>
      !m.persona_seniority_levels ||
      parseTextArray(m.persona_seniority_levels).length === 0,
  );
  if (missingSeniority.length > 0) {
    console.log(
      `\nℹ️ ${missingSeniority.length} personas have no seniority levels (default 0.5 neutral):`,
    );
    for (const m of missingSeniority) {
      console.log(`  - ${m.persona_label}`);
    }
  }

  const missingWorkplace = matches.filter((m) => !m.workplaceType);
  if (missingWorkplace.length > 0) {
    console.log(
      `\nℹ️ ${missingWorkplace.length} jobs have no workplace type (default 0.5 neutral):`,
    );
    for (const m of missingWorkplace) {
      console.log(`  - ${m.job_title}`);
    }
  }

  const missingCompanyQuality = matches.filter(
    (m) => m.companyQualityScore === null,
  );
  if (missingCompanyQuality.length > 0) {
    console.log(
      `\nℹ️ ${missingCompanyQuality.length} jobs have no company quality score (default 50 neutral):`,
    );
    for (const m of missingCompanyQuality) {
      console.log(`  - ${m.job_title}`);
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
