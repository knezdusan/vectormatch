// HN Algolia Seeder — The Delta Seeder (TDD §4.1.2)
// src/lib/jobs/seeders/hn-algolia.ts
//
// The primary "hidden jobs" discovery engine. HN "Who is Hiring" surfaces
// 200–500 companies per month — many are first-time posters or small startups
// that won't be in HTTPArchive's top-sites crawl. The companies self-select by
// posting; they're actively hiring and want to be found.
//
// ── Architecture (domain logic, not Inngest-coupled) ─────────────────────────
// Per the project rules, domain functions are plain TypeScript callable from
// Inngest, scripts, and tests. The Inngest function wrapper (scheduled weekly
// on Monday, cron "0 0 * * 1") will be added in step 8 when the Inngest base
// infrastructure is set up.
//
// The seeder has two phases:
//   Phase 1 (this module): Fetch HN API → extract ATS URLs from comments →
//     insert new companies into the company table. Fast (text parsing only).
//   Phase 2 (resolve-custom-url.ts): Non-ATS URLs are resolved via CNAME +
//     slug probe. This runs as a separate Inngest function, triggered by
//     events from Phase 1. Network-dependent, slower.
//
// ── Injectable fetch ─────────────────────────────────────────────────────────
// The fetch function is injectable for testing. In production, the global
// `fetch()` is used. In tests, a mock fetch returns fixture data.
//
// See TDD §4.1.2 for the full specification.

import type { FetchFn } from "@/lib/jobs/types";
import type { InsertResult } from "./company-repository";
import { insertDiscoveredCompanies } from "./company-repository";
import type { HnAlgoliaHit, HnAlgoliaResponse } from "./hn-schemas";
import { hnAlgoliaResponseSchema } from "./hn-schemas";
import type { SeedCompanyInput } from "./schemas";
import type { ParsedAtsUrl } from "./url-parser";
import { classifyUrls } from "./url-parser";

// ── Constants ────────────────────────────────────────────────────────────────

const HN_ALGOLIA_ENDPOINT = "https://hn.algolia.com/api/v1/search_by_date";
const HITS_PER_PAGE = 50; // HN Algolia max is 1000; 50 is a good balance

// The "Ask HN: Who is hiring?" threads are posted monthly by the user
// "whoishiring". We use a two-phase fetch:
//   Phase 1: Find the most recent "Who is hiring?" story by this author
//   Phase 2: Fetch comments on that specific story using tag filtering
//
// This is more precise than a full-text search for "Ask HN Who is hiring",
// which also matches "Who wants to be hired?" threads and unrelated comments.
// Discovered via live testing 2026-06-23: the broad query returned 0 ATS URLs
// across 500 hits because it matched job-seeker comments, not employer posts.

// ── Types ────────────────────────────────────────────────────────────────────

