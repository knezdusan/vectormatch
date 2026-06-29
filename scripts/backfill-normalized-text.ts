#!/usr/bin/env tsx
// Backfill: Populate normalizedText + NULL rawJson for existing jobs (G7)
// scripts/backfill-normalized-text.ts
//
// CORPUS_EXPANSION_TDD §1.1 — One-time backfill to reclaim storage.
//
// After adding the `normalized_text` column (migration 0016), existing jobs
// still carry `rawJson` (~15KB each) and have `normalizedText = NULL`. This
// script extracts the cleaned fullText from each job's rawJson, writes it to
// `normalizedText` (~3KB), and NULLs `rawJson` — reclaiming ~80% of text
// storage immediately.
//
// MUST be run BEFORE the batch discovery flush (TDD item 20). Otherwise the
// flush inserts 21,500+ jobs with both rawJson + normalizedText, exceeding
// Neon's 512MB limit.
//
// Usage:
//   node --conditions react-server --import tsx scripts/backfill-normalized-text.ts [options]
//
// Note: --conditions react-server is required because the script imports
// modules that use `import "server-only"` (a Next.js marker). Without this
// flag, Node resolves server-only to index.js which throws. The react-server
// condition resolves it to empty.js (a no-op).
//
// Options:
//   --dry-run              Show what would be done without making changes
//   --limit=N              Only process N jobs (for testing)
//   --batch-size=N         Jobs per UPDATE batch (default: 100)
//   --ats=greenhouse       Only process jobs from the specified ATS
//
// Environment (loaded from .env via dotenv):
//   - DATABASE_URL must be set (Neon pooler connection string)
//
// Expected outcome:
//   - All jobs with rawJson have normalizedText populated
//   - rawJson is NULLed for all processed jobs
//   - ~61MB storage reclaimed (4,086 × 15KB → 4,086 × 3KB)

import { config } from "dotenv";
import { eq, isNotNull, isNull, sql } from "drizzle-orm";

// Load environment variables from .env (so `npx tsx` works without --env-file)
config();

// ── Global error handlers ────────────────────────────────────────────────────
// The Neon serverless WebSocket Pool emits 'error' events on connection drops
// that are not caught by try/catch (they're EventEmitter errors, not Promise
// rejections). Without these handlers, Node crashes via
// process.nextTick(() => { throw err; }) after ~100-200 jobs.
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
const batchArg = args.find((a) => a.startsWith("--batch-size="));
const batchSize = batchArg ? Number.parseInt(batchArg.split("=")[1], 10) : 100;
const atsArg = args.find((a) => a.startsWith("--ats="));
const atsFilter = atsArg ? atsArg.split("=")[1] : undefined;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("G7 Backfill: Populate normalizedText + NULL rawJson");
  console.log("=".repeat(70));
  console.log();
  console.log(`  Mode:        ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`  ATS filter:  ${atsFilter ?? "all"}`);
  console.log(`  Limit:       ${limit ?? "none"}`);
  console.log(`  Batch size:  ${batchSize}`);
  console.log();

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");
  const { extractJobContent } = await import("@/lib/jobs/job-normalizer");

  // ── Fetch jobs needing backfill ───────────────────────────────────────────
  // SELECT id, atsSource, title, rawJson FROM job
  // WHERE normalizedText IS NULL AND rawJson IS NOT NULL
  const conditions = [isNull(job.normalizedText), isNotNull(job.rawJson)];
  if (atsFilter) {
    conditions.push(eq(job.atsSource, atsFilter));
  }

  let query = db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      title: job.title,
      rawJson: job.rawJson,
    })
    .from(job)
    .where(sql.join(conditions, sql` AND `));

  // Apply limit if specified
  if (limit) {
    query = query.limit(limit) as typeof query;
  }

  const jobs = await query;

  console.log(`  Found ${jobs.length} jobs to backfill`);
  console.log();

  if (jobs.length === 0) {
    console.log("  Nothing to do — all jobs already have normalizedText.");
    console.log();
    return;
  }

  if (dryRun) {
    console.log("  [DRY RUN] Would process:");
    for (const j of jobs.slice(0, 10)) {
      const { fullText } = extractJobContent(j.atsSource, j.rawJson, j.title);
      console.log(
        `    ${j.id}  ${j.atsSource}  "${j.title}"  →  ${fullText.length} chars`,
      );
    }
    if (jobs.length > 10) {
      console.log(`    ... and ${jobs.length - 10} more`);
    }
    console.log();
    console.log(
      `  [DRY RUN] Would reclaim ~${Math.round((jobs.length * 12) / 1024)}MB`,
    );
    console.log();
    return;
  }

  // ── Process in batches ────────────────────────────────────────────────────
  let processed = 0;
  let failed = 0;
  let totalCharsReclaimed = 0;

  for (let i = 0; i < jobs.length; i += batchSize) {
    const batch = jobs.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(jobs.length / batchSize);
    process.stdout.write(
      `  [Batch ${batchNum}/${totalBatches}] Processing ${batch.length} jobs... `,
    );

    try {
      // Process each job in the batch: extract fullText, update row
      for (const j of batch) {
        try {
          const { fullText } = extractJobContent(
            j.atsSource,
            j.rawJson,
            j.title,
          );

          await db
            .update(job)
            .set({
              normalizedText: fullText,
              rawJson: null,
            })
            .where(eq(job.id, j.id));

          // Track reclaimed storage (rawJson size - normalizedText size)
          totalCharsReclaimed += (j.rawJson?.length ?? 0) - fullText.length;
          processed++;
        } catch (e) {
          console.error(
            `\n    Failed job ${j.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
          failed++;
        }
      }

      console.log(`OK (${processed}/${jobs.length} done, ${failed} failed)`);
    } catch (e) {
      console.log(`BATCH ERROR: ${e instanceof Error ? e.message : String(e)}`);
      failed += batch.length;
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Backfill complete!");
  console.log("=".repeat(70));
  console.log(`  Jobs processed:  ${processed}`);
  console.log(`  Jobs failed:     ${failed}`);
  console.log(
    `  Storage reclaimed: ~${Math.round(totalCharsReclaimed / 1024)}KB`,
  );
  console.log();
  console.log("Next steps:");
  console.log(
    "  1. Verify with: SELECT count(*) FROM job WHERE normalized_text IS NULL AND raw_json IS NOT NULL;",
  );
  console.log("  2. Check Neon storage dashboard — should drop by ~60MB");
  console.log("  3. Proceed to G5 (batchPollTier) — TDD item 4");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
