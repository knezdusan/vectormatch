#!/usr/bin/env npx tsx
/**
 * P0-1: Company Scorer Backfill — One-Time Script
 *
 * Runs the v2 company scoring matrix (src/lib/jobs/company-scorer.ts) against
 * every company in the `company` table and persists the result:
 *   - UPSERT company_quality_score.company_size_score
 *   - UPDATE company.tier (active_hot / dormant / dead per the matrix)
 *
 * The scoring code was implemented in commit 15b3b6b but never activated —
 * company_size_score is NULL for all rows. This script closes that gap.
 *
 * Usage:
 *   # Dry-run (default): prints proposed changes, writes NOTHING
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-company-scores.ts
 *
 *   # Dry-run with custom limits
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-company-scores.ts --limit 100
 *
 *   # Apply: persists scores + updates tiers
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-company-scores.ts --apply
 *
 *   # Apply with custom concurrency
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-company-scores.ts --apply --concurrency 50
 *
 * Flags:
 *   --dry-run       Preview only, no DB writes (DEFAULT)
 *   --apply         Persist scores + update tiers
 *   --limit N       Max companies to process (default: all)
 *   --concurrency N Concurrent workers (default: 25; each company = 2 DB writes)
 *
 * What this script does per company:
 *   1. Load company row (id, canonical_name, ats_slug, company_name, employee_count,
 *      is_agency, is_public, discovery_source, discovered_at, tier)
 *   2. buildScoringInputFromCompany(row) → CompanyScoringInput
 *   3. computeCompanySizeScore(input) → { rawScore, companySizeScore, recommendedTier, ... }
 *   4. (dry-run) record proposed tier transition + score
 *      (apply)    scoreAndPersistCompany(input) → UPSERT score + UPDATE tier
 *
 * Verification SQL (after --apply):
 *   SELECT COUNT(*) FILTER (WHERE company_size_score IS NOT NULL) AS scored,
 *          AVG(company_size_score) AS avg_score,
 *          MIN(company_size_score) AS min_score,
 *          MAX(company_size_score) AS max_score
 *   FROM company_quality_score;
 *
 *   SELECT tier, COUNT(*) AS cnt FROM company GROUP BY tier ORDER BY cnt DESC;
 */

import { config } from "dotenv";

config({ path: ".env" });

import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import {
  buildScoringInputFromCompany,
  type CompanyScoreResult,
  computeCompanySizeScore,
  scoreAndPersistCompany,
} from "@/lib/jobs/company-scorer";

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let dryRun = true;
let apply = false;
let limit = 0; // 0 = all
let concurrency = 25;

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
  } else if (a === "--concurrency" && args[i + 1]) {
    concurrency = parseInt(args[i + 1], 10);
    i++;
  } else {
    console.error(`Unknown argument: ${a}`);
    console.error(
      "Usage: npx tsx scripts/backfill-company-scores.ts [--dry-run|--apply] [--limit N] [--concurrency N]",
    );
    process.exit(1);
  }
}

const SEP = "=".repeat(70);
console.log(`\n${SEP}`);
console.log("P0-1: Company Scorer Backfill");
console.log(SEP);
console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
console.log(`Limit: ${limit === 0 ? "ALL" : limit}`);
console.log(`Concurrency: ${concurrency} workers`);
console.log();

