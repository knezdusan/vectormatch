#!/usr/bin/env tsx
// HN Algolia Seeder Live Run — Layer 2 of Module B Live Testing
// scripts/seed-hn-live.ts
//
// Runs the HN Algolia seeder against the real HN Algolia API and inserts
// discovered companies into a real Neon database (dev branch).
//
// Requires:
//   - DATABASE_URL environment variable (Neon dev branch connection string)
//
// Usage:
//   npx tsx scripts/seed-hn-live.ts
//
// Expected outcome:
//   - 50-200 companies inserted from one "Who is Hiring" thread
//   - Some companies skipped (duplicates within the same thread)
//   - Some custom URLs collected (non-ATS URLs for the resolver)
//   - No errors (unless HN Algolia API is down)
//
// See: docs/vectormatch-blueprint.md → "Module B Testing Strategy" → Layer 2

import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { runHnAlgoliaSeeder } from "@/lib/jobs/seeders/hn-algolia";

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("HN Algolia Seeder Live Run — VectorMatch Module B (Layer 2)");
  console.log("=".repeat(70));
  console.log();
  console.log(
    "Fetching 'Ask HN: Who is hiring' comments from HN Algolia API...",
  );
  console.log("Inserting discovered companies into Neon (DATABASE_URL).");
  console.log();

  // Fetch all pages — the thread has ~500 comments across 10 pages.
  // search_by_date returns newest first (job seeker replies), so we need all
  // pages to reach the actual job postings (oldest comments, from the 1st of the month).
  const startedAt = Date.now();
  const result = await runHnAlgoliaSeeder(fetch);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log("=".repeat(70));
  console.log("Seeder Result");
  console.log("=".repeat(70));
  console.log(`  Comments processed:    ${result.commentsProcessed}`);
  console.log(`  ATS URLs found:        ${result.atsUrlsFound}`);
  console.log(`  Custom URLs found:     ${result.customUrlsFound}`);
  console.log(`  Unique companies:      ${result.uniqueCompanies}`);
  console.log(`  Companies inserted:    ${result.insertResult.inserted}`);
  console.log(
    `  Companies skipped:     ${result.insertResult.skipped} (duplicates)`,
  );
  console.log(
    `  Companies rejected:    ${result.insertResult.rejected.length} (invalid)`,
  );
  console.log(
    `  Custom URLs queued:    ${result.customUrls.length} (for resolver)`,
  );
  console.log(`  Elapsed:               ${elapsed}s`);
  if (result.error) {
    console.log(`  ERROR:                 ${result.error}`);
  }
  console.log();

  // Show first 10 custom URLs
  if (result.customUrls.length > 0) {
    console.log("First 10 custom URLs (queued for resolution):");
    for (const url of result.customUrls.slice(0, 10)) {
      console.log(`  └ ${url}`);
    }
    console.log();
  }

  // ── Verify DB insertion ────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("Database Verification");
  console.log("=".repeat(70));

  const companies = await db.select().from(company).limit(20);
  console.log(`  Companies in DB (first 20): ${companies.length}`);
  for (const c of companies) {
    console.log(
      `    └ [${c.atsSource}] ${c.atsSlug.padEnd(25)} discovered via ${c.discoverySource}`,
    );
  }
  console.log();

  // Count total
  const allCompanies = await db.select({ id: company.id }).from(company);
  console.log(`  Total companies in DB: ${allCompanies.length}`);
  console.log();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log("=".repeat(70));
  console.log("Summary");
  console.log("=".repeat(70));
  console.log(
    `  Inserted ${result.insertResult.inserted} companies, ` +
      `${result.insertResult.skipped} skipped (duplicates), ` +
      `${result.customUrls.length} custom URLs queued for resolution`,
  );
  console.log();

  if (result.error) {
    console.log("FAILED — seeder encountered an error.");
    process.exit(1);
  }

  if (result.insertResult.inserted === 0 && result.insertResult.skipped === 0) {
    console.log(
      "WARNING — no companies inserted or skipped. Check if the HN API returned data.",
    );
    process.exit(1);
  }

  console.log(
    "PASSED — HN seeder ran successfully against real API + real DB.",
  );
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
