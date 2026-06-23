// ATS Endpoint Registry — Centralized source of truth for ATS API URLs
// src/lib/jobs/ats-endpoints.ts
//
// A single source of truth for ATS API endpoints. When an endpoint changes,
// this is the only file to update. The Phalanx Poller and all seeders read
// from this registry — never hardcode ATS URLs elsewhere.
//
// All three MVP ATS platforms expose public, no-auth JSON APIs:
// - Greenhouse: boards-api.greenhouse.io (v1 Job Board API)
// - Lever:      api.lever.co (v0 Postings API — v1 requires auth)
// - Ashby:      api.ashbyhq.com (Public Job Posting API)
//
// Automated endpoint health monitoring & LLM-based recovery is specified in
// TDD §4.2.2 and will be implemented once the Inngest base infrastructure is
// set up. Until then, the registry is static — updates require a code change.
//
// See TDD §4.2.1 for the full specification.

// ── Types ───────────────────────────────────────────────────────────────────

/** The three ATS platforms supported in the MVP. */
export type AtsSource = "greenhouse" | "lever" | "ashby";

/** URL builder functions for a single ATS platform. */
export interface AtsEndpointConfig {
  /** The human-readable platform name (for logs and the admin dashboard). */
  readonly name: string;
  /** Base API host (for health probes and CNAME checks). */
  readonly apiHost: string;
  /**
   * Jobs list endpoint for a given slug. Returns all active jobs for the
   * company. The poller calls this on every cycle.
   */
  readonly jobsList: (slug: string) => string;
  /**
   * Single job detail endpoint. Used by the health-monitoring probe to fetch
   * one job from a known-active slug with minimal payload. Optional for Ashby
   * (its jobs list already includes full details).
   */
  readonly jobDetail?: (slug: string, jobId: string) => string;
  /** The hosted career page URL (for the admin dashboard link-out). */
  readonly hostedBoard: (slug: string) => string;
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const ATS_ENDPOINTS: Record<AtsSource, AtsEndpointConfig> = {
  greenhouse: {
    // Public Job Board API — no auth required.
    // Docs: https://developers.greenhouse.io/job-board.html
    name: "Greenhouse",
    apiHost: "boards-api.greenhouse.io",
    jobsList: (slug) =>
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`,
    jobDetail: (slug, jobId) =>
      `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${jobId}`,
    hostedBoard: (slug) => `https://boards.greenhouse.io/${slug}`,
  },
  lever: {
    // Public Postings API v0 — no auth required.
    // Docs: https://github.com/lever/postings-api
    // Note: v1 requires auth. v0 is the public endpoint.
    // EU instance available at api.eu.lever.co (not yet supported — add when
    // an EU company is discovered and fails against the US host).
    name: "Lever",
    apiHost: "api.lever.co",
    jobsList: (slug) =>
      `https://api.lever.co/v0/postings/${slug}?mode=json&limit=1000`,
    jobDetail: (slug, postingId) =>
      `https://api.lever.co/v0/postings/${slug}/${postingId}`,
    hostedBoard: (slug) => `https://jobs.lever.co/${slug}`,
  },
  ashby: {
    // Public Job Posting API — no auth required.
    // Docs: https://developers.ashbyhq.com/docs/public-job-posting-api
    // includeCompensation=true adds salary bands to the response (used by
    // Module C for compliance filtering, not by Module B ingestion).
    name: "Ashby",
    apiHost: "api.ashbyhq.com",
    jobsList: (slug) =>
      `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`,
    // Ashby's job-board endpoint returns full job details inline — there is no
    // separate single-job endpoint. The health probe uses jobsList with a
    // known-active slug and inspects the first element.
    hostedBoard: (slug) => `https://careers.ashbyhq.com/${slug}`,
  },
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** All supported ATS sources as a readonly array (for iteration). */
export const ATS_SOURCES = Object.keys(ATS_ENDPOINTS) as AtsSource[];

/**
 * Get the endpoint config for a given ATS source. Throws if the source is
 * unknown — this indicates a programming error (e.g. a new enum value was
 * added without a corresponding registry entry).
 */
export function getAtsEndpoint(source: AtsSource): AtsEndpointConfig {
  const config = ATS_ENDPOINTS[source];
  if (!config) {
    throw new Error(
      `No ATS endpoint registered for source "${source}". ` +
        `Add it to ATS_ENDPOINTS in src/lib/jobs/ats-endpoints.ts.`,
    );
  }
  return config;
}
