#!/usr/bin/env npx tsx
/**
 * Direct Backlog Normalization Script
 *
 * Bypasses Inngest entirely to clear the unnormalized job backlog.
 * The Inngest queue keeps wedging (bug #3549 + dev mode), preventing
 * normalizations from processing. This script does the same work as
 * the jobIngestedHandler Inngest function — normalize + embed + write
 * to DB — but with direct concurrent workers instead of going through
 * the Inngest queue.
 *
 * Usage:
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/direct-normalize-backlog.ts [--limit N] [--concurrency N]
 *
 * Defaults: limit=500, concurrency=15
 *
 * What this script does per job:
 *   1. Read job from DB (id, atsSource, rawJson, title)
 *   2. Call normalizeJob() — regex tag extraction + LLM fallback + summary
 *   3. If normalized: call embedJob() — OpenAI text-embedding-3-small
 *   4. Write results to DB (normalizedText, extractedTags, jobEmbedding,
 *      shortDescription, normalizedAt, rawJson=NULL for G7 storage)
 *   5. If status was normalization_failed, reset to active
 *
 * What this script does NOT do (to keep it focused):
 *   - Gate 0.5 pre-filter (run separately after normalization)
 *   - Gate 1+2 SQL routing (run separately after normalization)
 *   - Gate 3 fan-out (run separately after normalization)
 */

import { config } from "dotenv";

config({ path: ".env" });

import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import { embedJob } from "@/lib/jobs/job-embedder";
import { normalizeJob } from "@/lib/jobs/job-normalizer";

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let limit = 500;
let concurrency = 15;

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
console.log("Direct Backlog Normalization Script");
console.log(SEP);
console.log(`Limit: ${limit} jobs`);
console.log(`Concurrency: ${concurrency} workers`);
console.log();

// ── Fetch unnormalized jobs ─────────────────────────────────────────────────
async function main() {
  const stuckJobs = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      title: job.title,
      rawJson: job.rawJson,
      status: job.status,
    })
    .from(job)
    .where(
      and(
        or(
          sql`${job.status} = 'normalization_failed'`,
          sql`${job.status} = 'active' AND ${job.normalizedAt} IS NULL`,
        ),
        sql`${job.rawJson} IS NOT NULL`,
      ),
    )
    .orderBy(job.detectedAt)
    .limit(limit);

  console.log(`Found ${stuckJobs.length} unnormalized jobs to process.\n`);

  if (stuckJobs.length === 0) {
    console.log("No jobs to normalize. Exiting.");
    process.exit(0);
  }

  // ── Process jobs with concurrency limit ─────────────────────────────────────
  let completed = 0;
  let normalized = 0;
  let rejected = 0;
  let failed = 0;
  const errors: string[] = [];
  const startTime = Date.now();

  async function processJob(j: (typeof stuckJobs)[0]): Promise<void> {
    const jobStart = Date.now();
    try {
      // Step 1: Normalize (regex + LLM fallback + summary)
      const result = await normalizeJob(j.atsSource, j.rawJson, j.title);

      // Step 2: Embed (only for normalized jobs)
      let embedding: number[] | null = null;
      if (result.status === "normalized") {
        embedding = await embedJob(result.fullText);
      }

      // Step 3: Write results to DB
      if (result.status === "normalized") {
        await db
          .update(job)
          .set({
            extractedTags: result.tags,
            jobEmbedding: embedding,
            normalizedText: result.fullText,
            rawJson: null, // G7: reclaim storage
            normalizedAt: new Date(),
            shortDescription: result.summary ?? null,
            status: "active", // reset from normalization_failed if applicable
          })
          .where(eq(job.id, j.id));
        normalized++;
      } else if (result.status === "rejected") {
        await db
          .update(job)
          .set({
            status: "rejected",
            extractedTags: result.tags,
            normalizedText: result.fullText,
            rawJson: null, // G7: reclaim storage from garbage too
            normalizedAt: new Date(),
          })
          .where(eq(job.id, j.id));
        rejected++;
      } else {
        // normalization_failed — NO normalizedAt (must remain retryable)
        // Do NOT null rawJson — the retry sweep needs it
        await db
          .update(job)
          .set({
            status: "normalization_failed",
            extractedTags: result.tags,
          })
          .where(eq(job.id, j.id));
        failed++;
        if (result.error) {
          errors.push(`Job ${j.id}: ${result.error}`);
        }
      }

      const elapsed = ((Date.now() - jobStart) / 1000).toFixed(1);
      completed++;
      if (completed % 10 === 0 || completed === stuckJobs.length) {
        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = ((completed / (Date.now() - startTime)) * 1000).toFixed(1);
        console.log(
          `[${completed}/${stuckJobs.length}] ` +
            `normalized=${normalized} rejected=${rejected} failed=${failed} ` +
            `last=${result.status} (${elapsed}s) ` +
            `rate=${rate} jobs/s elapsed=${totalElapsed}s`,
        );
      }
    } catch (error) {
      completed++;
      failed++;
      const errMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Job ${j.id}: ${errMsg}`);
      console.error(`[ERROR] Job ${j.id}: ${errMsg}`);
    }
  }

  // Simple concurrency pool
  const queue = [...stuckJobs];
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

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${SEP}`);
  console.log(`COMPLETE — ${completed} jobs processed in ${totalElapsed}s`);
  console.log(`  Normalized: ${normalized}`);
  console.log(`  Rejected:   ${rejected}`);
  console.log(`  Failed:     ${failed}`);
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

  // Clean up connections
  process.exit(0);
} // end main()

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
