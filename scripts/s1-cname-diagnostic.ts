/**
 * CNAME Path Diagnostic + 440 Unreachable Companies Analysis
 *
 * The S1 runs showed 0/181 resolutions via CNAME, 100% via slug_probe.
 * This script diagnoses:
 *   1. Is the CNAME path firing at all?
 *   2. What happens when we try CNAME on careers subdomains?
 *   3. Sample 30 of the 440 unresolved companies — fetch their careers page
 *      and detect ATS from redirect/HTML.
 *
 * Usage: npx tsx scripts/s1-cname-diagnostic.ts
 */
import { neon } from "@neondatabase/serverless";
import {
  parseRemoteInTechRepo,
  type RemoteInTechCompany,
} from "@/lib/jobs/seeders/batch-sources/remoteintech";
import { defaultResolveCname } from "@/lib/jobs/seeders/resolve-custom-url";
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

// Common careers subdomain prefixes
const CAREERS_PREFIXES = [
  "careers",
  "jobs",
  "join",
  "work",
  "hiring",
  "opportunities",
  "boards",
];

async function main() {
  console.log("═".repeat(80));
  console.log("  CNAME PATH DIAGNOSTIC + 440 UNREACHABLE ANALYSIS");
  console.log("═".repeat(80));
  console.log();

  // ── Part 1: CNAME path check ───────────────────────────────────────────────
  console.log("Part 1: CNAME path diagnostic");
  console.log("─".repeat(80));
  console.log();

  // Test CNAME on a known Greenhouse company (Stripe uses Greenhouse)
  console.log("  Testing CNAME on known ATS-hosted careers pages:");
  const testCases = [
    { domain: "careers.stripe.com", expected: "boards.greenhouse.io" },
    { domain: "jobs.lever.co", expected: "jobs.lever.co" },
    { domain: "boards.greenhouse.io", expected: "boards.greenhouse.io" },
  ];

  for (const tc of testCases) {
    try {
      const cnames = await defaultResolveCname(tc.domain);
      console.log(
        `  ${tc.domain.padEnd(30)} CNAMEs: ${cnames.length > 0 ? cnames.join(", ") : "(empty)"}`,
      );
    } catch (err) {
      console.log(
        `  ${tc.domain.padEnd(30)} ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log();

  // Test CNAME on main domains (what the Slugger currently does)
  console.log(
    "  Testing CNAME on main domains (what Slugger currently receives):",
  );
  const mainDomains = [
    "stripe.com",
    "coinbase.com",
    "clickup.com",
    "resend.com",
  ];
  for (const domain of mainDomains) {
    try {
      const cnames = await defaultResolveCname(domain);
      console.log(
        `  ${domain.padEnd(30)} CNAMEs: ${cnames.length > 0 ? cnames.join(", ") : "(empty)"}`,
      );
    } catch (err) {
      console.log(
        `  ${domain.padEnd(30)} ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log();

  // Test CNAME on careers subdomains
  console.log(
    "  Testing CNAME on careers subdomains (what Slugger SHOULD try):",
  );
  const careersDomains = [
    "careers.stripe.com",
    "careers.coinbase.com",
    "careers.clickup.com",
    "jobs.clickup.com",
    "careers.resend.com",
    "join.resend.com",
  ];
  for (const domain of careersDomains) {
    try {
      const cnames = await defaultResolveCname(domain);
      console.log(
        `  ${domain.padEnd(30)} CNAMEs: ${cnames.length > 0 ? cnames.join(", ") : "(empty)"}`,
      );
    } catch (err) {
      console.log(
        `  ${domain.padEnd(30)} ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log();

  // ── Part 2: Parse + dedup + find unresolved companies ──────────────────────
  console.log("Part 2: Finding unresolved companies");
  console.log("─".repeat(80));
  console.log();

  const parseResult = await parseRemoteInTechRepo();
  if (parseResult.error) {
    console.error("PARSE ERROR:", parseResult.error);
    process.exit(1);
  }

  const existingCompanies = await sql`
    SELECT canonical_name, root_domain FROM company WHERE tier != 'dead'
  `;
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

  console.log(
    `  Net-new: ${netNew.length}. Running Slugger to find unresolved...`,
  );

  const unresolved: { name: string; website: string; domain: string }[] = [];
  for (let i = 0; i < netNew.length; i++) {
    const company = netNew[i];
    try {
      const result = await resolveSlugger({
        companyName: company.name,
        website: extractDomain(company.website),
        discoverySource: "vc_portfolio",
        discoveryContext: `remoteintech:${company.slug}`,
      });
      if (!result.success) {
        unresolved.push({
          name: company.name,
          website: company.website,
          domain: extractDomain(company.website),
        });
      }
    } catch {
      unresolved.push({
        name: company.name,
        website: company.website,
        domain: extractDomain(company.website),
      });
    }
    if ((i + 1) % 200 === 0) {
      console.log(
        `  Slugger progress: ${i + 1}/${netNew.length} (unresolved: ${unresolved.length})`,
      );
    }
  }

  console.log(`  Unresolved: ${unresolved.length}`);
  console.log();

  // ── Part 3: Sample 30 unresolved, try careers subdomain CNAME + HTTP probe ─
  console.log("Part 3: Sampling 30 unresolved companies");
  console.log("  (Try careers subdomains + HTTP redirect detection)");
  console.log("─".repeat(80));
  console.log();

  const sample = unresolved.slice(0, 30);
  const atsHistogram: Record<string, number> = {};
  let foundViaCareersCname = 0;
  let foundViaHttpRedirect = 0;
  let stillUnreachable = 0;

  for (const company of sample) {
    const baseDomain = company.domain;
    let found = false;

    // Try CNAME on careers subdomains
    for (const prefix of CAREERS_PREFIXES) {
      const careersDomain = `${prefix}.${baseDomain}`;
      try {
        const cnames = await defaultResolveCname(careersDomain);
        for (const cname of cnames) {
          const lower = cname.toLowerCase().trim();
          if (lower.includes("greenhouse")) {
            console.log(
              `  ${company.name.padEnd(28)} CNAME ${careersDomain} → ${cname} → GREENHOUSE`,
            );
            atsHistogram["greenhouse"] = (atsHistogram["greenhouse"] ?? 0) + 1;
            foundViaCareersCname++;
            found = true;
            break;
          } else if (lower.includes("lever")) {
            console.log(
              `  ${company.name.padEnd(28)} CNAME ${careersDomain} → ${cname} → LEVER`,
            );
            atsHistogram["lever"] = (atsHistogram["lever"] ?? 0) + 1;
            foundViaCareersCname++;
            found = true;
            break;
          } else if (lower.includes("ashby")) {
            console.log(
              `  ${company.name.padEnd(28)} CNAME ${careersDomain} → ${cname} → ASHBY`,
            );
            atsHistogram["ashby"] = (atsHistogram["ashby"] ?? 0) + 1;
            foundViaCareersCname++;
            found = true;
            break;
          } else if (lower.includes("smartrecruiters")) {
            console.log(
              `  ${company.name.padEnd(28)} CNAME ${careersDomain} → ${cname} → SMARTRECRUITERS`,
            );
            atsHistogram["smartrecruiters"] =
              (atsHistogram["smartrecruiters"] ?? 0) + 1;
            foundViaCareersCname++;
            found = true;
            break;
          } else if (lower.includes("workable")) {
            console.log(
              `  ${company.name.padEnd(28)} CNAME ${careersDomain} → ${cname} → WORKABLE`,
            );
            atsHistogram["workable"] = (atsHistogram["workable"] ?? 0) + 1;
            foundViaCareersCname++;
            found = true;
            break;
          } else if (lower.includes("recruitee")) {
            console.log(
              `  ${company.name.padEnd(28)} CNAME ${careersDomain} → ${cname} → RECRUITEE`,
            );
            atsHistogram["recruitee"] = (atsHistogram["recruitee"] ?? 0) + 1;
            foundViaCareersCname++;
            found = true;
            break;
          }
        }
        if (found) break;
      } catch {
        // CNAME lookup failed for this subdomain
      }
    }

    if (found) continue;

    // Try HTTP redirect detection
    for (const prefix of CAREERS_PREFIXES.slice(0, 3)) {
      const careersUrl = `https://${prefix}.${baseDomain}`;
      try {
        const resp = await fetch(careersUrl, {
          redirect: "manual",
          signal: AbortSignal.timeout(10000),
        });
        const location = resp.headers.get("location") ?? "";
        if (location.includes("greenhouse")) {
          console.log(
            `  ${company.name.padEnd(28)} HTTP ${prefix}.${baseDomain} → ${location.slice(0, 60)} → GREENHOUSE`,
          );
          atsHistogram["greenhouse"] = (atsHistogram["greenhouse"] ?? 0) + 1;
          foundViaHttpRedirect++;
          found = true;
          break;
        } else if (location.includes("lever")) {
          console.log(
            `  ${company.name.padEnd(28)} HTTP ${prefix}.${baseDomain} → ${location.slice(0, 60)} → LEVER`,
          );
          atsHistogram["lever"] = (atsHistogram["lever"] ?? 0) + 1;
          foundViaHttpRedirect++;
          found = true;
          break;
        } else if (location.includes("ashby")) {
          console.log(
            `  ${company.name.padEnd(28)} HTTP ${prefix}.${baseDomain} → ${location.slice(0, 60)} → ASHBY`,
          );
          atsHistogram["ashby"] = (atsHistogram["ashby"] ?? 0) + 1;
          foundViaHttpRedirect++;
          found = true;
          break;
        }
      } catch {
        // HTTP fetch failed
      }
    }

    if (!found) {
      console.log(
        `  ${company.name.padEnd(28)} UNREACHABLE (no careers CNAME or redirect)`,
      );
      atsHistogram["unreachable"] = (atsHistogram["unreachable"] ?? 0) + 1;
      stillUnreachable++;
    }
  }

  console.log();
  console.log("─".repeat(80));
  console.log("  ATS HISTOGRAM (30-company sample of the 440 unreachable)");
  console.log("─".repeat(80));
  console.log();
  for (const [ats, count] of Object.entries(atsHistogram).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(
      `  ${ats.padEnd(20)} ${count} (${((count / 30) * 100).toFixed(0)}%)`,
    );
  }
  console.log();

  console.log("─".repeat(80));
  console.log("  DIAGNOSTIC SUMMARY");
  console.log("─".repeat(80));
  console.log();
  console.log(`  Found via careers CNAME:    ${foundViaCareersCname}/30`);
  console.log(`  Found via HTTP redirect:    ${foundViaHttpRedirect}/30`);
  console.log(`  Still unreachable:          ${stillUnreachable}/30`);
  console.log();
  console.log(
    `  CNAME path root cause: Slugger looks up CNAME on the main domain`,
  );
  console.log(`  (e.g. stripe.com), but ATS CNAMEs are on careers subdomains`);
  console.log(`  (e.g. careers.stripe.com → boards.greenhouse.io).`);
  console.log(
    `  Fix: try CNAME on common careers subdomains before slug probe.`,
  );
  console.log();

  // ── Extrapolation ──────────────────────────────────────────────────────────
  if (foundViaCareersCname + foundViaHttpRedirect > 0) {
    const recoveryRate = (foundViaCareersCname + foundViaHttpRedirect) / 30;
    const projectedRecovery = Math.round(unresolved.length * recoveryRate);
    console.log(
      `  PROJECTED RECOVERY: ${projectedRecovery} of ${unresolved.length} unresolved`,
    );
    console.log(
      `  (sample rate ${(recoveryRate * 100).toFixed(0)}% × ${unresolved.length})`,
    );
    console.log();
  }

  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
