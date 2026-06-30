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

// Mock the Slugger so fallback routing doesn't hit the DB or network.
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn().mockResolvedValue({
    success: true,
    atsSource: "workable",
    atsSlug: "resolved-slug",
    resolvedBy: "slug_probe",
    canonicalName: "Resolved",
  }),
}));

import {
  extractCompanyInputs,
  extractSlugFromCompanyUrl,
  runWorkableMetaSearch,
  validateWorkableSlug,
  type WorkableJob,
} from "@/lib/jobs/seeders/batch-sources/workable-meta-search";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

// Updated to match the June 2026 Workable API format:
// company.name → company.title, company.shortName removed,
// slug extracted from company.url (/company/{id}/jobs-at-{slug})

const job1: WorkableJob = {
  id: "job-1",
  title: "Senior Frontend Engineer",
  company: {
    id: "uuid-1",
    title: "Acme",
    website: "https://acme.com",
    url: "https://jobs.workable.com/company/abc123/jobs-at-acme",
  },
  url: "https://jobs.workable.com/view/ABC123",
};

const job2: WorkableJob = {
  id: "job-2",
  title: "Backend Developer",
  company: {
    id: "uuid-2",
    title: "Foobar",
    website: "https://foobar.com",
    url: "https://jobs.workable.com/company/def456/jobs-at-foobar",
  },
  url: "https://jobs.workable.com/view/DEF456",
};

const job3SameCompany: WorkableJob = {
  id: "job-3",
  title: "DevOps Engineer",
  company: {
    id: "uuid-1",
    title: "Acme",
    website: "https://acme.com",
    url: "https://jobs.workable.com/company/abc123/jobs-at-acme", // Same slug as job1
  },
  url: "https://jobs.workable.com/view/GHI789",
};

const jobNoWebsite: WorkableJob = {
  id: "job-4",
  title: "Data Engineer",
  company: {
    id: "uuid-3",
    title: "NoSite",
    url: "https://jobs.workable.com/company/ghi789/jobs-at-nosite",
  },
};

// ── Mock fetch helper ────────────────────────────────────────────────────────

/**
 * Mock fetch that returns configured search pages for GET requests to the
 * meta-search API, and a configurable status for HEAD requests to the widget
 * API (used by validateWorkableSlug). By default HEAD validation returns 200
 * (slug valid → direct insert path), so existing tests that don't care about
 * validation behave as before.
 */
function mockFetchPages(
  pages: { status: number; body: unknown }[],
  opts: { headStatus?: number | ((slug: string) => number) } = {},
): FetchFn {
  let callIndex = 0;
  const headStatus = opts.headStatus ?? 200;
  const mock = vi.fn(
    async (input: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const urlStr = typeof input === "string" ? input : input.toString();
      if (method === "HEAD") {
        const status =
          typeof headStatus === "function"
            ? headStatus(urlStr.split("/").pop() ?? "")
            : headStatus;
        return new Response(null, { status });
      }
      const page = pages[Math.min(callIndex, pages.length - 1)];
      callIndex++;
      return new Response(JSON.stringify(page.body), { status: page.status });
    },
  );
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
        id: "uuid-x",
        title: "Bad",
        website: "not-a-url",
        url: "https://jobs.workable.com/company/xxx/jobs-at-bad",
      },
    };
    const inputs = extractCompanyInputs([job], "test");
    expect(inputs[0].rootDomain).toBeUndefined();
  });

  it("skips jobs without company.url", () => {
    const job: WorkableJob = {
      id: "x",
      title: "Engineer",
      company: {
        id: "uuid-x",
        title: "NoUrl",
      },
    };
    const inputs = extractCompanyInputs([job], "test");
    expect(inputs).toHaveLength(0);
  });
});

// ── extractSlugFromCompanyUrl ────────────────────────────────────────────────

