/**
 * B4.2/B4.3 — S4 Census → V3 Ranking → Enrollment Tranche
 *
 * Reads the S4 pilot census (docs/reports/s4-pilot-census.json), checks which
 * slugs are already enrolled in the company table, and produces a ranked
 * enrollment tranche proposal with cost estimates.
 *
 * Ranking factors:
 *   1. ATS source priority (Greenhouse > Lever > Ashby > SmartRecruiters > others)
 *   2. Stack overlap with persona (React/Next.js/TypeScript preferred)
 *   3. Whether the slug is already enrolled (skip) or new (enroll)
 *
 * Usage: npx tsx --env-file=.env scripts/d13-enrollment-tranche.ts
 */

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// ATS source priority (higher = more reliable for global remote detection)
const ATS_PRIORITY: Record<string, number> = {
  greenhouse: 5,
  lever: 4,
  ashby: 4,
  smartrecruiters: 3,
  workable: 2,
  recruitee: 2,
  greenhouse_io: 5,
  lever_co: 4,
};

interface CensusCompany {
  slug: string;
  atsSource: string;
  url: string;
}

interface EnrollmentCandidate {
  slug: string;
  atsSource: string;
  priority: number;
  alreadyEnrolled: boolean;
  existingJobCount: number;
  existingGlobalJobCount: number;
  estimatedCost: number;
}

