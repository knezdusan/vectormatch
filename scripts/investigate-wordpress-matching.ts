// @ts-nocheck
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";

async function main() {
  console.log(
    "=== Investigating WordPress matching for gohighlevel roles ===\n",
  );

  // 1. Find PHP/Laravel persona
  const personas = await db.execute(sql`
    SELECT id, persona_label, must_have_tags, blocklist_tags
    FROM persona
    WHERE persona_label ILIKE '%PHP%' OR persona_label ILIKE '%Laravel%'
  `);
  console.log("PHP/Laravel personas found:", personas.rows.length);
  for (const p of personas.rows) {
    console.log("\nPersona:", p.persona_label);
    console.log("  ID:", p.id);
    console.log("  mustHaveTags:", JSON.stringify(p.must_have_tags));
    console.log("  blocklistTags:", JSON.stringify(p.blocklist_tags));
  }

  if (personas.rows.length === 0) {
    console.log("No PHP/Laravel persona found.");
    process.exit(0);
  }

  const phpPersonaId = personas.rows[0].id;
  console.log(
    "\n=== Checking gohighlevel WordPress roles for PHP/Laravel persona ===\n",
  );

  // 2. Find all gohighlevel jobs that mention WordPress in title or description
  const wordpressJobs = await db.execute(sql`
    SELECT j.id, j.title, j.company_name, j.ats_slug, j.short_description, j.extracted_tags
    FROM job j
    WHERE j.ats_slug = 'gohighlevel'
      AND (
        j.title ILIKE '%wordpress%'
        OR j.short_description ILIKE '%wordpress%'
        OR j.extracted_tags::text ILIKE '%wordpress%'
      )
  `);
  console.log(
    `Found ${wordpressJobs.rows.length} gohighlevel jobs mentioning WordPress\n`,
  );

  for (const job of wordpressJobs.rows) {
    console.log("Job:", job.title);
    console.log("  ID:", job.id);
    console.log("  Tags:", JSON.stringify(job.extracted_tags));
    console.log("");
  }

  // 3. Check match_queue for these jobs against all personas
  const jobIds = wordpressJobs.rows.map((j) => j.id);
  if (jobIds.length === 0) {
    process.exit(0);
  }

  const matches = await db.execute(sql`
    SELECT
      mq.id,
      mq.status,
      mq.overlap_score,
      mq.cosine_distance,
      mq.llm_verdict,
      mq.llm_confidence,
      mq.llm_reasoning,
      mq.evaluated_at,
      j.id AS job_id,
      j.title AS job_title,
      p.persona_label,
      p.seniority_levels AS persona_seniority_levels,
      p.must_have_tags AS persona_must_have_tags,
      p.blocklist_tags AS persona_blocklist_tags,
      j.extracted_tags AS job_extracted_tags,
      a.assignment_types,
      a.country AS applicant_country,
      j.workplace_type,
      j.location_name,
      COALESCE(cqs.score, 50) AS company_quality_score,
      (
        CASE
          WHEN COALESCE(array_length(p.blocklist_tags, 1), 0) = 0 OR COALESCE(array_length(j.extracted_tags, 1), 0) = 0 THEN 0.0
          WHEN p.blocklist_tags && j.extracted_tags THEN 1.0
          ELSE 0.0
        END
      ) AS blocklist_penalty,
      (
        CASE
          WHEN COALESCE(array_length(p.must_have_tags, 1), 0) = 0 OR COALESCE(array_length(j.extracted_tags, 1), 0) = 0 THEN 0.0
          WHEN COALESCE(mq.overlap_score, 0) = 0 THEN 1.0
          ELSE 1.0 - (COALESCE(mq.overlap_score, 0)::float / LEAST(array_length(p.must_have_tags, 1), array_length(j.extracted_tags, 1)))
        END
      ) AS coverage_gap,
      (
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
      ) AS secondary_domain_mismatch,
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
      ) AS match_score
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    JOIN persona p ON mq.persona_id = p.id
    JOIN applicant a ON mq.applicant_id = a.user_id
    LEFT JOIN company c ON c.ats_source::text = j.ats_source AND c.ats_slug = j.ats_slug
    LEFT JOIN company_quality_score cqs ON c.id = cqs.company_id
    WHERE mq.job_id IN (${sql.join(
      jobIds.map((id) => sql`${id}`),
      sql.raw(","),
    )})
    ORDER BY j.title, p.persona_label
  `);

  console.log(
    `Found ${matches.rows.length} match_queue rows for WordPress jobs\n`,
  );

  for (const m of matches.rows) {
    console.log("Match:", m.job_title);
    console.log("  Persona:", m.persona_label);
    console.log("  Status:", m.status);
    console.log("  Match score:", m.match_score ?? "N/A");
    console.log("  Overlap:", m.overlap_score);
    console.log(
      "  Cosine:",
      m.cosine_distance ? Number(m.cosine_distance).toFixed(4) : "N/A",
    );
    console.log(
      "  Location:",
      m.location_name ?? "N/A",
      "applicant:",
      m.applicant_country ?? "N/A",
    );
    console.log(
      "  Seniority:",
      m.persona_seniority_levels
        ? Array.isArray(m.persona_seniority_levels)
          ? m.persona_seniority_levels.join(", ")
          : String(m.persona_seniority_levels)
        : "N/A",
    );
    console.log(
      "  Coverage gap:",
      m.coverage_gap !== undefined && m.coverage_gap !== null
        ? Number(m.coverage_gap).toFixed(3)
        : "N/A",
    );
    console.log(
      "  Secondary domain mismatch:",
      m.secondary_domain_mismatch !== undefined &&
        m.secondary_domain_mismatch !== null
        ? Number(m.secondary_domain_mismatch).toFixed(3)
        : "N/A",
    );
    console.log(
      "  Blocklist penalty:",
      m.blocklist_penalty !== undefined && m.blocklist_penalty !== null
        ? m.blocklist_penalty
        : "N/A",
    );
    console.log("  Confidence:", m.llm_confidence);
    console.log("  Verdict:", m.llm_verdict);
    console.log(
      "  Reasoning:",
      String(m.llm_reasoning ?? "N/A")
        .replace(/\n/g, " ")
        .slice(0, 300),
    );
    console.log("  Evaluated at:", m.evaluated_at);
    console.log("");
  }

  // 4. Check if PHP/Laravel persona has any matches at all for gohighlevel
  console.log("\n=== PHP/Laravel persona's gohighlevel matches ===\n");
  const phpGohighlevel = await db.execute(sql`
    SELECT
      mq.id,
      mq.status,
      mq.overlap_score,
      mq.cosine_distance,
      mq.llm_verdict,
      mq.llm_confidence,
      mq.llm_reasoning,
      j.title AS job_title,
      j.extracted_tags
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    WHERE mq.persona_id = ${phpPersonaId}
      AND j.ats_slug = 'gohighlevel'
    ORDER BY mq.overlap_score DESC, mq.cosine_distance ASC
  `);
  console.log(
    `Found ${phpGohighlevel.rows.length} gohighlevel matches for PHP/Laravel persona\n`,
  );
  for (const m of phpGohighlevel.rows) {
    console.log("Job:", m.job_title);
    console.log("  Status:", m.status);
    console.log("  Overlap:", m.overlap_score);
    console.log("  Tags:", JSON.stringify(m.extracted_tags));
    console.log(
      "  Reasoning:",
      String(m.llm_reasoning ?? "N/A")
        .replace(/\n/g, " ")
        .slice(0, 200),
    );
    console.log("");
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
