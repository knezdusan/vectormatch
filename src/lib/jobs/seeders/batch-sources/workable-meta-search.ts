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
type WorkableSearchResponse = z.infer<typeof workableSearchResponseSchema>;

export interface WorkableMetaSearchResult {
  /** Total jobs found across all pages and queries. */
  totalJobsFound: number;
  /** Unique company slugs extracted from job results. */
  uniqueCompanySlugs: number;
  /** Pages fetched across all queries. */
  pagesFetched: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Slugs that passed Workable widget API validation (fast-path direct insert). */
  validSlugs: number;
  /** Slugs that failed validation and were routed through the Slugger. */
  sluggerFallbacks: number;
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

// ── Slug validation (fast-path vs. Slugger fallback) ─────────────────────────

/**
 * Workable widget API base. A HEAD request against this endpoint returns 200
 * when the slug maps to a real Workable account, 404 when it does not.
 */
const WORKABLE_WIDGET_API_BASE =
  "https://apply.workable.com/api/v1/widget/accounts";

/**
 * Validate that a Workable slug maps to a real Workable account by issuing a
 * lightweight HEAD request against the widget API.
 *
 * Why HEAD: the widget accounts endpoint returns a small JSON body, but we
 * only need the status code. HEAD avoids downloading the body, halving the
 * bandwidth of the validation pass (we run this for every discovered slug).
 *
 * @param slug     The Workable slug extracted from company.url
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        `true` if the slug is valid (HTTP 2xx), `false` otherwise
 *                 (404, network error, non-2xx). On any error we return
 * `false` so the company is routed through the Slugger (slow path) — the
 * Slugger will re-probe all 6 ATS platforms and either find the correct
 * slug or queue the company for retry.
 */
export async function validateWorkableSlug(
  slug: string,
  fetchFn: FetchFn,
): Promise<boolean> {
  const url = `${WORKABLE_WIDGET_API_BASE}/${slug}`;
  try {
    const response = await fetchFn(url, { method: "HEAD" });
    return response.ok;
  } catch {
    // Network error — assume invalid, route to Slugger for re-probe.
    return false;
  }
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

    // ── Sprint 3 Task 3: validate slugs before inserting ────────────────────
    // The slug extracted from company.url (e.g. "acme-corp") may not match the
    // Workable widget API slug (e.g. "acmecorp" or "acme"). Inserting a bad
    // slug means every future poll fails, driving consecutiveFailures up until
    // the company is marked dead. Validate via a HEAD request against the
    // widget API; route failures through the Slugger (slow path) which probes
    // all 6 ATS platforms.
    const validInputs: SeedCompanyInput[] = [];
    const sluggerFallbacks: {
      companyName: string;
      website?: string;
    }[] = [];

    for (const input of allInputs) {
      const isValid = await validateWorkableSlug(input.atsSlug, fetchFn);
      if (isValid) {
        validInputs.push(input);
      } else {
        // Pass the company's root domain (when available) as the website hint
        // for the Slugger's CNAME resolution stage. discoveryContext is the
        // search query string, not a URL — rootDomain is the correct hint.
        sluggerFallbacks.push({
          companyName: input.companyName ?? "",
          website: input.rootDomain,
        });
      }
    }

    const insertResult = await insertDiscoveredCompanies(validInputs);

    // Route invalid slugs through the Slugger. Dynamic import avoids a circular
    // dependency: slugger.ts → company-repository → schemas, while this module
    // also imports company-repository.
    for (const { companyName, website } of sluggerFallbacks) {
      if (!companyName) continue;
      try {
        const { resolveSlugger } = await import("@/lib/jobs/seeders/slugger");
        await resolveSlugger(
          {
            companyName,
            website,
            discoverySource: "workable_meta_search",
          },
          { insertCompany: true },
        );
      } catch {
        // Slugger failure is non-fatal — the company is added to the
        // slugger_retry queue inside resolveSlugger for a later retry.
      }
    }

    return {
      totalJobsFound,
      uniqueCompanySlugs: allInputs.length,
      pagesFetched,
      insertResult,
      validSlugs: validInputs.length,
      sluggerFallbacks: sluggerFallbacks.length,
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
      validSlugs: 0,
      sluggerFallbacks: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
