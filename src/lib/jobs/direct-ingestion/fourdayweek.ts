// 4dayweek.io Direct Ingestion Adapter (D26)
// src/lib/jobs/direct-ingestion/fourdayweek.ts
//
// Fetches jobs from the 4dayweek.io API and transforms them into
// DirectIngestionJob objects. 4dayweek.io is a remote-first job board
// specializing in 4-day work week positions.
//
// API: GET https://4dayweek.io/api/jobs
// Response: JSON array of job objects with fields:
//   { id, title, company_name, location, remote, url, description,
//     tags[], posted_date, salary_min, salary_max, currency }
//
// D26: Part of the strategic inversion — discover global jobs directly from
// remote-native boards. 4dayweek.io is remote-first by construction.

import {
  type DirectFetchResult,
  type DirectIngestionJob,
  fetchJsonWithTimeout,
  normalizeEmploymentType,
  safeParseDate,
  stripHtmlToText,
} from "./types";

interface FourDayWeekResponse {
  jobs?: FourDayWeekJob[];
  total?: number;
}

interface FourDayWeekJob {
  id?: number | string;
  title?: string;
  company_name?: string;
  location?: string;
  remote?: boolean;
  url?: string;
  description?: string;
  tags?: string[];
  posted_date?: string;
  salary_min?: number;
  salary_max?: number;
  currency?: string;
  job_type?: string;
}

/**
 * Fetch and normalize jobs from the 4dayweek.io API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchFourDayWeekJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const fetchResult = await fetchJsonWithTimeout<FourDayWeekResponse>(
      "https://4dayweek.io/api/jobs",
      fetchFn,
      "4dayweek.io",
    );
    if (!fetchResult.success) {
      return fetchResult;
    }

    const data = fetchResult.data;
    const rawJobs = data.jobs ?? [];
    const totalAvailable = data.total ?? rawJobs.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const rj of rawJobs) {
      const tags = (rj.tags ?? []).map((t) => t.toLowerCase());
      const title = rj.title ?? "";
      const description = stripHtmlToText(rj.description ?? "");

      if (!techFilter({ tags, title, description })) {
        continue;
      }

      const job: DirectIngestionJob = {
        externalJobId: String(rj.id ?? ""),
        title,
        companyName: rj.company_name ?? null,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: rj.url ?? null,
        jobUrl: rj.url ?? null,
        locationName: rj.location ?? null,
        workplaceType: rj.remote ? "remote" : null,
        employmentType: normalizeEmploymentType(rj.job_type),
        // 4dayweek.io is remote-first; infer scope from location string
        remoteScope: inferRemoteScope(rj.location, rj.remote),
        compensationMin: rj.salary_min ?? null,
        compensationMax: rj.salary_max ?? null,
        compensationCurrency: rj.currency ?? null,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: rj.posted_date ? safeParseDate(rj.posted_date) : null,
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

function inferRemoteScope(
  location: string | undefined,
  remote: boolean | undefined,
): "global" | "country_fenced" | "unknown" {
  if (!remote) return "unknown";
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
