// v2 Corpus Expansion — Domain Probe Pipeline (Criterion 1 Probe Order)
// src/lib/jobs/seeders/domain-probe.ts
//
// Implements the 5-step probe order from the governing document (Criterion 1
// "Probe Order") for discovering job listings on a company domain without an
// ATS API. This is the v2 alternative to the ATS-API-only poller — it probes
// the company domain directly for static job pages, JSON-LD, and RSS feeds.
//
// ── 5-Step Probe Order (per governing doc) ───────────────────────────────────
//   1. robots.txt → extract sitemap.xml + disallow patterns
//   2. Common paths: HEAD then GET on /jobs, /careers, /open-roles, /hiring,
//      /work-with-us (2s timeout)
//   3. JSON-LD + microdata parse (schema.org/JobPosting)
//   4. Static HTML fallback: cheerio main-content extraction + regex title
//      patterns + mailto: links
//   5. RSS/Atom feed scan in <link> tags
//
// ── Discard Criteria (per governing doc) ─────────────────────────────────────
//   - No job-like text (title + ≥50 word description) after 3 path attempts
//   - Mailto-only with no role context
//   - 4xx/5xx response
//   - Content <200 chars after cleaning
//   - Aggregator domain detected
//   - Log to ingestion_log as `discarded_static`; retry weekly via
//     companyRevivalSweep only if funding signal refreshed
//
// ── Output ───────────────────────────────────────────────────────────────────
// The probe returns `ProvisionalJobSeed` tuples (title + description snippet +
// email + source URL) that the provisional-job-repository inserts as
// `status = 'provisional'` job rows. The `normalizeProvisionalJob` Inngest
// function then normalizes them into active jobs.
//
// See docs/governing/company-corpus-expansion-new.md Criterion 1 "Probe Order"
// and "Discard Criteria".

import * as cheerio from "cheerio";
import { isAggregator } from "@/lib/jobs/seeders/aggregator-blacklist";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Common job-page paths to probe (Step 2). */
export const COMMON_JOB_PATHS = [
  "/jobs",
  "/careers",
  "/open-roles",
  "/hiring",
  "/work-with-us",
] as const;

/** Fetch timeout for probe requests (2 seconds per governing doc). */
export const PROBE_TIMEOUT_MS = 2000;

/** Minimum content length after cleaning (discard criterion). */
export const MIN_CONTENT_LENGTH = 200;

/** Minimum word count for a job description (discard criterion). */
export const MIN_DESCRIPTION_WORDS = 50;

