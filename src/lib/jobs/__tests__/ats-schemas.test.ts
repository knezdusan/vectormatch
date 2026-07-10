/**
 * Unit tests for the defensive ATS Zod schemas (TDD §4.2.3).
 *
 * These schemas are the boundary between external APIs we don't control and
 * our ingestion pipeline. The critical invariant is the safeParse pattern:
 * a malformed or partial response must NEVER throw — it must return
 * `{ success: false, error }` so the poller can skip the slug and mark the
 * company as `health = "degraded"` without crashing the worker.
 *
 * Test coverage:
 *   - Valid payloads parse successfully (happy path for each ATS)
 *   - Missing required fields fail gracefully (safeParse, not throw)
 *   - Optional fields can be absent without failing
 *   - Ashby's passthrough allows unknown extra fields
 *   - Lever's response is a bare array (not wrapped in an object)
 *   - URL fields reject non-URL strings
 */

import {
  ashbyJobSchema,
  ashbyJobsResponseSchema,
  greenhouseJobSchema,
  greenhouseJobsResponseSchema,
  leverJobSchema,
  leverJobsResponseSchema,
  recruiteeJobSchema,
  recruiteeJobsResponseSchema,
  smartRecruitersJobSchema,
  smartRecruitersJobsResponseSchema,
  workableJobSchema,
  workableJobsResponseSchema,
} from "@/lib/jobs/ats-schemas";

// ── Greenhouse ───────────────────────────────────────────────────────────────

