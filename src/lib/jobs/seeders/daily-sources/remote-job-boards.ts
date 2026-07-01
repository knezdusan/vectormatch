// D4: Remote OK + Remotive + Himalayas Seeder (TDD §2.4)
// src/lib/jobs/seeders/daily-sources/remote-job-boards.ts
//
// Daily sweep of three remote job board APIs for company names. Unlike URL-based
// seeders (HN Algolia, BigQuery), these boards expose company names directly in
// their job listings — no ATS URL extraction needed. Each company name is run
// through the Slugger for ATS resolution.
//
// ── APIs ──────────────────────────────────────────────────────────────────────
// Remote OK:  GET https://remoteok.com/api        → [{ company, ... }, ...]
//   NOTE: The first element is a metadata object (not a job) — skip index 0.
// Remotive:   GET https://remotive.com/api/remotejobs → { jobs: [{ company_name, ... }] }
// Himalayas:  GET https://himalayas.app/jobs/api  → [{ company, ... }, ...]
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch from all three APIs
// 2. Extract company names from job listings
// 3. Deduplicate company names (case-insensitive)
// 4. Run each through the Slugger (resolveSlugger) with insertCompany: true
// 5. Fire `job/aggregator-ingested` events for G3 job-level ingestion
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 50-200 companies/day (remote boards list hundreds of active job postings).
//
// See TDD §2.4 (D4) for the full specification.

import { inngest } from "@/inngest/client";
import { deduplicateCompanyNames } from "@/lib/jobs/seeders/seeder-utils";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * The three remote job board APIs we sweep daily.
 * Each board exposes company names directly in its job listings.
 */
