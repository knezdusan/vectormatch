// ATS Adapters — Fetch + Validate + Normalize
// src/lib/jobs/poller/ats-adapters.ts
//
// Each ATS platform has a different API shape. This module provides a unified
// interface: `fetchJobsFromAts(source, slug, fetchFn)` returns a normalized
// array of `NormalizedJob` objects regardless of the underlying ATS.
//
// ── Normalization ────────────────────────────────────────────────────────────
// The three ATS APIs have different field names for the same concept:
//   - Job title: Greenhouse "title", Lever "text", Ashby "title"
//   - Job ID:    Greenhouse numeric "id", Lever string "id", Ashby string "id"
//   - URL:       Greenhouse "absolute_url", Lever "hostedUrl", Ashby "jobUrl"
//
// We normalize these to a common shape before they reach the job table.
//
// ── Error handling (TDD §4.2.3) ──────────────────────────────────────────────
// All ATS responses are validated with `safeParse()`. On validation failure:
//   1. Return an error result (not throw)
//   2. The caller marks the company as `health = "degraded"`
//   3. The pipeline continues to the next company
//
// See TDD §4.2 (ATS endpoint registry) and §4.4 (Phalanx Poller).

import type { z } from "zod";
import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import {
  type ashbyJobSchema,
  ashbyJobsResponseSchema,
  greenhouseJobsResponseSchema,
  leverJobsResponseSchema,
  recruiteeJobsResponseSchema,
  smartRecruitersJobsResponseSchema,
  workableJobsResponseSchema,
} from "@/lib/jobs/ats-schemas";
import {
  extractJobMetadata,
  type JobMetadata,
} from "@/lib/jobs/job-normalizer";
import type { FetchFn } from "@/lib/jobs/types";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { getLimiter } from "./rate-limiter";

// ── Types ────────────────────────────────────────────────────────────────────

/** A job normalized from any ATS API response to a common shape. */
export interface NormalizedJob {
  /** The ATS's internal job ID (as a string for uniformity). */
  externalJobId: string;
  /** Job title (normalized from Greenhouse "title", Lever "text", Ashby "title"). */
  title: string;
  /** The full raw JSON string of the job (for the `rawJson` column). */
  rawJson: string;
  /** The hosted job URL (for the admin dashboard link-out). */
  url?: string;
  /** Standardized metadata extracted from rawJson (workplace type, location, etc.). */
  metadata: JobMetadata;
}

