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

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import {
  ashbyJobsResponseSchema,
  greenhouseJobsResponseSchema,
  leverJobsResponseSchema,
} from "@/lib/jobs/ats-schemas";
import {
  extractJobMetadata,
  type JobMetadata,
} from "@/lib/jobs/job-normalizer";
import type { FetchFn } from "@/lib/jobs/types";
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
    const response = await limiter.schedule(() => fetchFn(url));

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

  // Ashby schema uses .passthrough() so parsed.data preserves extra fields,
  // but we use the original JSON for consistency with Greenhouse/Lever.
  const rawJobs = (json as { jobs: unknown[] }).jobs;
  const jobs: NormalizedJob[] = parsed.data.jobs.map((job, i) => {
    const rawJsonStr = JSON.stringify(rawJobs[i]);
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
