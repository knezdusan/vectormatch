// B5: Developer Newsletter Archives Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/newsletter-archives.ts
//
// Crawls developer newsletter archive pages (JS Weekly, React Status, Node
// Weekly, TypeScript Weekly, CSS Weekly), extracts external links from each
// issue, and uses a dual strategy:
//   1. Direct ATS URLs (boards.greenhouse.io, jobs.lever.co, etc.) → extract
//      slugs directly (no Slugger needed)
//   2. Other company/career page URLs → extract company name from link text
//      and run through the Slugger
//
// ── Newsletter list ──────────────────────────────────────────────────────────
// All 5 newsletters are published by Cooper Press and have similar HTML
// structures. The archive page lists all issues; each issue page contains
// links to articles, tools, and sponsor content.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch the archive page for each newsletter
// 2. Extract issue URLs (e.g. javascriptweekly.com/issues/700)
// 3. Fetch the most recent N issues (default: 10)
// 4. Extract all external links from each issue
// 5. For ATS domain links: extract slug directly
// 6. For other links: use link text as company name → Slugger
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 200-500 companies (newsletters frequently feature tech companies hiring).
//
// See TDD §2.1 (B5) for the full specification.

import * as cheerio from "cheerio";
import {
  extractSlugFromAtsUrl,
  inferAtsSourceFromUrl,
} from "@/lib/jobs/seeders/batch-sources/ats-url-utils";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NewsletterSource {
  name: string;
  archiveUrl: string;
}

export interface NewsletterLink {
  url: string;
  text: string;
  newsletter: string;
}

export interface NewsletterResult {
  /** Total issues crawled. */
  issuesCrawled: number;
  /** Total external links extracted. */
  totalLinksExtracted: number;
  /** Companies inserted via direct ATS slug extraction. */
  directSlugInserts: number;
  /** Companies resolved via Slugger. */
  sluggerResolved: number;
  /** Companies that failed Slugger resolution. */
  sluggerUnresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Newsletter sources ───────────────────────────────────────────────────────

export const NEWSLETTER_SOURCES: NewsletterSource[] = [
  {
    name: "JavaScript Weekly",
    archiveUrl: "https://javascriptweekly.com/issues",
  },
  { name: "React Status", archiveUrl: "https://react.statuscode.com/issues" },
  { name: "Node Weekly", archiveUrl: "https://nodeweekly.com/issues" },
  {
    name: "TypeScript Weekly",
    archiveUrl: "https://typescriptweekly.com/issues",
  },
  { name: "CSS Weekly", archiveUrl: "https://css-weekly.com/archives/" },
  // Sprint 4 Task 3 expansion — additional developer newsletters.
  // Each archive URL was verified to resolve and use the /issues/ or /archives/
  // link pattern that extractIssueUrls matches.
  { name: "Frontend Focus", archiveUrl: "https://frontendfoc.us/issues" },
  { name: "Ruby Weekly", archiveUrl: "https://rubyweekly.com/issues" },
  { name: "Go Weekly", archiveUrl: "https://golangweekly.com/issues" },
  { name: "Postgres Weekly", archiveUrl: "https://postgresweekly.com/issues" },
  { name: "iOS Dev Weekly", archiveUrl: "https://iosdevweekly.com/issues" },
  // Sprint 4 validation expansion — additional ecosystem newsletters to reach
  // the 10+ target from the handoff spec. Cooper Press newsletters share the
  // same /issues HTML structure; others use /archives or /issues patterns.
  { name: "Python Weekly", archiveUrl: "https://www.pythonweekly.com/archive" },
  { name: "PyCoder's Weekly", archiveUrl: "https://pycoders.com/issues" },
  { name: "DevOps Weekly", archiveUrl: "https://www.devopsweekly.com/archive" },
  { name: "Kubernetes Weekly", archiveUrl: "https://www.cncf.io/kubeweekly" },
  { name: "Android Weekly", archiveUrl: "https://androidweekly.net/issues" },
  { name: "TLDR Newsletter", archiveUrl: "https://tldr.tech/tech/archive" },
];

/** Default number of recent issues to crawl per newsletter. */
const DEFAULT_ISSUES_PER_NEWSLETTER = 10;

/** Domains to exclude (not company websites). */
const EXCLUDED_DOMAINS = [
  "twitter.com",
  "x.com",
  "linkedin.com",
  "facebook.com",
  "crunchbase.com",
  "github.com",
  "youtube.com",
  "instagram.com",
  "medium.com",
  "substack.com",
  "wikipedia.org",
  "reddit.com",
  "npmjs.com",
  "stackoverflow.com",
];

// ── Pure function: extract issue URLs from archive page ──────────────────────

/**
 * Extract issue URLs from a newsletter archive page.
 * Archive pages list issues as links (e.g. /issues/700).
 *
 * @param html        The archive page HTML
 * @param archiveUrl  The archive page URL (to resolve relative links)
 * @param maxIssues   Maximum number of issue URLs to extract
 * @returns           Array of absolute issue URLs
 */
export function extractIssueUrls(
  html: string,
  archiveUrl: string,
  maxIssues: number,
): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];

  // Determine the base URL for resolving relative links
  let baseUrl: string;
  try {
    const parsed = new URL(archiveUrl);
    baseUrl = `${parsed.protocol}//${parsed.host}`;
  } catch {
    baseUrl = "";
  }

  // Find links that look like issue pages (e.g. /issues/123)
  $("a").each((_, el) => {
    if (urls.length >= maxIssues) return;
    const href = $(el).attr("href") ?? "";
    if (!href) return;

    // Match /issues/{number} or /archives/{number} patterns
    if (
      href.match(/\/(issues|archives)\/\d+/) ||
      href.match(/\/(issues|archives)\/\w+/)
    ) {
      // Resolve relative URLs
      const fullUrl = href.startsWith("http") ? href : `${baseUrl}${href}`;
      if (!urls.includes(fullUrl)) {
        urls.push(fullUrl);
      }
    }
  });

  return urls.slice(0, maxIssues);
}

