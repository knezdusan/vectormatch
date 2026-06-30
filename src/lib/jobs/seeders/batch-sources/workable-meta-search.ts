// B1: Workable Meta-Search Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/workable-meta-search.ts
//
// The Workable meta-search API at jobs.workable.com/api/v1/jobs is a public
// cross-customer job search endpoint. It indexes ~170k active postings across
// all Workable customers. By paginating through search results, we can extract
// company slugs (company.shortName) and insert them directly into the company
// table — no Slugger needed because the slugs are Workable-native.
//
// ── API ──────────────────────────────────────────────────────────────────────
// GET https://jobs.workable.com/api/v1/jobs?query={query}&limit=20
//
// Response shape (updated June 2026 — the API was revised; company.shortName
// was removed and company.name was renamed to company.title):
// {
//   "title": "Developer",
//   "totalSize": 9329,
//   "nextPageToken": "eyJ...",   ← null when no more pages
//   "jobs": [
//     {
//       "id": "abc123",
//       "title": "Senior Engineer",
//       "company": {
//         "id": "uuid",
//         "title": "Acme",              ← company name (was "name")
//         "website": "https://acme.com",
//         "url": "https://jobs.workable.com/company/{id}/jobs-at-{slug}"
//       },
//       "location": { "city": "SF", "countryName": "USA" },
//       "url": "https://jobs.workable.com/view/..."
//     },
//     ...
//   ]
// }
//
// The Workable slug (for apply.workable.com/{slug}) is extracted from the
// company.url field by taking the last path segment and removing the
// "jobs-at-" prefix.
//
// ── Pagination ───────────────────────────────────────────────────────────────
// The API returns 20 jobs per page. Pass `nextPageToken` as the `pageToken`
// query parameter to get the next page. When `nextPageToken` is null/absent,
// all pages have been consumed.
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 300-600 companies (many Workable companies are small-to-mid tech companies).
//
// See TDD §2.1 (B1) for the full specification.

import { z } from "zod";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Base URL for the Workable meta-search API. */
const WORKABLE_META_SEARCH_URL = "https://jobs.workable.com/api/v1/jobs";

/** Jobs per page (API max is 20). */
const PAGE_SIZE = 20;

/** Maximum pages to fetch (safety limit — prevents infinite loops). */
const MAX_PAGES = 500;

/** Search queries for tech companies. The API supports full-text search. */
const DEFAULT_SEARCH_QUERIES = [
  "software engineer",
  "frontend developer",
  "backend developer",
  "full stack engineer",
  "devops engineer",
  "data engineer",
];

// ── Zod schemas ──────────────────────────────────────────────────────────────

const workableCompanySchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  website: z.string().optional(),
  url: z.string().optional(),
});

const workableJobSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  company: workableCompanySchema,
  url: z.string().optional(),
});

const workableSearchResponseSchema = z.object({
  jobs: z.array(workableJobSchema).default([]),
  nextPageToken: z.string().nullable().optional(),
});

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkableJob = z.infer<typeof workableJobSchema>;
export type WorkableSearchResponse = z.infer<
  typeof workableSearchResponseSchema
>;

export interface WorkableMetaSearchResult {
  /** Total jobs found across all pages and queries. */
  totalJobsFound: number;
  /** Unique company slugs extracted from job results. */
  uniqueCompanySlugs: number;
  /** Pages fetched across all queries. */
  pagesFetched: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if the API call failed. */
  error?: string;
}

// ── Pure function: extract slug from company URL ─────────────────────────────

/**
 * Extract the Workable slug from a company URL.
 *
 * The company URL format is:
 *   https://jobs.workable.com/company/{encodedId}/jobs-at-{slug}
 *
 * The slug is the last path segment with the "jobs-at-" prefix removed.
 * URL-encoded characters are decoded (e.g. %2C → comma).
 *
 * @param companyUrl  The company URL from the API response
 * @returns           The extracted slug, or null if extraction fails
 */
