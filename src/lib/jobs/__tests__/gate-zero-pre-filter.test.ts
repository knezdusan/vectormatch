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
  overrides: { job?: JobOverrides; applicant?: ApplicantOverrides } = {},
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
});

// =============================================================================
// PATTERN 3: NO REMOTE DESIGNATION = ON-SITE DEFAULT
// =============================================================================

describe("Gate 0.5 — Pattern 3: No remote designation", () => {
  it("rejects on-site job in foreign country with null workplaceType (CloudSEK case)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "SDE 2 - Fullstack",
          locationName: "Bengaluru, Karnataka, India",
          workplaceType: null, // No designation — defaults to on-site
        },
      }),
    );
    expect(result.passes).toBe(false);
    expect(result.patternDetected).toBe("default_on_site");
    expect(result.blockers[0]).toContain("Bengaluru");
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

  it("passes hybrid job (Check 3 does not apply)", () => {
    const result = runHardBlockerPreFilter(
      makeInput({
        job: {
          title: "Software Engineer",
          locationName: "Hybrid - London, UK",
          workplaceType: "hybrid",
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

  it("normalizes monthly compensation to annual", () => {
    // $3000/month = $36000/year, which is below 70% of $60000 = $42000
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
          compensationMax: 2500,
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
