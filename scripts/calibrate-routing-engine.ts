#!/usr/bin/env tsx

// Module C — Calibration Script
// scripts/calibrate-routing-engine.ts
//
// Runs the 3-Gate funnel against seed data to collect calibration statistics:
//   1. Gate 1+2: cosine distance distribution, overlap score distribution,
//      candidate counts per job, archetype match rates
//   2. Gate 3 (optional, --gate3 flag): runs a small sample through the LLM
//      to verify verdicts make sense on synthetic data
//
// Usage:
//   node --env-file=.env --import tsx scripts/calibrate-routing-engine.ts
//   node --env-file=.env --import tsx scripts/calibrate-routing-engine.ts --gate3
//
// Output: console summary + docs/reports/calibration-report.md (if --write flag)
//
// (MODULE_C_DECISIONS.md §5.3, §5.5, §13 Feature C6)

import { eq, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { applicant } from "@/db/schemas/jobs/applicant";
import { job } from "@/db/schemas/jobs/job";
import { persona } from "@/db/schemas/jobs/persona";
import {
  GATE_ROUTER_LIMIT,
  GATE1_WEIGHT,
  GATE2_MAX_COSINE_DISTANCE,
  GATE2_WEIGHT,
} from "@/lib/jobs/matching-config";

// =============================================================================
// UTILITIES
// =============================================================================

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const variance = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function histogram(
  arr: number[],
  bins: number,
): { range: string; count: number }[] {
  if (arr.length === 0) return [];
  const min = Math.min(...arr);
  const max = Math.max(...arr);
  const binSize = (max - min) / bins || 1;
  const result: { range: string; count: number }[] = [];

  for (let i = 0; i < bins; i++) {
    const lo = min + i * binSize;
    const hi = lo + binSize;
    const count = arr.filter(
      (v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi),
    ).length;
    result.push({
      range: `${lo.toFixed(3)}-${hi.toFixed(3)}`,
      count,
    });
  }
  return result;
}

function parseArgs(): { gate3: boolean; sampleSize: number } {
  const args = process.argv.slice(2);
  return {
    gate3: args.includes("--gate3"),
    sampleSize:
      Number.parseInt(args[args.indexOf("--sample") + 1] ?? "20", 10) || 20,
  };
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const { gate3, sampleSize } = parseArgs();

  console.log("=".repeat(70));
  console.log("Module C — Calibration Script");
  console.log("=".repeat(70));
  console.log(`  Gate 2 threshold: ${GATE2_MAX_COSINE_DISTANCE}`);
  console.log(`  Gate router limit: ${GATE_ROUTER_LIMIT}`);
  console.log(`  Sample size: ${sampleSize} jobs`);
  console.log(
    `  Gate 3 evaluation: ${gate3 ? "ENABLED (will call OpenAI API)" : "disabled (use --gate3 to enable)"}`,
  );
  console.log();

  // ── Step 1: Fetch sample jobs ────────────────────────────────────────────
  console.log(`Step 1: Fetching ${sampleSize} seed jobs...`);

  const jobs = await db
    .select({
      id: job.id,
      title: job.title,
      extractedTags: job.extractedTags,
      atsSource: job.atsSource,
      rawJson: job.rawJson,
    })
    .from(job)
    .where(
      sql`ats_slug = 'seed-company' AND job_embedding IS NOT NULL AND normalized_at IS NOT NULL`,
    )
    .limit(sampleSize);

  console.log(`  ✓ Found ${jobs.length} jobs`);
  console.log();

  // ── Step 2: Run Gate 1+2 for each job ────────────────────────────────────
  console.log("Step 2: Running Gate 1+2 for each job...");

  const allCosineDistances: number[] = [];
  const allOverlapScores: number[] = [];
  const candidateCounts: number[] = [];
  const perJobResults: {
    jobTitle: string;
    candidates: number;
    topDistance: number;
    topOverlap: number;
  }[] = [];

  for (const j of jobs) {
    // Fetch the embedding for this job
    const jobRow = await db
      .select({ jobEmbedding: job.jobEmbedding })
      .from(job)
      .where(eq(job.id, j.id))
      .limit(1);

    const embRaw = jobRow[0]?.jobEmbedding as unknown;
    // Drizzle returns vector columns as number[] (not string)
    const embedding = Array.isArray(embRaw)
      ? (embRaw as number[])
      : typeof embRaw === "string"
        ? embRaw.replace(/[[\]]/g, "").split(",").map(Number)
        : null;
    if (!embedding || embedding.length === 0) continue;

    const tags = j.extractedTags ?? [];

    // Read-only Gate 1+2 query (no INSERT — avoids ON CONFLICT DO NOTHING
    // returning 0 rows on re-runs). Mirrors runGateSQLRouter logic exactly.
    const embeddingStr = `[${embedding.join(",")}]`;
    const tagsArraySql =
      tags.length > 0
        ? `ARRAY[${tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`
        : `ARRAY[]::text[]`;
    const gate1Clause =
      tags.length > 0
        ? sql.raw(
            `p.must_have_tags && ${tagsArraySql} AND NOT (p.blocklist_tags && ${tagsArraySql})`,
          )
        : sql`true`;

    const result = await db.execute(sql`
      SELECT
        p.id AS persona_id,
        p.applicant_id,
        ov.overlap_score,
        (p.persona_embedding <=> ${embeddingStr}::vector) AS cosine_distance
      FROM persona p
      CROSS JOIN LATERAL (
        SELECT count(*) AS overlap_score
        FROM unnest(p.must_have_tags) AS t(tag)
        WHERE t.tag = ANY(${sql.raw(tagsArraySql)})
      ) ov
      WHERE
        ${gate1Clause}
        AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${GATE2_MAX_COSINE_DISTANCE}::real
        AND p.persona_embedding IS NOT NULL
      ORDER BY
        (
          ov.overlap_score * ${GATE1_WEIGHT}::real
          + (1 - (p.persona_embedding <=> ${embeddingStr}::vector)) * ${GATE2_WEIGHT}::real
        ) DESC
      LIMIT ${GATE_ROUTER_LIMIT}
    `);

    const candidates = result.rows.map((row) => ({
      personaId: row.persona_id as string,
      applicantId: row.applicant_id as string,
      overlapScore: Number(row.overlap_score),
      cosineDistance: Number(row.cosine_distance),
    }));

    candidateCounts.push(candidates.length);
    for (const c of candidates) {
      allCosineDistances.push(c.cosineDistance);
      allOverlapScores.push(c.overlapScore);
    }

    perJobResults.push({
      jobTitle: j.title,
      candidates: candidates.length,
      topDistance: candidates[0]?.cosineDistance ?? 0,
      topOverlap: candidates[0]?.overlapScore ?? 0,
    });
  }

  console.log(`  ✓ Processed ${jobs.length} jobs`);
  console.log();

  // ── Step 3: Statistics ───────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("Gate 1+2 Statistics");
  console.log("=".repeat(70));
  console.log();

  // Candidate count distribution
  console.log("Candidate count per job:");
  console.log(`  Mean:   ${mean(candidateCounts).toFixed(1)}`);
  console.log(`  StdDev: ${stdDev(candidateCounts).toFixed(1)}`);
  console.log(`  Min:    ${Math.min(...candidateCounts)}`);
  console.log(`  Max:    ${Math.max(...candidateCounts)}`);
  console.log(`  P25:    ${percentile(candidateCounts, 25)}`);
  console.log(`  P50:    ${percentile(candidateCounts, 50)}`);
  console.log(`  P75:    ${percentile(candidateCounts, 75)}`);
  console.log();

  // Jobs with 0 candidates
  const zeroCandidateJobs = candidateCounts.filter((c) => c === 0).length;
  const cappedJobs = candidateCounts.filter(
    (c) => c >= GATE_ROUTER_LIMIT,
  ).length;
  console.log(
    `  Jobs with 0 candidates:  ${zeroCandidateJobs} / ${jobs.length}`,
  );
  console.log(`  Jobs hitting LIMIT cap:  ${cappedJobs} / ${jobs.length}`);
  console.log();

  // Cosine distance distribution
  if (allCosineDistances.length > 0) {
    console.log("Cosine distance distribution (lower = better match):");
    console.log(`  Mean:   ${mean(allCosineDistances).toFixed(4)}`);
    console.log(`  StdDev: ${stdDev(allCosineDistances).toFixed(4)}`);
    console.log(`  Min:    ${Math.min(...allCosineDistances).toFixed(4)}`);
    console.log(`  Max:    ${Math.max(...allCosineDistances).toFixed(4)}`);
    console.log(`  P10:    ${percentile(allCosineDistances, 10).toFixed(4)}`);
    console.log(`  P25:    ${percentile(allCosineDistances, 25).toFixed(4)}`);
    console.log(`  P50:    ${percentile(allCosineDistances, 50).toFixed(4)}`);
    console.log(`  P75:    ${percentile(allCosineDistances, 75).toFixed(4)}`);
    console.log(`  P90:    ${percentile(allCosineDistances, 90).toFixed(4)}`);
    console.log();

    console.log("Histogram (10 bins):");
    for (const bin of histogram(allCosineDistances, 10)) {
      const bar = "█".repeat(
        Math.ceil((bin.count / allCosineDistances.length) * 50),
      );
      console.log(`  ${bin.range}  ${bar} ${bin.count}`);
    }
    console.log();
  }

  // Overlap score distribution
  if (allOverlapScores.length > 0) {
    console.log("Overlap score distribution (higher = more tag overlap):");
    console.log(`  Mean:   ${mean(allOverlapScores).toFixed(2)}`);
    console.log(`  Min:    ${Math.min(...allOverlapScores)}`);
    console.log(`  Max:    ${Math.max(...allOverlapScores)}`);
    console.log(`  P25:    ${percentile(allOverlapScores, 25)}`);
    console.log(`  P50:    ${percentile(allOverlapScores, 50)}`);
    console.log(`  P75:    ${percentile(allOverlapScores, 75)}`);
    console.log();
  }

  // Per-job breakdown (first 10)
  console.log("Per-job breakdown (first 10):");
  for (const r of perJobResults.slice(0, 10)) {
    console.log(
      `  ${r.jobTitle.slice(0, 45).padEnd(45)} | candidates=${String(r.candidates).padStart(2)} | topDist=${r.topDistance.toFixed(4)} | topOverlap=${r.topOverlap}`,
    );
  }
  console.log();

  // ── Step 4: Threshold analysis ───────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("Threshold Analysis (true candidate counts, no LIMIT)");
  console.log("=".repeat(70));
  console.log();

  // Query the true candidate count at different thresholds WITHOUT the LIMIT 8.
  // This shows the actual filtering power of the Gate 2 threshold.
  const thresholds = [0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5];
  console.log(
    "True candidate counts at different Gate 2 thresholds (no LIMIT):",
  );
  console.log(
    `  ${"Threshold".padEnd(12)} ${"Total".padStart(8)} ${"Per-job avg".padStart(12)} ${"Jobs with 0".padStart(12)}`,
  );
  for (const threshold of thresholds) {
    let total = 0;
    let zeroJobs = 0;
    for (const j of jobs) {
      const jobRow = await db
        .select({ jobEmbedding: job.jobEmbedding })
        .from(job)
        .where(eq(job.id, j.id))
        .limit(1);
      const embRaw = jobRow[0]?.jobEmbedding as unknown;
      const embedding = Array.isArray(embRaw)
        ? (embRaw as number[])
        : typeof embRaw === "string"
          ? embRaw.replace(/[[\]]/g, "").split(",").map(Number)
          : null;
      if (!embedding || embedding.length === 0) continue;

      const embeddingStr = `[${embedding.join(",")}]`;
      const tags = j.extractedTags ?? [];
      const tagsArraySql =
        tags.length > 0
          ? `ARRAY[${tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`
          : `ARRAY[]::text[]`;
      const gate1Clause =
        tags.length > 0
          ? sql.raw(
              `p.must_have_tags && ${tagsArraySql} AND NOT (p.blocklist_tags && ${tagsArraySql})`,
            )
          : sql`true`;

      const countResult = await db.execute(sql`
        SELECT count(*) AS cnt
        FROM persona p
        WHERE
          ${gate1Clause}
          AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${threshold}::real
          AND p.persona_embedding IS NOT NULL
      `);
      const cnt = Number(countResult.rows[0].cnt);
      total += cnt;
      if (cnt === 0) zeroJobs++;
    }
    const avgPerJob = total / jobs.length;
    const marker = threshold === GATE2_MAX_COSINE_DISTANCE ? " ← CURRENT" : "";
    console.log(
      `  < ${threshold.toFixed(2)}${" ".repeat(6)} ${String(total).padStart(8)} ${avgPerJob.toFixed(1).padStart(12)} ${String(zeroJobs).padStart(12)}${marker}`,
    );
  }
  console.log();

  // ── Step 5: Gate 3 evaluation (optional) ────────────────────────────────
  if (gate3 && allCosineDistances.length > 0) {
    console.log("=".repeat(70));
    console.log("Gate 3 Evaluation (sample of 5 candidates)");
    console.log("=".repeat(70));
    console.log();

    // Pick 5 candidates from the first few jobs
    const { evaluateGate3, mapVerdict } = await import("@/lib/jobs/gate-3");
    const { extractJobContent } = await import("@/lib/jobs/job-normalizer");

    let evaluated = 0;
    const verdicts: { approved: number; rejected: number; error: number } = {
      approved: 0,
      rejected: 0,
      error: 0,
    };

    outer: for (const j of jobs.slice(0, 5)) {
      const jobRow = await db
        .select({ jobEmbedding: job.jobEmbedding })
        .from(job)
        .where(eq(job.id, j.id))
        .limit(1);
      const embRaw = jobRow[0]?.jobEmbedding as unknown;
      const embedding = Array.isArray(embRaw)
        ? (embRaw as number[])
        : typeof embRaw === "string"
          ? embRaw.replace(/[[\]]/g, "").split(",").map(Number)
          : null;
      if (!embedding || embedding.length === 0) continue;
      const tags = j.extractedTags ?? [];

      // Read-only Gate 1+2 query (same as Step 2)
      const embeddingStr = `[${embedding.join(",")}]`;
      const tagsArraySql =
        tags.length > 0
          ? `ARRAY[${tags.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`
          : `ARRAY[]::text[]`;
      const gate1Clause =
        tags.length > 0
          ? sql.raw(
              `p.must_have_tags && ${tagsArraySql} AND NOT (p.blocklist_tags && ${tagsArraySql})`,
            )
          : sql`true`;

      const gateResult = await db.execute(sql`
        SELECT
          p.id AS persona_id,
          p.applicant_id,
          ov.overlap_score,
          (p.persona_embedding <=> ${embeddingStr}::vector) AS cosine_distance
        FROM persona p
        CROSS JOIN LATERAL (
          SELECT count(*) AS overlap_score
          FROM unnest(p.must_have_tags) AS t(tag)
          WHERE t.tag = ANY(${sql.raw(tagsArraySql)})
        ) ov
        WHERE
          ${gate1Clause}
          AND (p.persona_embedding <=> ${embeddingStr}::vector) < ${GATE2_MAX_COSINE_DISTANCE}::real
          AND p.persona_embedding IS NOT NULL
        ORDER BY
          (
            ov.overlap_score * ${GATE1_WEIGHT}::real
            + (1 - (p.persona_embedding <=> ${embeddingStr}::vector)) * ${GATE2_WEIGHT}::real
          ) DESC
        LIMIT ${GATE_ROUTER_LIMIT}
      `);

      const candidates = gateResult.rows.map((row) => ({
        personaId: row.persona_id as string,
        applicantId: row.applicant_id as string,
        overlapScore: Number(row.overlap_score),
        cosineDistance: Number(row.cosine_distance),
      }));

      for (const c of candidates.slice(0, 2)) {
        if (evaluated >= 5) break outer;

        // Fetch persona + applicant context
        const [personaRow, applicantRow] = await Promise.all([
          db
            .select({
              personaLabel: persona.personaLabel,
              embeddingSummary: persona.embeddingSummary,
              mustHaveTags: persona.mustHaveTags,
              blocklistTags: persona.blocklistTags,
              seniorityLevels: persona.seniorityLevels,
            })
            .from(persona)
            .where(eq(persona.id, c.personaId))
            .limit(1),
          db
            .select({
              allTags: applicant.allTags,
              country: applicant.country,
              canWorkUsHours: applicant.canWorkUsHours,
              preferredCompliance: applicant.preferredCompliance,
              modalities: applicant.modalities,
              assignmentTypes: applicant.assignmentTypes,
              workAuthorizations: applicant.workAuthorizations,
            })
            .from(applicant)
            .where(eq(applicant.userId, c.applicantId))
            .limit(1),
        ]);

        if (personaRow.length === 0 || applicantRow.length === 0) continue;

        const extracted = extractJobContent(j.atsSource, j.rawJson, j.title);

        try {
          const verdict = await evaluateGate3({
            job: {
              title: j.title,
              description: extracted.description,
              extractedTags: tags,
              workplaceType: null,
              locationName: null,
              employmentType: null,
            },
            persona: {
              personaLabel: personaRow[0].personaLabel,
              embeddingSummary: personaRow[0].embeddingSummary,
              mustHaveTags: personaRow[0].mustHaveTags,
              blocklistTags: personaRow[0].blocklistTags,
              seniorityLevels: personaRow[0].seniorityLevels ?? [],
            },
            applicant: {
              allTags: applicantRow[0].allTags,
              country: applicantRow[0].country,
              canWorkUsHours: applicantRow[0].canWorkUsHours,
              preferredCompliance: applicantRow[0].preferredCompliance ?? [],
              modalities: applicantRow[0].modalities ?? [],
              assignmentTypes: applicantRow[0].assignmentTypes ?? [],
              workAuthorizations: applicantRow[0].workAuthorizations ?? [],
            },
          });

          const verdictStr = mapVerdict(verdict);
          verdicts[verdictStr === "approved" ? "approved" : "rejected"]++;
          evaluated++;

          console.log(`  [${evaluated}] ${j.title.slice(0, 40)}`);
          console.log(`      Persona: ${personaRow[0].personaLabel}`);
          console.log(
            `      Verdict: ${verdictStr} (confidence: ${verdict.matchConfidence.toFixed(2)})`,
          );
          console.log(
            `      Reasoning: ${verdict.matchReasoning.slice(0, 100)}`,
          );
          if (verdict.blockers.length > 0) {
            console.log(`      Blockers: ${verdict.blockers.join(", ")}`);
          }
          console.log();
        } catch (error) {
          verdicts.error++;
          evaluated++;
          console.log(
            `  [${evaluated}] ${j.title.slice(0, 40)} → ERROR: ${error instanceof Error ? error.message : String(error)}`,
          );
          console.log();
        }
      }
    }

    console.log("Gate 3 verdict summary:");
    console.log(`  Approved: ${verdicts.approved}`);
    console.log(`  Rejected: ${verdicts.rejected}`);
    console.log(`  Error:    ${verdicts.error}`);
    console.log();
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("Calibration Summary");
  console.log("=".repeat(70));
  console.log(`  Jobs sampled:           ${jobs.length}`);
  console.log(`  Total candidates:       ${allCosineDistances.length}`);
  console.log(
    `  Avg candidates/job:     ${(allCosineDistances.length / jobs.length).toFixed(1)}`,
  );
  console.log(`  Current threshold:      ${GATE2_MAX_COSINE_DISTANCE}`);
  console.log(
    `  Mean cosine distance:   ${allCosineDistances.length > 0 ? mean(allCosineDistances).toFixed(4) : "N/A"}`,
  );
  console.log(
    `  Median cosine distance: ${allCosineDistances.length > 0 ? percentile(allCosineDistances, 50).toFixed(4) : "N/A"}`,
  );
  console.log();
  console.log(
    "NOTE: This calibration uses SYNTHETIC seed data. The thresholds",
  );
  console.log(
    "must be re-calibrated against 20-30 REAL job/persona pairs before",
  );
  console.log("launch (MODULE_C_DECISIONS.md §14, Feature C6).");
  console.log();

  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
