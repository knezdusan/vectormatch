// v2 Corpus Expansion — Frontend Job Scanner (P2-2 Discovery Layer)
// src/lib/jobs/seeders/daily-sources/frontend-job-scanner.ts
//
// Inverts the discovery model: instead of "find companies with ATS → poll all
// their jobs → hope some are frontend", it becomes "find frontend jobs →
// extract the company → add to polling." This is the highest-impact new source
// for the mission of serving frontend/web developers.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Run Brave Search queries scoped to each ATS domain with frontend keywords:
//    site:boards.greenhouse.io ("React" OR "Next.js" OR "TypeScript" OR ...)
//    site:jobs.lever.co ("React" OR "Next.js" OR "TypeScript" OR ...)
//    site:jobs.ashbyhq.com ("React" OR "Next.js" OR "TypeScript" OR ...)
// 2. Extract the company slug from each result URL (e.g.,
//    boards.greenhouse.io/companyname/jobs/123 → slug = "companyname")
// 3. Insert into company table with discoverySource = "frontend_job_scanner"
// 4. The scorer (P0-1) will assign these companies a positive sourceOrigin
//    bonus (+15 for frontend_job_scanner, same as github_probe/yc_directory),
//    promoting them to active_hot if they also have a positive employee count
//    signal.
//
// ── Env var requirement ──────────────────────────────────────────────────────
// Requires BRAVE_SEARCH_API_KEY in .env. The Brave Search free tier allows
// 2,000 queries/month. This scanner runs 9 queries/run (3 query variants ×
// 3 ATS domains) every 6h = 36 queries/day × 30 days = 1,080 queries/month —
// within the free tier (v4 lock §1-C.10 scaled from 3 to 9 queries/run).
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 10-30 frontend-hiring companies/day. The research report confirms 350-450
// new Next.js-specific listings per weekday globally; even capturing 5-10%
// via Brave Search indexing yields 20-45 companies/day.
//
// See docs/reports/CORPUS_ALIGNMENT_SESSION_HANDOFF.md §P2-2.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { extractCompaniesFromResults } from "@/lib/jobs/seeders/batch-sources/google-cse";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";

/** Results per query (Brave API max is 20 for free tier). */
const RESULTS_PER_QUERY = 20;

/**
 * ATS domains to search, mapped to their ATS source.
 * Focus on the three MVP-priority ATS platforms with public job boards.
 */
const FRONTEND_ATS_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
];

/**
 * Frontend technology keywords to append to site-scoped queries.
 * These discover companies whose ATS postings mention frontend technologies.
 * The keyword list is intentionally broad — we want to catch companies hiring
 * for any frontend role, not just specific frameworks.
 */
export const FRONTEND_KEYWORDS =
  '("React" OR "Next.js" OR "TypeScript" OR "Frontend" OR "Vue.js" OR "Angular" OR "Svelte" OR "GraphQL" OR "CSS" OR "Web Developer")';

/**
 * Remote-specific frontend keywords (v4 lock §1-C.10 — scale frontend_job_scanner).
 * Separate query variant that adds "remote" to the keyword clause to surface
 * global-remote frontend roles specifically — the North Star metric target.
 */
export const REMOTE_FRONTEND_KEYWORDS =
  '(remote) ("React" OR "Next.js" OR "TypeScript" OR "Frontend" OR "Vue.js" OR "Angular" OR "Svelte" OR "GraphQL" OR "Web Developer")';

/**
 * Senior frontend keywords — targets senior/staff/lead roles which are more
 * likely to be remote-eligible and match the persona's seniority band.
 */
export const SENIOR_FRONTEND_KEYWORDS =
  '("Senior" OR "Staff" OR "Lead") ("Frontend" OR "React" OR "Next.js" OR "Web")';

// ── Types ────────────────────────────────────────────────────────────────────

export interface FrontendJobScannerConfig {
  /** Brave Search API key (BRAVE_SEARCH_API_KEY env var). */
  apiKey: string;
}

export interface FrontendJobScannerResult {
  /** Total search results found across all queries. */
  totalResultsFound: number;
  /** Unique company slugs extracted from search results. */
  uniqueCompanySlugs: number;
  /** Queries executed. */
  queriesExecuted: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if the API call failed. */
  error?: string;
}

// ── Pure function: build Brave Search query for a given ATS domain ───────────

/**
 * Build a Brave Search query string for a given ATS domain with frontend
 * keywords.
 *
 * @param domain   The ATS domain (e.g., "boards.greenhouse.io")
 * @returns        The query string (e.g., 'site:boards.greenhouse.io ("React" OR ...)')
 */
export function buildFrontendQuery(domain: string): string {
  return `site:${domain} ${FRONTEND_KEYWORDS}`;
}

/**
 * Build a remote-scoped frontend query (v4 lock §1-C.10).
 * Adds "remote" to the keyword clause to surface global-remote roles.
 */
