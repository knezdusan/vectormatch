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
 * Mapping of ISO 3166-1 alpha-2 country codes to common name variants used in
 * job location strings. Used to check if a location string mentions a specific
 * country. Extend as needed for new applicant countries.
 *
 * Shared between Gate 0.5 (locationMentionsCountry) and the job normalizer
 * (extractLocationCountry) to avoid duplication.
 */
export const COUNTRY_NAMES: Record<string, string[]> = {
  RS: ["serbia", "rs"],
  US: ["united states", "usa", "u.s.", "us", "america"],
  CA: ["canada", "ca"],
  GB: ["uk", "united kingdom", "england", "scotland", "wales", "britain"],
  AU: ["australia", "au"],
  DE: ["germany", "de"],
  FR: ["france", "fr"],
  IN: ["india", "in"],
  BR: ["brazil", "br"],
  AR: ["argentina", "ar"],
  MX: ["mexico", "mx"],
  CO: ["colombia", "co"],
  PT: ["portugal", "pt"],
  IE: ["ireland", "ie"],
  RO: ["romania", "ro"],
  UA: ["ukraine", "ua"],
  CH: ["switzerland", "ch"],
  MT: ["malta", "mt"],
  TW: ["taiwan", "tw"],
  MY: ["malaysia", "my"],
  PL: ["poland", "pl"],
  ES: ["spain", "es"],
  IT: ["italy", "it"],
  NL: ["netherlands", "nl"],
  SE: ["sweden", "se"],
  NO: ["norway", "no"],
  DK: ["denmark", "dk"],
  FI: ["finland", "fi"],
  CZ: ["czech republic", "czechia", "cz"],
  AT: ["austria", "at"],
  BE: ["belgium", "be"],
  HU: ["hungary", "hu"],
  GR: ["greece", "gr"],
  BG: ["bulgaria", "bg"],
  HR: ["croatia", "hr"],
  SK: ["slovakia", "sk"],
  SI: ["slovenia", "si"],
  LT: ["lithuania", "lt"],
  LV: ["latvia", "lv"],
  EE: ["estonia", "ee"],
  IS: ["iceland", "is"],
  LU: ["luxembourg", "lu"],
  JP: ["japan", "jp"],
  KR: ["south korea", "korea", "kr"],
  CN: ["china", "cn"],
  SG: ["singapore", "sg"],
  HK: ["hong kong", "hk"],
  TH: ["thailand", "th"],
  VN: ["vietnam", "vn"],
  ID: ["indonesia", "id"],
  PH: ["philippines", "ph"],
  PK: ["pakistan", "pk"],
  BD: ["bangladesh", "bd"],
  TR: ["turkey", "türkiye", "tr"],
  IL: ["israel", "il"],
  AE: ["united arab emirates", "uae", "ae"],
  SA: ["saudi arabia", "sa"],
  ZA: ["south africa", "za"],
  EG: ["egypt", "eg"],
  MA: ["morocco", "ma"],
  KE: ["kenya", "ke"],
  NG: ["nigeria", "ng"],
  CL: ["chile", "cl"],
  PE: ["peru", "pe"],
  UY: ["uruguay", "uy"],
  EC: ["ecuador", "ec"],
  VE: ["venezuela", "ve"],
  BO: ["bolivia", "bo"],
  PY: ["paraguay", "py"],
  DO: ["dominican republic", "do"],
};

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

/**
 * Extract a specific country code from a location string.
 *
 * Scans the location for any country name/code from the COUNTRY_NAMES mapping.
 * Returns the first matching ISO 3166-1 alpha-2 code, or null if no country is
 * found.
 *
 * Uses non-letter boundary matching (same as locationMentionsCountry) to avoid
 * false positives from short country codes appearing as substrings of other
 * words — e.g. "us" inside "Australia", "in" inside "Indonesia".
 *
 * This handles the NoFluffJobs location format "Poland / Remote / Poland /
 * Poland / ..." which contains both a country name AND "Remote". The presence
 * of a country name alongside "Remote" indicates remote-within-that-country,
 * not global remote.
 *
 * @param locationName The raw location string from the ATS
 * @returns ISO 3166-1 alpha-2 country code, or null if no country found
 */
export function extractLocationCountry(locationName: string): string | null {
  const lower = locationName.toLowerCase();
  for (const [code, names] of Object.entries(COUNTRY_NAMES)) {
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`).test(lower)) {
        return code;
      }
    }
  }
  return null;
}

/**
 * Check if a location string mentions a specific country (by code or name).
 *
 * Uses non-letter boundary matching rather than naive `String.includes()` to
 * avoid false positives from short country codes appearing as substrings of
 * other words — e.g. "us" inside "Australia", "in" inside "Indonesia", "rs"
 * inside "Lawyers". A name/code matches only when it is preceded by start-of-
 * string or a non-letter and followed by end-of-string or a non-letter.
 */
export function locationMentionsCountry(
  locationName: string,
  countryCode: string,
): boolean {
  const lower = locationName.toLowerCase();
  const names = COUNTRY_NAMES[countryCode.toUpperCase()];
  const candidates = names ?? [countryCode.toLowerCase()];
  return candidates.some((name) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}(?=$|[^a-z])`).test(lower);
  });
}
