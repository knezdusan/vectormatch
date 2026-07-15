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
//
// ── D1 Audit (July 2026) ────────────────────────────────────────────────────
// The adapter previously hardcoded remoteScope="global" and ignored the
// location field for scope inference. This caused FNs: jobs with
// location="Christ Church" (Barbados) or "Lisboa, Portugal" were classified
// as global. The fix: infer scope from the location string using the same
// extractLocationCountry utility as the other adapters.

import { extractLocationCountry } from "@/lib/jobs/location-utils";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  fetchJsonWithTimeout,
  safeParseDate,
  stripHtmlToText,
} from "./types";

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
    const fetchResult = await fetchJsonWithTimeout<RemoteOKResponse>(
      "https://remoteok.com/api",
      fetchFn,
      "RemoteOK",
    );
    if (!fetchResult.success) {
      return fetchResult;
    }
    const data = fetchResult.data;

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
      const description = stripHtmlToText(rj.description ?? "");

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
        jobUrl: rj.apply_url ?? rj.url ?? null,
        locationName: rj.location ?? null,
        workplaceType: "remote", // RemoteOK is remote-first
        employmentType: null, // RemoteOK doesn't provide structured employment type
        ...inferRemoteOKScope(rj.location),
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
 * Infer remoteScope from the RemoteOK location field.
 *
 * RemoteOK doesn't expose structured country codes. The location field is
 * free-text (e.g. "Christ Church", "Lisboa, Portugal", or empty). When
 * location is empty/null, default to global (RemoteOK is remote-first).
 * When location is present, try to extract a country code.
 */
function inferRemoteOKScope(location: string | undefined): {
  remoteScope: "global" | "country_fenced" | "region_fenced";
  locationCountries: string[] | null;
} {
  if (!location || location.trim() === "") {
    return { remoteScope: "global", locationCountries: null };
  }

  const lower = location.toLowerCase();
  if (
    lower.includes("worldwide") ||
    lower.includes("anywhere") ||
    lower.includes("global")
  ) {
    return { remoteScope: "global", locationCountries: null };
  }

  // Check for broad regions
  if (
    lower.includes("emea") ||
    lower.includes("apac") ||
    lower.includes("latam") ||
    lower.includes("americas") ||
    lower.includes("europe") ||
    lower.includes("africa") ||
    lower.includes("north america") ||
    lower.includes("asia")
  ) {
    return { remoteScope: "region_fenced", locationCountries: null };
  }

  // Try to extract a country code
  const country = extractLocationCountry(location);
  if (country) {
    return { remoteScope: "country_fenced", locationCountries: [country] };
  }

  // Location string present but no country could be extracted — default to global
  return { remoteScope: "global", locationCountries: null };
}
