// Gate 0.5 Hard-Blocker Pre-Filter — Unit Tests
// src/lib/jobs/__tests__/gate-zero-pre-filter.test.ts
//
// Tests all five checks with the real job examples from the analysis session:
// - Pattern 1: Reacher "Software Engineer - Latam"
// - Pattern 2: Hire Hangar country list (Mexico, Argentina, Colombia...)
// - Pattern 3: CloudSEK "Bengaluru, India" with no remote designation
// - Check 4: Compensation tier mismatch
// - Check 5: Experience band inversion

import { describe, expect, it } from "vitest";
import {
  type PreFilterInput,
  runHardBlockerPreFilter,
} from "@/lib/jobs/gate-zero-pre-filter";

// ── Helpers ──────────────────────────────────────────────────────────────────

type JobOverrides = Partial<PreFilterInput["job"]>;
type ApplicantOverrides = Partial<PreFilterInput["applicant"]>;

function makeInput(
  overrides: {
    job?: JobOverrides;
    applicant?: ApplicantOverrides;
    excludedCountries?: Set<string>;
  } = {},
): PreFilterInput {
  return {
    job: {
      title: "Software Engineer",
      locationName: null,
      workplaceType: null,
      normalizedText: null,
      titleRegionTag: null,
      locationCountries: null,
      experienceMinYears: null,
      experienceMaxYears: null,
      compensationMin: null,
      compensationMax: null,
      compensationCurrency: null,
      remoteScope: "unknown",
      ...overrides.job,
    },
    applicant: {
      country: "RS",
      assignmentTypes: ["remote"],
      preferredCompliance: [],
      expectedCompMin: null,
      yearsOfExperience: null,
      ...overrides.applicant,
    },
    excludedCountries: overrides.excludedCountries,
  };
}

// =============================================================================
// PATTERN 1: TITLE REGION TAGS
// =============================================================================

describe("Gate 0.5 — Pattern 1: Title region tags", () => {
  it("rejects 'Software Engineer - Latam' for Serbia applicant (Reacher case)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer - Latam",
          locationName: "Remote",
          workplaceType: "remote",
          titleRegionTag: "Latam",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("title_region_tag");
    expect(result.blockers[0]).toContain("Latam");
  });

  it("passes 'Software Engineer - EMEA' for Serbia applicant (EMEA is friendly)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer - EMEA",
          locationName: "Remote",
          workplaceType: "remote",
          titleRegionTag: "EMEA",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("passes when titleRegionTag is null (no region suffix)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Frontend Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          titleRegionTag: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("rejects 'SDE - India' for Serbia applicant", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "SDE - India",
          locationName: "Remote",
          workplaceType: "remote",
          titleRegionTag: "India",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("title_region_tag");
  });

  it("passes when applicant country is null (no country to check against)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer - Latam",
          titleRegionTag: "Latam",
        },
        applicant: {
          country: null,
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// PATTERN 2: LOCATION COUNTRY LISTS
// =============================================================================

describe("Gate 0.5 — Pattern 2: Location country lists", () => {
  it("rejects job with country list excluding applicant (Hire Hangar case)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Frontend Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          // v2: remoteScope = "country_fenced" triggers Check 2 hard-block.
          // "unknown" now passes through to Gate 3 per governing doc.
          remoteScope: "country_fenced",
          locationCountries: [
            "Mexico",
            "Argentina",
            "Colombia",
            "Guatemala",
            "Honduras",
            "India",
            "Nicaragua",
            "Paraguay",
            "Peru",
            "South Africa",
          ],
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("location_country_list");
  });

  it("passes job with country list including applicant's country", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          // v2: remoteScope = "country_fenced" triggers Check 2.
          remoteScope: "country_fenced",
          locationCountries: ["Serbia", "Germany", "France"],
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("does not apply country list check to on-site jobs (handled by Check 3)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Mexico City, Mexico",
          workplaceType: "on-site",
          locationCountries: ["Mexico"],
        },
      }),
    );
    // Should fail on Check 3 (on-site in foreign country), not Check 2
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("explicit_on_site");
  });

  it("PASSES remote job with country list excluding applicant when remoteScope is 'global'", () => {
    // Key test for the remote_scope feature: a job with remoteScope='global'
    // passes Check 2 even if locationCountries excludes the applicant.
    // The JD explicitly says "global remote" — country lists are ignored.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Frontend Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          locationCountries: ["Mexico", "Argentina", "Colombia", "India"],
          remoteScope: "global",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("rejects remote job with country list excluding applicant when remoteScope is 'country_fenced'", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Frontend Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          locationCountries: ["Mexico", "Argentina", "Colombia", "India"],
          remoteScope: "country_fenced",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("location_country_list");
  });
});