export function buildRemoteFrontendQuery(domain: string): string {
  return `site:${domain} ${REMOTE_FRONTEND_KEYWORDS}`;
}

/**
 * Build a senior frontend query (v4 lock §1-C.10).
 * Targets senior/staff/lead roles which are more likely remote-eligible.
 */
export function buildSeniorFrontendQuery(domain: string): string {
  return `site:${domain} ${SENIOR_FRONTEND_KEYWORDS}`;
}

/**
 * All query builder functions — used by the scanner to run multiple variants
 * per ATS domain (v4 lock §1-C.10: scale from 3 queries/run to 9 queries/run).
 */
const QUERY_BUILDERS: Array<{
  name: string;
  build: (domain: string) => string;
}> = [
  { name: "frontend", build: buildFrontendQuery },
  { name: "remote-frontend", build: buildRemoteFrontendQuery },
  { name: "senior-frontend", build: buildSeniorFrontendQuery },
];

// ── Internal: execute a single Brave Search query ────────────────────────────

interface BraveSearchResultItem {
  url: string;
  title?: string;
  description?: string;
}

interface BraveSearchResponse {
  web?: { results?: BraveSearchResultItem[] };
  error?: { message?: string };
}

async function executeBraveQuery(
  query: string,
  config: FrontendJobScannerConfig,
  fetchFn: FetchFn,
  options?: { freshness?: string },
): Promise<BraveSearchResponse> {
  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(RESULTS_PER_QUERY));
  if (options?.freshness) {
    url.searchParams.set("freshness", options.freshness);
  }

  const response = await fetchFn(url.toString(), {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": config.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Brave Search API error: HTTP ${response.status} ${response.statusText}`,
    );
  }

  const json = await response.json();
  if (
    typeof json === "object" &&
    json !== null &&
    "error" in json &&
    (json as BraveSearchResponse).error
  ) {
    throw new Error(
      `Brave Search API error: ${(json as BraveSearchResponse).error?.message ?? "Unknown error"}`,
    );
  }

  return json as BraveSearchResponse;
}

// ── Main scanner function ────────────────────────────────────────────────────

/**
 * Run the frontend job scanner. Searches for frontend-keyword job postings
 * on Greenhouse, Lever, and Ashby, extracts company slugs from result URLs,
 * and inserts them into the company table with
 * `discoverySource = "frontend_job_scanner"`.
 *
 * @param config   Brave Search API key
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @param options  Optional: freshness (e.g. "pd" for past day)
 * @returns        Result with counts and insert metrics
 */
export async function runFrontendJobScanner(
  config: FrontendJobScannerConfig,
  fetchFn: FetchFn = fetch,
  options?: { freshness?: string },
): Promise<FrontendJobScannerResult> {
  let totalResultsFound = 0;
  let queriesExecuted = 0;
  const allInputs: SeedCompanyInput[] = [];
  const seenKeys = new Set<string>();

  try {
    for (const { domain } of FRONTEND_ATS_DOMAINS) {
      // v4 lock §1-C.10: run all query variants per ATS domain (3 variants
      // × 3 domains = 9 queries/run, up from 3 queries/run).
      for (const { build } of QUERY_BUILDERS) {
        const query = build(domain);
        const response = await executeBraveQuery(
          query,
          config,
          fetchFn,
          options,
        );
        queriesExecuted++;
        const results = response.web?.results ?? [];
        totalResultsFound += results.length;

        // Map Brave results to the format extractCompaniesFromResults expects
        const items = results.map((r) => ({ link: r.url }));
        const inputs = extractCompaniesFromResults(items, query);
        for (const input of inputs) {
          const key = `${input.atsSource}:${input.atsSlug}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            // Override discoverySource to frontend_job_scanner
            allInputs.push({
              ...input,
              discoverySource: "frontend_job_scanner",
              discoveryContext: `frontend-job-scanner:keyword:${query.slice(0, 80)}`,
            });
          }
        }
      }
    }

    const insertResult = await insertDiscoveredCompanies(allInputs);

    return {
      totalResultsFound,
      uniqueCompanySlugs: allInputs.length,
      queriesExecuted,
      insertResult,
    };
  } catch (error) {
    return {
      totalResultsFound,
      uniqueCompanySlugs: allInputs.length,
      queriesExecuted,
      insertResult: {
        inserted: 0,
        skipped: 0,
        rejected: [],
        insertedCompanyIds: [],
        insertedCompanies: [],
        aggregatorFiltered: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Daily variant of the frontend job scanner. Same as the base scanner but with
 * `freshness=pd` (past day) to catch newly-indexed frontend job postings.
 *
 * @param config   Brave Search API key
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and insert metrics
 */
export async function runFrontendJobScannerDaily(
  config: FrontendJobScannerConfig,
  fetchFn: FetchFn = fetch,
): Promise<FrontendJobScannerResult> {
  return runFrontendJobScanner(config, fetchFn, { freshness: "pd" });
}
