/**
 * Gate 3 Diagnostic — Run Gate 1+2 on all embedded jobs, then Gate 3 on candidates.
 *
 * This script:
 *   1. Runs Gate 1+2 SQL router for every active embedded job
 *   2. Reports which jobs pass, with scope distribution
 *   3. Runs Gate 3 (LLM arbitration) on the candidates
 *   4. Reports approved/rejected verdicts with reasoning
 *
 * Usage: npx tsx --require scripts/stubs/stub-server-only.cjs scripts/gate-3-diagnostic.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Gate 1+2 constants (replicated from gate-1-2.ts to avoid server-only import)
const GATE1_MIN_OVERLAP = 2;
const GATE2_MAX_COSINE_DISTANCE = 0.55;
const GATE1_WEIGHT = 0.6;
const GATE2_WEIGHT = 0.4;
const GATE_ROUTER_LIMIT = 10;

async function runGateSQLRouterDirect(
  jobId: string,
  jobTags: string[],
  jobEmbedding: number[],
): Promise<
  {
    matchQueueId: string;
    personaId: string;
    applicantId: string;
    overlapScore: number;
    cosineDistance: number;
  }[]
> {
  if (jobEmbedding.length === 0) return [];

  const embeddingStr = `[${jobEmbedding.join(",")}]`;
  const tagsArraySql =
    jobTags.length > 0
      ? `ARRAY[${jobTags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`
      : `ARRAY[]::text[]`;

  const gate1Clause =
    jobTags.length > 0
      ? `p.must_have_tags && ${tagsArraySql} AND NOT (p.blocklist_tags && ${tagsArraySql})`
      : `true`;

  const minOverlapClause =
    jobTags.length > 0
      ? `AND ov.overlap_score >= ${GATE1_MIN_OVERLAP}::int`
      : "";

  const query = `
    WITH job_meta AS (
      SELECT ats_slug, title, remote_scope FROM job WHERE id = '${jobId.replace(/'/g, "''")}'::uuid
    )
    INSERT INTO match_queue (job_id, persona_id, applicant_id, overlap_score, cosine_distance, status)
    SELECT
      '${jobId.replace(/'/g, "''")}'::uuid,
      p.id,
      p.applicant_id,
      ov.overlap_score,
      (p.persona_embedding <=> '${embeddingStr}'::vector) AS cosine_distance,
      'pending'
    FROM persona p
    CROSS JOIN job_meta jm
    CROSS JOIN LATERAL (
      SELECT count(*) AS overlap_score
      FROM unnest(p.must_have_tags) AS t(tag)
      WHERE t.tag = ANY(${tagsArraySql})
    ) ov
    WHERE
      ${gate1Clause}
      ${minOverlapClause}
      AND (p.persona_embedding <=> '${embeddingStr}'::vector) < ${GATE2_MAX_COSINE_DISTANCE}::real
      AND p.persona_embedding IS NOT NULL
      AND jm.remote_scope = 'global'
      AND NOT EXISTS (
        SELECT 1 FROM match_queue mq
        JOIN job j2 ON mq.job_id = j2.id
        WHERE j2.ats_slug = jm.ats_slug
          AND j2.title = jm.title
          AND mq.persona_id = p.id
          AND mq.status = 'approved'
      )
    ORDER BY
      (
        (1 - EXP(-0.4 * LEAST(ov.overlap_score, 5))) * ${GATE1_WEIGHT}::real
        + (1 - (p.persona_embedding <=> '${embeddingStr}'::vector)) * ${GATE2_WEIGHT}::real
      ) DESC
    LIMIT ${GATE_ROUTER_LIMIT}
    ON CONFLICT (job_id, persona_id) DO UPDATE SET
      status = 'pending',
      evaluated_at = NULL,
      llm_verdict = NULL,
      llm_blockers = NULL,
      llm_reasoning = NULL,
      llm_confidence = NULL,
      llm_model = NULL,
      prompt_variant = NULL,
      overlap_score = EXCLUDED.overlap_score,
      cosine_distance = EXCLUDED.cosine_distance
    RETURNING id, persona_id, applicant_id, overlap_score, cosine_distance
  `;

  const result = (await (
    sql as unknown as {
      query: (q: string) => Promise<Record<string, unknown>[]>;
    }
  ).query(query)) as Record<string, unknown>[];
  return result.map((row) => ({
    matchQueueId: row.id as string,
    personaId: row.persona_id as string,
    applicantId: row.applicant_id as string,
    overlapScore: Number(row.overlap_score),
    cosineDistance: Number(row.cosine_distance),
  }));
}

async function main() {
  console.log("═".repeat(80));
  console.log("  GATE 3 DIAGNOSTIC — Full Gate 1+2 → Gate 3 pipeline");
  console.log("═".repeat(80));
  console.log();

  // ── Step 1: Get all active embedded jobs ──────────────────────────────────
  const jobs = (await sql`
    SELECT j.id, j.title, j.remote_scope, j.location_countries, j.workplace_type,
           j.location_name, j.extracted_tags, j.ats_slug, j.normalized_text,
           j.job_embedding
    FROM job j
    WHERE j.job_embedding IS NOT NULL AND j.status = 'active'
    ORDER BY j.ats_slug, j.title
  `) as Array<{
    id: string;
    title: string;
    remote_scope: string | null;
    location_countries: string[] | null;
    workplace_type: string | null;
    location_name: string | null;
    extracted_tags: string[] | null;
    ats_slug: string;
    normalized_text: string | null;
    job_embedding: number[];
  }>;

  console.log(`Step 1: Found ${jobs.length} active embedded jobs`);
  console.log();

  // Scope distribution
  const scopeDist: Record<string, number> = {};
  for (const j of jobs) {
    const s = j.remote_scope ?? "null";
    scopeDist[s] = (scopeDist[s] ?? 0) + 1;
  }
  console.log("  Scope distribution:");
  for (const [s, n] of Object.entries(scopeDist)) {
    console.log(`    ${s}: ${n}`);
  }
  console.log();

  // ── Step 2: Run Gate 1+2 for each job ─────────────────────────────────────
  console.log("Step 2: Running Gate 1+2 SQL router for each job...");
  console.log();

  const allCandidates: {
    matchQueueId: string;
    jobId: string;
    jobTitle: string;
    jobScope: string | null;
    jobCountries: string[] | null;
    jobAtsSlug: string;
    personaId: string;
    applicantId: string;
    overlapScore: number;
    cosineDistance: number;
  }[] = [];

  let passedGate12 = 0;
  let failedGate12 = 0;

  for (const j of jobs) {
    const tags = j.extracted_tags ?? [];
    // Neon returns vector columns as strings like "[-0.01,0.02,...]"
    // Parse into number[] for the SQL router
    let embedding: number[] = [];
    try {
      if (typeof j.job_embedding === "string") {
        embedding = JSON.parse(j.job_embedding);
      } else if (Array.isArray(j.job_embedding)) {
        embedding = j.job_embedding as unknown as number[];
      }
    } catch {
      // skip this job
      continue;
    }
    if (embedding.length === 0) continue;
    try {
      const candidates = await runGateSQLRouterDirect(j.id, tags, embedding);
      if (candidates.length > 0) {
        passedGate12++;
        for (const c of candidates) {
          allCandidates.push({
            matchQueueId: c.matchQueueId,
            jobId: j.id,
            jobTitle: j.title,
            jobScope: j.remote_scope,
            jobCountries: j.location_countries,
            jobAtsSlug: j.ats_slug,
            personaId: c.personaId,
            applicantId: c.applicantId,
            overlapScore: c.overlapScore,
            cosineDistance: c.cosineDistance,
          });
        }
      } else {
        failedGate12++;
      }
    } catch (err) {
      console.log(
        `    ERROR on ${j.title.slice(0, 40)}: ${err instanceof Error ? err.message.slice(0, 100) : String(err).slice(0, 100)}`,
      );
    }
  }

  console.log(`  Jobs passing Gate 1+2: ${passedGate12}/${jobs.length}`);
  console.log(
    `  Total candidates (job×persona pairs): ${allCandidates.length}`,
  );
  console.log();

  // Scope distribution of candidates
  const candidateScopeDist: Record<string, number> = {};
  for (const c of allCandidates) {
    const s = c.jobScope ?? "null";
    candidateScopeDist[s] = (candidateScopeDist[s] ?? 0) + 1;
  }
  console.log("  Candidate scope distribution:");
  for (const [s, n] of Object.entries(candidateScopeDist)) {
    console.log(`    ${s}: ${n}`);
  }
  console.log();

  // Print all candidates
  console.log("  All candidates (sorted by composite score):");
  const sorted = [...allCandidates].sort(
    (a, b) =>
      (1 - Math.exp(-0.4 * Math.min(b.overlapScore, 5))) * GATE1_WEIGHT +
      (1 - b.cosineDistance) * GATE2_WEIGHT -
      ((1 - Math.exp(-0.4 * Math.min(a.overlapScore, 5))) * GATE1_WEIGHT +
        (1 - a.cosineDistance) * GATE2_WEIGHT),
  );
  for (const c of sorted.slice(0, 30)) {
    console.log(
      `    ${c.jobTitle.slice(0, 45).padEnd(45)} scope=${(c.jobScope ?? "null").padEnd(15)} overlap=${c.overlapScore} dist=${c.cosineDistance.toFixed(4)}`,
    );
  }
  if (sorted.length > 30) {
    console.log(`    ... and ${sorted.length - 30} more`);
  }
  console.log();

  if (allCandidates.length === 0) {
    console.log("  ✗ ZERO CANDIDATES — Gate 1+2 produced no matches");
    return;
  }

  // ── Step 3: Run Gate 3 on candidates ──────────────────────────────────────
  console.log("Step 3: Running Gate 3 (LLM arbitration) on candidates...");
  console.log();

  const { evaluateGate3 } = await import("@/lib/jobs/gate-3");

  // Fetch persona + applicant data
  const personas = (await sql`
    SELECT p.id, p.persona_label, p.embedding_summary, p.must_have_tags, p.blocklist_tags,
           p.seniority_levels
    FROM persona p
    WHERE p.persona_embedding IS NOT NULL
  `) as Array<{
    id: string;
    persona_label: string;
    embedding_summary: string;
    must_have_tags: string[];
    blocklist_tags: string[];
    seniority_levels: string[];
  }>;

  const applicants = (await sql`
    SELECT a.user_id, a.country, a.can_work_us_hours, a.preferred_compliance,
           a.modalities, a.assignment_types, a.work_authorizations, a.all_tags
    FROM applicant a
  `) as Array<Record<string, unknown>>;

  // Parse PostgreSQL array strings (Neon returns "{w8ben,ic_global}" instead of ["w8ben","ic_global"])
  function parsePgArray(v: unknown): string[] {
    if (Array.isArray(v)) return v as string[];
    if (typeof v === "string") {
      // Remove surrounding braces and split
      const inner = v.replace(/^\{/, "").replace(/\}$/, "");
      if (inner === "" || inner === "NULL") return [];
      return inner.split(",").map((s) => s.trim());
    }
    return [];
  }

  const parsedApplicants = applicants.map((a) => ({
    user_id: a.user_id as string,
    country: (a.country as string) ?? null,
    can_work_us_hours: (a.can_work_us_hours as boolean) ?? null,
    preferred_compliance: parsePgArray(a.preferred_compliance),
    modalities: parsePgArray(a.modalities),
    assignment_types: parsePgArray(a.assignment_types),
    work_authorizations: parsePgArray(a.work_authorizations),
    all_tags: parsePgArray(a.all_tags),
  }));

  // Also parse persona arrays
  const parsedPersonas = personas.map((p) => ({
    ...p,
    must_have_tags: parsePgArray(p.must_have_tags),
    blocklist_tags: parsePgArray(p.blocklist_tags),
    seniority_levels: parsePgArray(p.seniority_levels),
  }));

  const personaMap = new Map(parsedPersonas.map((p) => [p.id, p]));
  const applicantMap = new Map(parsedApplicants.map((a) => [a.user_id, a]));

  let approved = 0;
  let rejected = 0;
  let errored = 0;
  const verdicts: {
    jobTitle: string;
    jobScope: string | null;
    personaLabel: string;
    verdict: string;
    confidence: number;
    reasoning: string;
    blockers: string[];
    workAuthRisk: boolean;
  }[] = [];

  // Process candidates in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < sorted.length; i += batchSize) {
    const batch = sorted.slice(i, i + batchSize);
    console.log(
      `  Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(sorted.length / batchSize)}...`,
    );

    const results = await Promise.allSettled(
      batch.map(async (c) => {
        const persona = personaMap.get(c.personaId);
        const applicant = applicantMap.get(c.applicantId);
        if (!persona || !applicant) {
          return {
            candidate: c,
            verdict: "error",
            error: "Persona or applicant not found",
          };
        }

        // Fetch job's full data
        const jobRows = (await sql`
          SELECT title, normalized_text, extracted_tags, workplace_type, location_name,
                 remote_scope, location_countries, employment_type
          FROM job WHERE id = ${c.jobId}::uuid
        `) as Array<{
          title: string;
          normalized_text: string | null;
          extracted_tags: string[];
          workplace_type: string | null;
          location_name: string | null;
          remote_scope: string | null;
          location_countries: string[] | null;
          employment_type: string | null;
        }>;

        if (jobRows.length === 0) {
          return { candidate: c, verdict: "error", error: "Job not found" };
        }

        const job = jobRows[0];
        const ctx = {
          job: {
            title: job.title,
            description: (job.normalized_text ?? "").slice(0, 8000),
            extractedTags: job.extracted_tags ?? [],
            workplaceType: job.workplace_type as
              | "remote"
              | "hybrid"
              | "on-site"
              | null,
            locationName: job.location_name,
            employmentType: job.employment_type,
            remoteScope: job.remote_scope as
              | "global"
              | "country_fenced"
              | "region_fenced"
              | "onsite"
              | "unknown"
              | "undetermined"
              | null,
            locationCountries: job.location_countries,
          },
          persona: {
            personaLabel: persona.persona_label,
            embeddingSummary: persona.embedding_summary,
            mustHaveTags: persona.must_have_tags ?? [],
            blocklistTags: persona.blocklist_tags ?? [],
            seniorityLevels: persona.seniority_levels ?? [],
          },
          applicant: {
            allTags: applicant.all_tags ?? [],
            country: applicant.country,
            canWorkUsHours: applicant.can_work_us_hours,
            preferredCompliance: applicant.preferred_compliance ?? [],
            modalities: applicant.modalities ?? [],
            assignmentTypes: applicant.assignment_types ?? [],
            workAuthorizations: applicant.work_authorizations ?? [],
          },
        };

        const result = await evaluateGate3(ctx);
        const verdictStr = result.approved ? "approved" : "rejected";
        return {
          candidate: c,
          verdict: verdictStr,
          gate3Result: {
            verdict: verdictStr,
            confidence: result.matchConfidence,
            reasoning: result.matchReasoning,
            blockers: result.blockers,
            workAuthRiskFlag: result.workAuthRiskFlag,
          },
          persona,
        };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        const { candidate, verdict, gate3Result, persona, error } = r.value as {
          candidate: (typeof sorted)[0];
          verdict: string;
          gate3Result?: {
            verdict: string;
            confidence: number;
            reasoning: string;
            blockers: string[];
            workAuthRiskFlag: boolean;
          };
          persona?: { persona_label: string };
          error?: string;
        };

        if (error) {
          errored++;
          console.log(
            `    ERROR: ${candidate.jobTitle.slice(0, 40)} — ${error}`,
          );
          continue;
        }

        if (verdict === "approved") {
          approved++;
        } else if (verdict === "rejected") {
          rejected++;
        } else {
          errored++;
        }

        const g3 = gate3Result!;
        verdicts.push({
          jobTitle: candidate.jobTitle,
          jobScope: candidate.jobScope,
          personaLabel: persona?.persona_label ?? "unknown",
          verdict: g3.verdict,
          confidence: g3.confidence,
          reasoning: g3.reasoning,
          blockers: g3.blockers,
          workAuthRisk: g3.workAuthRiskFlag,
        });

        console.log(
          `    ${candidate.jobTitle.slice(0, 40).padEnd(40)} → ${verdict.toUpperCase()} conf=${g3.confidence.toFixed(2)} scope=${candidate.jobScope ?? "null"}`,
        );
        if (g3.blockers.length > 0) {
          console.log(`      blockers: ${g3.blockers.join("; ")}`);
        }
      } else {
        errored++;
        console.log(`    ERROR: ${r.reason}`);
      }
    }
  }

  // ── Step 4: Report ────────────────────────────────────────────────────────
  console.log();
  console.log("═".repeat(80));
  console.log("  GATE 3 DIAGNOSTIC RESULT");
  console.log("═".repeat(80));
  console.log();
  console.log(`  Jobs in corpus:           ${jobs.length}`);
  console.log(`  Jobs passing Gate 1+2:    ${passedGate12}`);
  console.log(`  Total candidates:         ${allCandidates.length}`);
  console.log(`  Gate 3 approved:          ${approved}`);
  console.log(`  Gate 3 rejected:          ${rejected}`);
  console.log(`  Gate 3 errored:           ${errored}`);
  console.log();

  // Scope distribution of approved vs rejected
  console.log("  Approved by job scope:");
  for (const v of verdicts.filter((v) => v.verdict === "approved")) {
    console.log(
      `    ${v.jobTitle.slice(0, 45).padEnd(45)} scope=${v.jobScope ?? "null"} persona=${v.personaLabel} conf=${v.confidence.toFixed(2)}`,
    );
  }
  console.log();

  console.log("  Rejected by job scope (first 10):");
  for (const v of verdicts
    .filter((v) => v.verdict === "rejected")
    .slice(0, 10)) {
    console.log(
      `    ${v.jobTitle.slice(0, 45).padEnd(45)} scope=${v.jobScope ?? "null"} blockers=[${v.blockers.join("; ")}]`,
    );
  }
  console.log();

  // ── Inversion diagnosis ───────────────────────────────────────────────────
  console.log("  INVERSION DIAGNOSIS:");
  console.log();

  // Check: does Gate 1+2 filter by scope?
  console.log("  Q: Does Gate 1+2 filter by remote_scope BEFORE LLM?");
  console.log(
    "  A: NO — Gate 1+2 SQL router has no scope filter in WHERE clause.",
  );
  console.log(
    "     country_fenced and region_fenced jobs pass Gate 1+2 freely.",
  );
  console.log(
    "     Scope is only checked by Gate 3 (LLM) — violating cheap-filters-before-LLM.",
  );
  console.log();

  // Check: what scope are the approved jobs?
  const approvedScopes: Record<string, number> = {};
  for (const v of verdicts.filter((v) => v.verdict === "approved")) {
    const s = v.jobScope ?? "null";
    approvedScopes[s] = (approvedScopes[s] ?? 0) + 1;
  }
  console.log("  Approved scope distribution:");
  for (const [s, n] of Object.entries(approvedScopes)) {
    console.log(`    ${s}: ${n}`);
  }
  console.log();

  const rejectedScopes: Record<string, number> = {};
  for (const v of verdicts.filter((v) => v.verdict === "rejected")) {
    const s = v.jobScope ?? "null";
    rejectedScopes[s] = (rejectedScopes[s] ?? 0) + 1;
  }
  console.log("  Rejected scope distribution:");
  for (const [s, n] of Object.entries(rejectedScopes)) {
    console.log(`    ${s}: ${n}`);
  }
  console.log();

  // Check: why did global jobs fail Gate 1+2?
  const globalJobs = jobs.filter((j) => j.remote_scope === "global");
  const globalPassed = allCandidates.filter((c) => c.jobScope === "global");
  const globalFailed = globalJobs.filter(
    (j) => !allCandidates.some((c) => c.jobId === j.id),
  );
  console.log(
    `  Global jobs: ${globalJobs.length} total, ${globalPassed.length} passed Gate 1+2, ${globalFailed.length} failed`,
  );
  console.log();

  // Sample global jobs that failed
  console.log("  Sample global jobs that FAILED Gate 1+2 (first 10):");
  for (const j of globalFailed.slice(0, 10)) {
    const tags = j.extracted_tags ?? [];
    console.log(
      `    ${j.title.slice(0, 50).padEnd(50)} tags=[${tags.slice(0, 8).join(",")}]`,
    );
  }
  console.log();

  console.log("  Sample global jobs that PASSED Gate 1+2 (first 10):");
  for (const c of globalPassed.slice(0, 10)) {
    console.log(
      `    ${c.jobTitle.slice(0, 50).padEnd(50)} overlap=${c.overlapScore} dist=${c.cosineDistance.toFixed(4)}`,
    );
  }
}

main().catch(console.error);
