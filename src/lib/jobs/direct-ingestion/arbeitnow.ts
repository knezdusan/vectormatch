// Arbeitnow Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/arbeitnow.ts
//
// Fetches jobs from the Arbeitnow API (https://www.arbeitnow.com/api/job-board-api)
// and transforms them into DirectIngestionJob objects. Arbeitnow is a Europe-focused
// job board that complements NoFluffJobs for CEE/EU coverage.
//
// API: GET https://www.arbeitnow.com/api/job-board-api?page=N
// Response: { data: [...], links: { next, ... }, meta: { current_page, ... } }
//
// Pagination: 100 jobs per page. The base URL applies an implicit
// `search=Software Engineer` filter on page 1 (visible in meta.current_page_url),
// and `links.next` propagates that search. To ingest ALL jobs (not just
// software-engineer-titled ones), we paginate via `?page=N` directly and detect
// the end of data by an empty page. The API exposes no meta.total / meta.last_page,
// so empty-page detection is the only reliable stop condition.
//
// Each job: { slug, company_name, title, description (HTML), remote (bool),
//             url, tags[], job_types[], location, created_at }

import {
  type DirectFetchResult,
  type DirectIngestionJob,
  fetchJsonWithTimeout,
  normalizeEmploymentTypeFromArray,
  safeParseDate,
  stripHtmlToText,
} from "./types";

/** Arbeitnow API response shape (partial — only fields we use). */
interface ArbeitnowResponse {
  data?: ArbeitnowJob[];
}

interface ArbeitnowJob {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string; // HTML
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: string; // ISO date
}

/** Maximum pages to fetch per ingestion run (safety cap). */
const MAX_PAGES = 30;

/**
 * Fetch and normalize jobs from the Arbeitnow API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchArbeitnowJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const allJobs: DirectIngestionJob[] = [];
    let totalAvailable = 0;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const fetchResult = await fetchJsonWithTimeout<ArbeitnowResponse>(
        `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
        fetchFn,
        "Arbeitnow",
      );
      if (!fetchResult.success) {
        return fetchResult;
      }
      const data = fetchResult.data;
      const pageJobs = data.data ?? [];

      // Empty page → end of data (the API exposes no total/last_page).
      if (pageJobs.length === 0) {
        break;
      }
      totalAvailable += pageJobs.length;

      for (const aj of pageJobs) {
        const tags = (aj.tags ?? []).map((t) => t.toLowerCase());
        const title = aj.title ?? "";
        const description = stripHtmlToText(aj.description ?? "");

        // Apply persona tech filter
        if (!techFilter({ tags, title, description })) {
          continue;
        }

        const job: DirectIngestionJob = {
          externalJobId: aj.slug ?? "",
          title,
          companyName: aj.company_name ?? null,
          normalizedText: description,
          extractedTags: tags,
          applyUrl: aj.url ?? null,
          jobUrl: aj.url ?? null,
          locationName: aj.location ?? null,
          workplaceType: aj.remote ? "remote" : null,
          employmentType: normalizeEmploymentTypeFromArray(aj.job_types),
          // Arbeitnow doesn't expose country fencing; mark remote jobs as global.
          remoteScope: aj.remote ? "global" : "unknown",
          compensationMin: null,
          compensationMax: null,
          compensationCurrency: null,
          experienceMinYears: null,
          experienceMaxYears: null,
          publishedAt: aj.created_at ? safeParseDate(aj.created_at) : null,
        };

        allJobs.push(job);

        if (allJobs.length >= maxJobs) {
          return { success: true, jobs: allJobs, totalAvailable };
        }
      }
    }

    return { success: true, jobs: allJobs, totalAvailable };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      totalAvailable: 0,
    };
  }
}