/** Regex for extracting mailto: links from HTML. */
const MAILTO_REGEX = /mailto:([^"'>\s]+)/gi;

/**
 * Title patterns indicating a job listing. Used in Step 4 (static HTML
 * fallback) to detect job-like text. Matches seniority + role keywords.
 */
const JOB_TITLE_PATTERNS: RegExp[] = [
  /\b(senior|junior|lead|staff|principal)\s+(engineer|developer|designer|product\s+manager|data\s+scientist)\b/i,
  /\b(software|backend|frontend|full[- ]?stack|devops|sre|site\s+reliability)\s+(engineer|developer)\b/i,
  /\b(engineer|developer|designer|product\s+manager|program\s+manager|project\s+manager)\b/i,
];

// ── Types ────────────────────────────────────────────────────────────────────

/** A provisional job seed extracted from the probe pipeline. */
export interface ProvisionalJobSeed {
  /** The job title extracted from the page (or a placeholder if unknown). */
  title: string;
  /** The raw HTML snippet containing the job description. */
  htmlSnippet: string;
  /** The cleaned text of the job description. */
  cleanedText: string;
  /** An email address extracted from the page (e.g. mailto: link), if any. */
  email: string | null;
  /** The URL where the job listing was found. */
  sourceUrl: string;
  /** Which probe step discovered this job (for observability). */
  discoveredBy:
    | "step2_common_path"
    | "step3_jsonld"
    | "step4_static_html"
    | "step5_rss";
}

/** The result of probing a single company domain. */
export interface ProbeResult {
  /** The company domain that was probed (e.g. "acme.com"). */
  domain: string;
  /** Provisional job seeds extracted from the domain. */
  jobs: ProvisionalJobSeed[];
  /** The discard reason if the domain was discarded (null if not discarded). */
  discardReason: DiscardReason | null;
  /** Which step found the first job (for observability). */
  resolvedByStep: number | null;
  /** Error message if a critical error occurred. */
  error?: string;
}

/**
 * The reason a domain was discarded (per governing doc discard criteria).
 *
 * Granular reasons (Task A3) distinguish "need new Cheerio selector" from
 * "need regex adjustment" from "content genuinely missing" — enabling
 * targeted selector expansion based on production data patterns.
 */
export type DiscardReason =
  // Pre-existing reasons
  | "no_job_text" // No job-like text after 3 path attempts (fallback)
  | "mailto_only_no_role" // Mailto links but no role context
  | "http_error" // 4xx/5xx response on all paths
  | "content_too_short" // Content < 200 chars after cleaning
  | "aggregator_domain" // Aggregator domain detected
  | "no_paths_found" // No job paths returned 200
  // Granular reasons (Task A3) — logged to ingestion_log.errorDetails
  // to distinguish "need new Cheerio selector" from "need regex adjustment"
  | "no_content" // Page responded 200 but body was empty/no extractable text
  | "no_title_match" // Content ≥200 chars but no job title pattern matched (regex gap)
  | "below_word_threshold"; // Content found but <50 word description (thin posting)

// ── Pure function: normalize a domain to a base URL ──────────────────────────

/**
 * Normalize a domain string to a base URL (protocol + host, no path).
 * Adds the https:// scheme if missing. Returns null if the domain is invalid.
 *
 * @param domain  The domain (e.g. "acme.com" or "https://acme.com")
 * @returns        The base URL (e.g. "https://acme.com") or null
 */
export function normalizeDomain(domain: string): string | null {
  if (!domain || domain.trim().length === 0) return null;
  const trimmed = domain.trim();
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      return `${parsed.protocol}//${parsed.host}`;
    }
    // Add https:// prefix for bare domains
    const parsed = new URL(`https://${trimmed}`);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return null;
  }
}

// ── Step 1: robots.txt ───────────────────────────────────────────────────────

/** The parsed robots.txt result. */
export interface RobotsTxtResult {
  /** Sitemap URLs declared in robots.txt. */
  sitemaps: string[];
  /** Path patterns disallowed by robots.txt. */
  disallows: string[];
}

/**
 * Parse a robots.txt body for sitemap declarations and disallow patterns.
 *
 * @param body  The raw robots.txt body
 * @returns     Parsed sitemaps and disallow patterns
 */
export function parseRobotsTxt(body: string): RobotsTxtResult {
  const sitemaps: string[] = [];
  const disallows: string[] = [];

  if (!body) return { sitemaps, disallows };

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const sitemapMatch = trimmed.match(/^sitemap:\s*(.+)$/i);
    if (sitemapMatch) {
      const url = sitemapMatch[1].trim();
      if (url) sitemaps.push(url);
      continue;
    }

    const disallowMatch = trimmed.match(/^disallow:\s*(.*)$/i);
    if (disallowMatch) {
      const path = disallowMatch[1].trim();
      if (path) disallows.push(path);
    }
  }

  return { sitemaps, disallows };
}

/**
 * Check whether a path is disallowed by robots.txt.
 *
 * @param path       The path to check (e.g. "/jobs")
 * @param disallows  The disallow patterns from robots.txt
 * @returns          true if the path matches a disallow pattern
 */
export function isPathDisallowed(path: string, disallows: string[]): boolean {
  return disallows.some((pattern) => {
    if (pattern === "/") return false; // Universal disallow is ignored for probes
    // Treat the pattern as a prefix match (robots.txt simple matching)
    return path.startsWith(pattern);
  });
}

// ── Step 3: JSON-LD JobPosting parse ─────────────────────────────────────────

