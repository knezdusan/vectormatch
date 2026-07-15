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
//
// ── D1 Audit (July 2026) ────────────────────────────────────────────────────
// The adapter previously hardcoded remoteScope="global" and ignored the
// location field for scope inference. This caused FNs: jobs with
// location="Remote, Latin America" or null location but US-only text were
// classified as global. The fix: infer scope from the location string, and
// when location is null, check the excerpt for region-fencing signals.

import { extractLocationCountry } from "@/lib/jobs/location-utils";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  normalizeEmploymentType,
  safeParseDate,
} from "./types";

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
  // D7 Audit: These fields are the actual location data. `location` is always
  // null. `locationRestrictions` is an array of country names (empty = global).
  // `timezoneRestrictions` is an array of UTC offsets.
  locationRestrictions?: string[];
  timezoneRestrictions?: number[];
  categories?: string[];
  parentCategories?: string[];
}

/** Page size for Himalayas API pagination.
 *
 * D7 Audit (July 2026): The API silently caps at 20 jobs/page regardless of
 * the `limit` parameter. Previously PAGE_SIZE=50, which caused the offset
 * to jump by 50 while only 20 jobs were returned — silently skipping 60%
 * of the corpus (jobs 20-49, 70-99, etc.). Combined with MAX_PAGES=20,
 * the adapter only saw 400 of 102k jobs.
 */
const PAGE_SIZE = 20;

/** Maximum pages to fetch per ingestion run (safety cap).
 *
 * At PAGE_SIZE=20, 500 pages = 10,000 jobs sampled (~10% of corpus).
 * The full corpus (102k) would need 5,123 pages — too slow for a single
 * cron run. Role-scoped ingestion (D7 Item 2) will reduce the fetch volume
 * by filtering at the title/category level before upsert.
 */
const MAX_PAGES = 500;

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
    let consecutive429 = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      const response = await fetchFn(
        `https://himalayas.app/jobs/api?limit=${PAGE_SIZE}&offset=${offset}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30000),
        },
      );

      // D7: Rate limit handling — back off on 429 and retry once.
      if (response.status === 429) {
        consecutive429++;
        if (consecutive429 >= 3) {
          return {
            success: false,
            error: `Himalayas API rate-limited (3 consecutive 429s at page ${page}, offset ${offset})`,
            totalAvailable,
          };
        }
        await new Promise((r) => setTimeout(r, 2000 * consecutive429));
        page--; // Retry same page
        continue;
      }
      consecutive429 = 0;

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
          jobUrl: hj.jobSlug
            ? `https://himalayas.app/jobs/${hj.jobSlug}`
            : null,
          locationName: hj.locationRestrictions?.join(", ") ?? null,
          workplaceType: "remote", // Himalayas is remote-first
          employmentType: normalizeEmploymentType(hj.employmentType),
          ...inferHimalayasScope(hj.locationRestrictions, title, description),
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

      // D7: Rate limit — 250ms delay between pages (~4 req/s).
      // The API doesn't document a rate limit but 429s start at ~5 req/s.
      if (page < MAX_PAGES - 1) {
        await new Promise((r) => setTimeout(r, 250));
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
 * Infer remoteScope from the Himalayas locationRestrictions field.
 *
 * D7 Audit (July 2026): The API provides `locationRestrictions` as an array
 * of country names (e.g. ["United States"], or multiple countries). The
 * `location` field is always null. Previously the adapter read `location`
 * (null) and defaulted everything to "global" — a massive false positive
 * that let country-fenced jobs through as global.
 *
 * Classification logic:
 * - Empty/null locationRestrictions → global (no restrictions = worldwide)
 * - 1 country → country_fenced
 * - 2+ countries → region_fenced (multi-country restriction)
 * - "Worldwide" / "Anywhere" in the array → global
 *
 * Title and excerpt are still checked for region-fencing signals as a
 * fallback (some jobs have empty locationRestrictions but fence in text).
 */
function inferHimalayasScope(
  locationRestrictions: string[] | undefined,
  title: string,
  excerpt: string,
): {
  remoteScope: "global" | "country_fenced" | "region_fenced";
  locationCountries: string[] | null;
} {
  // ── Primary signal: locationRestrictions array ──────────────────────────
  if (locationRestrictions && locationRestrictions.length > 0) {
    // Check for explicit global signals in the restrictions
    const lowerRestrictions = locationRestrictions.map((r) => r.toLowerCase());
    if (
      lowerRestrictions.some(
        (r) =>
          r.includes("worldwide") ||
          r.includes("anywhere") ||
          r.includes("global") ||
          r.includes("world"),
      )
    ) {
      return { remoteScope: "global", locationCountries: null };
    }

    // Extract country codes from the restrictions
    const countries: string[] = [];
    for (const r of locationRestrictions) {
      const code = extractLocationCountry(r);
      if (code) countries.push(code);
    }

    if (countries.length === 1) {
      return { remoteScope: "country_fenced", locationCountries: countries };
    }
    if (countries.length >= 2) {
      return { remoteScope: "region_fenced", locationCountries: countries };
    }

    // Country names present but couldn't extract codes — still fenced
    if (locationRestrictions.length === 1) {
      return {
        remoteScope: "country_fenced",
        locationCountries: locationRestrictions,
      };
    }
    return {
      remoteScope: "region_fenced",
      locationCountries: locationRestrictions,
    };
  }

  // ── Fallback: check title and excerpt for fencing signals ───────────────
  const combined = `${title} ${excerpt}`.toLowerCase();

  if (
    combined.includes("worldwide") ||
    combined.includes("anywhere in the world") ||
    combined.includes("work from anywhere")
  ) {
    return { remoteScope: "global", locationCountries: null };
  }

  if (
    combined.includes("latin america") ||
    combined.includes("latam") ||
    combined.includes("emea") ||
    combined.includes("apac") ||
    combined.includes("americas") ||
    combined.includes("europe") ||
    combined.includes("africa") ||
    combined.includes("asia")
  ) {
    return { remoteScope: "region_fenced", locationCountries: null };
  }

  // No fencing signal found and no locationRestrictions → genuinely global
  return { remoteScope: "global", locationCountries: null };
}
