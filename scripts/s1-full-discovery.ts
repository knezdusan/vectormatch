/**
 * S1 Full Discovery — The Validation Gate
 *
 * Runs the complete S1 pipeline against real data:
 *   1. Parse remoteintech/remote-jobs repo → 881 companies
 *   2. Pre-filter (region + tech + URL) → ~330 companies
 *   3. Dedup against existing corpus → ~306 net-new
 *   4. Slugger resolution (DNS CNAME + HTTP slug probe) → ? ATS-resolved
 *   5. Fingerprint v2 stack-profile probe → ? pass/park
 *
 * Steps 1-3 are compute-free (Mac Mini + one indexed DB SELECT).
 * Step 4 is compute-free (DNS + HTTP, no Neon).
 * Step 5 is compute-free (one HTTP request per resolved company).
 *
 * The output is the proof-of-life measurement:
 *   - Resolution rate (by ATS) → validates or kills the company→ATS→poll thesis
 *   - Fingerprint v2 pass rate → validates targeting
 *   - Per-company embed cost estimate → sizes the first tranche
 *
 * Usage: npx tsx scripts/s1-full-discovery.ts
 */
import { neon } from "@neondatabase/serverless";
import {
  parseRemoteInTechRepo,
  type RemoteInTechCompany,
} from "@/lib/jobs/seeders/batch-sources/remoteintech";
import { canonicalizeCompanyName, resolveSlugger } from "@/lib/jobs/seeders/slugger";
import { probeStackProfile } from "@/lib/jobs/seeders/fingerprint-v2";

const sql = neon(process.env.DATABASE_URL!);