/** A job posting extracted from JSON-LD structured data. */
export interface JsonLdJobPosting {
  title: string;
  description: string;
  url?: string;
}

/**
 * Parse HTML for JSON-LD structured data of type schema.org/JobPosting.
 * Extracts job postings from <script type="application/ld+json"> blocks.
 *
 * @param html  The raw HTML to parse
 * @returns     Array of JobPosting objects found in JSON-LD
 */
export function parseJsonLdJobPostings(html: string): JsonLdJobPosting[] {
  if (!html) return [];

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return [];
  }

  const postings: JsonLdJobPosting[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    const content = $(el).html();
    if (!content) return;

    try {
      const parsed = JSON.parse(content);

      // Handle single object, array, and @graph structures.
      const candidates: unknown[] = [];
      if (Array.isArray(parsed)) {
        candidates.push(...parsed);
      } else if (parsed && typeof parsed === "object") {
        if (Array.isArray((parsed as { "@graph"?: unknown[] })["@graph"])) {
          candidates.push(...(parsed as { "@graph": unknown[] })["@graph"]);
        } else {
          candidates.push(parsed);
        }
      }

      for (const candidate of candidates) {
        if (
          typeof candidate === "object" &&
          candidate !== null &&
          (candidate as { "@type"?: string })["@type"] === "JobPosting"
        ) {
          const job = candidate as {
            title?: string;
            description?: string;
            url?: string;
          };
          if (job.title && job.description) {
            postings.push({
              title: String(job.title),
              description: String(job.description),
              url: job.url ? String(job.url) : undefined,
            });
          }
        }
      }
    } catch {
      // Invalid JSON-LD — skip this block
    }
  });

  return postings;
}

// ── Step 4: Static HTML fallback ─────────────────────────────────────────────

/**
 * Extract job-like content from a static HTML page using cheerio + heuristics.
 *
 * Strategy (per governing doc Step 4):
 *   1. Strip nav/footer/header/aside/script/style.
 *   2. Target semantic containers (main, [role="main"], article, .jobs,
 *      .careers, .job-listing).
 *   3. Fall back to text-density scoring on top-level divs.
 *   4. Regex extract title patterns + mailto: links.
 *
 * @param html  The raw HTML to parse
 * @returns     The extracted job content, or null if no job-like text found
 */
export function extractStaticHtmlJobContent(html: string): {
  cleanedText: string;
  email: string | null;
  hasJobTitle: boolean;
} | null {
  if (!html || html.trim().length === 0) return null;

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return null;
  }

  // Extract mailto: links first (before stripping).
  let email: string | null = null;
  const mailtoMatch = html.match(MAILTO_REGEX);
  if (mailtoMatch && mailtoMatch.length > 0) {
    const first = mailtoMatch[0].replace(/^mailto:/i, "");
    if (first && !first.includes("example.com")) {
      email = first;
    }
  }

  // Strip boilerplate tags.
  const stripTags = ["nav", "footer", "header", "aside", "script", "style"];
  for (const tag of stripTags) {
    $(tag).remove();
  }

  // Target semantic containers in priority order.
  const semanticSelectors = [
    "main",
    '[role="main"]',
    "article",
    ".jobs",
    ".careers",
    ".job-listing",
    ".job-description",
  ];

  let bestText = "";
  for (const selector of semanticSelectors) {
    const el = $(selector).first();
    if (el.length > 0) {
      const text = el.text().replace(/\s+/g, " ").trim();
      if (text.length > bestText.length) {
        bestText = text;
      }
    }
  }

  // Fall back to text-density scoring on top-level divs.
  if (bestText.length < MIN_CONTENT_LENGTH) {
    let bestScore = 0;
    $("body > div, div").each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length < MIN_CONTENT_LENGTH) return;
      const childCount = $el.children().length;
      const density = childCount > 0 ? text.length / childCount : text.length;
      if (density > bestScore) {
        bestScore = density;
        bestText = text;
      }
    });
  }

  // Last resort: full body text.
  if (bestText.length < MIN_CONTENT_LENGTH) {
    bestText = $("body").text().replace(/\s+/g, " ").trim();
  }

  // Return the extracted text regardless of length — the caller distinguishes
  // "no content" (null return from cheerio failure) from "content too short"
  // (cleanedText.length < MIN_CONTENT_LENGTH) for granular discard reasons.
  if (!bestText || bestText.length === 0) {
    return null;
  }

  // Check for job-title patterns.
  const hasJobTitle = JOB_TITLE_PATTERNS.some((pattern) =>
    pattern.test(bestText),
  );

  return { cleanedText: bestText, email, hasJobTitle };
}

