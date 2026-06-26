#!/usr/bin/env tsx
// Backfill: Re-poll, Re-normalize, and Re-embed all jobs
// scripts/backfill-normalize.ts
//
// Fixes the data gaps identified after Phase 1-5 of the ATS pipeline overhaul:
//
//   1. Greenhouse jobs had no `content` field (missing `?content=true` param).
//      Now fixed, but rawJson needs to be refreshed from the ATS API.
//   2. Metadata columns (workplace_type, employment_type, etc.) are NULL for
//      all 3,078 existing jobs. They need to be extracted from rawJson.
//   3. 1,336 active jobs have no embedding (44% of active jobs). They're
//      invisible to Gate 2 (cosine similarity).
//   4. Tags were extracted from title-only text for Greenhouse jobs. Now that
//      descriptions are available, tags should be re-extracted.
//
// This script does NOT clear match_queue. After running this script, use
// `rerun-gates.ts` to rebuild match_queue with the new tags, embeddings, and
// workplace type filter. Existing match_queue rows are preserved by
// ON CONFLICT DO NOTHING.
//
// Steps:
//   1. Re-poll all companies (refreshes rawJson + populates metadata columns)
//   2. Re-normalize all active jobs (re-extracts tags from new rawJson)
//   3. Re-embed all active jobs (generates new embeddings from richer text)
//
// Usage:
//   node --conditions react-server --import tsx scripts/backfill-normalize.ts [options]
//
// Note: --conditions react-server is required because the script imports
// modules that use `import "server-only"` (a Next.js marker). Without this
// flag, Node resolves server-only to index.js which throws. The react-server
// condition resolves it to empty.js (a no-op).
//
// Options:
//   --ats=greenhouse       Only process jobs from the specified ATS
//   --skip-poll            Skip step 1 (re-polling). Use if you've already
//                          re-polled manually or want to wait for the next
//                          poll cycle.
//   --skip-normalize       Skip step 2 (re-normalization)
//   --dry-run              Show what would be done without making changes
//   --limit=N              Only process N jobs (for testing)
//   --resume               Skip jobs that already have embedding + tags
//                          (use to resume after a crash)
//
// Environment (loaded from .env via --env-file):
//   - DATABASE_URL must be set (Neon pooler connection string)
//   - OPENAI_API_KEY must be set (for embeddings + LLM tag extraction)
//
// Expected outcome:
//   - All jobs have refreshed rawJson (especially Greenhouse with content)
//   - All jobs have populated metadata columns (workplace_type, etc.)
//   - All active jobs have embeddings
//   - All active jobs have tags extracted from full text (not just title)
//
// After this script completes, run:
//   INNGEST_EVENT_KEY=<key> npx tsx scripts/rerun-gates.ts

import { config } from "dotenv";
import { sql } from "drizzle-orm";

// Load environment variables from .env (so `npx tsx` works without --env-file)
config();

// ── Global error handlers ────────────────────────────────────────────────────
// The Neon serverless WebSocket Pool emits 'error' events on connection drops
// that are not caught by try/catch (they're EventEmitter errors, not Promise
// rejections). Without these handlers, Node crashes via
// process.nextTick(() => { throw err; }) after ~100-200 jobs.
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message);
  // Don't re-throw — let the retry logic handle transient connection drops
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
const skipPoll = args.includes("--skip-poll");
const skipNormalize = args.includes("--skip-normalize");
const resume = args.includes("--resume"); // Skip jobs that already have embedding + tags
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg
  ? Number.parseInt(limitArg.split("=")[1], 10)
  : undefined;
