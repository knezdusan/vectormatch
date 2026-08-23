// LaraJobs Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/larajobs.ts
//
// Fetches jobs from the LaraJobs RSS feed (https://larajobs.com/feed) and
// scrapes the main page for structured job card data (company, location,
// tags, employment type, salary). LaraJobs is the PHP/Laravel persona's
// only dedicated channel — ~9 active jobs at any time.
//
// D14 JOB 5.3: Deferral overruled (5th deferral, <1 hour, PHP persona's
// only channel). Ships daily poll + employer harvest.
//
// Flow:
//   1. Fetch the main page HTML (https://larajobs.com)
//   2. Parse job cards from the HTML (company, title, location, tags, etc.)
//   3. For each job, fetch the individual job page for the full description
//   4. Map to DirectIngestionJob with scanTagsRegex for tech-specific tags
//   5. Infer remote scope from the location string
//
// No anti-bot protection — plain HTTP fetch works (no Playwright needed).

import { scanTagsRegex } from "@/lib/jobs/job-normalizer";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  normalizeEmploymentType,
  safeParseDate,
  stripHtmlToText,
} from "./types";

/** LaraJobs job card parsed from the main page HTML. */
interface LaraJobCard {
  jobId: string;
  title: string;
  companyName: string;
  location: string;
  employmentType: string;
  salary: string;
  tags: string[];
  jobUrl: string;
  publishedAt: string | null;
}

/** Fetch HTML with timeout (reusable helper). */
async function fetchHtmlWithTimeout(
  url: string,
  fetchFn: typeof fetch,
): Promise<
  { success: true; html: string } | { success: false; error: string }
> {
  try {
    const response = await fetchFn(url, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      return {
        success: false,
        error: `LaraJobs HTTP ${response.status} ${response.statusText}`,
      };
    }
    const html = await response.text();
    return { success: true, html };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Parse job cards from the LaraJobs main page HTML.
 *
 * The HTML structure (from larajobs.com) has job cards with:
 *   - Company name (in the card header)
 *   - Job title (link text)
 *   - Location + employment type + salary (in a metadata line)
 *   - Tags (as filter links)
 *   - Job URL (/job/{id})
 */
function parseJobCards(html: string): LaraJobCard[] {
  const cards: LaraJobCard[] = [];

  // Job links are /job/{id} — extract all unique job IDs
  const jobLinkPattern = /href="\/job\/(\d+)"/g;
  const seenIds = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = jobLinkPattern.exec(html)) !== null) {
    const jobId = match[1];
    if (seenIds.has(jobId)) continue;
    seenIds.add(jobId);
    const jobUrl = `https://larajobs.com/job/${jobId}`;

    // Find the surrounding context (the job card block)
    // Look for the job title in the link text
    const titlePattern = new RegExp(
      `href="/job/${jobId}"[^>]*>\\s*([^<]+)\\s*<`,
    );
    const titleMatch = titlePattern.exec(html);
    const title = titleMatch ? titleMatch[1].trim() : "";

    // Find the block around this job link to extract metadata
    // The card is typically between the job link and the next job link
    const cardStart = match.index;
    const nextJobMatch = /href="\/job\/\d+"/g;
    nextJobMatch.lastIndex = cardStart + 1;
    const nextMatch = nextJobMatch.exec(html);
    const cardEnd = nextMatch
      ? nextMatch.index
      : Math.min(cardStart + 3000, html.length);
    const cardHtml = html.slice(cardStart, cardEnd);

    // Extract company name — appears before the job title in the card
    // Pattern: "CompanyName\n\nJobTitle" or in a separate element
    const companyPattern =
      /(?:alt="([^"]+)"|>([A-Z][^<]{2,40})<\/a>\s*<[^>]*>\s*<a[^>]*>)/;
    const companyMatch = companyPattern.exec(cardHtml);
    let companyName = "";
    if (companyMatch) {
      companyName = (companyMatch[1] || companyMatch[2] || "").trim();
      // Filter out generic terms
      if (
        /^(Full Time|Contractor|Remote|Part Time|Internship)$/i.test(
          companyName,
        )
      ) {
        companyName = "";
      }
    }

    // Extract location, employment type, salary from the card text
    // The card text between the job link and the next job link contains
    // metadata lines like "Full Time", "Remote / Europe", "£60k-£70k", "5d"
    const cardText = stripHtmlToText(cardHtml);
    const lines = cardText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    let location = "";
    let employmentType = "";
    let salary = "";

    for (const line of lines) {
      // Employment type
      if (
        /^(Full Time|Contractor|Part Time|Internship)$/i.test(line) &&
        !employmentType
      ) {
        // Check if it has a salary suffix (e.g., "Full Time - £60k-£70k")
        const etMatch = line.match(
          /^(Full Time|Contractor|Part Time|Internship)/i,
        );
        if (etMatch) employmentType = etMatch[1];
        const salaryPart = line.replace(
          /^(Full Time|Contractor|Part Time|Internship)\s*[-:]?\s*/i,
          "",
        );
        if (
          salaryPart &&
          (salaryPart.includes("$") ||
            salaryPart.includes("£") ||
            salaryPart.includes("€") ||
            /\d/.test(salaryPart))
        ) {
          salary = salaryPart;
        }
        continue;
      }

      // Time ago (e.g., "2d", "5d", "1w", "2w")
      if (/^\d+[dw]$/i.test(line)) continue;

      // Salary (contains currency symbol)
      if (
        (line.includes("$") || line.includes("£") || line.includes("€")) &&
        !salary
      ) {
        salary = line;
        continue;
      }

      // Location (contains "remote" or a place name)
      if (
        !location &&
        (line.toLowerCase().includes("remote") ||
          /\b(USA|UK|Europe|Canada|Germany|France|Spain|Italy|Poland|India|Pakistan|Philippines|Australia|Netherlands|Sweden|Norway|Denmark|Finland|Brazil|Argentina|Mexico|Colombia|South Africa|Nigeria|Kenya|Egypt|Morocco|Israel|Turkey|Japan|South Korea|Singapore|Hong Kong|New Zealand)\b/i.test(
            line,
          ) ||
          /,\s*[A-Z]{2}$/.test(line) ||
          /,\s*[A-Z][a-z]+$/.test(line))
      ) {
        location = line;
      }
    }

    // Extract tags — LaraJobs uses filter links like /fullstack-jobs, /php-jobs, etc.
    const tagPattern = /href="\/([a-z]+)-jobs"/gi;
    const tags: string[] = [];
    let tagMatch: RegExpExecArray | null;
    const tagSource = cardHtml;
    while ((tagMatch = tagPattern.exec(tagSource)) !== null) {
      const tag = tagMatch[1];
      if (!tags.includes(tag)) tags.push(tag);
    }

    // Also look for tags in the card text (e.g., "MySQL", "PHP", "React")
    const inlineTagPattern =
      /\b(MySQL|PHP|React|Redis|Laravel|VueJS|AlpineJS|TailwindCSS|Postgres|WordPress|API|Fullstack|AWS|JavaScript|Senior|Junior|Full Time|QA|Analyst|Customer Success)\b/g;
    while ((tagMatch = inlineTagPattern.exec(cardHtml)) !== null) {
      const tag = tagMatch[1].toLowerCase();
      if (!tags.includes(tag)) tags.push(tag);
    }

    cards.push({
      jobId,
      title,
      companyName,
      location,
      employmentType,
      salary,
      tags: tags.map((t) => t.toLowerCase()),
      jobUrl,
      publishedAt: null, // Will be fetched from the job page
    });
  }

  return cards;
}

