#!/usr/bin/env tsx
// Backfill: Fix Resurrected Rejected Jobs + Re-embed Missing Embeddings
// scripts/backfill-resurrected-jobs.ts
//
// Fixes the data corruption caused by the upsert resurrection bug (Culprit #1):
//   - 566 jobs that were correctly rejected by the normalizer (status='rejected',
//     extracted_tags=[], job_embedding=NULL) were resurrected to status='active'
//     by the poller's upsert on re-poll. These are non-software roles that
//     should have stayed rejected.
//   - 160 jobs that were normalized (have tags) but the embedding step failed.
//
// This script:
//   1. Re-normalizes all active jobs with empty extracted_tags (the 566 resurrected
//      jobs). Jobs that are genuinely non-software will be re-rejected.
//      Jobs that are software but had insufficient text for tag extraction will
//      get the LLM fallback treatment.
//   2. Re-embeds all active jobs with tags but no embedding (the 160 jobs).
//   3. Resets normalizedAt for jobs that need re-processing.
//
// After this script, run rerun-gates.ts to rebuild match_queue with the corrected
// data.
//
// Usage:
//   node --conditions react-server --import tsx scripts/backfill-resurrected-jobs.ts
//   node --conditions react-server --import tsx scripts/backfill-resurrected-jobs.ts --dry-run
//   node --conditions react-server --import tsx scripts/backfill-resurrected-jobs.ts --limit=50
//
// Note: --conditions react-server is required because the script imports
// modules that use `import "server-only"` (a Next.js marker). Without this
// flag, Node resolves server-only to index.js which throws. The react-server
// condition resolves it to empty.js (a no-op).

import { config } from "dotenv";
import { sql } from "drizzle-orm";

// Load environment variables from .env
config();

// ── Global error handlers ────────────────────────────────────────────────────
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message);
});
process.on("unhandledRejection", (err) => {
  console.error(
    "[unhandledRejection]",
    err instanceof Error ? err.message : String(err),
  );
});

// ── CLI argument parsing ─────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg
  ? Number.parseInt(limitArg.split("=")[1], 10)
  : undefined;

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delayMs = 1000,
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  Retry ${attempt + 1}/${maxRetries}: ${msg}`);
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("Backfill: Fix Resurrected Rejected Jobs + Re-embed Missing");
  console.log("=".repeat(70));
  console.log();
  console.log(`  Mode:  ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`  Limit: ${limit ?? "none"}`);
  console.log();

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY is not set (needed for embeddings).");
    process.exit(1);
  }

  // ── Phase 1: Re-normalize active jobs with empty tags ────────────────────
  // These are the 566 resurrected rejected jobs. Re-normalization will either:
  //   - Re-reject them (genuinely non-software) → status='rejected'
  //   - Extract tags (software roles with insufficient prior text) → proceed to embed
  await renormalizeEmptyTagJobs(dryRun, limit);

  // ── Phase 2: Re-embed active jobs with tags but no embedding ─────────────
  // These are the 160 jobs where the embedding step failed during the initial
  // backfill run.
  await reembedJobsWithTags(dryRun, limit);

  console.log();
  console.log("=".repeat(70));
  console.log("Backfill complete!");
  console.log("=".repeat(70));
  console.log();
  console.log("Next step: Re-run Gate 1+2 to rebuild match_queue:");
  console.log(
    "  INNGEST_EVENT_KEY=<key> npx tsx scripts/rerun-gates.ts --clean",
  );
}

// ── Phase 1: Re-normalize jobs with empty tags ──────────────────────────────

