/**
 * Unit tests for SmartRecruiters Tier 2 Selective Detail Fetch (Sprint 4 Task 7)
 *
 * Tests:
 *   - enrichSmartRecruitersJobs: selective detail fetch for short-metadata jobs
 *   - MIN_FULLTEXT_LENGTH / MAX_DETAIL_FETCHES constants
 *   - Detail fetch failure handling (non-fatal)
 *   - Rate limiting cap (MAX_DETAIL_FETCHES)
 *   - Merging detail data into rawJson
 *
 * The fetchFn is mocked — no real HTTP calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobMetadata } from "@/lib/jobs/job-normalizer";
import type { NormalizedJob } from "@/lib/jobs/poller/ats-adapters";
import {
  enrichSmartRecruitersJobs,
  MAX_DETAIL_FETCHES,
  MIN_FULLTEXT_LENGTH,
} from "@/lib/jobs/poller/smartrecruiters-detail";
import type { FetchFn } from "@/lib/jobs/types";

// ── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_METADATA: JobMetadata = {
  workplaceType: null,
  employmentType: null,
  locationName: null,
  department: null,
  team: null,
  applyUrl: null,
  publishedAt: null,
  companyName: null,
  titleRegionTag: null,
  locationCountries: null,
  experienceMinYears: null,
  experienceMaxYears: null,
  compensationMin: null,
  compensationMax: null,
  compensationCurrency: null,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a SmartRecruiters list-endpoint job with minimal metadata (short fullText). */
function makeShortJob(id: string): NormalizedJob {
  return {
    externalJobId: id,
    title: "Dev",
    rawJson: JSON.stringify({
      id,
      name: "Dev",
      company: { identifier: "acme", name: "Acme" },
    }),
    url: undefined,
    metadata: EMPTY_METADATA,
  };
}

/** Create a SmartRecruiters list-endpoint job with enough metadata (long fullText). */
function makeLongJob(id: string): NormalizedJob {
  return {
    externalJobId: id,
    title: "Senior Software Engineer",
    rawJson: JSON.stringify({
      id,
      name: "Senior Software Engineer",
      department: { label: "Engineering and Platform Infrastructure" },
      typeOfEmployment: { label: "Full-time Permanent Position" },
      location: {
        city: "San Francisco",
        country: "United States of America",
        remote: false,
      },
      company: { identifier: "acme", name: "Acme Corporation Worldwide" },
    }),
    url: undefined,
    metadata: EMPTY_METADATA,
  };
}

/** Create a mock detail response with jobAd.sections. */
function makeDetailResponse(id: string): unknown {
  return {
    id,
    name: "Dev",
    jobAd: {
      sections: {
        jobDescription: {
          title: "Job Description",
          text: "We are looking for a developer to join our team. You will work on TypeScript, React, and Node.js applications. Must have 3+ years of experience.",
        },
        qualifications: {
          title: "Qualifications",
          text: "3+ years TypeScript. Strong React skills. Node.js backend experience.",
        },
        companyDescription: {
          title: "Company Description",
          text: "Acme Corp builds developer tools.",
        },
      },
    },
    applyUrl: "https://jobs.smartrecruiters.com/acme/123",
  };
}

/** Create a mock fetchFn that returns detail responses for specific URLs. */
function makeMockFetchFn(
  detailResponses: Map<string, unknown>,
  failUrls = new Set<string>(),
): FetchFn {
  return vi.fn(async (url: string) => {
    if (failUrls.has(url)) {
      return new Response("Internal Server Error", { status: 500 });
    }
    const detail = detailResponses.get(url);
    if (detail) {
      return new Response(JSON.stringify(detail), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as unknown as FetchFn;
}

// ── Constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("MIN_FULLTEXT_LENGTH is 100", () => {
    expect(MIN_FULLTEXT_LENGTH).toBe(100);
  });

  it("MAX_DETAIL_FETCHES is 10", () => {
    expect(MAX_DETAIL_FETCHES).toBe(10);
  });
});

// ── enrichSmartRecruitersJobs ────────────────────────────────────────────────

describe("enrichSmartRecruitersJobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not fetch detail for jobs with long enough Tier 1 fullText", async () => {
    const jobs = [makeLongJob("1")];
    const fetchFn = makeMockFetchFn(new Map());

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(0);
    expect(result.fetchesSucceeded).toBe(0);
    expect(result.unchanged).toHaveLength(1);
    expect(result.enriched).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetches detail for jobs with short Tier 1 fullText", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl =
      "https://api.smartrecruiters.com/v1/companies/acme/postings/1";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeDetailResponse("1")]]),
    );

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(1);
    expect(result.enriched).toHaveLength(1);
    expect(result.unchanged).toHaveLength(0);
  });

  it("merges jobAd.sections into the job rawJson", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl =
      "https://api.smartrecruiters.com/v1/companies/acme/postings/1";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeDetailResponse("1")]]),
    );

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    const enrichedJob = result.enriched[0];
    const rawJson = JSON.parse(enrichedJob.rawJson);
    expect(rawJson.jobAd).toBeDefined();
    expect(rawJson.jobAd.sections.jobDescription).toBeDefined();
    expect(rawJson.applyUrl).toBe("https://jobs.smartrecruiters.com/acme/123");
  });

  it("updates the job URL with applyUrl from the detail response", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl =
      "https://api.smartrecruiters.com/v1/companies/acme/postings/1";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeDetailResponse("1")]]),
    );

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);
    expect(result.enriched[0].url).toBe(
      "https://jobs.smartrecruiters.com/acme/123",
    );
  });

  it("handles detail fetch failure gracefully (non-fatal)", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl =
      "https://api.smartrecruiters.com/v1/companies/acme/postings/1";
    const fetchFn = makeMockFetchFn(new Map(), new Set([detailUrl]));

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(0);
    expect(result.fetchesFailed).toBe(1);
    expect(result.unchanged).toHaveLength(1);
    expect(result.enriched).toHaveLength(0);
    // The job keeps its original rawJson
    expect(result.unchanged[0].rawJson).toBe(jobs[0].rawJson);
  });

  it("handles detail response validation failure gracefully", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl =
      "https://api.smartrecruiters.com/v1/companies/acme/postings/1";
    const fetchFn = makeMockFetchFn(new Map([[detailUrl, { wrong: "shape" }]]));

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    expect(result.fetchesFailed).toBe(1);
    expect(result.unchanged).toHaveLength(1);
  });

  it("caps detail fetches at MAX_DETAIL_FETCHES", async () => {
    // Create 15 short jobs — only MAX_DETAIL_FETCHES (10) should be fetched
    const jobs = Array.from({ length: 15 }, (_, i) => makeShortJob(`${i + 1}`));
    const detailResponses = new Map<string, unknown>();
    for (let i = 1; i <= 15; i++) {
      const url = `https://api.smartrecruiters.com/v1/companies/acme/postings/${i}`;
      detailResponses.set(url, makeDetailResponse(`${i}`));
    }
    const fetchFn = makeMockFetchFn(detailResponses);

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(MAX_DETAIL_FETCHES);
    expect(result.fetchesSucceeded).toBe(MAX_DETAIL_FETCHES);
    // 10 enriched + 5 unchanged (the cap was hit)
    expect(result.enriched).toHaveLength(10);
    expect(result.unchanged).toHaveLength(5);
  });

  it("processes mixed jobs (some short, some long)", async () => {
    const jobs = [
      makeLongJob("1"), // unchanged (long enough)
      makeShortJob("2"), // enriched (detail fetched)
      makeLongJob("3"), // unchanged
      makeShortJob("4"), // enriched
    ];
    const detailResponses = new Map<string, unknown>();
    for (const id of ["2", "4"]) {
      const url = `https://api.smartrecruiters.com/v1/companies/acme/postings/${id}`;
      detailResponses.set(url, makeDetailResponse(id));
    }
    const fetchFn = makeMockFetchFn(detailResponses);

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(2);
    expect(result.fetchesSucceeded).toBe(2);
    expect(result.enriched).toHaveLength(2);
    expect(result.unchanged).toHaveLength(2);
  });

  it("handles empty job list", async () => {
    const fetchFn = makeMockFetchFn(new Map());
    const result = await enrichSmartRecruitersJobs([], "acme", fetchFn);
    expect(result.fetchesAttempted).toBe(0);
    expect(result.enriched).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });

  it("handles fetchFn throwing an error (non-fatal)", async () => {
    const jobs = [makeShortJob("1")];
    const fetchFn = vi.fn(async () => {
      throw new Error("Network error");
    }) as unknown as FetchFn;

    const result = await enrichSmartRecruitersJobs(jobs, "acme", fetchFn);

    expect(result.fetchesFailed).toBe(1);
    expect(result.unchanged).toHaveLength(1);
    expect(result.enriched).toHaveLength(0);
  });
});
