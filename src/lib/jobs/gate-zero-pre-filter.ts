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
// Pattern 3: No remote designation = on-site at stated location
//
// See docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md for the full design.

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
 */
function locationMentionsCountry(
  locationName: string,
  countryCode: string,
): boolean {
  const lower = locationName.toLowerCase();
  const names = COUNTRY_NAMES[countryCode.toUpperCase()];
  if (names) {
    return names.some((name) => lower.includes(name));
  }
  // Fallback: check the code itself
  return lower.includes(countryCode.toLowerCase());
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
// CHECK 3: NO REMOTE DESIGNATION = ON-SITE DEFAULT (Pattern 3)
// =============================================================================

/**
 * Check if the job is on-site (explicitly or by default) in a location that
 * excludes the applicant. This catches the CloudSEK pattern where a job has
 * a location name but no remote/hybrid designation.
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

  // If workplaceType is remote or hybrid, this check doesn't apply
  if (job.workplaceType === "remote" || job.workplaceType === "hybrid") {
    return { blocker: null, pattern: null };
  }

  // If workplaceType is on-site OR null (defaulting to on-site per Pattern 3 fix)
  // check if the location matches the applicant's country
  const locationMatches = locationMentionsCountry(locationName, country);

  if (!locationMatches) {
    const pattern =
      job.workplaceType === "on-site" ? "explicit_on_site" : "default_on_site";
    return {
      blocker: `Job is on-site at ${locationName}, applicant is in ${country}`,
      pattern,
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
 * available. Normalizes monthly figures to annual.
 */
function checkCompensation(input: PreFilterInput): {
  blocker: string | null;
  pattern: string | null;
} {
  const { job, applicant } = input;

  if (job.compensationMax === null || applicant.expectedCompMin === null) {
    return { blocker: null, pattern: null };
  }

  let normalizedMax = job.compensationMax;

  // If the value is small and currency is USD, it's likely monthly
  if (job.compensationCurrency === "USD" && job.compensationMax < 1000) {
    normalizedMax = job.compensationMax * 12;
  }

  // Reject if max is below 70% of applicant's minimum
  if (normalizedMax < applicant.expectedCompMin * 0.7) {
    return {
      blocker: `Compensation max $${normalizedMax.toLocaleString()} is below 70% of applicant's minimum $${applicant.expectedCompMin.toLocaleString()}`,
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