// =============================================================================
// PATTERN 3: EXPLICIT ON-SITE IN FOREIGN COUNTRY (revised July 2026)
// =============================================================================

describe("Gate 0.5 — Pattern 3: Explicit on-site in foreign country", () => {
  it("REJECTS null workplaceType job in foreign city (CloudSEK case — revised)", () => {
    // A null workplaceType job with a specific city location (e.g.,
    // "Bengaluru, Karnataka, India") that doesn't match the applicant's
    // country is now hard-rejected at Gate 0.5. The location is a specific
    // city with no remote indicators — it's clearly an on-site job.
    // Previously this passed through to Gate 3, but Gate 3 was approving
    // these jobs, causing false positives.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "SDE 2 - Fullstack",
          locationName: "Bengaluru, Karnataka, India",
          workplaceType: null, // Null — but location is a specific city
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe(
      "null_workplace_specific_foreign_location",
    );
  });

  it("PASSES null workplaceType job with remote location string", () => {
    // A null workplaceType job with "Remote" in the location string should
    // still pass through to Gate 3 — the location indicates it's a remote job.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("REJECTS null workplaceType job with broad region location not matching applicant", () => {
    // A null workplaceType job with a broad region (e.g., "European Union")
    // where the applicant's country is NOT in that region should be blocked
    // by Check 7 (region-fenced location). Serbia is not an EU member state.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "European Union",
          workplaceType: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("region_fenced_location");
  });

  it("PASSES null workplaceType job with broad region location matching applicant", () => {
    // A null workplaceType job with a broad region where the applicant's
    // country IS in that region should pass through to Gate 3.
    // Germany is in the European Union.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "European Union",
          workplaceType: null,
        },
        applicant: { country: "DE" },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("rejects explicitly on-site job in foreign country", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "San Francisco, CA",
          workplaceType: "on-site",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("explicit_on_site");
  });

  it("passes on-site job in applicant's country", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Belgrade, Serbia",
          workplaceType: "on-site",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("passes remote job (Check 3 does not apply)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("REJECTS hybrid job in foreign country (applicant cannot commute)", () => {
    // A hybrid job in a foreign country is a HARD blocker — the applicant
    // cannot commute to London, UK from Serbia. Only hybrid jobs in the
    // applicant's own country are soft concerns.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Hybrid - London, UK",
          workplaceType: "hybrid",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("hybrid_foreign_location");
  });

  it("PASSES hybrid job in applicant's country (soft concern for Gate 3)", () => {
    // A hybrid job in the applicant's own country is a soft concern —
    // many hybrid roles offer remote options. Gate 3 evaluates.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Hybrid - Belgrade, Serbia",
          workplaceType: "hybrid",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("PASSES hybrid job with remoteScope='global'", () => {
    // A hybrid job classified as global remote passes — the remoteScope
    // indicates it's open to worldwide applicants.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "London, UK",
          workplaceType: "hybrid",
          remoteScope: "global",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("passes when locationName is null (truly unknown)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: null,
          workplaceType: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("REJECTS null workplaceType with specific foreign city (revised — was zero-match fix)", () => {
    // A null workplaceType job with a specific city location (e.g.,
    // "Berlin, Germany") that doesn't match the applicant's country is now
    // hard-rejected. The location is a specific city with no remote
    // indicators — it's clearly an on-site job. Previously this passed
    // through to Gate 3, but Gate 3 was approving these, causing false
    // positives (e.g., "Full Stack Java Developer" in Pune, India).
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Frontend Engineer",
          locationName: "Berlin, Germany",
          workplaceType: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe(
      "null_workplace_specific_foreign_location",
    );
  });

  it("REJECTS null workplaceType with US city location (revised — was zero-match fix)", () => {
    // Same as above — "New York, NY" is a specific city, not a remote
    // designation. A Serbia-based applicant cannot work on-site in NY.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Full Stack Engineer",
          locationName: "New York, NY",
          workplaceType: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe(
      "null_workplace_specific_foreign_location",
    );
  });

  // ── v2 Corpus Expansion: new remoteScope values ──────────────────────────

  it("REJECTS job with remoteScope='undetermined' and specific foreign city", () => {
    // A job with undetermined remoteScope and a specific city location that
    // doesn't match the applicant's country is now hard-rejected. The location
    // is a specific city with no remote indicators. Previously these passed
    // through to Gate 3, but Gate 3 was approving them (e.g., "Associate Full
    // Stack Developer" in Kuala Lumpur, "Full Stack Java Developer" in Pune).
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Kuala Lumpur",
          workplaceType: "hybrid",
          remoteScope: "undetermined",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("hybrid_foreign_location");
  });

  it("PASSES job with remoteScope='undetermined' and remote location string", () => {
    // A job with undetermined remoteScope but "Remote" in the location string
    // should still pass through to Gate 3 — the location indicates it might
    // be a remote job.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - US",
          workplaceType: "remote",
          remoteScope: "undetermined",
          locationCountries: ["US", "CA"],
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("REJECTS job with remoteScope='region_fenced' when applicant not in region", () => {
    // region_fenced jobs are fenced to a broad region (Latam, APAC, EMEA).
    // Check 7 now hard-blocks when the applicant's country is NOT in the
    // detected region. Serbia is not in APAC.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - APAC",
          workplaceType: "remote",
          remoteScope: "region_fenced",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("region_fenced_location");
  });

  it("PASSES job with remoteScope='region_fenced' when applicant in region", () => {
    // region_fenced job where the applicant's country IS in the region.
    // Japan is in APAC.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - APAC",
          workplaceType: "remote",
          remoteScope: "region_fenced",
        },
        applicant: { country: "JP" },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("REJECTS job with remoteScope='onsite' in foreign country (v2 classification)", () => {
    // v2: remoteScope='onsite' is set by the extraction ladder when the JD
    // indicates on-site even if workplaceType was null (e.g., Greenhouse
    // jobs with "must work on-site" in the description). Check 3 should
    // fire on this.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Tokyo, Japan",
          workplaceType: null, // Null — but remoteScope says onsite
          remoteScope: "onsite",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("explicit_on_site");
  });

  it("REJECTS job with remoteScope='unknown' and specific foreign city (legacy — revised)", () => {
    // Legacy unknown jobs with a specific city location that doesn't match
    // the applicant's country are now hard-rejected. "Berlin, Germany" is a
    // specific city with no remote indicators — it's on-site.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Berlin, Germany",
          workplaceType: null,
          remoteScope: "unknown",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe(
      "null_workplace_specific_foreign_location",
    );
  });

  it("PASSES job with remoteScope='unknown' and remote location string (legacy)", () => {
    // Legacy unknown jobs with "Remote" in the location string still pass
    // through to Gate 3.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Worldwide",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// CHECK 4: COMPENSATION TIER
// =============================================================================

describe("Gate 0.5 — Check 4: Compensation tier", () => {
  it("rejects job with compensation below threshold", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 36000,
          compensationCurrency: "USD",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("compensation_mismatch");
  });

  it("skips check when compensation data is missing (soft-fail-open)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: null,
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("skips check when applicant expectedCompMin is null (soft-fail-open)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 36000,
          compensationCurrency: "USD",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("soft-fail-opens for garbage USD salary below sanity floor ($5,000)", () => {
    // $3,000/year is implausible — treat as unreliable data, don't reject.
    // (Monthly→annual conversion is the ingestion adapter's job, not the
    // pre-filter's. If a board sends monthly values, the adapter converts.)
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 3000,
          compensationCurrency: "USD",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("converts PLN compensation to USD before comparing", () => {
    // 100,000 PLN ≈ $25,000 USD. Applicant wants $60,000 USD.
    // 25,000 < 60,000 * 0.7 = 42,000 → rejected.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 100000,
          compensationCurrency: "PLN",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("compensation_mismatch");
  });

  it("passes PLN job that meets USD threshold after conversion", () => {
    // 300,000 PLN ≈ $75,000 USD. Applicant wants $60,000 USD.
    // 75,000 > 60,000 * 0.7 = 42,000 → passes.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 300000,
          compensationCurrency: "PLN",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("soft-fail-opens for garbage PLN salary (below sanity floor after conversion)", () => {
    // 1,608 PLN ≈ $402 USD — garbage NoFluffJobs data. Soft-fail-open.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 1608,
          compensationCurrency: "PLN",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("converts EUR compensation to USD before comparing", () => {
    // 40,000 EUR ≈ $43,200 USD. Applicant wants $60,000 USD.
    // 43,200 > 60,000 * 0.7 = 42,000 → passes (just above threshold).
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 40000,
          compensationCurrency: "EUR",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("soft-fail-opens for unknown currency", () => {
    // "XYZ" is not in the rate table — can't convert, soft-fail-open.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 50000,
          compensationCurrency: "XYZ",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("uses compensationMin as fallback when compensationMax is null", () => {
    // compensationMax is null, but compensationMin = 80000 USD.
    // 80,000 > 60,000 * 0.7 = 42,000 → passes.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMin: 80000,
          compensationMax: null,
          compensationCurrency: "USD",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("rejects using compensationMin fallback when below threshold", () => {
    // compensationMax is null, compensationMin = 30000 USD.
    // 30,000 < 60,000 * 0.7 = 42,000 → rejected.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMin: 30000,
          compensationMax: null,
          compensationCurrency: "USD",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("compensation_mismatch");
  });

  it("passes job with compensation above threshold", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          compensationMax: 80000,
          compensationCurrency: "USD",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// CHECK 5: EXPERIENCE BAND
// =============================================================================

describe("Gate 0.5 — Check 5: Experience band", () => {
  it("rejects overqualified applicant (years > max + 5)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          experienceMinYears: 2,
          experienceMaxYears: 6,
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: 15,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("experience_gap");
  });

  it("detects inverted experience band (SDE 2 with low years + senior expectations)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "SDE 2 - Fullstack",
          locationName: "Remote - Global",
          workplaceType: "remote",
          experienceMinYears: 2,
          experienceMaxYears: 6,
          normalizedText: "Senior ownership expected for this role.",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: 15,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("inverted_experience_band");
  });

  it("skips check when experience data is missing (soft-fail-open)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          experienceMaxYears: null,
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: 15,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("passes when applicant is within the experience range", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          experienceMinYears: 3,
          experienceMaxYears: 8,
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: 5,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// INTEGRATION: MULTIPLE BLOCKERS
// =============================================================================

describe("Gate 0.5 — Multiple blockers", () => {
  it("reports all blockers when multiple checks fail", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer - Latam",
          locationName: "Remote",
          workplaceType: "remote",
          titleRegionTag: "Latam",
          locationCountries: ["Mexico", "Argentina", "Colombia"],
          compensationMax: 30000,
          compensationCurrency: "USD",
        },
        applicant: {
          country: "RS",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: 60000,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    // Should have at least 2 blockers (title tag + country list + compensation)
    expect(result.blockers.length).toBeGreaterThanOrEqual(2);
    // First detected pattern is recorded
    expect(result.patternDetected).toBe("title_region_tag");
  });
});

// =============================================================================
// REGRESSION: COUNTRY MATCHING SUBSTRING FALSE POSITIVES
// =============================================================================
// locationMentionsCountry previously used String.includes(), which let short
// country codes match as substrings of unrelated words — e.g. "us" inside
// "Australia", "in" inside "Indonesia", "rs" inside "Lawyers". These caused
// Check 3 to wrongly PASS on-site jobs in foreign countries (the exact failure
// mode Gate 0.5 exists to prevent). These tests pin the non-letter boundary
// matching so the bug cannot regress.

describe("Gate 0.5 — country matching substring regression", () => {
  it("rejects US applicant for on-site job in Australia (not 'us' substring)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Sydney, Australia",
          workplaceType: "on-site",
        },
        applicant: {
          country: "US",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("explicit_on_site");
  });

  it("rejects India applicant for on-site job in Indonesia (not 'in' substring)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Jakarta, Indonesia",
          workplaceType: "on-site",
        },
        applicant: {
          country: "IN",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("explicit_on_site");
  });

  it("rejects Serbia applicant for on-site job at 'Lawyers HQ, USA' (not 'rs' substring)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Lawyers HQ, USA",
          workplaceType: "on-site",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("explicit_on_site");
  });

  it("still passes US applicant for on-site job in 'San Francisco, USA'", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "San Francisco, USA",
          workplaceType: "on-site",
        },
        applicant: {
          country: "US",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("still passes US applicant for remote job with 'Remote - US' location", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - US",
          workplaceType: "remote",
        },
        applicant: {
          country: "US",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("still passes India applicant for on-site job in 'Mumbai, India'", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Mumbai, India",
          workplaceType: "on-site",
        },
        applicant: {
          country: "IN",
          assignmentTypes: ["remote"],
          preferredCompliance: [],
          expectedCompMin: null,
          yearsOfExperience: null,
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("still rejects country list excluding applicant (no substring regression in Check 2)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Frontend Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          // v2: remoteScope = "country_fenced" triggers Check 2 hard-block.
          remoteScope: "country_fenced",
          locationCountries: ["Mexico", "Argentina", "Colombia", "India"],
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("location_country_list");
  });

  it("still passes country list including applicant (no substring regression in Check 2)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          // v2: remoteScope = "country_fenced" triggers Check 2.
          remoteScope: "country_fenced",
          locationCountries: ["Serbia", "Germany", "France"],
        },
      }),
    );
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// CHECK 2b: REMOTE + SPECIFIC FOREIGN LOCATION (Fix 2 — mismatch investigation)
// =============================================================================

describe("Gate 0.5 — Check 2b: Remote + specific foreign location", () => {
  it("rejects remote job in Pakistan for Serbia applicant with unknown scope", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Full Stack Developer",
          locationName: "Pakistan",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
    expect(result.blockers[0]).toContain("Pakistan");
    expect(result.blockers[0]).toContain("RS");
  });

  it("rejects remote job in 'Pune, MH, in' for Serbia applicant with undetermined scope", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Full Stack Java Developer",
          locationName: "Pune, MH, in",
          workplaceType: "remote",
          remoteScope: "undetermined",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
  });

  it("rejects remote job in 'San Francisco, CA' for Serbia applicant without US compliance", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer - Product (New Grad)",
          locationName: "San Francisco, CA",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
        applicant: {
          country: "RS",
          preferredCompliance: [],
        },
      }),
    );
    // "San Francisco, CA" doesn't contain "US" as a word, so the US exception
    // doesn't apply → hard-blocked as remote_specific_foreign_location.
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
  });

  it("passes remote job in US for Serbia applicant WITH w8ben compliance", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "San Francisco, United States",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
        applicant: {
          country: "RS",
          preferredCompliance: ["w8ben"],
        },
      }),
    );
    // US location + w8ben compliance → pass through to Gate 3
    expect(result.passes).toBe(true);
  });

  it("passes remote job in US for Serbia applicant WITH ic_global compliance", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "New York, USA",
          workplaceType: "remote",
          remoteScope: "undetermined",
        },
        applicant: {
          country: "RS",
          preferredCompliance: ["ic_global"],
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("rejects remote job in US for Serbia applicant WITHOUT w8ben/ic_global", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "San Francisco, United States",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
        applicant: {
          country: "RS",
          preferredCompliance: [],
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
  });

  it("passes remote job in applicant's own country", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Belgrade, Serbia",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
        applicant: {
          country: "RS",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("Fix 3: fires when remoteScope is global BUT location mentions a country (Pakistan)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Pakistan",
          workplaceType: "remote",
          remoteScope: "global",
        },
      }),
    );
    // Fix 3: remoteScope = "global" but location mentions "Pakistan" → Check 2b
    // fires because the location reveals country fencing the scope extractor missed
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
  });

  it("Fix 3: fires when remoteScope is global and location is 'Poland / Remote / Poland'", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Fullstack Developer (Java + React)",
          locationName: "Poland / Remote / Poland / Poland / Poland",
          workplaceType: "remote",
          remoteScope: "global",
        },
      }),
    );
    // NoFluffJobs format: "Poland / Remote / Poland" — location mentions Poland
    // even though "Remote" is also present. Check 2b fires.
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
  });

  it("does not fire when remoteScope is global and location is truly global ('Remote - Global')", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          remoteScope: "global",
        },
      }),
    );
    // "Remote - Global" has no country name → Check 2b doesn't fire
    expect(result.passes).toBe(true);
  });

  it("does not fire when remoteScope is global and location is bare 'Remote'", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote",
          workplaceType: "remote",
          remoteScope: "global",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("Fix 3: passes when remoteScope is global, location mentions country = applicant's country", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Poland / Remote / Poland",
          workplaceType: "remote",
          remoteScope: "global",
        },
        applicant: {
          country: "PL",
        },
      }),
    );
    // Location mentions Poland, applicant is in Poland → not foreign → passes
    expect(result.passes).toBe(true);
  });

  it("Fix 3: passes when remoteScope is global, location is US, applicant has w8ben", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "United States / Remote",
          workplaceType: "remote",
          remoteScope: "global",
        },
        applicant: {
          country: "RS",
          preferredCompliance: ["w8ben"],
        },
      }),
    );
    // US location + w8ben compliance → US exception → passes
    expect(result.passes).toBe(true);
  });

  it("does not fire when remoteScope is country_fenced (Check 2 handles it)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Pakistan",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["Pakistan"],
        },
      }),
    );
    // Check 2 handles country_fenced with locationCountries
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("location_country_list");
  });

  it("does not fire for non-remote jobs (on-site handled by Check 3)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Pakistan",
          workplaceType: "on-site",
          remoteScope: "unknown",
        },
      }),
    );
    // on-site in foreign country → Check 3 handles it
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("explicit_on_site");
  });

  it("does not fire for 'Remote - Global' location (not specific)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote - Global",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("does not fire Check 2b for 'European Union' location (broad region)", () => {
    // Check 2b should not fire for "European Union" — it's a broad region,
    // not a specific city. However, Check 7 (region-fenced) may fire if the
    // applicant's country is not in the EU. Serbia is not an EU member.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "European Union",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
      }),
    );
    // Check 2b should not fire (no "location_country_list" pattern from 2b),
    // but Check 7 fires with "region_fenced_location".
    expect(result.patternDetected).toBe("region_fenced_location");
    expect(result.passes).toBe(false);
  });

  it("PASSES 'European Union' location for EU member applicant", () => {
    // Applicant in Germany (EU member) — region check passes.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "European Union",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
        applicant: { country: "DE" },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("does not fire when locationName is null", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: null,
          workplaceType: "remote",
          remoteScope: "unknown",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("rejects remote job in India for Serbia applicant (Delhi case)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer (Remote, Full-Time)",
          locationName: "Delhi",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
  });

  it("rejects remote job in Spain for Serbia applicant (Airalo case)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Backend/PHP Engineer",
          locationName: "Spain",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("remote_specific_foreign_location");
  });
});

