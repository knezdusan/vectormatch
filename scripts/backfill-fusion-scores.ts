#!/usr/bin/env tsx
// Backfill: Populate Q5 fusion scores for direct-insert companies
// scripts/backfill-fusion-scores.ts
//
// Sprint 3 Hardening — Task 10
//
// B7 Wayback CDX and B6 BigQuery insert companies directly via
// `insertDiscoveredCompanies` (not through the Slugger). The Q5 fusion score
// integration is in the Slugger's `finalizeResolution()` function. Companies
// inserted directly never got a `recordDiscoverySource()` call, so their
// `fusion_score` stayed at 1 forever. ~4,163 companies (70% of the corpus)
// from Wayback CDX are affected.
//
// This one-time script:
//   1. Queries all companies where fusion_score = 1 (default, never incremented)
//   2. For each company, checks its `discovery_source` column
//   3. Calls `recordDiscoverySource(companyId, discoverySource)` to populate
//      `company_discovery_sources` and increment `fusion_score` if the source
//      is new
//
// Usage:
//   node --conditions react-server --import tsx scripts/backfill-fusion-scores.ts [options]
//
// Note: --conditions react-server is required because the script imports
// modules that use `import "server-only"` (a Next.js marker). Without this
// flag, Node resolves server-only to index.js which throws. The react-server
// condition resolves it to empty.js (a no-op).
//
// Options:
//   --dry-run              Show what would be done without making changes
//   --limit=N              Only process N companies (for testing)
//   --source=wayback_cdx   Only process companies from a specific discovery source
//
// Environment (loaded from .env via dotenv):
//   - DATABASE_URL must be set (Neon pooler connection string)
//
// Expected outcome:
//   - All companies with fusion_score = 1 get their discovery_source recorded
//     in company_discovery_sources
//   - fusion_score is incremented from 1 to 2 for each backfilled company
//     (the first recordDiscoverySource call records the source and increments)

import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { discoverySourceEnum } from "@/db/schemas/jobs/enums";

// Load environment variables from .env (so `npx tsx` works without --env-file)
config();

// ── Global error handlers ────────────────────────────────────────────────────
// The Neon serverless WebSocket Pool emits 'error' events on connection drops
// that are not caught by try/catch (they're EventEmitter errors, not Promise
// rejections). Without these handlers, Node crashes via
// process.nextTick(() => { throw err; }) after ~100-200 companies.
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

// Type of a discovery source — inferred from the Drizzle enum
type DiscoverySource = (typeof discoverySourceEnum.enumValues)[number];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg
  ? Number.parseInt(limitArg.split("=")[1], 10)
  : undefined;
const sourceArg = args.find((a) => a.startsWith("--source="));
const rawSourceFilter = sourceArg ? sourceArg.split("=")[1] : undefined;

// Validate the source filter against the enum values
const validSources = discoverySourceEnum.enumValues as readonly string[];
const sourceFilter =
  rawSourceFilter && validSources.includes(rawSourceFilter)
    ? (rawSourceFilter as DiscoverySource)
    : undefined;

if (rawSourceFilter && !sourceFilter) {
  console.error(
    `ERROR: Invalid discovery source "${rawSourceFilter}". Valid values: ${validSources.join(", ")}`,
  );
  process.exit(1);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(70));
  console.log("Q5 Fusion Score Backfill: Record discovery sources");
  console.log("=".repeat(70));
  console.log();
  console.log(`  Mode:           ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log(`  Source filter:  ${sourceFilter ?? "all"}`);
  console.log(`  Limit:          ${limit ?? "none"}`);
  console.log();

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set.");
    process.exit(1);
  }

  const { db } = await import("@/db/db");
  const { company } = await import("@/db/schemas/jobs/company");
  const { recordDiscoverySource } = await import(
    "@/lib/jobs/quality/fusion-score"
  );

  // ── Fetch companies needing backfill ──────────────────────────────────────
  // SELECT id, atsSource, atsSlug, companyName, discoverySource
  // FROM company WHERE fusion_score = 1
  // [AND discovery_source = :sourceFilter if provided]
  const conditions = [eq(company.fusionScore, 1)];
  if (sourceFilter) {
    conditions.push(eq(company.discoverySource, sourceFilter));
  }

  const whereClause =
    conditions.length === 1 ? conditions[0] : and(...conditions);

  let query = db
    .select({
      id: company.id,
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
      discoverySource: company.discoverySource,
    })
    .from(company)
    .where(whereClause);

  // Apply limit if specified
  if (limit) {
    query = query.limit(limit) as typeof query;
  }

  const companies = await query;

  console.log(`  Found ${companies.length} companies to backfill`);
  console.log();

  if (companies.length === 0) {
    console.log("  Nothing to do — all companies already have fusion scores.");
    console.log();
    return;
  }

  if (dryRun) {
    console.log("  [DRY RUN] Would record discovery sources for:");
    for (const c of companies.slice(0, 10)) {
      console.log(
        `    ${c.id}  ${c.discoverySource}  ${c.atsSource}/${c.atsSlug}  "${c.companyName ?? "unknown"}"`,
      );
    }
    if (companies.length > 10) {
      console.log(`    ... and ${companies.length - 10} more`);
    }
    console.log();
    console.log(
      `  [DRY RUN] Would call recordDiscoverySource() for ${companies.length} companies`,
    );
    console.log();
    return;
  }

  // ── Process each company ──────────────────────────────────────────────────
  let processed = 0;
  let failed = 0;
  let newSourceCount = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    process.stdout.write(
      `  [${i + 1}/${companies.length}] ${c.atsSource}/${c.atsSlug} (${c.discoverySource})... `,
    );

    try {
      const result = await recordDiscoverySource(c.id, c.discoverySource);
      processed++;
      if (result.isNewSource) {
        newSourceCount++;
        console.log(`OK (new source, fusion_score → ${result.fusionScore})`);
      } else {
        console.log(
          `OK (source already recorded, fusion_score = ${result.fusionScore})`,
        );
      }
    } catch (e) {
      console.error(
        `\n    Failed company ${c.id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      failed++;
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log("Backfill complete!");
  console.log("=".repeat(70));
  console.log(`  Companies processed:  ${processed}`);
  console.log(`  Companies failed:     ${failed}`);
  console.log(`  New sources recorded: ${newSourceCount}`);
  console.log();
  console.log("Next steps:");
  console.log(
    "  1. Verify with: SELECT count(*) FROM company WHERE fusion_score = 1;",
  );
  console.log("  2. Check: SELECT count(*) FROM company_discovery_sources;");
  console.log(
    "  3. Spot-check: SELECT id, ats_slug, discovery_source, fusion_score FROM company WHERE fusion_score > 1 LIMIT 10;",
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
