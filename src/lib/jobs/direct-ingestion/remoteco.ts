// Remote.co Direct Ingestion Adapter (D26)
// src/lib/jobs/direct-ingestion/remoteco.ts
//
// Fetches jobs from Remote.co's job listing page and transforms them into
// DirectIngestionJob objects. Remote.co is a remote-first job board.
//
// Remote.co doesn't have a public JSON API, but exposes job listings via
// HTML pages. We scrape the listing page for job cards with remote/global
// positions. The board is remote-first by construction.
//
// D26: Part of the strategic inversion — discover global jobs directly from
// remote-native boards.

import { scanTagsRegex } from "../job-normalizer";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  normalizeEmploymentType,
  safeParseDate,
  stripHtmlToText,
} from "./types";

/**
 * Fetch and normalize jobs from Remote.co.
 * Uses HTML scraping of the remote jobs listing page.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchRemoteCoJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    // Remote.co's job listing page — fetch the main remote jobs page
    const response = await fetchFn("https://remote.co/remote-jobs/", {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Remote.co HTTP ${response.status} ${response.statusText}`,
        totalAvailable: 0,
      };
    }

    const html = await response.text();
    const items = extractJobCards(html);
    const totalAvailable = items.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const item of items) {
      const description = stripHtmlToText(item.description);
      const textTags = scanTagsRegex(`${item.title} ${description}`);
      const tags = [...new Set([...textTags])];

      if (!techFilter({ tags, title: item.title, description })) {
        continue;
      }

      const job: DirectIngestionJob = {
        externalJobId: item.jobId,
        title: item.title,
        companyName: item.companyName,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: item.link || null,
        jobUrl: item.link || null,
        locationName: item.location,
        workplaceType: "remote", // Remote.co is remote-first
        employmentType: normalizeEmploymentType(item.type ?? undefined),
        // Remote.co is remote-first; infer scope from location
        remoteScope: inferRemoteScope(item.location),
        compensationMin: null,
        compensationMax: null,
        compensationCurrency: null,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: item.date ? safeParseDate(item.date) : null,
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

interface ScrapedJob {
  jobId: string;
  title: string;
  companyName: string | null;
  location: string | null;
  type: string | null;
  link: string | null;
  date: string | null;
  description: string;
}

/**
 * Extract job cards from the Remote.co HTML.
 * Remote.co uses card-based layout with job listing entries.
 */
function extractJobCards(html: string): ScrapedJob[] {
  const jobs: ScrapedJob[] = [];

  // Remote.co job cards are in <a> tags with class "card" or within
  // job-listing containers. The exact structure may vary — we use
  // a flexible regex approach that extracts job links and titles.
  const cardRegex =
    /<a[^>]*href="(\/remote-jobs\/[^"]*|\/job\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null = cardRegex.exec(html);

  while (match !== null && jobs.length < 200) {
    const link = match[1];
    const block = match[2];

    // Extract title from the card — usually in an h2 or h3
    const titleMatch =
      block.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/i) ||
      block.match(/class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\//i);
    const title = titleMatch ? stripHtmlToText(titleMatch[1]).trim() : "";

    if (!title) {
      match = cardRegex.exec(html);
      continue;
    }

    // Extract company name — usually in a span or div with company class
    const companyMatch =
      block.match(/class="[^"]*company[^"]*"[^>]*>([\s\S]*?)<\//i) ||
      block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const companyName = companyMatch
      ? stripHtmlToText(companyMatch[1]).trim() || null
      : null;

    // Extract location
    const locationMatch = block.match(
      /class="[^"]*location[^"]*"[^>]*>([\s\S]*?)<\//i,
    );
    const location = locationMatch
      ? stripHtmlToText(locationMatch[1]).trim() || null
      : null;

    // Extract job ID from URL
    const jobId = link.split("/").pop() || link;

    jobs.push({
      jobId,
      title,
      companyName,
      location,
      type: null,
      link: link.startsWith("http") ? link : `https://remote.co${link}`,
      date: null,
      description: block,
    });

    match = cardRegex.exec(html);
  }

  return jobs;
}

function inferRemoteScope(
  location: string | null | undefined,
): "global" | "country_fenced" {
  if (!location) return "global";
  const lower = location.toLowerCase();
  if (
    lower.includes("world") ||
    lower.includes("anywhere") ||
    lower.includes("global") ||
    lower.trim() === ""
  ) {
    return "global";
  }
  return "country_fenced";
}
