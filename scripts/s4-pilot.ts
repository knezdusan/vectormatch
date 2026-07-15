/**
 * S4 Brave Search Targeted — Pilot or Full Matrix
 *
 * Runs targeted queries (ATS domain × stack × scope) against Brave Search
 * free tier to discover companies hiring for web-dev roles.
 *
 * Modes:
 *   --full    Run the full 300-query matrix (6 ATS × 10 stacks × 5 scopes)
 *             Uses ~15% of monthly Brave quota (300/2000).
 *   (default) Run the 30-query pilot (6 ATS × 5 stacks × 1 scope)
 *
 * Usage:
 *   npx tsx scripts/s4-pilot.ts           # 30-query pilot
 *   npx tsx scripts/s4-pilot.ts --full    # 300-query full matrix
 */
import {
  generateQueryMatrix,
  type TargetedQuery,
} from "@/lib/jobs/seeders/batch-sources/brave-search-targeted";
import { extractCompaniesFromResults } from "@/lib/jobs/seeders/batch-sources/google-cse";

const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY!;
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

interface BraveSearchResponse {
  web?: { results?: { url?: string; title?: string; description?: string }[] };
  query?: { original?: string };
}

/**
 * Execute a single Brave Search query directly.
 */
async function executeBraveQueryDirect(
  query: string,
  fetchFn: typeof fetch,
): Promise<{
  results: { url?: string; title?: string; description?: string }[];
  resultsFound: number;
  error?: string;
}> {
  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", "20");

  try {
    const resp = await fetchFn(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": BRAVE_API_KEY,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) {
      return { results: [], resultsFound: 0, error: `HTTP ${resp.status}` };
    }

    const data: BraveSearchResponse = await resp.json();
    const results = data.web?.results ?? [];
    return { results, resultsFound: results.length };
  } catch (err) {
    return {
      results: [],
      resultsFound: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  const isFullMode = process.argv.includes("--full");

  console.log("═".repeat(80));
  if (isFullMode) {
    console.log("  S4 FULL 300-QUERY MATRIX — Brave Search Targeted");
    console.log("  6 ATS × 10 stacks × 5 scopes");
  } else {
    console.log("  S4 30-QUERY PILOT — Brave Search Targeted");
    console.log("  ATS domain × stack × scope (worldwide only)");
  }
  console.log("═".repeat(80));
  console.log();

  // Build query set
  const fullMatrix = generateQueryMatrix();
  const pilotStacks = ["Laravel", "Next.js", "React", "PHP", "fullstack"];
  const pilotQueries = isFullMode
    ? fullMatrix
    : fullMatrix.filter(
        (q) =>
          pilotStacks.includes(q.stackKeyword) &&
          q.scopeKeyword === "worldwide",
      );

  console.log(`  Pilot queries: ${pilotQueries.length}`);
  console.log(
    `  ATS domains: ${[...new Set(pilotQueries.map((q) => q.atsDomain))].join(", ")}`,
  );
  console.log(`  Stacks: ${pilotStacks.join(", ")}`);
  console.log(`  Scope: worldwide only`);
  console.log();

  const config = {
    apiKey: BRAVE_API_KEY,
    country: "",
    search_type: "web",
  };

  const results: {
    query: TargetedQuery;
    resultsFound: number;
    companiesExtracted: number;
    error?: string;
  }[] = [];

  const allCompanies: { slug: string; atsSource: string; url: string }[] = [];
  const uniqueSlugs = new Set<string>();

  for (let i = 0; i < pilotQueries.length; i++) {
    const q = pilotQueries[i];
    process.stdout.write(
      `  [${i + 1}/${pilotQueries.length}] ${q.query.slice(0, 60)}...`,
    );

    try {
      const searchResult = await executeBraveQueryDirect(q.query, fetch);

      if (searchResult.error) {
        console.log(` ERROR: ${searchResult.error}`);
        results.push({
          query: q,
          resultsFound: 0,
          companiesExtracted: 0,
          error: searchResult.error,
        });
      } else {
        const companies = extractCompaniesFromResults(
          searchResult.results.map((r) => ({ link: r.url ?? "" })),
          q.atsSource,
        );

        for (const c of companies) {
          const key = `${c.atsSource}:${c.atsSlug}`;
          if (!uniqueSlugs.has(key)) {
            uniqueSlugs.add(key);
            allCompanies.push({
              slug: c.atsSlug,
              atsSource: c.atsSource,
              url: "",
            });
          }
        }

        console.log(
          ` ${searchResult.resultsFound} results, ${companies.length} companies`,
        );
        results.push({
          query: q,
          resultsFound: searchResult.resultsFound,
          companiesExtracted: companies.length,
        });
      }
    } catch (err) {
      console.log(
        ` EXCEPTION: ${err instanceof Error ? err.message : String(err)}`,
      );
      results.push({
        query: q,
        resultsFound: 0,
        companiesExtracted: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Rate limit: 1 query/second
    if (i < pilotQueries.length - 1) {
      await new Promise((r) => setTimeout(r, 1100));
    }
  }

  console.log();
  console.log("═".repeat(80));
  console.log("  S4 PILOT RESULTS");
  console.log("═".repeat(80));
  console.log();

  const totalResults = results.reduce((s, r) => s + r.resultsFound, 0);
  const totalErrors = results.filter((r) => r.error).length;
  const totalCompanies = results.reduce((s, r) => s + r.companiesExtracted, 0);

  console.log(`  Queries executed:    ${pilotQueries.length}`);
  console.log(`  Total results:       ${totalResults}`);
  console.log(`  Total errors:        ${totalErrors}`);
  console.log(`  Companies extracted: ${totalCompanies}`);
  console.log(`  Unique slugs:        ${uniqueSlugs.size}`);
  console.log();

  // ── Per-ATS hit-rate ───────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  PER-ATS HIT-RATE");
  console.log("─".repeat(80));
  console.log();
  const atsGroups: Record<
    string,
    { queries: number; results: number; companies: number }
  > = {};
  for (const r of results) {
    const key = r.query.atsSource;
    if (!atsGroups[key])
      atsGroups[key] = { queries: 0, results: 0, companies: 0 };
    atsGroups[key].queries++;
    atsGroups[key].results += r.resultsFound;
    atsGroups[key].companies += r.companiesExtracted;
  }
  for (const [ats, stats] of Object.entries(atsGroups)) {
    const avgResults = (stats.results / stats.queries).toFixed(1);
    const avgCompanies = (stats.companies / stats.queries).toFixed(1);
    console.log(
      `  ${ats.padEnd(20)} ${stats.queries} queries, avg ${avgResults} results, avg ${avgCompanies} companies`,
    );
  }
  console.log();

  // ── Per-stack hit-rate ─────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  PER-STACK HIT-RATE");
  console.log("─".repeat(80));
  console.log();
  const stackGroups: Record<
    string,
    { queries: number; results: number; companies: number }
  > = {};
  for (const r of results) {
    const key = r.query.stackKeyword;
    if (!stackGroups[key])
      stackGroups[key] = { queries: 0, results: 0, companies: 0 };
    stackGroups[key].queries++;
    stackGroups[key].results += r.resultsFound;
    stackGroups[key].companies += r.companiesExtracted;
  }
  for (const [stack, stats] of Object.entries(stackGroups)) {
    const avgResults = (stats.results / stats.queries).toFixed(1);
    const avgCompanies = (stats.companies / stats.queries).toFixed(1);
    console.log(
      `  ${stack.padEnd(20)} ${stats.queries} queries, avg ${avgResults} results, avg ${avgCompanies} companies`,
    );
  }
  console.log();

  // ── Per-query detail ───────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  PER-QUERY DETAIL");
  console.log("─".repeat(80));
  console.log();
  for (const r of results) {
    const status = r.error ? "ERROR" : `${r.resultsFound} results`;
    console.log(
      `  ${r.query.atsSource.padEnd(16)} ${r.query.stackKeyword.padEnd(12)} ${status.padEnd(12)} ${r.companiesExtracted} companies`,
    );
  }
  console.log();

  // ── Unique companies ───────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log(`  UNIQUE COMPANIES (${uniqueSlugs.size})`);
  console.log("─".repeat(80));
  console.log();
  for (const c of allCompanies) {
    console.log(`  ${c.atsSource.padEnd(16)} ${c.slug}`);
  }
  console.log();

  // ── Extrapolation ──────────────────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  EXTRAPOLATION — full 300-query matrix");
  console.log("─".repeat(80));
  console.log();
  const avgCompaniesPerQuery = totalCompanies / pilotQueries.length;
  const projectedFullMatrix = Math.round(avgCompaniesPerQuery * 300);
  const projectedUnique = Math.round(
    uniqueSlugs.size * (300 / pilotQueries.length),
  );
  console.log(`  Avg companies/query:   ${avgCompaniesPerQuery.toFixed(1)}`);
  console.log(`  Full 300-query matrix: ~${projectedFullMatrix} company hits`);
  console.log(`  Projected unique:      ~${projectedUnique} companies`);
  console.log(
    `  Brave budget:          300 queries = 300/2000 monthly quota (15%)`,
  );
  console.log();

  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
