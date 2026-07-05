// v2 Corpus Expansion — Funding-Signal RSS Seeder (Criterion 1 Discovery Layer)
// src/lib/jobs/seeders/daily-sources/funding-signal-rss.ts
//
// Replaces the v1 bulk-undifferentiated seeders with funding-signal-driven
// company discovery. Parses RSS/Atom funding feeds (TechCrunch, VentureBeat,
// etc.) for funding-round announcements, extracts company names + funding
// stage, estimates employee count from the stage, and applies the startup
// filter (`employee_count < 50`) before registry insert.
//
// ── Approach (per governing doc Criterion 1 "Discovery Layer") ───────────────
// 1. Fetch RSS/Atom feeds from tech-news sources that cover funding rounds.
// 2. Parse each <item> for funding-round keywords (raises, Series A, seed, etc.)
// 3. Extract the company name from the headline.
// 4. Estimate employee count from the funding stage mentioned in the headline.
//    Pre-seed/Seed → ~15, Series A → ~35, Series B+ → filtered out (>= 50).
// 5. Detect public-company signals (IPO, NYSE, NASDAQ) → isPublic = true.
// 6. Apply the startup filter: discard companies with estimated employee_count
//    >= 50 (Series B+ companies are too large for the startup corpus).
// 7. Insert surviving companies via the Slugger with discoverySource =
//    "funding_signal" and employeeCount populated.
//
// ── Employee count estimation ────────────────────────────────────────────────
// The governing doc says: "Employee count sourced from funding-signal metadata
// (round size, stage) at discovery time; no external enrichment API required."
// RSS articles mention the funding stage (Seed, Series A, etc.) but rarely the
// exact employee count. We estimate from stage using YC/industry benchmarks:
//   Pre-seed → 5, Seed → 15, Series A → 35, Series B → 60 (filtered),
//   Series C+ → 100+ (filtered).
// The estimate is conservative — it's a filter heuristic, not a precise count.
// The `company.employeeCount` column is the canonical source for scoring; the
// big-tech-registry (Phase 4) overrides this for the curated set.
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 5-15 startup-stage companies/day from funding announcements. Series B+
// companies are filtered out by the startup filter.
//
// See docs/governing/company-corpus-expansion-new.md Criterion 1.

import * as cheerio from "cheerio";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

export interface FundingFeed {
  name: string;
  url: string;
}

/**
 * RSS/Atom feeds that cover startup funding rounds. These are the primary
 * funding-signal sources for the v2 discovery layer.
 */
export const FUNDING_FEEDS: FundingFeed[] = [
  { name: "techcrunch", url: "https://techcrunch.com/feed/" },
  { name: "venturebeat", url: "https://venturebeat.com/feed/" },
  {
    name: "techcrunch-startups",
    url: "https://techcrunch.com/category/startups/feed/",
  },
];

/**
 * Keywords that indicate a funding-round announcement. Matched against the
 * article title (case-insensitive).
 */
export const FUNDING_ROUND_KEYWORDS = [
  "raises",
  "secures",
  "lands",
  "closes",
  "series a",
  "series b",
  "series c",
  "seed round",
  "seed funding",
  "pre-seed",
  "pre seed",
  "extension",
  "tops up",
  "bankrolls",
];

/**
 * Public-company signals. If any appear in the article title, the company is
 * flagged as `isPublic = true` for the scoring matrix (−20 penalty).
 */
const PUBLIC_COMPANY_SIGNALS = [
  "ipo",
  "publicly traded",
  "publicly-listed",
  "nyse:",
  "nasdaq:",
  "goes public",
  "files for ipo",
];

/** Startup filter threshold — companies with >= this many employees are filtered out. */
export const STARTUP_EMPLOYEE_THRESHOLD = 50;

// ── Types ────────────────────────────────────────────────────────────────────

