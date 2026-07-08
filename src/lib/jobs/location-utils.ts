// Location classification utilities — shared between the job normalizer
// (inferRemoteScope), the remote-scope extractor ladder, and Gate 0.5
// (runHardBlockerPreFilter).
//
// These helpers distinguish a specific physical city/country location from
// remote designations ("Remote - Global", "work from anywhere") and broad
// regions ("European Union", "EMEA", "Balkans"). A remote job whose
// location_name is a specific city (e.g., "Pune, MH, in", "Pakistan",
// "San Francisco, CA") is almost certainly remote-within-that-country, not
// global remote — ATS systems set the location to the country the role is
// based in.

/**
 * Location strings that indicate a remote or broad-region job rather than a
 * specific physical location. If the location name contains any of these
 * indicators, the job is likely remote or region-scoped (not a specific city)
 * and should NOT be treated as country-fenced based on the location alone.
 */
export const REMOTE_LOCATION_INDICATORS: readonly string[] = [
  "remote",
  "global",
  "worldwide",
  "anywhere",
  "distributed",
  "work from",
  "any location",
  "any country",
];

/**
 * Broad region names that should NOT be treated as specific physical locations.
 * A job located in "European Union" or "EMEA" is not a specific city — it's a
 * region-scoped job that Gate 3 should evaluate.
 */
export const BROAD_REGION_NAMES: readonly string[] = [
  "european union",
  "eu",
  "emea",
  "apac",
  "latam",
  "north america",
  "south america",
  "europe",
  "asia",
  "africa",
  "middle east",
  "balkans",
  "eastern europe",
  "western europe",
  "central europe",
  "nordics",
  "benelux",
  "dach",
];

/**
 * Check if a location string looks like a specific physical city/country
 * (rather than a remote designation or broad region).
 *
 * Used by:
 *   - inferRemoteScope() — to classify remote + specific location as
 *     country_fenced (Fix 1).
 *   - Gate 0.5 Check 3 — to detect null-workplaceType jobs with a specific
 *     foreign location that are likely on-site.
 *   - Gate 0.5 Check 2b — to detect remote jobs with a specific foreign
 *     location that are likely country-fenced even when remote_scope is
 *     unknown/undetermined (Fix 2).
 *
 * @param locationName The raw location string from the ATS
 * @returns true if the location is a specific city/country (not a remote
 *          designation or broad region)
 */
export function isSpecificLocation(locationName: string): boolean {
  const lower = locationName.toLowerCase();
  // If it contains any remote indicator, it's not a specific physical location
  if (REMOTE_LOCATION_INDICATORS.some((ind) => lower.includes(ind))) {
    return false;
  }
  // If it matches a broad region name, it's not a specific physical location
  if (BROAD_REGION_NAMES.some((region) => lower.includes(region))) {
    return false;
  }
  // Otherwise, it's a specific city/country (e.g., "Pune, MH, in", "Kuala Lumpur",
  // "Hong Kong", "Berlin, Germany", "Pakistan", "San Francisco, CA")
  return true;
}
