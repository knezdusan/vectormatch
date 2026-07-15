/**
 * Enrollment Smoke Test — Resend + ZenRows
 *
 * End-to-end pipeline test: enroll → poll → normalize → embed → match
 *
 * This script bypasses Inngest and runs the full pipeline synchronously:
 *   1. Insert Resend + ZenRows as companies (tier='active' to avoid
 *      probation embedding deferral)
 *   2. Poll each company via pollCompany (fetch jobs, Gate 0, upsert)
 *   3. For each new job: normalizeJob → extractRemoteScope → embed →
 *      update job row
 *   4. Run Gate 1+2 SQL router for each job against existing personas
 *   5. Report any matches found
 *
 * If this produces zero matches, the entire filter calibration is moot.
 *
 * Usage: npx tsx scripts/enroll-smoke-test.ts
 */
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { job as jobTable } from "@/db/schemas/jobs/job";
import { normalizeJob } from "@/lib/jobs/job-normalizer";
import { pollCompany } from "@/lib/jobs/poller/phalanx-poller";
import { extractRemoteScope } from "@/lib/jobs/remote-scope-extractor";

// Gate 1+2 constants (replicated from gate-1-2.ts to avoid server-only import)
const GATE1_MIN_OVERLAP = 2;
const GATE2_MAX_COSINE_DISTANCE = 0.55;
const GATE1_WEIGHT = 0.6;
const GATE2_WEIGHT = 0.4;
const GATE_ROUTER_LIMIT = 10;

/**
 * Run Gate 1+2 SQL router directly (bypasses server-only guard).
 * Inserts candidates into match_queue and returns them.
 */
