// RemoteOK Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/remoteok.ts
//
// Fetches jobs from the RemoteOK API (https://remoteok.com/api) and transforms
// them into DirectIngestionJob objects. RemoteOK is a remote-first job board —
// every job is remote by definition, so remoteScope defaults to "global".
//
// API: GET https://remoteok.com/api
// Response: Array where the FIRST element is a legal notice (has `legal` field,
// no `position`), and subsequent elements are job objects with:
//   { id, position, company, tags[], description, location, salary_min/max,
//     apply_url, url, date }
//
// Note: The description field contains HTML — we strip it for normalizedText.

import type { DirectFetchResult, DirectIngestionJob } from "./types";

/** RemoteOK API response — array with first element as legal notice. */
type RemoteOKResponse = Array<RemoteOKLegalNotice | RemoteOKJob>;

interface RemoteOKLegalNotice {
  legal?: string;
  last_updated?: number;
}

interface RemoteOKJob {
  id?: string | number;
  position?: string;
  company?: string;
  tags?: string[];
  description?: string;
  location?: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  apply_url?: string;
  url?: string;
  date?: string;
  slug?: string;
}

/**
 * Fetch and normalize jobs from the RemoteOK API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchRemoteOKJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const response = await fetchFn("https://remoteok.com/api", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return {
        success: false,
        error: `RemoteOK API HTTP ${response.status} ${response.statusText}`,
        totalAvailable: 0,
      };
    }

    const data = (await response.json()) as RemoteOKResponse;

    // Filter out the legal notice (first element with `legal` field, no `position`)
    const rawJobs = data.filter(
      (item): item is RemoteOKJob =>
        "position" in item && item.position !== undefined,
    );

    const totalAvailable = rawJobs.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const rj of rawJobs) {
      const tags = (rj.tags ?? []).map((t) => t.toLowerCase());
      const title = rj.position ?? "";
      const description = stripHtml(rj.description ?? "");

      // Apply persona tech filter
      if (!techFilter({ tags, title, description })) {
        continue;
      }

      const job: DirectIngestionJob = {
        externalJobId: String(rj.id ?? rj.slug ?? ""),
        title,
        companyName: rj.company ?? null,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: rj.apply_url ?? rj.url ?? null,
        locationName: rj.location ?? null,
        workplaceType: "remote", // RemoteOK is remote-first
        employmentType: null, // RemoteOK doesn't provide structured employment type
        remoteScope: "global", // Remote-first board
        compensationMin:
          rj.salary_min && rj.salary_min > 0 ? rj.salary_min : null,
        compensationMax:
          rj.salary_max && rj.salary_max > 0 ? rj.salary_max : null,
        compensationCurrency: rj.salary_currency ?? "USD",
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: rj.date ? safeParseDate(rj.date) : null,
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
 * Strip HTML tags from a string, preserving text content.
 * RemoteOK descriptions contain HTML (p, ul, li, strong, br).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "") // Strip all remaining tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n") // Collapse excessive newlines
    .trim();
}

function safeParseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
