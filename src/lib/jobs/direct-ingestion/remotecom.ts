// Remote.com Talent Board Direct Ingestion Adapter (Directive 13, B2)
// src/lib/jobs/direct-ingestion/remotecom.ts
//
// Fetches jobs from the Remote.com public talent board using Playwright
// browser automation. Remote.com uses a Next.js SPA with client-side rendering,
// so HTTP fetch returns an empty shell — a real browser is required.
//
// Surface: https://remote.com/jobs/all (paginated, 266 pages × 20 = ~5,320 jobs)
// Pagination: ?page=N
//
// Each job card contains:
//   - Job title (link text)
//   - Company name (text after title in card)
//   - Salary range (e.g. "3k - 6k EUR/month", "2 - 4 USD/year")
//   - Remote type ("Remote")
//   - Location/region (e.g. "Anywhere", "GMT-6 to GMT-4 only")
//   - Employment type (Full-time, Contract)
//   - Posted date (e.g. "8 days ago")
//
// The adapter uses scanTagsRegex for tech-specific tag extraction because
// Remote.com's cards have sparse structured tags — the tech stack is usually
// embedded in the job title (e.g. "Senior Frontend Developer (React.js)").
//
// Docker requirement: Playwright Chromium browser (same as Wellfound adapter).

import { scanTagsRegex } from "../job-normalizer";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  normalizeEmploymentType,
} from "./types";

/** Maximum pages to fetch (safety cap). 266 pages × 20 = ~5,320 jobs. */
const DEFAULT_MAX_PAGES = 15;

/** Base URL for the Remote.com talent board. */
const BASE_URL = "https://remote.com/jobs/all";

/**
 * Fetch and normalize jobs from the Remote.com talent board using Playwright.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param maxPages       Maximum pages to fetch (default 15, max 266)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchRemoteComJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<DirectFetchResult> {
  let browser = null;
  try {
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

    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const url = pageNum === 1 ? BASE_URL : `${BASE_URL}?page=${pageNum}`;

      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        // Wait for job links to render
        await page.waitForSelector('a[href*="/jobs/"]', { timeout: 10000 });
        // Small delay for client-side rendering to complete
        await page.waitForTimeout(500);
      } catch (e) {
        console.warn(
          `[remotecom] Failed to load page ${pageNum}: ${e instanceof Error ? e.message : String(e)}`,
        );
        break;
      }

      // Extract job data from the page
      const pageData = await page.evaluate(() => {
        const allLinks = document.querySelectorAll('a[href*="/jobs/"]');
        const jobLinks = Array.from(allLinks).filter((a) => {
          const href = a.getAttribute("href") || "";
          return href.match(/\/jobs\/[a-z0-9-]+-[a-z0-9]+\//);
        });

        const results: Array<{
          title: string;
          href: string;
          cardText: string;
        }> = [];

        jobLinks.forEach((link) => {
          const card =
            link.closest("div.sc-b000ac2-0") ||
            link.parentElement?.parentElement?.parentElement;
          const text = card?.textContent?.trim() || "";
          results.push({
            title: link.textContent?.trim() || "",
            href: link.getAttribute("href") || "",
            cardText: text.slice(0, 500),
          });
        });

        return results;
      });

      if (pageData.length === 0) {
        break;
      }

      // Process page data into DirectIngestionJob objects
      for (const job of pageData) {
        const parsed = parseCardText(job.cardText);
        // Extract company from href since the card text doesn't have a clean separator
        if (!parsed.company) {
          parsed.company = extractCompanyFromHref(job.href);
        }
        const title = job.title || parsed.title;

        // Extract tech tags from title using the canonical tag regex scanner
        const textTags = scanTagsRegex(title);
        const tags = [...new Set([...textTags])];

        // Build a minimal description from the structured fields
        const description = buildDescription(title, parsed);

        // Apply persona tech filter
        if (!techFilter({ tags, title, description })) {
          continue;
        }

        const directJob: DirectIngestionJob = {
          externalJobId: extractJobId(job.href),
          title,
          companyName: parsed.company,
          normalizedText: description,
          extractedTags: tags,
          applyUrl: job.href
            ? new URL(job.href, "https://remote.com").href
            : null,
          jobUrl: job.href
            ? new URL(job.href, "https://remote.com").href
            : null,
          locationName: parsed.location,
          workplaceType: "remote",
          employmentType: normalizeEmploymentType(
            parsed.employmentType ?? undefined,
          ),
          remoteScope: inferRemoteScope(parsed.location),
          locationCountries: null,
          compensationMin: parsed.salaryMin,
          compensationMax: parsed.salaryMax,
          compensationCurrency: parsed.salaryCurrency,
          experienceMinYears: null,
          experienceMaxYears: null,
          publishedAt: parsePostedDate(parsed.posted),
        };

        allJobs.push(directJob);

        if (allJobs.length >= maxJobs) {
          await browser.close();
          return {
            success: true,
            jobs: allJobs,
            totalAvailable: allJobs.length,
          };
        }
      }
    }

    await browser.close();
    return { success: true, jobs: allJobs, totalAvailable: allJobs.length };
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

interface ParsedCardText {
  title: string;
  company: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  location: string | null;
  employmentType: string | null;
  posted: string | null;
}

/**
 * Parse the raw cardText from a Remote.com job card into structured fields.
 *
 * Example cardText:
 *   "Senior Frontend Developer (React.js)Proxify4k - 8k EUR/monthRemoteAnywhereContract"
 *   "Spanish Medical InterpreterSynergy Injury Relief PLLC2 - 4 USD/yearQuick applyRemoteGMT-6 to GMT-4Full-time"
 *   "8 days agoremote - GMT-6 to GMT-4 onlySpanish Medical InterpreterSynergy Injury Relief PLLC2 - 4 USD/yearQuick applyRemoteGMT-6 to GMT-4Full-time"
 */