describe("extractSlugFromCompanyUrl", () => {
  it("extracts slug from standard company URL", () => {
    const url = "https://jobs.workable.com/company/abc123/jobs-at-acme";
    expect(extractSlugFromCompanyUrl(url)).toBe("acme");
  });

  it("extracts slug from URL with multi-word company name", () => {
    const url =
      "https://jobs.workable.com/company/pScfjBzGATtPx3geL93jwD/jobs-at-biopharma-consulting-jad-group";
    expect(extractSlugFromCompanyUrl(url)).toBe(
      "biopharma-consulting-jad-group",
    );
  });

  it("URL-decodes encoded characters in slug", () => {
    const url =
      "https://jobs.workable.com/company/abc/jobs-at-essnova-solutions%2C-inc.";
    expect(extractSlugFromCompanyUrl(url)).toBe("essnova-solutions,-inc.");
  });

  it("returns null for invalid URL", () => {
    expect(extractSlugFromCompanyUrl("not-a-url")).toBeNull();
  });

  it("returns null for URL with no path segments", () => {
    expect(extractSlugFromCompanyUrl("https://example.com")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractSlugFromCompanyUrl("")).toBeNull();
  });

  it("handles slug without jobs-at prefix (fallback)", () => {
    const url = "https://jobs.workable.com/company/abc/acme-labs";
    expect(extractSlugFromCompanyUrl(url)).toBe("acme-labs");
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
    // 2 GET search pages + 2 HEAD slug validations (job1 + job2)
    expect(fetchFn).toHaveBeenCalledTimes(4);
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
    // 1 GET search page + 1 HEAD slug validation (job1)
    expect(fetchFn).toHaveBeenCalledTimes(2);
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

// ── validateWorkableSlug ─────────────────────────────────────────────────────

describe("validateWorkableSlug", () => {
  it("returns true when the widget API responds 200", async () => {
    const fetchFn = vi.fn(
      async () => new Response(null, { status: 200 }),
    ) as unknown as FetchFn;
    expect(await validateWorkableSlug("acme", fetchFn)).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("https://apply.workable.com/api/v1/widget/accounts/acme");
    expect(init?.method).toBe("HEAD");
  });

  it("returns false when the widget API responds 404", async () => {
    const fetchFn = vi.fn(
      async () => new Response(null, { status: 404 }),
    ) as unknown as FetchFn;
    expect(await validateWorkableSlug("bad-slug", fetchFn)).toBe(false);
  });

  it("returns false on network error (routes to Slugger fallback)", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;
    expect(await validateWorkableSlug("acme", fetchFn)).toBe(false);
  });
});

// ── Slug validation integration into runWorkableMetaSearch ───────────────────

describe("runWorkableMetaSearch — slug validation + Slugger fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 0,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: [],
      insertedCompanies: [],
    });
  });

  it("directly inserts valid slugs (fast path) and skips the Slugger", async () => {
    const fetchFn = mockFetchPages(
      [{ status: 200, body: { jobs: [job1, job2], nextPageToken: null } }],
      { headStatus: 200 }, // both slugs valid
    );

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.validSlugs).toBe(2);
    expect(result.sluggerFallbacks).toBe(0);
    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertDiscoveredCompanies).mock.calls[0][0]).toHaveLength(
      2,
    );
    expect(vi.mocked(resolveSlugger)).not.toHaveBeenCalled();
  });

  it("routes invalid slugs through the Slugger (slow path)", async () => {
    const fetchFn = mockFetchPages(
      [{ status: 200, body: { jobs: [job1, job2], nextPageToken: null } }],
      { headStatus: 404 }, // both slugs invalid
    );

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.validSlugs).toBe(0);
    expect(result.sluggerFallbacks).toBe(2);
    // No direct insert when all slugs are invalid
    expect(vi.mocked(insertDiscoveredCompanies)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertDiscoveredCompanies).mock.calls[0][0]).toHaveLength(
      0,
    );
    // Slugger called once per invalid slug
    expect(vi.mocked(resolveSlugger)).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(resolveSlugger).mock.calls[0][0];
    expect(firstCall.companyName).toBe("Acme");
    expect(firstCall.website).toBe("acme.com");
    expect(firstCall.discoverySource).toBe("workable_meta_search");
  });

  it("splits valid and invalid slugs correctly (mixed batch)", async () => {
    // job1 → "acme" valid, job2 → "foobar" invalid
    const fetchFn = mockFetchPages(
      [{ status: 200, body: { jobs: [job1, job2], nextPageToken: null } }],
      { headStatus: (slug) => (slug === "acme" ? 200 : 404) },
    );

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.validSlugs).toBe(1);
    expect(result.sluggerFallbacks).toBe(1);
    expect(vi.mocked(insertDiscoveredCompanies)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(insertDiscoveredCompanies).mock.calls[0][0]).toHaveLength(
      1,
    );
    expect(
      vi.mocked(insertDiscoveredCompanies).mock.calls[0][0][0].atsSlug,
    ).toBe("acme");
    expect(vi.mocked(resolveSlugger)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(resolveSlugger).mock.calls[0][0].companyName).toBe(
      "Foobar",
    );
  });

  it("routes network errors during validation to the Slugger", async () => {
    const fetchFn = mockFetchPages(
      [{ status: 200, body: { jobs: [job1], nextPageToken: null } }],
      {
        headStatus: () => {
          throw new Error("network down");
        },
      },
    );

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.validSlugs).toBe(0);
    expect(result.sluggerFallbacks).toBe(1);
    expect(vi.mocked(resolveSlugger)).toHaveBeenCalledTimes(1);
  });

  it("skips Slugger fallback for companies with no name", async () => {
    const noNameJob: WorkableJob = {
      id: "job-x",
      title: "Engineer",
      company: {
        id: "uuid-x",
        url: "https://jobs.workable.com/company/xxx/jobs-at-noname",
      },
    };
    const fetchFn = mockFetchPages(
      [{ status: 200, body: { jobs: [noNameJob], nextPageToken: null } }],
      { headStatus: 404 },
    );

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    expect(result.sluggerFallbacks).toBe(1);
    // Slugger NOT called because companyName is empty
    expect(vi.mocked(resolveSlugger)).not.toHaveBeenCalled();
  });

  it("continues if the Slugger throws for one company (non-fatal)", async () => {
    vi.mocked(resolveSlugger).mockRejectedValueOnce(new Error("slugger down"));
    const fetchFn = mockFetchPages(
      [{ status: 200, body: { jobs: [job1, job2], nextPageToken: null } }],
      { headStatus: 404 },
    );

    const result = await runWorkableMetaSearch(
      fetchFn,
      ["software engineer"],
      10,
    );

    // Should not throw — Slugger failure is non-fatal
    expect(result.sluggerFallbacks).toBe(2);
    expect(result.error).toBeUndefined();
    // Second call still happens despite first throwing
    expect(vi.mocked(resolveSlugger)).toHaveBeenCalledTimes(2);
  });
});
