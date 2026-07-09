#!/usr/bin/env npx tsx
/**
 * Direct Gate Routing Script
 *
 * Routes normalized jobs through the full 3-Gate matching funnel:
 *   Gate 0.5 → Gate 1+2 → Gate 3
 *
 * This bypasses Inngest to clear the backlog of 3044 normalized jobs
 * that were normalized by the direct-normalize-backlog.ts script but
 * never routed through the matching pipeline.
 *
 * The jobIngestedHandler Inngest function does all of this, but it
 * skips jobs where normalizedAt IS NOT NULL (idempotency). Since we
 * normalized directly, we need this script to run the gates.
 *
 * Usage:
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/direct-gate-routing.ts [--limit N] [--concurrency N]
 *
 * Defaults: limit=500, concurrency=10
 *
 * Per job:
 *   1. Fetch job + all applicants/personas
 *   2. Gate 0.5: runHardBlockerPreFilter for each applicant
 *      - If ALL applicants fail → tombstone job (status='rejected')
 *      - If ANY applicant passes → proceed to Gate 1+2
 *   3. Gate 1+2: runGateSQLRouter (GIN overlap + HNSW cosine)
 *      - Inserts candidates into match_queue
 *      - Returns candidates that passed both gates
 *   4. Gate 3: evaluateGate3 (gpt-4o-mini LLM evaluation)
 *      - Writes verdict to match_queue (approved/rejected)
 */

import { config } from "dotenv";

config({ path: ".env" });

import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { applicant } from "@/db/schemas/jobs/applicant";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { runGateSQLRouter } from "@/lib/jobs/gate-1-2";
import {
  evaluateGate3,
  type Gate3Context,
  mapVerdict,
  pickPromptVariant,
} from "@/lib/jobs/gate-3";
import { runHardBlockerPreFilter } from "@/lib/jobs/gate-zero-pre-filter";
import { extractJobContent } from "@/lib/jobs/job-normalizer";

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let limit = 500;
let concurrency = 10;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit" && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else if (args[i] === "--concurrency" && args[i + 1]) {
    concurrency = parseInt(args[i + 1], 10);
    i++;
  }
}

