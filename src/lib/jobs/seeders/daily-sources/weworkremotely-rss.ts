// D5: We Work Remotely + Jobicy RSS Seeder (TDD §2.2)
// src/lib/jobs/seeders/daily-sources/weworkremotely-rss.ts
//
// Fetches RSS feeds from We Work Remotely (main + category feeds) and Jobicy,
// extracts company names from job postings, and runs them through the Slugger
// for ATS resolution.
//
// ── Feeds ────────────────────────────────────────────────────────────────────
// We Work Remotely main:  https://weworkremotely.com/remote-jobs.rss
// WWR category feeds:     https://weworkremotely.com/remote-{category}-jobs.rss
//   categories: engineering, design, product, etc.
// Jobicy:                 https://jobicy.com/feed
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch RSS XML from each feed
// 2. Parse XML with cheerio, extract <item> elements
// 3. Parse company name from <title> (WWR format: "Company Name: Job Title")
// 4. Deduplicate company names across all feeds
// 5. Run each through the Slugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 30-80 companies/week (WWR + Jobicy list active remote-first companies).
//
// See TDD §2.2 (D5) for the full specification.

import * as cheerio from "cheerio";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

export interface RssFeed {
  name: string;
  url: string;
}

/** We Work Remotely main + category feeds, plus Jobicy. */
const RSS_FEEDS: RssFeed[] = [
  { name: "wwr-main", url: "https://weworkremotely.com/remote-jobs.rss" },
  {
    name: "wwr-engineering",
    url: "https://weworkremotely.com/remote-engineering-jobs.rss",
  },
  {
    name: "wwr-design",
    url: "https://weworkremotely.com/remote-design-jobs.rss",
  },
  {
    name: "wwr-product",
    url: "https://weworkremotely.com/remote-product-jobs.rss",
  },
  {
    name: "wwr-devops",
    url: "https://weworkremotely.com/remote-devops-sysadmin-jobs.rss",
  },
  {
    name: "wwr-customer-support",
    url: "https://weworkremotely.com/remote-customer-support-jobs.rss",
  },
  {
    name: "wwr-sales-marketing",
    url: "https://weworkremotely.com/remote-sales-marketing-jobs.rss",
  },
  { name: "jobicy", url: "https://jobicy.com/feed" },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface WwrRssResult {
  /** Total RSS <item> posts fetched across all feeds. */
  totalPosts: number;
  /** Unique company names extracted from all feeds. */
  uniqueCompanies: number;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: extract company names from RSS XML ────────────────────────

/**
 * Parse RSS XML with cheerio and extract company names from <item> elements.
 *
 * The WWR RSS <title> typically follows the pattern "Company Name: Job Title".
 * We split on the first ":" and take the first part as the company name.
 * Items without a ":" (no company delimiter) are skipped.
 *
 * @param xml  Raw RSS XML string
 * @returns    Array of raw company names (may contain duplicates)
 */
export function extractCompanyNamesFromRss(xml: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  const names: string[] = [];

  $("item").each((_, element) => {
    const title = $(element).find("title").first().text().trim();
    if (!title) return;

    // WWR format: "Company Name: Job Title" — split on first ":"
    const colonIndex = title.indexOf(":");
    if (colonIndex === -1) return;

    const company = title.slice(0, colonIndex).trim();
    if (company.length === 0) return;

    names.push(company);
  });

  return names;
}

/**
 * Deduplicate (feedUrl, companyName) pairs by company name (case-insensitive).
 * Returns unique pairs preserving the first-seen casing and feed URL. Empty
 * company names are filtered out.
 *
 * @param pairs  Array of { feedUrl, companyName } (may contain duplicates)
 * @returns      Deduplicated array preserving first-seen entry
 */
export function deduplicateCompanyFeedPairs(
  pairs: { feedUrl: string; companyName: string }[],
): { feedUrl: string; companyName: string }[] {
  const seen = new Set<string>();
  const result: { feedUrl: string; companyName: string }[] = [];

  for (const { feedUrl, companyName } of pairs) {
    const trimmed = companyName.trim();
    if (trimmed.length === 0) continue;

    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push({ feedUrl, companyName: trimmed });
  }

  return result;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the We Work Remotely + Jobicy RSS seeder. Fetches RSS XML from each feed,
 * extracts company names, deduplicates them, and runs each through the Slugger
 * for ATS resolution.
 *
 * Individual feed failures are handled gracefully — a single feed returning an
 * error or invalid XML does not stop the seeder from processing other feeds.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any error
 */
export async function runWwrRssSeeder(
  fetchFn: FetchFn = fetch,
): Promise<WwrRssResult> {
  let totalPosts = 0;
  let resolved = 0;
  let unresolved = 0;
  let error: string | undefined;

  try {
    const allPairs: { feedUrl: string; companyName: string }[] = [];

    for (const feed of RSS_FEEDS) {
      try {
        const response = await fetchFn(feed.url);
        if (!response.ok) {
          // Individual feed failure — continue to next feed
          continue;
        }

        const xml = await response.text();
        const names = extractCompanyNamesFromRss(xml);
        totalPosts += names.length;
        for (const name of names) {
          allPairs.push({ feedUrl: feed.url, companyName: name });
        }
      } catch {
        // Individual feed fetch/parse failure — continue to next feed
      }
    }

    const uniquePairs = deduplicateCompanyFeedPairs(allPairs);

    // Run each unique company through the Slugger
    for (const { feedUrl, companyName } of uniquePairs) {
      try {
        const result: SluggerResult = await resolveSlugger(
          {
            companyName,
            discoverySource: "hn_algolia",
            discoveryContext: `wwr-rss:${feedUrl} company:${companyName}`,
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
        // Individual Slugger failure — count as unresolved, continue
        unresolved++;
      }
    }

    return {
      totalPosts,
      uniqueCompanies: uniquePairs.length,
      resolved,
      unresolved,
      error,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return {
      totalPosts,
      uniqueCompanies: 0,
      resolved,
      unresolved,
      error,
    };
  }
}