export function extractSlugFromCompanyUrl(companyUrl: string): string | null {
  try {
    const url = new URL(companyUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;

    // The slug is in the last segment: "jobs-at-{slug}"
    const lastSegment = decodeURIComponent(segments[segments.length - 1]);
    if (lastSegment.startsWith("jobs-at-")) {
      return lastSegment.slice("jobs-at-".length);
    }

    // Fallback: if the format changes, use the last segment as-is
    return lastSegment || null;
  } catch {
    return null;
  }
}

// ── Pure function: extract company inputs from jobs ──────────────────────────

/**
 * Extract unique SeedCompanyInput tuples from Workable job results.
 * Deduplicates by company slug — multiple jobs from the same
 * company only produce one company entry.
 *
 * The slug is extracted from the company.url field (format:
 * /company/{id}/jobs-at-{slug}). If extraction fails, the company is skipped.
 */
export function extractCompanyInputs(
  jobs: WorkableJob[],
  searchQuery: string,
): SeedCompanyInput[] {
  const seen = new Set<string>();
  const inputs: SeedCompanyInput[] = [];

  for (const job of jobs) {
    // Extract slug from company URL
    const companyUrl = job.company.url;
    if (!companyUrl) continue;

    const slug = extractSlugFromCompanyUrl(companyUrl);
    if (!slug || slug.length === 0) continue;
    if (seen.has(slug)) continue;
    seen.add(slug);

    // Extract root domain from website URL if available
    let rootDomain: string | undefined;
    if (job.company.website) {
      try {
        const url = new URL(job.company.website);
        rootDomain = url.hostname.toLowerCase();
      } catch {
        // Invalid URL — skip rootDomain
      }
    }

    inputs.push({
      atsSlug: slug,
      atsSource: "workable",
      companyName: job.company.title,
      rootDomain,
      discoverySource: "workable_meta_search",
      discoveryContext: `search:"${searchQuery}"`,
    });
  }

  return inputs;
}

// ── API client: fetch a single page ──────────────────────────────────────────

/**
 * Fetch a single page of Workable search results.
 *
 * @param query      Search query string
 * @param fetchFn    Injectable fetch function
 * @param pageToken  Optional pagination token from a previous response
 * @returns          Parsed and validated search response
 */
async function fetchPage(
  query: string,
  fetchFn: FetchFn,
  pageToken?: string,
): Promise<WorkableSearchResponse> {
  const url = new URL(WORKABLE_META_SEARCH_URL);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(PAGE_SIZE));
  if (pageToken) {
    url.searchParams.set("pageToken", pageToken);
  }

  const response = await fetchFn(url.toString());
  if (!response.ok) {
    throw new Error(`Workable API returned HTTP ${response.status}`);
  }

  const json = await response.json();
  const parsed = workableSearchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Workable API response failed Zod validation: ${parsed.error.message}`,
    );
  }

  return parsed.data;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Workable meta-search seeder. Searches for engineering jobs across
 * all Workable customers, extracts unique company slugs, and inserts them
 * into the company table.
 *
 * @param fetchFn          Injectable fetch (defaults to global fetch)
 * @param searchQueries    Search queries to use (defaults to engineering roles)
 * @param maxPagesPerQuery Maximum pages to fetch per query (safety limit)
 * @returns                Result with counts and insert metrics
 */
export async function runWorkableMetaSearch(
  fetchFn: FetchFn = fetch,
  searchQueries: string[] = DEFAULT_SEARCH_QUERIES,
  maxPagesPerQuery = MAX_PAGES,
): Promise<WorkableMetaSearchResult> {
  let totalJobsFound = 0;
  let pagesFetched = 0;
  const allInputs: SeedCompanyInput[] = [];
  const seenSlugs = new Set<string>();

  try {
    for (const query of searchQueries) {
      let pageToken: string | undefined;

      for (let page = 0; page < maxPagesPerQuery; page++) {
        const result = await fetchPage(query, fetchFn, pageToken);
        pagesFetched++;
        totalJobsFound += result.jobs.length;

        const inputs = extractCompanyInputs(result.jobs, query);
        for (const input of inputs) {
          if (!seenSlugs.has(input.atsSlug)) {
            seenSlugs.add(input.atsSlug);
            allInputs.push(input);
          }
        }

        if (!result.nextPageToken) break;
        pageToken = result.nextPageToken;
      }
    }

    const insertResult = await insertDiscoveredCompanies(allInputs);

    return {
      totalJobsFound,
      uniqueCompanySlugs: allInputs.length,
      pagesFetched,
      insertResult,
    };
  } catch (error) {
    return {
      totalJobsFound,
      uniqueCompanySlugs: allInputs.length,
      pagesFetched,
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
