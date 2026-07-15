// Fingerprint v3 — Addressable-Global Yield Ranking
// src/lib/jobs/seeders/fingerprint-v3.ts
//
// Extends Fingerprint v2 with remote-scope classification. The probe already
// fetches each company's job feed — v3 runs the deterministic remote-scope
// pre-pass over the web-dev roles to estimate the company's genuine-global
// rate. No new fetches, negligible compute.
//
// ── What changed from v2 ─────────────────────────────────────────────────────
// v2 gates on absolute web-dev count (≥2). v3 ADDS:
//   - Per-job location + workplaceType extraction from the ATS feed
//   - Deterministic remote-scope classification (global / country_fenced / onsite)
//   - Ranking by estimated addressable-global yield = (global web-dev jobs)
//   - Stripe/Coinbase (country-fenced, LinkedIn-saturated) collapse to ~0
//   - Truelogic/Alan/ClickUp (genuinely global) rank high
//
// ── Remote-scope classification (deterministic only, no LLM) ─────────────────
// Reuses the logic from remote-scope-extractor.ts Step 1:
//   1. ATS-native workplaceType (Lever/Ashby): on-site/hybrid → onsite
//   2. Location-based: "Remote - US" → country_fenced, "Worldwide" → global
//   3. Multi-continent locations → global
//   4. Specific city + null workplaceType → onsite
//   5. "Remote" with no country → undetermined (counted as potentially global)
//
// See Advisor Directive 05 §Catch 1 for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import { looksLikeValidAtsResponse } from "@/lib/jobs/seeders/resolve-custom-url";
import {
  isWebDevTitle,
  matchWebDevTitle,
  MIN_WEBDEV_ROLES,
} from "@/lib/jobs/seeders/fingerprint-v2";
import type { FetchFn } from "@/lib/jobs/types";
import {
  extractLocationCountry,
  isSpecificLocation,
  REMOTE_LOCATION_INDICATORS,
} from "@/lib/jobs/location-utils";

// ── Types ────────────────────────────────────────────────────────────────────

export type RemoteScope = "global" | "country_fenced" | "onsite" | "undetermined";

export interface JobWithScope {
  title: string;
  location: string | null;
  workplaceType: "remote" | "hybrid" | "on-site" | null;
  remoteScope: RemoteScope;
  isWebDev: boolean;
  matchBasis: string[];
}

export interface StackProfileV3Result {
  /** Total jobs found at the ATS. */
  totalJobs: number;
  /** Jobs with web-dev titles. */
  webDevJobs: number;
  /** Web-dev jobs classified as genuinely global. */
  globalWebDevJobs: number;
  /** Web-dev jobs classified as country-fenced. */
  fencedWebDevJobs: number;
  /** Web-dev jobs classified as onsite. */
  onsiteWebDevJobs: number;
  /** Web-dev jobs with undetermined scope (potentially global). */
  undeterminedWebDevJobs: number;
  /** Estimated addressable-global yield = global + 0.5 × undetermined. */
  addressableYield: number;
  /** Fraction of web-dev jobs that are global. Ranking key. */
  globalFraction: number;
  /** Whether the company passes the absolute gate (≥2 web-dev). */
  passed: boolean;
  /** Reason for pass/fail. */
  reason: string;
  /** All jobs with scope classification. */
  jobs: JobWithScope[];
  /** Web-dev jobs with scope classification. */
  webDevJobsWithScope: JobWithScope[];
}

// ── Remote-scope classification (deterministic, no LLM) ──────────────────────

/**
 * Macro-region groups for multi-continent detection.
 * A location listing ≥3 disjoint macro-regions → global.
 */
const MACRO_REGION_GROUPS: string[][] = [
  ["americas", "north america", "south america", "latam", "latin america"],
  ["europe", "european", "emea"],
  ["asia", "apac", "asia-pacific"],
  ["africa"],
  ["middle east"],
  ["oceania", "australasia"],
];

/**
 * Classify a job's remote scope using the deterministic pre-pass.
 *
 * This is a simplified version of extractRemoteScope's Step 1, optimized for
 * the ranking estimate. It uses only workplaceType + location (no JD text).
 *
 * @param workplaceType  ATS-native workplace type
 * @param location       Job location string from the ATS
 * @param atsSource      The ATS platform (affects trust path)
 * @returns              Remote scope classification
 */
