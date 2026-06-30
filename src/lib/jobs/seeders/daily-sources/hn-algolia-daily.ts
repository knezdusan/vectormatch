// D2: HN Algolia Daily ATS Link Mining (TDD §2.2)
// src/lib/jobs/seeders/daily-sources/hn-algolia-daily.ts
//
// Daily sweep of HN Algolia for comments mentioning ATS domains. Unlike the
// monthly "Who is Hiring?" seeder (hn-algolia.ts), this searches all comments
// from the last 24 hours for ATS URL mentions.
//
// ── API ──────────────────────────────────────────────────────────────────────
// GET https://hn.algolia.com/api/v1/search_by_date?
//   query=boards.greenhouse.io
//   &tags=comment
//   &numericFilters=created_at_i>{YESTERDAY_UNIX}
//   &hitsPerPage=50
//
// Also queries for jobs.lever.co and jobs.ashbyhq.com.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Compute yesterday's Unix timestamp
// 2. For each ATS domain, query HN Algolia for recent comments mentioning it
// 3. Extract ATS URLs from comment text
// 4. Extract slugs from URLs
// 5. Insert directly into company table
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 5-15 companies/day (HN comments frequently mention hiring companies).
//
// See TDD §2.2 (D2) for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const HN_ALGOLIA_ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date";
const HITS_PER_PAGE = 50;

/** ATS domains to search for in HN comments. */
const ATS_SEARCH_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface HnAlgoliaDailyResult {
  /** Total comments fetched across all ATS domain queries. */
  totalComments: number;
  /** Unique ATS URLs extracted from comments. */
  atsUrlsFound: number;
  /** Unique company slugs extracted. */
  uniqueSlugsExtracted: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if a critical error occurred. */
  error?: string;
}

interface HnHit {
  objectID: string;
  comment_text?: string;
  created_at_i?: number;
}

interface HnResponse {
  hits: HnHit[];
  nbPages: number;
}

// ── Pure function: compute yesterday's Unix timestamp ────────────────────────

/**
 * Compute the Unix timestamp for 24 hours ago.
 * @returns Unix timestamp in seconds
 */
export function computeYesterdayTimestamp(): number {
  return Math.floor(Date.now() / 1000) - 86400;
}

// ── Pure function: extract ATS URLs from comment text ────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Extract ATS URLs from HN comment text.
 * Finds all URLs in the text and filters for ATS domains.
 *
 * @param text       The HN comment text
 * @returns          Array of ATS URLs found in the text
 */
export function extractAtsUrlsFromText(
  text: string,
): { url: string; atsSource: AtsSource }[] {
  const results: { url: string; atsSource: AtsSource }[] = [];
  const matches = text.match(URL_REGEX) ?? [];

  for (const url of matches) {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();

      for (const { domain, source } of ATS_SEARCH_DOMAINS) {
        if (hostname === domain || hostname.endsWith(`.${domain}`)) {
          results.push({ url, atsSource: source });
          break;
        }
      }
    } catch {
      // Invalid URL — skip
    }
  }

  return results;
}

// ── Pure function: extract slug from ATS URL ─────────────────────────────────

function extractSlugFromAtsUrl(
  url: string,
  atsSource: AtsSource,
): string | null {
  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter((p) => p.length > 0);
    if (pathParts.length === 0) return null;
    const slug = pathParts[0];
    if (["jobs", "api", "embed", "board"].includes(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}

// ── Pure function: build SeedCompanyInput from ATS URLs ──────────────────────

/**
 * Build unique SeedCompanyInput tuples from ATS URLs.
 * Deduplicates by (atsSource, atsSlug).
 */
export function buildCompanyInputsFromAtsUrls(
  atsUrls: { url: string; atsSource: AtsSource }[],
): SeedCompanyInput[] {
  const seen = new Set<string>();
  const inputs: SeedCompanyInput[] = [];

  for (const { url, atsSource } of atsUrls) {
    const slug = extractSlugFromAtsUrl(url, atsSource);
    if (!slug) continue;

    const key = `${atsSource}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    inputs.push({
      atsSlug: slug,
      atsSource,
      discoverySource: "hn_algolia",
      discoveryContext: `hn-daily url:${url}`,
    });
  }

  return inputs;
}

// ── API client: query HN Algolia for a single ATS domain ─────────────────────

/**
 * Query HN Algolia for recent comments mentioning a specific ATS domain.
 *
 * @param domain      The ATS domain to search for
 * @param sinceUnix   Only return comments after this Unix timestamp
 * @param fetchFn     Injectable fetch function
 * @returns           Array of HN hits
 */
async function queryHnAlgoliaForDomain(
  domain: string,
  sinceUnix: number,
  fetchFn: FetchFn,
): Promise<HnHit[]> {
  const allHits: HnHit[] = [];
  let page = 0;
  let nbPages = 1;

  while (page < nbPages) {
    const url = new URL(HN_ALGOLIA_ENDPOINT);
    url.searchParams.set("query", domain);
    url.searchParams.set("tags", "comment");
    url.searchParams.set("numericFilters", `created_at_i>${sinceUnix}`);
    url.searchParams.set("hitsPerPage", String(HITS_PER_PAGE));
    url.searchParams.set("page", String(page));

    const response = await fetchFn(url.toString());
    if (!response.ok) {
      throw new Error(
        `HN Algolia API returned ${response.status} for ${domain}`,
      );
    }

    const json: unknown = await response.json();
    if (!json || typeof json !== "object") break;

    const data = json as HnResponse;
    if (!Array.isArray(data.hits)) break;

    allHits.push(...data.hits);
    nbPages = data.nbPages ?? 1;
    page++;

    // Safety cap
    if (nbPages > 10) nbPages = 10;
  }

  return allHits;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the HN Algolia daily ATS link mining seeder. Searches recent HN comments
 * for ATS domain mentions, extracts slugs, and inserts them into the company
 * table.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and insert metrics
 */
export async function runHnAlgoliaDailySeeder(
  fetchFn: FetchFn = fetch,
): Promise<HnAlgoliaDailyResult> {
  const sinceUnix = computeYesterdayTimestamp();
  let totalComments = 0;
  const allAtsUrls: { url: string; atsSource: AtsSource }[] = [];

  try {
    for (const { domain, source } of ATS_SEARCH_DOMAINS) {
      try {
        const hits = await queryHnAlgoliaForDomain(domain, sinceUnix, fetchFn);
        totalComments += hits.length;

        for (const hit of hits) {
          const text = hit.comment_text ?? "";
          const atsUrls = extractAtsUrlsFromText(text);
          for (const { url, atsSource } of atsUrls) {
            if (atsSource === source) {
              allAtsUrls.push({ url, atsSource });
            }
          }
        }
      } catch {
        // Individual domain failure — continue to next domain
      }
    }

    const inputs = buildCompanyInputsFromAtsUrls(allAtsUrls);
    const insertResult = await insertDiscoveredCompanies(inputs);

    return {
      totalComments,
      atsUrlsFound: allAtsUrls.length,
      uniqueSlugsExtracted: inputs.length,
      insertResult,
    };
  } catch (error) {
    return {
      totalComments,
      atsUrlsFound: allAtsUrls.length,
      uniqueSlugsExtracted: 0,
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
