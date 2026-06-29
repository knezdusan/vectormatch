/**
 * Unit tests for B1 — Workable Meta-Search Seeder (TDD §2.1)
 *
 * Tests:
 *   - extractCompanyInputs: pure function extracting unique company inputs from jobs
 *   - runWorkableMetaSearch: full seeder with mocked fetch + DB insert
 *   - Pagination: nextPageToken handling
 *   - Error handling: API failures, invalid responses
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the company-repository module so we don't hit the real database.
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
    insertedCompanyIds: [],
    insertedCompanies: [],
  }),
}));

import {
  extractCompanyInputs,
  runWorkableMetaSearch,
  type WorkableJob,
} from "@/lib/jobs/seeders/batch-sources/workable-meta-search";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

const job1: WorkableJob = {
  id: "job-1",
  title: "Senior Frontend Engineer",
  company: {
    name: "Acme",
    shortName: "acme",
    website: "https://acme.com",
  },
  url: "https://apply.workable.com/j/ABC123",
};

const job2: WorkableJob = {
  id: "job-2",
  title: "Backend Developer",
  company: {
    name: "Foobar",
    shortName: "foobar",
    website: "https://foobar.com",
  },
  url: "https://apply.workable.com/j/DEF456",
};

const job3SameCompany: WorkableJob = {
  id: "job-3",
  title: "DevOps Engineer",
  company: {
    name: "Acme",
    shortName: "acme", // Same slug as job1
    website: "https://acme.com",
  },
  url: "https://apply.workable.com/j/GHI789",
};

const jobNoWebsite: WorkableJob = {
  id: "job-4",
  title: "Data Engineer",
  company: {
    name: "NoSite",
    shortName: "nosite",
  },
};

// ── Mock fetch helper ────────────────────────────────────────────────────────

function mockFetchPages(pages: { status: number; body: unknown }[]): FetchFn {
  let callIndex = 0;
  const mock = vi.fn(async () => {
    const page = pages[Math.min(callIndex, pages.length - 1)];
    callIndex++;
    return new Response(JSON.stringify(page.body), { status: page.status });
  });
  return mock as unknown as FetchFn;
}

// ── extractCompanyInputs ─────────────────────────────────────────────────────

describe("extractCompanyInputs", () => {
  it("extracts unique company inputs from job results", () => {
    const inputs = extractCompanyInputs([job1, job2], "software engineer");

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("workable");
    expect(inputs[0].companyName).toBe("Acme");
    expect(inputs[0].rootDomain).toBe("acme.com");
    expect(inputs[0].discoverySource).toBe("workable_meta_search");
    expect(inputs[0].discoveryContext).toBe('search:"software engineer"');
  });

  it("deduplicates by company slug", () => {
    const inputs = extractCompanyInputs(
      [job1, job3SameCompany],
      "software engineer",
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0].atsSlug).toBe("acme");
  });

  it("handles jobs without website", () => {
    const inputs = extractCompanyInputs([jobNoWebsite], "data engineer");

    expect(inputs).toHaveLength(1);
    expect(inputs[0].rootDomain).toBeUndefined();
  });

  it("handles empty job list", () => {
    const inputs = extractCompanyInputs([], "software engineer");
    expect(inputs).toHaveLength(0);
  });

  it("extracts root domain from website URL", () => {
    const inputs = extractCompanyInputs([job1], "test");
    expect(inputs[0].rootDomain).toBe("acme.com");
  });

  it("handles invalid website URL gracefully", () => {
    const job: WorkableJob = {
      id: "x",
      title: "Engineer",
      company: {
        name: "Bad",
        shortName: "bad",
        website: "not-a-url",
      },
    };
    const inputs = extractCompanyInputs([job], "test");
    expect(inputs[0].rootDomain).toBeUndefined();
  });
});

// ── runWorkableMetaSearch ────────────────────────────────────────────────────

describe("runWorkableMetaSearch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 2,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: ["id-1", "id-2"],
      insertedCompanies: [
        { id: "id-1", atsSource: "workable", atsSlug: "acme" },
        { id: "id-2", atsSource: "workable", atsSlug: "foobar" },
      ],
    });
  });

  it("fetches jobs, extracts companies, and inserts them", async () => {
    const fetchFn = mockFetchPages([
      {
        status: 200,
        body: {
          jobs: [job1, job2],
          nextPageToken: null,
        },
      },
    ]);

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.totalJobsFound).toBe(2);
    expect(result.uniqueCompanySlugs).toBe(2);
    expect(result.pagesFetched).toBe(1);
    expect(result.insertResult.inserted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("paginates via nextPageToken", async () => {
    const fetchFn = mockFetchPages([
      {
        status: 200,
        body: {
          jobs: [job1],
          nextPageToken: "page2-token",
        },
      },
      {
        status: 200,
        body: {
          jobs: [job2],
          nextPageToken: null,
        },
      },
    ]);

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.totalJobsFound).toBe(2);
    expect(result.pagesFetched).toBe(2);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("stops when nextPageToken is null", async () => {
    const fetchFn = mockFetchPages([
      {
        status: 200,
        body: {
          jobs: [job1],
          nextPageToken: null,
        },
      },
    ]);

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.pagesFetched).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("deduplicates companies across pages", async () => {
    const fetchFn = mockFetchPages([
      {
        status: 200,
        body: {
          jobs: [job1],
          nextPageToken: "page2",
        },
      },
      {
        status: 200,
        body: {
          jobs: [job3SameCompany], // Same company as job1
          nextPageToken: null,
        },
      },
    ]);

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.totalJobsFound).toBe(2);
    expect(result.uniqueCompanySlugs).toBe(1); // Deduplicated
  });

  it("deduplicates companies across queries", async () => {
    // Two queries, each returning the same company
    const fetchFn = mockFetchPages([
      {
        status: 200,
        body: { jobs: [job1], nextPageToken: null },
      },
      {
        status: 200,
        body: { jobs: [job1], nextPageToken: null }, // Same company
      },
    ]);

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer", "frontend developer"],
      10,
    );

    expect(result.uniqueCompanySlugs).toBe(1);
  });

  it("handles API error gracefully", async () => {
    const fetchFn = mockFetchPages([
      { status: 500, body: { error: "Internal Server Error" } },
    ]);

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.error).toContain("500");
    expect(result.insertResult.inserted).toBe(0);
  });

  it("handles network error gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.error).toContain("ECONNREFUSED");
  });

  it("handles empty search results", async () => {
    const fetchFn = mockFetchPages([
      {
        status: 200,
        body: { jobs: [], nextPageToken: null },
      },
    ]);

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.totalJobsFound).toBe(0);
    expect(result.uniqueCompanySlugs).toBe(0);
    expect(result.pagesFetched).toBe(1);
  });

  it("passes insert inputs to insertDiscoveredCompanies", async () => {
    const fetchFn = mockFetchPages([
      {
        status: 200,
        body: { jobs: [job1, job2], nextPageToken: null },
      },
    ]);

    await runWorkableMetaSearch(fetchFn, ["software engineer"], 10);

    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg).toHaveLength(2);
    expect(callArg[0].atsSlug).toBe("acme");
    expect(callArg[0].atsSource).toBe("workable");
    expect(callArg[0].discoverySource).toBe("workable_meta_search");
  });
});