/** Extract a clean domain from a website URL. */
function extractDomain(website: string): string {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

async function main() {
  console.log("═".repeat(80));
  console.log("  S1 FULL DISCOVERY — The Validation Gate");
  console.log("═".repeat(80));
  console.log();
  console.log("Step 1: Parsing remoteintech/remote-jobs repo (~45s)...");
  console.log();

  const parseResult = await parseRemoteInTechRepo();
  if (parseResult.error) {
    console.error("PARSE ERROR:", parseResult.error);
    process.exit(1);
  }

  console.log(`  Parsed: ${parseResult.totalFiles} → pre-filtered: ${parseResult.passedPreFilter}`);
  console.log();

  // ── Step 2: Dedup against existing corpus ──────────────────────────────────
  console.log("Step 2: Deduping against existing corpus...");
  const existingCompanies = await sql`
    SELECT canonical_name, root_domain FROM company WHERE tier != 'dead'
  `;

  const existingByName = new Set<string>();
  const existingByDomain = new Set<string>();
  for (const c of existingCompanies) {
    if (c.canonical_name) existingByName.add(c.canonical_name.toLowerCase());
    if (c.root_domain) existingByDomain.add(c.root_domain.toLowerCase());
  }

  const netNew: RemoteInTechCompany[] = [];
  let alreadyInCorpus = 0;

  for (const company of parseResult.companies) {
    const canonicalName = canonicalizeCompanyName(company.name);
    const domain = extractDomain(company.website).toLowerCase();

    if (existingByName.has(canonicalName) || existingByDomain.has(domain)) {
      alreadyInCorpus++;
    } else {
      netNew.push(company);
    }
  }

  console.log(`  Already in corpus: ${alreadyInCorpus} | Net-new: ${netNew.length}`);
  console.log();

  // ── Step 3: Slugger resolution on net-new companies ────────────────────────
  console.log("Step 3: Slugger resolution on net-new companies...");
  console.log("  (DNS CNAME + HTTP slug probe — no Neon compute)");
  console.log(`  Processing ${netNew.length} companies...`);
  console.log();

  interface ResolvedCompany {
    name: string;
    website: string;
    atsSource: string;
    atsSlug: string;
    resolvedBy: string;
  }

  const resolved: ResolvedCompany[] = [];
  const unresolved: { name: string; website: string }[] = [];
  const resolutionByAts: Record<string, number> = {};

  // Process in batches to avoid overwhelming DNS/network
  const BATCH_SIZE = 5;
  for (let i = 0; i < netNew.length; i++) {
    const company = netNew[i];

    if ((i + 1) % 25 === 0) {
      console.log(`  Progress: ${i + 1}/${netNew.length} (resolved: ${resolved.length}, unresolved: ${unresolved.length})`);
    }

    try {
      const result = await resolveSlugger({
        companyName: company.name,
        website: extractDomain(company.website),
        discoverySource: "vc_portfolio",
        discoveryContext: `remoteintech:${company.slug}`,
      });

      if (result.success) {
        resolved.push({
          name: company.name,
          website: company.website,
          atsSource: result.atsSource,
          atsSlug: result.atsSlug,
          resolvedBy: result.resolvedBy,
        });
        resolutionByAts[result.atsSource] = (resolutionByAts[result.atsSource] ?? 0) + 1;
      } else {
        unresolved.push({ name: company.name, website: company.website });
      }
    } catch {
      unresolved.push({ name: company.name, website: company.website });
    }

    // Small delay between companies to be respectful
    if ((i + 1) % BATCH_SIZE === 0) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const resolutionRate = ((resolved.length / netNew.length) * 100).toFixed(1);

  console.log();
  console.log("─".repeat(80));
  console.log("  SLUGGER RESOLUTION RESULTS");
  console.log("─".repeat(80));
  console.log();
  console.log(`  Net-new companies:    ${netNew.length}`);
  console.log(`  Resolved to ATS:      ${resolved.length} (${resolutionRate}%)`);
  console.log(`  Unresolved:           ${unresolved.length}`);
  console.log();

  console.log("  Resolution by ATS:");
  for (const [ats, count] of Object.entries(resolutionByAts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${ats.padEnd(20)} ${count}`);
  }
  console.log();

  console.log("  Resolution by method:");
  const byMethod: Record<string, number> = {};
  for (const r of resolved) {
    byMethod[r.resolvedBy] = (byMethod[r.resolvedBy] ?? 0) + 1;
  }
  for (const [method, count] of Object.entries(byMethod).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${method.padEnd(20)} ${count}`);
  }
  console.log();

  // ── Step 4: Fingerprint v2 stack-profile probe on resolved companies ───────
  console.log("Step 4: Fingerprint v2 stack-profile probe on resolved companies...");
  console.log(`  Probing ${resolved.length} ATS feeds...`);
  console.log();

  interface ProbedCompany extends ResolvedCompany {
    totalJobs: number;
    webDevJobs: number;
    webDevFraction: number;
    fingerprintPassed: boolean;
    fingerprintReason: string;
    matchedTitles: string[];
  }

  const passed: ProbedCompany[] = [];
  const parked: ProbedCompany[] = [];
  const probeErrors: { name: string; reason: string }[] = [];

  for (let i = 0; i < resolved.length; i++) {
    const company = resolved[i];

    if ((i + 1) % 10 === 0) {
      console.log(`  Progress: ${i + 1}/${resolved.length} (passed: ${passed.length}, parked: ${parked.length})`);
    }

    try {
      const profile = await probeStackProfile(
        company.atsSource as "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "recruitee",
        company.atsSlug,
      );

      const probed: ProbedCompany = {
        ...company,
        totalJobs: profile.totalJobs,
        webDevJobs: profile.webDevJobs,
        webDevFraction: profile.webDevFraction,
        fingerprintPassed: profile.passed,
        fingerprintReason: profile.reason,
        matchedTitles: profile.matchedTitles,
      };

      if (profile.passed) {
        passed.push(probed);
      } else if (profile.totalJobs > 0) {
        parked.push(probed);
      } else {
        // No jobs or error — separate bucket
        probeErrors.push({ name: company.name, reason: profile.reason });
      }
    } catch (err) {
      probeErrors.push({
        name: company.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    // Rate limit: 500ms between probes
    if (i < resolved.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Final Report ───────────────────────────────────────────────────────────
  console.log();
  console.log("═".repeat(80));
  console.log("  S1 FULL FUNNEL — THE MEASUREMENT");
  console.log("═".repeat(80));
  console.log();
  console.log(`  Total parsed:              ${parseResult.totalFiles}`);
  console.log(`  Pre-filtered:              ${parseResult.passedPreFilter}`);
  console.log(`  Already in corpus:         ${alreadyInCorpus}`);
  console.log(`  Net-new:                   ${netNew.length}`);
  console.log(`  ATS-resolved (Slugger):    ${resolved.length} (${resolutionRate}%)`);
  console.log(`  Fingerprint v2 PASS:       ${passed.length} (${resolved.length > 0 ? ((passed.length / resolved.length) * 100).toFixed(1) : 0}%)`);
  console.log(`  Fingerprint v2 PARKED:     ${parked.length}`);
  console.log(`  Probe errors (no jobs):    ${probeErrors.length}`);
  console.log();

  // ── Resolution-rate verdict ────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  RESOLUTION-RATE VERDICT");
  console.log("─".repeat(80));
  console.log();
  const rate = resolved.length / netNew.length;
  if (rate >= 0.5) {
    console.log("  ✓ THESIS VALIDATED (≥50% resolve to ATS)");
    console.log("    → Build out S2/S3/S4. The company→ATS→poll mechanism works.");
  } else if (rate >= 0.25) {
    console.log("  ~ MARGINAL (25-50% resolve)");
    console.log("    → Mixed signal. Consider ATS coverage gaps + discovery source quality.");
  } else {
    console.log("  ✗ BOTTLENECK IS ATS COVERAGE (<25% resolve)");
    console.log("    → Next build is additional pollers, NOT more discovery sources.");
    console.log("    → Unresolved companies' ATS distribution tells us which pollers to add.");
  }
  console.log();

  // ── Fingerprint v2 pass distribution ───────────────────────────────────────
  if (passed.length > 0) {
    console.log("─".repeat(80));
    console.log("  FINGERPRINT V2 PASS — web-dev fraction distribution");
    console.log("─".repeat(80));
    console.log();
    const fractions = passed.map((p) => p.webDevFraction).sort((a, b) => b - a);
    const buckets = [
      { range: "≥80%", count: 0 },
      { range: "60-80%", count: 0 },
      { range: "40-60%", count: 0 },
      { range: "30-40%", count: 0 },
    ];
    for (const f of fractions) {
      if (f >= 0.8) buckets[0].count++;
      else if (f >= 0.6) buckets[1].count++;
      else if (f >= 0.4) buckets[2].count++;
      else buckets[3].count++;
    }
    for (const b of buckets) {
      console.log(`  ${b.range.padEnd(12)} ${b.count}`);
    }
    console.log();
  }

  // ── Passed companies (the first tranche candidates) ────────────────────────
  if (passed.length > 0) {
    console.log("─".repeat(80));
    console.log("  FINGERPRINT V2 PASS — First tranche candidates (top 30 by fraction)");
    console.log("─".repeat(80));
    console.log();
    const sorted = [...passed].sort((a, b) => b.webDevFraction - a.webDevFraction);
    for (const p of sorted.slice(0, 30)) {
      console.log(
        `  ${p.name.padEnd(28)} ${p.atsSource.padEnd(16)} ${p.totalJobs} jobs, ${p.webDevJobs} web-dev (${(p.webDevFraction * 100).toFixed(0)}%)`,
      );
    }
    console.log();

    // ── Per-company embed cost estimate ──────────────────────────────────────
    console.log("─".repeat(80));
    console.log("  PER-COMPANY EMBED COST ESTIMATE (first tranche)");
    console.log("─".repeat(80));
    console.log();
    const totalWebDevJobs = passed.reduce((s, p) => s + p.webDevJobs, 0);
    const totalAllJobs = passed.reduce((s, p) => s + p.totalJobs, 0);
    console.log(`  Total web-dev jobs to embed:     ${totalWebDevJobs}`);
    console.log(`  Total all jobs (if full feed):   ${totalAllJobs}`);
    console.log(`  Embed API cost:                  ~$0 (OpenAI text-embedding-3-small)`);
    console.log(`  Neon compute per embed:          ~10ms CPU per job`);
    console.log(`  Total embed CPU:                 ${(totalWebDevJobs * 0.01).toFixed(1)} sec = ${(totalWebDevJobs * 0.01 / 3600).toFixed(4)} CU-hrs`);
    console.log(`  Full-feed embed CPU:             ${(totalAllJobs * 0.01).toFixed(1)} sec = ${(totalAllJobs * 0.01 / 3600).toFixed(4)} CU-hrs`);
    console.log(`  Remaining budget:                ~12.74 CU-hrs`);
    console.log();
    console.log(`  → Role-scoped ingestion (web-dev only): ${(totalWebDevJobs * 0.01 / 3600).toFixed(4)} CU-hrs`);
    console.log(`  → Full-feed ingestion:                     ${(totalAllJobs * 0.01 / 3600).toFixed(4)} CU-hrs`);
    console.log(`  → Saving from role-scoped:                 ${((totalAllJobs - totalWebDevJobs) * 0.01 / 3600).toFixed(4)} CU-hrs (${totalAllJobs - totalWebDevJobs} jobs skipped)`);
    console.log();
  }

  // ── Parked companies (failed Fingerprint v2) ───────────────────────────────
  if (parked.length > 0) {
    console.log("─".repeat(80));
    console.log("  FINGERPRINT V2 PARKED (failed gate, have jobs)");
    console.log("─".repeat(80));
    console.log();
    for (const p of parked.slice(0, 15)) {
      console.log(
        `  ${p.name.padEnd(28)} ${p.atsSource.padEnd(16)} ${p.totalJobs} jobs, ${p.webDevJobs} web-dev (${(p.webDevFraction * 100).toFixed(0)}%) — ${p.fingerprintReason}`,
      );
    }
    if (parked.length > 15) {
      console.log(`  ... and ${parked.length - 15} more`);
    }
    console.log();
  }

  // ── Unresolved companies (the ATS coverage gap signal) ─────────────────────
  if (unresolved.length > 0 && rate < 0.5) {
    console.log("─".repeat(80));
    console.log("  UNRESOLVED COMPANIES — sample (ATS coverage gap signal)");
    console.log("─".repeat(80));
    console.log();
    for (const u of unresolved.slice(0, 20)) {
      console.log(`  ${u.name.padEnd(30)} ${u.website}`);
    }
    if (unresolved.length > 20) {
      console.log(`  ... and ${unresolved.length - 20} more`);
    }
    console.log();
  }

  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