function parseCardText(raw: string): ParsedCardText {
  const text = raw.trim();

  // Extract salary: "3k - 6k EUR/month", "2 - 4 USD/year", "4k - 8k EUR/month"
  const salaryMatch = text.match(
    /(\d+)(k?)\s*[-–]\s*(\d+)(k?)\s*(USD|EUR|GBP|CAD|AUD)(?:\/(?:month|year|hour))?/,
  );
  let salaryMin: number | null = null;
  let salaryMax: number | null = null;
  let salaryCurrency: string | null = null;
  if (salaryMatch) {
    const minNum = parseInt(salaryMatch[1]);
    const maxNum = parseInt(salaryMatch[3]);
    const minK = salaryMatch[2] === "k";
    const maxK = salaryMatch[4] === "k";
    salaryMin = minK ? minNum * 1000 : minNum;
    salaryMax = maxK ? maxNum * 1000 : maxNum;
    salaryCurrency = salaryMatch[5];
  }

  // Extract employment type: "Full-time", "Contract", "Part-time"
  const empTypeMatch = text.match(/(Full-time|Contract|Part-time|Internship)/);
  const employmentType = empTypeMatch ? empTypeMatch[1] : null;

  // Extract posted date: "8 days ago", "1 day ago", "2 weeks ago"
  const postedMatch = text.match(
    /(\d+\s+(?:day|week|month)s?\s+ago|today|yesterday|just now)/,
  );
  const posted = postedMatch ? postedMatch[1] : null;

  // Extract location: "Anywhere", "GMT-6 to GMT-4", "GMT-6 to GMT-4 only"
  // The location appears after "Remote" in the card text
  const locationMatch = text.match(
    /Remote\s*(Anywhere|GMT[+-]\d+\s*to\s*GMT[+-]\d+(?:\s+only)?|Worldwide|United States|Europe|[A-Z][a-z]+(?:\s[A-Z][a-z]+)*)/,
  );
  const location = locationMatch ? locationMatch[1] : null;

  // Extract company name: appears after the job title in the card text
  // This is tricky because the title and company are concatenated.
  // We use the salary/location as anchors to find the company.
  // Strategy: find the text between the title and the salary/location.
  // But since we don't have the title here (it's passed separately),
  // we try to extract company by looking for known patterns.
  // The company is typically a proper noun after the job title.
  // For now, we extract it from the href which contains the company slug.
  const company = null; // Will be extracted from href in the caller

  return {
    title: "",
    company,
    salaryMin,
    salaryMax,
    salaryCurrency,
    location,
    employmentType,
    posted,
  };
}