// =============================================================================
// CHECK 6: EXCLUDED COUNTRIES (admin-managed blocklist)
// =============================================================================

describe("Gate 0.5 — Check 6: Excluded countries", () => {
  it("blocks job with locationCountries matching excluded set", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "React Developer",
          locationName: "Mumbai, India",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["IN"],
        },
        excludedCountries: new Set(["IN", "PK"]),
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("excluded_country");
    expect(result.blockers[0]).toContain("IN");
  });

  it("blocks job with locationName mentioning excluded country (no structured codes)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Engineer",
          locationName: "Lahore, Pakistan",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
        excludedCountries: new Set(["IN", "PK"]),
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("excluded_country");
  });

  it("blocks job with locationName 'India' (extractLocationCountry path)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Full Stack Developer",
          locationName: "Bangalore, India",
          workplaceType: "remote",
          remoteScope: "unknown",
        },
        excludedCountries: new Set(["IN"]),
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("excluded_country");
  });

  it("does not block when excluded set is empty", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "React Developer",
          locationName: "Mumbai, India",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["IN"],
        },
        excludedCountries: new Set(),
      }),
    );
    // Check 6 doesn't fire, but Check 2b might (India is a specific foreign
    // location with unknown scope). The key assertion is that Check 6
    // doesn't add an "excluded_country" pattern.
    expect(result.patternDetected).not.toBe("excluded_country");
  });

  it("does not block when excludedCountries is undefined (not provided)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "React Developer",
          locationName: "Mumbai, India",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["IN"],
        },
      }),
    );
    expect(result.patternDetected).not.toBe("excluded_country");
  });

  it("does not block job in a non-excluded country", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "React Developer",
          locationName: "Berlin, Germany",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["DE"],
        },
        excludedCountries: new Set(["IN", "PK"]),
      }),
    );
    // Germany is not excluded — Check 6 doesn't fire. Check 2 may fire
    // (country_fenced + DE doesn't include RS), but the pattern won't be
    // "excluded_country".
    expect(result.patternDetected).not.toBe("excluded_country");
  });

  it("blocks for all applicants regardless of applicant country", () => {
    // Even an applicant in the excluded country should be blocked — the
    // admin exclusion is absolute, not per-applicant.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "React Developer",
          locationName: "Pune, India",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["IN"],
        },
        applicant: {
          country: "IN",
        },
        excludedCountries: new Set(["IN"]),
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("excluded_country");
  });

  it("blocks with lowercase country code in locationCountries (normalizes to uppercase)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "React Developer",
          locationName: "Karachi, Pakistan",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["pk"],
        },
        excludedCountries: new Set(["PK"]),
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("excluded_country");
  });
});

