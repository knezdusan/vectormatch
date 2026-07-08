// Gate 0.5 — Hard-Blocker Pre-Filter
// src/lib/jobs/gate-zero-pre-filter.ts
//
// Runs after normalization succeeds but before Gate 1+2 routing. Checks for
// hard blockers that make a job fundamentally ineligible regardless of tech
// match: geo-fencing (title region tags, location country lists, on-site in
// foreign countries), compensation tier mismatches, and experience band
// inversions.
//
// Jobs that fail Gate 0.5 are tombstoned (status='rejected') and never enter
// the matching pipeline — saving Gate 1+2 query cost and Gate 3 LLM cost.
//
// ── Design principle: soft-fail-open for missing data ───────────────────────
// Checks 4 (compensation) and 5 (experience) only fire when BOTH the job and
// applicant data are available. If either side is missing data, the check is
// skipped. This prevents blocking jobs just because we don't have compensation
// or experience data yet. The geo-fencing checks (1-3) work without any new
// applicant data — they only need country and assignmentTypes, which are
// already captured during onboarding.
//
// ── Three geo-fencing patterns (discovered July 2026) ───────────────────────
// Pattern 1: Title region tags (e.g., "Software Engineer - Latam")
// Pattern 2: Location country lists (e.g., Mexico, Argentina, Colombia...)
// Pattern 3: Explicitly on-site in a foreign country (hard reject)
//
// ── Revision July 2026 (zero-match root cause fix) ──────────────────────────
// Check 3 previously treated workplaceType=null (undetermined) the same as
// workplaceType="on-site" (explicit) and hard-rejected both. This caused the
// ~85% of Greenhouse jobs with undetermined workplaceType to be tombstoned
// before Gate 3 (LLM) could evaluate them — producing zero matches for
// remote-only applicants. Now Check 3 ONLY fires on explicit "on-site".
// Jobs with null workplaceType are passed through to Gate 3, which is
// explicitly designed to detect remote indicators in JD text.
//
// See docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md for the original design.
// See docs/reports/EXTERNAL_AUDIT_TECHNICAL_OVERVIEW.md §7.1 for root cause.

import { toPlausibleAnnualUSD } from "@/lib/jobs/currency";
import { isSpecificLocation } from "@/lib/jobs/location-utils";

// =============================================================================
// TYPES
// =============================================================================

export interface PreFilterInput {
  job: {
    title: string;
    locationName: string | null;
    workplaceType: "remote" | "hybrid" | "on-site" | null;
    normalizedText: string | null;
    // Gate 0.5 metadata (may be null for legacy jobs — soft-fail-open)
    titleRegionTag: string | null;
    locationCountries: string[] | null;
    experienceMinYears: number | null;
    experienceMaxYears: number | null;
    compensationMin: number | null;
    compensationMax: number | null;
    compensationCurrency: string | null;
    // Remote scope (added July 2026 — zero-match fix, extended v2)
    // "global" = worldwide remote, "country_fenced" = restricted to specific
    // countries, "region_fenced" = restricted to a broad region (Latam/APAC),
    // "onsite" = on-site/hybrid, no remote option,
    // "unknown" = couldn't be determined (legacy — Gate 3 evaluates),
    // "undetermined" = v2 terminal — Step 1+2 ladder exhausted retries
    // (Gate 3 evaluates — never hard-reject on parsing failure)
    remoteScope:
      | "global"
      | "country_fenced"
      | "region_fenced"
      | "onsite"
      | "unknown"
      | "undetermined";
  };
  applicant: {
    country: string | null; // ISO 3166-1 alpha-2
    assignmentTypes: string[]; // "remote", "hybrid", "on-site", etc.
    preferredCompliance: string[]; // "w8ben", "ic_global", etc.
    // Gate 0.5 preferences (may be null if not yet set — soft-fail-open)
    expectedCompMin: number | null; // Annual USD
    yearsOfExperience: number | null;
  };
}

