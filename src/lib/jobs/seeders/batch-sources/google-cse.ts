// DEPRECATED: Google CSE API discontinued for new customers (June 2026).
// Replaced by brave-search.ts. This file is retained because brave-search.ts
// reuses the pure extraction functions (extractCompaniesFromResults,
// extractSlugFromAtsUrl, inferAtsSource) defined here. Do NOT register any
// Inngest functions from this file — use brave-search.ts instead.
//
// B2/D1: Google CSE Seeder — Batch + Daily (TDD §2.1, §2.2)
// src/lib/jobs/seeders/batch-sources/google-cse.ts
//
// Uses the Google Custom Search Engine (CSE) API to search for ATS-hosted job
// board pages. Google indexes career pages that use Greenhouse, Lever, Ashby,
// SmartRecruiters, Workable, and Recruitee — each with a distinct URL pattern.
// By running `site:` queries against these domains, we can extract ATS slugs
// directly from the URL paths.
//
// ── B2: Batch Sweep ──────────────────────────────────────────────────────────
// Runs `site:boards.greenhouse.io`, `site:jobs.lever.co`, etc. for all 6 ATS
// domains. 100 free queries/day, ~10 results/query → ~1000 results per sweep.
// Extract slugs from URL paths via regex. Insert directly (no Slugger).
//
// ── D1: Daily Date-Restricted ────────────────────────────────────────────────
// Same queries but with `dateRestrict=d1` (last 24 hours) and `sort=date` to
// catch newly-indexed pages. Runs twice daily (00:00 and 14:00 UTC).
//
// ── URL patterns ─────────────────────────────────────────────────────────────
// Greenhouse:       boards.greenhouse.io/{slug}/jobs/...     → path segment 1
// Lever:            jobs.lever.co/{slug}/{jobId}              → path segment 1
// Ashby:            jobs.ashbyhq.com/{slug}/{jobId}           → path segment 1
// SmartRecruiters:  jobs.smartrecruiters.com/{slug}/...       → path segment 1
// Workable:         apply.workable.com/{slug}/j/{jobId}       → path segment 1
// Recruitee:        {slug}.recruitee.com/o/{jobId}            → subdomain
//
// See TDD §2.1 (B2) and §2.2 (D1) for the full specification.

import { z } from "zod";
import {
  ATS_DOMAIN_MAP,
  extractSlugFromAtsUrl as extractSlugFromUrl,
  inferAtsSourceFromUrl,
} from "@/lib/jobs/seeders/batch-sources/ats-url-utils";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// Re-export for callers that import these from google-cse (e.g. brave-search.ts)
export {
  extractSlugFromAtsUrl as extractSlugFromUrl,
  inferAtsSourceFromUrl,
} from "@/lib/jobs/seeders/batch-sources/ats-url-utils";

// ── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1";

/** Results per query (API max is 10 for free tier). */
const RESULTS_PER_QUERY = 10;

/**
 * ATS domains to search, mapped to their ATS source.
 * These are the `site:` targets for Google CSE queries.
 */
const ATS_SEARCH_DOMAINS = ATS_DOMAIN_MAP;

// ── Zod schemas ──────────────────────────────────────────────────────────────

const cseResultItemSchema = z.object({
  link: z.string(),
  title: z.string().optional(),
});

const cseSearchResponseSchema = z.object({
  items: z.array(cseResultItemSchema).default([]),
  queries: z
    .object({
      nextPage: z
        .array(z.object({ startIndex: z.number().optional() }))
        .optional(),
    })
    .optional(),
  error: z
    .object({
      code: z.number().optional(),
      message: z.string().optional(),
    })
    .optional(),
});

// ── Types ────────────────────────────────────────────────────────────────────

type CseSearchResponse = z.infer<typeof cseSearchResponseSchema>;

