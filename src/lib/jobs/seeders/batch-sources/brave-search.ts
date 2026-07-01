// B2/D1: Brave Search Seeder — Batch + Daily (Sprint 3 Task 7)
// src/lib/jobs/seeders/batch-sources/brave-search.ts
//
// Replaces Google CSE with the Brave Search API. Brave Search indexes career
// pages that use Greenhouse, Lever, Ashby, SmartRecruiters, Workable, and
// Recruitee — same URL patterns as Google CSE. The pure URL extraction
// functions (extractSlugFromAtsUrl, inferAtsSourceFromUrl,
// extractCompaniesFromResults) are reused from google-cse.ts since they
// operate on URLs, not on the search API response format.
//
// ── B2: Batch Sweep ──────────────────────────────────────────────────────────
// Runs `site:boards.greenhouse.io`, `site:jobs.lever.co`, etc. for all 6 ATS
// domains. Brave free tier: 2,000 queries/month, 20 results/query → ~120
// results per sweep (6 queries × 20 results).
//
// ── D1: Daily Fresh ──────────────────────────────────────────────────────────
// Same queries but with `freshness=pd` (past day) to catch newly-indexed
// pages. Runs twice daily (00:00 and 14:00 UTC).
//
// ── API differences from Google CSE ──────────────────────────────────────────
//   - Auth via `X-Subscription-Token` header (not query param)
//   - No CSE ID needed — Brave searches the whole web
//   - Response: `{ web: { results: [{ url, title, description }] } }`
//   - Freshness: `freshness=pd` (past day) instead of `dateRestrict=d1`
//   - Results per query: up to 20 (vs Google's 10)

import { z } from "zod";
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
 * Same as Google CSE — `site:` queries work identically in Brave.
 */
const ATS_SEARCH_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

// ── Zod schemas ──────────────────────────────────────────────────────────────

const braveResultItemSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});

const braveSearchResponseSchema = z.object({
  web: z
    .object({
      results: z.array(braveResultItemSchema).default([]),
    })
    .optional(),
  query: z
    .object({
      original: z.string().optional(),
    })
    .optional(),
  type: z.string().optional(),
  error: z
    .object({
      code: z.string().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

// ── Types ────────────────────────────────────────────────────────────────────

type BraveSearchResponse = z.infer<typeof braveSearchResponseSchema>;

export interface BraveSearchResult {
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

export interface BraveSearchConfig {
  apiKey: string;
}

export {
  extractSlugFromAtsUrl,
  inferAtsSourceFromUrl,
} from "@/lib/jobs/seeders/batch-sources/ats-url-utils";
// Re-export the pure functions for callers that import from brave-search
export { extractCompaniesFromResults } from "@/lib/jobs/seeders/batch-sources/google-cse";

// ── API client: execute a single Brave Search query ──────────────────────────

/**
 * Execute a single Brave Search query and return parsed results.
 *
 * @param query     The search query (e.g. "site:boards.greenhouse.io")
 * @param config    Brave Search API key
 * @param fetchFn   Injectable fetch function
 * @param options   Optional: freshness (e.g. "pd" for past day)
 * @returns         Parsed and validated search response
 */
async function executeBraveQuery(
  query: string,
  config: BraveSearchConfig,
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
  const parsed = braveSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Brave Search response failed Zod validation: ${parsed.error.message}`,
    );
  }

  // Check for API-level error
  if (parsed.data.error) {
    throw new Error(
      `Brave Search API error: ${parsed.data.error.message ?? "Unknown error"}`,
    );
  }

  return parsed.data;
}

// ── B2: Batch sweep ──────────────────────────────────────────────────────────

/**
 * Run the Brave Search batch sweep (B2). Searches for `site:{ats-domain}`
 * across all 6 ATS platforms, extracts slugs from result URLs, and inserts
 * them into the company table.
 *
 * @param config    Brave Search API key
 * @param fetchFn   Injectable fetch (defaults to global fetch)
 * @returns         Result with counts and insert metrics
 */
export async function runBraveSearchBatch(
  config: BraveSearchConfig,
  fetchFn: FetchFn = fetch,
): Promise<BraveSearchResult> {
  return runBraveSearchInternal(config, fetchFn, false);
}

// ── D1: Daily fresh sweep ────────────────────────────────────────────────────

/**
 * Run the Brave Search daily sweep (D1). Same as batch but with
 * `freshness=pd` (past day) to catch newly-indexed pages.
 *
 * @param config    Brave Search API key
 * @param fetchFn   Injectable fetch (defaults to global fetch)
 * @returns         Result with counts and insert metrics
 */
export async function runBraveSearchDaily(
  config: BraveSearchConfig,
  fetchFn: FetchFn = fetch,
): Promise<BraveSearchResult> {
  return runBraveSearchInternal(config, fetchFn, true);
}

// ── Internal implementation ──────────────────────────────────────────────────

async function runBraveSearchInternal(
  config: BraveSearchConfig,
  fetchFn: FetchFn,
  isDaily: boolean,
): Promise<BraveSearchResult> {
  const options = isDaily ? { freshness: "pd" } : undefined;

  let totalResultsFound = 0;
  let queriesExecuted = 0;
  const allInputs: SeedCompanyInput[] = [];
  const seenKeys = new Set<string>();

  try {
    for (const { domain } of ATS_SEARCH_DOMAINS) {
      const query = `site:${domain}`;
      const response = await executeBraveQuery(query, config, fetchFn, options);
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
          allInputs.push(input);
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
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
