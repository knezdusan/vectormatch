// B3: YC Directory Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/yc-directory.ts
//
// Queries the Y Combinator company directory via the Algolia search index.
// Filters for companies with `isHiring=true`, extracts company names + websites,
// and runs each through the Slugger for ATS resolution.
//
// ── API ──────────────────────────────────────────────────────────────────────
// The YC website (ycombinator.com/companies) uses Algolia for search. The
// Algolia API key is embedded in the page HTML as `window.AlgoliaOpts`.
//
// Algolia endpoint:
//   POST https://45bwzj1sgc-dsn.algolia.net/1/indexes/*/queries
//   Headers: x-algolia-application-id, x-algolia-api-key
//   Body: { requests: [{ indexName, params: "facetFilters=isHiring:true&hitsPerPage=1000" }] }
//
// Index: YCCompany_By_Launch_Date_production
// Application ID: 45BWZJ1SGC
//
// ── Response shape ───────────────────────────────────────────────────────────
// {
//   "results": [{
//     "hits": [
//       {
//         "id": 123,
//         "name": "Acme",
//         "slug": "acme",
//         "website": "https://acme.com",
//         "isHiring": true,
//         "batch": "W24",
//         "industry": "B2B",
//         "tags": ["AI", "Developer Tools"],
//         ...
//       },
//       ...
//     ],
//     "nbPages": 5,
//     "page": 0
//   }]
// }
//
// ── Slugger integration ──────────────────────────────────────────────────────
// Unlike B1/B2 which extract ATS slugs directly, B3 extracts company names +
// websites and runs them through the Slugger (3-stage resolution: DB cache →
// CNAME check → slug probe). This is because YC companies may use any ATS.
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 150-400 companies (YC companies are predominantly tech startups).
//
// See TDD §2.1 (B3) for the full specification.

import { z } from "zod";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const ALGOLIA_APP_ID = "45BWZJ1SGC";
const ALGOLIA_INDEX = "YCCompany_By_Launch_Date_production";
const ALGOLIA_BASE_URL = `https://${ALGOLIA_APP_ID.toLowerCase()}-dsn.algolia.net/1/indexes/*/queries`;
const YC_COMPANIES_PAGE = "https://www.ycombinator.com/companies";

/** Hits per page (Algolia max is 1000). */
const HITS_PER_PAGE = 1000;

// ── Types ────────────────────────────────────────────────────────────────────

export interface YcCompany {
  id: number;
  name: string;
  slug: string;
  website: string;
  isHiring: boolean;
  batch: string;
  industry: string;
  tags: string[];
}

export interface YcDirectoryResult {
  /** Total hiring companies found. */
  totalHiringCompanies: number;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution (added to retry queue). */
  unresolved: number;
  /** Pages fetched from Algolia. */
  pagesFetched: number;
  /** Error message if the API call failed. */
  error?: string;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const ycHitSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  website: z.string(),
  isHiring: z.boolean(),
  batch: z.string().optional().default(""),
  industry: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
});

const algoliaResponseSchema = z.object({
  results: z.array(
    z.object({
      hits: z.array(ycHitSchema).default([]),
      nbPages: z.number().optional(),
      page: z.number().optional(),
    }),
  ),
});

// ── API key extraction ───────────────────────────────────────────────────────

/**
 * Extract the Algolia API key from the YC companies page HTML.
 * The key is embedded as `window.AlgoliaOpts = { app: "...", key: "..." }`.
 *
 * @param fetchFn  Injectable fetch function
 * @returns        The Algolia API key
 */