/**
 * Fetch the full job description from an individual LaraJobs job page.
 */
async function fetchJobDescription(
  jobUrl: string,
  fetchFn: typeof fetch,
): Promise<{ description: string; publishedAt: string | null }> {
  const result = await fetchHtmlWithTimeout(jobUrl, fetchFn);
  if (!result.success) {
    return { description: "", publishedAt: null };
  }

  const html = result.html;
  const text = stripHtmlToText(html);

  // Try to extract the publish date from the page
  // Pattern: "12 Aug, 2026" or similar date strings
  const datePattern = /(\d{1,2}\s+\w{3},?\s+202\d)/i;
  const dateMatch = datePattern.exec(html);
  const publishedAt = dateMatch ? dateMatch[1] : null;

  // The description is the main content of the page — strip navigation, footer, etc.
  // Take a reasonable chunk (first 3000 chars of cleaned text)
  const description = text.slice(0, 3000).trim();

  return { description, publishedAt };
}

/**
 * Infer remote scope from the LaraJobs location string.
 * "Remote" or "Remote (Worldwide)" → global
 * "Remote / USA" or "Remote / Europe" → region/country fenced
 * Specific city → onsite or country_fenced
 */
function inferRemoteScope(
  location: string,
): "global" | "country_fenced" | "region_fenced" | "onsite" {
  if (!location) return "global"; // Default: LaraJobs is remote-first
  const lower = location.toLowerCase();

  // No location restriction
  if (
    lower === "remote" ||
    lower.includes("worldwide") ||
    lower.includes("anywhere") ||
    lower.includes("global")
  ) {
    return "global";
  }

  // Region fencing
  if (lower.includes("europe") || lower.includes("emea")) {
    return "region_fenced";
  }

  // Country fencing
  if (
    lower.includes("usa") ||
    lower.includes("united states") ||
    lower.includes("canada") ||
    lower.includes("uk") ||
    lower.includes("united kingdom") ||
    lower.includes("australia") ||
    lower.includes("germany") ||
    lower.includes("france") ||
    lower.includes("spain") ||
    lower.includes("italy") ||
    lower.includes("poland") ||
    lower.includes("india") ||
    lower.includes("pakistan") ||
    lower.includes("philippines")
  ) {
    return "country_fenced";
  }

  // Specific city (e.g., "Lakeland, FL", "Manchester, UK")
  if (/,\s*[A-Z]{2}$/.test(location) || /,\s*[A-Z][a-z]+$/.test(location)) {
    // If it says "Remote/Hybrid, City" → country_fenced (hybrid means physical presence)
    if (lower.includes("hybrid")) return "country_fenced";
    // Pure onsite
    return "onsite";
  }

  // Default for remote-first board
  return "global";
}

