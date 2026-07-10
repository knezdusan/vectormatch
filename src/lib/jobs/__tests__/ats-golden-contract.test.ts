/**
 * Golden-Response ATS Schema Contract Tests
 * src/lib/jobs/__tests__/ats-golden-contract.test.ts
 *
 * These tests validate that comprehensive, realistic JSON fixtures (capturing
 * the full shape of real ATS API responses) still parse successfully against
 * the Zod schemas. Unlike the inline unit tests in ats-schemas.test.ts which
 * use minimal synthetic data, these golden fixtures include ALL optional
 * fields, edge cases, and real-world quirks discovered in production.
 *
 * Purpose:
 *   1. Catch schema drift — if someone modifies a Zod schema, the golden
 *      fixture must still parse. If it doesn't, the schema change is breaking.
 *   2. Document the actual API response shape for each ATS platform.
 *   3. Catch API changes — if an ATS changes their response format, updating
 *      the golden fixture forces a conscious review of the schema.
 *
 * When a golden fixture fails to parse:
 *   - If the API changed: update the fixture to match the new shape, then
 *     verify the schema still accepts it (or update the schema if needed).
 *   - If the schema changed: verify the schema change is intentional, then
 *     update the fixture if the change is compatible.
 *
 * Fixtures live in __fixtures__/ alongside this test file.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ashbyJobsResponseSchema,
  greenhouseJobsResponseSchema,
  leverJobsResponseSchema,
  recruiteeJobsResponseSchema,
  smartRecruitersJobDetailSchema,
  smartRecruitersJobsResponseSchema,
  workableJobsResponseSchema,
} from "@/lib/jobs/ats-schemas";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, "__fixtures__");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf-8"));
}

// =============================================================================
// GREENHOUSE — Job Board API v1
// =============================================================================

describe("Golden contract: Greenhouse", () => {
  it("full response with all optional fields parses successfully", () => {
    const fixture = loadFixture("greenhouse-golden.json");
    const result = greenhouseJobsResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobs).toHaveLength(2);
      // Job 1: comprehensive with all fields
      const job1 = result.data.jobs[0];
      expect(job1.id).toBe(489021);
      expect(job1.internal_job_id).toBe(489020);
      expect(job1.title).toBe("Senior Frontend Engineer, Platform");
      expect(job1.absolute_url).toContain("boards.greenhouse.io");
      expect(job1.location?.name).toBe("Remote - Global");
      expect(job1.departments).toHaveLength(1);
      expect(job1.offices).toHaveLength(2);
      expect(job1.metadata).toHaveLength(4);
      // Metadata value types: boolean, string, object, string
      expect(job1.metadata?.[0]?.value).toBe(true);
      expect(job1.metadata?.[2]?.value).toEqual({ id: 5, name: "Senior" });
      expect(job1.language).toBe("en");

      // Job 2: minimal with nulls
      const job2 = result.data.jobs[1];
      expect(job2.internal_job_id).toBeNull();
      expect(job2.requisition_id).toBeNull();
      expect(job2.metadata).toBeNull();
      expect(job2.departments).toBeUndefined();
    }
  });

  it("meta.total is extracted correctly", () => {
    const fixture = loadFixture("greenhouse-golden.json");
    const result = greenhouseJobsResponseSchema.safeParse(fixture);
    if (result.success) {
      expect(result.data.meta?.total).toBe(2);
    }
  });
});

// =============================================================================
// LEVER — Postings API v0
// =============================================================================

describe("Golden contract: Lever", () => {
  it("bare array response with full + minimal jobs parses successfully", () => {
    const fixture = loadFixture("lever-golden.json");
    const result = leverJobsResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      // Job 1: full fields
      const job1 = result.data[0];
      expect(job1.id).toBe("abc123-def456");
      expect(job1.text).toBe("Senior React Engineer");
      expect(job1.hostedUrl).toContain("jobs.lever.co");
      expect(job1.categories?.location).toBe("Remote - US");
      expect(job1.categories?.allLocations).toHaveLength(3);
      expect(job1.salaryRange?.currency).toBe("USD");
      expect(job1.salaryRange?.min).toBe(150000);
      expect(job1.workplaceType).toBe("remote");

      // Job 2: minimal with nulls
      const job2 = result.data[1];
      expect(job2.categories?.location).toBeNull();
      expect(job2.descriptionPlain).toBeUndefined();
      expect(job2.salaryRange).toBeUndefined();
    }
  });
});

// =============================================================================
// ASHBY — Public Job Posting API
// =============================================================================

describe("Golden contract: Ashby", () => {
  it("response with passthrough fields + isRemote variants parses successfully", () => {
    const fixture = loadFixture("ashby-golden.json");
    const result = ashbyJobsResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jobs).toHaveLength(3);
      // Job 1: full with passthrough custom fields
      const job1 = result.data.jobs[0];
      expect(job1.id).toBe("job-uuid-001");
      expect(job1.title).toBe("Senior Fullstack Engineer");
      expect(job1.workplaceType).toBe("Remote");
      expect(job1.isRemote).toBe("true"); // string variant
      expect(job1.isListed).toBe(true);
      // Passthrough fields preserved
      expect((job1 as Record<string, unknown>).compensation).toBeDefined();
      expect((job1 as Record<string, unknown>).customFields).toBeDefined();

      // Job 2: isRemote as boolean, isListed=false
      const job2 = result.data.jobs[1];
      expect(job2.isRemote).toBe(false);
      expect(job2.isListed).toBe(false);

      // Job 3: isRemote as null
      const job3 = result.data.jobs[2];
      expect(job3.isRemote).toBeNull();
      expect(job3.workplaceType).toBe("Hybrid");
    }
  });

  it("board-level passthrough fields are preserved", () => {
    const fixture = loadFixture("ashby-golden.json");
    const result = ashbyJobsResponseSchema.safeParse(fixture);
    if (result.success) {
      expect((result.data as Record<string, unknown>).board).toBeDefined();
    }
  });
});

// =============================================================================
// SMARTRECRUITERS — Posting API v1
// =============================================================================

describe("Golden contract: SmartRecruiters", () => {
  it("list response with content array + all nested objects parses", () => {
    const fixture = loadFixture("smartrecruiters-golden.json");
    const result = smartRecruitersJobsResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toHaveLength(2);
      expect(result.data.totalFound).toBe(2);
      // Job 1: full with all nested objects
      const job1 = result.data.content[0];
      expect(job1.id).toBe("posting-uuid-001");
      expect(job1.name).toBe("Senior Frontend Developer");
      expect(job1.location?.remote).toBe(true);
      expect(job1.department?.label).toBe("Engineering");
      expect(job1.typeOfEmployment?.label).toBe("Permanent");
      expect(job1.experienceLevel?.label).toBe("Senior");

      // Job 2: minimal with nulls + numeric department id
      const job2 = result.data.content[1];
      expect(job2.location?.remote).toBe(false);
      expect(job2.department?.id).toBe(123); // union string|number
      expect(job2.experienceLevel).toBeNull();
    }
  });

  it("detail response with jobAd.sections parses successfully", () => {
    const fixture = loadFixture("smartrecruiters-detail-golden.json");
    const result = smartRecruitersJobDetailSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("posting-uuid-001");
      expect(result.data.jobAd?.sections?.description?.text).toContain(
        "Senior Frontend Developer",
      );
      expect(result.data.jobAd?.sections?.qualifications?.text).toContain(
        "5+ years",
      );
      expect(result.data.jobAd?.sections?.companyDescription?.title).toBe(
        "About Us",
      );
      expect(result.data.applyUrl).toContain("careers.smartrecruiters.com");
    }
  });
});

// =============================================================================
// WORKABLE — Public Widget API v1
// =============================================================================

describe("Golden contract: Workable", () => {
  it("widget response with jobs array parses successfully", () => {
    const fixture = loadFixture("workable-golden.json");
    const result = workableJobsResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Acme Corp");
      expect(result.data.jobs).toHaveLength(2);
      // Job 1: full with description
      const job1 = result.data.jobs[0];
      expect(job1.title).toBe("Senior Vue.js Developer");
      expect(job1.workplace).toBe("remote");
      expect(job1.location?.country).toBe("Worldwide");
      expect(job1.description).toContain("Vue.js");
      expect(job1.shortcode).toBe("ABC001");

      // Job 2: minimal with nulls
      const job2 = result.data.jobs[1];
      expect(job2.companyName).toBeNull();
      expect(job2.description).toBeUndefined();
      expect(job2.publishedAt).toBeNull();
    }
  });
});

// =============================================================================
// RECRUITEE — Careers Site API v1
// =============================================================================

describe("Golden contract: Recruitee", () => {
  it("offers response with full + minimal jobs parses successfully", () => {
    const fixture = loadFixture("recruitee-golden.json");
    const result = recruiteeJobsResponseSchema.safeParse(fixture);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offers).toHaveLength(2);
      // Job 1: full with locations array
      const job1 = result.data.offers[0];
      expect(job1.id).toBe(12345);
      expect(job1.title).toBe("Senior Python Developer");
      expect(job1.remote).toBe(true);
      expect(job1.on_site).toBe(false);
      expect(job1.locations).toHaveLength(2);
      expect(job1.locations?.[0]?.country).toBe("Worldwide");
      expect(job1.locations?.[1]?.country_code).toBe("DE");
      expect(job1.employment_type_code).toBe("fulltime_permanent");

      // Job 2: minimal with nulls
      const job2 = result.data.offers[1];
      expect(job2.company_name).toBeNull();
      expect(job2.remote).toBeNull();
      expect(job2.locations).toHaveLength(0);
      expect(job2.published_at).toBeNull();
    }
  });
});

// =============================================================================
// CROSS-CUTTING: All golden fixtures must parse without throwing
// =============================================================================

describe("Golden contract: all fixtures safeParse without throwing", () => {
  const fixtures = [
    { name: "greenhouse-golden.json", schema: greenhouseJobsResponseSchema },
    { name: "lever-golden.json", schema: leverJobsResponseSchema },
    { name: "ashby-golden.json", schema: ashbyJobsResponseSchema },
    {
      name: "smartrecruiters-golden.json",
      schema: smartRecruitersJobsResponseSchema,
    },
    {
      name: "smartrecruiters-detail-golden.json",
      schema: smartRecruitersJobDetailSchema,
    },
    { name: "workable-golden.json", schema: workableJobsResponseSchema },
    { name: "recruitee-golden.json", schema: recruiteeJobsResponseSchema },
  ];

  for (const { name, schema } of fixtures) {
    it(`${name} parses without throwing`, () => {
      const fixture = loadFixture(name);
      expect(() => schema.safeParse(fixture)).not.toThrow();
    });
  }
});