export interface PreFilterResult {
  passes: boolean;
  blockers: string[];
  rejectionReason: string | null;
  patternDetected: string | null;
}

// =============================================================================
// COUNTRY NAME MAPPING
// =============================================================================

/**
 * Mapping of ISO 3166-1 alpha-2 country codes to common name variants used in
 * job location strings. Used to check if a location string mentions the
 * applicant's country. Extend as needed for new applicant countries.
 */
const COUNTRY_NAMES: Record<string, string[]> = {
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
  NG: ["nigeria", "ng"],
  TW: ["taiwan", "tw"],
  MY: ["malaysia", "my"],
};

/**
 * Check if a location string mentions the applicant's country (by code or name).
 *
 * Uses non-letter boundary matching rather than naive `String.includes()` to
 * avoid false positives from short country codes appearing as substrings of
 * other words — e.g. "us" inside "Australia", "in" inside "Indonesia", "rs"
 * inside "Lawyers". A name/code matches only when it is preceded by start-of-
 * string or a non-letter and followed by end-of-string or a non-letter.
 */
function locationMentionsCountry(
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

// =============================================================================
// APPLICANT-FRIENDLY REGIONS
// =============================================================================

/**
 * Regions that are friendly to an applicant based on their country.
 * Used by Check 1 (title region tags) to determine if a region suffix
 * in the job title excludes the applicant.
 */
const APPLICANT_FRIENDLY_REGIONS: Record<string, string[]> = {
  // Serbia-friendly: EMEA, Europe, Balkans, Eastern Europe, Global
  RS: [
    "emea",
    "europe",
    "eu",
    "european union",
    "balkans",
    "eastern europe",
    "global",
    "worldwide",
    "remote",
  ],
  // US-friendly: United States, North America, Global
  US: [
    "united states",
    "us only",
    "north america",
    "global",
    "worldwide",
    "remote",
  ],
  // Add more countries as needed
};

/**
 * Check if a region tag is friendly to the applicant's country.
 */
function isRegionFriendly(regionTag: string, countryCode: string): boolean {
  const friendly = APPLICANT_FRIENDLY_REGIONS[countryCode.toUpperCase()];
  if (!friendly) return false; // Unknown country → conservative: not friendly
  const lower = regionTag.toLowerCase();
  return friendly.some((f) => lower.includes(f));
}

// =============================================================================
// CHECK 1: TITLE REGION TAGS (Pattern 1)
// =============================================================================

/**
 * Check if the job title contains a region tag that excludes the applicant.
 * Uses the pre-parsed titleRegionTag from the normalizer (more reliable than
 * re-parsing here). Falls back to null if not available.
 */
function checkTitleRegionTag(input: PreFilterInput): {
  blocker: string | null;
  pattern: string | null;
} {
  const { job, applicant } = input;

  if (!job.titleRegionTag || !applicant.country) {
    return { blocker: null, pattern: null };
  }

  if (isRegionFriendly(job.titleRegionTag, applicant.country)) {
    return { blocker: null, pattern: null };
  }

  return {
    blocker: `Job title contains region tag "${job.titleRegionTag}" which excludes ${applicant.country}`,
    pattern: "title_region_tag",
  };
}

// =============================================================================
// CHECK 2: LOCATION COUNTRY LISTS (Pattern 2)
// =============================================================================

/**
 * Check if the job's location restricts to a specific set of countries that
 * excludes the applicant. Uses structured locationCountries if available,
 * otherwise attempts to parse locationName for a country list.
 */
function checkLocationCountryList(input: PreFilterInput): {
  blocker: string | null;
  pattern: string | null;
} {
  const { job, applicant } = input;

  const country = applicant.country;
  if (!country) {
    return { blocker: null, pattern: null };
  }

  // Only apply this check to remote jobs (on-site jobs are handled by Check 3)
  if (job.workplaceType !== "remote" && job.workplaceType !== "hybrid") {
    return { blocker: null, pattern: null };
  }

  // Global remote jobs pass regardless of any country list — the JD explicitly
  // indicates worldwide remote (e.g., "Remote - Global", "work from anywhere").
  // This is the key benefit of the remote_scope field: it lets us distinguish
  // global remote from country-fenced remote at the pre-filter stage.
  if (job.remoteScope === "global") {
    return { blocker: null, pattern: null };
  }

  // v2: region_fenced and undetermined pass through to Gate 3.
  // - region_fenced: fenced to a broad region (Latam, APAC, EMEA) — Gate 0.5
  //   cannot hard-block on a single country match because region membership
  //   is fuzzy. Gate 3 (LLM) evaluates whether the applicant's country is
  //   within the region.
  // - undetermined: the Step 1 + Step 2 extraction ladder exhausted retries
  //   without resolving scope. Per governing doc: "undetermined → pass
  //   through to Gate 3, never hard-reject on parsing failure." This is the
  //   anti-pattern that caused the original zero-match bug.
  // - unknown: legacy value for pre-v2 jobs — same pass-through behavior.
  if (
    job.remoteScope === "region_fenced" ||
    job.remoteScope === "undetermined" ||
    job.remoteScope === "unknown"
  ) {
    return { blocker: null, pattern: null };
  }

  // Structured country list from ATS API
  if (job.locationCountries && job.locationCountries.length > 0) {
    const isAllowed = job.locationCountries.some(
      (c) =>
        locationMentionsCountry(c, country) ||
        locationMentionsCountry(country, c),
    );

    if (!isAllowed) {
      return {
        blocker: `Job location restricted to: ${job.locationCountries.join(", ")} — excludes ${country}`,
        pattern: "location_country_list",
      };
    }
    return { blocker: null, pattern: null };
  }

  // Fallback: parse locationName for a comma-separated country list
  if (job.locationName) {
    // Check if locationName looks like a country list (3+ comma-separated items
    // and contains "remote" — suggesting it's a remote job with geo-restrictions)
    const lowerLoc = job.locationName.toLowerCase();
    if (lowerLoc.includes("remote")) {
      const items = job.locationName.split(",").map((s) => s.trim());
      if (items.length >= 3) {
        const isAllowed = items.some((item) =>
          locationMentionsCountry(item, country),
        );

        if (!isAllowed) {
          return {
            blocker: `Job location lists multiple regions: ${job.locationName} — excludes ${country}`,
            pattern: "location_country_list",
          };
        }
      }
    }
  }

  return { blocker: null, pattern: null };
}

// =============================================================================
// CHECK 2b: REMOTE + SPECIFIC FOREIGN LOCATION (Fix 2 — mismatch investigation)
// =============================================================================

/**
 * Check if a remote job with unknown/undetermined remote_scope has a specific
 * city/country location that excludes the applicant.
 *
 * This catches the dominant mismatch pattern (87% of user-marked mismatches):
 * remote jobs where the ATS set location_name to a specific city/country (e.g.,
 * "Pakistan", "Pune, MH, in", "San Francisco, CA") but the remote-scope
 * extractor couldn't determine whether the job is global or country-fenced
 * (remote_scope = "unknown" or "undetermined"). The LLM (Step 2) often
 * classifies such jobs as "global" because the JD text is silent on geographic
 * restrictions, and Gate 3 then approves them for applicants in other
 * countries — producing false positives.
 *
 * The location_name field is structured ATS metadata — a remote job located in
 * "Pakistan" is almost certainly remote-within-Pakistan, not global remote.
 *
 * US exception: if the location is in the US and the applicant has w8ben or
 * ic_global compliance, pass through to Gate 3 (which evaluates W-2 vs
 * contractor). w8ben/ic_global covers US/North America contractor arrangements.
 */
function checkRemoteSpecificForeignLocation(input: PreFilterInput): {
  blocker: string | null;
  pattern: string | null;
} {
  const { job, applicant } = input;

  const country = applicant.country;
  if (!country) {
    return { blocker: null, pattern: null };
  }

  // Only applies to remote jobs with undetermined/unknown scope
  if (job.workplaceType !== "remote") {
    return { blocker: null, pattern: null };
  }

  if (job.remoteScope !== "unknown" && job.remoteScope !== "undetermined") {
    return { blocker: null, pattern: null };
  }

  if (!job.locationName) {
    return { blocker: null, pattern: null };
  }

  // Only applies to specific city/country locations (not "Remote - Global", etc.)
  if (!isSpecificLocation(job.locationName)) {
    return { blocker: null, pattern: null };
  }

  // If the location mentions the applicant's country, it's not foreign
  if (locationMentionsCountry(job.locationName, country)) {
    return { blocker: null, pattern: null };
  }

  // US exception: if the location is in the US and the applicant has w8ben or
  // ic_global compliance, pass through to Gate 3 (which evaluates W-2 vs
  // contractor). w8ben/ic_global covers US/North America contractor arrangements.
  const isUsLocation = locationMentionsCountry(job.locationName, "US");
  const hasUsCompliance =
    applicant.preferredCompliance.includes("w8ben") ||
    applicant.preferredCompliance.includes("ic_global");
  if (isUsLocation && hasUsCompliance) {
    return { blocker: null, pattern: null };
  }

  return {
    blocker: `Job is remote at ${job.locationName} (specific city/country) with undetermined remote scope — likely remote-within-that-country, applicant is in ${country}`,
    pattern: "remote_specific_foreign_location",
  };
}

// =============================================================================
// CHECK 3: ON-SITE / HYBRID IN FOREIGN COUNTRY (Pattern 3 — revised)
// =============================================================================

// REMOTE_LOCATION_INDICATORS, BROAD_REGION_NAMES, and isSpecificLocation() are
// now imported from @/lib/jobs/location-utils (shared with the job normalizer's
// inferRemoteScope and the remote-scope extractor).

/**
 * Check if the job requires physical presence in a location that excludes the
 * applicant. Fires in three cases:
 *
 * 1. EXPLICIT on-site: workplaceType === "on-site" in a foreign country.
 * 2. v2 on-site: remoteScope === "onsite" (LLM classified as on-site from JD).
 * 3. Hybrid in foreign country: workplaceType === "hybrid" and the location
 *    doesn't match the applicant's country and remoteScope !== "global".
 *    A hybrid job requires physical presence in that location — an applicant
 *    in a different country cannot commute there. This is a HARD blocker.
 * 4. Null workplaceType with specific foreign location: workplaceType === null
 *    and remoteScope is "undetermined"/"unknown" and the location is a specific
 *    city (not "remote", "global", "European Union", etc.) that doesn't match
 *    the applicant's country. This catches Greenhouse jobs that don't set
 *    workplaceType but are clearly on-site (e.g., "Pune, MH, in").
 *
 * Jobs with workplaceType === null and remote/region location strings (e.g.,
 * "Remote - Global", "European Union") are passed through to Gate 3.
 */
function checkOnSiteDefault(input: PreFilterInput): {
  blocker: string | null;
  pattern: string | null;
} {
  const { job, applicant } = input;

  const country = applicant.country;
  const locationName = job.locationName;
  if (!country || !locationName) {
    return { blocker: null, pattern: null };
  }

  const locationMatches = locationMentionsCountry(locationName, country);

  // Case 1 & 2: Explicit on-site or v2-classified on-site in foreign country
  if (job.workplaceType === "on-site" || job.remoteScope === "onsite") {
    if (!locationMatches) {
      return {
        blocker: `Job is on-site at ${locationName}, applicant is in ${country}`,
        pattern: "explicit_on_site",
      };
    }
    return { blocker: null, pattern: null };
  }

  // Case 3: Hybrid in foreign country (not global remote)
  // A hybrid job requires physical presence in that location part of the time.
  // If the applicant is in a different country, they cannot do hybrid — this
  // is a hard blocker, not a soft concern. Only global-remote hybrid jobs
  // (rare but possible) pass through.
  if (job.workplaceType === "hybrid" && job.remoteScope !== "global") {
    if (!locationMatches) {
      return {
        blocker: `Job is hybrid at ${locationName}, applicant is in ${country} — cannot commute to hybrid location`,
        pattern: "hybrid_foreign_location",
      };
    }
    return { blocker: null, pattern: null };
  }

  // Case 4: Null workplaceType with specific foreign location and undetermined
  // remote scope. If the location is a specific city (not "remote", "global",
  // "European Union", etc.) and doesn't match the applicant's country, treat
  // it as on-site. This catches Greenhouse jobs that don't set workplaceType
  // but are clearly on-site (e.g., "Pune, MH, in", "Hong Kong").
  // Jobs with remote/region location strings pass through to Gate 3.
  if (
    job.workplaceType === null &&
    (job.remoteScope === "undetermined" || job.remoteScope === "unknown") &&
    isSpecificLocation(locationName) &&
    !locationMatches
  ) {
    return {
      blocker: `Job location is ${locationName} (specific city, no remote indicator) with undetermined workplace type — likely on-site, applicant is in ${country}`,
      pattern: "null_workplace_specific_foreign_location",
    };
  }

  return { blocker: null, pattern: null };
}

// =============================================================================
// CHECK 4: COMPENSATION TIER (soft-fail-open)
// =============================================================================

/**
 * Check if the job's compensation is below the applicant's minimum threshold.
 * Only fires when both job compensation and applicant expected minimum are
 * available.
 *
 * Currency normalization: The applicant's expectedCompMin is always annual USD.
 * The job's compensation may be in any currency (PLN, EUR, USD, etc. from
 * direct-ingestion boards and ATS APIs). We convert the job's compensation to
 * USD before comparing. If the currency is unknown or the converted value is
 * implausibly low (below $5,000/yr — garbage data), the check soft-fail-opens.
 *
 * Monthly→annual conversion is NOT done here — that's the ingestion adapter's
 * responsibility (e.g. NoFluffJobs multiplies by 12 at ingestion time). The
 * pre-filter assumes all compensation values are already annual.
 */
function checkCompensation(input: PreFilterInput): {
  blocker: string | null;
  pattern: string | null;
} {
  const { job, applicant } = input;

  if (applicant.expectedCompMin === null) {
    return { blocker: null, pattern: null };
  }

  // Use compensationMax (best case for the applicant) when available,
  // falling back to compensationMin (at least we know the floor).
  const rawComp = job.compensationMax ?? job.compensationMin;
  if (rawComp === null) {
    return { blocker: null, pattern: null };
  }

  // Convert to USD and apply sanity floor. If the conversion fails (unknown
  // currency) or the result is implausibly low (garbage data), soft-fail-open.
  const usdComp = toPlausibleAnnualUSD(rawComp, job.compensationCurrency);
  if (usdComp === null) {
    return { blocker: null, pattern: null };
  }

  // Reject if the USD-normalized compensation is below 70% of applicant's minimum
  if (usdComp < applicant.expectedCompMin * 0.7) {
    const currencyLabel = job.compensationCurrency ?? "USD";
    return {
      blocker: `Compensation ${currencyLabel} ${rawComp.toLocaleString()} (≈$${usdComp.toLocaleString()} USD) is below 70% of applicant's minimum $${applicant.expectedCompMin.toLocaleString()} USD`,
      pattern: "compensation_mismatch",
    };
  }

  return { blocker: null, pattern: null };
}

// =============================================================================
// CHECK 5: EXPERIENCE BAND (soft-fail-open)
// =============================================================================

/**
 * Check if the applicant is significantly overqualified for the job, or if
 * the job has an inverted experience band (low years + senior expectations).
 * Only fires when both job experience range and applicant years are available.
 */
function checkExperienceBand(input: PreFilterInput): {
  blocker: string | null;
  pattern: string | null;
} {
  const { job, applicant } = input;

  if (job.experienceMaxYears === null || applicant.yearsOfExperience === null) {
    return { blocker: null, pattern: null };
  }

  const applicantYears = applicant.yearsOfExperience;
  const maxYears = job.experienceMaxYears;
  const minYears = job.experienceMinYears ?? 0;

  // Check for inverted band: low range but senior expectations in title
  const hasSeniorExpectations =
    /senior|sde\s*2|sde\s*ii|lead|staff|principal/i.test(job.title) ||
    (job.normalizedText !== null &&
      /senior\s*(ownership|responsibility|level)\s*expected/i.test(
        job.normalizedText,
      ));

  if (hasSeniorExpectations && maxYears < 7 && applicantYears > 10) {
    return {
      blocker: `Job expects ${minYears}-${maxYears} years with senior responsibilities (inverted band), applicant has ${applicantYears}+ years — likely overqualified`,
      pattern: "inverted_experience_band",
    };
  }

  // Check if applicant is significantly above max range
  if (applicantYears > maxYears + 5) {
    return {
      blocker: `Applicant has ${applicantYears}+ years experience, job max is ${maxYears} years — likely overqualified`,
      pattern: "experience_gap",
    };
  }

  return { blocker: null, pattern: null };
}

// =============================================================================
// MAIN PRE-FILTER FUNCTION
// =============================================================================

/**
 * Run the Gate 0.5 hard-blocker pre-filter. Returns whether the job passes
 * and, if not, which blockers triggered the rejection.
 *
 * This is pure logic — no DB access, no side effects. The caller (Inngest
 * handler) is responsible for tombstoning the job if this returns passes=false.
 *
 * @param input Job and applicant data
 * @returns PreFilterResult with passes/blockers/patternDetected
 */
export function runHardBlockerPreFilter(
  input: PreFilterInput,
): PreFilterResult {
  const blockers: string[] = [];
  let patternDetected: string | null = null;

  // Check 1: Title region tags (Pattern 1)
  const check1 = checkTitleRegionTag(input);
  if (check1.blocker) {
    blockers.push(check1.blocker);
    patternDetected = check1.pattern;
  }

  // Check 2: Location country lists (Pattern 2)
  const check2 = checkLocationCountryList(input);
  if (check2.blocker) {
    blockers.push(check2.blocker);
    if (!patternDetected) patternDetected = check2.pattern;
  }

  // Check 2b: Remote + specific foreign location with undetermined scope
  // (Fix 2 — catches the dominant mismatch pattern: remote jobs with a specific
  // city/country location that the scope extractor couldn't classify)
  const check2b = checkRemoteSpecificForeignLocation(input);
  if (check2b.blocker) {
    blockers.push(check2b.blocker);
    if (!patternDetected) patternDetected = check2b.pattern;
  }

  // Check 3: No remote designation = on-site (Pattern 3)
  const check3 = checkOnSiteDefault(input);
  if (check3.blocker) {
    blockers.push(check3.blocker);
    if (!patternDetected) patternDetected = check3.pattern;
  }

  // Check 4: Compensation tier (soft-fail-open)
  const check4 = checkCompensation(input);
  if (check4.blocker) {
    blockers.push(check4.blocker);
    if (!patternDetected) patternDetected = check4.pattern;
  }

  // Check 5: Experience band (soft-fail-open)
  const check5 = checkExperienceBand(input);
  if (check5.blocker) {
    blockers.push(check5.blocker);
    if (!patternDetected) patternDetected = check5.pattern;
  }

  return {
    passes: blockers.length === 0,
    blockers,
    rejectionReason: blockers.length > 0 ? blockers.join("; ") : null,
    patternDetected,
  };
}
