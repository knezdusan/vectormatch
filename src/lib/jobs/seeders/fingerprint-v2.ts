// Fingerprint v2 — Stack-Profile Enrollment Gate
// src/lib/jobs/seeders/fingerprint-v2.ts
//
// Targeting moves INTO the enrollment gate (source-independent). After the
// Slugger resolves a company → ATS, this gate checks the company's job feed
// for web-dev roles before allowing enrollment into the probation polling
// queue.
//
// ── Gate logic ───────────────────────────────────────────────────────────────
// 1. Fetch the ATS job list (one HTTP request — reuses the quality-probe pattern)
// 2. Count open roles matching the web-dev subset of CANONICAL_TAGS
// 3. Enroll only if:
//    - ≥2 open web-dev roles, OR
//    - ≥30% of the total feed are web-dev roles
// 4. Companies failing the gate → parked list with feed snapshot
//    (re-probe monthly, cheap; don't discard)
//
// This prevents EVERY source from reproducing the Round-1/Round-2 corpus skew
// (broad company harvest → wrong companies: not IT, not web-dev, not global).
//
// ── Web-dev role keywords ────────────────────────────────────────────────────
// The web-dev subset is broader than just title matching — it also checks
// job descriptions for stack keywords when available. But at probe time
// (enrollment gate), we only have the job list (titles), not full descriptions.
// So the title-based check is the primary signal.
//
// Web-dev title keywords:
//   frontend, front-end, backend, back-end, fullstack, full-stack, full stack,
//   web developer, web engineer, javascript, typescript, react, next.js, nextjs,
//   node, node.js, nodejs, vue, vue.js, angular, svelte, php, laravel, wordpress,
//   wp developer, drupal, joomla, shopify, liquid, webflow, HTML, CSS, SCSS,
//   UI engineer, UI developer
//
// See Advisor Directive 02 §Fingerprint v2 for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import { looksLikeValidAtsResponse } from "@/lib/jobs/seeders/resolve-custom-url";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Minimum number of web-dev roles to pass the gate (absolute threshold). */
export const MIN_WEBDEV_ROLES = 2;

// MIN_WEBDEV_FRACTION removed (Directive 04) — fraction is now a ranking key,
// not a gate. The absolute count (≥2) is the only gate condition.

/**
 * Web-dev role title keywords. A job title matches if it contains any of
 * these (case-insensitive, word-boundary-aware).
 *
 * This is the web-dev subset of the persona's must-have tags, expanded to
 * cover the full web-dev ecosystem (not just JS/React — also PHP/Laravel/
 * WordPress per the directive's target company profile).
 */
const WEBDEV_TITLE_KEYWORDS: readonly string[] = [
  // Core web-dev roles
  "frontend",
  "front-end",
  "backend",
  "back-end",
  "fullstack",
  "full-stack",
  "full stack",
  "web developer",
  "web engineer",
  "ui engineer",
  "ui developer",
  "ux engineer",

  // JS/TS ecosystem
  "javascript",
  "typescript",
  "react",
  "next.js",
  "nextjs",
  "next js",
  "node",
  "node.js",
  "nodejs",
  "vue",
  "vue.js",
  "angular",
  "svelte",
  "ember",
  "gatsby",
  "remix",

  // PHP ecosystem
  "php",
  "laravel",
  "symfony",
  "wordpress",
  "wp developer",
  "drupal",
  "joomla",
  "magento",

  // Other web stacks
  "shopify",
  "liquid",
  "webflow",
  "html",
  "css",
  "scss",
  "sass",
  "tailwind",
];

