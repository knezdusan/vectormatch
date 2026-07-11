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
          jobUrl: hj.jobSlug
            ? `https://himalayas.app/jobs/${hj.jobSlug}`
            : null,
          locationName: hj.location ?? null,
          workplaceType: "remote", // Himalayas is remote-first
          employmentType: normalizeEmploymentType(hj.employmentType),
          ...inferHimalayasScope(hj.location, title, description),
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

/**
 * Infer remoteScope from the Himalayas location field, title, and excerpt text.
 *
 * Himalayas doesn't expose structured country codes. The location field is
 * free-text (e.g. "Remote, Latin America", "United States", or null). When
 * location is null, we check the title and excerpt for region-fencing signals
 * (e.g. "Remote, Latin America" in the title, "United States" in the text).
 *
 * Default: global (Himalayas is a remote-first board with worldwide listings).
 * Fencing only when there's a clear signal.
 */
function inferHimalayasScope(
  location: string | undefined,
  title: string,
  excerpt: string,
): {
  remoteScope: "global" | "country_fenced" | "region_fenced";
  locationCountries: string[] | null;
} {
  const combined = `${location ?? ""} ${title} ${excerpt}`.toLowerCase();

  // Check for explicit global signals first
  if (
    combined.includes("worldwide") ||
    combined.includes("anywhere in the world") ||
    combined.includes("work from anywhere")
  ) {
    return { remoteScope: "global", locationCountries: null };
  }

  // Check for broad regions (in location or title)
  if (
    combined.includes("latin america") ||
    combined.includes("latam") ||
    combined.includes("emea") ||
    combined.includes("apac") ||
    combined.includes("north america") ||
    combined.includes("noam") ||
    combined.includes("americas") ||
    combined.includes("europe") ||
    combined.includes("africa") ||
    combined.includes("asia")
  ) {
    return { remoteScope: "region_fenced", locationCountries: null };
  }

  // Check for US-only signals in text
  if (
    combined.includes("us only") ||
    combined.includes("usa only") ||
    combined.includes("united states") ||
    combined.includes("must be in the us") ||
    combined.includes("must be based in the us") ||
    combined.includes("must reside in")
  ) {
    return { remoteScope: "country_fenced", locationCountries: ["US"] };
  }

  // Try to extract a country from the location string
  if (location) {
    const country = extractLocationCountry(location);
    if (country) {
      return { remoteScope: "country_fenced", locationCountries: [country] };
    }
  }

  // No fencing signal found — default to global
  return { remoteScope: "global", locationCountries: null };
}
