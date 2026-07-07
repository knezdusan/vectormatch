#!/usr/bin/env npx tsx
/**
 * P1-1: Employee Count Backfill — One-Time Script
 *
 * Populates company.employee_count and company.is_public for the 10,096
 * companies where employee_count is currently NULL (100% of the corpus).
 *
 * Three-phase approach:
 *   Phase 1: Big-tech registry match — for companies whose ats_slug matches
 *            a registry entry's canonicalName, set emp + is_public from the
 *            registry (e.g. "databricks" → emp=7000, "amazon" → emp=1525000).
 *   Phase 2: YC/VC-funded heuristics — for companies discovered via
 *            yc_directory, github_probe, or funding_signal, set emp=30
 *            (YC median batch company size is 15-30 people → 20-49 bucket
 *            → +15 score → promotes to active_hot with sourceOrigin +15).
 *   Phase 3: VC portfolio heuristic — for companies discovered via
 *            vc_portfolio, set emp=100 (50-250 bucket → 0 score → stays
 *            at active with sourceOrigin +15 = raw 15).
 *
 * Only updates companies where employee_count IS NULL — never overwrites
 * an existing value.
 *
 * Usage:
 *   # Dry-run (default): prints proposed updates, writes NOTHING
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-employee-count.ts
 *
 *   # Apply: persists employee_count + is_public
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-employee-count.ts --apply
 *
 * Flags:
 *   --dry-run       Preview only, no DB writes (DEFAULT)
 *   --apply         Persist employee_count + is_public
 *   --limit N       Max companies per phase (default: all)
 *
 * After this script, re-run P0-1 (backfill-company-scores.ts) to recompute
 * scores with the new employee count data.
 */

import { config } from "dotenv";

config({ path: ".env" });

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { BIG_TECH_BY_NAME } from "@/lib/jobs/company-enrichment/big-tech-registry";

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let dryRun = true;
let apply = false;
let limit = 0;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry-run") {
    dryRun = true;
    apply = false;
  } else if (a === "--apply") {
    dryRun = false;
    apply = true;
  } else if (a === "--limit" && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
    i++;
  } else {
    console.error(`Unknown argument: ${a}`);
    console.error(
      "Usage: npx tsx scripts/backfill-employee-count.ts [--dry-run|--apply] [--limit N]",
    );
    process.exit(1);
  }
}

// ── Heuristic estimates ─────────────────────────────────────────────────────
// YC companies: median batch company size is 15-30 people. emp=30 → 20-49
// bucket → +15 score → active_hot with sourceOrigin +15 (raw 30).
const YC_ESTIMATE = 30;
// VC portfolio companies: range widely, typically 50-500. emp=100 → 50-250
// bucket → 0 score → active with sourceOrigin +15 (raw 15).
const VC_ESTIMATE = 100;

const YC_SOURCES = ["yc_directory", "github_probe", "funding_signal"] as const;

