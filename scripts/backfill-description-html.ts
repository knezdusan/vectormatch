#!/usr/bin/env tsx
// Backfill: Populate descriptionHtml for existing jobs using only on-hand data.
// scripts/backfill-description-html.ts
//
// One-time rollup sprint that derives `descriptionHtml` for every row where it
// is NULL. The script uses the `formatDescriptionHtml` heuristic parser:
//
//   1. If `rawJson` is present, it extracts structured text/HTML from JSON-LD
//      and the known ATS shapes (Greenhouse, Lever, Ashby, SmartRecruiters,
//      Workable, Recruitee).
//   2. If `rawJson` is gone, it reformats `normalizedText` with header, list,
//      and sentence-boundary heuristics.
//
// No external ATS calls are made, so it does not touch rate limits or live
// postings. The script runs in idempotent batches and only writes rows where a
// non-empty HTML description is produced.
//
// Usage:
//   node --conditions react-server --import tsx scripts/backfill-description-html.ts [options]
//
// Options:
//   --dry-run              Show what would be written without updating the DB
//   --limit=N              Stop after N jobs
//   --batch-size=N         Jobs per query batch (default: 100)
//   --ats=greenhouse       Only process jobs from the specified ATS
//
// Environment (loaded from .env via dotenv):
//   - DATABASE_URL must be set

import { config } from "dotenv";
import { and, eq, gt, isNotNull, isNull, or } from "drizzle-orm";

config();

process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err.message);
});
process.on("unhandledRejection", (err) => {
  console.error(
    "[unhandledRejection]",
    err instanceof Error ? err.message : String(err),
  );
});

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

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("descriptionHtml backfill");
  console.log("=".repeat(70));
  console.log();
  console.log(`  Mode:       ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`  ATS filter: ${atsFilter ?? "all"}`);
  console.log(`  Limit:      ${limit ?? "none"}`);
  console.log(`  Batch size: ${batchSize}`);
  console.log();

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");
  const { formatDescriptionHtml } = await import(
    "@/lib/jobs/description-formatter"
  );

  const conditions = [
    isNull(job.descriptionHtml),
    or(isNotNull(job.rawJson), isNotNull(job.normalizedText)),
  ];
  if (atsFilter) {
    conditions.push(eq(job.atsSource, atsFilter));
  }

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let lastId: string | null = null;
  let batchNumber = 0;

  while (true) {
    if (limit !== undefined && processed >= limit) {
      console.log(`  Reached --limit=${limit}; stopping.`);
      break;
    }

    const cursorCondition = lastId ? gt(job.id, lastId) : undefined;
    const currentLimit =
      limit !== undefined ? Math.min(batchSize, limit - processed) : batchSize;

    const rows = await db
      .select({
        id: job.id,
        atsSource: job.atsSource,
        rawJson: job.rawJson,
        normalizedText: job.normalizedText,
      })
      .from(job)
      .where(and(...conditions, cursorCondition))
      .orderBy(job.id)
      .limit(currentLimit);

    if (rows.length === 0) break;

    batchNumber++;
    process.stdout.write(
      `  [Batch ${batchNumber}] Processing ${rows.length} jobs... `,
    );

    for (const row of rows) {
      try {
        const html = formatDescriptionHtml({
          rawJson: row.rawJson,
          normalizedText: row.normalizedText,
          atsSource: row.atsSource,
        });

        if (html && !dryRun) {
          await db
            .update(job)
            .set({ descriptionHtml: html })
            .where(eq(job.id, row.id));
          updated++;
        } else if (html && dryRun) {
          updated++;
        } else {
          skipped++;
        }

        processed++;
        lastId = row.id;
      } catch (e) {
        console.error(
          `\n    Failed job ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
        failed++;
      }
    }

    console.log(
      `OK (processed ${processed}, updated ${updated}, skipped ${skipped}, failed ${failed})`,
    );
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Backfill complete!");
  console.log("=".repeat(70));
  console.log(`  Jobs processed: ${processed}`);
  console.log(`  Rows updated:   ${updated}`);
  console.log(`  Rows skipped:   ${skipped}`);
  console.log(`  Failures:       ${failed}`);
  console.log();
  console.log("Verification:");
  console.log(
    "  SELECT count(*) FROM job WHERE description_html IS NULL AND (raw_json IS NOT NULL OR normalized_text IS NOT NULL);",
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