/** Result of the HN seeder run — for ingestionLog metrics. */
export interface HnSeederResult {
  /** Total HN comments processed (hits with comment_text). */
  commentsProcessed: number;
  /** Direct ATS URLs found in comments. */
  atsUrlsFound: number;
  /** Custom (non-ATS) URLs found — deferred to the resolver. */
  customUrlsFound: number;
  /** Unique companies extracted (after within-batch dedup). */
  uniqueCompanies: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Custom URLs that need resolution (passed to the resolver Inngest function). */
  customUrls: string[];
  /** HN comment URLs for provenance (discoveryContext). */
  discoveryContexts: string[];
  /** Error message if the HN API fetch failed entirely. */
  error?: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the HN Algolia seeder. Fetches "Ask HN: Who is hiring" comments from the
 * HN Algolia API, extracts direct ATS URLs, and inserts new companies into the
 * company table. Custom (non-ATS) URLs are collected for the resolver.
 *
 * @param fetchFn  Optional injectable fetch (defaults to global fetch).
 * @param maxPages Optional limit on pages to fetch (for testing/limiting cost).
 */
export async function runHnAlgoliaSeeder(
  fetchFn: FetchFn = fetch,
  maxPages?: number,
): Promise<HnSeederResult> {
  try {
    const allHits = await fetchAllHnHits(fetchFn, maxPages);
    return processHnHits(allHits);
  } catch (error) {
    return {
      commentsProcessed: 0,
      atsUrlsFound: 0,
      customUrlsFound: 0,
      uniqueCompanies: 0,
      insertResult: {
        inserted: 0,
        skipped: 0,
        rejected: [],
        insertedCompanyIds: [],
        insertedCompanies: [],
        aggregatorFiltered: 0,
      },
      customUrls: [],
      discoveryContexts: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── HN API fetching ──────────────────────────────────────────────────────────

/**
 * Fetch all comments from the most recent "Ask HN: Who is hiring?" thread.
 *
 * Two-phase approach:
 *   Phase 1: Find the most recent "Who is hiring?" story by author "whoishiring"
 *            (this user posts both "Who is hiring?" and "Who wants to be hired?"
 *            threads monthly — we filter to only the hiring one).
 *   Phase 2: Fetch comments on that story using HN Algolia's tag filtering
 *            (tags=comment,story_<storyId>). These comments are where companies
 *            post job listings with ATS URLs.
 *
 * @param fetchFn  Injectable fetch function
 * @param maxPages Optional limit on comment pages to fetch
 */
async function fetchAllHnHits(
  fetchFn: FetchFn,
  maxPages?: number,
): Promise<HnAlgoliaHit[]> {
  // Phase 1: Find the most recent "Who is hiring?" story.
  const storyId = await findLatestHiringStory(fetchFn);
  if (!storyId) {
    throw new Error(
      'Could not find any "Ask HN: Who is hiring?" thread by author "whoishiring"',
    );
  }

  // Phase 2: Fetch comments on that story, paginating through all pages.
  const allHits: HnAlgoliaHit[] = [];
  let page = 0;
  let nbPages = 1; // Updated after first response

  while (page < nbPages) {
    if (maxPages !== undefined && page >= maxPages) break;

    const url = `${HN_ALGOLIA_ENDPOINT}?tags=comment,story_${storyId}&hitsPerPage=${HITS_PER_PAGE}&page=${page}`;
    const response = await fetchFn(url);

    if (!response.ok) {
      throw new Error(
        `HN Algolia API returned ${response.status} ${response.statusText} on page ${page}`,
      );
    }

    const json: unknown = await response.json();
    const parsed = hnAlgoliaResponseSchema.safeParse(json);

    if (!parsed.success) {
      throw new Error(
        `HN Algolia API response failed Zod validation on page ${page}: ${parsed.error.message}`,
      );
    }

    const data: HnAlgoliaResponse = parsed.data;
    allHits.push(...data.hits);
    nbPages = data.nbPages;
    page++;

    // Safety: HN Algolia sometimes returns nbPages=1000 (the API max). Cap at
    // 20 pages (1000 hits) to avoid runaway queries.
    if (nbPages > 20) nbPages = 20;
  }

  return allHits;
}

/**
 * Find the most recent "Ask HN: Who is hiring?" story by the "whoishiring" user.
 * The "whoishiring" account posts both "Who is hiring?" and "Who wants to be
 * hired?" threads monthly — we filter to only the hiring one by title.
 *
 * @returns The story's objectID (as a string), or null if not found.
 */
async function findLatestHiringStory(fetchFn: FetchFn): Promise<string | null> {
  const url = `${HN_ALGOLIA_ENDPOINT}?tags=story,author_whoishiring&hitsPerPage=10`;
  const response = await fetchFn(url);

  if (!response.ok) {
    throw new Error(
      `HN Algolia API returned ${response.status} ${response.statusText} when searching for whoishiring stories`,
    );
  }

  const json: unknown = await response.json();
  const parsed = hnAlgoliaResponseSchema.safeParse(json);

  if (!parsed.success) {
    throw new Error(
      `HN Algolia API response failed Zod validation when searching for stories: ${parsed.error.message}`,
    );
  }

  // Find the most recent story with "Who is hiring" in the title (not "Who
  // wants to be hired"). The results from search_by_date are sorted newest-first.
  const hiringStory = parsed.data.hits.find((hit) =>
    hit.title?.includes("Who is hiring"),
  );

  return hiringStory?.objectID ?? null;
}

// ── Hit processing (pure, testable without network) ──────────────────────────

/**
 * Process HN hits: extract ATS URLs from comments, build SeedCompanyInput
 * tuples, and insert them into the company table. This is the core domain
 * logic, separated from the fetch for testability.
 */
// fallow-ignore-next-line unused-export
export async function processHnHits(
  hits: HnAlgoliaHit[],
): Promise<HnSeederResult> {
  // Filter to comments only (hits with comment_text). Stories have story_text
  // but no job postings — they're the "Ask HN: Who is hiring?" main posts.
  const comments = hits.filter((h) => h.comment_text != null);

  const allAtsUrls: ParsedAtsUrl[] = [];
  const allCustomUrls: string[] = [];
  const discoveryContexts: string[] = [];

  for (const comment of comments) {
    const text = comment.comment_text ?? "";
    const { atsUrls, customUrls } = classifyUrls(text);

    for (const ats of atsUrls) {
      allAtsUrls.push(ats);
      // Provenance: the HN item URL for this comment.
      const hnUrl =
        comment.url ??
        `https://news.ycombinator.com/item?id=${comment.objectID}`;
      discoveryContexts.push(hnUrl);
    }

    allCustomUrls.push(...customUrls);
  }

  // Build SeedCompanyInput tuples from ATS URLs.
  // Dedup within the batch (same slug from multiple comments).
  const seen = new Set<string>();
  const companyInputs: SeedCompanyInput[] = [];

  for (let i = 0; i < allAtsUrls.length; i++) {
    const ats = allAtsUrls[i];
    const key = `${ats.atsSource}:${ats.atsSlug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    companyInputs.push({
      atsSlug: ats.atsSlug,
      atsSource: ats.atsSource,
      discoverySource: "hn_algolia",
      discoveryContext: discoveryContexts[i],
      // rootDomain: not extractable from ATS URLs (the hostname is the ATS
      // host, not the company domain). The poller may fill this in later from
      // ATS metadata. For custom URLs, the resolver extracts it.
    });
  }

  // Insert into the company table.
  const insertResult = await insertDiscoveredCompanies(companyInputs);

  return {
    commentsProcessed: comments.length,
    atsUrlsFound: allAtsUrls.length,
    customUrlsFound: allCustomUrls.length,
    uniqueCompanies: companyInputs.length,
    insertResult,
    customUrls: dedupArray(allCustomUrls),
    discoveryContexts,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dedupArray(arr: string[]): string[] {
  return [...new Set(arr)];
}