const SEP = "=".repeat(70);
console.log(`\n${SEP}`);
console.log("P1-1: Employee Count Backfill");
console.log(SEP);
console.log(
  `Mode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY (persisting emp + is_public)"}`,
);
console.log(`Limit: ${limit === 0 ? "ALL" : limit} per phase`);
console.log(
  `YC estimate: emp=${YC_ESTIMATE} (sources: ${YC_SOURCES.join(", ")})`,
);
console.log(`VC estimate: emp=${VC_ESTIMATE} (source: vc_portfolio)`);
console.log();

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  let totalUpdated = 0;
  const phaseResults: { phase: string; matched: number; sample: string[] }[] =
    [];

  // ── Phase 1: Big-tech registry match by ats_slug ──────────────────────────
  console.log("Phase 1: Big-tech registry match (by ats_slug)...");
  let phase1Matched = 0;
  const phase1Samples: string[] = [];

  // Collect all registry slugs (canonicalName values that might match ats_slug)
  const registrySlugs = Array.from(BIG_TECH_BY_NAME.keys());

  // Query companies whose ats_slug matches a registry entry AND emp IS NULL
  // Process in batches to avoid huge IN clauses
  const BATCH_SIZE = 100;
  for (let i = 0; i < registrySlugs.length; i += BATCH_SIZE) {
    const batch = registrySlugs.slice(i, i + BATCH_SIZE);
    const matches = await db
      .select({
        id: company.id,
        atsSlug: company.atsSlug,
        companyName: company.companyName,
        discoverySource: company.discoverySource,
        tier: company.tier,
      })
      .from(company)
      .where(
        and(isNull(company.employeeCount), inArray(company.atsSlug, batch)),
      );

    for (const m of matches) {
      const entry = BIG_TECH_BY_NAME.get(m.atsSlug);
      if (!entry) continue;

      phase1Matched++;
      if (phase1Samples.length < 15) {
        phase1Samples.push(
          `  ${m.atsSlug.padEnd(28)} emp=${String(entry.employeeCount).padStart(8)} pub=${entry.isPublic} tier=${m.tier}`,
        );
      }

      if (apply) {
        await db
          .update(company)
          .set({
            employeeCount: entry.employeeCount,
            isPublic: entry.isPublic,
          })
          .where(eq(company.id, m.id));
      }
    }
  }

  console.log(`  Matched: ${phase1Matched} companies`);
  if (phase1Samples.length > 0) {
    console.log("  Samples:");
    for (const s of phase1Samples) console.log(s);
  }
  console.log();
  totalUpdated += phase1Matched;
  phaseResults.push({
    phase: "Registry match",
    matched: phase1Matched,
    sample: phase1Samples,
  });

  // ── Phase 2: YC/github_probe/funding_signal heuristic ─────────────────────
  console.log(`Phase 2: YC/funding-signal heuristic (emp=${YC_ESTIMATE})...`);
  const phase2Query = db
    .select({
      id: company.id,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
      discoverySource: company.discoverySource,
      tier: company.tier,
    })
    .from(company)
    .where(
      and(
        isNull(company.employeeCount),
        inArray(company.discoverySource, [...YC_SOURCES]),
      ),
    );

  const phase2Rows =
    limit > 0 ? await phase2Query.limit(limit) : await phase2Query;
  let phase2Matched = 0;
  const phase2Samples: string[] = [];

  for (const r of phase2Rows) {
    phase2Matched++;
    if (phase2Samples.length < 15) {
      phase2Samples.push(
        `  ${r.atsSlug.padEnd(28)} src=${r.discoverySource.padEnd(14)} tier=${r.tier}`,
      );
    }
    if (apply) {
      await db
        .update(company)
        .set({ employeeCount: YC_ESTIMATE })
        .where(eq(company.id, r.id));
    }
  }

  console.log(`  Matched: ${phase2Matched} companies`);
  if (phase2Samples.length > 0) {
    console.log("  Samples:");
    for (const s of phase2Samples) console.log(s);
  }
  console.log();
  totalUpdated += phase2Matched;
  phaseResults.push({
    phase: "YC/funding heuristic",
    matched: phase2Matched,
    sample: phase2Samples,
  });

  // ── Phase 3: VC portfolio heuristic ───────────────────────────────────────
  console.log(`Phase 3: VC portfolio heuristic (emp=${VC_ESTIMATE})...`);
  const phase3Query = db
    .select({
      id: company.id,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
      discoverySource: company.discoverySource,
      tier: company.tier,
    })
    .from(company)
    .where(
      and(
        isNull(company.employeeCount),
        eq(company.discoverySource, "vc_portfolio"),
      ),
    );

  const phase3Rows =
    limit > 0 ? await phase3Query.limit(limit) : await phase3Query;
  let phase3Matched = 0;
  const phase3Samples: string[] = [];

  for (const r of phase3Rows) {
    phase3Matched++;
    if (phase3Samples.length < 15) {
      phase3Samples.push(
        `  ${r.atsSlug.padEnd(28)} src=${r.discoverySource.padEnd(14)} tier=${r.tier}`,
      );
    }
    if (apply) {
      await db
        .update(company)
        .set({ employeeCount: VC_ESTIMATE })
        .where(eq(company.id, r.id));
    }
  }

  console.log(`  Matched: ${phase3Matched} companies`);
  if (phase3Samples.length > 0) {
    console.log("  Samples:");
    for (const s of phase3Samples) console.log(s);
  }
  console.log();
  totalUpdated += phase3Matched;
  phaseResults.push({
    phase: "VC portfolio heuristic",
    matched: phase3Matched,
    sample: phase3Samples,
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(SEP);
  console.log(`${dryRun ? "DRY-RUN PREVIEW" : "APPLY COMPLETE"}`);
  console.log(`  Phase 1 (registry match):     ${phase1Matched} companies`);
  console.log(`  Phase 2 (YC/funding signal):  ${phase2Matched} companies`);
  console.log(`  Phase 3 (VC portfolio):       ${phase3Matched} companies`);
  console.log(`  Total:                        ${totalUpdated} companies`);
  console.log();

  // How many companies remain with NULL employee_count
  const remaining = await db
    .select({ cnt: sql<number>`count(*)` })
    .from(company)
    .where(isNull(company.employeeCount));
  console.log(
    `Companies with NULL employee_count remaining: ${remaining[0].cnt}`,
  );
  console.log(
    `(These are companies not in the registry and not from YC/VC sources —)`,
  );
  console.log(`(they'll get emp=0 in the scorer (graceful degradation).)`);
  console.log();

  if (dryRun) {
    console.log("DRY-RUN: no database writes were made.");
    console.log("To apply, re-run with --apply");
  } else {
    console.log("APPLY: employee_count + is_public persisted.");
    console.log(
      "Next: re-run backfill-company-scores.ts --apply to recompute scores.",
    );
  }
  console.log(`${SEP}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
