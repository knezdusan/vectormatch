// Wellfound Direct Ingestion Adapter (Directive 13, B1)
// src/lib/jobs/direct-ingestion/wellfound.ts
//
// Fetches jobs from Wellfound (formerly AngelList Talent) using Playwright
// browser automation. Wellfound uses Cloudflare captcha protection, so HTTP
// fetch is not possible — a real browser is required.
//
// Surface: /role/r/software-engineer (remote + software-engineer filtered slice)
// Pagination: ?page=N (47 pages, ~1,889 results as of July 2026)
//
// Each company card contains:
//   - Company name, href (/company/slug), description, size
//   - One or more job listings with title, href, salary, equity, location, remote type
//
// The adapter is dual-function:
//   1. Ingests jobs as DirectIngestionJob objects
//   2. Harvests employer names + hrefs for the Slugger (ATS slug census)
//
// Docker requirement: Playwright Chromium browser must be installed.
// The Dockerfile must include:
//   RUN npx playwright install --with-deps chromium
// See Dockerfile changes in the Directive 13 report.

import { scanTagsRegex } from "../job-normalizer";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  normalizeEmploymentType,
  safeParseDate,
} from "./types";

/** Employer harvested from Wellfound for the Slugger. */
export interface WellfoundEmployer {
  companyName: string;
  companyHref: string;
  description: string | null;
  size: string | null;
}

/** Result of fetching jobs from Wellfound. */
export type WellfoundFetchResult =
  | {
      success: true;
      jobs: DirectIngestionJob[];
      totalAvailable: number;
      employers?: WellfoundEmployer[];
    }
  | { success: false; error: string; totalAvailable: number };

/** Maximum pages to fetch (safety cap). 47 pages × ~40 = ~1,889 jobs. */
const DEFAULT_MAX_PAGES = 10;

/** Base URL for the remote software-engineer slice. */
const BASE_URL = "https://wellfound.com/role/r/software-engineer";

/**
 * Fetch and normalize jobs from Wellfound using Playwright browser automation.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param maxPages       Maximum pages to fetch (default 10, max 47)
 * @returns              WellfoundFetchResult with filtered DirectIngestionJob[]
 *                       and harvested employers
 */
export async function fetchWellfoundJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<WellfoundFetchResult> {
  let browser = null;
  try {
    // Lazy import — Playwright is only available in environments with browser binaries
    const { chromium } = await import("playwright");

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    const allJobs: DirectIngestionJob[] = [];
    const employerMap = new Map<string, WellfoundEmployer>();

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        // Wait for job cards to render
        await page.waitForSelector('[data-testid="startup-header"]', {
          timeout: 10000,
        });
      } catch (e) {
        // If we can't load a page, stop paginating
        console.warn(
          `[wellfound] Failed to load page ${pageNum}: ${e instanceof Error ? e.message : String(e)}`,
        );
        break;
      }

      // Extract job data from the page
      const pageData = await page.evaluate(() => {
        const cards = document.querySelectorAll(
          '[data-testid="startup-header"]',
        );
        const results: Array<{
          company: string | null;
          companyHref: string | null;
          description: string | null;
          size: string | null;
          jobs: Array<{
            title: string;
            href: string;
            jobText: string;
          }>;
        }> = [];

        cards.forEach((card) => {
          const companyLink = card.querySelector('a[href*="/company/"]');
          const companyName = card.querySelector("h2")?.textContent?.trim();
          const companyHref = companyLink?.getAttribute("href");
          const desc = card
            .querySelector("span.text-xs.text-neutral-1000")
            ?.textContent?.trim();
          const size = card
            .querySelector("span.text-xs.italic")
            ?.textContent?.trim();

          const cardParent = card.closest("div.rounded.border");
          if (!cardParent) return;

          const jobLinks = cardParent.querySelectorAll('a[href*="/jobs/"]');
          const jobs: Array<{
            title: string;
            href: string;
            jobText: string;
          }> = [];

          jobLinks.forEach((jl) => {
            const jobDiv = jl.closest("div.w-full.pb-1") || jl.parentElement;
            const jobText = jobDiv?.textContent?.trim() || "";
            jobs.push({
              title: jl.textContent?.trim() || "",
              href: jl.getAttribute("href") || "",
              jobText,
            });
          });

          results.push({
            company: companyName || null,
            companyHref: companyHref || null,
            description: desc || null,
            size: size || null,
            jobs,
          });
        });

        return results;
      });

      if (pageData.length === 0) {
        // No more jobs — stop paginating
        break;
      }

      // Process page data into DirectIngestionJob objects
      for (const card of pageData) {
        // Harvest employer for Slugger
        if (card.company && card.companyHref) {
          if (!employerMap.has(card.company)) {
            employerMap.set(card.company, {
              companyName: card.company,
              companyHref: card.companyHref,
              description: card.description,
              size: card.size,
            });
          }
        }

        for (const job of card.jobs) {
          const parsed = parseJobText(job.jobText);
          const title = job.title || parsed.title;

          // Extract tech tags from title using the canonical tag regex scanner
          const textTags = scanTagsRegex(title);
          const tags = [...new Set([...textTags])];

          // Build a minimal description from the structured fields
          const description = buildDescription(card, job, parsed);

          // Apply persona tech filter
          if (!techFilter({ tags, title, description })) {
            continue;
          }

          const directJob: DirectIngestionJob = {
            externalJobId: extractJobId(job.href),
            title,
            companyName: card.company,
            normalizedText: description,
            extractedTags: tags,
            applyUrl: job.href ? `https://wellfound.com${job.href}` : null,
            jobUrl: job.href ? `https://wellfound.com${job.href}` : null,
            locationName: parsed.location,
            workplaceType: parsed.workplaceType,
            employmentType: normalizeEmploymentType(
              parsed.employmentType ?? undefined,
            ),
            remoteScope: inferRemoteScope(parsed.location, parsed.remoteType),
            locationCountries: null,
            compensationMin: parsed.salaryMin,
            compensationMax: parsed.salaryMax,
            compensationCurrency: parsed.salaryMin !== null ? "USD" : null,
            experienceMinYears: parsed.expMinYears,
            experienceMaxYears: parsed.expMaxYears,
            publishedAt: parsePostedDate(parsed.posted),
          };

          allJobs.push(directJob);

          if (allJobs.length >= maxJobs) {
            await browser.close();
            return {
              success: true,
              jobs: allJobs,
              totalAvailable: allJobs.length,
              employers: [...employerMap.values()],
            };
          }
        }
      }
    }

    await browser.close();
    return {
      success: true,
      jobs: allJobs,
      totalAvailable: allJobs.length,
      employers: [...employerMap.values()],
    };
  } catch (e) {
    if (browser) await browser.close().catch(() => {});
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      totalAvailable: 0,
    };
  }
}

