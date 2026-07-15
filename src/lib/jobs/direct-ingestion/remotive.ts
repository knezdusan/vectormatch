// Remotive Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/remotive.ts
//
// Fetches jobs from the Remotive API (https://remotive.com/api/remote-jobs) and
// transforms them into DirectIngestionJob objects. Remotive is a remote-first job
// board — every job is remote by definition, so remoteScope defaults to "global"
// unless candidate_required_location specifies country fencing.
//
// API: GET https://remotive.com/api/remote-jobs?limit=100
// Response: { "0-legal-notice": ..., "job-count": N, "total-job-count": N, jobs: [...] }
//
// Note: The API currently returns a small catalog (~28 jobs as of July 2026) but
// provides clean structured data (tags, category, job_type, publication_date).
//
// Each job: { id, url, title, company_name, category, tags[], job_type,
//             publication_date, candidate_required_location, salary (free text),
//             description (HTML) }

import {
  type DirectFetchResult,
  type DirectIngestionJob,
  fetchJsonWithTimeout,
  normalizeEmploymentType,
  safeParseDate,
  stripHtmlToText,
} from "./types";

/** Remotive API top-level response shape (partial — only fields we use). */
interface RemotiveResponse {
  "job-count"?: number;
  "total-job-count"?: number;
  jobs?: RemotiveJob[];
}

interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string; // ISO date
  candidate_required_location?: string;
  salary?: string; // Free text (e.g. "$50-$75 /hour") — not structured
  description?: string; // HTML
}

/**
 * Fetch and normalize jobs from the Remotive API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchRemotiveJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const fetchResult = await fetchJsonWithTimeout<RemotiveResponse>(
      "https://remotive.com/api/remote-jobs?limit=100",
      fetchFn,
      "Remotive",
    );
    if (!fetchResult.success) {
      return fetchResult;
    }
    const data = fetchResult.data;
    const rawJobs = data.jobs ?? [];
    const totalAvailable = data["job-count"] ?? rawJobs.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const rj of rawJobs) {
      const tags = (rj.tags ?? []).map((t) => t.toLowerCase());
      const title = rj.title ?? "";
      const description = stripHtmlToText(rj.description ?? "");

      // Apply persona tech filter
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
        locationName: rj.candidate_required_location ?? null,
        workplaceType: "remote", // Remotive is remote-first
        employmentType: normalizeEmploymentType(rj.job_type),
        // If candidate_required_location names specific countries, treat as
        // country-fenced; otherwise global.
        remoteScope: inferRemoteScope(rj.candidate_required_location),
        // Remotive salary is free text, not structured — leave null.
        compensationMin: null,
        compensationMax: null,
        compensationCurrency: null,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: rj.publication_date
          ? safeParseDate(rj.publication_date)
          : null,
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
 * Infer remote scope from the candidate_required_location string.
 * Empty/World/Anywhere → global; specific countries → country_fenced.
 */
function inferRemoteScope(
  location: string | undefined,
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
