// Remotive Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/remotive.ts
//
// Fetches jobs from the Remotive API (https://remotive.com/api/remote-jobs) and
// transforms them into DirectIngestionJob objects. Remotive is a remote-first job
// board — every job is remote by definition, so remoteScope defaults to "global"
// unless candidate_required_location specifies country fencing.
//
// API: GET https://remotive.com/api/remote-jobs?limit=100
// Response: { "0-legal-notice": ..., "job-count": N, "total-job-count": N, jobs: [...] }
//
// Note: The API currently returns a small catalog (~28 jobs as of July 2026) but
// provides clean structured data (tags, category, job_type, publication_date).
//
// Each job: { id, url, title, company_name, category, tags[], job_type,
//             publication_date, candidate_required_location, salary (free text),
//             description (HTML) }

import type { DirectFetchResult, DirectIngestionJob } from "./types";

/** Remotive API top-level response shape (partial — only fields we use). */
interface RemotiveResponse {
  "job-count"?: number;
  "total-job-count"?: number;
  jobs?: RemotiveJob[];
}

interface RemotiveJob {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string; // ISO date
  candidate_required_location?: string;
  salary?: string; // Free text (e.g. "$50-$75 /hour") — not structured
  description?: string; // HTML
}

/**
 * Fetch and normalize jobs from the Remotive API.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchRemotiveJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const response = await fetchFn(
      "https://remotive.com/api/remote-jobs?limit=100",
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `Remotive API HTTP ${response.status} ${response.statusText}`,
        totalAvailable: 0,
      };
    }

    const data = (await response.json()) as RemotiveResponse;
    const rawJobs = data.jobs ?? [];
    const totalAvailable = data["job-count"] ?? rawJobs.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const rj of rawJobs) {
      const tags = (rj.tags ?? []).map((t) => t.toLowerCase());
      const title = rj.title ?? "";
      const description = stripHtml(rj.description ?? "");

      // Apply persona tech filter
      if (!techFilter({ tags, title, description })) {
        continue;
      }

      const job: DirectIngestionJob = {
        externalJobId: String(rj.id ?? ""),
        title,
        companyName: rj.company_name ?? null,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: rj.url ?? null,
        locationName: rj.candidate_required_location ?? null,
        workplaceType: "remote", // Remotive is remote-first
        employmentType: normalizeEmploymentType(rj.job_type),
        // If candidate_required_location names specific countries, treat as
        // country-fenced; otherwise global.
        remoteScope: inferRemoteScope(rj.candidate_required_location),
        // Remotive salary is free text, not structured — leave null.
        compensationMin: null,
        compensationMax: null,
        compensationCurrency: null,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: rj.publication_date
          ? safeParseDate(rj.publication_date)
          : null,
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
 * Infer remote scope from the candidate_required_location string.
 * Empty/World/Anywhere → global; specific countries → country_fenced.
 */
function inferRemoteScope(
  location: string | undefined,
): "global" | "country_fenced" {
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

/** Normalize Remotive's job_type (e.g. "full_time", "contract") to our enum. */
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

/**
 * Strip HTML tags from a string, preserving text content.
 * Remotive descriptions contain HTML.
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