/**
 * Extract company name from the job href.
 * Pattern: /jobs/{company-slug}-{companyId}/{job-slug}-{jobId}
 * Example: /jobs/proxify-c114ohln/senior-frontend-developer-react-js-j124ckja
 * → company = "Proxify" (from slug "proxify")
 */
function extractCompanyFromHref(href: string): string | null {
  const match = href.match(/\/jobs\/([a-z0-9-]+)-[a-z0-9]+\//);
  if (!match) return null;
  const slug = match[1];
  // Convert slug to proper case: "proxify" → "Proxify", "synergy-injury-relief-pllc" → "Synergy Injury Relief PLLC"
  return slug
    .split("-")
    .map((word) => {
      // Keep acronyms uppercase (PLLC, LLC, Inc, etc.)
      const upper = word.toUpperCase();
      if (
        [
          "pllc",
          "llc",
          "inc",
          "ltd",
          "co",
          "corp",
          "gmbh",
          "sa",
          "ag",
        ].includes(word)
      ) {
        return upper;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Infer remote scope from the location string.
 * "Anywhere" / "Worldwide" → global
 * "GMT-X to GMT-Y" → global (timezone-based, not country-fenced)
 * Specific country/region → country_fenced / region_fenced
 */
function inferRemoteScope(
  location: string | null,
): "global" | "country_fenced" | "region_fenced" | "unknown" {
  if (!location) return "unknown";

  const locLower = location.toLowerCase();

  // Global indicators
  if (
    locLower.includes("anywhere") ||
    locLower.includes("worldwide") ||
    locLower.includes("global")
  ) {
    return "global";
  }

  // GMT timezone ranges are global (not country-fenced)
  if (locLower.match(/gmt[+-]\d+/)) {
    return "global";
  }

  // Country-fenced indicators
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

  // Region indicators
  if (
    locLower.includes("emea") ||
    locLower.includes("apac") ||
    locLower.includes("latam") ||
    locLower.includes("europe") ||
    locLower.includes("asia") ||
    locLower.includes("africa")
  ) {
    return "region_fenced";
  }

  return "unknown";
}

/**
 * Build a normalized text description from the structured Remote.com fields.
 */
function buildDescription(title: string, parsed: ParsedCardText): string {
  const parts: string[] = [];
  parts.push(title);
  if (parsed.company) parts.push(`Company: ${parsed.company}`);
  if (parsed.employmentType) parts.push(`Type: ${parsed.employmentType}`);
  if (parsed.salaryMin && parsed.salaryMax && parsed.salaryCurrency) {
    parts.push(
      `Salary: ${parsed.salaryMin} - ${parsed.salaryMax} ${parsed.salaryCurrency}`,
    );
  }
  if (parsed.location) parts.push(`Location: ${parsed.location}`);
  parts.push("Remote");
  if (parsed.posted) parts.push(`Posted: ${parsed.posted}`);
  return parts.join("\n");
}

/** Extract the job ID from a Remote.com job href. */
function extractJobId(href: string): string {
  if (!href) return "";
  // Pattern: /jobs/{company-slug}/{job-slug}
  // Use the job-slug as the ID
  const match = href.match(/\/jobs\/[^/]+\/(.+)$/);
  return match ? match[1] : href;
}

/**
 * Parse a relative posted date string into a Date.
 */
function parsePostedDate(posted: string | null): Date | null {
  if (!posted) return null;
  const now = new Date();

  if (posted === "today" || posted === "just now") return now;
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

// Override parseCardText to also extract company from href
// We need to re-process after extracting from href
export function parseRemoteComCard(
  cardText: string,
  href: string,
): ParsedCardText {
  const parsed = parseCardText(cardText);
  if (!parsed.company) {
    parsed.company = extractCompanyFromHref(href);
  }
  return parsed;
}
