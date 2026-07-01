// D3: Reddit RSS Hiring Feeds Seeder (TDD §2.2)
// src/lib/jobs/seeders/daily-sources/reddit-rss.ts
//
// Fetches RSS feeds from Reddit hiring subreddits, extracts ATS URLs from post
// content, and inserts discovered companies directly into the company table.
//
// ── Feeds ────────────────────────────────────────────────────────────────────
// https://www.reddit.com/r/{subreddit}/search.rss?q=hiring&sort=new&restrict_sr=on
// Subreddits: reactjs, typescript, nextjs, node, forhire, jobbit
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. For each subreddit, fetch the RSS search feed for "hiring" posts
// 2. Parse RSS XML with cheerio, extract <item> content (title, description,
//    content:encoded)
// 3. Extract ATS URLs from post content (Greenhouse, Lever, Ashby, etc.)
// 4. Extract slugs from ATS URLs (first path segment, or subdomain for Recruitee)
// 5. Insert directly into company table via insertDiscoveredCompanies
//
// ── Discovery source ──────────────────────────────────────────────────────────
// Uses "hn_algolia" — same pattern as D2 (community-driven ATS URL discovery).
// The discoveryContext field ("reddit:{subreddit} url:{url}") distinguishes
// Reddit from HN.
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 3-10 companies/day (Reddit hiring threads frequently link to ATS boards).
//
// See TDD §2.2 (D3) for the full specification.

import * as cheerio from "cheerio";
import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Reddit hiring subreddits to scan for ATS URLs. */
const REDDIT_SUBREDDITS: string[] = [
  "reactjs",
  "typescript",
  "nextjs",
  "node",
  "forhire",
  "jobbit",
];

/** ATS domains to search for in Reddit post content. */
const ATS_SEARCH_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface RedditRssResult {
  /** Total RSS <item> posts fetched across all subreddits. */
  totalPosts: number;
  /** Unique ATS URLs extracted from post content. */
  atsUrlsFound: number;
  /** Unique company slugs extracted. */
  uniqueSlugsExtracted: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: build Reddit RSS URL ──────────────────────────────────────

/**
 * Build the Reddit RSS search URL for a given subreddit.
 *
 * @param subreddit  The subreddit name (without "r/" prefix)
 * @returns          The full RSS search URL
 */
export function buildRedditRssUrl(subreddit: string): string {
  return `https://www.reddit.com/r/${subreddit}/search.rss?q=hiring&sort=new&restrict_sr=on`;
}

// ── Pure function: extract ATS URLs from text ────────────────────────────────

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/g;

/**
 * Extract ATS URLs from arbitrary text (Reddit post content).
 * Finds all URLs in the text and filters for known ATS domains.
 *
 * @param text  The text to search (post title, description, or content)
 * @returns     Array of { url, atsSource } tuples for matching ATS URLs
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

// ── Pure function: extract post content from RSS XML ─────────────────────────

/**
 * Parse RSS XML with cheerio and extract the text content of each <item>.
 * Combines <title>, <description>, and <content:encoded> text for each item.
 *
 * @param xml  Raw RSS XML string
 * @returns    Array of combined text content strings (one per <item>)
 */
export function extractUrlsFromRss(xml: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  const posts: string[] = [];

  $("item").each((_, element) => {
    const $item = $(element);
    const title = $item.find("title").first().text().trim();
    const description = $item.find("description").first().text().trim();
    // content:encoded is a namespaced element — escape the colon for cheerio
    const content = $item.find("content\\:encoded").first().text().trim();

    const combined = `${title} ${description} ${content}`.trim();
    if (combined.length > 0) {
      posts.push(combined);
    }
  });

  return posts;
}

// ── Pure function: extract slug from ATS URL ─────────────────────────────────

/**
 * Extract the company slug from an ATS URL.
 *
 * For most ATS platforms (Greenhouse, Lever, Ashby, SmartRecruiters, Workable),
 * the slug is the first path segment of the URL.
 *
 * For Recruitee, the slug is the subdomain (e.g. "acme" in "acme.recruitee.com").
 *
 * @param url        The ATS URL
 * @param atsSource  The ATS platform
 * @returns          The extracted slug, or null if it can't be extracted
 */
function extractSlugFromAtsUrl(
  url: string,
  atsSource: AtsSource,
): string | null {
  try {
    const parsed = new URL(url);

    if (atsSource === "recruitee") {
      // Recruitee uses subdomain as slug: {slug}.recruitee.com
      const hostname = parsed.hostname.toLowerCase();
      const parts = hostname.split(".");
      // e.g. "acme.recruitee.com" -> ["acme", "recruitee", "com"]
      if (parts.length < 3) return null;
      const slug = parts[0];
      if (["www", "api", "jobs"].includes(slug)) return null;
      return slug;
    }

    // Other ATS: first path segment
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
 *
 * @param atsUrls        Array of { url, atsSource } tuples
 * @param contextPrefix  Optional prefix for discoveryContext (e.g. "reddit:reactjs")
 * @returns              Array of SeedCompanyInput with unique slugs
 */
export function buildCompanyInputsFromAtsUrls(
  atsUrls: { url: string; atsSource: AtsSource }[],
  contextPrefix = "reddit",
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
      discoveryContext: `${contextPrefix} url:${url}`,
    });
  }

  return inputs;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Reddit RSS hiring feeds seeder. Fetches RSS search feeds from each
 * subreddit, extracts ATS URLs from post content, extracts slugs, and inserts
 * them into the company table.
 *
 * Individual subreddit failures (network errors, invalid XML, non-200 responses)
 * are handled gracefully — one subreddit failing does not stop the seeder from
 * processing the remaining subreddits.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and insert metrics
 */
export async function runRedditRssSeeder(
  fetchFn: FetchFn = fetch,
): Promise<RedditRssResult> {
  let totalPosts = 0;
  const allAtsUrls: { url: string; atsSource: AtsSource }[] = [];
  const allInputs: SeedCompanyInput[] = [];
  const seenSlugs = new Set<string>();

  try {
    for (const subreddit of REDDIT_SUBREDDITS) {
      try {
        const url = buildRedditRssUrl(subreddit);
        const response = await fetchFn(url);
        if (!response.ok) {
          // Individual subreddit failure — continue to next
          continue;
        }

        const xml = await response.text();
        const postTexts = extractUrlsFromRss(xml);
        totalPosts += postTexts.length;

        const subredditAtsUrls: { url: string; atsSource: AtsSource }[] = [];
        for (const text of postTexts) {
          const atsUrls = extractAtsUrlsFromText(text);
          subredditAtsUrls.push(...atsUrls);
        }
        allAtsUrls.push(...subredditAtsUrls);

        // Build inputs with subreddit-specific discovery context
        const inputs = buildCompanyInputsFromAtsUrls(
          subredditAtsUrls,
          `reddit:${subreddit}`,
        );

        // Global dedup across subreddits
        for (const input of inputs) {
          const key = `${input.atsSource}:${input.atsSlug}`;
          if (!seenSlugs.has(key)) {
            seenSlugs.add(key);
            allInputs.push(input);
          }
        }
      } catch {
        // Individual subreddit fetch/parse failure — continue to next
      }
    }

    const insertResult = await insertDiscoveredCompanies(allInputs);

    return {
      totalPosts,
      atsUrlsFound: allAtsUrls.length,
      uniqueSlugsExtracted: allInputs.length,
      insertResult,
    };
  } catch (error) {
    return {
      totalPosts,
      atsUrlsFound: allAtsUrls.length,
      uniqueSlugsExtracted: allInputs.length,
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
