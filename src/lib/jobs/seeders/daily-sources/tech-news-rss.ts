// D11: Tech News RSS + LLM Extraction (TDD §2.2)
// src/lib/jobs/seeders/daily-sources/tech-news-rss.ts
//
// Fetches RSS feeds from tech news sites (TechCrunch, VentureBeat, The Verge)
// and the Hacker News Algolia API, looks for articles about funding/hiring,
// and extracts company names using regex pattern matching.
//
// ── Feeds ────────────────────────────────────────────────────────────────────
// TechCrunch:   https://techcrunch.com/feed/
// VentureBeat:  https://venturebeat.com/feed/
// The Verge:    https://www.theverge.com/rss/index.xml
// Hacker News:  https://hn.algolia.com/api/v1/search?tags=story&query=funding
//               (JSON API, not RSS — stories about funding)
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch RSS XML from each tech news feed (and JSON from HN Algolia)
// 2. Parse XML using cheerio, extract <item> elements
// 3. Filter for articles whose title contains funding/hiring keywords
// 4. Extract company names from article titles using regex patterns
// 5. Deduplicate company names across all feeds
// 6. Run each through the Slugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 10-40 companies/week (funding announcements surface newly-funded startups
// that are likely hiring and configuring ATS platforms).
//
// See TDD §2.2 (D11) for the full specification.

import * as cheerio from "cheerio";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

export interface TechNewsFeed {
  name: string;
  url: string;
}

/** Tech news RSS feeds plus the HN Algolia funding-search JSON API. */
export const TECH_NEWS_FEEDS: TechNewsFeed[] = [
  { name: "techcrunch", url: "https://techcrunch.com/feed/" },
  { name: "venturebeat", url: "https://venturebeat.com/feed/" },
  { name: "the-verge", url: "https://www.theverge.com/rss/index.xml" },
  {
    name: "hn-algolia-funding",
    url: "https://hn.algolia.com/api/v1/search?tags=story&query=funding&hitsPerPage=20",
  },
];

/** Keywords that indicate a funding/hiring/acquisition article. */
export const FUNDING_KEYWORDS = [
  "raises",
  "funding",
  "Series A",
  "Series B",
  "Series C",
  "hiring",
  "acquires",
  "secures",
  "lands",
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface TechNewsRssResult {
  /** Total RSS <item> articles fetched across all feeds. */
  totalArticles: number;
  /** Articles whose title contained funding/hiring keywords. */
  fundingArticles: number;
  /** Unique company names extracted from funding articles (after dedup). */
  uniqueCompanies: number;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

/** A funding-related article extracted from a feed. */
export interface FundingArticle {
  feedName: string;
  title: string;
  companyName: string | null;
}

// ── Pure function: check if text contains funding keywords ───────────────────

/**
 * Check whether a text contains any funding/hiring keywords.
 * Matching is case-insensitive.
 *
 * @param text  The article title (or any text) to check
 * @returns     true if at least one funding keyword is present
 */
export function containsFundingKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return FUNDING_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// ── Pure function: extract company name from article title ───────────────────

/**
 * Regex to extract the company name from a funding/hiring headline.
 * The company name is typically the first word(s) before the keyword.
 *
 * Examples:
 *   "Acme raises $10M Series A"          → "Acme"
 *   "Foobar secures $5M in Series A"     → "Foobar"
 *   "NewCo lands $20M funding round"     → "NewCo"
 *   "BigCorp acquires StartupInc"        → "BigCorp"
 */
const COMPANY_NAME_REGEX =
  /^([A-Z][a-zA-Z0-9\s]+?)\s+(?:raises|secures|lands|acquires)/;

/**
 * Extract a company name from a funding/hiring article title using regex
 * pattern matching.
 *
 * @param title  The article title
 * @returns      The extracted company name, or null if no match
 */
export function extractCompanyNameFromTitle(title: string): string | null {
  const match = title.match(COMPANY_NAME_REGEX);
  if (!match) return null;

  const name = match[1].trim();
  if (name.length === 0) return null;

  return name;
}

// ── Pure function: extract funding articles from RSS XML ─────────────────────

/**
 * Parse RSS XML using cheerio, extract <item> elements, filter for
 * funding-related articles, and extract company names from titles.
 *
 * @param xml       Raw RSS XML string
 * @param feedName  The name of the feed (for provenance)
 * @returns         Array of funding-related articles with extracted company names
 */
export function extractFundingArticlesFromRss(
  xml: string,
  feedName: string,
): FundingArticle[] {
  if (!xml || xml.trim().length === 0) return [];

  const articles: FundingArticle[] = [];

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xml: true });
  } catch {
    // Invalid XML — return empty
    return [];
  }

  $("item").each((_, element) => {
    const title = $(element).find("title").first().text().trim();
    if (!title) return;

    if (!containsFundingKeywords(title)) return;

    const companyName = extractCompanyNameFromTitle(title);
    articles.push({ feedName, title, companyName });
  });

  return articles;
}

