/**
 * Unit tests for Greenhouse Tier 2 Selective Detail Fetch
 *
 * Tests:
 *   - enrichGreenhouseJobs: selective detail fetch for short-content jobs
 *   - MIN_FULLTEXT_LENGTH / MAX_DETAIL_FETCHES constants
 *   - Detail fetch failure handling (non-fatal)
 *   - Rate limiting cap (MAX_DETAIL_FETCHES)
 *   - Merging detail data into rawJson
 *   - Detail endpoint with empty content (no merge)
 *
 * The fetchFn is mocked — no real HTTP calls.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobMetadata } from "@/lib/jobs/job-normalizer";
import type { NormalizedJob } from "@/lib/jobs/poller/ats-adapters";
import { enrichGreenhouseJobs } from "@/lib/jobs/poller/greenhouse-detail";
import {
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
  remoteScope: "unknown",
};

/** Create a Greenhouse list-endpoint job with empty content (short fullText). */
function makeShortJob(id: string): NormalizedJob {
  return {
    externalJobId: id,
    title: "Software Engineer",
    rawJson: JSON.stringify({
      id: Number.parseInt(id, 10),
      title: "Software Engineer",
      absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
      content: "",
    }),
    url: `https://boards.greenhouse.io/acme/jobs/${id}`,
    metadata: EMPTY_METADATA,
  };
}

/** Create a Greenhouse list-endpoint job with sufficient content (long fullText). */
function makeLongJob(id: string): NormalizedJob {
  return {
    externalJobId: id,
    title: "Senior Software Engineer",
    rawJson: JSON.stringify({
      id: Number.parseInt(id, 10),
      title: "Senior Software Engineer",
      absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
      content:
        "<p>We are looking for a Senior Software Engineer to join our team. " +
        "You will work on TypeScript, React, and Node.js applications. " +
        "Must have 5+ years of experience in building scalable web applications.</p>",
    }),
    url: `https://boards.greenhouse.io/acme/jobs/${id}`,
    metadata: EMPTY_METADATA,
  };
}

/** Create a mock Greenhouse detail response with content. */
function makeDetailResponse(id: string): unknown {
  return {
    id: Number.parseInt(id, 10),
    title: "Software Engineer",
    absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
    content:
      "<p>We are looking for a Software Engineer to join our team. " +
      "You will work on TypeScript, React, and Node.js applications. " +
      "Must have 3+ years of experience in building web applications.</p>",
    departments: [{ id: 1, name: "Engineering" }],
    offices: [{ id: 1, name: "San Francisco", location: "San Francisco, CA" }],
    metadata: [{ name: "Employment Type", value: "Full-time" }],
  };
}