const SEP = "=".repeat(70);
console.log(`\n${SEP}`);
console.log("Direct Gate Routing Script (Gate 0.5 + 1+2 + 3)");
console.log(SEP);
console.log(`Limit: ${limit} jobs`);
console.log(`Concurrency: ${concurrency} workers`);
console.log();

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Fetch normalized jobs that have NO match_queue entries (not yet routed)
  const unroutedJobs = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      title: job.title,
      rawJson: job.rawJson,
      normalizedText: job.normalizedText,
      extractedTags: job.extractedTags,
      jobEmbedding: job.jobEmbedding,
      locationName: job.locationName,
      workplaceType: job.workplaceType,
      titleRegionTag: job.titleRegionTag,
      locationCountries: job.locationCountries,
      experienceMinYears: job.experienceMinYears,
      experienceMaxYears: job.experienceMaxYears,
      compensationMin: job.compensationMin,
      compensationMax: job.compensationMax,
      compensationCurrency: job.compensationCurrency,
      remoteScope: job.remoteScope,
      employmentType: job.employmentType,
    })
    .from(job)
    .where(
      and(
        eq(job.status, "active"),
        sql`${job.normalizedAt} IS NOT NULL`,
        // Only jobs with NO match_queue entries (not yet routed)
        sql`NOT EXISTS (SELECT 1 FROM match_queue mq WHERE mq.job_id = ${job.id})`,
      ),
    )
    .orderBy(job.normalizedAt)
    .limit(limit);

  console.log(`Found ${unroutedJobs.length} unrouted normalized jobs.\n`);

  if (unroutedJobs.length === 0) {
    console.log("No jobs to route. Exiting.");
    process.exit(0);
  }

  // Fetch all applicants once (shared across all jobs)
  const applicants = await db
    .select({
      userId: applicant.userId,
      country: applicant.country,
      assignmentTypes: applicant.assignmentTypes,
      preferredCompliance: applicant.preferredCompliance,
      expectedCompMin: applicant.expectedCompMin,
      yearsOfExperience: applicant.yearsOfExperience,
      allTags: applicant.allTags,
      canWorkUsHours: applicant.canWorkUsHours,
      modalities: applicant.modalities,
      workAuthorizations: applicant.workAuthorizations,
    })
    .from(applicant);

  if (applicants.length === 0) {
    console.log("No applicants found. Cannot run Gate 0.5. Exiting.");
    process.exit(0);
  }

  console.log(`Found ${applicants.length} applicant(s).\n`);

  // ── Stats ──────────────────────────────────────────────────────────────────
  let completed = 0;
  let gate05Rejected = 0;
  let gate12Passed = 0;
  let gate12Empty = 0;
  let gate3Approved = 0;
  let gate3Rejected = 0;
  let gate3Errors = 0;
  let totalCandidates = 0;
  const errors: string[] = [];
  const startTime = Date.now();

  // ── Process each job ───────────────────────────────────────────────────────
  async function processJob(j: (typeof unroutedJobs)[0]): Promise<void> {
    const jobStart = Date.now();
    try {
      // ── Gate 0.5: Hard-blocker pre-filter ────────────────────────────────
      // Check against all applicants. If ANY applicant passes, the job proceeds.
      let anyApplicantPasses = false;
      for (const app of applicants) {
        const result = runHardBlockerPreFilter({
          job: {
            title: j.title,
            locationName: j.locationName,
            workplaceType: j.workplaceType as
              | "remote"
              | "hybrid"
              | "on-site"
              | null,
            normalizedText: j.normalizedText,
            titleRegionTag: j.titleRegionTag,
            locationCountries: j.locationCountries,
            experienceMinYears: j.experienceMinYears,
            experienceMaxYears: j.experienceMaxYears,
            compensationMin:
              j.compensationMin !== null ? Number(j.compensationMin) : null,
            compensationMax:
              j.compensationMax !== null ? Number(j.compensationMax) : null,
            compensationCurrency: j.compensationCurrency,
            remoteScope: (j.remoteScope ?? "unknown") as
              | "global"
              | "country_fenced"
              | "region_fenced"
              | "onsite"
              | "unknown"
              | "undetermined",
          },
          applicant: {
            country: app.country,
            assignmentTypes: app.assignmentTypes ?? [],
            preferredCompliance: app.preferredCompliance ?? [],
            expectedCompMin:
              app.expectedCompMin !== null ? Number(app.expectedCompMin) : null,
            yearsOfExperience: app.yearsOfExperience,
          },
        });
        if (result.passes) {
          anyApplicantPasses = true;
          break;
        }
      }

      if (!anyApplicantPasses) {
        // All applicants failed Gate 0.5 — tombstone the job
        await db
          .update(job)
          .set({ status: "rejected", normalizedAt: new Date() })
          .where(eq(job.id, j.id));
        gate05Rejected++;
        completed++;
        logProgress(j.id, "gate-0.5-rejected", jobStart);
        return;
      }

      // ── Gate 1+2: SQL router ─────────────────────────────────────────────
      const tags = j.extractedTags ?? [];
      // jobEmbedding is returned as a string by Drizzle — parse it
      let embedding: number[] = [];
      if (j.jobEmbedding) {
        // pgvector returns "[0.1,0.2,...]" — parse to number[]
        const embStr = String(j.jobEmbedding);
        embedding = embStr
          .replace(/^\[/, "")
          .replace(/\]$/, "")
          .split(",")
          .map((n) => parseFloat(n));
      }

      const candidates = await runGateSQLRouter(j.id, tags, embedding);

      if (candidates.length === 0) {
        // No personas passed Gate 1+2 — job is normalized but has no matches
        gate12Empty++;
        completed++;
        logProgress(j.id, "gate-1+2-empty", jobStart);
        return;
      }

      gate12Passed++;
      totalCandidates += candidates.length;

      // ── Gate 3: LLM evaluation for each candidate ────────────────────────
      // Fetch job context for Gate 3 (extracted description)
      const extracted = extractJobContent(
        j.atsSource,
        j.rawJson,
        j.title,
        j.normalizedText,
      );

      // Fetch personas for the candidates
      const { persona } = await import("@/db/schemas/jobs/persona");
      const personaRows = await db
        .select({
          id: persona.id,
          applicantId: persona.applicantId,
          personaLabel: persona.personaLabel,
          embeddingSummary: persona.embeddingSummary,
          mustHaveTags: persona.mustHaveTags,
          blocklistTags: persona.blocklistTags,
          seniorityLevels: persona.seniorityLevels,
        })
        .from(persona)
        .where(
          inArray(
            persona.id,
            candidates.map((c) => c.personaId),
          ),
        );

      // Build a lookup map
      const personaMap = new Map(personaRows.map((p) => [p.id, p]));

      // Evaluate each candidate with Gate 3
      for (const candidate of candidates) {
        const personaRow = personaMap.get(candidate.personaId);
        if (!personaRow) {
          errors.push(`Job ${j.id}: persona ${candidate.personaId} not found`);
          continue;
        }

        // Find the applicant for this persona
        const app = applicants.find((a) => a.userId === personaRow.applicantId);
        if (!app) {
          errors.push(
            `Job ${j.id}: applicant ${personaRow.applicantId} not found`,
          );
          continue;
        }

        const gate3Context: Gate3Context = {
          job: {
            title: j.title,
            description: extracted.description,
            extractedTags: tags,
            workplaceType: j.workplaceType as
              | "remote"
              | "hybrid"
              | "on-site"
              | null,
            locationName: j.locationName,
            employmentType: j.employmentType,
            remoteScope: (j.remoteScope ??
              null) as Gate3Context["job"]["remoteScope"],
            locationCountries: j.locationCountries ?? null,
          },
          persona: {
            personaLabel: personaRow.personaLabel,
            embeddingSummary: personaRow.embeddingSummary,
            mustHaveTags: personaRow.mustHaveTags ?? [],
            blocklistTags: personaRow.blocklistTags ?? [],
            seniorityLevels: personaRow.seniorityLevels ?? [],
          },
          applicant: {
            allTags: app.allTags,
            country: app.country,
            canWorkUsHours: app.canWorkUsHours,
            preferredCompliance: app.preferredCompliance ?? [],
            modalities: app.modalities ?? [],
            assignmentTypes: app.assignmentTypes ?? [],
            workAuthorizations: app.workAuthorizations ?? [],
          },
        };

        try {
          const variant = pickPromptVariant();
          const verdict = await evaluateGate3(gate3Context, variant);
          const verdictString = mapVerdict(verdict);

          // Write verdict to match_queue
          await db
            .update(matchQueue)
            .set({
              status: verdictString,
              llmVerdict: verdictString,
              llmReasoning: verdict.matchReasoning,
              llmConfidence: verdict.matchConfidence,
              llmBlockers: verdict.blockers,
              llmModel: "gpt-4o-mini",
              promptVariant: variant,
              workAuthRiskFlag: verdict.workAuthRiskFlag ?? false,
              evaluatedAt: new Date(),
            })
            .where(eq(matchQueue.id, candidate.matchQueueId));

          if (verdict.approved) {
            gate3Approved++;
          } else {
            gate3Rejected++;
          }
        } catch (err) {
          gate3Errors++;
          const errMsg = err instanceof Error ? err.message : String(err);
          errors.push(
            `Job ${j.id} candidate ${candidate.matchQueueId}: ${errMsg}`,
          );
          // Mark as error in match_queue
          await db
            .update(matchQueue)
            .set({
              status: "error",
              llmVerdict: "error",
              evaluatedAt: new Date(),
            })
            .where(eq(matchQueue.id, candidate.matchQueueId));
        }
      }

      completed++;
      logProgress(
        j.id,
        `gate-3-done (${candidates.length} candidates)`,
        jobStart,
      );
    } catch (error) {
      completed++;
      gate3Errors++;
      const errMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Job ${j.id}: ${errMsg}`);
      console.error(`[ERROR] Job ${j.id}: ${errMsg}`);
    }
  }

  function logProgress(_jobId: string, phase: string, jobStart: number) {
    const elapsed = ((Date.now() - jobStart) / 1000).toFixed(1);
    if (completed % 10 === 0 || completed === unroutedJobs.length) {
      const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = ((completed / (Date.now() - startTime)) * 1000).toFixed(1);
      console.log(
        `[${completed}/${unroutedJobs.length}] ` +
          `g05_rej=${gate05Rejected} g12_pass=${gate12Passed} g12_empty=${gate12Empty} ` +
          `g3_ok=${gate3Approved} g3_rej=${gate3Rejected} g3_err=${gate3Errors} ` +
          `cands=${totalCandidates} | ${phase} (${elapsed}s) ` +
          `rate=${rate} jobs/s elapsed=${totalElapsed}s`,
      );
    }
  }

  // Simple concurrency pool
  const queue = [...unroutedJobs];
  const workers: Promise<void>[] = [];

  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const j = queue.shift();
          if (j) await processJob(j);
        }
      })(),
    );
  }

  await Promise.all(workers);

  // ── Summary ─────────────────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${SEP}`);
  console.log(`COMPLETE — ${completed} jobs routed in ${totalElapsed}s`);
  console.log(`  Gate 0.5 rejected: ${gate05Rejected}`);
  console.log(`  Gate 1+2 passed:   ${gate12Passed}`);
  console.log(`  Gate 1+2 empty:    ${gate12Empty} (no persona overlap)`);
  console.log(`  Total candidates:  ${totalCandidates}`);
  console.log(`  Gate 3 approved:   ${gate3Approved}`);
  console.log(`  Gate 3 rejected:   ${gate3Rejected}`);
  console.log(`  Gate 3 errors:     ${gate3Errors}`);
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors.slice(0, 20)) {
      console.log(`  ${e}`);
    }
    if (errors.length > 20) {
      console.log(`  ... and ${errors.length - 20} more`);
    }
  }
  console.log(`${SEP}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
