/**
 * S1 Verification Test — remoteintech/remote-jobs Funnel Numbers
 *
 * Runs the S1 parser in dry-run mode (no Slugger resolution, no DB writes)
 * against the live remoteintech/remote-jobs GitHub repository.
 *
 * Reports the directive's required verification metrics:
 *   (a) companies parsed
 *   (b) % resolving to Greenhouse/Lever/Ashby (requires Slugger — skipped in dry-run)
 *   (c) % passing Fingerprint v2 (requires ATS probe — skipped in dry-run)
 *   (d) projected addressable-job yield from probe feeds
 *
 * In dry-run mode, we report (a) and the pre-filter funnel. For (b) and (c),
 * a full run with Slugger + Fingerprint v2 is needed (next step).
 *
 * Usage: npx tsx scripts/s1-verification-test.ts
 */
import { parseRemoteInTechRepo } from "@/lib/jobs/seeders/batch-sources/remoteintech";

async function main() {
  console.log("═".repeat(80));
  console.log("  S1 VERIFICATION TEST — remoteintech/remote-jobs");
  console.log("═".repeat(80));
  console.log();
  console.log("Fetching company list from GitHub API + parsing frontmatter...");
  console.log("(This takes ~45s due to 881 files fetched in batches of 10)");
  console.log();

  const result = await parseRemoteInTechRepo();

  if (result.error) {
    console.error("PARSE ERROR:", result.error);
    process.exit(1);
  }

  console.log("─".repeat(80));
  console.log("  PARSE FUNNEL");
  console.log("─".repeat(80));
  console.log();
  console.log(`  Total company files parsed:  ${result.totalFiles}`);
  console.log(`  Passed pre-filter:           ${result.passedPreFilter}`);
  console.log(`  Filtered by region:          ${result.filteredByRegion}`);
  console.log(`  Filtered by tech (no web-dev): ${result.filteredByTech}`);
  console.log(`  Filtered (no URL):           ${result.filteredByNoCareers}`);
  console.log();

  const passRate = ((result.passedPreFilter / result.totalFiles) * 100).toFixed(
    1,
  );
  console.log(`  Pre-filter pass rate: ${passRate}%`);
  console.log();

  // ── Region distribution of pre-filtered companies ─────────────────────────
  console.log("─".repeat(80));
  console.log("  PRE-FILTERED COMPANIES — Region distribution");
  console.log("─".repeat(80));
  console.log();

  const regionCounts: Record<string, number> = {};
  for (const c of result.companies) {
    regionCounts[c.region] = (regionCounts[c.region] ?? 0) + 1;
  }
  for (const [region, count] of Object.entries(regionCounts).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )) {
    console.log(`  ${region.padEnd(20)} ${count}`);
  }
  console.log();

  // ── Tech distribution of pre-filtered companies ───────────────────────────
  console.log("─".repeat(80));
  console.log("  PRE-FILTERED COMPANIES — Tech tag distribution");
  console.log("─".repeat(80));
  console.log();

  const techCounts: Record<string, number> = {};
  for (const c of result.companies) {
    for (const t of c.technologies) {
      techCounts[t] = (techCounts[t] ?? 0) + 1;
    }
  }
  for (const [tech, count] of Object.entries(techCounts).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )) {
    console.log(`  ${tech.padEnd(20)} ${count}`);
  }
  console.log();

  // ── Remote policy distribution ────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  PRE-FILTERED COMPANIES — Remote policy distribution");
  console.log("─".repeat(80));
  console.log();

  const policyCounts: Record<string, number> = {};
  for (const c of result.companies) {
    policyCounts[c.remotePolicy] = (policyCounts[c.remotePolicy] ?? 0) + 1;
  }
  for (const [policy, count] of Object.entries(policyCounts).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )) {
    console.log(`  ${policy.padEnd(20)} ${count}`);
  }
  console.log();

  // ── Company size distribution ─────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  PRE-FILTERED COMPANIES — Company size distribution");
  console.log("─".repeat(80));
  console.log();

  const sizeCounts: Record<string, number> = {};
  for (const c of result.companies) {
    sizeCounts[c.companySize] = (sizeCounts[c.companySize] ?? 0) + 1;
  }
  for (const [size, count] of Object.entries(sizeCounts).sort(
    (a, b) => Number(b[1]) - Number(a[1]),
  )) {
    console.log(`  ${size.padEnd(20)} ${count}`);
  }
  console.log();

  // ── Sample companies ──────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  SAMPLE PRE-FILTERED COMPANIES (first 20)");
  console.log("─".repeat(80));
  console.log();

  for (const c of result.companies.slice(0, 20)) {
    const techs = c.technologies.join(", ");
    console.log(`  ${c.name.padEnd(25)} ${c.region.padEnd(18)} [${techs}]`);
    if (c.careersUrl) {
      console.log(`    careers: ${c.careersUrl}`);
    }
  }
  console.log();

  // ── Projected yield ───────────────────────────────────────────────────────
  console.log("═".repeat(80));
  console.log("  PROJECTED YIELD");
  console.log("═".repeat(80));
  console.log();
  console.log(`  Pre-filtered companies:      ${result.passedPreFilter}`);
  console.log(`  Estimated ATS resolution:    30-60% (Slugger 3-stage)`);
  console.log(
    `  Estimated ATS-resolved:       ${Math.floor(result.passedPreFilter * 0.3)}-${Math.floor(result.passedPreFilter * 0.6)}`,
  );
  console.log(
    `  Estimated Fingerprint v2 pass: 50-80% of ATS-resolved (web-dev companies)`,
  );
  console.log(
    `  Estimated enrolled:           ${Math.floor(result.passedPreFilter * 0.3 * 0.5)}-${Math.floor(result.passedPreFilter * 0.6 * 0.8)}`,
  );
  console.log();
  console.log("  NOTE: (b) ATS resolution % and (c) Fingerprint v2 pass %");
  console.log("  require a full run with Slugger + stack-profile probe.");
  console.log("  This dry-run confirms (a) companies parsed and the funnel.");
  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
