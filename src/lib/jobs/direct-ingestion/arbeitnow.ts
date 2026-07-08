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

import type { DirectFetchResult, DirectIngestionJob } from "./types";

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
      const response = await fetchFn(
        `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        },
      );

      if (!response.ok) {
        return {
          success: false,
          error: `Arbeitnow API HTTP ${response.status} ${response.statusText}`,
          totalAvailable: 0,
        };
      }

      const data = (await response.json()) as ArbeitnowResponse;
      const pageJobs = data.data ?? [];

      // Empty page → end of data (the API exposes no total/last_page).
      if (pageJobs.length === 0) {
        break;
      }
      totalAvailable += pageJobs.length;

      for (const aj of pageJobs) {
        const tags = (aj.tags ?? []).map((t) => t.toLowerCase());
        const title = aj.title ?? "";
        const description = stripHtml(aj.description ?? "");

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
          employmentType: normalizeEmploymentType(aj.job_types),
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

/**
 * Pick and normalize an employment type from the job_types array.
 * Arbeitnow exposes an array (e.g. ["full_time", "contract"]).
 */
function normalizeEmploymentType(types: string[] | undefined): string | null {
  if (!types || types.length === 0) return null;
  const raw = types[0];
  const lower = raw.toLowerCase();
  if (lower.includes("full")) return "full-time";
  if (lower.includes("part")) return "part-time";
  if (lower.includes("contract") || lower.includes("freelance"))
    return "contract";
  if (lower.includes("intern")) return "internship";
  return lower;
}

/**
 * Strip HTML tags from a string, preserving text content.
 * Arbeitnow descriptions contain HTML (p, ul, li, strong, br).
 */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safeParseDate(s: string): Date | null {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