export async function getAlgoliaApiKey(
  fetchFn: FetchFn = fetch,
): Promise<string> {
  const response = await fetchFn(YC_COMPANIES_PAGE);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch YC companies page: HTTP ${response.status}`,
    );
  }

  const html = await response.text();
  const match = html.match(/window\.AlgoliaOpts\s*=\s*({[^<]+})/);
  if (!match) {
    throw new Error("Could not find Algolia options on YC companies page");
  }

  const opts = JSON.parse(match[1]) as { app?: string; key?: string };
  if (opts.app !== ALGOLIA_APP_ID || !opts.key) {
    throw new Error("YC companies page returned unexpected Algolia options");
  }

  return opts.key;
}

// ── Pure function: extract hiring companies from hits ────────────────────────

/**
 * Filter Algolia hits for companies with `isHiring=true` and a non-empty website.
 * This is a pure function for testability.
 */
export function filterHiringCompanies(hits: YcCompany[]): YcCompany[] {
  return hits.filter((h) => h.isHiring && h.website && h.website.length > 0);
}

// ── API client: fetch a single page ──────────────────────────────────────────

/**
 * Fetch a single page of YC companies from Algolia, filtered by isHiring=true.
 *
 * @param apiKey   Algolia API key
 * @param fetchFn  Injectable fetch function
 * @param page     Page number (0-indexed)
 * @returns        Parsed hits + pagination info
 */
async function fetchAlgoliaPage(
  apiKey: string,
  fetchFn: FetchFn,
  page: number,
): Promise<{ hits: YcCompany[]; nbPages: number }> {
  const params = new URLSearchParams({
    "x-algolia-agent":
      "Algolia for JavaScript (3.35.1); Browser; JS Helper (3.16.1)",
    "x-algolia-application-id": ALGOLIA_APP_ID,
    "x-algolia-api-key": apiKey,
  });

  const body = JSON.stringify({
    requests: [
      {
        indexName: ALGOLIA_INDEX,
        params: `facetFilters=isHiring:true&hitsPerPage=${HITS_PER_PAGE}&page=${page}`,
      },
    ],
  });

  const response = await fetchFn(`${ALGOLIA_BASE_URL}?${params}`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    throw new Error(`Algolia API returned HTTP ${response.status}`);
  }

  const json = await response.json();
  const parsed = algoliaResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Algolia response failed Zod validation: ${parsed.error.message}`,
    );
  }

  const result = parsed.data.results[0];
  return {
    hits: result.hits,
    nbPages: result.nbPages ?? 1,
  };
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the YC directory seeder. Fetches all hiring companies from the YC
 * Algolia index, then runs each through the Slugger for ATS resolution.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any error
 */
export async function runYcDirectorySeeder(
  fetchFn: FetchFn = fetch,
): Promise<YcDirectoryResult> {
  let totalHiringCompanies = 0;
  let pagesFetched = 0;
  let resolved = 0;
  let unresolved = 0;

  try {
    // Step 1: Get the Algolia API key from the YC companies page
    const apiKey = await getAlgoliaApiKey(fetchFn);

    // Step 2: Paginate through all hiring companies
    const allHiringCompanies: YcCompany[] = [];
    let page = 0;
    let nbPages = 1;

    while (page < nbPages) {
      const result = await fetchAlgoliaPage(apiKey, fetchFn, page);
      pagesFetched++;
      allHiringCompanies.push(...result.hits);
      nbPages = result.nbPages;
      page++;
    }

    totalHiringCompanies = allHiringCompanies.length;

    // Step 3: Run each company through the Slugger
    for (const company of allHiringCompanies) {
      const result: SluggerResult = await resolveSlugger(
        {
          companyName: company.name,
          website: company.website,
          discoverySource: "yc_directory",
          discoveryContext: `yc:${company.slug} batch:${company.batch}`,
        },
        {
          fetchFn,
          insertCompany: true,
        },
      );

      if (result.success) {
        resolved++;
      } else {
        unresolved++;
      }
    }

    return {
      totalHiringCompanies,
      resolved,
      unresolved,
      pagesFetched,
    };
  } catch (error) {
    return {
      totalHiringCompanies,
      resolved,
      unresolved,
      pagesFetched,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
