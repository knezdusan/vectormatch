// SmartRecruiters Tier 2 Selective Detail Fetch (Sprint 4 Task 7)
// src/lib/jobs/poller/smartrecruiters-detail.ts
//
// The SmartRecruiters list endpoint (/v1/companies/{slug}/postings) returns job
// metadata but NOT the full job description. The Tier 1 normalizer synthesizes a
// pseudo-description from the metadata fields (title, department, location,
// employment type) — see job-normalizer.ts case "smartrecruiters".
//
// For jobs where the Tier 1 pseudo-description is too short for a good embedding
// (< MIN_FULLTEXT_LENGTH chars), this module fetches the detail endpoint
// (/v1/companies/{slug}/postings/{postingId}) to get the full jobAd.sections
// text. The detail response is merged into the job's rawJson so the normalizer
// can extract the full description on the next pass.
//
// Rate limiting: the detail fetch uses the same fetchFn as the list fetch,
// which is already rate-limited by the Bottleneck wrapper in the poller.
// We additionally cap the number of detail fetches per poll cycle
// (MAX_DETAIL_FETCHES) to avoid hammering the API for companies with many
// short-metadata jobs.

import "server-only";

import type z from "zod";
import { ATS_ENDPOINTS } from "@/lib/jobs/ats-endpoints";
import { smartRecruitersJobDetailSchema } from "@/lib/jobs/ats-schemas";
import { extractJobContent } from "@/lib/jobs/job-normalizer";
import type { NormalizedJob } from "@/lib/jobs/poller/ats-adapters";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Minimum Tier 1 fullText length (chars) below which the detail endpoint is
 * fetched. Jobs with longer pseudo-descriptions have enough semantic surface
 * area for a good embedding without the extra API call.
 */
export const MIN_FULLTEXT_LENGTH = 100;

/**
 * Maximum number of detail fetches per poll cycle. Prevents hammering the API
 * for companies with many short-metadata jobs. Most companies have < 20 open
 * jobs, so this cap is rarely hit.
 */
export const MAX_DETAIL_FETCHES = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface EnrichmentResult {
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
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Selectively enrich SmartRecruiters jobs by fetching the detail endpoint for
 * jobs where the Tier 1 pseudo-description is too short.
 *
 * This is a non-fatal enrichment — if a detail fetch fails, the job keeps its
 * Tier 1 data and is still inserted into the DB. The detail fetch is best-effort.
 *
 * @param jobs     Normalized jobs from the list endpoint
 * @param slug     SmartRecruiters company slug (for the detail URL)
 * @param fetchFn  Rate-limited fetch function (same as the list fetch)
 * @returns        Enrichment result with enriched/unchanged jobs and stats
 */
export async function enrichSmartRecruitersJobs(
  jobs: NormalizedJob[],
  slug: string,
  fetchFn: FetchFn,
): Promise<EnrichmentResult> {
  const enriched: NormalizedJob[] = [];
  const unchanged: NormalizedJob[] = [];
  let fetchesAttempted = 0;
  let fetchesSucceeded = 0;
  let fetchesFailed = 0;

  for (const job of jobs) {
    // Check if the Tier 1 pseudo-description is long enough
    const { fullText } = extractJobContent(
      "smartrecruiters",
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
      const detailUrlBuilder = ATS_ENDPOINTS.smartrecruiters.jobDetail;
      if (!detailUrlBuilder) {
        unchanged.push(job);
        continue;
      }
      const detailUrl = detailUrlBuilder(slug, job.externalJobId);
      const response = await fetchFn(detailUrl);
      if (!response.ok) {
        fetchesFailed++;
        unchanged.push(job);
        continue;
      }

      const detailJson: unknown = await response.json();
      const parsed = smartRecruitersJobDetailSchema.safeParse(detailJson);
      if (!parsed.success) {
        fetchesFailed++;
        unchanged.push(job);
        continue;
      }

      // Merge the detail data into the job's rawJson
      const mergedRawJson = mergeDetailIntoRawJson(job.rawJson, parsed.data);
      enriched.push({
        ...job,
        rawJson: mergedRawJson,
        // Update the URL if the detail response has an applyUrl
        url: parsed.data.applyUrl ?? job.url,
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
  };
}

// ── Internal ─────────────────────────────────────────────────────────────────

/**
 * Merge the detail response data into the job's rawJson string.
 * The detail response's `jobAd.sections` are merged into the list response's
 * JSON so the normalizer can extract the full description.
 */
function mergeDetailIntoRawJson(
  rawJsonStr: string,
  detail: z.infer<typeof smartRecruitersJobDetailSchema>,
): string {
  try {
    const original = JSON.parse(rawJsonStr) as Record<string, unknown>;
    // Merge jobAd from detail into the original
    if (detail.jobAd) {
      original.jobAd = detail.jobAd;
    }
    // Merge applyUrl if present
    if (detail.applyUrl) {
      original.applyUrl = detail.applyUrl;
    }
    return JSON.stringify(original);
  } catch {
    // If parsing fails, return the original rawJson unchanged
    return rawJsonStr;
  }
}
