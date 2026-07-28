// Working Nomads Direct Ingestion Adapter (D26, rewritten D29)
// src/lib/jobs/direct-ingestion/workingnomads.ts
//
// Fetches jobs from the Working Nomads API (Elasticsearch-based) and
// transforms them into DirectIngestionJob objects. Working Nomads is a
// remote-first job board — every listed job is remote by definition.
//
// D26: Originally used RSS feed at https://www.workingnomads.com/jobsrss
// D29: RSS feed is dead (404). Rewrote to use the Elasticsearch API at
//      https://www.workingnomads.com/jobsapi/_search which returns JSON
//      with hits.hits[]._source containing job data.
//
// API: POST https://www.workingnomads.com/jobsapi/_search
// Response: Elasticsearch-style JSON:
//   { hits: { total: { value: N }, hits: [ { _source: { id, title, slug,
//     company, category_name, description, position_type, tags[],
//     locations[], pub_date, apply_url, external_id, salary_range } } ] } }

import { scanTagsRegex } from "../job-normalizer";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  fetchJsonWithTimeout,
  normalizeEmploymentType,
  safeParseDate,
  stripHtmlToText,
} from "./types";

interface WorkingNomadsLocation {
  city?: string;
  state?: string;
  country?: string;
  continent?: string;
}

interface WorkingNomadsJobSource {
  id?: number;
  title?: string;
  slug?: string;
  company?: string;
  company_slug?: string;
  category_name?: string;
  description?: string;
  position_type?: string; // "ft", "pt", "contract"
  tags?: string[];
  all_tags?: string[];
  locations?: string[] | WorkingNomadsLocation[];
  location_base?: string;
  location_extra?: string;
  pub_date?: string;
  apply_url?: string;
  external_id?: string;
  salary_range?: string;
  annual_salary_usd?: number;
  experience_level?: string;
  expired?: boolean;
}

interface WorkingNomadsResponse {
  took?: number;
  hits?: {
    total?: { value?: number; relation?: string };
    max_score?: number;
    hits?: Array<{
      _id?: string;
      _score?: number;
      _source?: WorkingNomadsJobSource;
    }>;
  };
}

/**
 * Fetch and normalize jobs from the Working Nomads API.
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
    // D29: Use the Elasticsearch API. Send a POST with a simple match_all query
    // to get the latest jobs. The API accepts GET too but POST is more
    // explicit for search queries.
    const response = await fetchFn(
      "https://www.workingnomads.com/jobsapi/_search",
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Working Nomads API HTTP ${response.status} ${response.statusText}`,
        totalAvailable: 0,
      };
    }

    const data: WorkingNomadsResponse = await response.json();
    const hits = data.hits?.hits ?? [];
    const totalAvailable = data.hits?.total?.value ?? hits.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const hit of hits) {
      const src = hit._source;
      if (!src) continue;
      if (src.expired) continue;

      const description = stripHtmlToText(src.description ?? "");
      const textTags = scanTagsRegex(`${src.title ?? ""} ${description}`);
      const apiTags = (src.tags ?? []).map((t) => t.toLowerCase());
      const tags = [...new Set([...apiTags, ...textTags])];

      const title = src.title ?? "";
      if (!techFilter({ tags, title, description })) {
        continue;
      }

      const locationName = extractLocationName(src);
      const remoteScope = inferRemoteScope(src, locationName);

      const job: DirectIngestionJob = {
        externalJobId: String(src.id ?? src.slug ?? src.external_id ?? ""),
        title,
        companyName: src.company ?? null,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: src.apply_url ?? null,
        jobUrl: src.apply_url ?? null,
        locationName,
        workplaceType: "remote", // Working Nomads is remote-first
        employmentType: normalizeEmploymentType(src.position_type),
        // Working Nomads is remote-first; infer scope from location data
        remoteScope,
        compensationMin: null,
        compensationMax: src.annual_salary_usd ?? null,
        compensationCurrency: "USD",
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: src.pub_date ? safeParseDate(src.pub_date) : null,
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

/** Extract a human-readable location string from the job source. */
function extractLocationName(src: WorkingNomadsJobSource): string | null {
  // Try locations array — could be string[] or object[]
  if (src.locations && src.locations.length > 0) {
    const first = src.locations[0];
    if (typeof first === "string") return first;
    if (typeof first === "object" && first !== null) {
      const loc = first as WorkingNomadsLocation;
      const parts = [loc.city, loc.state, loc.country].filter(Boolean);
      if (parts.length > 0) return parts.join(", ");
      return loc.continent ?? null;
    }
  }
  // Fall back to location_base + location_extra
  if (src.location_base || src.location_extra) {
    return [src.location_base, src.location_extra].filter(Boolean).join(" — ");
  }
  return null;
}

/** Infer remote scope from location data. Working Nomads is remote-first. */
function inferRemoteScope(
  src: WorkingNomadsJobSource,
  locationName: string | null,
): "global" | "country_fenced" | "unknown" {
  // Check if locations indicate worldwide/global
  if (src.locations && src.locations.length > 0) {
    for (const loc of src.locations) {
      if (typeof loc === "string") {
        const lower = loc.toLowerCase();
        if (
          lower.includes("world") ||
          lower.includes("anywhere") ||
          lower.includes("global") ||
          lower.includes("remote")
        ) {
          return "global";
        }
      }
    }
  }
  if (!locationName) return "global";
  const lower = locationName.toLowerCase();
  if (
    lower.includes("world") ||
    lower.includes("anywhere") ||
    lower.includes("global") ||
    lower.trim() === ""
  ) {
    return "global";
  }
  // If a specific country/region is mentioned, it's country-fenced
  return "country_fenced";
}