// ── Step 5: RSS/Atom feed scan ───────────────────────────────────────────────

/**
 * Scan HTML <link> tags for RSS/Atom feed URLs.
 *
 * @param html  The raw HTML to scan
 * @param baseUrl  The base URL for resolving relative links
 * @returns     Array of feed URLs found in <link> tags
 */
export function findFeedLinks(html: string, baseUrl: string): string[] {
  if (!html) return [];

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return [];
  }

  const feeds: string[] = [];
  $(
    'link[type*="rss"], link[type*="atom"], link[type="application/json"]',
  ).each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const resolved = new URL(href, baseUrl).toString();
      feeds.push(resolved);
    } catch {
      // Invalid href — skip
    }
  });

  return feeds;
}

// ── Discard criteria ─────────────────────────────────────────────────────────

/**
 * Check whether a domain is a known aggregator (discard criterion).
 * Uses the existing aggregator-blacklist module.
 *
 * @param domain  The domain to check
 * @returns       true if the domain matches a known aggregator
 */
export function isAggregatorDomain(domain: string): boolean {
  return isAggregator(domain, domain);
}

/**
 * Count the number of words in a text string.
 * Used for the "≥50 word description" discard criterion.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

// ── Main probe orchestrator ──────────────────────────────────────────────────

/**
 * Run the full 5-step domain probe pipeline for a single company domain.
 *
 * Flow (per governing doc Criterion 1 "Probe Order"):
 *   1. Fetch robots.txt → extract sitemaps + disallows
 *   2. Probe common job paths (/jobs, /careers, /open-roles, /hiring,
 *      /work-with-us) — skip paths disallowed by robots.txt
 *   3. For each responding path: parse JSON-LD JobPosting (Step 3)
 *   4. If no JSON-LD: static HTML fallback (Step 4)
 *   5. If no job content: scan for RSS/Atom feeds (Step 5)
 *   6. Apply discard criteria
 *
 * @param domain   The company domain (e.g. "acme.com")
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        The probe result with extracted jobs or discard reason
 */