// Named companies the audit flagged as "should be demoted to dormant".
// We surface their transitions explicitly in both dry-run and apply output.
const DEFENSE_INFRA_SLUGS = new Set([
  "andurilindustries",
  "databricks",
  "anthropic",
  "zscaler",
  "datadog",
  "nebius",
  "coreweave",
  "trueanomalyinc",
  "tenstorrent",
  "samsara",
]);

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // Load every company with the fields buildScoringInputFromCompany needs,
  // plus the current tier so we can report transitions.
  const _query = db
    .select({
      id: company.id,
      canonicalName: company.canonicalName,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
      employeeCount: company.employeeCount,
      isAgency: company.isAgency,
      isPublic: company.isPublic,
      discoverySource: company.discoverySource,
      discoveredAt: company.discoveredAt,
      tier: company.tier,
    })
    .from(company)
    .orderBy(company.discoveredAt) as unknown as { limit?: (n: number) => any };

  // drizzle's select().from().orderBy() returns a query builder that supports
  // .limit(). The cast above is just to satisfy TS for the conditional .limit().
  let rows: Array<{
    id: string;
    canonicalName: string | null;
    atsSlug: string;
    companyName: string | null;
    employeeCount: number | null;
    isAgency: boolean;
    isPublic: boolean;
    discoverySource: any;
    discoveredAt: Date;
    tier: string;
  }>;

  if (limit > 0) {
    rows = (await db
      .select({
        id: company.id,
        canonicalName: company.canonicalName,
        atsSlug: company.atsSlug,
        companyName: company.companyName,
        employeeCount: company.employeeCount,
        isAgency: company.isAgency,
        isPublic: company.isPublic,
        discoverySource: company.discoverySource,
        discoveredAt: company.discoveredAt,
        tier: company.tier,
      })
      .from(company)
      .orderBy(company.discoveredAt)
      .limit(limit)) as any;
  } else {
    rows = (await db
      .select({
        id: company.id,
        canonicalName: company.canonicalName,
        atsSlug: company.atsSlug,
        companyName: company.companyName,
        employeeCount: company.employeeCount,
        isAgency: company.isAgency,
        isPublic: company.isPublic,
        discoverySource: company.discoverySource,
        discoveredAt: company.discoveredAt,
        tier: company.tier,
      })
      .from(company)
      .orderBy(company.discoveredAt)) as any;
  }

  console.log(`Found ${rows.length} companies to score.\n`);

  if (rows.length === 0) {
    console.log("No companies to score. Exiting.");
    process.exit(0);
  }

  // ── Tally ────────────────────────────────────────────────────────────────
  type Transition = {
    atsSlug: string;
    companyName: string | null;
    fromTier: string;
    toTier: string;
    rawScore: number;
    companySizeScore: number;
    signals: CompanyScoreResult["signals"];
  };

  const transitions: Transition[] = [];
  const tierCounts: Record<string, number> = {}; // post-scoring tier counts
  const tierTransitions: Record<string, number> = {}; // "active_hot->dormant" -> count
  let scored = 0;
  let failed = 0;
  const errors: string[] = [];
  const startTime = Date.now();

  // Score distribution buckets (by rawScore, since companySizeScore is clamped)
  const scoreBuckets: Record<string, number> = {
    "raw >= +30 (clamped +0.30)": 0,
    "raw +15..+29 (active_hot)": 0,
    "raw -19..+14 (active)": 0,
    "raw -29..-20 (dormant)": 0,
    "raw <= -30 (clamped -0.30)": 0,
  };

  function bucketFor(rawScore: number): string {
    if (rawScore >= 30) return "raw >= +30 (clamped +0.30)";
    if (rawScore >= 15) return "raw +15..+29 (active_hot)";
    if (rawScore >= -19) return "raw -19..+14 (active)";
    if (rawScore >= -20) return "raw -29..-20 (dormant)"; // rawScore < -19 && >= -20
    // rawScore < -20
    if (rawScore <= -30) return "raw <= -30 (clamped -0.30)";
    return "raw -29..-20 (dormant)";
  }

  async function processCompany(row: (typeof rows)[0]): Promise<void> {
    try {
      const input = buildScoringInputFromCompany({
        id: row.id,
        canonicalName: row.canonicalName,
        atsSlug: row.atsSlug,
        companyName: row.companyName,
        employeeCount: row.employeeCount,
        isAgency: row.isAgency,
        isPublic: row.isPublic,
        discoverySource: row.discoverySource,
        discoveredAt: row.discoveredAt,
      });

      const result = computeCompanySizeScore(input);

      // Track the effective target tier (applyCompanyTier applies all non-dead
      // tiers: active_hot, active, dormant).
      let effectiveTier = row.tier;
      if (result.shouldBeDead) {
        effectiveTier = "dead";
      } else if (
        (result.recommendedTier === "active_hot" ||
          result.recommendedTier === "active" ||
          result.recommendedTier === "dormant") &&
        row.tier !== "dead"
      ) {
        effectiveTier = result.recommendedTier;
      }

      tierCounts[effectiveTier] = (tierCounts[effectiveTier] ?? 0) + 1;
      scoreBuckets[bucketFor(result.rawScore)] =
        (scoreBuckets[bucketFor(result.rawScore)] ?? 0) + 1;

      if (effectiveTier !== row.tier) {
        const key = `${row.tier}->${effectiveTier}`;
        tierTransitions[key] = (tierTransitions[key] ?? 0) + 1;
        transitions.push({
          atsSlug: row.atsSlug,
          companyName: row.companyName,
          fromTier: row.tier,
          toTier: effectiveTier,
          rawScore: result.rawScore,
          companySizeScore: result.companySizeScore,
          signals: result.signals,
        });
      }

      if (apply) {
        await scoreAndPersistCompany(input);
      }

      scored++;
      if (scored % 200 === 0 || scored === rows.length) {
        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const rate = ((scored / (Date.now() - startTime)) * 1000).toFixed(1);
        console.log(
          `[${scored}/${rows.length}] ` +
            `transitions=${transitions.length} ` +
            `rate=${rate}/s elapsed=${totalElapsed}s`,
        );
      }
    } catch (error) {
      failed++;
      const errMsg = error instanceof Error ? error.message : String(error);
      errors.push(`${row.atsSlug}: ${errMsg}`);
      console.error(`[ERROR] ${row.atsSlug}: ${errMsg}`);
    }
  }

  // Simple concurrency pool
  const queue = [...rows];
  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const row = queue.shift();
          if (row) await processCompany(row);
        }
      })(),
    );
  }
  await Promise.all(workers);

  // ── Summary ──────────────────────────────────────────────────────────────
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n${SEP}`);
  console.log(
    `${dryRun ? "DRY-RUN PREVIEW" : "APPLY COMPLETE"} — ${scored} companies scored in ${totalElapsed}s`,
  );
  if (failed > 0) console.log(`  Failed: ${failed}`);
  console.log();

  // Post-scoring tier distribution
  console.log("Post-scoring tier distribution:");
  for (const [tier, cnt] of Object.entries(tierCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${tier}: ${cnt}`);
  }
  console.log();

  // Score distribution
  console.log("Raw-score distribution:");
  for (const [bucket, cnt] of Object.entries(scoreBuckets).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${bucket}: ${cnt}`);
  }
  console.log();

  // Tier transitions summary
  console.log(
    `Tier transitions: ${transitions.length} companies would change tier`,
  );
  for (const [key, cnt] of Object.entries(tierTransitions).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${key}: ${cnt}`);
  }
  console.log();

  // Named defense/infrastructure companies — always surface these
  const defenseTransitions = transitions.filter((t) =>
    DEFENSE_INFRA_SLUGS.has(t.atsSlug),
  );
  if (defenseTransitions.length > 0) {
    console.log("Defense/infrastructure companies (audit-flagged):");
    for (const t of defenseTransitions) {
      console.log(
        `  ${t.atsSlug.padEnd(28)} ${t.fromTier}->${t.toTier}  ` +
          `raw=${t.rawScore} clamped=${t.companySizeScore.toFixed(3)}  ` +
          `emp=${t.signals.employeeCount} agency=${t.signals.agency} ` +
          `public=${t.signals.publicListing} src=${t.signals.sourceOrigin} mat=${t.signals.maturity}`,
      );
    }
    console.log();
  }

  // Sample of other transitions (first 20)
  const otherTransitions = transitions
    .filter((t) => !DEFENSE_INFRA_SLUGS.has(t.atsSlug))
    .slice(0, 20);
  if (otherTransitions.length > 0) {
    console.log(
      `Sample transitions (first ${otherTransitions.length} of ${transitions.length - defenseTransitions.length}):`,
    );
    for (const t of otherTransitions) {
      console.log(
        `  ${(t.companyName ?? t.atsSlug).padEnd(28)} ${t.fromTier}->${t.toTier}  ` +
          `raw=${t.rawScore} clamped=${t.companySizeScore.toFixed(3)}`,
      );
    }
    if (transitions.length - defenseTransitions.length > 20) {
      console.log(
        `  ... and ${transitions.length - defenseTransitions.length - 20} more`,
      );
    }
    console.log();
  }

  if (errors.length > 0) {
    console.log(`Errors (${errors.length}):`);
    for (const e of errors.slice(0, 20)) console.log(`  ${e}`);
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`);
    console.log();
  }

  if (dryRun) {
    console.log("DRY-RUN: no database writes were made.");
    console.log("To apply these changes, re-run with --apply");
  } else {
    console.log(
      "APPLY: scores persisted to company_quality_score, tiers updated on company.",
    );
  }
  console.log(`${SEP}\n`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
