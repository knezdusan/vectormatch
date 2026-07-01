// Shared ATS URL Utilities
// src/lib/jobs/seeders/batch-sources/ats-url-utils.ts
//
// Pure helper functions for ATS URL parsing — extracted from duplicate
// implementations across google-cse.ts, sitemap-probe.ts, and
// newsletter-archives.ts.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";

/** ATS domains mapped to their source, used for URL detection. */
export const ATS_DOMAIN_MAP: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

/**
 * Determine the ATS source from a URL's hostname.
 *
 * @returns  The AtsSource, or null if the hostname doesn't match any ATS.
 */
export function inferAtsSourceFromUrl(url: string): AtsSource | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    for (const { domain, source } of ATS_DOMAIN_MAP) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return source;
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

/**
 * Extract the company slug from an ATS URL.
 *
 * For most ATS platforms (Greenhouse, Lever, Ashby, SmartRecruiters, Workable),
 * the slug is the first path segment of the URL.
 *
 * For Recruitee, the slug is the subdomain (e.g. "acme" in "acme.recruitee.com").
 *
 * @param url        The ATS URL
 * @param atsSource  The ATS platform
 * @returns          The extracted slug, or null if it can't be extracted
 */
export function extractSlugFromAtsUrl(
  url: string,
  atsSource: AtsSource,
): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Recruitee: slug is the subdomain (e.g. acme.recruitee.com)
    if (atsSource === "recruitee") {
      const labels = hostname.split(".");
      // Expect: {slug}.recruitee.com
      if (
        labels.length >= 3 &&
        labels[labels.length - 2] === "recruitee" &&
        labels[labels.length - 1] === "com"
      ) {
        const slug = labels[0];
        // Reject common non-slug subdomains
        if (["www", "api", "blog"].includes(slug)) return null;
        return slug;
      }
      return null;
    }

    // All other ATS: slug is the first path segment
    const pathParts = parsed.pathname.split("/").filter((p) => p.length > 0);
    if (pathParts.length === 0) return null;

    const slug = pathParts[0];
    // Reject common non-slug path segments
    if (["jobs", "api", "embed", "board"].includes(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}
