#!/usr/bin/env tsx
// BigQuery HTTPArchive Seeder — Manual Script
// scripts/seed-bigquery.ts
//
// Usage:
//   npx tsx scripts/seed-bigquery.ts [--date 2024-06-01] [--partitions 3] [--limit 1000]
//
// Queries the HTTPArchive BigQuery dataset for domains running target tech
// stacks that also contain ATS script URLs. Extracts ATS slugs (directly from
// payload or via slug probe) and inserts new companies into the company table.
//
// Multi-partition mode: By default, scans the last 3 monthly partitions to
// catch companies added between crawls. Use --partitions 1 for a single
// partition, or --date to specify an exact date.
//
// Runs monthly per TDD §4.1.1. The Inngest function `bigQuerySeeder` provides
// scheduled execution with automatic multi-partition scanning.
//
// Requires:
//   - DATABASE_URL environment variable (Neon connection string)
//   - GOOGLE_APPLICATION_CREDENTIALS or equivalent GCP auth
//
// See TDD §4.1.1 for the full specification.

import {
  createDefaultBigQueryFn,
  generateCrawlDates,
  runBigQuerySeeder,
} from "@/lib/jobs/seeders/bigquery-seeder";

// ── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(): { dates: string[]; limit?: number } {
  const args = process.argv.slice(2);
  let date: string | undefined;
  let partitions = 3;
  let limit: number | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--date" && args[i + 1]) {
      date = args[i + 1];
      i++;
    } else if (args[i] === "--partitions" && args[i + 1]) {
      partitions = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === "--limit" && args[i + 1]) {
      limit = Number.parseInt(args[i + 1], 10);
      i++;
    }
  }

  // If a specific date is provided, use only that date.
  // Otherwise, generate the last N monthly crawl dates.
  if (date) {
    return { dates: [date], limit };
  }
  return { dates: generateCrawlDates(partitions), limit };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { dates, limit } = parseArgs();

  console.log("=".repeat(60));
  console.log("BigQuery HTTPArchive Seeder — VectorMatch");
  console.log("=".repeat(60));
  console.log(`Crawl dates: ${dates.join(", ")}`);
  if (limit) console.log(`Row limit:   ${limit}`);
  console.log();

  console.log("Creating BigQuery client...");
  const queryFn = await createDefaultBigQueryFn();

  console.log("Running seeder...");
  const result = await runBigQuerySeeder(
    dates,
    queryFn,
    undefined,
    fetch,
    limit,
  );

  console.log();
  console.log("=".repeat(60));
  console.log("Results:");
  console.log("=".repeat(60));
  console.log(`  Domains found:          ${result.domainsFound}`);
  console.log(`  Direct slugs extracted: ${result.directSlugsExtracted}`);
  console.log(`  Slug probes attempted:  ${result.slugProbesAttempted}`);
  console.log(`  Slug probes resolved:   ${result.slugProbesResolved}`);
  console.log(`  Unresolved (discarded): ${result.unresolved}`);
  console.log(`  Companies inserted:     ${result.insertResult.inserted}`);
  console.log(`  Companies skipped:      ${result.insertResult.skipped}`);
  if (result.insertResult.rejected.length > 0) {
    console.log(
      `  Rejected (invalid):     ${result.insertResult.rejected.length}`,
    );
  }
  if (result.error) {
    console.error(`  ERROR: ${result.error}`);
    process.exit(1);
  }
  console.log();
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
