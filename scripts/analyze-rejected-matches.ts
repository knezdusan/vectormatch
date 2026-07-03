// @ts-nocheck
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";

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

async function fetchMatches(status: string) {
  return db.execute(sql`
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
    WHERE mq.status = ${status}
    ORDER BY sql_match_score DESC, mq.created_at DESC
  `);
}

function distribution(scores: number[]) {
  return {
    "90-100": scores.filter((s) => s >= 90).length,
    "80-89": scores.filter((s) => s >= 80 && s < 90).length,
    "70-79": scores.filter((s) => s >= 70 && s < 80).length,
    "60-69": scores.filter((s) => s >= 60 && s < 70).length,
    "50-59": scores.filter((s) => s >= 50 && s < 60).length,
    "40-49": scores.filter((s) => s >= 40 && s < 50).length,
    "30-39": scores.filter((s) => s >= 30 && s < 40).length,
    "20-29": scores.filter((s) => s >= 20 && s < 30).length,
    "10-19": scores.filter((s) => s >= 10 && s < 20).length,
    "below 10": scores.filter((s) => s < 10).length,
  };
}

async function main() {
  console.log("Analyzing rejected matches...\n");
  const rejectedRows = await fetchMatches("rejected");
  const rejected = rejectedRows.rows.map((row) => ({
    ...row,
    score: Number(row.sql_match_score ?? 0),
    assignmentTypes: parseTextArray(row.assignment_types),
  }));

  console.log(`Found ${rejected.length} rejected matches\n`);

  if (rejected.length === 0) {
    process.exit(0);
  }

  const scores = rejected.map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const median = scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)];

  console.log("## Rejected Matches Summary\n");
  console.log(`- Count: ${rejected.length}`);
  console.log(`- Average score: ${avg.toFixed(1)}/100`);
  console.log(`- Median score: ${median}/100`);
  console.log(`- Score range: ${min} - ${max}`);
  console.log(`- Score distribution:`);
  for (const [bucket, count] of Object.entries(distribution(scores))) {
    console.log(`  ${bucket}: ${count}`);
  }

  // Fetch approved summary for comparison
  const approvedRows = await fetchMatches("approved");
  const approvedScores = approvedRows.rows.map((r) =>
    Number(r.sql_match_score ?? 0),
  );
  const approvedAvg =
    approvedScores.reduce((a, b) => a + b, 0) / approvedScores.length;
  const approvedMin = Math.min(...approvedScores);
  const approvedMax = Math.max(...approvedScores);

  console.log("\n## Approved vs Rejected Comparison\n");
  console.log(`- Approved average: ${approvedAvg.toFixed(1)}/100`);
  console.log(`- Rejected average: ${avg.toFixed(1)}/100`);
  console.log(`- Approved range: ${approvedMin} - ${approvedMax}`);
  console.log(`- Rejected range: ${min} - ${max}`);

  const overlapHigh = rejected.filter((r) => r.score >= approvedMin).length;
  console.log(
    `\n- ${overlapHigh} rejected matches score >= lowest approved score (${approvedMin})`,
  );
  console.log(
    `- ${rejected.filter((r) => r.score >= approvedAvg).length} rejected matches score >= approved average (${approvedAvg.toFixed(1)})`,
  );

  // Top 10 rejected (potential false negatives)
  console.log(
    "\n## Top 10 Rejected Matches by Score (Potential False Negatives)\n",
  );
  rejected.slice(0, 10).forEach((r, i) => {
    const stars = Math.round(r.score / 10) / 2;
    console.log(`${i + 1}. ${r.job_title}`);
    console.log(
      `   Company: ${r.job_company_name || r.registry_company_name || r.ats_slug}`,
    );
    console.log(`   Persona: ${r.persona_label}`);
    console.log(`   Score: ${r.score}/100 (${stars}/5 stars)`);
    console.log(
      `   Overlap: ${r.overlap_score}, Cosine: ${r.cosine_distance ? Number(r.cosine_distance).toFixed(4) : "N/A"}`,
    );
    console.log(`   Confidence: ${r.llm_confidence ?? "N/A"}`);
    console.log(`   Company quality: ${r.company_quality_score ?? "N/A"}`);
    console.log(
      `   Reasoning: ${String(r.llm_reasoning ?? "N/A")
        .replace(/\n/g, " ")
        .slice(
          0,
          200,
        )}${String(r.llm_reasoning ?? "").length > 200 ? "..." : ""}`,
    );
    console.log("");
  });

  // Bottom 10 rejected (clear rejections)
  console.log("\n## Bottom 10 Rejected Matches by Score (Clear Rejections)\n");
  rejected.slice(-10).forEach((r, i) => {
    const stars = Math.round(r.score / 10) / 2;
    console.log(`${i + 1}. ${r.job_title}`);
    console.log(
      `   Company: ${r.job_company_name || r.registry_company_name || r.ats_slug}`,
    );
    console.log(`   Persona: ${r.persona_label}`);
    console.log(`   Score: ${r.score}/100 (${stars}/5 stars)`);
    console.log(
      `   Overlap: ${r.overlap_score}, Cosine: ${r.cosine_distance ? Number(r.cosine_distance).toFixed(4) : "N/A"}`,
    );
    console.log(`   Confidence: ${r.llm_confidence ?? "N/A"}`);
    console.log(
      `   Reasoning: ${String(r.llm_reasoning ?? "N/A")
        .replace(/\n/g, " ")
        .slice(
          0,
          200,
        )}${String(r.llm_reasoning ?? "").length > 200 ? "..." : ""}`,
    );
    console.log("");
  });

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