// =============================================================================
// REGRESSION TESTS — July 2026 Mismatch Investigation
// =============================================================================
// These tests cover the 5 root causes identified in the mismatch investigation:
//   Fix 2: Check 2 fallback parsing for ' / ' separators and single-item locations
//   Fix 5: Region-fenced check for broad regions like APAC
//
// Fix 1 (Gate 0.5 in matchBulkReprocess) and Fix 3 (scope extractor) are
// tested in their respective test files. Fix 4 (Gate 3 context) is tested
// in gate-3.test.ts.

describe("Gate 0.5 — July 2026 Mismatch Regression Tests", () => {
  // ── Fix 2: Check 2 fallback parsing ──────────────────────────────────────

  it("Fix 2: rejects 'Remote (US)' single-item location for RS applicant without w8ben", () => {
    // The old Check 2 fallback required 3+ comma-separated items, so
    // "Remote (US)" (1 item) was not detected as country-fenced.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Staff Software Engineer",
          locationName: "Remote (US)",
          workplaceType: "remote",
          remoteScope: "country_fenced",
        },
      }),
    );
    expect(result.passes).toBe(false);
  });

  it("Fix 2: passes 'Remote (US)' for RS applicant WITH w8ben compliance", () => {
    // US exception: w8ben compliance covers US contractor arrangements.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Staff Software Engineer",
          locationName: "Remote (US)",
          workplaceType: "remote",
          remoteScope: "country_fenced",
        },
        applicant: {
          country: "RS",
          preferredCompliance: ["w8ben"],
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("Fix 2: rejects 'Poland / Remote / Poland' location for RS applicant", () => {
    // The old Check 2 fallback only split on commas, not ' / ' separators.
    // NoFluffJobs format: "Poland / Remote / Poland / Poland"
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "React Developer",
          locationName: "Poland / Remote / Poland / Poland",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["PL"],
        },
      }),
    );
    expect(result.passes).toBe(false);
  });

  it("Fix 2: rejects 'Remote - U.S.' location for RS applicant without w8ben", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Staff Software Engineer (Core UI)",
          locationName: "Remote - U.S.",
          workplaceType: "remote",
          remoteScope: "country_fenced",
        },
      }),
    );
    expect(result.passes).toBe(false);
  });

  // ── Fix 5: Region-fenced location check ──────────────────────────────────

  it("Fix 5: rejects 'APAC' location for RS applicant (Serbia not in APAC)", () => {
    // The Greenhouse mismatch pattern: workplaceType=null, remoteScope=
    // undetermined, location="APAC". No other check caught this.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Web3 Frontend Developer",
          locationName: "APAC",
          workplaceType: null,
          remoteScope: "undetermined",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("region_fenced_location");
  });

  it("Fix 5: passes 'APAC' location for JP applicant (Japan in APAC)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Web3 Frontend Developer",
          locationName: "APAC",
          workplaceType: null,
          remoteScope: "undetermined",
        },
        applicant: { country: "JP" },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("Fix 5: rejects 'Latam' location for RS applicant (Serbia not in Latam)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Remote - Latam",
          workplaceType: "remote",
          remoteScope: "region_fenced",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("region_fenced_location");
  });

  it("Fix 5: passes 'EMEA' location for RS applicant (Serbia in EMEA)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "EMEA",
          workplaceType: "remote",
          remoteScope: "region_fenced",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("Fix 5: does not fire when remoteScope is explicitly 'global'", () => {
    // A global remote job with HQ in APAC should not be blocked.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "APAC",
          workplaceType: "remote",
          remoteScope: "global",
        },
      }),
    );
    expect(result.passes).toBe(true);
  });

  it("Fix 5: passes 'North America' for RS applicant with w8ben compliance", () => {
    // US exception: w8ben covers North America contractor arrangements.
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "North America",
          workplaceType: "remote",
          remoteScope: "region_fenced",
        },
        applicant: {
          country: "RS",
          preferredCompliance: ["w8ben"],
        },
      }),
    );
    expect(result.passes).toBe(true);
  });
});