// ── Parsing helpers ──────────────────────────────────────────────────────────

interface ParsedJobText {
  title: string;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  equity: string | null;
  remoteType: string | null;
  location: string | null;
  workplaceType: "remote" | "hybrid" | "on-site" | null;
  expMinYears: number | null;
  expMaxYears: number | null;
  posted: string | null;
}

/**
 * Parse the raw jobText from a Wellfound job card into structured fields.
 *
 * Example jobText:
 *   "Software EngineerFull-time$80k – $110k • 2.0% – 10.0%Onsite or remote • Dallas+21 year of exp2 weeks ago"
 *   "Software EngineerFull-timeOnsite or remote • Remote (Everywhere)6 days ago"
 */
function parseJobText(raw: string): ParsedJobText {
  const text = raw.trim();

  // Extract salary: "$80k – $110k" or "$100k – $120k"
  const salaryMatch = text.match(/\$(\d+)k\s*[–-]\s*\$(\d+)k/);
  const salaryMin = salaryMatch ? parseInt(salaryMatch[1]) * 1000 : null;
  const salaryMax = salaryMatch ? parseInt(salaryMatch[2]) * 1000 : null;

  // Extract equity: "2.0% – 10.0%" or "No equity"
  const equityMatch = text.match(/(\d+\.?\d*%\s*[–-]\s*\d+\.?\d*%|No equity)/);
  const equity = equityMatch ? equityMatch[1] : null;

  // Extract employment type: "Full-time", "Part-time", "Contract"
  const empTypeMatch = text.match(/(Full-time|Part-time|Contract|Internship)/);
  const employmentType = empTypeMatch ? empTypeMatch[1] : null;

  // Extract remote type and location:
  // "Onsite or remote • Dallas" or "Remote only • United States" or "Remote (Everywhere)"
  const remoteLocationMatch = text.match(
    /(Onsite or remote|Remote only|Remote)\s*[•·]?\s*(.+?)(?=\d+\s|year|$)/,
  );
  let remoteType: string | null = null;
  let location: string | null = null;
  let workplaceType: "remote" | "hybrid" | "on-site" | null = null;
  if (remoteLocationMatch) {
    remoteType = remoteLocationMatch[1];
    location = remoteLocationMatch[2]?.trim() || null;
    if (remoteType === "Remote only") workplaceType = "remote";
    else if (remoteType === "Onsite or remote") workplaceType = "hybrid";
    else workplaceType = "remote";
  } else {
    // Try "Remote (Everywhere)" pattern
    const everywhereMatch = text.match(
      /Remote\s*\((Everywhere|Worldwide|Anywhere)\)/i,
    );
    if (everywhereMatch) {
      remoteType = "Remote";
      location = `Remote (${everywhereMatch[1]})`;
      workplaceType = "remote";
    }
  }

  // Extract experience: "1 year of exp" or "4 years of exp"
  const expMatch = text.match(/(\d+)\s+years?\s+of\s+exp/);
  const expYears = expMatch ? parseInt(expMatch[1]) : null;

  // Extract posted date: "2 weeks ago", "6 days ago", "1 day ago"
  const postedMatch = text.match(
    /(\d+\s+(?:day|week|month)s?\s+ago|today|yesterday)/,
  );
  const posted = postedMatch ? postedMatch[1] : null;

  return {
    title: "",
    employmentType,
    salaryMin,
    salaryMax,
    equity,
    remoteType,
    location,
    workplaceType,
    expMinYears: expYears,
    expMaxYears: expYears,
    posted,
  };
}