export async function probeDomain(
  domain: string,
  fetchFn: FetchFn = fetch,
): Promise<ProbeResult> {
  const baseUrl = normalizeDomain(domain);
  if (!baseUrl) {
    return {
      domain,
      jobs: [],
      discardReason: "no_paths_found",
      resolvedByStep: null,
      error: `Invalid domain: ${domain}`,
    };
  }

  // Aggregator domain check (discard criterion — check early).
  if (isAggregatorDomain(domain)) {
    return {
      domain,
      jobs: [],
      discardReason: "aggregator_domain",
      resolvedByStep: null,
    };
  }

  const jobs: ProvisionalJobSeed[] = [];
  let resolvedByStep: number | null = null;
  let pathsAttempted = 0;
  let httpErrorCount = 0;

  // Track per-path skip reasons for granular discard diagnostics (Task A3).
  // When no jobs are found, the most specific skip reason becomes the final
  // discard reason — enabling targeted selector/regex expansion.
  const pathSkipReasons: DiscardReason[] = [];

  try {
    // ── Step 1: robots.txt ──────────────────────────────────────────────────
    let disallows: string[] = [];
    try {
      const robotsResponse = await fetchWithTimeout(
        fetchFn,
        `${baseUrl}/robots.txt`,
      );
      if (robotsResponse.ok) {
        const robotsBody = await robotsResponse.text();
        const robots = parseRobotsTxt(robotsBody);
        disallows = robots.disallows;
      }
    } catch {
      // robots.txt fetch failure is non-fatal — continue with empty disallows
    }

    // ── Step 2: Common job paths ────────────────────────────────────────────
    for (const path of COMMON_JOB_PATHS) {
      if (isPathDisallowed(path, disallows)) continue;

      pathsAttempted++;
      const url = `${baseUrl}${path}`;

      let response: Response;
      try {
        response = await fetchWithTimeout(fetchFn, url, "HEAD");
        if (!response.ok) {
          // Try GET if HEAD fails (some servers don't support HEAD)
          response = await fetchWithTimeout(fetchFn, url, "GET");
        }
      } catch {
        httpErrorCount++;
        continue;
      }

      if (!response.ok) {
        if (response.status >= 400) httpErrorCount++;
        continue;
      }

      // For HEAD requests that succeeded, we need a GET to fetch the body.
      let body: string;
      try {
        const getResponse = await fetchWithTimeout(fetchFn, url, "GET");
        if (!getResponse.ok) continue;
        body = await getResponse.text();
      } catch {
        continue;
      }

      // ── Step 3: JSON-LD JobPosting parse ──────────────────────────────────
      const jsonLdPostings = parseJsonLdJobPostings(body);
      if (jsonLdPostings.length > 0) {
        for (const posting of jsonLdPostings) {
          const cleanedText = posting.description
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          if (countWords(cleanedText) < MIN_DESCRIPTION_WORDS) {
            pathSkipReasons.push("below_word_threshold");
            continue;
          }
          jobs.push({
            title: posting.title,
            htmlSnippet: posting.description,
            cleanedText,
            email: null,
            sourceUrl: posting.url ?? url,
            discoveredBy: "step3_jsonld",
          });
        }
        if (jobs.length > 0 && resolvedByStep === null) {
          resolvedByStep = 3;
        }
      }

      // ── Step 4: Static HTML fallback ──────────────────────────────────────
      if (jobs.length === 0) {
        const staticContent = extractStaticHtmlJobContent(body);
        if (staticContent === null) {
          // No extractable content at all — Cheerio selector gap
          pathSkipReasons.push("no_content");
        } else if (staticContent.cleanedText.length < MIN_CONTENT_LENGTH) {
          // Content extracted but too short — possible selector gap or thin page
          pathSkipReasons.push("content_too_short");
        } else if (!staticContent.hasJobTitle && staticContent.email === null) {
          // Content ≥200 chars but no job title pattern matched — regex gap
          pathSkipReasons.push("no_title_match");
        } else if (!staticContent.hasJobTitle && staticContent.email !== null) {
          // Mailto-only with no role context
          pathSkipReasons.push("mailto_only_no_role");
        } else if (staticContent.hasJobTitle || staticContent.email) {
          jobs.push({
            title:
              extractTitleFromText(staticContent.cleanedText) ??
              "Untitled Role",
            htmlSnippet: body.slice(0, 5000), // cap snippet size
            cleanedText: staticContent.cleanedText,
            email: staticContent.email,
            sourceUrl: url,
            discoveredBy: "step4_static_html",
          });
          if (resolvedByStep === null) {
            resolvedByStep = 4;
          }
        }
      }

      // ── Step 5: RSS/Atom feed scan ────────────────────────────────────────
      if (jobs.length === 0) {
        const feeds = findFeedLinks(body, url);
        // For each feed, fetch and parse for job entries.
        for (const feedUrl of feeds.slice(0, 3)) {
          try {
            const feedResponse = await fetchWithTimeout(fetchFn, feedUrl);
            if (!feedResponse.ok) continue;
            const feedBody = await feedResponse.text();
            const feedJobs = extractJobsFromFeed(feedBody, feedUrl);
            if (feedJobs.length > 0) {
              jobs.push(...feedJobs);
              if (resolvedByStep === null) {
                resolvedByStep = 5;
              }
              break;
            }
          } catch {
            // Feed fetch failure — continue to next feed
          }
        }
      }

      // If we found jobs from this path, stop probing more paths.
      if (jobs.length > 0) break;
    }

    // ── Apply discard criteria ──────────────────────────────────────────────
    if (jobs.length === 0) {
      let discardReason: DiscardReason;
      if (pathsAttempted > 0 && httpErrorCount === pathsAttempted) {
        discardReason = "http_error";
      } else if (pathsAttempted === 0) {
        discardReason = "no_paths_found";
      } else {
        // Use the most specific per-path skip reason if available (Task A3).
        // Priority is based on actionability: reasons that indicate content
        // was found but didn't match patterns are more actionable than "couldn't
        // extract anything" (which is a selector gap).
        //   no_title_match → "need regex adjustment" (content was there)
        //   below_word_threshold → "thin posting" (content was there but short)
        //   mailto_only_no_role → "mailto-only careers page" (email found)
        //   content_too_short → "selector extracted too little" (some content)
        //   no_content → "selector gap" (nothing extracted — try new selectors)
        const priorityOrder: DiscardReason[] = [
          "no_title_match",
          "below_word_threshold",
          "mailto_only_no_role",
          "content_too_short",
          "no_content",
        ];
        const specificReason = priorityOrder.find((r) =>
          pathSkipReasons.includes(r),
        );
        discardReason = specificReason ?? "no_job_text";
      }
      return {
        domain,
        jobs: [],
        discardReason,
        resolvedByStep: null,
      };
    }

    return {
      domain,
      jobs,
      discardReason: null,
      resolvedByStep,
    };
  } catch (err) {
    return {
      domain,
      jobs: [],
      discardReason: "no_paths_found",
      resolvedByStep: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Helper: fetch with timeout ───────────────────────────────────────────────

/**
 * Fetch a URL with a timeout. Aborts the request if it takes longer than
 * PROBE_TIMEOUT_MS. Uses AbortController (available in Node 18+ and browsers).
 *
 * @param fetchFn  The fetch function to use
 * @param url      The URL to fetch
 * @param method   The HTTP method ("GET" or "HEAD")
 * @returns        The fetch Response
 */
async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetchFn(url, {
      method,
      signal: controller.signal as AbortSignal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ── Helper: extract a title from cleaned text ────────────────────────────────

/**
 * Extract a job title from cleaned text by matching against the title
 * patterns. Returns the first match, or null if no title is found.
 */
function extractTitleFromText(text: string): string | null {
  for (const pattern of JOB_TITLE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}

// ── Helper: extract jobs from an RSS/Atom feed ───────────────────────────────

/**
 * Parse an RSS/Atom feed and extract job-like entries.
 * An entry is "job-like" if its title matches a job-title pattern.
 *
 * @param feedBody  The raw feed XML
 * @param feedUrl   The feed URL (for provenance)
 * @returns         Array of provisional job seeds
 */
function extractJobsFromFeed(
  feedBody: string,
  feedUrl: string,
): ProvisionalJobSeed[] {
  if (!feedBody) return [];

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(feedBody, { xml: true });
  } catch {
    return [];
  }

  const jobs: ProvisionalJobSeed[] = [];
  const items = $("item").length > 0 ? $("item") : $("entry");

  items.each((_, el) => {
    const title = $(el).find("title").first().text().trim();
    if (!title) return;
    if (!JOB_TITLE_PATTERNS.some((p) => p.test(title))) return;

    const description =
      $(el).find("description").first().text().trim() ||
      $(el).find("content\\:encoded").first().text().trim() ||
      $(el).find("summary").first().text().trim();

    const cleanedText = description
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (countWords(cleanedText) < MIN_DESCRIPTION_WORDS) return;

    const link =
      $(el).find("link").first().text().trim() ||
      $(el).find("link").first().attr("href") ||
      feedUrl;

    jobs.push({
      title,
      htmlSnippet: description,
      cleanedText,
      email: null,
      sourceUrl: link,
      discoveredBy: "step5_rss",
    });
  });

  return jobs;
}
