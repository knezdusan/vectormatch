// Working Nomads Direct Ingestion Adapter (D26)
// src/lib/jobs/direct-ingestion/workingnomads.ts
//
// Fetches jobs from the Working Nomads RSS feed
// (https://www.workingnomads.com/jobsrss) and transforms them into
// DirectIngestionJob objects. Working Nomads is a remote-first job board —
// every listed job is remote by definition.
//
// API: GET https://www.workingnomads.com/jobsrss
// Response: RSS 2.0 XML with <item> entries. Each item has:
//   <title>Job Title</title>
//   <category>Software Development</category>
//   <link>https://www.workingnomads.com/jobs/...</link>
//   <pubDate>Mon, 07 Jul 2026 10:00:00 +0000</pubDate>
//   <description>HTML content</description>
//
// D26: Part of the strategic inversion — discover global jobs directly from
// remote-native boards rather than discovering companies and classifying scope.

import { scanTagsRegex } from "../job-normalizer";
import {
  extractJobIdFromLink,
  extractRssItems,
  parseRssDescription,
} from "./rss-helpers";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  normalizeEmploymentType,
  safeParseDate,
} from "./types";

/**
 * Fetch and normalize jobs from the Working Nomads RSS feed.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchWorkingNomadsJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const response = await fetchFn("https://www.workingnomads.com/jobsrss", {
      headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Working Nomads RSS HTTP ${response.status} ${response.statusText}`,
        totalAvailable: 0,
      };
    }

    const xml = await response.text();
    const items = extractRssItems(xml);
    const totalAvailable = items.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const item of items) {
      const description = parseRssDescription(item.description);
      const textTags = scanTagsRegex(`${item.title} ${description}`);
      const tags = [...new Set([...textTags])];

      if (!techFilter({ tags, title: item.title, description })) {
        continue;
      }

      const job: DirectIngestionJob = {
        externalJobId: extractJobIdFromLink(item.link),
        title: item.title,
        companyName: extractCompany(item.description) ?? null,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: item.link || null,
        jobUrl: item.link || null,
        locationName: null, // Working Nomads doesn't expose location in RSS
        workplaceType: "remote", // Working Nomads is remote-first
        employmentType: normalizeEmploymentType(item.category ?? undefined),
        // Working Nomads is remote-first; without location data, default global
        remoteScope: "global",
        compensationMin: null,
        compensationMax: null,
        compensationCurrency: null,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: item.pubDate ? safeParseDate(item.pubDate) : null,
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

/** Try to extract company name from the description HTML. */
function extractCompany(description: string): string | null {
  // Working Nomads often includes "Company: X" or the company name in the
  // first line of the description. This is a best-effort extraction.
  const companyMatch = description.match(/^(?:Company|Employer):\s*(.+)$/im);
  if (companyMatch) return companyMatch[1].trim();
  return null;
}
