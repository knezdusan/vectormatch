// DEPRECATED: Google CSE API discontinued for new customers (June 2026).
// Replaced by brave-search.ts. This file is retained because brave-search.ts
// reuses the pure extraction functions (extractCompaniesFromResults,
// extractSlugFromUrl, inferAtsSource) defined here. Do NOT register any
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
import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1";

/** Results per query (API max is 10 for free tier). */
const RESULTS_PER_QUERY = 10;

/**
 * ATS domains to search, mapped to their ATS source.
 * These are the `site:` targets for Google CSE queries.
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

export type CseSearchResponse = z.infer<typeof cseSearchResponseSchema>;

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

// ── Pure function: extract slug from URL ─────────────────────────────────────

/**
 * Extract the ATS slug from a search result URL.
 *
 * For most ATS platforms, the slug is the first path segment:
 *   boards.greenhouse.io/acme/jobs/123 → "acme"
 *   jobs.lever.co/acme/abc-123         → "acme"
 *   jobs.ashbyhq.com/acme/abc-123      → "acme"
 *   jobs.smartrecruiters.com/acme/...  → "acme"
 *   apply.workable.com/acme/j/ABC123   → "acme"
 *
 * For Recruitee, the slug is the subdomain:
 *   acme.recruitee.com/o/devops        → "acme"
 *
 * @returns  The slug string, or null if it can't be extracted.
 */
export function extractSlugFromUrl(
  url: string,
  atsSource: AtsSource,
): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Recruitee: slug is the subdomain (e.g. acme.recruitee.com)
    if (atsSource === "recruitee") {
      const labels = hostname.split(".");
      // Expect: {slug}.recruitee.com
      if (
        labels.length >= 3 &&
        labels[labels.length - 2] === "recruitee" &&
        labels[labels.length - 1] === "com"
      ) {
        const slug = labels[0];
        // Reject common non-slug subdomains
        if (["www", "api", "blog"].includes(slug)) return null;
        return slug;
      }
      return null;
    }

    // All other ATS: slug is the first path segment
    const pathParts = parsed.pathname.split("/").filter((p) => p.length > 0);
    if (pathParts.length === 0) return null;

    const slug = pathParts[0];
    // Reject common non-slug path segments
    if (["jobs", "api", "embed", "board"].includes(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}

/**
 * Determine the ATS source from a search result URL's hostname.
 *
 * @returns  The AtsSource, or null if the hostname doesn't match any ATS.
 */
export function inferAtsSourceFromUrl(url: string): AtsSource | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    for (const { domain, source } of ATS_SEARCH_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return source;
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
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
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