// =============================================================================
// CHECK 8: WORK-AUTHORIZATION FENCING (Rule 5 revised — v4 lock)
// =============================================================================

describe("Gate 0.5 — Check 8: Work-authorization fencing (Rule 5 revised)", () => {
  it("blocks when location_countries=[US] + 'must be authorized to work in US' + RS applicant", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote - US",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["US"],
          normalizedText:
            "We are hiring a senior software engineer. Candidates must be authorized to work in the United States. This is a remote position within the US.",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("work_auth_fencing");
  });

  it("keeps when location_countries=[US] + 'work from anywhere' (contractor-friendly)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote - US",
          workplaceType: "remote",
          remoteScope: "global",
          locationCountries: ["US"],
          normalizedText:
            "We are hiring a senior software engineer. Work from anywhere. We are a distributed team across multiple time zones.",
        },
      }),
    );
    // Contractor-friendly language → keep (target global-remote role)
    expect(result.passes).toBe(true);
  });

  it("keeps when location_countries=[US,GB] + 'global remote' (Ruby Labs pattern)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior React Native Developer",
          locationName: "European Union",
          workplaceType: "remote",
          remoteScope: "global",
          locationCountries: ["US", "GB"],
          normalizedText:
            "We are hiring a senior developer. Global remote position. We welcome applicants from around the world.",
        },
      }),
    );
    // Contractor-friendly language → keep (target global-contractor role)
    expect(result.passes).toBe(true);
  });

  it("passes through when location_countries=[US] + no fencing language (ambiguous)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote - US",
          workplaceType: "remote",
          remoteScope: "global",
          locationCountries: ["US"],
          normalizedText:
            "We are hiring a senior software engineer to build scalable systems with React and Node.js.",
        },
      }),
    );
    // No fencing language, no contractor-friendly language → pass through
    // to Gate 3 (LLM evaluates — the "ambiguous" case from v4 lock §2)
    expect(result.passes).toBe(true);
  });

  it("blocks when location_countries=[PL] + 'must reside in Poland' + RS applicant", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Fullstack Developer",
          locationName: "Poland / Remote / Poland",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["PL"],
          normalizedText:
            "We are hiring a fullstack developer. Candidates must reside in Poland. This is a remote position within Poland.",
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("work_auth_fencing");
  });

  it("does not fire when applicant's country IS in location_countries", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote - US",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["US", "RS"],
          normalizedText:
            "We are hiring. Candidates must be authorized to work in the US or Serbia.",
        },
        applicant: { country: "RS" },
      }),
    );
    // RS is in the list → no fencing concern
    expect(result.passes).toBe(true);
  });

  it("falls back to Check 2 when normalizedText is null (no JD text to evaluate)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Senior Software Engineer",
          locationName: "Remote - US",
          workplaceType: "remote",
          remoteScope: "country_fenced",
          locationCountries: ["US"],
          normalizedText: null,
        },
      }),
    );
    // No JD text → Check 8 soft-fail-opens → Check 2 fires as fallback
    // (simple country-list exclusion for legacy jobs without normalizedText)
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("location_country_list");
  });

  it("does not fire for on-site jobs (handled by Check 3)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "San Francisco, CA",
          workplaceType: "on-site",
          remoteScope: "onsite",
          locationCountries: ["US"],
          normalizedText:
            "Must be authorized to work in the US. On-site position in San Francisco.",
        },
      }),
    );
    // On-site jobs are handled by Check 3, not Check 8
    expect(result.patternDetected).not.toBe("work_auth_fencing");
  });

  it("blocks when location_countries=[IN] + 'must be based in India' + RS applicant", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Full Stack Developer (MERN + LLMs)",
          locationName: "Pune",
          workplaceType: "remote",
          // C2 fix: must be country_fenced, not global — global-remote jobs
          // are never blocked by Check 8 (they're worldwide remote)
          remoteScope: "country_fenced",
          locationCountries: ["US", "IN", "HK"],
          normalizedText:
            "We are hiring a full stack developer. Candidates must be based in India for this role. We build agentic AI for SMBs globally.",
        },
      }),
    );
    // RS not in [US, IN, HK] + "must be based in India" fencing language → block
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("work_auth_fencing");
  });

  // C2 fix: global-remote jobs must never be blocked by Check 8
  it("C2: passes through global-remote jobs even with fencing language + applicant not in list", () => {
    const input = makeInput({
      job: {
        title: "Engineering Manager",
        workplaceType: "remote",
        remoteScope: "global",
        locationCountries: ["US"],
        locationName: "Remote, USA",
        normalizedText:
          "We are looking for an Engineering Manager. " +
          "Candidates must be authorized to work in the US. " +
          "Must reside in the United States.",
      },
      applicant: {
        country: "RS",
        assignmentTypes: ["remote"],
      },
    });

    const result = runHardBlockerPreFilter(input);

    // Even though the JD has fencing language ("must be authorized to work in the US",
    // "must reside in the United States"), the remote_scope extractor classified
    // this as "global" — meaning the JD also has worldwide remote indicators.
    // A global-remote job must NEVER be blocked by Check 8.
    expect(result.passes).toBe(true);
    expect(result.patternDetected).not.toBe("work_auth_fencing");
  });
});