describe("greenhouseJobSchema", () => {
  const validJob = {
    id: 12345,
    title: "Senior Frontend Engineer",
    absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
  };

  it("parses a minimal valid job (only required fields)", () => {
    const result = greenhouseJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("parses a full job with all optional fields", () => {
    const result = greenhouseJobSchema.safeParse({
      ...validJob,
      internal_job_id: 67890,
      updated_at: "2024-01-15T10:00:00Z",
      requisition_id: "REQ-001",
      location: { name: "Remote (US)" },
      content: "<p>Job description</p>",
      metadata: [{ name: "Department", value: "Engineering" }],
      language: "en",
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with ?content=true fields (departments, offices, company_name)", () => {
    const result = greenhouseJobSchema.safeParse({
      ...validJob,
      content: "<p>Job description</p>",
      departments: [{ id: 1, name: "Engineering" }],
      offices: [{ id: 1, name: "New York", location: "NYC" }],
      first_published: "2026-06-25T18:20:09-04:00",
      company_name: "Chime Financial, Inc",
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with null internal_job_id (real Greenhouse API)", () => {
    // Regression test: discovered during backfill 2026-06-26 that the weareenvoy
    // board returns internal_job_id: null (not a number, not absent).
    const result = greenhouseJobSchema.safeParse({
      ...validJob,
      internal_job_id: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with null metadata", () => {
    const result = greenhouseJobSchema.safeParse({
      ...validJob,
      metadata: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with boolean metadata values (real Greenhouse API)", () => {
    // Regression test: discovered via live smoke test 2026-06-23 that Airbnb's
    // Greenhouse board returns boolean metadata values (e.g. "Remote eligible").
    const result = greenhouseJobSchema.safeParse({
      ...validJob,
      metadata: [
        { name: "Remote eligible", value: true },
        { name: "Department", value: "Engineering" },
        { name: "Openings", value: 3 },
        { name: "Custom field", value: null },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with object metadata values (real Greenhouse API)", () => {
    // Regression test: discovered during backfill 2026-06-26 that qventus's
    // Greenhouse board returns object metadata values (e.g. custom department
    // fields with {id, name} structure).
    const result = greenhouseJobSchema.safeParse({
      ...validJob,
      metadata: [
        { name: "Department", value: { id: 123, name: "Engineering" } },
        { name: "Location", value: { city: "SF", state: "CA" } },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("fails when id is missing", () => {
    const result = greenhouseJobSchema.safeParse({
      title: "Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
    });
    expect(result.success).toBe(false);
  });

  it("fails when title is missing", () => {
    const result = greenhouseJobSchema.safeParse({
      id: 1,
      absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
    });
    expect(result.success).toBe(false);
  });

  it("fails when absolute_url is not a valid URL", () => {
    const result = greenhouseJobSchema.safeParse({
      ...validJob,
      absolute_url: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("fails when absolute_url is missing", () => {
    const result = greenhouseJobSchema.safeParse({
      id: 1,
      title: "Engineer",
    });
    expect(result.success).toBe(false);
  });

  it("does not throw on malformed input (safeParse contract)", () => {
    expect(() => greenhouseJobSchema.safeParse(null)).not.toThrow();
    expect(() => greenhouseJobSchema.safeParse(undefined)).not.toThrow();
    expect(() => greenhouseJobSchema.safeParse("string")).not.toThrow();
  });
});

describe("greenhouseJobsResponseSchema", () => {
  it("parses a response with jobs and meta", () => {
    const result = greenhouseJobsResponseSchema.safeParse({
      jobs: [
        {
          id: 1,
          title: "Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
        },
      ],
      meta: { total: 1 },
    });
    expect(result.success).toBe(true);
  });

  it("parses a response with empty jobs array", () => {
    const result = greenhouseJobsResponseSchema.safeParse({ jobs: [] });
    expect(result.success).toBe(true);
  });

  it("parses a response without meta", () => {
    const result = greenhouseJobsResponseSchema.safeParse({
      jobs: [
        {
          id: 1,
          title: "Engineer",
          absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("fails when jobs is missing", () => {
    const result = greenhouseJobsResponseSchema.safeParse({
      meta: { total: 0 },
    });
    expect(result.success).toBe(false);
  });
});

// ── Lever ────────────────────────────────────────────────────────────────────

describe("leverJobSchema", () => {
  const validJob = {
    id: "abc-123-def",
    text: "Senior React Engineer",
    hostedUrl: "https://jobs.lever.co/acme/abc-123-def",
  };

  it("parses a minimal valid job (only required fields)", () => {
    const result = leverJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("parses a full job with all optional fields", () => {
    const result = leverJobSchema.safeParse({
      ...validJob,
      categories: {
        location: "Remote (US)",
        commitment: "Full-time",
        team: "Frontend",
        department: "Engineering",
        allLocations: ["Remote (US)", "Remote (EU)"],
      },
      country: "US",
      descriptionPlain: "Plain text description",
      description: "<p>HTML description</p>",
      applyUrl: "https://jobs.lever.co/acme/abc-123-def/apply",
      workplaceType: "remote",
      salaryRange: {
        currency: "USD",
        interval: "per-year-salary",
        min: 120000,
        max: 180000,
      },
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with null optional fields", () => {
    const result = leverJobSchema.safeParse({
      ...validJob,
      categories: {
        location: null,
        commitment: null,
        team: null,
        department: null,
      },
      country: null,
      salaryRange: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with unknown workplaceType value (real Lever API)", () => {
    // Regression test: discovered via live smoke test 2026-06-23 that the tonic
    // slug returned a workplaceType value not in our original enum. We don't use
    // this field in normalization, so any string is accepted.
    const result = leverJobSchema.safeParse({
      ...validJob,
      workplaceType: "some-new-workplace-type",
    });
    expect(result.success).toBe(true);
  });

  it("fails when id is missing", () => {
    const result = leverJobSchema.safeParse({
      text: "Engineer",
      hostedUrl: "https://jobs.lever.co/acme/1",
    });
    expect(result.success).toBe(false);
  });

  it("fails when text (title) is missing", () => {
    const result = leverJobSchema.safeParse({
      id: "1",
      hostedUrl: "https://jobs.lever.co/acme/1",
    });
    expect(result.success).toBe(false);
  });

  it("fails when hostedUrl is not a valid URL", () => {
    const result = leverJobSchema.safeParse({
      ...validJob,
      hostedUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("does not throw on malformed input (safeParse contract)", () => {
    expect(() => leverJobSchema.safeParse(null)).not.toThrow();
    expect(() => leverJobSchema.safeParse(42)).not.toThrow();
  });
});

describe("leverJobsResponseSchema", () => {
  it("parses a bare array of jobs (Lever v0 response shape)", () => {
    const result = leverJobsResponseSchema.safeParse([
      {
        id: "1",
        text: "Engineer",
        hostedUrl: "https://jobs.lever.co/acme/1",
      },
      {
        id: "2",
        text: "Designer",
        hostedUrl: "https://jobs.lever.co/acme/2",
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  it("parses an empty array", () => {
    const result = leverJobsResponseSchema.safeParse([]);
    expect(result.success).toBe(true);
  });

  it("fails when given an object instead of an array", () => {
    const result = leverJobsResponseSchema.safeParse({
      jobs: [
        {
          id: "1",
          text: "Engineer",
          hostedUrl: "https://jobs.lever.co/acme/1",
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

// ── Ashby ────────────────────────────────────────────────────────────────────

describe("ashbyJobSchema", () => {
  const validJob = {
    id: "ashby-job-001",
    title: "Staff Software Engineer",
  };

  it("parses a minimal valid job (only required fields)", () => {
    const result = ashbyJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("parses a full job with all optional fields", () => {
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      location: "Remote (Global)",
      descriptionHtml: "<p>Job description</p>",
      descriptionPlain: "Plain text description",
      jobUrl: "https://jobs.ashbyhq.com/acme/ashby-job-001",
      applyUrl: "https://jobs.ashbyhq.com/acme/ashby-job-001/application",
      workplaceType: "Remote",
      employmentType: "FullTime",
      isRemote: "true",
      department: "Engineering",
      team: "Platform",
      publishedAt: "2026-06-26T01:57:53.065+00:00",
      shouldDisplayCompensationOnJobPostings: true,
    });
    expect(result.success).toBe(true);
  });

  it("allows unknown extra fields (passthrough — Ashby adds fields frequently)", () => {
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      // Ashby may add fields like compensation, departmentList, etc. without notice
      compensation: { min: 150000, max: 200000, currency: "USD" },
      departmentList: [{ id: "d1", name: "Engineering" }],
      someUnknownFutureField: { nested: { data: true } },
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with location as a string (real Ashby API)", () => {
    // The Public Job Posting API always returns location as a string.
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      location: "Remote (Global)",
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with isRemote as boolean (docs say boolean)", () => {
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      isRemote: true,
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with isRemote as string (real data returns string)", () => {
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      isRemote: "false",
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with isRemote as null", () => {
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      isRemote: null,
    });
    expect(result.success).toBe(true);
  });

  it("parses a job with workplaceType as null (53.5% of real data)", () => {
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      workplaceType: null,
    });
    expect(result.success).toBe(true);
  });

  it("fails when id is missing", () => {
    const result = ashbyJobSchema.safeParse({ title: "Engineer" });
    expect(result.success).toBe(false);
  });

  it("fails when title is missing", () => {
    const result = ashbyJobSchema.safeParse({ id: "1" });
    expect(result.success).toBe(false);
  });

  it("fails when jobUrl is not a valid URL", () => {
    const result = ashbyJobSchema.safeParse({
      ...validJob,
      jobUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("does not throw on malformed input (safeParse contract)", () => {
    expect(() => ashbyJobSchema.safeParse(null)).not.toThrow();
    expect(() => ashbyJobSchema.safeParse("string")).not.toThrow();
  });
});

describe("ashbyJobsResponseSchema", () => {
  it("parses a response with jobs", () => {
    const result = ashbyJobsResponseSchema.safeParse({
      jobs: [
        { id: "1", title: "Engineer" },
        { id: "2", title: "Designer" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("parses an empty jobs array", () => {
    const result = ashbyJobsResponseSchema.safeParse({ jobs: [] });
    expect(result.success).toBe(true);
  });

  it("allows unknown top-level fields (passthrough)", () => {
    const result = ashbyJobsResponseSchema.safeParse({
      jobs: [{ id: "1", title: "Engineer" }],
      // Ashby may wrap additional metadata at the response level
      boardVersion: "2.0",
      lastUpdated: "2024-01-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("fails when jobs is missing", () => {
    const result = ashbyJobsResponseSchema.safeParse({ boardVersion: "2.0" });
    expect(result.success).toBe(false);
  });
});

// ── SmartRecruiters (F2) ─────────────────────────────────────────────────────

describe("smartRecruitersJobSchema", () => {
  const validJob = {
    id: "74983486",
    name: "Senior Frontend Engineer",
  };

  it("parses a minimal valid job (only required fields)", () => {
    const result = smartRecruitersJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("parses a full job with all optional fields", () => {
    const result = smartRecruitersJobSchema.safeParse({
      ...validJob,
      uuid: "34225731-e7cf-4584-b0b7-78098fe1a66b",
      company: { identifier: "acme", name: "Acme Corp" },
      releasedDate: "2024-01-15T10:00:00Z",
      location: {
        city: "San Francisco",
        region: "CA",
        country: "us",
        remote: true,
      },
      department: { id: 18554, label: "Engineering" },
      typeOfEmployment: { id: "permanent", label: "Full-time" },
      experienceLevel: { id: "mid_senior_level", label: "Mid-Senior Level" },
      ref: "https://api.smartrecruiters.com/v1/companies/acme/postings/74983486",
    });
    expect(result.success).toBe(true);
  });

  it("fails when id is missing", () => {
    const result = smartRecruitersJobSchema.safeParse({ name: "Engineer" });
    expect(result.success).toBe(false);
  });

  it("fails when name (title) is missing", () => {
    const result = smartRecruitersJobSchema.safeParse({ id: "123" });
    expect(result.success).toBe(false);
  });

  it("allows extra fields via passthrough", () => {
    const result = smartRecruitersJobSchema.safeParse({
      ...validJob,
      customField: "something",
      unknownFutureField: 42,
    });
    expect(result.success).toBe(true);
  });
});

describe("smartRecruitersJobsResponseSchema", () => {
  it("parses a valid response with content array", () => {
    const result = smartRecruitersJobsResponseSchema.safeParse({
      limit: 100,
      offset: 0,
      totalFound: 2,
      content: [
        { id: "1", name: "Engineer" },
        { id: "2", name: "Designer" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("fails when content is missing", () => {
    const result = smartRecruitersJobsResponseSchema.safeParse({
      limit: 100,
      offset: 0,
    });
    expect(result.success).toBe(false);
  });

  it("allows extra fields via passthrough", () => {
    const result = smartRecruitersJobsResponseSchema.safeParse({
      content: [{ id: "1", name: "Engineer" }],
      provider: "SmartRecruiters",
    });
    expect(result.success).toBe(true);
  });
});

// ── Workable (F2) ────────────────────────────────────────────────────────────

describe("workableJobSchema", () => {
  const validJob = {
    title: "Backend Developer",
    shortcode: "ABC123",
  };

  it("parses a minimal valid job (only title required)", () => {
    const result = workableJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("parses a full job with all optional fields", () => {
    const result = workableJobSchema.safeParse({
      ...validJob,
      id: "abc:ABC123",
      companyName: "Acme Corp",
      department: "Engineering",
      employmentType: "Full-time",
      workplace: "remote",
      location: { city: "Berlin", country: "Germany", countryCode: "DE" },
      url: "https://apply.workable.com/j/ABC123",
      applyUrl: "https://apply.workable.com/j/ABC123/apply",
      description: "<p>Job description</p>",
      publishedAt: "2024-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("fails when title is missing", () => {
    const result = workableJobSchema.safeParse({ shortcode: "ABC" });
    expect(result.success).toBe(false);
  });

  it("allows extra fields via passthrough", () => {
    const result = workableJobSchema.safeParse({
      ...validJob,
      unknownField: "value",
    });
    expect(result.success).toBe(true);
  });
});

describe("workableJobsResponseSchema", () => {
  it("parses the widget API response object with jobs array", () => {
    const result = workableJobsResponseSchema.safeParse({
      name: "Acme Corp",
      description: "<p>We make things.</p>",
      jobs: [
        { title: "Engineer", shortcode: "A1" },
        { title: "Designer", shortcode: "A2" },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.jobs).toHaveLength(2);
  });

  it("parses a response with empty jobs array", () => {
    const result = workableJobsResponseSchema.safeParse({
      name: "Empty Corp",
      description: null,
      jobs: [],
    });
    expect(result.success).toBe(true);
    expect(result.data?.jobs).toHaveLength(0);
  });

  it("fails on a bare array (old incorrect format)", () => {
    const result = workableJobsResponseSchema.safeParse([
      { title: "Engineer", shortcode: "A1" },
    ]);
    expect(result.success).toBe(false);
  });
});

// ── Recruitee (F2) ───────────────────────────────────────────────────────────

describe("recruiteeJobSchema", () => {
  const validJob = {
    id: 1853589,
    title: "Senior Python Developer",
  };

  it("parses a minimal valid job (id + title required)", () => {
    const result = recruiteeJobSchema.safeParse(validJob);
    expect(result.success).toBe(true);
  });

  it("parses a full job with all optional fields", () => {
    const result = recruiteeJobSchema.safeParse({
      ...validJob,
      company_name: "Acme Corp",
      slug: "senior-python-developer",
      department: "Engineering",
      status: "published",
      careers_url: "https://acme.recruitee.com/o/senior-python-developer",
      careers_apply_url:
        "https://acme.recruitee.com/o/senior-python-developer/c/new",
      description: "We are looking for a Python developer",
      requirements: "5+ years of Python experience",
      remote: true,
      on_site: false,
      hybrid: false,
      employment_type_code: "fulltime_permanent",
      locations: [
        { id: 1, city: "Berlin", country: "Germany", country_code: "DE" },
      ],
      published_at: "2024-01-15 10:00:00 UTC",
    });
    expect(result.success).toBe(true);
  });

  it("fails when id is missing", () => {
    const result = recruiteeJobSchema.safeParse({ title: "Engineer" });
    expect(result.success).toBe(false);
  });

  it("fails when title is missing", () => {
    const result = recruiteeJobSchema.safeParse({ id: 123 });
    expect(result.success).toBe(false);
  });

  it("allows extra fields via passthrough", () => {
    const result = recruiteeJobSchema.safeParse({
      ...validJob,
      custom_field: "value",
    });
    expect(result.success).toBe(true);
  });
});

describe("recruiteeJobsResponseSchema", () => {
  it("parses a valid response with offers array", () => {
    const result = recruiteeJobsResponseSchema.safeParse({
      offers: [
        { id: 1, title: "Engineer" },
        { id: 2, title: "Designer" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("fails when offers is missing", () => {
    const result = recruiteeJobsResponseSchema.safeParse({ jobs: [] });
    expect(result.success).toBe(false);
  });

  it("allows extra fields via passthrough", () => {
    const result = recruiteeJobsResponseSchema.safeParse({
      offers: [{ id: 1, title: "Engineer" }],
      meta: { total: 1 },
    });
    expect(result.success).toBe(true);
  });
});