// ── Pure function: extract external links from issue page ────────────────────

/**
 * Extract external links from a newsletter issue page.
 * Filters out navigation, social media, and the newsletter's own domain.
 *
 * @param html        The issue page HTML
 * @param newsletter  The newsletter name (for provenance)
 * @param issueUrl    The issue URL (to exclude self-links)
 * @returns           Array of extracted links
 */
export function extractLinksFromIssue(
  html: string,
  newsletter: string,
  issueUrl?: string,
): NewsletterLink[] {
  const $ = cheerio.load(html);
  const links: NewsletterLink[] = [];
  const seen = new Set<string>();

  let newsletterDomain = "";
  if (issueUrl) {
    try {
      newsletterDomain = new URL(issueUrl).hostname.toLowerCase();
    } catch {
      // Invalid URL
    }
  }

  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();

    if (!href || !text) return;
    if (!href.startsWith("http://") && !href.startsWith("https://")) return;

    let hostname: string;
    try {
      hostname = new URL(href).hostname.toLowerCase();
    } catch {
      return;
    }

    // Exclude newsletter's own domain
    if (
      newsletterDomain &&
      (hostname === newsletterDomain ||
        hostname.endsWith(`.${newsletterDomain}`))
    ) {
      return;
    }

    // Exclude social media and known non-company domains
    for (const excluded of EXCLUDED_DOMAINS) {
      if (hostname === excluded || hostname.endsWith(`.${excluded}`)) {
        return;
      }
    }

    // Skip very short or very long text
    if (text.length < 2 || text.length > 200) return;

    // Deduplicate by URL
    if (seen.has(href)) return;
    seen.add(href);

    links.push({ url: href, text, newsletter });
  });

  return links;
}

// ── Pure function: classify links into direct ATS vs Slugger ─────────────────

export interface ClassifiedLink {
  /** Direct ATS slug extraction (no Slugger needed). */
  direct: SeedCompanyInput[];
  /** Links that need Slugger resolution. */
  slugger: { companyName: string; website: string; newsletter: string }[];
}

/**
 * Classify extracted links into:
 *   - Direct ATS URLs → extract slug immediately
 *   - Other URLs → pass to Slugger with link text as company name
 */