// Pre-compile the regex for performance
const WEBDEV_REGEX = new RegExp(
  WEBDEV_TITLE_KEYWORDS.map((k) =>
    k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|"),
  "i",
);

// ── Types ────────────────────────────────────────────────────────────────────

export interface StackProfileResult {
  /** Total jobs found at the ATS. */
  totalJobs: number;
  /** Jobs with web-dev titles. */
  webDevJobs: number;
  /** Fraction of web-dev jobs (webDevJobs / totalJobs). Ranking key for tranches. */
  webDevFraction: number;
  /** Whether the company passes the Fingerprint v2 stack gate. */
  passed: boolean;
  /** Reason for pass/fail (includes fraction for auditability). */
  reason: string;
  /** Job titles that matched as web-dev (for auditability). */
  matchedTitles: string[];
  /** Match basis per matched title — which keyword(s) triggered the match. */
  matchBasis: { title: string; keywords: string[] }[];
  /** All job titles found at the ATS (for the parked-list feed snapshot). */
  allTitles: string[];
}

// ── Pure functions ───────────────────────────────────────────────────────────

/**
 * Check if a job title matches the web-dev profile.
 * Case-insensitive substring match against the web-dev keyword set.
 */
export function isWebDevTitle(title: string): boolean {
  return WEBDEV_REGEX.test(title);
}

/**
 * Check if a job title matches the web-dev profile and return the match basis.
 * Returns the matched keyword(s) for auditability — title-keyword matching is
 * brittle (generic "Software Engineer" titles miss; "Frontend" false-positives),
 * so logging the match basis lets the first real probe be audited for
 * precision/recall.
 */
export function matchWebDevTitle(title: string): string[] {
  const matches: string[] = [];
  for (const keyword of WEBDEV_TITLE_KEYWORDS) {
    const re = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    if (re.test(title)) {
      matches.push(keyword);
    }
  }
  return matches;
}

/**
 * Determine whether a company passes the Fingerprint v2 stack gate.
 *
 * Pass condition (absolute count only):
 *   - webDevJobs >= MIN_WEBDEV_ROLES (absolute floor, start ≥2)
 *
 * The fraction gate was an over-correction (Directive 04 Fix 2): it rejected
 * Canonical (301 jobs, 6 open web-dev roles, fully-remote, global) — exactly
 * the mission. The correct protection against corpus pollution is
 * **role-scoped ingestion**: on enrollment, embed only web-dev roles. This
 * makes the absolute gate safe — enroll Canonical, ingest its 6 web-dev roles,
 * pay nothing for the other 295, pollute nothing.
 *
 * Fraction is kept as a **ranking key** for tranche ordering (higher fraction
 * = more addressable jobs per embed dollar), NOT as a filter.
 *
 * @param totalJobs    Total jobs at the ATS
 * @param webDevJobs   Jobs matching the web-dev profile
 * @returns            { passed, reason, fraction }
 */
export function evaluateStackGate(
  totalJobs: number,
  webDevJobs: number,
): { passed: boolean; reason: string; fraction: number } {
  if (totalJobs === 0) {
    return { passed: false, reason: "no_jobs", fraction: 0 };
  }

  const fraction = webDevJobs / totalJobs;

  if (webDevJobs >= MIN_WEBDEV_ROLES) {
    return {
      passed: true,
      reason: `pass:${webDevJobs} web-dev jobs (≥${MIN_WEBDEV_ROLES}), ${(fraction * 100).toFixed(1)}% of ${totalJobs}`,
      fraction,
    };
  }

  return {
    passed: false,
    reason: `fail:abs:${webDevJobs}<${MIN_WEBDEV_ROLES} (${(fraction * 100).toFixed(1)}% of ${totalJobs})`,
    fraction,
  };
}

// ── Job title extraction (reused from quality-probe) ─────────────────────────

/**
 * Extract job titles from an ATS API response.
 * Each ATS has a different response shape.
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

// ── Main stack-profile probe ─────────────────────────────────────────────────

/**
 * Fetch the ATS job list for a company and evaluate the Fingerprint v2
 * stack-profile gate.
 *
 * This is called at enrollment time (after Slugger resolution, before
 * probation queue insertion) to ensure the company hires web developers.
 *
 * @param atsSource    The ATS platform
 * @param atsSlug      The company's ATS slug
 * @param fetchFn      Injectable fetch (defaults to global fetch)
 * @returns            Stack profile result with pass/fail and audit data
 */
export async function probeStackProfile(
  atsSource: AtsSource,
  atsSlug: string,
  fetchFn: FetchFn = fetch,
): Promise<StackProfileResult> {
  const endpoint = getAtsEndpoint(atsSource);
  const url = endpoint.jobsList(atsSlug);

  let response: Response;
  try {
    response = await fetchFn(url, {
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    // Network error — fail closed (don't enroll what we can't verify)
    return {
      totalJobs: 0,
      webDevJobs: 0,
      webDevFraction: 0,
      passed: false,
      reason: "network_error",
      matchedTitles: [],
      matchBasis: [],
      allTitles: [],
    };
  }

  if (!response.ok) {
    return {
      totalJobs: 0,
      webDevJobs: 0,
      webDevFraction: 0,
      passed: false,
      reason: `http_${response.status}`,
      matchedTitles: [],
      matchBasis: [],
      allTitles: [],
    };
  }

  const text = await response.text();

  if (!looksLikeValidAtsResponse(text, atsSource)) {
    return {
      totalJobs: 0,
      webDevJobs: 0,
      webDevFraction: 0,
      passed: false,
      reason: "invalid_ats_response",
      matchedTitles: [],
      matchBasis: [],
      allTitles: [],
    };
  }

  const allTitles = extractJobTitles(text, atsSource);
  const matchedTitles = allTitles.filter(isWebDevTitle);
  const matchBasis = matchedTitles.map((title) => ({
    title,
    keywords: matchWebDevTitle(title),
  }));
  const totalJobs = allTitles.length;
  const webDevJobs = matchedTitles.length;
  const webDevFraction = totalJobs > 0 ? webDevJobs / totalJobs : 0;
  const evaluation = evaluateStackGate(totalJobs, webDevJobs);

  return {
    totalJobs,
    webDevJobs,
    webDevFraction,
    passed: evaluation.passed,
    reason: evaluation.reason,
    matchedTitles,
    matchBasis,
    allTitles,
  };
}