const atsArg = args.find((a) => a.startsWith("--ats="));
const atsFilter = atsArg ? atsArg.split("=")[1] : undefined;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("Backfill: Re-poll, Re-normalize, Re-embed all jobs");
  console.log("=".repeat(70));
  console.log();
  console.log(`  Mode:           ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`  ATS filter:     ${atsFilter ?? "all"}`);
  console.log(`  Limit:          ${limit ?? "none"}`);
  console.log(`  Skip poll:      ${skipPoll}`);
  console.log(`  Skip normalize: ${skipNormalize}`);
  console.log(`  Resume:        ${resume}`);
  console.log();

  // Validate environment
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!skipNormalize && !process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY is not set (needed for embeddings).");
    process.exit(1);
  }

  // ── Step 1: Re-poll all companies ──────────────────────────────────────────
  if (!skipPoll) {
    await repollCompanies(atsFilter, dryRun);
  } else {
    console.log("Step 1: SKIPPED (--skip-poll)");
    console.log();
  }

  // ── Step 2: Re-normalize + re-embed all active jobs ────────────────────────
  if (!skipNormalize) {
    await renormalizeJobs(atsFilter, limit, dryRun, resume);
  } else {
    console.log("Step 2: SKIPPED (--skip-normalize)");
    console.log();
  }

  console.log("=".repeat(70));
  console.log("Backfill complete!");
  console.log("=".repeat(70));
  if (!skipNormalize) {
    console.log();
    console.log("Next step: Re-run Gate 1+2 to rebuild match_queue:");
    console.log("  INNGEST_EVENT_KEY=<key> npx tsx scripts/rerun-gates.ts");
  }
}

// ── Step 1: Re-poll all companies ────────────────────────────────────────────

async function repollCompanies(
  atsFilter: string | undefined,
  dryRun: boolean,
): Promise<void> {
  console.log("=".repeat(70));
  console.log("Step 1: Re-polling all companies to refresh rawJson");
  console.log("=".repeat(70));
  console.log();

  const { db } = await import("@/db/db");
  const { company } = await import("@/db/schemas/jobs/company");

  // Fetch all non-dead companies (optionally filtered by ATS source)
  const conditions = [sql`${company.tier} != 'dead'`];
  if (atsFilter) {
    conditions.push(sql`${company.atsSource} = ${atsFilter}`);
  }

  const companies = await db
    .select({
      id: company.id,
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
      tier: company.tier,
    })
    .from(company)
    .where(sql.join(conditions, sql` AND `));

  console.log(`  Found ${companies.length} companies to re-poll`);
  console.log();

  if (dryRun) {
    console.log("  [DRY RUN] Would poll:");
    for (const c of companies.slice(0, 10)) {
      console.log(
        `    ${c.atsSource}/${c.atsSlug} (${c.companyName ?? "unknown"})`,
      );
    }
    if (companies.length > 10) {
      console.log(`    ... and ${companies.length - 10} more`);
    }
    console.log();
    return;
  }

  const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");

  let success = 0;
  let failed = 0;
  let totalJobs = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    process.stdout.write(
      `  [${i + 1}/${companies.length}] ${c.atsSource}/${c.atsSlug}... `,
    );

    try {
      const result = await pollCompany(c.id, c.atsSource, c.atsSlug, fetch);
      if (result.error) {
        console.log(`FAILED: ${result.error}`);
        failed++;
      } else {
        console.log(
          `OK (${result.jobsFetched} fetched, ${result.jobsUpserted} upserted)`,
        );
        success++;
        totalJobs += result.jobsUpserted;
      }
    } catch (err) {
      console.log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }

    // Small delay to avoid hammering the ATS APIs
    await sleep(200);
  }

  console.log();
  console.log(`  Re-poll summary: ${success} succeeded, ${failed} failed`);
  console.log(`  Total jobs upserted: ${totalJobs}`);
  console.log();
}

// ── Step 2: Re-normalize + re-embed all active jobs ──────────────────────────

async function renormalizeJobs(
  atsFilter: string | undefined,
  limit: number | undefined,
  dryRun: boolean,
  resume: boolean,
): Promise<void> {
  console.log("=".repeat(70));
  console.log("Step 2: Re-normalizing + re-embedding all active jobs");
  console.log("=".repeat(70));
  console.log();

  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");

  // Fetch all active jobs (optionally filtered by ATS source)
  // With --resume: skip jobs that already have both embedding AND tags
  // (they were already processed in a prior run)
  const conditions = [sql`${job.status} = 'active'`];
  if (atsFilter) {
    conditions.push(sql`${job.atsSource} = ${atsFilter}`);
  }
  if (resume) {
    conditions.push(
      sql`(${job.jobEmbedding} IS NULL OR ${job.extractedTags} IS NULL OR array_length(${job.extractedTags}, 1) IS NULL)`,
    );
  }

  let query = db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      title: job.title,
      rawJson: job.rawJson,
      extractedTags: job.extractedTags,
      jobEmbedding: job.jobEmbedding,
    })
    .from(job)
    .where(sql.join(conditions, sql` AND `))
    .$dynamic();

  if (limit) {
    query = query.limit(limit);
  }

  const jobs = await query;

  console.log(`  Found ${jobs.length} active jobs to re-normalize`);
  console.log();

  if (dryRun) {
    console.log("  [DRY RUN] Would re-normalize:");
    const byAts = new Map<string, number>();
    for (const j of jobs) {
      byAts.set(j.atsSource, (byAts.get(j.atsSource) ?? 0) + 1);
    }
    for (const [ats, count] of byAts) {
      console.log(`    ${ats}: ${count} jobs`);
    }
    console.log();
    return;
  }

  const { normalizeJob, extractJobMetadata } = await import(
    "@/lib/jobs/job-normalizer"
  );
  const { embedJob } = await import("@/lib/jobs/job-embedder");
  const { eq } = await import("drizzle-orm");

  let normalized = 0;
  let rejected = 0;
  let failed = 0;
  let embedded = 0;

  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const progress = `[${i + 1}/${jobs.length}]`;

    try {
      // Step 2a: Extract metadata from rawJson (populates new columns)
      const metadata = extractJobMetadata(j.atsSource, j.rawJson);

      // Step 2b: Re-normalize (extract tags from full text)
      const result = await withRetry(() =>
        normalizeJob(j.atsSource, j.rawJson, j.title),
      );

      if (result.status === "normalization_failed") {
        console.log(
          `  ${progress} ${j.atsSource}/${j.title.substring(0, 40)} — FAILED: ${result.error}`,
        );
        failed++;
        continue;
      }

      // Step 2c: Re-embed (generate new embedding from full text)
      let embedding: number[] | null = null;
      if (result.status === "normalized") {
        embedding = await withRetry(() => embedJob(result.fullText));
        embedded++;
      }

      // Step 2d: Write results to DB
      const updateData: Record<string, unknown> = {
        extractedTags: result.tags,
        normalizedAt: new Date(),
        // Update metadata columns from the refreshed rawJson
        workplaceType: metadata.workplaceType,
        employmentType: metadata.employmentType,
        locationName: metadata.locationName,
        department: metadata.department,
        team: metadata.team,
        applyUrl: metadata.applyUrl,
        publishedAt: metadata.publishedAt,
        companyName: metadata.companyName,
      };

      if (result.status === "rejected") {
        updateData.status = "rejected";
        rejected++;
      } else {
        updateData.status = "active";
        updateData.jobEmbedding = embedding;
        normalized++;
      }

      await withRetry(() =>
        db.update(job).set(updateData).where(eq(job.id, j.id)),
      );

      // Log progress (compact — only show first 40 chars of title)
      const titleShort = j.title.substring(0, 40).padEnd(40);
      const tagsCount = result.tags.length;
      const embStatus = embedding ? "✓" : "—";
      const status =
        result.status === "normalized"
          ? "OK"
          : result.status === "rejected"
            ? "REJ"
            : "FAIL";
      console.log(
        `  ${progress} ${j.atsSource} ${titleShort} [${status}] tags=${tagsCount} emb=${embStatus}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(
        `  ${progress} ${j.atsSource}/${j.title.substring(0, 40)} — ERROR: ${msg}`,
      );
      failed++;
    }
  }

  console.log();
  console.log("  Re-normalize summary:");
  console.log(`    Normalized:  ${normalized}`);
  console.log(`    Rejected:    ${rejected}`);
  console.log(`    Failed:      ${failed}`);
  console.log(`    Embedded:    ${embedded}`);
  console.log();
}

// ── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry wrapper for async operations that may fail due to transient
 * connection drops (Neon WebSocket Pool, OpenAI API rate limits, etc.).
 *
 * - Waits `delay` ms between retries, with exponential backoff
 * - After `maxRetries` attempts, throws the last error
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const wait = delay * 2 ** attempt;
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `    [retry ${attempt + 1}/${maxRetries}] ${msg} — waiting ${wait}ms`,
        );
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