export function classifyLinks(links: NewsletterLink[]): ClassifiedLink {
  const direct: SeedCompanyInput[] = [];
  const slugger: {
    companyName: string;
    website: string;
    newsletter: string;
  }[] = [];
  const seenDirect = new Set<string>();

  for (const link of links) {
    const atsSource = inferAtsSourceFromUrl(link.url);
    if (atsSource) {
      const slug = extractSlugFromAtsUrl(link.url, atsSource);
      if (slug) {
        const key = `${atsSource}:${slug}`;
        if (seenDirect.has(key)) continue;
        seenDirect.add(key);
        direct.push({
          atsSlug: slug,
          atsSource,
          discoverySource: "newsletter_archive",
          discoveryContext: `newsletter:${link.newsletter}`,
        });
      }
    } else {
      // Use link text as company name — only if it looks like a company name
      // (not an article title, which is usually a sentence)
      const text = link.text.trim();
      // Skip if text looks like a sentence (contains certain patterns)
      if (text.includes(" — ") || text.includes(" | ") || text.length > 80) {
        continue;
      }
      slugger.push({
        companyName: text,
        website: link.url,
        newsletter: link.newsletter,
      });
    }
  }

  return { direct, slugger };
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the newsletter archive seeder. Crawls recent issues from each newsletter,
 * extracts external links, and uses a dual strategy:
 *   1. Direct ATS URLs → extract slugs and insert directly
 *   2. Other URLs → run through Slugger for ATS resolution
 *
 * @param fetchFn              Injectable fetch (defaults to global fetch)
 * @param sources              Newsletter sources (defaults to curated list)
 * @param issuesPerNewsletter  Number of recent issues to crawl per newsletter
 * @returns                    Result with counts and any errors
 */
export async function runNewsletterArchiveSeeder(
  fetchFn: FetchFn = fetch,
  sources: NewsletterSource[] = NEWSLETTER_SOURCES,
  issuesPerNewsletter: number = DEFAULT_ISSUES_PER_NEWSLETTER,
): Promise<NewsletterResult> {
  let issuesCrawled = 0;
  let totalLinksExtracted = 0;
  let directSlugInserts = 0;
  let sluggerResolved = 0;
  let sluggerUnresolved = 0;

  try {
    for (const source of sources) {
      // Step 1: Fetch the archive page
      let archiveResponse: Response;
      try {
        archiveResponse = await fetchFn(source.archiveUrl);
      } catch {
        continue; // Skip this newsletter on network error
      }
      if (!archiveResponse.ok) continue;

      const archiveHtml = await archiveResponse.text();

      // Step 2: Extract issue URLs
      const issueUrls = extractIssueUrls(
        archiveHtml,
        source.archiveUrl,
        issuesPerNewsletter,
      );

      // Step 3: Crawl each issue
      for (const issueUrl of issueUrls) {
        try {
          const issueResponse = await fetchFn(issueUrl);
          if (!issueResponse.ok) continue;

          const issueHtml = await issueResponse.text();
          issuesCrawled++;

          // Step 4: Extract external links
          const links = extractLinksFromIssue(issueHtml, source.name, issueUrl);
          totalLinksExtracted += links.length;

          // Step 5: Classify links
          const { direct, slugger } = classifyLinks(links);

          // Step 6: Insert direct ATS slugs
          if (direct.length > 0) {
            const insertResult = await insertDiscoveredCompanies(direct);
            directSlugInserts += insertResult.inserted;
          }

          // Step 7: Run Slugger for non-ATS links
          for (const item of slugger) {
            const result: SluggerResult = await resolveSlugger(
              {
                companyName: item.companyName,
                website: item.website,
                discoverySource: "newsletter_archive",
                discoveryContext: `newsletter:${item.newsletter}`,
              },
              {
                fetchFn,
                insertCompany: true,
              },
            );

            if (result.success) {
              sluggerResolved++;
            } else {
              sluggerUnresolved++;
            }
          }
        } catch {
          // Individual issue failure — continue to next issue
        }
      }
    }

    return {
      issuesCrawled,
      totalLinksExtracted,
      directSlugInserts,
      sluggerResolved,
      sluggerUnresolved,
    };
  } catch (error) {
    return {
      issuesCrawled,
      totalLinksExtracted,
      directSlugInserts,
      sluggerResolved,
      sluggerUnresolved,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