// ── Pure function: extract funding articles from HN Algolia JSON ─────────────

interface HnAlgoliaHit {
  title?: string;
  story_title?: string;
}

interface HnAlgoliaResponse {
  hits?: HnAlgoliaHit[];
}

/**
 * Parse HN Algolia JSON response and extract funding-related stories.
 * The HN Algolia API returns JSON (not RSS), with hits containing titles.
 *
 * @param json      Raw JSON string from the HN Algolia API
 * @param feedName  The name of the feed (for provenance)
 * @returns         Array of funding-related articles with extracted company names
 */
export function extractFundingArticlesFromHnAlgolia(
  json: string,
  feedName: string,
): FundingArticle[] {
  if (!json || json.trim().length === 0) return [];

  let data: HnAlgoliaResponse;
  try {
    data = JSON.parse(json) as HnAlgoliaResponse;
  } catch {
    // Invalid JSON — return empty
    return [];
  }

  if (!Array.isArray(data.hits)) return [];

  const articles: FundingArticle[] = [];

  for (const hit of data.hits) {
    const title = (hit.title ?? hit.story_title ?? "").trim();
    if (!title) continue;

    if (!containsFundingKeywords(title)) continue;

    const companyName = extractCompanyNameFromTitle(title);
    articles.push({ feedName, title, companyName });
  }

  return articles;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Tech News RSS seeder. Fetches RSS XML from each tech news feed and
 * JSON from the HN Algolia funding search, extracts funding-related articles,
 * extracts company names, deduplicates them, and runs each through the Slugger
 * for ATS resolution.
 *
 * Individual feed failures are handled gracefully — a single feed returning an
 * error or invalid XML/JSON does not stop the seeder from processing other
 * feeds.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any error
 */
export async function runTechNewsRssSeeder(
  fetchFn: FetchFn = fetch,
): Promise<TechNewsRssResult> {
  let totalArticles = 0;
  let fundingArticles = 0;
  let resolved = 0;
  let unresolved = 0;
  let error: string | undefined;

  try {
    const allArticles: FundingArticle[] = [];

    for (const feed of TECH_NEWS_FEEDS) {
      try {
        const response = await fetchFn(feed.url);
        if (!response.ok) {
          // Individual feed failure — continue to next feed
          continue;
        }

        const body = await response.text();

        // HN Algolia returns JSON; the RSS feeds return XML
        const isHnAlgolia = feed.url.includes("hn.algolia.com");
        const articles = isHnAlgolia
          ? extractFundingArticlesFromHnAlgolia(body, feed.name)
          : extractFundingArticlesFromRss(body, feed.name);

        totalArticles += isHnAlgolia ? articles.length : countRssItems(body);

        allArticles.push(...articles);
      } catch {
        // Individual feed fetch/parse failure — continue to next feed
      }
    }

    fundingArticles = allArticles.length;

    // Deduplicate company names across feeds (case-insensitive)
    const seen = new Set<string>();
    const uniqueCompanies: { companyName: string; article: FundingArticle }[] =
      [];

    for (const article of allArticles) {
      if (!article.companyName) continue;

      const key = article.companyName.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      uniqueCompanies.push({ companyName: article.companyName, article });
    }

    // Run each unique company through the Slugger
    for (const { companyName, article } of uniqueCompanies) {
      try {
        const result: SluggerResult = await resolveSlugger(
          {
            companyName,
            discoverySource: "hn_algolia",
            discoveryContext: `tech-news:${article.feedName} article:${article.title}`,
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
      totalArticles,
      fundingArticles,
      uniqueCompanies: uniqueCompanies.length,
      resolved,
      unresolved,
      error,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return {
      totalArticles,
      fundingArticles,
      uniqueCompanies: 0,
      resolved,
      unresolved,
      error,
    };
  }
}

// ── Helper: count total <item> elements in RSS XML ───────────────────────────

/**
 * Count the total number of <item> elements in an RSS XML string.
 * Used to report totalArticles (all articles, not just funding ones) for RSS
 * feeds. Returns 0 if the XML is invalid or empty.
 *
 * @param xml  Raw RSS XML string
 * @returns    Number of <item> elements
 */
function countRssItems(xml: string): number {
  if (!xml || xml.trim().length === 0) return 0;

  try {
    const $ = cheerio.load(xml, { xml: true });
    return $("item").length;
  } catch {
    return 0;
  }
}