/** Result of fetching jobs from an ATS API. */
export type AtsFetchResult =
  | { success: true; jobs: NormalizedJob[] }
  | { success: false; error: string; kind: "validation" | "http" | "network" };

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch and normalize jobs from an ATS API. Handles rate limiting via the
 * per-ATS bottleneck limiter, Zod validation, and normalization to the
 * common `NormalizedJob` shape.
 *
 * @param source   The ATS platform ("greenhouse", "lever", "ashby")
 * @param slug     The company's ATS slug
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 */
export async function fetchJobsFromAts(
  source: AtsSource,
  slug: string,
  fetchFn: FetchFn = fetch,
): Promise<AtsFetchResult> {
  const endpoint = getAtsEndpoint(source);
  const url = endpoint.jobsList(slug);
  const limiter = getLimiter(source);

  try {
    // Rate-limit the request via bottleneck (2 req/s per ATS platform).
    // Sprint 7 healthcheck: wrapped in fetchWithTimeout — a single hanging
    // ATS endpoint must not stall the entire batchPollTier sequential loop.
    const response = await limiter.schedule(() =>
      fetchWithTimeout(fetchFn, url),
    );

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status} ${response.statusText}`,
        kind: "http",
      };
    }

    const json: unknown = await response.json();

    // Validate + normalize per ATS platform.
    switch (source) {
      case "greenhouse":
        return normalizeGreenhouse(json);
      case "lever":
        return normalizeLever(json);
      case "ashby":
        return normalizeAshby(json);
      case "smartrecruiters":
        return normalizeSmartRecruiters(json);
      case "workable":
        return normalizeWorkable(json);
      case "recruitee":
        return normalizeRecruitee(json);
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      kind: "network",
    };
  }
}

// ── Per-ATS normalization ────────────────────────────────────────────────────

function normalizeGreenhouse(json: unknown): AtsFetchResult {
  const parsed = greenhouseJobsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: `Greenhouse Zod validation failed: ${parsed.error.message}`,
      kind: "validation",
    };
  }

  // Use the original JSON for rawJson to preserve all fields (the Zod schema
  // strips unknown fields from parsed.data). We zip the parsed data (for
  // typed field access) with the original array (for the full raw payload).
  const rawJobs = (json as { jobs: unknown[] }).jobs;
  const jobs: NormalizedJob[] = parsed.data.jobs.map((job, i) => {
    const rawJsonStr = JSON.stringify(rawJobs[i]);
    return {
      externalJobId: String(job.id),
      title: job.title,
      rawJson: rawJsonStr,
      url: job.absolute_url,
      metadata: extractJobMetadata("greenhouse", rawJsonStr),
    };
  });

  return { success: true, jobs };
}

function normalizeLever(json: unknown): AtsFetchResult {
  const parsed = leverJobsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: `Lever Zod validation failed: ${parsed.error.message}`,
      kind: "validation",
    };
  }

  // Use the original JSON array for rawJson (preserves all fields).
  const rawJobs = json as unknown[];
  const jobs: NormalizedJob[] = parsed.data.map((job, i) => {
    const rawJsonStr = JSON.stringify(rawJobs[i]);
    return {
      externalJobId: job.id,
      title: job.text, // Lever calls the title "text"
      rawJson: rawJsonStr,
      url: job.hostedUrl,
      metadata: extractJobMetadata("lever", rawJsonStr),
    };
  });

  return { success: true, jobs };
}

function normalizeAshby(json: unknown): AtsFetchResult {
  const parsed = ashbyJobsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: `Ashby Zod validation failed: ${parsed.error.message}`,
      kind: "validation",
    };
  }

  // Ashby exposes the same underlying role as multiple public postings when
  // it is open in several locations (e.g. Ontario remote, Warsaw hybrid,
  // San Francisco remote). The postings share a long identical description
  // prefix and differ only in location metadata. Without deduplication the
  // dashboard shows what users perceive as duplicate cards for the same
  // opportunity. We keep one representative posting per "role family" and
  // prefer the broadest location scope.
  const rawJobs = (json as { jobs: unknown[] }).jobs;
  const deduped = deduplicateAshbyJobs(parsed.data.jobs);

  const jobs: NormalizedJob[] = deduped.map((job) => {
    const rawIndex = parsed.data.jobs.findIndex((j) => j.id === job.id);
    const rawJsonStr = JSON.stringify(rawJobs[rawIndex]);
    return {
      externalJobId: job.id,
      title: job.title,
      rawJson: rawJsonStr,
      url: job.jobUrl,
      metadata: extractJobMetadata("ashby", rawJsonStr),
    };
  });

  return { success: true, jobs };
}

// ── Ashby multi-location deduplication ─────────────────────────────────────

type AshbyJob = z.infer<typeof ashbyJobSchema>;

/** Number of normalized description characters to use for the dedup signature. */
const ASHBY_DEDUP_PREFIX_LEN = 2000;

/**
 * Collapse Ashby multi-location postings of the same role into a single
 * representative job. Ashby creates separate public postings per location for
 * the same underlying requisition; the postings share a long identical
 * description prefix and differ only in location metadata. Keeping them all
 * produces duplicate-looking cards in the dashboard.
 *
 * Process:
 *   1. Drop postings where isListed === false (unlisted/archived).
 *   2. Group by (title, department, description prefix).
 *   3. Within each group keep the posting with the broadest location scope
 *      (remote preferred, more secondary locations preferred, then most recent).
 */
function deduplicateAshbyJobs(jobs: AshbyJob[]): AshbyJob[] {
  const listed = jobs.filter((job) => job.isListed !== false);

  const groups = new Map<string, AshbyJob[]>();
  for (const job of listed) {
    const signature = ashbyContentSignature(job);
    const bucket = groups.get(signature) ?? [];
    bucket.push(job);
    groups.set(signature, bucket);
  }

  const result: AshbyJob[] = [];
  for (const bucket of groups.values()) {
    result.push(selectBestAshbyJob(bucket));
  }
  return result;
}

/**
 * Build a content signature that is stable across location variants of the
 * same Ashby role. Uses the job title + department + the first N normalized
 * characters of the description. The prefix length is long enough to span
 * Ashby's company boilerplate and role overview, which are identical across
 * multi-location postings.
 */
function ashbyContentSignature(job: AshbyJob): string {
  const description = normalizeAshbyDescription(job);
  const prefix = description.slice(0, ASHBY_DEDUP_PREFIX_LEN);
  return `${job.title}|${job.department ?? ""}|${job.team ?? ""}|${prefix}`;
}

/** Normalize an Ashby description for comparison: strip HTML and collapse whitespace. */
function normalizeAshbyDescription(job: AshbyJob): string {
  const plain =
    typeof job.descriptionPlain === "string" && job.descriptionPlain.length > 0
      ? job.descriptionPlain
      : null;
  const html =
    typeof job.descriptionHtml === "string" && job.descriptionHtml.length > 0
      ? job.descriptionHtml
      : "";
  const raw = plain ?? html;
  const text = plain ? raw : raw.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

/** Pick the single best posting from a group of near-duplicate Ashby jobs. */
function selectBestAshbyJob(jobs: AshbyJob[]): AshbyJob {
  return jobs.reduce((best, current) => {
    const scoreDiff = ashbyJobScore(current) - ashbyJobScore(best);
    if (scoreDiff > 0) return current;
    if (scoreDiff < 0) return best;

    // Tie-break by most recent publishedAt.
    const currentDate = current.publishedAt
      ? new Date(current.publishedAt).getTime()
      : 0;
    const bestDate = best.publishedAt
      ? new Date(best.publishedAt).getTime()
      : 0;
    return currentDate >= bestDate ? current : best;
  });
}

/**
 * Score an Ashby posting for "representativeness". Higher is better.
 *   - Remote postings score higher than hybrid/on-site.
 *   - Postings with more secondary locations score higher (broader scope).
 */
function ashbyJobScore(job: AshbyJob): number {
  let score = 0;
  const workplaceType = job.workplaceType?.toLowerCase();
  const isRemoteFlag =
    job.isRemote === true ||
    (typeof job.isRemote === "string" && job.isRemote.toLowerCase() === "true");

  if (workplaceType === "remote" || isRemoteFlag) {
    score += 100;
  } else if (workplaceType === "hybrid") {
    score += 50;
  }

  if (Array.isArray(job.secondaryLocations)) {
    score += job.secondaryLocations.length * 10;
  }

  return score;
}

// ── SmartRecruiters (F2) ─────────────────────────────────────────────────────

function normalizeSmartRecruiters(json: unknown): AtsFetchResult {
  const parsed = smartRecruitersJobsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: `SmartRecruiters Zod validation failed: ${parsed.error.message}`,
      kind: "validation",
    };
  }

  // SmartRecruiters response: { content: [Posting, ...] }
  const rawJobs = (json as { content: unknown[] }).content;
  const jobs: NormalizedJob[] = parsed.data.content.map((job, i) => {
    const rawJsonStr = JSON.stringify(rawJobs[i]);
    return {
      externalJobId: job.id,
      title: job.name, // SmartRecruiters calls the title "name"
      rawJson: rawJsonStr,
      // The list endpoint doesn't include postingUrl — it's in the detail endpoint.
      // The hosted URL can be constructed from the company identifier + job id.
      url: undefined,
      metadata: extractJobMetadata("smartrecruiters", rawJsonStr),
    };
  });

  return { success: true, jobs };
}

// ── Workable (F2) ────────────────────────────────────────────────────────────

function normalizeWorkable(json: unknown): AtsFetchResult {
  const parsed = workableJobsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: `Workable Zod validation failed: ${parsed.error.message}`,
      kind: "validation",
    };
  }

  // Workable widget API returns a bare array (like Lever v0)
  const rawJobs = json as unknown[];
  const jobs: NormalizedJob[] = parsed.data.map((job, i) => {
    const rawJsonStr = JSON.stringify(rawJobs[i]);
    return {
      externalJobId: job.shortcode ?? job.id ?? "",
      title: job.title,
      rawJson: rawJsonStr,
      url: job.url,
      metadata: extractJobMetadata("workable", rawJsonStr),
    };
  });

  return { success: true, jobs };
}

// ── Recruitee (F2) ───────────────────────────────────────────────────────────

function normalizeRecruitee(json: unknown): AtsFetchResult {
  const parsed = recruiteeJobsResponseSchema.safeParse(json);
  if (!parsed.success) {
    return {
      success: false,
      error: `Recruitee Zod validation failed: ${parsed.error.message}`,
      kind: "validation",
    };
  }

  // Recruitee response: { offers: [...] }
  const rawJobs = (json as { offers: unknown[] }).offers;
  const jobs: NormalizedJob[] = parsed.data.offers.map((job, i) => {
    const rawJsonStr = JSON.stringify(rawJobs[i]);
    return {
      externalJobId: String(job.id),
      title: job.title,
      rawJson: rawJsonStr,
      url: job.careers_url,
      metadata: extractJobMetadata("recruitee", rawJsonStr),
    };
  });

  return { success: true, jobs };
}
