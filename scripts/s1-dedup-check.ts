/**
 * S1 Dedup Check — Measure net-new companies vs existing corpus
 *
 * Parses the remoteintech/remote-jobs repo, pre-filters to 330, then checks
 * each company against the existing company table by:
 *   1. Canonical name match (case-insensitive, suffix-stripped)
 *   2. Root domain match (extracted from website URL)
 *
 * Reports: total parsed, pre-filtered, already-in-corpus, net-new.
 * This is a CHEAP query — no Slugger, no ATS probes, just DB lookups.
 *
 * Usage: npx tsx scripts/s1-dedup-check.ts
 */
import { neon } from "@neondatabase/serverless";
import { parseRemoteInTechRepo } from "@/lib/jobs/seeders/batch-sources/remoteintech";
import { canonicalizeCompanyName } from "@/lib/jobs/seeders/slugger";

const sql = neon(process.env.DATABASE_URL!);

/** Extract a clean domain from a website URL. */
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
  console.log("  S1 DEDUP CHECK — net-new companies vs existing corpus");
  console.log("═".repeat(80));
  console.log();
  console.log("Parsing remoteintech/remote-jobs repo (this takes ~45s)...");
  console.log();

  const parseResult = await parseRemoteInTechRepo();

  if (parseResult.error) {
    console.error("PARSE ERROR:", parseResult.error);
    process.exit(1);
  }

  console.log(
    `Parsed: ${parseResult.totalFiles} → pre-filtered: ${parseResult.passedPreFilter}`,
  );
  console.log();

  // ── Fetch all existing company names + domains from the DB ─────────────────
  console.log("Fetching existing company names + domains from DB...");
  const existingCompanies = await sql`
    SELECT
      id,
      canonical_name,
      root_domain,
      ats_source,
      ats_slug,
      tier
    FROM company
    WHERE tier != 'dead'
  `;

  console.log(`Existing companies in corpus: ${existingCompanies.length}`);
  console.log();

  // Build lookup maps
  const existingByName = new Map<string, (typeof existingCompanies)[0]>();
  const existingByDomain = new Map<string, (typeof existingCompanies)[0]>();

  for (const c of existingCompanies) {
    if (c.canonical_name) {
      existingByName.set(c.canonical_name.toLowerCase(), c);
    }
    if (c.root_domain) {
      existingByDomain.set(c.root_domain.toLowerCase(), c);
    }
  }

  // ── Check each S1 candidate against the corpus ─────────────────────────────
  let alreadyInCorpus = 0;
  let netNew = 0;
  const matched: { name: string; matchedBy: string; existingTier: string }[] =
    [];
  const netNewCompanies: { name: string; website: string; domain: string }[] =
    [];

  for (const company of parseResult.companies) {
    const canonicalName = canonicalizeCompanyName(company.name);
    const domain = extractDomain(company.website).toLowerCase();

    const nameMatch = existingByName.get(canonicalName);
    const domainMatch = existingByDomain.get(domain);

    if (nameMatch || domainMatch) {
      alreadyInCorpus++;
      const matchedBy = nameMatch
        ? `name:"${nameMatch.canonical_name}"`
        : `domain:"${domainMatch?.root_domain}"`;
      matched.push({
        name: company.name,
        matchedBy,
        existingTier: nameMatch?.tier ?? domainMatch?.tier ?? "unknown",
      });
    } else {
      netNew++;
      netNewCompanies.push({
        name: company.name,
        website: company.website,
        domain,
      });
    }
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  DEDUP RESULTS");
  console.log("─".repeat(80));
  console.log();
  console.log(`  Pre-filtered S1 candidates:  ${parseResult.passedPreFilter}`);
  console.log(
    `  Already in corpus:           ${alreadyInCorpus} (${((alreadyInCorpus / parseResult.passedPreFilter) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  Net-new companies:           ${netNew} (${((netNew / parseResult.passedPreFilter) * 100).toFixed(1)}%)`,
  );
  console.log();

  console.log("─".repeat(80));
  console.log("  ALREADY IN CORPUS (first 30)");
  console.log("─".repeat(80));
  console.log();
  for (const m of matched.slice(0, 30)) {
    console.log(
      `  ${m.name.padEnd(30)} ${m.matchedBy.padEnd(35)} tier=${m.existingTier}`,
    );
  }
  if (matched.length > 30) {
    console.log(`  ... and ${matched.length - 30} more`);
  }
  console.log();

  console.log("─".repeat(80));
  console.log("  NET-NEW COMPANIES (first 30)");
  console.log("─".repeat(80));
  console.log();
  for (const c of netNewCompanies.slice(0, 30)) {
    console.log(`  ${c.name.padEnd(30)} ${c.domain}`);
  }
  if (netNewCompanies.length > 30) {
    console.log(`  ... and ${netNewCompanies.length - 30} more`);
  }
  console.log();

  console.log("═".repeat(80));
  console.log("  VERDICT");
  console.log("═".repeat(80));
  console.log();
  const netNewPct = ((netNew / parseResult.passedPreFilter) * 100).toFixed(1);
  console.log(
    `  ${netNew} net-new companies out of ${parseResult.passedPreFilter} (${netNewPct}%)`,
  );
  console.log(`  This is the number that decides whether S1 was worth it.`);
  console.log(`  Next step: run Slugger on the ${netNew} net-new companies.`);
  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