async function runGateSQLRouterDirect(
  jobId: string,
  jobTags: string[],
  jobEmbedding: number[],
  sqlClient: (query: string) => Promise<Record<string, unknown>[]>,
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
      SELECT ats_slug, title FROM job WHERE id = '${jobId.replace(/'/g, "''")}'::uuid
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
    sqlClient as unknown as {
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

const sql = neon(process.env.DATABASE_URL!);

// ── Target companies ─────────────────────────────────────────────────────────

interface TargetCompany {
  name: string;
  atsSource: "greenhouse" | "lever" | "ashby" | "smartrecruiters";
  atsSlug: string;
  rootDomain: string;
}

const TARGETS: TargetCompany[] = [
  {
    name: "Resend",
    atsSource: "ashby",
    atsSlug: "resend",
    rootDomain: "resend.com",
  },
  {
    name: "ZenRows",
    atsSource: "greenhouse",
    atsSlug: "zenrows",
    rootDomain: "zenrows.com",
  },
];

async function main() {
  console.log("═".repeat(80));
  console.log("  ENROLLMENT SMOKE TEST — Resend + ZenRows");
  console.log("  enroll → poll → normalize → embed → match");
  console.log("═".repeat(80));
  console.log();

  // ── Step 1: Enroll companies ───────────────────────────────────────────────
  console.log(
    "Step 1: Enrolling companies (tier='active' to enable embedding)...",
  );
  console.log();

  const enrolled: {
    id: string;
    name: string;
    atsSource: string;
    atsSlug: string;
  }[] = [];

  for (const target of TARGETS) {
    // Check if company already exists
    const existing = await db
      .select({ id: company.id, tier: company.tier })
      .from(company)
      .where(eq(company.atsSlug, target.atsSlug))
      .limit(1);

    if (existing.length > 0) {
      // Update tier to 'active' to ensure embedding is not deferred
      await db
        .update(company)
        .set({ tier: "active", companyName: target.name })
        .where(eq(company.id, existing[0].id));
      enrolled.push({
        id: existing[0].id,
        name: target.name,
        atsSource: target.atsSource,
        atsSlug: target.atsSlug,
      });
      console.log(
        `  ${target.name.padEnd(16)} already exists (id=${existing[0].id}), tier → active`,
      );
    } else {
      // Insert new company
      const [inserted] = await db
        .insert(company)
        .values({
          companyName: target.name,
          atsSource: target.atsSource,
          atsSlug: target.atsSlug,
          rootDomain: target.rootDomain,
          discoverySource: "manual",
          discoveryContext: "directive_05_smoke_test",
          tier: "active", // Not probation — we want embedding immediately
        })
        .returning({ id: company.id });
      enrolled.push({
        id: inserted.id,
        name: target.name,
        atsSource: target.atsSource,
        atsSlug: target.atsSlug,
      });
      console.log(
        `  ${target.name.padEnd(16)} enrolled (id=${inserted.id}, tier=active)`,
      );
    }
  }
  console.log();

  // ── Step 2: Poll each company ──────────────────────────────────────────────
  console.log("Step 2: Polling ATS feeds (fetch jobs, Gate 0, upsert)...");
  console.log();

  const allNewJobs: { jobId: string; title: string; company: string }[] = [];

  for (const target of enrolled) {
    console.log(
      `  Polling ${target.name} (${target.atsSource}/${target.atsSlug})...`,
    );
    const result = await pollCompany(
      target.id,
      target.atsSource,
      target.atsSlug,
      fetch,
    );

    console.log(
      `    fetched=${result.jobsFetched}, gate0_pass=${result.jobsPassedGate0}, ` +
        `upserted=${result.jobsUpserted}, new=${result.newJobIds.length}`,
    );

    if (result.error) {
      console.log(`    ERROR: ${result.error}`);
    }

    // Fetch the new job details
    for (const jobId of result.newJobIds) {
      const jobRow = await db
        .select({ title: jobTable.title })
        .from(jobTable)
        .where(eq(jobTable.id, jobId))
        .limit(1);
      allNewJobs.push({
        jobId,
        title: jobRow[0]?.title ?? "(unknown)",
        company: target.name,
      });
    }
  }
  console.log();
  console.log(`  Total new jobs: ${allNewJobs.length}`);
  console.log();

  if (allNewJobs.length === 0) {
    // Check if jobs already exist (from a previous run)
    console.log(
      "  No new jobs — checking for existing active jobs from these companies...",
    );
    for (const target of enrolled) {
      const jobs = await db
        .select({
          id: jobTable.id,
          title: jobTable.title,
          status: jobTable.status,
        })
        .from(jobTable)
        .where(eq(jobTable.atsSlug, target.atsSlug))
        .limit(20);
      console.log(
        `    ${target.name}: ${jobs.length} jobs in DB (${jobs.filter((j) => j.status === "active").length} active)`,
      );
      for (const j of jobs) {
        allNewJobs.push({ jobId: j.id, title: j.title, company: target.name });
      }
    }
    console.log();
  }

  // ── Step 3: Normalize + embed each job ─────────────────────────────────────
  console.log("Step 3: Normalizing + embedding jobs...");
  console.log();

  const { openai } = await import("@ai-sdk/openai");
  const { embed } = await import("ai");

  let normalized = 0;
  let embedded = 0;
  let rejected = 0;
  let failed = 0;

  for (const newJob of allNewJobs) {
    // Fetch the job's rawJson
    const jobRow = await db
      .select({
        id: jobTable.id,
        atsSource: jobTable.atsSource,
        rawJson: jobTable.rawJson,
        title: jobTable.title,
        status: jobTable.status,
        normalizedAt: jobTable.normalizedAt,
      })
      .from(jobTable)
      .where(eq(jobTable.id, newJob.jobId))
      .limit(1);

    if (jobRow.length === 0) {
      console.log(`  ${newJob.title.padEnd(40)} SKIP — job not found`);
      continue;
    }

    const j = jobRow[0];

    // Skip if already normalized
    if (j.normalizedAt) {
      console.log(`  ${newJob.title.padEnd(40)} already normalized — skipping`);
      continue;
    }

    // Normalize
    try {
      const result = await normalizeJob(j.atsSource, j.rawJson, j.title);

      if (result.status === "normalized") {
        // Extract remote scope (deterministic only — no LLM for smoke test)
        const scopeResult = await extractRemoteScope(
          result.fullText,
          null, // workplaceType — extracted from metadata separately
          j.atsSource,
          null, // companyLocation
          undefined, // default LLM extractor
          true, // deterministicOnly — skip LLM for speed
        );

        // Generate embedding
        let embedding: number[] | null = null;
        try {
          const embedResult = await embed({
            model: openai.embedding("text-embedding-3-small"),
            value: result.fullText.slice(0, 8000),
          });
          embedding = embedResult.embedding;
          embedded++;
        } catch (embedErr) {
          console.log(
            `  ${newJob.title.padEnd(40)} EMBED FAILED: ${embedErr instanceof Error ? embedErr.message : String(embedErr)}`,
          );
        }

        // Update the job row
        await db
          .update(jobTable)
          .set({
            status: "active",
            normalizedText: result.fullText,
            extractedTags: result.tags,
            normalizedAt: new Date(),
            jobEmbedding: embedding,
            remoteScope: scopeResult.remoteScope,
          })
          .where(eq(jobTable.id, j.id));

        normalized++;
        console.log(
          `  ${newJob.title.padEnd(40)} NORMALIZED scope=${scopeResult.remoteScope} tags=[${result.tags.slice(0, 5).join(",")}] embed=${embedding ? "yes" : "no"}`,
        );
      } else if (result.status === "rejected") {
        await db
          .update(jobTable)
          .set({
            status: "rejected",
            normalizedAt: new Date(),
          })
          .where(eq(jobTable.id, j.id));
        rejected++;
        console.log(
          `  ${newJob.title.padEnd(40)} REJECTED (${result.rejectionReason ?? "unknown"})`,
        );
      }
    } catch (err) {
      failed++;
      console.log(
        `  ${newJob.title.padEnd(40)} NORMALIZE FAILED: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log();
  console.log(
    `  Normalized: ${normalized}, Embedded: ${embedded}, Rejected: ${rejected}, Failed: ${failed}`,
  );
  console.log();

  // ── Step 4: Run Gate 1+2 for each normalized+embedded job ──────────────────
  console.log(
    "Step 4: Running Gate 1+2 (GIN overlap + HNSW cosine) against personas...",
  );
  console.log();

  // Fetch all normalized+embedded jobs from these companies
  const embeddedJobs = await db
    .select({
      id: jobTable.id,
      title: jobTable.title,
      extractedTags: jobTable.extractedTags,
      jobEmbedding: jobTable.jobEmbedding,
      remoteScope: jobTable.remoteScope,
      atsSlug: jobTable.atsSlug,
    })
    .from(jobTable)
    .where(eq(jobTable.atsSlug, TARGETS[0].atsSlug));

  const embeddedJobs2 = await db
    .select({
      id: jobTable.id,
      title: jobTable.title,
      extractedTags: jobTable.extractedTags,
      jobEmbedding: jobTable.jobEmbedding,
      remoteScope: jobTable.remoteScope,
      atsSlug: jobTable.atsSlug,
    })
    .from(jobTable)
    .where(eq(jobTable.atsSlug, TARGETS[1].atsSlug));

  const allJobs = [...embeddedJobs, ...embeddedJobs2].filter(
    (j) => j.jobEmbedding !== null,
  );

  console.log(`  Jobs with embeddings: ${allJobs.length}`);
  console.log();

  let totalCandidates = 0;
  const allCandidates: {
    jobId: string;
    jobTitle: string;
    personaId: string;
    score: number;
  }[] = [];

  for (const j of allJobs) {
    try {
      const tags = j.extractedTags ?? [];
      const embedding = j.jobEmbedding as unknown as number[];
      const candidates = await runGateSQLRouterDirect(
        j.id,
        tags,
        embedding,
        sql as unknown as (q: string) => Promise<Record<string, unknown>[]>,
      );

      if (candidates.length > 0) {
        console.log(
          `  ${j.title.padEnd(40)} → ${candidates.length} candidate(s)`,
        );
        for (const c of candidates) {
          console.log(
            `    persona=${c.personaId} overlap=${c.overlapScore} dist=${c.cosineDistance.toFixed(4)}`,
          );
          allCandidates.push({
            jobId: j.id,
            jobTitle: j.title,
            personaId: c.personaId,
            score: c.overlapScore,
          });
        }
        totalCandidates += candidates.length;
      } else {
        console.log(
          `  ${j.title.padEnd(40)} → no candidates (failed Gate 1+2)`,
        );
      }
    } catch (err) {
      console.log(
        `  ${j.title.padEnd(40)} GATE ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log();

  // ── Step 5: Report ─────────────────────────────────────────────────────────
  console.log("═".repeat(80));
  console.log("  SMOKE TEST RESULT");
  console.log("═".repeat(80));
  console.log();
  console.log(`  Companies enrolled:    ${enrolled.length}`);
  console.log(`  Jobs polled:           ${allNewJobs.length}`);
  console.log(`  Jobs normalized:       ${normalized}`);
  console.log(`  Jobs embedded:         ${embedded}`);
  console.log(`  Jobs rejected:         ${rejected}`);
  console.log(`  Gate 1+2 candidates:   ${totalCandidates}`);
  console.log();

  if (totalCandidates > 0) {
    console.log("  ✓ MATCH PIPELINE WORKING — candidates reached match queue");
    console.log();
    console.log(
      "  Next step: Gate 3 (LLM arbitration) would evaluate these candidates.",
    );
    console.log("  The pipeline produces matches end-to-end.");
  } else {
    console.log("  ✗ ZERO MATCHES — pipeline produced no candidates");
    console.log();
    if (embedded === 0) {
      console.log(
        "  Root cause: No jobs were embedded (embedding failed or no new jobs)",
      );
    } else if (allJobs.length === 0) {
      console.log("  Root cause: No jobs with embeddings found");
    } else {
      console.log(
        "  Root cause: Jobs were embedded but failed Gate 1+2 (no persona overlap)",
      );
      console.log("  This means either:");
      console.log("    - No personas exist in the system, or");
      console.log(
        "    - Persona embeddings don't match these jobs' embeddings, or",
      );
      console.log("    - Persona must_have_tags don't overlap with job tags");
    }
  }
  console.log();

  // ── Check personas ─────────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  PERSONA CHECK");
  console.log("─".repeat(80));
  console.log();

  const personas = await sql`
    SELECT id, persona_label, must_have_tags
    FROM persona
    LIMIT 10
  `;

  if (personas.length === 0) {
    console.log(
      "  ⚠ NO ACTIVE PERSONAS FOUND — this is why Gate 1+2 produced zero candidates",
    );
    console.log(
      "  The match pipeline requires at least one active persona with must_have_tags",
    );
    console.log("  and a persona_embedding to produce matches.");
  } else {
    console.log(`  Active personas: ${personas.length}`);
    for (const p of personas) {
      console.log(
        `    ${p.persona_label} (id=${p.id}) tags=[${(p.must_have_tags ?? []).join(",")}]`,
      );
    }
  }
  console.log();

  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