/**
 * Infer remote scope from the location and remote type strings.
 * "Remote (Everywhere)" / "Remote (Worldwide)" / "Remote (Anywhere)" → global
 * "Remote only • United States" → country_fenced
 * "Onsite or remote • Dallas" → country_fenced (specific city implies US)
 */
function inferRemoteScope(
  location: string | null,
  remoteType: string | null,
): "global" | "country_fenced" | "region_fenced" | "unknown" {
  if (!location && !remoteType) return "unknown";

  const locLower = (location ?? "").toLowerCase();

  // Global indicators
  if (
    locLower.includes("everywhere") ||
    locLower.includes("worldwide") ||
    locLower.includes("anywhere") ||
    locLower.includes("global")
  ) {
    return "global";
  }

  // Country-fenced indicators (specific country/city names)
  const countryPatterns = [
    "united states",
    "usa",
    "canada",
    "germany",
    "france",
    "spain",
    "italy",
    "portugal",
    "netherlands",
    "poland",
    "uk",
    "united kingdom",
    "ireland",
    "sweden",
    "norway",
    "denmark",
    "finland",
    "belgium",
    "switzerland",
    "austria",
    "india",
    "pakistan",
    "philippines",
    "australia",
    "japan",
    "south korea",
    "singapore",
    "hong kong",
    "new zealand",
    "brazil",
    "argentina",
    "colombia",
    "mexico",
  ];
  for (const country of countryPatterns) {
    if (locLower.includes(country)) return "country_fenced";
  }

  // US city names (common ones — implies US-fenced)
  const usCities = [
    "dallas",
    "atlanta",
    "austin",
    "boston",
    "chicago",
    "denver",
    "houston",
    "los angeles",
    "miami",
    "nashville",
    "new york",
    "phoenix",
    "portland",
    "san diego",
    "san francisco",
    "seattle",
    "washington",
    "boulder",
    "charlotte",
    "columbus",
    "detroit",
    "minneapolis",
    "orlando",
    "philadelphia",
    "phoenix",
    "raleigh",
    "salt lake",
    "san antonio",
    "tampa",
  ];
  for (const city of usCities) {
    if (locLower.includes(city)) return "country_fenced";
  }

  // Region indicators
  if (
    locLower.includes("emea") ||
    locLower.includes("apac") ||
    locLower.includes("latam") ||
    locLower.includes("europa") ||
    locLower.includes("europe") ||
    locLower.includes("asia") ||
    locLower.includes("africa")
  ) {
    return "region_fenced";
  }

  // Default: if it says "Remote only" without a location, assume global
  if (remoteType === "Remote only" && !location) return "global";

  return "unknown";
}

/**
 * Build a normalized text description from the structured Wellfound fields.
 * This is used for embedding generation and tag extraction.
 */
function buildDescription(
  card: {
    company: string | null;
    description: string | null;
    size: string | null;
  },
  job: { title: string; href: string; jobText: string },
  parsed: ParsedJobText,
): string {
  const parts: string[] = [];
  parts.push(job.title);
  if (card.company) parts.push(`Company: ${card.company}`);
  if (card.description) parts.push(card.description);
  if (parsed.employmentType) parts.push(`Type: ${parsed.employmentType}`);
  if (parsed.salaryMin && parsed.salaryMax) {
    parts.push(
      `Salary: $${parsed.salaryMin / 1000}k – $${parsed.salaryMax / 1000}k`,
    );
  }
  if (parsed.equity) parts.push(`Equity: ${parsed.equity}`);
  if (parsed.remoteType) parts.push(`Remote: ${parsed.remoteType}`);
  if (parsed.location) parts.push(`Location: ${parsed.location}`);
  if (parsed.expMinYears)
    parts.push(`Experience: ${parsed.expMinYears}+ years`);
  if (parsed.posted) parts.push(`Posted: ${parsed.posted}`);
  return parts.join("\n");
}

/** Extract the job ID from a Wellfound job href. */
function extractJobId(href: string): string {
  if (!href) return "";
  const segments = href.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || href;
}

/**
 * Parse a relative posted date string ("2 weeks ago") into a Date.
 */
function parsePostedDate(posted: string | null): Date | null {
  if (!posted) return null;
  const now = new Date();

  if (posted === "today") return now;
  if (posted === "yesterday") {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return d;
  }

  const match = posted.match(/(\d+)\s+(day|week|month)s?\s+ago/);
  if (!match) return null;

  const num = parseInt(match[1]);
  const unit = match[2];
  const d = new Date(now);

  if (unit === "day") d.setDate(d.getDate() - num);
  else if (unit === "week") d.setDate(d.getDate() - num * 7);
  else if (unit === "month") d.setMonth(d.getMonth() - num);

  return d;
}

// Re-export safeParseDate for consistency with other adapters
export { safeParseDate };
