/**
 * S1 v3 Ranking — Addressable-Global Yield
 *
 * Re-runs the S1 discovery with Fingerprint v3: for each resolved company,
 * classifies each web-dev job's remote scope and ranks by estimated
 * addressable-global yield.
 *
 * Expected effect: Stripe/Coinbase collapse to ~0 (country-fenced), Truelogic/
 * Alan/ClickUp rank high (genuinely global).
 *
 * Usage: npx tsx scripts/s1-v3-ranking.ts
 */
import { neon } from "@neondatabase/serverless";
import {
  parseRemoteInTechRepo,
  type RemoteInTechCompany,
} from "@/lib/jobs/seeders/batch-sources/remoteintech";
import {
  probeStackProfileV3,
  type StackProfileV3Result,
} from "@/lib/jobs/seeders/fingerprint-v3";
import {
  canonicalizeCompanyName,
  resolveSlugger,
} from "@/lib/jobs/seeders/slugger";

const sql = neon(process.env.DATABASE_URL!);

function extractDomain(website: string): string {
  try {
    const url = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    return website
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

async function main() {
  console.log("═".repeat(80));
  console.log("  S1 v3 RANKING — Addressable-Global Yield");
  console.log("═".repeat(80));
  console.log();
  console.log("Step 1: Parsing repo + dedup + Slugger resolution...");
  console.log();

  const parseResult = await parseRemoteInTechRepo();
  if (parseResult.error) {
    console.error("PARSE ERROR:", parseResult.error);
    process.exit(1);
  }

  const existingCompanies = await sql`
    SELECT canonical_name, root_domain FROM company WHERE tier != 'dead'
  `;
  // Neon serverless driver doesn't have .end() — the WebSocket will time out
  // during the long Slugger phase. Suppress the idle-connection error.
  process.on("uncaughtException", (err) => {
    if (err.message?.includes("WebSocket") || err.message?.includes("Neon"))
      return;
    throw err;
  });
  const existingByName = new Set<string>();
  const existingByDomain = new Set<string>();
  for (const c of existingCompanies) {
    if (c.canonical_name) existingByName.add(c.canonical_name.toLowerCase());
    if (c.root_domain) existingByDomain.add(c.root_domain.toLowerCase());
  }

  const netNew: RemoteInTechCompany[] = [];
  for (const company of parseResult.companies) {
    const canonicalName = canonicalizeCompanyName(company.name);
    const domain = extractDomain(company.website).toLowerCase();
    if (!existingByName.has(canonicalName) && !existingByDomain.has(domain)) {
      netNew.push(company);
    }
  }

  console.log(`  Net-new: ${netNew.length}. Resolving via Slugger...`);

  interface ResolvedCompany {
    name: string;
    website: string;
    atsSource:
      | "greenhouse"
      | "lever"
      | "ashby"
      | "smartrecruiters"
      | "workable"
      | "recruitee";
    atsSlug: string;
    region: string;
  }

  const resolved: ResolvedCompany[] = [];
  for (let i = 0; i < netNew.length; i++) {
    const company = netNew[i];
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
          atsSource: result.atsSource as ResolvedCompany["atsSource"],
          atsSlug: result.atsSlug,
          region: company.region,
        });
      }
    } catch {
      // skip
    }
    if ((i + 1) % 100 === 0) {
      console.log(
        `  Slugger progress: ${i + 1}/${netNew.length} (resolved: ${resolved.length})`,
      );
    }
  }

  console.log(`  Resolved: ${resolved.length}`);
  console.log();

  // ── Step 2: Fingerprint v3 probe ───────────────────────────────────────────
  console.log("Step 2: Fingerprint v3 probe (addressable-global yield)...");
  console.log(`  Probing ${resolved.length} ATS feeds...`);
  console.log();

  interface RankedCompany extends ResolvedCompany {
    profile: StackProfileV3Result;
  }

  const ranked: RankedCompany[] = [];
  const errors: { name: string; reason: string }[] = [];

  for (let i = 0; i < resolved.length; i++) {
    const company = resolved[i];
    if ((i + 1) % 25 === 0) {
      console.log(
        `  Progress: ${i + 1}/${resolved.length} (ranked: ${ranked.length})`,
      );
    }

    try {
      const profile = await probeStackProfileV3(
        company.atsSource,
        company.atsSlug,
      );
      if (profile.totalJobs > 0) {
        ranked.push({ ...company, profile });
      }
    } catch (err) {
      errors.push({
        name: company.name,
        reason: err instanceof Error ? err.message : String(err),
      });
    }

    if (i < resolved.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // ── Step 3: Rank by addressable-global yield ───────────────────────────────
  const passing = ranked
    .filter((r) => r.profile.passed)
    .sort((a, b) => b.profile.addressableYield - a.profile.addressableYield);

  console.log();
  console.log("═".repeat(80));
  console.log("  S1 v3 RANKED TRANCHE — by addressable-global yield");
  console.log("═".repeat(80));
  console.log();
  console.log(`  Total resolved:          ${resolved.length}`);
  console.log(`  Active (have jobs):      ${ranked.length}`);
  console.log(`  Pass gate (≥2 web-dev):  ${passing.length}`);
  console.log(`  Probe errors:            ${errors.length}`);
  console.log();

  // Summary stats
  const totalGlobal = passing.reduce(
    (s, r) => s + r.profile.globalWebDevJobs,
    0,
  );
  const totalFenced = passing.reduce(
    (s, r) => s + r.profile.fencedWebDevJobs,
    0,
  );
  const totalOnsite = passing.reduce(
    (s, r) => s + r.profile.onsiteWebDevJobs,
    0,
  );
  const totalUndetermined = passing.reduce(
    (s, r) => s + r.profile.undeterminedWebDevJobs,
    0,
  );
  const totalAddressable = passing.reduce(
    (s, r) => s + r.profile.addressableYield,
    0,
  );
  const totalWebDev = passing.reduce((s, r) => s + r.profile.webDevJobs, 0);

  console.log("─".repeat(80));
  console.log(
    "  WEB-DEV JOB SCOPE DISTRIBUTION (across all passing companies)",
  );
  console.log("─".repeat(80));
  console.log();
  console.log(`  Total web-dev jobs:          ${totalWebDev}`);
  console.log(
    `  Genuinely global:            ${totalGlobal} (${((totalGlobal / totalWebDev) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Country-fenced:              ${totalFenced} (${((totalFenced / totalWebDev) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  On-site:                     ${totalOnsite} (${((totalOnsite / totalWebDev) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Undetermined:                ${totalUndetermined} (${((totalUndetermined / totalWebDev) * 100).toFixed(1)}%)`,
  );
  console.log();
  console.log(
    `  ESTIMATED ADDRESSABLE YIELD: ${totalAddressable} genuinely-global web-dev jobs`,
  );
  console.log(`  (global + 0.5 × undetermined)`);
  console.log();

  // ── Full ranked table ──────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  RANKED BY ADDRESSABLE-GLOBAL YIELD (all passing companies)");
  console.log("─".repeat(80));
  console.log();
  console.log(
    `  ${"Company".padEnd(28)} ${"ATS".padEnd(14)} ${"WD".padEnd(4)} ${"Global".padEnd(7)} ${"Fenced".padEnd(7)} ${"Undet".padEnd(6)} ${"Yield".padEnd(6)} Region`,
  );
  console.log(`  ${"─".repeat(76)}`);

  for (const r of passing) {
    const p = r.profile;
    console.log(
      `  ${r.name.padEnd(28)} ${r.atsSource.padEnd(14)} ${String(p.webDevJobs).padEnd(4)} ${String(p.globalWebDevJobs).padEnd(7)} ${String(p.fencedWebDevJobs).padEnd(7)} ${String(p.undeterminedWebDevJobs).padEnd(6)} ${p.addressableYield.toFixed(1).padEnd(6)} ${r.region}`,
    );
  }
  console.log();

  // ── Top tranche (addressable yield > 0) ────────────────────────────────────
  const addressable = passing.filter((r) => r.profile.addressableYield > 0);
  console.log("─".repeat(80));
  console.log(
    `  ADDRESSABLE TRANCHE (yield > 0): ${addressable.length} companies`,
  );
  console.log("─".repeat(80));
  console.log();
  for (const r of addressable) {
    const p = r.profile;
    console.log(
      `  ${r.name.padEnd(28)} ${r.atsSource.padEnd(14)} yield=${p.addressableYield.toFixed(1)} (${p.globalWebDevJobs} global, ${p.undeterminedWebDevJobs} undetermined)`,
    );
  }
  console.log();

  // ── Collapsed companies (yield = 0) ────────────────────────────────────────
  const collapsed = passing.filter((r) => r.profile.addressableYield === 0);
  if (collapsed.length > 0) {
    console.log("─".repeat(80));
    console.log(`  COLLAPSED (yield = 0): ${collapsed.length} companies`);
    console.log("  (Passed web-dev gate but zero addressable-global jobs)");
    console.log("─".repeat(80));
    console.log();
    for (const r of collapsed) {
      const p = r.profile;
      console.log(
        `  ${r.name.padEnd(28)} ${r.atsSource.padEnd(14)} ${p.webDevJobs} web-dev: ${p.fencedWebDevJobs} fenced, ${p.onsiteWebDevJobs} onsite, ${p.globalWebDevJobs} global`,
      );
    }
    console.log();
  }

  // ── Per-company job detail for top 10 ──────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  TOP 10 — per-job scope detail");
  console.log("─".repeat(80));
  console.log();
  for (const r of addressable.slice(0, 10)) {
    console.log(`  ${r.name} (${r.atsSource}):`);
    for (const j of r.profile.webDevJobsWithScope) {
      console.log(
        `    ${j.title.padEnd(40)} scope=${j.remoteScope.padEnd(16)} loc=${j.location ?? "null"}`,
      );
    }
    console.log();
  }

  // ── Embed cost for addressable tranche ─────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  EMBED COST — addressable tranche (role-scoped)");
  console.log("─".repeat(80));
  console.log();
  const addressableWebDevJobs = addressable.reduce(
    (s, r) => s + r.profile.webDevJobs,
    0,
  );
  const addressableGlobalJobs = addressable.reduce(
    (s, r) => s + r.profile.globalWebDevJobs,
    0,
  );
  console.log(`  Companies:                ${addressable.length}`);
  console.log(`  Web-dev jobs to embed:    ${addressableWebDevJobs}`);
  console.log(`  Genuinely global:         ${addressableGlobalJobs}`);
  console.log(
    `  Embed CPU:                ${(addressableWebDevJobs * 0.01).toFixed(1)} sec = ${((addressableWebDevJobs * 0.01) / 3600).toFixed(4)} CU-hrs`,
  );
  console.log(`  Remaining budget:         ~12.74 CU-hrs`);
  console.log();

  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
