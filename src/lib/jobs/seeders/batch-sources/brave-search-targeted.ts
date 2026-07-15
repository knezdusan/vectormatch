// S4: Targeted Brave Search Query Templates
// src/lib/jobs/seeders/batch-sources/brave-search-targeted.ts
//
// Sharpens the proven best source (brave-search/google_cse = 264 addressable
// jobs, 44% of total) with stack+scope queries against ATS-hosted job pages.
//
// Instead of bare `site:boards.greenhouse.io` queries, these templates combine:
//   ATS domain × stack keyword × remote-scope keyword
//
// Each hit = company + ATS + stack + remote-scope in one result — the whole
// fingerprint pre-assembled. This is query engineering only, no new
// infrastructure. Reuses the existing Brave Search API client + URL extraction.
//
// ── Query matrix ─────────────────────────────────────────────────────────────
// ATS domains: boards.greenhouse.io, jobs.lever.co, jobs.ashbyhq.com,
//              jobs.smartrecruiters.com, apply.workable.com, recruitee.com
// Stack keywords: "Laravel", "Next.js", "Node.js", "WordPress", "React",
//                  "TypeScript", "PHP", "JavaScript", "Vue", "fullstack"
// Scope keywords: "worldwide", "anywhere", "fully remote", "global", "remote"
//
// Full matrix = 6 ATS × 10 stacks × 5 scopes = 300 queries
// Brave free tier = 2,000 queries/month → run 300 queries weekly (1,200/month)
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 300 queries × 20 results/query = 6,000 raw results
// After URL extraction + dedup: ~200-500 unique companies
// After Fingerprint v2: ~100-300 enrolled
//
// See Advisor Directive 02 §S4 for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import {
  type BraveSearchConfig,
  executeBraveQuery,
} from "@/lib/jobs/seeders/batch-sources/brave-search";
import { extractCompaniesFromResults } from "@/lib/jobs/seeders/batch-sources/google-cse";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * ATS domains to search, mapped to their ATS source.
 * Same set as the existing brave-search.ts batch sweep.
 */
const ATS_SEARCH_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

/**
 * Web-dev stack keywords to search for in job postings.
 * These are the stacks our personas target (JS/Node/Next, PHP/Laravel/WordPress).
 */
const STACK_KEYWORDS: readonly string[] = [
  "Laravel",
  "Next.js",
  "Node.js",
  "WordPress",
  "React",
  "TypeScript",
  "PHP",
  "JavaScript",
  "Vue",
  "fullstack",
];

/**
 * Remote-scope keywords indicating genuinely-global hiring.
 * These appear in job postings that accept candidates worldwide.
 */
const SCOPE_KEYWORDS: readonly string[] = [
  "worldwide",
  "anywhere",
  "fully remote",
  "global",
  "remote",
];

/**
 * Delay between queries (ms) — respect Brave rate limits.
 * Brave free tier: 2,000 queries/month, 1 query/second.
 */
const QUERY_DELAY_MS = 1100;

// ── Types ────────────────────────────────────────────────────────────────────

export interface TargetedQuery {
  /** The full Brave Search query string (e.g. `site:boards.greenhouse.io "Laravel" "worldwide"`). */
  query: string;
  /** ATS domain targeted. */
  atsDomain: string;
  /** ATS source targeted. */
  atsSource: AtsSource;
  /** Stack keyword used. */
  stackKeyword: string;
  /** Scope keyword used. */
  scopeKeyword: string;
}

export interface TargetedQueryResult {
  query: TargetedQuery;
  resultsFound: number;
  companiesExtracted: number;
}

export interface TargetedSearchResult {
  /** Total queries executed. */
  queriesExecuted: number;
  /** Total search results found across all queries. */
  totalResultsFound: number;
  /** Unique company slugs extracted. */
  uniqueCompanySlugs: number;
  /** Per-query breakdown. */
  perQuery: TargetedQueryResult[];
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if the run failed. */
  error?: string;
}

// ── Pure functions ───────────────────────────────────────────────────────────

/**
 * Generate the full query matrix: ATS domain × stack keyword × scope keyword.
 *
 * @returns Array of TargetedQuery objects
 */
export function generateQueryMatrix(): TargetedQuery[] {
  const queries: TargetedQuery[] = [];

  for (const { domain, source } of ATS_SEARCH_DOMAINS) {
    for (const stack of STACK_KEYWORDS) {
      for (const scope of SCOPE_KEYWORDS) {
        queries.push({
          query: `site:${domain} "${stack}" "${scope}"`,
          atsDomain: domain,
          atsSource: source,
          stackKeyword: stack,
          scopeKeyword: scope,
        });
      }
    }
  }

  return queries;
}

