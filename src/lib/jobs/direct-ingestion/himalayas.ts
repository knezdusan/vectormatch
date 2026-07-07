// Himalayas Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/himalayas.ts
//
// Fetches jobs from the Himalayas API (https://himalayas.app/jobs/api) and
// transforms them into DirectIngestionJob objects. Himalayas is a remote-first
// job board — every job is remote by definition, so remoteScope defaults to
// "global" unless the job's location field indicates country fencing.
//
// API: GET https://himalayas.app/jobs/api?limit=20&offset=0 (paginated)
// Response: { totalCount, jobs: [{ title, companyName, companySlug, excerpt, tags, ... }] }
//
// The API returns 100K+ jobs. We paginate through pages, applying the persona
// tech-stack filter to only ingest frontend/PHP/Laravel jobs.

import type { DirectFetchResult, DirectIngestionJob } from "./types";

/** Himalayas API response shape (partial — only fields we use). */
interface HimalayasResponse {
  totalCount?: number;
  jobs?: HimalayasJob[];
}

interface HimalayasJob {
  title?: string;
  companyName?: string;
  companySlug?: string;
  excerpt?: string;
  description?: string;
  tags?: string[];
  jobSlug?: string;
  minSalary?: number;
  maxSalary?: number;
  salaryCurrency?: string;
  employmentType?: string;
  location?: string;
  timezone?: string;
  pubDate?: string;
}

/** Page size for Himalayas API pagination. */
const PAGE_SIZE = 50;

/** Maximum pages to fetch per ingestion run (safety cap). */
const MAX_PAGES = 20;

/**
 * Fetch and normalize jobs from the Himalayas API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchHimalayasJobs(
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
    let offset = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await fetchFn(
        `https://himalayas.app/jobs/api?limit=${PAGE_SIZE}&offset=${offset}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Himalayas API HTTP ${response.status} ${response.statusText}`,
          totalAvailable: 0,
        };
      }

      const data = (await response.json()) as HimalayasResponse;
      totalAvailable = data.totalCount ?? totalAvailable;

      const pageJobs = data.jobs ?? [];
      if (pageJobs.length === 0) {
        break; // No more jobs
      }

      // Transform + filter each job
      for (const hj of pageJobs) {
        const tags = (hj.tags ?? []).map((t) => t.toLowerCase());
        const title = hj.title ?? "";
        const description = hj.excerpt ?? hj.description ?? "";

        // Apply persona tech filter
        if (!techFilter({ tags, title, description })) {
          continue;
        }

        const job: DirectIngestionJob = {
          externalJobId: hj.jobSlug ?? `${hj.companySlug}-${title}-${offset}`,
          title,
          companyName: hj.companyName ?? null,
          normalizedText: description,
          extractedTags: tags,
          applyUrl: hj.jobSlug
            ? `https://himalayas.app/jobs/${hj.jobSlug}`
            : null,
          locationName: hj.location ?? null,
          workplaceType: "remote", // Himalayas is remote-first
          employmentType: normalizeEmploymentType(hj.employmentType),
          remoteScope: "global", // Remote-first board
          compensationMin: hj.minSalary ?? null,
          compensationMax: hj.maxSalary ?? null,
          compensationCurrency: hj.salaryCurrency ?? "USD",
          experienceMinYears: null,
          experienceMaxYears: null,
          publishedAt: hj.pubDate ? safeParseDate(hj.pubDate) : null,
        };

        allJobs.push(job);

        if (allJobs.length >= maxJobs) {
          return { success: true, jobs: allJobs, totalAvailable };
        }
      }

      offset += PAGE_SIZE;
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

function normalizeEmploymentType(raw: string | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower.includes("full")) return "full-time";
  if (lower.includes("part")) return "part-time";
  if (lower.includes("contract") || lower.includes("freelance"))
    return "contract";
  if (lower.includes("intern")) return "internship";
  return lower;
}

function safeParseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