/**
 * Parse salary string from LaraJobs metadata.
 * Examples: "£60k-£70k", "$125,000", "100,000-125,000", "CAD 100,000 - 120,000"
 */
function parseSalary(salaryStr: string): {
  min: number | null;
  max: number | null;
  currency: string | null;
} {
  if (!salaryStr) return { min: null, max: null, currency: null };

  const currencyMatch = salaryStr.match(/([$£€]|CAD|USD|EUR|GBP)/i);
  const rawCurrency = currencyMatch ? currencyMatch[1] : null;
  // Map currency symbols to ISO 4217 codes — toUpperCase() doesn't
  // convert symbols (£ stays £), which would crash Intl.NumberFormat.
  const currency = rawCurrency
    ? rawCurrency === "$"
      ? "USD"
      : rawCurrency === "£"
        ? "GBP"
        : rawCurrency === "€"
          ? "EUR"
          : rawCurrency.toUpperCase()
    : null;

  // Extract numbers (handle k suffix and comma separators)
  const numbers: number[] = [];
  const numPattern = /(\d[\d,]*\.?\d*)\s*k?/gi;
  let match: RegExpExecArray | null;
  while ((match = numPattern.exec(salaryStr)) !== null) {
    let num = Number.parseFloat(match[1].replace(/,/g, ""));
    if (
      salaryStr
        .slice(match.index, match.index + match[0].length)
        .toLowerCase()
        .includes("k")
    ) {
      num *= 1000;
    }
    if (!Number.isNaN(num)) numbers.push(num);
  }

  if (numbers.length === 0) return { min: null, max: null, currency };
  if (numbers.length === 1) return { min: null, max: numbers[0], currency };
  return { min: numbers[0], max: numbers[1], currency };
}

/**
 * Fetch and normalize jobs from LaraJobs.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchLaraJobsJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    // Step 1: Fetch the main page HTML
    const pageResult = await fetchHtmlWithTimeout(
      "https://larajobs.com",
      fetchFn,
    );
    if (!pageResult.success) {
      return {
        success: false,
        error: pageResult.error,
        totalAvailable: 0,
      };
    }

    // Step 2: Parse job cards
    const cards = parseJobCards(pageResult.html);
    const totalAvailable = cards.length;

    if (cards.length === 0) {
      return { success: true, jobs: [], totalAvailable: 0 };
    }

    // Step 3: Fetch descriptions and build DirectIngestionJob objects
    const filteredJobs: DirectIngestionJob[] = [];

    for (const card of cards) {
      // Fetch the full job description
      const { description, publishedAt } = await fetchJobDescription(
        card.jobUrl,
        fetchFn,
      );

      // Merge card tags with scanTagsRegex results from title + description
      const regexTags = scanTagsRegex(`${card.title} ${description}`);
      const allTags = [...new Set([...card.tags, ...regexTags])];

      // Apply persona tech filter
      if (!techFilter({ tags: allTags, title: card.title, description })) {
        continue;
      }

      const { min, max, currency } = parseSalary(card.salary);

      const job: DirectIngestionJob = {
        externalJobId: card.jobId,
        title: card.title,
        companyName: card.companyName || null,
        normalizedText: description || card.title,
        extractedTags: allTags,
        applyUrl: card.jobUrl,
        jobUrl: card.jobUrl,
        locationName: card.location || null,
        workplaceType: card.location.toLowerCase().includes("remote")
          ? "remote"
          : null,
        employmentType: normalizeEmploymentType(card.employmentType),
        remoteScope: inferRemoteScope(card.location),
        compensationMin: min,
        compensationMax: max,
        compensationCurrency: currency,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: publishedAt ? safeParseDate(publishedAt) : null,
      };

      filteredJobs.push(job);

      if (filteredJobs.length >= maxJobs) {
        break;
      }
    }

    return { success: true, jobs: filteredJobs, totalAvailable };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      totalAvailable: 0,
    };
  }
}

/**
 * Extract employer data from LaraJobs for the Slugger (ATS slug census).
 * Returns company names and job URLs for companies hiring on LaraJobs.
 */
export async function harvestLaraJobsEmployers(
  fetchFn: typeof fetch = fetch,
): Promise<{ name: string; jobUrl: string }[]> {
  const pageResult = await fetchHtmlWithTimeout(
    "https://larajobs.com",
    fetchFn,
  );
  if (!pageResult.success) return [];

  const cards = parseJobCards(pageResult.html);
  return cards
    .filter((c) => c.companyName)
    .map((c) => ({ name: c.companyName, jobUrl: c.jobUrl }));
}
