// Quality Probe — Q1 (TDD §1.8)
// src/lib/jobs/seeders/quality-probe.ts
//
// When a company is first inserted (via Slugger or batch source), immediately
// poll its job list and count engineering-relevant jobs (jobs that pass Gate 0).
// Set the initial tier based on the count:
//   - 0 jobs → dormant (no engineering roles, don't waste polling budget)
//   - ≤2 jobs → dormant (low yield, poll infrequently)
//   - >2 jobs → active (healthy engineering hiring, poll frequently)
//
// This prevents companies with zero engineering jobs from entering the active
// polling queue, saving execution budget.
//
// See TDD §1.8 for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import { passesGateZero } from "@/lib/jobs/gate-zero";
import { looksLikeValidAtsResponse } from "@/lib/jobs/seeders/resolve-custom-url";
import type { FetchFn } from "@/lib/jobs/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type CompanyTier = "active_hot" | "active" | "dormant" | "dead";

export interface QualityProbeResult {
  /** Total jobs found at the ATS. */
  totalJobs: number;
  /** Jobs that passed Gate 0 (engineering-relevant titles). */
  gateZeroJobs: number;
  /** Initial tier assignment based on gateZeroJobs count. */
  initialTier: CompanyTier;
}

// ── Pure function: tier determination ────────────────────────────────────────

/**
 * Determine the initial company tier based on the number of engineering-relevant
 * jobs (Gate 0 passing) found at the ATS.
 *
 * Logic (TDD §1.8):
 *   - 0 jobs → dormant (no engineering roles)
 *   - ≤2 jobs → dormant (low yield)
 *   - >2 jobs → active (healthy engineering hiring)
 *
 * Note: "active_hot" is never assigned by the quality probe — it's only set
 * by the tier recalculation function when a company has approved matches in
 * the last 30 days. "dead" is only set by the poller after consecutive
 * failures. So the quality probe only assigns "dormant" or "active".
 *
 * @param gateZeroJobCount  Number of jobs that passed Gate 0
 * @returns                 Initial tier: "dormant" or "active"
 */
export function determineInitialTier(gateZeroJobCount: number): CompanyTier {
  if (gateZeroJobCount > 2) return "active";
  return "dormant";
}

// ── Job title extraction ─────────────────────────────────────────────────────

/**
 * Extract job titles from an ATS API response. Each ATS has a different
 * response shape — this function parses the JSON and extracts the title field.
 *
 * @returns Array of job titles (strings)
 */
function extractJobTitles(text: string, atsSource: AtsSource): string[] {
  try {
    const json: unknown = JSON.parse(text);

    switch (atsSource) {
      case "greenhouse": {
        const data = json as { jobs?: { title?: string }[] };
        return (data.jobs ?? [])
          .map((j) => j.title ?? "")
          .filter((t) => t.length > 0);
      }
      case "lever": {
        const data = json as { text?: string }[];
        return data.map((j) => j.text ?? "").filter((t) => t.length > 0);
      }
      case "ashby": {
        const data = json as { jobs?: { title?: string }[] };
        return (data.jobs ?? [])
          .map((j) => j.title ?? "")
          .filter((t) => t.length > 0);
      }
      case "smartrecruiters": {
        const data = json as { content?: { name?: string }[] };
        return (data.content ?? [])
          .map((j) => j.name ?? "")
          .filter((t) => t.length > 0);
      }
      case "workable": {
        const data = json as { title?: string }[];
        return data.map((j) => j.title ?? "").filter((t) => t.length > 0);
      }
      case "recruitee": {
        const data = json as { offers?: { title?: string }[] };
        return (data.offers ?? [])
          .map((j) => j.title ?? "")
          .filter((t) => t.length > 0);
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

// ── Main quality probe function ──────────────────────────────────────────────

/**
 * Fetch the ATS job list for a company and count how many jobs pass Gate 0
 * (engineering-relevant titles). Returns the count and initial tier assignment.
 *
 * This is called once at company insertion time to set the initial tier,
 * preventing companies with zero engineering jobs from entering the active
 * polling queue.
 *
 * @param atsSource  The ATS platform
 * @param atsSlug    The company's ATS slug
 * @param fetchFn    Injectable fetch (defaults to global fetch)
 * @returns          { totalJobs, gateZeroJobs, initialTier }
 */
export async function countGateZeroJobs(
  atsSource: AtsSource,
  atsSlug: string,
  fetchFn: FetchFn = fetch,
): Promise<QualityProbeResult> {
  const endpoint = getAtsEndpoint(atsSource);
  const url = endpoint.jobsList(atsSlug);

  let response: Response;
  try {
    response = await fetchFn(url);
  } catch {
    // Network error — default to dormant (safe choice)
    return { totalJobs: 0, gateZeroJobs: 0, initialTier: "dormant" };
  }

  // 404 or non-OK — company may have left the ATS
  if (!response.ok) {
    return { totalJobs: 0, gateZeroJobs: 0, initialTier: "dormant" };
  }

  const text = await response.text();

  // Validate the response looks like a real ATS response
  if (!looksLikeValidAtsResponse(text, atsSource)) {
    return { totalJobs: 0, gateZeroJobs: 0, initialTier: "dormant" };
  }

  // Extract job titles and count Gate 0 passing jobs
  const titles = extractJobTitles(text, atsSource);
  const gateZeroJobs = titles.filter((t) => passesGateZero(t)).length;

  return {
    totalJobs: titles.length,
    gateZeroJobs,
    initialTier: determineInitialTier(gateZeroJobs),
  };
}