/** Create a mock Greenhouse detail response with empty content (still no content). */
function makeEmptyDetailResponse(id: string): unknown {
  return {
    id: Number.parseInt(id, 10),
    title: "Software Engineer",
    absolute_url: `https://boards.greenhouse.io/acme/jobs/${id}`,
    content: "",
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

// ── enrichGreenhouseJobs ─────────────────────────────────────────────────────

describe("enrichGreenhouseJobs", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not fetch detail for jobs with long enough Tier 1 content", async () => {
    const jobs = [makeLongJob("1")];
    const fetchFn = makeMockFetchFn(new Map());

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(0);
    expect(result.fetchesSucceeded).toBe(0);
    expect(result.unchanged).toHaveLength(1);
    expect(result.enriched).toHaveLength(0);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fetches detail for jobs with empty content (short fullText)", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeDetailResponse("1")]]),
    );

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(1);
    expect(result.enriched).toHaveLength(1);
    expect(result.unchanged).toHaveLength(0);
  });

  it("merges content from detail response into the job rawJson", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeDetailResponse("1")]]),
    );

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    const enrichedJob = result.enriched[0];
    const rawJson = JSON.parse(enrichedJob.rawJson);
    expect(rawJson.content).toContain("Software Engineer");
    expect(rawJson.content).toContain("TypeScript");
    // departments/offices/metadata from detail should be merged
    expect(rawJson.departments).toBeDefined();
    expect(rawJson.offices).toBeDefined();
    expect(rawJson.metadata).toBeDefined();
  });

  it("does not merge when detail response also has empty content", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeEmptyDetailResponse("1")]]),
    );

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(0);
    expect(result.fetchesFailed).toBe(1);
    expect(result.unchanged).toHaveLength(1);
    expect(result.enriched).toHaveLength(0);
  });

  it("handles detail fetch HTTP error (non-fatal)", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1";
    const fetchFn = makeMockFetchFn(new Map(), new Set([detailUrl]));

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(0);
    expect(result.fetchesFailed).toBe(1);
    expect(result.unchanged).toHaveLength(1);
    expect(result.enriched).toHaveLength(0);
    // Original job data is preserved
    expect(result.unchanged[0].title).toBe("Software Engineer");
  });

  it("handles detail fetch network error (non-fatal)", async () => {
    const jobs = [makeShortJob("1")];
    const fetchFn = vi.fn(async () => {
      throw new Error("Network error");
    }) as unknown as FetchFn;

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(0);
    expect(result.fetchesFailed).toBe(1);
    expect(result.unchanged).toHaveLength(1);
  });

  it("caps detail fetches at MAX_DETAIL_FETCHES", async () => {
    // Create 15 short jobs — only 10 should get detail fetched
    const jobs = Array.from({ length: 15 }, (_, i) =>
      makeShortJob(String(i + 1)),
    );
    const detailResponses = new Map<string, unknown>();
    for (let i = 1; i <= 15; i++) {
      const url = `https://boards-api.greenhouse.io/v1/boards/acme/jobs/${i}`;
      detailResponses.set(url, makeDetailResponse(String(i)));
    }
    const fetchFn = makeMockFetchFn(detailResponses);

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(MAX_DETAIL_FETCHES);
    expect(result.fetchesSucceeded).toBe(MAX_DETAIL_FETCHES);
    expect(result.enriched).toHaveLength(MAX_DETAIL_FETCHES);
    expect(result.unchanged).toHaveLength(5);
  });

  it("updates URL from detail response absolute_url", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeDetailResponse("1")]]),
    );

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    const enrichedJob = result.enriched[0];
    expect(enrichedJob.url).toBe("https://boards.greenhouse.io/acme/jobs/1");
  });

  it("handles mixed short and long jobs", async () => {
    const jobs = [makeLongJob("1"), makeShortJob("2"), makeLongJob("3")];
    const detailUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/2";
    const fetchFn = makeMockFetchFn(
      new Map([[detailUrl, makeDetailResponse("2")]]),
    );

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(1);
    expect(result.enriched).toHaveLength(1);
    expect(result.unchanged).toHaveLength(2);
  });

  it("handles Zod validation failure (non-fatal)", async () => {
    const jobs = [makeShortJob("1")];
    const detailUrl = "https://boards-api.greenhouse.io/v1/boards/acme/jobs/1";
    // Missing required field `absolute_url` → Zod validation fails
    const badResponse = {
      id: 1,
      title: "Software Engineer",
      content: "<p>text</p>",
    };
    const fetchFn = makeMockFetchFn(new Map([[detailUrl, badResponse]]));

    const result = await enrichGreenhouseJobs(jobs, "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(1);
    expect(result.fetchesSucceeded).toBe(0);
    expect(result.fetchesFailed).toBe(1);
    expect(result.unchanged).toHaveLength(1);
  });

  it("returns empty result for empty job list", async () => {
    const fetchFn = makeMockFetchFn(new Map());

    const result = await enrichGreenhouseJobs([], "acme", fetchFn);

    expect(result.fetchesAttempted).toBe(0);
    expect(result.enriched).toHaveLength(0);
    expect(result.unchanged).toHaveLength(0);
  });
});