export function classifyRemoteScope(
  workplaceType: "remote" | "hybrid" | "on-site" | null,
  location: string | null,
  atsSource: string,
): RemoteScope {
  // Step 1a: ATS-native trust path (Lever/Ashby only — Greenhouse has no
  // structured workplaceType, ~85% miss rate).
  if (atsSource !== "greenhouse") {
    if (workplaceType === "on-site" || workplaceType === "hybrid") {
      return "onsite";
    }
  }

  // Step 1e: Location-based check (runs for remote or null workplaceType).
  if (location) {
    const lowerLoc = location.toLowerCase();

    // Check for remote indicator in location
    const hasRemoteIndicator = REMOTE_LOCATION_INDICATORS.some((ind) =>
      lowerLoc.includes(ind),
    );

    // Multi-continent location → global (≥3 disjoint macro-regions)
    const macroRegionHits = MACRO_REGION_GROUPS.filter((aliases) =>
      aliases.some((alias) => {
        const re = new RegExp(
          `(^|[^a-z])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z])`,
        );
        return re.test(lowerLoc);
      }),
    );
    if (macroRegionHits.length >= 3) {
      return "global";
    }

    // Explicit global indicators in location
    if (
      lowerLoc.includes("worldwide") ||
      lowerLoc.includes("anywhere") ||
      lowerLoc.includes("global") ||
      lowerLoc.includes("remote - world") ||
      lowerLoc.includes("remote (world")
    ) {
      return "global";
    }

    // Remote + country name → country_fenced
    if (hasRemoteIndicator) {
      const locationCountry = extractLocationCountry(location);
      if (locationCountry !== null) {
        return "country_fenced";
      }
    }

    // Specific city + null workplaceType → onsite (Rule 6)
    if (workplaceType === null && isSpecificLocation(location)) {
      return "onsite";
    }

    // "Remote" with no country → undetermined (potentially global)
    if (hasRemoteIndicator && workplaceType === null) {
      return "undetermined";
    }
  }

  // workplaceType = "remote" with no location → undetermined (potentially global)
  if (workplaceType === "remote") {
    return "undetermined";
  }

  // Null workplaceType + null location → undetermined
  return "undetermined";
}

// ── Job detail extraction (title + location + workplaceType) ─────────────────

interface RawJobDetail {
  title: string;
  location: string | null;
  workplaceType: "remote" | "hybrid" | "on-site" | null;
}

/**
 * Extract job details (title, location, workplaceType) from an ATS job list
 * response. This extends Fingerprint v2's extractJobTitles to also pull
 * location and workplaceType fields.
 */
function extractJobDetails(
  text: string,
  atsSource: AtsSource,
): RawJobDetail[] {
  try {
    const json: unknown = JSON.parse(text);

    switch (atsSource) {
      case "greenhouse": {
        const data = json as {
          jobs?: {
            title?: string;
            location?: { name?: string };
          }[];
        };
        return (data.jobs ?? [])
          .filter((j) => j.title && j.title.length > 0)
          .map((j) => ({
            title: j.title ?? "",
            location: j.location?.name ?? null,
            // Greenhouse has no structured workplaceType
            workplaceType: null,
          }));
      }
      case "lever": {
        const data = json as {
          text?: string;
          categories?: { location?: string; commitment?: string };
          workplaceType?: string;
        }[];
        return data
          .filter((j) => j.text && j.text.length > 0)
          .map((j) => ({
            title: j.text ?? "",
            location: j.categories?.location ?? null,
            workplaceType: normalizeWorkplaceType(j.workplaceType),
          }));
      }
      case "ashby": {
        const data = json as {
          jobs?: {
            title?: string;
            location?: string;
            workplaceType?: string;
            isRemote?: boolean | string;
          }[];
        };
        return (data.jobs ?? [])
          .filter((j) => j.title && j.title.length > 0)
          .map((j) => ({
            title: j.title ?? "",
            location: j.location ?? null,
            workplaceType: normalizeWorkplaceType(
              j.workplaceType,
              typeof j.isRemote === "boolean"
                ? j.isRemote
                : typeof j.isRemote === "string"
                  ? j.isRemote.toLowerCase() === "true"
                  : undefined,
            ),
          }));
      }
      case "smartrecruiters": {
        const data = json as {
          content?: {
            name?: string;
            location?: { city?: string; country?: string; region?: string };
          }[];
        };
        return (data.content ?? [])
          .filter((j) => j.name && j.name.length > 0)
          .map((j) => {
            const parts = [
              j.location?.city,
              j.location?.region,
              j.location?.country,
            ].filter((p) => p && p.length > 0);
            return {
              title: j.name ?? "",
              location: parts.join(", ") || null,
              workplaceType: null as "remote" | "hybrid" | "on-site" | null,
            };
          });
      }
      case "workable": {
        const data = json as {
          title?: string;
          location?: string;
          workplace_type?: string;
        }[];
        return data
          .filter((j) => j.title && j.title.length > 0)
          .map((j) => ({
            title: j.title ?? "",
            location: j.location ?? null,
            workplaceType: normalizeWorkplaceType(j.workplace_type),
          }));
      }
      case "recruitee": {
        const data = json as {
          offers?: {
            title?: string;
            location?: string;
            remote?: boolean;
          }[];
        };
        return (data.offers ?? [])
          .filter((j) => j.title && j.title.length > 0)
          .map((j) => ({
            title: j.title ?? "",
            location: j.location ?? null,
            workplaceType: j.remote
              ? ("remote" as const)
              : (null as "remote" | "hybrid" | "on-site" | null),
          }));
      }
      default:
        return [];
    }
  } catch {
    return [];
  }
}

