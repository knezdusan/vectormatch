// 4dayweek.io Direct Ingestion Adapter (D26, updated D29)
// src/lib/jobs/direct-ingestion/fourdayweek.ts
//
// Fetches jobs from the 4dayweek.io API and transforms them into
// DirectIngestionJob objects. 4dayweek.io is a remote-first job board
// specializing in 4-day work week positions.
//
// API: GET https://4dayweek.io/api/jobs
// Response (D29 update — API format changed):
//   { "jobs": [ { id, title, slug, company_name, work_arrangement,
//     locations: [{city, state, country, continent, work_arrangement, is_primary}],
//     timezones[], posted (epoch), schedule_type, salary, salary_lower, salary_upper,
//     salary_currency, salary_period, category, level, is_expired,
//     stack: [{id, name, slug}], description?, url?, company: {hires_worldwide} } ] }
//
// D26: Part of the strategic inversion — discover global jobs directly from
// remote-native boards. 4dayweek.io is remote-first by construction.
// D29: API response format changed — now wraps in {jobs:[]}, uses `stack`
//      instead of `tags`, `posted` as epoch int, `locations` array instead of
//      `location` string, `work_arrangement` instead of `remote` boolean.

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

interface FourDayWeekLocation {
  city?: string;
  state?: string;
  country?: string;
  continent?: string;
  work_arrangement?: string;
  is_primary?: boolean;
}

interface FourDayWeekStackItem {
  id?: string;
  name?: string;
  slug?: string;
}

interface FourDayWeekCompany {
  id?: string;
  name?: string;
  slug?: string;
  hires_worldwide?: boolean;
}

interface FourDayWeekJob {
  // D29: new format
  id?: string;
  title?: string;
  slug?: string;
  company_name?: string;
  work_arrangement?: string; // "remote", "hybrid", "on-site"
  locations?: FourDayWeekLocation[];
  timezones?: string[];
  posted?: number; // epoch seconds
  schedule_type?: string;
  salary?: string;
  salary_lower?: number;
  salary_upper?: number;
  salary_currency?: string;
  salary_period?: string;
  category?: string;
  level?: string;
  is_expired?: boolean;
  stack?: FourDayWeekStackItem[];
  description?: string;
  url?: string;
  company?: FourDayWeekCompany;
  // Legacy fields (for backward compat if API reverts)
  location?: string;
  remote?: boolean;
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
      // Skip expired jobs
      if (rj.is_expired) continue;

      // D29: Extract tags from `stack` array (new format) or `tags` (legacy)
      const tags = extractTags(rj);
      const title = rj.title ?? "";
      const description = stripHtmlToText(rj.description ?? "");

      if (!techFilter({ tags, title, description })) {
        continue;
      }

      // D29: Build location string from `locations` array (new format)
      const locationName = extractLocationName(rj);
      const workArrangement = extractWorkArrangement(rj);
      const hiresWorldwide = rj.company?.hires_worldwide ?? false;

      const job: DirectIngestionJob = {
        externalJobId: String(rj.id ?? rj.slug ?? ""),
        title,
        companyName: rj.company_name ?? rj.company?.name ?? null,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: rj.url ?? null,
        jobUrl: rj.url ?? null,
        locationName,
        workplaceType: workArrangement,
        employmentType: normalizeEmploymentType(
          rj.job_type ?? rj.schedule_type,
        ),
        // 4dayweek.io is remote-first; infer scope from location + hires_worldwide
        remoteScope: inferRemoteScope(
          locationName,
          workArrangement,
          hiresWorldwide,
        ),
        compensationMin: rj.salary_lower ?? rj.salary_min ?? null,
        compensationMax: rj.salary_upper ?? rj.salary_max ?? null,
        compensationCurrency: rj.salary_currency ?? rj.currency ?? null,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: extractPublishedAt(rj),
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

/** Extract tags from stack[] (D29 new format) or tags[] (legacy). */
function extractTags(rj: FourDayWeekJob): string[] {
  if (rj.stack && rj.stack.length > 0) {
    return rj.stack
      .map((s) => (s.slug ?? s.name ?? "").toLowerCase())
      .filter((t) => t.length > 0);
  }
  return (rj.tags ?? []).map((t) => t.toLowerCase());
}

/** Build a human-readable location string from the locations[] array. */
function extractLocationName(rj: FourDayWeekJob): string | null {
  // Legacy format: single location string
  if (rj.location) return rj.location;

  // D29 new format: locations[] array
  if (rj.locations && rj.locations.length > 0) {
    const primary = rj.locations.find((l) => l.is_primary) ?? rj.locations[0];
    const parts = [primary.city, primary.state, primary.country].filter(
      Boolean,
    );
    if (parts.length > 0) return parts.join(", ");
    return primary.continent ?? null;
  }
  return null;
}

/** Extract work arrangement type (remote/hybrid/on-site). */
function extractWorkArrangement(
  rj: FourDayWeekJob,
): "remote" | "hybrid" | "on-site" | null {
  // D29 new format: work_arrangement string
  if (rj.work_arrangement) {
    const wa = rj.work_arrangement.toLowerCase();
    if (wa === "remote") return "remote";
    if (wa === "hybrid") return "hybrid";
    if (wa.includes("on-site") || wa.includes("office")) return "on-site";
  }
  // Legacy format: remote boolean
  if (rj.remote === true) return "remote";
  return null;
}

/** Parse published date from epoch (D29) or ISO string (legacy). */
function extractPublishedAt(rj: FourDayWeekJob): Date | null {
  if (rj.posted && typeof rj.posted === "number") {
    // Epoch seconds → Date
    return new Date(rj.posted * 1000);
  }
  if (rj.posted_date) {
    return safeParseDate(rj.posted_date);
  }
  return null;
}

function inferRemoteScope(
  location: string | null,
  workArrangement: string | null,
  hiresWorldwide: boolean,
): "global" | "country_fenced" | "unknown" {
  // hires_worldwide flag is the strongest signal
  if (hiresWorldwide) return "global";
  if (workArrangement !== "remote") return "unknown";
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
