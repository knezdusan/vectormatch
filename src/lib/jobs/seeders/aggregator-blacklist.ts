// Aggregator Blacklist — prevents job aggregators from entering the corpus
// src/lib/jobs/seeders/aggregator-blacklist.ts
//
// Job aggregators (e.g., Hirehangar, Ketryx) re-host listings from other
// companies' ATSs. Ingesting them as regular companies conflicts with the
// core mission of "discovering untapped opportunities" — aggregators are
// distribution channels, not opportunity sources. They also create
// duplicate jobs (the same listing appears under both the original company
// and the aggregator).
//
// This module provides a shared blacklist check used at both insertion
// points:
//   - insertDiscoveredCompanies (batch seeders: BigQuery, Wayback, etc.)
//   - insertResolvedCompany (Slugger: daily seeders, manual additions)
//
// See docs/reports/EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md §7.3.2.

// =============================================================================
// BLACKLIST
// =============================================================================

/**
 * Known job aggregator slugs and company names. Matched against the ATS slug
 * (case-insensitive exact match) and company name (case-insensitive substring).
 *
 * Slugs are ATS-specific (Greenhouse board URL segment, Lever company URL
 * segment, etc.). Company names are matched as substrings to catch variants.
 *
 * To add a new aggregator:
 * 1. Find its ATS slug (the URL segment after the ATS domain)
 * 2. Add it to AGGREGATOR_SLUGS
 * 3. Add the company name to AGGREGATOR_NAMES (lowercase, for substring match)
 */
const AGGREGATOR_SLUGS: ReadonlySet<string> = new Set([
  // Hirehangar — re-hosts jobs from multiple ATSs
  "hirehangar",
  "hirehangarllc",
  // Ketryx — re-hosts jobs, not a direct employer
  "ketryx",
  // Add more as discovered
]);

const AGGREGATOR_NAMES: readonly string[] = [
  "hirehangar",
  "ketryx",
  // Add more as discovered
];

// =============================================================================
// CHECK FUNCTIONS
// =============================================================================

/**
 * Check if an ATS slug belongs to a known aggregator.
 * @param atsSlug The ATS slug (e.g., Greenhouse board URL segment)
 * @returns true if the slug is blacklisted
 */
export function isAggregatorSlug(atsSlug: string): boolean {
  return AGGREGATOR_SLUGS.has(atsSlug.toLowerCase());
}

/**
 * Check if a company name matches a known aggregator.
 * Uses case-insensitive substring matching to catch name variants.
 * @param companyName The company name (may be null)
 * @returns true if the name matches a blacklisted aggregator
 */
export function isAggregatorName(
  companyName: string | null | undefined,
): boolean {
  if (!companyName || companyName.length === 0) return false;
  const lower = companyName.toLowerCase();
  return AGGREGATOR_NAMES.some((name) => lower.includes(name));
}

/**
 * Check if a company (by slug and/or name) is a known aggregator.
 * Combines both slug and name checks — if either matches, the company is
 * rejected.
 *
 * @param atsSlug The ATS slug (may be null for pre-resolution checks)
 * @param companyName The company name (may be null)
 * @returns true if the company is a known aggregator
 */
export function isAggregator(
  atsSlug: string | null | undefined,
  companyName: string | null | undefined,
): boolean {
  if (atsSlug && isAggregatorSlug(atsSlug)) return true;
  if (isAggregatorName(companyName)) return true;
  return false;
}
