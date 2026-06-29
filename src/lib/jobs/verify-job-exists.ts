// Verify Job Exists — G4 (TDD §1.6)
// src/lib/jobs/verify-job-exists.ts
//
// Fetches the ATS job list for a company and checks if the externalJobId is
// still present. If the ATS returns 404 (company left the ATS) or the job is
// not in the list, it's stale.
//
// This is the core verification logic used by the staleJobVerifier Inngest
// function. It's separated from the Inngest function for testability — the
// function is a thin wrapper that calls this module.
//
// See TDD §1.6 for the full specification.

import { type AtsSource, getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import { looksLikeValidAtsResponse } from "@/lib/jobs/seeders/resolve-custom-url";
import type { FetchFn } from "@/lib/jobs/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface VerifyJobExistsResult {
  exists: boolean;
  /** "exists" | "not_found" | "company_gone" | "error" */
  reason: "exists" | "not_found" | "company_gone" | "error";
  error?: string;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify that a job still exists at its ATS by fetching the company's job list
 * and checking if the externalJobId is present.
 *
 * Logic:
 *   1. Fetch the ATS job list for the company (atsSlug)
 *   2. If the ATS returns 404 → company_gone (company left the ATS)
 *   3. If the response is not valid ATS JSON → error
 *   4. Extract job IDs from the response and check if externalJobId is present
 *   5. If not present → not_found (job was closed/unpublished)
 *
 * @param atsSource       The ATS platform
 * @param atsSlug         The company's ATS slug
 * @param externalJobId   The job's external ID to verify
 * @param fetchFn         Injectable fetch (defaults to global fetch)
 */
export async function verifyJobExists(
  atsSource: AtsSource,
  atsSlug: string,
  externalJobId: string,
  fetchFn: FetchFn = fetch,
): Promise<VerifyJobExistsResult> {
  const endpoint = getAtsEndpoint(atsSource);
  const url = endpoint.jobsList(atsSlug);

  let response: Response;
  try {
    response = await fetchFn(url);
  } catch (e) {
    return {
      exists: false,
      reason: "error",
      error: String(e),
    };
  }

  // 404 → company left the ATS entirely
  if (response.status === 404) {
    return { exists: false, reason: "company_gone" };
  }

  // Other HTTP errors → don't mark as stale, just log
  if (!response.ok) {
    return {
      exists: false,
      reason: "error",
      error: `HTTP ${response.status}`,
    };
  }

  const text = await response.text();

  // Validate the response looks like a real ATS response
  if (!looksLikeValidAtsResponse(text, atsSource)) {
    return {
      exists: false,
      reason: "error",
      error: "Invalid ATS response format",
    };
  }

  // Extract job IDs from the response and check if our job is still there
  const jobIds = extractJobIds(text, atsSource);
  const exists = jobIds.includes(externalJobId);

  return {
    exists,
    reason: exists ? "exists" : "not_found",
  };
}

// ── Job ID extraction ────────────────────────────────────────────────────────

/**
 * Extract external job IDs from an ATS API response.
 *
 * Each ATS has a different response shape:
 *   Greenhouse: { jobs: [{ id, ... }] } — id is a number (stringified)
 *   Lever: [{ id, ... }] — id is a string
 *   Ashby: { jobs: [{ id, ... }] } — id is a string
 *   SmartRecruiters: { content: [{ id, ... }] } — id is a string
 *   Workable: [{ shortcode, ... }] — shortcode is the ID (not "id")
 *   Recruitee: { offers: [{ id, ... }] } — id is a number (stringified)
 *
 * @returns Array of stringified job IDs
 */
function extractJobIds(text: string, atsSource: AtsSource): string[] {
  try {
    const json: unknown = JSON.parse(text);

    switch (atsSource) {
      case "greenhouse": {
        const data = json as { jobs?: { id?: unknown }[] };
        return (data.jobs ?? [])
          .map((j) => String(j.id))
          .filter((id) => id !== "undefined" && id.length > 0);
      }
      case "lever": {
        const data = json as { id?: unknown }[];
        return data.map((j) => String(j.id)).filter((id) => id.length > 0);
      }
      case "ashby": {
        const data = json as { jobs?: { id?: unknown }[] };
        return (data.jobs ?? [])
          .map((j) => String(j.id))
          .filter((id) => id !== "undefined" && id.length > 0);
      }
      case "smartrecruiters": {
        const data = json as { content?: { id?: unknown }[] };
        return (data.content ?? [])
          .map((j) => String(j.id))
          .filter((id) => id.length > 0);
      }
      case "workable": {
        const data = json as { shortcode?: string; id?: string }[];
        // Workable uses shortcode as the primary ID, falling back to id
        return data
          .map((j) => j.shortcode ?? j.id ?? "")
          .filter((id) => id.length > 0);
      }
      case "recruitee": {
        const data = json as { offers?: { id?: unknown }[] };
        return (data.offers ?? [])
          .map((j) => String(j.id))
          .filter((id) => id !== "undefined" && id.length > 0);
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}