export const REMOTE_JOB_BOARDS: { name: string; url: string }[] = [
  { name: "remoteok", url: "https://remoteok.com/api" },
  { name: "remotive", url: "https://remotive.com/api/remotejobs" },
  { name: "himalayas", url: "https://himalayas.app/jobs/api" },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface RemoteJobBoardsResult {
  /** Total jobs fetched across all three boards. */
  totalJobs: number;
  /** Unique company names extracted (after dedup). */
  uniqueCompanies: number;
  /** Companies successfully resolved to an ATS slug. */
  resolved: number;
  /** Companies that could not be resolved (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: extract company names from Remote OK API response ──────────

/**
 * Extract company names from a Remote OK API response.
 *
 * The Remote OK API returns an array of job objects with a `company` field.
 * The first element (index 0) is a metadata object, not a job — it is skipped.
 *
 * @param data  The parsed JSON response from https://remoteok.com/api
 * @returns     Array of company name strings (may contain duplicates)
 */
export function extractCompanyNamesFromRemoteOk(data: unknown): string[] {
  if (!Array.isArray(data)) return [];

  const names: string[] = [];
  // Skip index 0 — Remote OK's first element is a metadata object, not a job.
  for (let i = 1; i < data.length; i++) {
    const job = data[i];
    if (job && typeof job === "object" && "company" in job) {
      const company = (job as Record<string, unknown>).company;
      if (typeof company === "string") {
        names.push(company);
      }
    }
  }

  return names;
}

// ── Pure function: extract company names from Remotive API response ──────────

/**
 * Extract company names from a Remotive API response.
 *
 * The Remotive API returns `{ jobs: [{ company_name, ... }] }`.
 *
 * @param data  The parsed JSON response from https://remotive.com/api/remotejobs
 * @returns     Array of company name strings (may contain duplicates)
 */
export function extractCompanyNamesFromRemotive(data: unknown): string[] {
  if (!data || typeof data !== "object") return [];

  const jobs = (data as Record<string, unknown>).jobs;
  if (!Array.isArray(jobs)) return [];

  const names: string[] = [];
  for (const job of jobs) {
    if (job && typeof job === "object" && "company_name" in job) {
      const companyName = (job as Record<string, unknown>).company_name;
      if (typeof companyName === "string") {
        names.push(companyName);
      }
    }
  }

  return names;
}

// ── Pure function: extract company names from Himalayas API response ──────────

/**
 * Extract company names from a Himalayas API response.
 *
 * The Himalayas API returns an array of job objects with a `company` field.
 *
 * @param data  The parsed JSON response from https://himalayas.app/jobs/api
 * @returns     Array of company name strings (may contain duplicates)
 */
export function extractCompanyNamesFromHimalayas(data: unknown): string[] {
  if (!Array.isArray(data)) return [];

  const names: string[] = [];
  for (const job of data) {
    if (job && typeof job === "object" && "company" in job) {
      const company = (job as Record<string, unknown>).company;
      if (typeof company === "string") {
        names.push(company);
      }
    }
  }

  return names;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Remote OK + Remotive + Himalayas daily seeder. Fetches job listings
 * from all three remote job board APIs, extracts company names, deduplicates
 * them, and runs each through the Slugger for ATS resolution.
 *
 * For each successfully resolved company, a `job/aggregator-ingested` event is
 * fired for G3 job-level ingestion. Individual board failures do not stop the
 * seeder — the remaining boards are still processed.
 *
 * @param fetchFn  Injectable fetch function (defaults to global fetch)
 * @returns        Result with counts and any critical error
 */
export async function runRemoteJobBoardsSeeder(
  fetchFn: FetchFn = fetch,
): Promise<RemoteJobBoardsResult> {
  let totalJobs = 0;
  const allCompanyNames: string[] = [];
  // Track company name (lowercase) → first board it was seen on (for
  // discoveryContext). The first board to mention a company "owns" it.
  const companyToBoard = new Map<string, string>();

  try {
    for (const board of REMOTE_JOB_BOARDS) {
      try {
        const response = await fetchFn(board.url);
        if (!response.ok) {
          // Individual board failure — continue to next board
          continue;
        }

        const json: unknown = await response.json();

        let companyNames: string[] = [];
        let jobCount = 0;

        if (board.name === "remoteok") {
          companyNames = extractCompanyNamesFromRemoteOk(json);
          // Remote OK: skip index 0 (metadata), so job count is length - 1
          jobCount = Array.isArray(json) ? Math.max(json.length - 1, 0) : 0;
        } else if (board.name === "remotive") {
          companyNames = extractCompanyNamesFromRemotive(json);
          const jobs =
            json && typeof json === "object"
              ? (json as Record<string, unknown>).jobs
              : null;
          jobCount = Array.isArray(jobs) ? jobs.length : 0;
        } else if (board.name === "himalayas") {
          companyNames = extractCompanyNamesFromHimalayas(json);
          jobCount = Array.isArray(json) ? json.length : 0;
        }

        totalJobs += jobCount;
        allCompanyNames.push(...companyNames);
        for (const name of companyNames) {
          const key = name.trim().toLowerCase();
          if (key.length === 0) continue;
          // Preserve the first board that mentioned this company
          if (!companyToBoard.has(key)) {
            companyToBoard.set(key, board.name);
          }
        }
      } catch {
        // Individual board failure (network error, parse error, etc.)
        // — continue to next board
      }
    }

    // Deduplicate company names (case-insensitive, preserves first-seen casing)
    const uniqueCompanies = deduplicateCompanyNames(allCompanyNames);

    let resolved = 0;
    let unresolved = 0;

    for (const companyName of uniqueCompanies) {
      const boardName =
        companyToBoard.get(companyName.toLowerCase()) ?? "unknown";
      try {
        const result: SluggerResult = await resolveSlugger(
          {
            companyName,
            discoverySource: "hn_algolia",
            discoveryContext: `remote-board:${boardName} company:${companyName}`,
          },
          {
            fetchFn,
            insertCompany: true,
          },
        );

        if (result.success) {
          resolved++;

          // Fire job/aggregator-ingested event for G3 job-level ingestion
          await inngest.send({
            name: "job/aggregator-ingested",
            data: {
              source: boardName,
              externalJobId: `remote-board:${companyName}`,
              company: companyName,
              title: companyName,
              description: "",
            },
          });
        } else {
          unresolved++;
        }
      } catch {
        // Slugger failure for a single company — continue to next
        unresolved++;
      }
    }

    return {
      totalJobs,
      uniqueCompanies: uniqueCompanies.length,
      resolved,
      unresolved,
    };
  } catch (error) {
    return {
      totalJobs,
      uniqueCompanies: 0,
      resolved: 0,
      unresolved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