export interface GoogleCseResult {
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

export interface GoogleCseConfig {
  apiKey: string;
  cseId: string;
}

// ── Pure function: extract company inputs from search results ────────────────

/**
 * Extract unique SeedCompanyInput tuples from Google CSE search result items.
 * Deduplicates by (atsSource, atsSlug) — multiple results for the same company
 * only produce one entry.
 */
export function extractCompaniesFromResults(
  items: { link: string }[],
  searchQuery: string,
): SeedCompanyInput[] {
  const seen = new Set<string>();
  const inputs: SeedCompanyInput[] = [];

  for (const item of items) {
    const atsSource = inferAtsSourceFromUrl(item.link);
    if (!atsSource) continue;

    const slug = extractSlugFromUrl(item.link, atsSource);
    if (!slug) continue;

    const key = `${atsSource}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    inputs.push({
      atsSlug: slug,
      atsSource,
      discoverySource: "google_cse",
      discoveryContext: `query:"${searchQuery}"`,
    });
  }

  return inputs;
}

// ── API client: execute a single CSE query ───────────────────────────────────

/**
 * Execute a single Google CSE query and return parsed results.
 *
 * @param query     The search query (e.g. "site:boards.greenhouse.io")
 * @param config    Google CSE API key + CSE ID
 * @param fetchFn   Injectable fetch function
 * @param options   Optional: dateRestrict (e.g. "d1"), sort (e.g. "date")
 * @returns         Parsed and validated search response
 */
async function executeCseQuery(
  query: string,
  config: GoogleCseConfig,
  fetchFn: FetchFn,
  options?: { dateRestrict?: string; sort?: string },
): Promise<CseSearchResponse> {
  const url = new URL(GOOGLE_CSE_URL);
  url.searchParams.set("key", config.apiKey);
  url.searchParams.set("cx", config.cseId);
  url.searchParams.set("q", query);
  url.searchParams.set("num", String(RESULTS_PER_QUERY));
  if (options?.dateRestrict) {
    url.searchParams.set("dateRestrict", options.dateRestrict);
  }
  if (options?.sort) {
    url.searchParams.set("sort", options.sort);
  }

  const response = await fetchFn(url.toString());
  const json = await response.json();
  const parsed = cseSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Google CSE response failed Zod validation: ${parsed.error.message}`,
    );
  }

  // Check for API-level error
  if (parsed.data.error) {
    throw new Error(
      `Google CSE API error: ${parsed.data.error.message ?? "Unknown error"}`,
    );
  }

  return parsed.data;
}

// ── B2: Batch sweep ──────────────────────────────────────────────────────────

/**
 * Run the Google CSE batch sweep (B2). Searches for `site:{ats-domain}` across
 * all 6 ATS platforms, extracts slugs from result URLs, and inserts them into
 * the company table.
 *
 * @param config    Google CSE API key + CSE ID
 * @param fetchFn   Injectable fetch (defaults to global fetch)
 * @returns         Result with counts and insert metrics
 */
export async function runGoogleCseBatch(
  config: GoogleCseConfig,
  fetchFn: FetchFn = fetch,
): Promise<GoogleCseResult> {
  return runGoogleCseInternal(config, fetchFn, false);
}

// ── D1: Daily date-restricted sweep ──────────────────────────────────────────

/**
 * Run the Google CSE daily sweep (D1). Same as batch but with `dateRestrict=d1`
 * (last 24 hours) and `sort=date` to catch newly-indexed pages.
 *
 * @param config    Google CSE API key + CSE ID
 * @param fetchFn   Injectable fetch (defaults to global fetch)
 * @returns         Result with counts and insert metrics
 */
export async function runGoogleCseDaily(
  config: GoogleCseConfig,
  fetchFn: FetchFn = fetch,
): Promise<GoogleCseResult> {
  return runGoogleCseInternal(config, fetchFn, true);
}

// ── Internal implementation ──────────────────────────────────────────────────

async function runGoogleCseInternal(
  config: GoogleCseConfig,
  fetchFn: FetchFn,
  isDaily: boolean,
): Promise<GoogleCseResult> {
  const options = isDaily ? { dateRestrict: "d1", sort: "date" } : undefined;

  let totalResultsFound = 0;
  let queriesExecuted = 0;
  const allInputs: SeedCompanyInput[] = [];
  const seenKeys = new Set<string>();

  try {
    for (const { domain } of ATS_SEARCH_DOMAINS) {
      const query = `site:${domain}`;
      const response = await executeCseQuery(query, config, fetchFn, options);
      queriesExecuted++;
      totalResultsFound += response.items.length;

      const inputs = extractCompaniesFromResults(response.items, query);
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
        aggregatorFiltered: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
