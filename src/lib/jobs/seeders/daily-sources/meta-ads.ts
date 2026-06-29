// D13: Meta Ads Library (TDD §2.2 D13)
// src/lib/jobs/seeders/daily-sources/meta-ads.ts
//
// Daily sweep of the Meta Ads Library for hiring-related ads. Companies running
// "We're hiring" ads on Facebook/Instagram are extracted and run through the
// Slugger for ATS resolution.
//
// ── API ──────────────────────────────────────────────────────────────────────
// GET https://graph.facebook.com/v19.0/ads_archive
//   ?access_token={TOKEN}
//   &search_terms=we're+hiring
//   &ad_type=ALL_ADS
//   &ad_active_status=ACTIVE
//   &ad_reached_countries=["US"]
//   &fields=id,page_name,ad_creative_bodies,ad_creative_link_titles
//   &limit=200
//
// The API returns paginated results. Each ad has a `page_name` field which is
// typically the company name.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Search for ads with hiring-related search terms
// 2. Extract company names from the `page_name` field
// 3. Deduplicate (case-insensitive)
// 4. Run each through the Slugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 10-40 companies/day. Many ads are from large companies already in the
// corpus, but it surfaces companies actively hiring that may not appear in
// other sources.
//
// ── Auth ─────────────────────────────────────────────────────────────────────
// Requires a Meta access token. Set the META_ADS_ACCESS_TOKEN environment
// variable. A basic app access token works for the Ads Library API.
//
// See TDD §2.2 (D13) for the full specification.

import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const META_ADS_API_URL = "https://graph.facebook.com/v19.0/ads_archive";
const DEFAULT_MAX_PAGES = 5;
const DEFAULT_PAGE_LIMIT = 200;

/**
 * Hiring-related search terms for the Meta Ads Library. We search for each
 * term separately and merge results.
 */
const DEFAULT_SEARCH_TERMS = [
  "we're hiring",
  "join our team",
  "now hiring",
  "we are hiring",
  "hiring engineers",
  "join us",
];

// ── Types ────────────────────────────────────────────────────────────────────

/** A single ad entry from the Meta Ads Library API. */
export interface MetaAdEntry {
  id: string;
  page_name: string;
  ad_creative_bodies?: string[];
  ad_creative_link_titles?: string[];
}

/** The API response shape. */
export interface MetaAdsResponse {
  data: MetaAdEntry[];
  paging?: {
    cursors?: { before?: string; after?: string };
    next?: string;
  };
}

/** Result of running the Meta Ads seeder. */
export interface MetaAdsResult {
  /** Total ads returned across all search terms and pages. */
  totalAds: number;
  /** Unique company names after deduplication. */
  uniqueCompanies: number;
  /** Companies successfully resolved to an ATS slug. */
  resolved: number;
  /** Companies that could not be resolved (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: extract company names from ad entries ─────────────────────

/**
 * Extract company names from Meta Ads Library entries. The `page_name` field
 * is typically the company name.
 *
 * @param ads  Array of ad entries
 * @returns    Array of company names (not deduplicated)
 */
export function extractCompanyNamesFromAds(ads: MetaAdEntry[]): string[] {
  const names: string[] = [];
  for (const ad of ads) {
    const name = ad.page_name?.trim();
    if (name && name.length > 0) {
      names.push(name);
    }
  }
  return names;
}

// ── Pure function: deduplicate company names ─────────────────────────────────

/**
 * Deduplicate an array of company names (case-insensitive).
 * Preserves the first occurrence of each name (in original casing).
 *
 * @param names  Array of company names (possibly with duplicates)
 * @returns      Deduplicated array preserving first-occurrence order
 */
export function deduplicateCompanyNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

// ── Pure function: build API URL ─────────────────────────────────────────────

/**
 * Build the Meta Ads Library API URL with query parameters.
 *
 * @param accessToken    Meta access token
 * @param searchTerm     Search term string
 * @param limit          Results per page
 * @param afterCursor    Pagination cursor (optional)
 * @returns              Full API URL
 */
export function buildAdsApiUrl(
  accessToken: string,
  searchTerm: string,
  limit: number = DEFAULT_PAGE_LIMIT,
  afterCursor?: string,
): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    search_terms: searchTerm,
    ad_type: "ALL_ADS",
    ad_active_status: "ACTIVE",
    ad_reached_countries: '["US"]',
    fields: "id,page_name,ad_creative_bodies,ad_creative_link_titles",
    limit: String(limit),
  });
  if (afterCursor) {
    params.set("after", afterCursor);
  }
  return `${META_ADS_API_URL}?${params.toString()}`;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Meta Ads Library seeder. Searches for hiring-related ads, extracts
 * company names from page_name, deduplicates them, and runs each through the
 * Slugger for ATS resolution with company insertion enabled.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @param opts     Optional configuration (accessToken, searchTerms, maxPages)
 * @returns        Result with counts and any error
 */
export async function runMetaAdsSeeder(
  fetchFn: FetchFn = fetch,
  opts: {
    accessToken?: string;
    searchTerms?: string[];
    maxPages?: number;
  } = {},
): Promise<MetaAdsResult> {
  const accessToken = opts.accessToken ?? process.env.META_ADS_ACCESS_TOKEN;
  const searchTerms = opts.searchTerms ?? DEFAULT_SEARCH_TERMS;
  const maxPages = opts.maxPages ?? DEFAULT_MAX_PAGES;

  let totalAds = 0;
  const allNames: string[] = [];

  try {
    if (!accessToken) {
      throw new Error(
        "META_ADS_ACCESS_TOKEN is not set. Configure the Meta Ads Library access token.",
      );
    }

    // 1. Search for each term, paginating up to maxPages
    for (const term of searchTerms) {
      let afterCursor: string | undefined;
      let pagesFetched = 0;

      while (pagesFetched < maxPages) {
        const url = buildAdsApiUrl(
          accessToken,
          term,
          DEFAULT_PAGE_LIMIT,
          afterCursor,
        );

        const response = await fetchFn(url);
        if (!response.ok) {
          // Non-fatal: skip this search term, continue with others
          break;
        }

        const body = (await response.json()) as MetaAdsResponse;
        if (!body.data || body.data.length === 0) break;

        totalAds += body.data.length;
        allNames.push(...extractCompanyNamesFromAds(body.data));

        // Check for next page
        afterCursor = body.paging?.cursors?.after;
        if (!afterCursor || !body.paging?.next) break;

        pagesFetched++;
      }
    }

    // 2. Deduplicate company names
    const uniqueNames = deduplicateCompanyNames(allNames);

    // 3. Run each through the Slugger
    let resolved = 0;
    let unresolved = 0;

    for (const name of uniqueNames) {
      try {
        const result: SluggerResult = await resolveSlugger(
          {
            companyName: name,
            discoverySource: "hn_algolia",
            discoveryContext: `meta-ads:${name}`,
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
      } catch {
        // Individual resolution failure — count as unresolved, continue
        unresolved++;
      }
    }

    return {
      totalAds,
      uniqueCompanies: uniqueNames.length,
      resolved,
      unresolved,
    };
  } catch (error) {
    return {
      totalAds,
      uniqueCompanies: deduplicateCompanyNames(allNames).length,
      resolved: 0,
      unresolved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