/**
 * Generate a reduced query matrix for the free tier (2,000 queries/month).
 *
 * Strategy: run the full matrix (300 queries) weekly. This uses 1,200
 * queries/month (300 × 4 weeks), leaving 800 for the daily fresh sweep.
 *
 * For daily runs, use a rotating subset — each day runs a different
 * ATS × stack combination across all 5 scopes (5 queries/day).
 *
 * @param dayOfWeek  0-6 (for daily rotation)
 * @returns          Subset of queries for this day
 */
export function generateDailyQuerySubset(dayOfWeek: number): TargetedQuery[] {
  const fullMatrix = generateQueryMatrix();
  // 6 ATS × 10 stacks = 60 combinations. 60 / 7 days ≈ 9 per day.
  // Each combination has 5 scope variants → ~45 queries/day.
  const combinationsPerDay = Math.ceil(60 / 7);
  const startIdx = (dayOfWeek * combinationsPerDay) % 60;

  // Group by (atsDomain, stackKeyword) — each group has 5 scope variants
  const groups: TargetedQuery[][] = [];
  const seenKeys = new Set<string>();
  for (const q of fullMatrix) {
    const key = `${q.atsDomain}:${q.stackKeyword}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      groups.push([]);
    }
    const groupIdx = [...seenKeys].indexOf(key);
    if (groups[groupIdx]) groups[groupIdx].push(q);
  }

  const selectedGroups = groups.slice(startIdx, startIdx + combinationsPerDay);
  return selectedGroups.flat();
}

// ── Main targeted search function ────────────────────────────────────────────

/**
 * Run the S4 targeted Brave Search sweep. Executes the full query matrix
 * (or a daily subset), extracts company slugs from result URLs, and inserts
 * them into the company table.
 *
 * Each hit pre-assembles the fingerprint: company + ATS + stack + remote-scope.
 * The stack and scope keywords in the query ensure that results are companies
 * hiring for web-dev roles with global-remote scope — the Fingerprint v2
// gate is still applied at enrollment, but these queries pre-filter at the
// search engine level, dramatically increasing yield per query.
 *
 * @param config     Brave Search API key
 * @param fetchFn    Injectable fetch (defaults to global fetch)
 * @param options    Optional: daily subset mode, dry-run
 * @returns          Result with per-query breakdown and insert metrics
 */
export async function runTargetedBraveSearch(
  config: BraveSearchConfig,
  fetchFn: FetchFn = fetch,
  options?: {
    /** If true, run only the daily subset (rotating by day of week). */
    dailySubset?: boolean;
    /** Day of week (0-6) for daily subset rotation. Defaults to today. */
    dayOfWeek?: number;
    /** If true, generate queries but don't execute them (for verification). */
    dryRun?: boolean;
  },
): Promise<TargetedSearchResult> {
  const queries = options?.dailySubset
    ? generateDailyQuerySubset(options?.dayOfWeek ?? new Date().getDay())
    : generateQueryMatrix();

  if (options?.dryRun) {
    return {
      queriesExecuted: 0,
      totalResultsFound: 0,
      uniqueCompanySlugs: 0,
      perQuery: queries.map((q) => ({
        query: q,
        resultsFound: 0,
        companiesExtracted: 0,
      })),
      insertResult: {
        inserted: 0,
        skipped: 0,
        rejected: [],
        insertedCompanyIds: [],
        insertedCompanies: [],
        aggregatorFiltered: 0,
      },
    };
  }

  const perQuery: TargetedQueryResult[] = [];
  const allInputs: SeedCompanyInput[] = [];
  const seenKeys = new Set<string>();
  let totalResultsFound = 0;

  try {
    for (let i = 0; i < queries.length; i++) {
      const tq = queries[i];
      const response = await executeBraveQuery(tq.query, config, fetchFn);
      const results = response.web?.results ?? [];
      totalResultsFound += results.length;

      // Map Brave results to the format extractCompaniesFromResults expects
      const items = results.map((r: { url: string }) => ({ link: r.url }));
      const inputs = extractCompaniesFromResults(items, tq.query);

      let newCompanies = 0;
      for (const input of inputs) {
        const key = `${input.atsSource}:${input.atsSlug}`;
        if (!seenKeys.has(key)) {
          seenKeys.add(key);
          allInputs.push(input);
          newCompanies++;
        }
      }

      perQuery.push({
        query: tq,
        resultsFound: results.length,
        companiesExtracted: newCompanies,
      });

      // Rate limit: 1 query/second
      if (i < queries.length - 1) {
        await new Promise((r) => setTimeout(r, QUERY_DELAY_MS));
      }
    }

    const insertResult = await insertDiscoveredCompanies(allInputs);

    return {
      queriesExecuted: queries.length,
      totalResultsFound,
      uniqueCompanySlugs: allInputs.length,
      perQuery,
      insertResult,
    };
  } catch (error) {
    return {
      queriesExecuted: perQuery.length,
      totalResultsFound,
      uniqueCompanySlugs: allInputs.length,
      perQuery,
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
