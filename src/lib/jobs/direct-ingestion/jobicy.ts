// Jobicy Direct Ingestion Adapter (D31, Job 4 — supply expansion)
// src/lib/jobs/direct-ingestion/jobicy.ts
//
// Fetches jobs from the Jobicy public REST API and transforms them into
// DirectIngestionJob objects. Jobicy is a remote-first job board — every
// listed job is remote by definition.
//
// API: GET https://jobicy.com/api/v2/remote-jobs
// Query params: count (max 100), geo, industry, tag
// Response:
//   { apiVersion, jobCount, jobs: [ { id, url, jobSlug, jobTitle, companyName,
//     jobIndustry[], jobType[], jobGeo, jobLevel, jobExcerpt, jobDescription,
//     pubDate, salaryMin, salaryMax, salaryCurrency, salaryPeriod } ] }
//
// D31 Job 4: Part of the remote-native supply expansion. Jobicy was previously
// only used as a frozen RSS seeder for company discovery. Now it's a direct
// ingestion adapter — jobs flow directly into the matching pipeline.

import { scanTagsRegex } from "../job-normalizer";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  fetchJsonWithTimeout,
  normalizeEmploymentTypeFromArray,
  safeParseDate,
  stripHtmlToText,
} from "./types";

interface JobicyJob {
  id?: number;
  url?: string;
  jobSlug?: string;
  jobTitle?: string;
  companyName?: string;
  jobIndustry?: string[];
  jobType?: string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string;
  pubDate?: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  salaryPeriod?: string;
}

interface JobicyResponse {
  apiVersion?: string;
  jobCount?: number;
  jobs?: JobicyJob[];
}

/**
 * Fetch jobs from the Jobicy public REST API.
 *
 * @param maxJobs     Maximum number of jobs to return (API max is 100).
 * @param techFilter  Optional filter function — returns false to skip a job.
 * @param fetchFn     Optional injectable fetch (for tests).
 * @returns           DirectFetchResult with jobs or error.
 */
export async function fetchJobicyJobs(
  maxJobs: number = 100,
  techFilter?: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn?: typeof fetch,
): Promise<DirectFetchResult> {
  const count = Math.min(maxJobs, 100);
  const url = `https://jobicy.com/api/v2/remote-jobs?count=${count}&industry=engineering`;

  const result = await fetchJsonWithTimeout<JobicyResponse>(
    url,
    fetchFn ?? fetch,
    "Jobicy",
  );
  if (!result.success) {
    return {
      success: false,
      error: result.error,
      totalAvailable: 0,
    };
  }

  const data = result.data;
  const rawJobs = data.jobs ?? [];
  const jobs: DirectIngestionJob[] = [];

  for (const raw of rawJobs) {
    if (!raw.id || !raw.jobTitle) continue;

    const description = stripHtmlToText(
      raw.jobDescription ?? raw.jobExcerpt ?? "",
    );
    if (description.length < 50) continue;

    // Extract tags from the full text (title + description).
    const fullText = `${raw.jobTitle} ${description}`;
    const tags = scanTagsRegex(fullText);

    // Apply tech filter if provided.
    if (techFilter) {
      if (!techFilter({ tags, title: raw.jobTitle, description })) continue;
    }

    const employmentType = normalizeEmploymentTypeFromArray(raw.jobType);

    // Jobicy is remote-first. jobGeo is a free-text location string.
    // "USA", "EU", "Worldwide", "Anywhere" etc. If jobGeo is "Worldwide"
    // or "Anywhere", scope is global. Otherwise, country_fenced.
    const geo = (raw.jobGeo ?? "").trim();
    const isGlobal =
      geo === "" || /^(worldwide|anywhere|global|remote)$/i.test(geo);

    jobs.push({
      externalJobId: String(raw.id),
      title: raw.jobTitle,
      companyName: raw.companyName ?? null,
      normalizedText: fullText,
      extractedTags: tags,
      applyUrl: raw.url ?? null,
      jobUrl: raw.url ?? null,
      locationName: geo || null,
      workplaceType: "remote",
      employmentType,
      remoteScope: isGlobal ? "global" : "country_fenced",
      locationCountries: null,
      publishedAt: safeParseDate(raw.pubDate ?? ""),
      compensationMin: raw.salaryMin ?? null,
      compensationMax: raw.salaryMax ?? null,
      compensationCurrency: raw.salaryCurrency ?? null,
      experienceMinYears: null,
      experienceMaxYears: null,
    });
  }

  return {
    success: true,
    jobs,
    totalAvailable: data.jobCount ?? jobs.length,
  };
}