export interface FundingSignalRssResult {
  /** Total RSS <item> articles fetched across all feeds. */
  totalArticles: number;
  /** Articles whose title contained funding-round keywords. */
  fundingArticles: number;
  /** Unique company names extracted from funding articles (after dedup). */
  uniqueCompanies: number;
  /** Companies filtered out by the startup filter (estimated >= 50 employees). */
  filteredByStartupThreshold: number;
  /** Companies successfully resolved by the Slugger (inserted into registry). */
  resolved: number;
  /** Companies that failed Slugger resolution (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

/** A funding-round announcement extracted from a feed. */
export interface FundingSignalArticle {
  feedName: string;
  title: string;
  companyName: string | null;
  /** Estimated employee count based on funding stage. Null if undeterminable. */
  estimatedEmployeeCount: number | null;
  /** True if the article mentions public-company signals (IPO, exchange). */
  isPublic: boolean;
  /** The funding stage detected (for observability). */
  fundingStage: string | null;
}

// ── Pure function: check if text contains funding-round keywords ─────────────

/**
 * Check whether a text contains any funding-round keywords.
 * Matching is case-insensitive.
 */
export function containsFundingRoundKeywords(text: string): boolean {
  const lower = text.toLowerCase();
  return FUNDING_ROUND_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Pure function: detect public-company signals ─────────────────────────────

/**
 * Check whether a text contains public-company signals (IPO, stock exchange
 * mentions). Used to flag `isPublic = true` for the scoring matrix.
 */
export function containsPublicCompanySignals(text: string): boolean {
  const lower = text.toLowerCase();
  return PUBLIC_COMPANY_SIGNALS.some((sig) => lower.includes(sig));
}

// ── Pure function: extract company name from article title ───────────────────

/**
 * Regex to extract the company name from a funding-round headline.
 * The company name is typically the first word(s) before the funding keyword.
 *
 * Examples:
 *   "Acme raises $10M Series A"          → "Acme"
 *   "Foobar secures $5M in seed funding" → "Foobar"
 *   "NewCo lands $20M to build devtools" → "NewCo"
 *   "Stripe closes $50M extension"       → "Stripe"
 */
const COMPANY_NAME_REGEX =
  /^([A-Z][A-Za-z0-9.&-]+(?:\s[A-Z][A-Za-z0-9.&-]+)?)\s+(?:raises|secures|lands|closes|tops up|bankrolls)/;

/**
 * Extract a company name from a funding-round article title.
 * Returns null if no company name can be extracted.
 *
 * Parenthetical insertions (e.g. "(NYSE: ACME)" ticker annotations) are
 * stripped from the title before matching — they appear between the company
 * name and the funding keyword and would break the regex otherwise.
 */
export function extractCompanyNameFromTitle(title: string): string | null {
  // Strip parenthetical insertions — ticker annotations, exchange tags, etc.
  // These break the "Company raises ..." pattern by inserting content between
  // the company name and the funding keyword.
  const cleaned = title.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const match = cleaned.match(COMPANY_NAME_REGEX);
  if (!match) return null;
  const name = match[1].trim();
  if (name.length === 0) return null;
  return name;
}

// ── Pure function: estimate employee count from funding stage ────────────────

/**
 * Funding stage patterns and their estimated employee counts.
 * Estimates are conservative (industry/YC benchmarks) — used for the startup
 * filter, not as a precise count.
 *
 * Stages with estimated >= 50 employees are flagged to be filtered out.
 */
const STAGE_ESTIMATES: { pattern: RegExp; stage: string; estimate: number }[] =
  [
    { pattern: /\bpre[- ]?seed\b/i, stage: "pre_seed", estimate: 5 },
    {
      pattern: /\bseed(?:\s+(?:round|funding))?\b/i,
      stage: "seed",
      estimate: 15,
    },
    {
      pattern: /\bseries\s*a\b/i,
      stage: "series_a",
      estimate: 35,
    },
    {
      pattern: /\bseries\s*b\b/i,
      stage: "series_b",
      estimate: 60,
    },
    {
      pattern: /\bseries\s*[c-z]\b/i,
      stage: "series_c_plus",
      estimate: 100,
    },
    {
      pattern: /\bextension\b/i,
      stage: "extension",
      estimate: 40,
    },
  ];

/**
 * Estimate the employee count from the funding stage mentioned in the title.
 * Returns `{ stage, estimate }` or `{ stage: null, estimate: null }` if no
 * stage is detected.
 *
 * @param title  The article title to scan for funding-stage keywords.
 * @returns      The detected stage and estimated employee count.
 */
export function estimateEmployeeCountFromStage(title: string): {
  stage: string | null;
  estimate: number | null;
} {
  for (const { pattern, stage, estimate } of STAGE_ESTIMATES) {
    if (pattern.test(title)) {
      return { stage, estimate };
    }
  }
  return { stage: null, estimate: null };
}

// ── Pure function: check the startup filter ──────────────────────────────────

/**
 * Check whether a company passes the startup filter.
 * Companies with estimated employee_count >= STARTUP_EMPLOYEE_THRESHOLD (50)
 * are filtered out — they're too large for the startup corpus.
 *
 * Per governing doc: "employee_count < 50 enforced before registry insert."
 *
 * @param estimatedEmployeeCount  The estimated employee count (null = unknown)
 * @returns  true if the company passes the filter (should be inserted)
 */
export function passesStartupFilter(
  estimatedEmployeeCount: number | null,
): boolean {
  if (estimatedEmployeeCount === null) {
    // Unknown employee count — allow through. The funding-signal itself
    // (a funding announcement) is a startup signal. The filter only discards
    // companies we can estimate are >= 50.
    return true;
  }
  return estimatedEmployeeCount < STARTUP_EMPLOYEE_THRESHOLD;
}

// ── Pure function: extract funding articles from RSS/Atom XML ────────────────

/**
 * Parse RSS/Atom XML using cheerio, extract <item> elements, filter for
 * funding-round articles, and extract company names + stage estimates.
 *
 * Handles both RSS (<item>) and Atom (<entry>) feed formats.
 *
 * @param xml       Raw RSS/Atom XML string
 * @param feedName  The name of the feed (for provenance)
 * @returns         Array of funding-round articles with extracted metadata
 */
export function extractFundingArticlesFromRss(
  xml: string,
  feedName: string,
): FundingSignalArticle[] {
  if (!xml || xml.trim().length === 0) return [];

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xml: true });
  } catch {
    return [];
  }

  const articles: FundingSignalArticle[] = [];

  // RSS uses <item>, Atom uses <entry>. Check both.
  const items = $("item").length > 0 ? $("item") : $("entry");

  items.each((_, element) => {
    const title = $(element).find("title").first().text().trim();
    if (!title) return;

    if (!containsFundingRoundKeywords(title)) return;

    const companyName = extractCompanyNameFromTitle(title);
    const { stage, estimate } = estimateEmployeeCountFromStage(title);
    const isPublic = containsPublicCompanySignals(title);

    articles.push({
      feedName,
      title,
      companyName,
      estimatedEmployeeCount: estimate,
      isPublic,
      fundingStage: stage,
    });
  });

  return articles;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the v2 Funding-Signal RSS seeder. Fetches RSS/Atom feeds from tech-news
 * sources, extracts funding-round announcements, estimates employee count from
 * the funding stage, applies the startup filter (< 50 employees), and inserts
 * surviving companies via the Slugger with `discoverySource = "funding_signal"`.
 *
 * Individual feed failures are handled gracefully — a single feed returning an
 * error or invalid XML does not stop the seeder from processing other feeds.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any error
 */