/**
 * Normalize workplace type from various ATS formats.
 */
function normalizeWorkplaceType(
  raw: string | undefined,
  isRemote?: boolean,
): "remote" | "hybrid" | "on-site" | null {
  if (isRemote === true) return "remote";
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "remote" || lower === "fully remote") return "remote";
  if (lower === "hybrid") return "hybrid";
  if (lower === "on-site" || lower === "onsite" || lower === "on_site")
    return "on-site";
  return null;
}

// ── Main v3 probe ────────────────────────────────────────────────────────────

/**
 * Fetch the ATS job list for a company and evaluate the Fingerprint v3
 * addressable-global yield gate.
 *
 * This extends v2 by:
 *   1. Extracting location + workplaceType from each job
 *   2. Classifying each web-dev job's remote scope (deterministic)
 *   3. Counting genuinely-global web-dev jobs
 *   4. Ranking by estimated addressable-global yield
 *
 * @param atsSource    The ATS platform
 * @param atsSlug      The company's ATS slug
 * @param fetchFn      Injectable fetch (defaults to global fetch)
 * @returns            V3 stack profile with addressable-global yield
 */
export async function probeStackProfileV3(
  atsSource: AtsSource,
  atsSlug: string,
  fetchFn: FetchFn = fetch,
): Promise<StackProfileV3Result> {
  const endpoint = getAtsEndpoint(atsSource);
  const url = endpoint.jobsList(atsSlug);

  let response: Response;
  try {
    response = await fetchFn(url, {
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return emptyResult("network_error");
  }

  if (!response.ok) {
    return emptyResult(`http_${response.status}`);
  }

  const text = await response.text();

  if (!looksLikeValidAtsResponse(text, atsSource)) {
    return emptyResult("invalid_ats_response");
  }

  const rawJobs = extractJobDetails(text, atsSource);
  const totalJobs = rawJobs.length;

  // Classify each job
  const jobs: JobWithScope[] = rawJobs.map((j) => {
    const isWeb = isWebDevTitle(j.title);
    const scope = classifyRemoteScope(j.workplaceType, j.location, atsSource);
    return {
      title: j.title,
      location: j.location,
      workplaceType: j.workplaceType,
      remoteScope: scope,
      isWebDev: isWeb,
      matchBasis: isWeb ? matchWebDevTitle(j.title) : [],
    };
  });

  const webDevJobsWithScope = jobs.filter((j) => j.isWebDev);
  const webDevJobs = webDevJobsWithScope.length;

  const globalWebDevJobs = webDevJobsWithScope.filter(
    (j) => j.remoteScope === "global",
  ).length;
  const fencedWebDevJobs = webDevJobsWithScope.filter(
    (j) => j.remoteScope === "country_fenced",
  ).length;
  const onsiteWebDevJobs = webDevJobsWithScope.filter(
    (j) => j.remoteScope === "onsite",
  ).length;
  const undeterminedWebDevJobs = webDevJobsWithScope.filter(
    (j) => j.remoteScope === "undetermined",
  ).length;

  // Addressable yield = global + 0.5 × undetermined (conservative estimate)
  const addressableYield = globalWebDevJobs + 0.5 * undeterminedWebDevJobs;
  const globalFraction =
    webDevJobs > 0 ? addressableYield / webDevJobs : 0;

  const passed = webDevJobs >= MIN_WEBDEV_ROLES;

  return {
    totalJobs,
    webDevJobs,
    globalWebDevJobs,
    fencedWebDevJobs,
    onsiteWebDevJobs,
    undeterminedWebDevJobs,
    addressableYield,
    globalFraction,
    passed,
    reason: passed
      ? `pass:${webDevJobs} web-dev, ${globalWebDevJobs} global, ${undeterminedWebDevJobs} undetermined → ${addressableYield} addressable`
      : `fail:abs:${webDevJobs}<${MIN_WEBDEV_ROLES}`,
    jobs,
    webDevJobsWithScope,
  };
}

function emptyResult(reason: string): StackProfileV3Result {
  return {
    totalJobs: 0,
    webDevJobs: 0,
    globalWebDevJobs: 0,
    fencedWebDevJobs: 0,
    onsiteWebDevJobs: 0,
    undeterminedWebDevJobs: 0,
    addressableYield: 0,
    globalFraction: 0,
    passed: false,
    reason,
    jobs: [],
    webDevJobsWithScope: [],
  };
}