async function renormalizeEmptyTagJobs(
  dryRun: boolean,
  limit: number | undefined,
): Promise<void> {
  console.log("=".repeat(70));
  console.log("Phase 1: Re-normalizing active jobs with empty extracted_tags");
  console.log("=".repeat(70));
  console.log();

  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");

  let query = db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      title: job.title,
      rawJson: job.rawJson,
      normalizedAt: job.normalizedAt,
    })
    .from(job)
    .where(
      sql`${job.status} = 'active' AND ${job.jobEmbedding} IS NULL AND array_length(${job.extractedTags}, 1) IS NULL`,
    )
    .$dynamic();

  if (limit) {
    query = query.limit(limit);
  }

  const jobs = await query;

  console.log(
    `  Found ${jobs.length} active jobs with empty tags + no embedding`,
  );
  console.log();

  if (dryRun) {
    console.log("  [DRY RUN] Would re-normalize these jobs.");
    for (const j of jobs.slice(0, 10)) {
      console.log(`    ${j.atsSource}: ${j.title}`);
    }
    if (jobs.length > 10) {
      console.log(`    ... and ${jobs.length - 10} more`);
    }
    console.log();
    return;
  }

  const { normalizeJob } = await import("@/lib/jobs/job-normalizer");
  const { embedJob } = await import("@/lib/jobs/job-embedder");
  const { eq } = await import("drizzle-orm");

  let reRejected = 0;
  let reNormalized = 0;
  let reEmbedded = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    process.stdout.write(
      `  [${i + 1}/${jobs.length}] ${j.atsSource}: ${j.title.slice(0, 50)}... `,
    );

    try {
      // Reset normalizedAt so the job is re-processable by the automated pipeline
      // if this script crashes mid-way.
      await db.update(job).set({ normalizedAt: null }).where(eq(job.id, j.id));

      // Re-normalize
      const result = await withRetry(() =>
        normalizeJob(j.atsSource, j.rawJson, j.title),
      );

      if (result.status === "rejected") {
        // Genuinely non-software job — re-reject it
        await db
          .update(job)
          .set({
            status: "rejected",
            extractedTags: result.tags,
            normalizedAt: new Date(),
          })
          .where(eq(job.id, j.id));
        reRejected++;
        console.log("REJECTED (non-software)");
      } else if (result.status === "normalized") {
        // Software job — extract tags and embed
        let embedding: number[] | null = null;
        try {
          embedding = await withRetry(() => embedJob(result.fullText));
        } catch (embError) {
          console.warn(
            `EMBED FAILED: ${embError instanceof Error ? embError.message : String(embError)}`,
          );
        }

        await db
          .update(job)
          .set({
            extractedTags: result.tags,
            jobEmbedding: embedding,
            normalizedAt: new Date(),
            // status stays 'active'
          })
          .where(eq(job.id, j.id));
        reNormalized++;
        if (embedding) {
          reEmbedded++;
          console.log(`NORMALIZED + EMBEDDED (${result.tags.length} tags)`);
        } else {
          console.log(`NORMALIZED (no embedding — will retry later)`);
        }
      } else {
        // normalization_failed
        await db
          .update(job)
          .set({
            status: "normalization_failed",
            extractedTags: result.tags,
            // No normalizedAt — remains retryable
          })
          .where(eq(job.id, j.id));
        failed++;
        console.log(`FAILED: ${result.error}`);
      }
    } catch (error) {
      failed++;
      console.log(
        `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Small delay to avoid OpenAI rate limits
    await sleep(300);
  }

  console.log();
  console.log(`  Phase 1 Summary:`);
  console.log(`    Re-rejected (non-software):  ${reRejected}`);
  console.log(`    Re-normalized (software):    ${reNormalized}`);
  console.log(`    Re-embedded:                  ${reEmbedded}`);
  console.log(`    Failed:                       ${failed}`);
  console.log();
}

// ── Phase 2: Re-embed jobs with tags but no embedding ───────────────────────

async function reembedJobsWithTags(
  dryRun: boolean,
  limit: number | undefined,
): Promise<void> {
  console.log("=".repeat(70));
  console.log("Phase 2: Re-embedding active jobs with tags but no embedding");
  console.log("=".repeat(70));
  console.log();

  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");

  let query = db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      title: job.title,
      rawJson: job.rawJson,
      extractedTags: job.extractedTags,
    })
    .from(job)
    .where(
      sql`${job.status} = 'active' AND ${job.jobEmbedding} IS NULL AND array_length(${job.extractedTags}, 1) IS NOT NULL`,
    )
    .$dynamic();

  if (limit) {
    query = query.limit(limit);
  }

  const jobs = await query;

  console.log(`  Found ${jobs.length} active jobs with tags but no embedding`);
  console.log();

  if (dryRun) {
    console.log("  [DRY RUN] Would re-embed these jobs.");
    for (const j of jobs.slice(0, 10)) {
      console.log(
        `    ${j.atsSource}: ${j.title} [${j.extractedTags.join(", ")}]`,
      );
    }
    if (jobs.length > 10) {
      console.log(`    ... and ${jobs.length - 10} more`);
    }
    console.log();
    return;
  }

  const { embedJob } = await import("@/lib/jobs/job-embedder");
  const { eq } = await import("drizzle-orm");

  let embedded = 0;
  let failed = 0;

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    process.stdout.write(
      `  [${i + 1}/${jobs.length}] ${j.atsSource}: ${j.title.slice(0, 50)}... `,
    );

    try {
      // Extract fullText from rawJson using the content extractor (no LLM call).
      // These jobs already have tags from a previous successful normalization —
      // we only need to generate the embedding, not re-normalize.
      const { extractJobContent } = await import("@/lib/jobs/job-normalizer");
      const { fullText } = extractJobContent(j.atsSource, j.rawJson, j.title);

      const embedding = await withRetry(() => embedJob(fullText));

      await db
        .update(job)
        .set({
          jobEmbedding: embedding,
        })
        .where(eq(job.id, j.id));

      embedded++;
      console.log("EMBEDDED");
    } catch (error) {
      failed++;
      console.log(
        `ERROR: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await sleep(300);
  }

  console.log();
  console.log(`  Phase 2 Summary:`);
  console.log(`    Embedded:  ${embedded}`);
  console.log(`    Failed:    ${failed}`);
  console.log();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