export async function runFundingSignalRssSeeder(
  fetchFn: FetchFn = fetch,
): Promise<FundingSignalRssResult> {
  let totalArticles = 0;
  let fundingArticles = 0;
  let filteredByStartupThreshold = 0;
  let resolved = 0;
  let unresolved = 0;
  let error: string | undefined;

  try {
    const allArticles: FundingSignalArticle[] = [];

    for (const feed of FUNDING_FEEDS) {
      try {
        const response = await fetchFn(feed.url);
        if (!response.ok) continue;

        const body = await response.text();
        const articles = extractFundingArticlesFromRss(body, feed.name);

        // Count total articles in this feed for observability.
        totalArticles += countFeedItems(body);
        allArticles.push(...articles);
      } catch {
        // Individual feed fetch/parse failure — continue to next feed
      }
    }

    fundingArticles = allArticles.length;

    // Deduplicate company names across feeds (case-insensitive).
    const seen = new Set<string>();
    const uniqueCompanies: {
      companyName: string;
      article: FundingSignalArticle;
    }[] = [];

    for (const article of allArticles) {
      if (!article.companyName) continue;

      const key = article.companyName.toLowerCase();
      if (seen.has(key)) continue;

      seen.add(key);
      uniqueCompanies.push({ companyName: article.companyName, article });
    }

    // Apply the startup filter: discard companies with estimated >= 50 employees.
    const passingCompanies = uniqueCompanies.filter(({ article }) => {
      const passes = passesStartupFilter(article.estimatedEmployeeCount);
      if (!passes) filteredByStartupThreshold++;
      return passes;
    });

    // Run each surviving company through the Slugger for ATS resolution.
    // Pass the v2 scoring-signal fields (employeeCount, isPublic) through to
    // the company row so the scoring matrix (Phase 4) can use them.
    for (const { companyName, article } of passingCompanies) {
      try {
        const result: SluggerResult = await resolveSlugger(
          {
            companyName,
            discoverySource: "funding_signal",
            discoveryContext: `funding-signal-rss:${article.feedName} stage:${article.fundingStage ?? "unknown"} article:${article.title}`,
            // v2 scoring signals — populated from funding metadata.
            ...(article.estimatedEmployeeCount !== null
              ? { employeeCount: article.estimatedEmployeeCount }
              : {}),
            ...(article.isPublic ? { isPublic: true } : {}),
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
      filteredByStartupThreshold,
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
      filteredByStartupThreshold,
      resolved,
      unresolved,
      error,
    };
  }
}

// ── Helper: count total feed items in RSS/Atom XML ───────────────────────────

/**
 * Count the total number of <item> (RSS) or <entry> (Atom) elements in a feed.
 * Used to report totalArticles (all articles, not just funding ones).
 */
function countFeedItems(xml: string): number {
  if (!xml || xml.trim().length === 0) return 0;
  try {
    const $ = cheerio.load(xml, { xml: true });
    return $("item").length > 0 ? $("item").length : $("entry").length;
  } catch {
    return 0;
  }
}
