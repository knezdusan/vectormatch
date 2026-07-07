// Greenhouse Tier 2 Selective Detail Fetch
// src/lib/jobs/poller/greenhouse-detail.ts
//
// The Greenhouse list endpoint (/v1/boards/{slug}/jobs?content=true) includes
// the `content` field (HTML job description) for each job. However, some
// Greenhouse boards return empty or very short content even with ?content=true.
// This module fetches the detail endpoint (/v1/boards/{slug}/jobs/{jobId}) for
// jobs where the Tier 1 content is too short for a good embedding
// (< MIN_FULLTEXT_LENGTH chars), which may return fuller content.
//
// The detail response is merged into the job's rawJson so the normalizer can
// extract the full description on the next pass.
//
// Pattern mirrors smartrecruiters-detail.ts (Sprint 4 Task 7):
//   - Only fetches detail if Tier 1 content < MIN_FULLTEXT_LENGTH chars
//   - Capped at MAX_DETAIL_FETCHES per poll cycle
//   - Best-effort: failures are non-fatal (Tier 1 data is kept)
//   - Uses fetchWithTimeout to prevent hanging

import "server-only";

import { ATS_ENDPOINTS } from "@/lib/jobs/ats-endpoints";
import { greenhouseJobSchema } from "@/lib/jobs/ats-schemas";
import { extractJobContent } from "@/lib/jobs/job-normalizer";
import type { NormalizedJob } from "@/lib/jobs/poller/ats-adapters";
import { fetchWithTimeout } from "@/lib/jobs/poller/fetch-with-timeout";
import {
  MAX_DETAIL_FETCHES,
  MIN_FULLTEXT_LENGTH,
} from "@/lib/jobs/poller/smartrecruiters-detail";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────
// MIN_FULLTEXT_LENGTH and MAX_DETAIL_FETCHES are defined in and imported from
// smartrecruiters-detail.ts (the canonical source) to avoid duplicate
// declarations. Tests should import them from smartrecruiters-detail.ts.

// ── Types ────────────────────────────────────────────────────────────────────

export interface GreenhouseEnrichmentResult {
  /** Jobs with enriched rawJson (detail fetched). */
  enriched: NormalizedJob[];
  /** Jobs that were not enriched (Tier 1 was sufficient). */
  unchanged: NormalizedJob[];
  /** Number of detail fetches attempted. */
  fetchesAttempted: number;
  /** Number of detail fetches that succeeded. */
  fetchesSucceeded: number;
  /** Number of detail fetches that failed (non-fatal — Tier 1 data is kept). */
  fetchesFailed: number;
  /** Jobs dropped because the detail endpoint reported them as closed/inactive. */
  droppedInactive: number;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Selectively enrich Greenhouse jobs by fetching the detail endpoint for jobs
 * where the Tier 1 content is too short.
 *
 * This is a non-fatal enrichment — if a detail fetch fails, the job keeps its
 * Tier 1 data and is still inserted into the DB. The detail fetch is best-effort.
 *
 * @param jobs     Normalized jobs from the list endpoint
 * @param slug     Greenhouse board slug (for the detail URL)
 * @param fetchFn  Rate-limited fetch function (same as the list fetch)
 * @returns        Enrichment result with enriched/unchanged jobs and stats
 */
export async function enrichGreenhouseJobs(
  jobs: NormalizedJob[],
  slug: string,
  fetchFn: FetchFn,
): Promise<GreenhouseEnrichmentResult> {
  const enriched: NormalizedJob[] = [];
  const unchanged: NormalizedJob[] = [];
  let fetchesAttempted = 0;
  let fetchesSucceeded = 0;
  let fetchesFailed = 0;

  for (const job of jobs) {
    // Check if the Tier 1 content is long enough
    const { fullText } = extractJobContent(
      "greenhouse",
      job.rawJson,
      job.title,
    );
    if (fullText.length >= MIN_FULLTEXT_LENGTH) {
      unchanged.push(job);
      continue;
    }

    // Cap the number of detail fetches per poll cycle
    if (fetchesAttempted >= MAX_DETAIL_FETCHES) {
      unchanged.push(job);
      continue;
    }

    fetchesAttempted++;

    try {
      const detailUrlBuilder = ATS_ENDPOINTS.greenhouse.jobDetail;
      if (!detailUrlBuilder) {
        unchanged.push(job);
        continue;
      }
      // Greenhouse job IDs are numbers — the externalJobId from the list
      // endpoint is the numeric ID as a string.
      const detailUrl = detailUrlBuilder(slug, job.externalJobId);
      const response = await fetchWithTimeout(fetchFn, detailUrl);
      if (!response.ok) {
        fetchesFailed++;
        unchanged.push(job);
        continue;
      }

      const detailJson: unknown = await response.json();
      const parsed = greenhouseJobSchema.safeParse(detailJson);
      if (!parsed.success) {
        fetchesFailed++;
        unchanged.push(job);
        continue;
      }

      // Only merge if the detail response has non-empty content
      const detailContent =
        typeof parsed.data.content === "string" &&
        parsed.data.content.length > 0
          ? parsed.data.content
          : null;

      if (!detailContent) {
        // Detail endpoint also has no content — nothing to merge
        fetchesFailed++;
        unchanged.push(job);
        continue;
      }

      // Merge the detail data into the job's rawJson
      const mergedRawJson = mergeDetailIntoRawJson(job.rawJson, parsed.data);
      enriched.push({
        ...job,
        rawJson: mergedRawJson,
        url: parsed.data.absolute_url ?? job.url,
      });
      fetchesSucceeded++;
    } catch {
      fetchesFailed++;
      unchanged.push(job);
    }
  }

  return {
    enriched,
    unchanged,
    fetchesAttempted,
    fetchesSucceeded,
    fetchesFailed,
    droppedInactive: 0,
  };
}

// ── Internal ─────────────────────────────────────────────────────────────────

/**
 * Merge the detail response data into the job's rawJson string.
 * The detail response's `content` field is merged into the list response's
 * JSON so the normalizer can extract the full description.
 */
function mergeDetailIntoRawJson(
  rawJsonStr: string,
  detail: {
    content?: string;
    absolute_url?: string;
    departments?: unknown;
    offices?: unknown;
    metadata?: unknown;
  },
): string {
  try {
    const original = JSON.parse(rawJsonStr) as Record<string, unknown>;
    // Merge content from detail into the original (only if non-empty)
    if (detail.content && detail.content.length > 0) {
      original.content = detail.content;
    }
    // Merge departments/offices/metadata if present in detail but not list
    if (detail.departments) original.departments = detail.departments;
    if (detail.offices) original.offices = detail.offices;
    if (detail.metadata) original.metadata = detail.metadata;
    return JSON.stringify(original);
  } catch {
    // If parsing fails, return the original rawJson unchanged
    return rawJsonStr;
  }
}