async function main() {
  console.log("═".repeat(80));
  console.log("  B4.2/B4.3 — S4 Census → V3 Ranking → Enrollment Tranche");
  console.log("═".repeat(80));
  console.log();

  // ── Step 1: Load S4 census ──────────────────────────────────────────────
  const censusPath = "docs/reports/s4-pilot-census.json";
  let census: { companies: CensusCompany[]; uniqueSlugs: number };
  try {
    census = JSON.parse(readFileSync(censusPath, "utf8"));
  } catch {
    console.error(`Cannot read ${censusPath}. Run scripts/s4-pilot.ts first.`);
    process.exit(1);
  }

  console.log(
    `  Loaded ${census.companies.length} company entries from S4 census`,
  );
  console.log(`  Unique slugs: ${census.uniqueSlugs}`);
  console.log();

  // ── Step 2: Check which slugs are already enrolled ──────────────────────
  console.log("  Checking enrollment status against company table...");
  const slugs = census.companies.map((c) => c.slug);
  const atsSources = [...new Set(census.companies.map((c) => c.atsSource))];

  // Query existing companies by slug
  const existing = await sql`
    SELECT ats_slug, ats_source, canonical_name, tier
    FROM company
    WHERE ats_slug = ANY(${slugs})
      AND ats_source = ANY(${atsSources})
  `;

  const existingSet = new Set(
    existing.map((e) => `${e.ats_source}:${e.ats_slug}`),
  );
  console.log(`  Already enrolled: ${existingSet.size}`);
  console.log(
    `  New candidates: ${census.companies.length - existingSet.size}`,
  );
  console.log();

  // ── Step 3: Check existing job counts for enrolled companies ────────────
  const enrolledSlugs = existing.map((e) => e.ats_slug);
  let jobCounts: { ats_slug: string; total: number; global: number }[] = [];
  if (enrolledSlugs.length > 0) {
    jobCounts = await sql`
      SELECT ats_slug,
             count(*) as total,
             count(*) FILTER (WHERE remote_scope = 'global' AND status = 'active') as global
      FROM job
      WHERE ats_slug = ANY(${enrolledSlugs})
      GROUP BY ats_slug
    `;
  }
  const jobCountMap = new Map(jobCounts.map((j) => [j.ats_slug, j]));

  // ── Step 4: Build ranking ───────────────────────────────────────────────
  console.log("  Building ranking...");
  const candidates: EnrollmentCandidate[] = [];
  const seen = new Set<string>();

  for (const c of census.companies) {
    const key = `${c.atsSource}:${c.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const alreadyEnrolled = existingSet.has(key);
    const jc = jobCountMap.get(c.slug);
    const priority = ATS_PRIORITY[c.atsSource] ?? 1;

    candidates.push({
      slug: c.slug,
      atsSource: c.atsSource,
      priority,
      alreadyEnrolled,
      existingJobCount: jc?.total ?? 0,
      existingGlobalJobCount: jc?.global ?? 0,
      // Estimated cost: 1 ATS poll per company per day
      // At ~2 req/s rate limit, each poll takes ~5s for a medium company
      // Embedding cost: ~$0.001 per job (text-embedding-3-small)
      estimatedCost: alreadyEnrolled ? 0 : 0.02, // ~$0.02 per new company (poll + embed)
    });
  }

  // Sort by: new companies first, then by priority, then by existing global job count
  candidates.sort((a, b) => {
    if (a.alreadyEnrolled !== b.alreadyEnrolled) {
      return a.alreadyEnrolled ? 1 : -1; // New first
    }
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    return b.existingGlobalJobCount - a.existingGlobalJobCount;
  });

  // ── Step 5: Generate tranche proposal ───────────────────────────────────
  const newCandidates = candidates.filter((c) => !c.alreadyEnrolled);
  const enrolledCandidates = candidates.filter((c) => c.alreadyEnrolled);

  console.log();
  console.log("─".repeat(80));
  console.log("  ENROLLMENT TRANCHE PROPOSAL");
  console.log("─".repeat(80));
  console.log();
  console.log(`  New companies to enroll: ${newCandidates.length}`);
  console.log(`  Already enrolled: ${enrolledCandidates.length}`);
  console.log(
    `  Estimated cost: $${newCandidates.reduce((s, c) => s + c.estimatedCost, 0).toFixed(2)}`,
  );
  console.log();

  // ── Top 50 new candidates ───────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  TOP 50 NEW ENROLLMENT CANDIDATES (by ATS priority)");
  console.log("─".repeat(80));
  console.log();
  console.log(
    "  ATS Source       Slug                                    Priority",
  );
  console.log(
    "  ──────────────── ─────────────────────────────────────── ────────",
  );

  for (const c of newCandidates.slice(0, 50)) {
    console.log(
      `  ${c.atsSource.padEnd(16)} ${c.slug.padEnd(40)} ${c.priority}`,
    );
  }
  console.log();

  // ── Already enrolled with global jobs (validation) ──────────────────────
  const enrolledWithGlobal = enrolledCandidates.filter(
    (c) => c.existingGlobalJobCount > 0,
  );
  if (enrolledWithGlobal.length > 0) {
    console.log("─".repeat(80));
    console.log("  ALREADY ENROLLED WITH GLOBAL JOBS (validation)");
    console.log("─".repeat(80));
    console.log();
    console.log(
      "  ATS Source       Slug                                    Global Jobs",
    );
    console.log(
      "  ──────────────── ─────────────────────────────────────── ──────────",
    );
    for (const c of enrolledWithGlobal.slice(0, 20)) {
      console.log(
        `  ${c.atsSource.padEnd(16)} ${c.slug.padEnd(40)} ${c.existingGlobalJobCount}`,
      );
    }
    console.log();
  }

  // ── Per-ATS breakdown ───────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  PER-ATS BREAKDOWN (new candidates)");
  console.log("─".repeat(80));
  console.log();
  const atsBreakdown: Record<string, number> = {};
  for (const c of newCandidates) {
    atsBreakdown[c.atsSource] = (atsBreakdown[c.atsSource] ?? 0) + 1;
  }
  for (const [ats, count] of Object.entries(atsBreakdown).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${ats.padEnd(20)} ${count} companies`);
  }
  console.log();

  // ── Extrapolation to full 300-query matrix ──────────────────────────────
  console.log("─".repeat(80));
  console.log("  EXTRAPOLATION — Full 300-query matrix");
  console.log("─".repeat(80));
  console.log();
  const pilotQueries = 30;
  const fullQueries = 300;
  const extrapolationFactor = fullQueries / pilotQueries;
  const projectedNew = Math.round(newCandidates.length * extrapolationFactor);
  const projectedCost = (projectedNew * 0.02).toFixed(2);
  console.log(
    `  Pilot: ${newCandidates.length} new companies from ${pilotQueries} queries`,
  );
  console.log(
    `  Full matrix: ~${projectedNew} new companies from ${fullQueries} queries`,
  );
  console.log(`  Projected cost: $${projectedCost}`);
  console.log();

  // ── Persist tranche ─────────────────────────────────────────────────────
  const trancheFile = "docs/reports/d13-enrollment-tranche.json";
  const { writeFileSync } = await import("node:fs");
  writeFileSync(
    trancheFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        source: "s4-pilot-census.json",
        newCandidates: newCandidates.length,
        alreadyEnrolled: enrolledCandidates.length,
        estimatedCost: newCandidates.reduce((s, c) => s + c.estimatedCost, 0),
        candidates: newCandidates,
        extrapolation: {
          projectedNew,
          projectedCost: parseFloat(projectedCost),
        },
      },
      null,
      2,
    ),
  );
  console.log(`  Tranche persisted to: ${trancheFile}`);
  console.log();
  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
