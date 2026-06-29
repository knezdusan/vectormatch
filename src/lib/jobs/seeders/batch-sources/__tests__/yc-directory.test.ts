/**
 * Unit tests for B3 — YC Directory Seeder (TDD §2.1)
 *
 * Tests:
 *   - filterHiringCompanies: pure function filtering isHiring=true + website
 *   - getAlgoliaApiKey: extracts API key from YC page HTML
 *   - runYcDirectorySeeder: full seeder with mocked fetch + Slugger
 *   - Error handling: API failures, missing key, network errors
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module (used by Slugger)
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the Slugger so we don't hit the DB or ATS APIs
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  filterHiringCompanies,
  getAlgoliaApiKey,
  runYcDirectorySeeder,
  type YcCompany,
} from "@/lib/jobs/seeders/batch-sources/yc-directory";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

const hiringCompany: YcCompany = {
  id: 1,
  name: "Acme",
  slug: "acme",
  website: "https://acme.com",
  isHiring: true,
  batch: "W24",
  industry: "B2B",
  tags: ["AI", "Developer Tools"],
};

const notHiringCompany: YcCompany = {
  id: 2,
  name: "Ghost",
  slug: "ghost",
  website: "https://ghost.com",
  isHiring: false,
  batch: "S23",
  industry: "Consumer",
  tags: [],
};

const hiringNoWebsite: YcCompany = {
  id: 3,
  name: "NoSite",
  slug: "nosite",
  website: "",
  isHiring: true,
  batch: "W24",
  industry: "B2B",
  tags: [],
};

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockYcPageHtml(apiKey: string): string {
  return `<html><script>window.AlgoliaOpts = {"app":"45BWZJ1SGC","key":"${apiKey}"}</script></html>`;
}

function mockAlgoliaResponse(
  hits: YcCompany[],
  nbPages = 1,
  page = 0,
): unknown {
  return {
    results: [
      {
        hits,
        nbPages,
        page,
      },
    ],
  };
}

function mockFetchMulti(
  handlers: ((
    url: string,
    init?: RequestInit,
  ) => Response | Promise<Response>)[],
): FetchFn {
  let callIndex = 0;
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = handlers[Math.min(callIndex, handlers.length - 1)];
    callIndex++;
    return handler(url, init);
  });
  return mock as unknown as FetchFn;
}

// ── filterHiringCompanies ────────────────────────────────────────────────────

describe("filterHiringCompanies", () => {
  it("filters for isHiring=true with a website", () => {
    const result = filterHiringCompanies([
      hiringCompany,
      notHiringCompany,
      hiringNoWebsite,
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Acme");
  });

  it("excludes companies with isHiring=false", () => {
    const result = filterHiringCompanies([notHiringCompany]);
    expect(result).toHaveLength(0);
  });

  it("excludes hiring companies without a website", () => {
    const result = filterHiringCompanies([hiringNoWebsite]);
    expect(result).toHaveLength(0);
  });

  it("handles empty list", () => {
    expect(filterHiringCompanies([])).toHaveLength(0);
  });
});

// ── getAlgoliaApiKey ─────────────────────────────────────────────────────────

describe("getAlgoliaApiKey", () => {
  it("extracts the API key from the YC companies page HTML", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(mockYcPageHtml("test-api-key-123"), {
        status: 200,
      });
    }) as unknown as FetchFn;

    const key = await getAlgoliaApiKey(fetchFn);
    expect(key).toBe("test-api-key-123");
  });

  it("throws when the page returns non-OK status", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    await expect(getAlgoliaApiKey(fetchFn)).rejects.toThrow("404");
  });

  it("throws when AlgoliaOpts is not found in HTML", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("<html>no script here</html>", { status: 200 });
    }) as unknown as FetchFn;

    await expect(getAlgoliaApiKey(fetchFn)).rejects.toThrow(
      "Could not find Algolia options",
    );
  });

  it("throws when app ID doesn't match", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response(
        `<html><script>window.AlgoliaOpts = {"app":"WRONG_APP","key":"test"}</script></html>`,
        { status: 200 },
      );
    }) as unknown as FetchFn;

    await expect(getAlgoliaApiKey(fetchFn)).rejects.toThrow(
      "unexpected Algolia options",
    );
  });
});

// ── runYcDirectorySeeder ─────────────────────────────────────────────────────

describe("runYcDirectorySeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches hiring companies and runs them through the Slugger", async () => {
    // Mock Slugger to always succeed
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const fetchFn = mockFetchMulti([
      // Call 1: YC companies page (for API key)
      () => new Response(mockYcPageHtml("test-key"), { status: 200 }),
      // Call 2: Algolia API (page 0)
      () =>
        new Response(
          JSON.stringify(mockAlgoliaResponse([hiringCompany], 1, 0)),
          { status: 200 },
        ),
    ]);

    const result = await runYcDirectorySeeder(fetchFn);

    expect(result.totalHiringCompanies).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(0);
    expect(result.pagesFetched).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("counts resolved and unresolved companies", async () => {
    // Mock Slugger: succeed for first, fail for second
    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce({
        success: true,
        atsSource: "greenhouse",
        atsSlug: "acme",
        resolvedBy: "slug_probe",
        canonicalName: "acme",
      })
      .mockResolvedValueOnce({
        success: false,
        canonicalName: "ghost",
      });

    const company2: YcCompany = {
      id: 99,
      name: "Ghost",
      slug: "ghost",
      website: "https://ghost.com",
      isHiring: true,
      batch: "W24",
      industry: "B2B",
      tags: [],
    };

    const fetchFn = mockFetchMulti([
      () => new Response(mockYcPageHtml("test-key"), { status: 200 }),
      () =>
        new Response(
          JSON.stringify(mockAlgoliaResponse([hiringCompany, company2], 1, 0)),
          { status: 200 },
        ),
    ]);

    const result = await runYcDirectorySeeder(fetchFn);

    expect(result.totalHiringCompanies).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
  });

  it("paginates through multiple Algolia pages", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const fetchFn = mockFetchMulti([
      // YC page
      () => new Response(mockYcPageHtml("test-key"), { status: 200 }),
      // Algolia page 0 (2 pages total)
      () =>
        new Response(
          JSON.stringify(mockAlgoliaResponse([hiringCompany], 2, 0)),
          { status: 200 },
        ),
      // Algolia page 1
      () =>
        new Response(
          JSON.stringify(mockAlgoliaResponse([hiringCompany], 2, 1)),
          { status: 200 },
        ),
    ]);

    const result = await runYcDirectorySeeder(fetchFn);

    expect(result.pagesFetched).toBe(2);
  });

  it("handles YC page fetch error gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("Server Error", { status: 500 });
    }) as unknown as FetchFn;

    const result = await runYcDirectorySeeder(fetchFn);

    expect(result.error).toContain("500");
    expect(result.totalHiringCompanies).toBe(0);
    expect(result.resolved).toBe(0);
  });

  it("handles Algolia API error gracefully", async () => {
    const fetchFn = mockFetchMulti([
      // YC page succeeds
      () => new Response(mockYcPageHtml("test-key"), { status: 200 }),
      // Algolia API fails
      () => new Response("Forbidden", { status: 403 }),
    ]);

    const result = await runYcDirectorySeeder(fetchFn);

    expect(result.error).toContain("403");
    expect(result.totalHiringCompanies).toBe(0);
  });

  it("handles network error gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await runYcDirectorySeeder(fetchFn);

    expect(result.error).toContain("ECONNREFUSED");
  });

  it("passes correct SluggerInput with discoverySource=yc_directory", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const fetchFn = mockFetchMulti([
      () => new Response(mockYcPageHtml("test-key"), { status: 200 }),
      () =>
        new Response(
          JSON.stringify(mockAlgoliaResponse([hiringCompany], 1, 0)),
          { status: 200 },
        ),
    ]);

    await runYcDirectorySeeder(fetchFn);

    expect(resolveSlugger).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Acme",
        website: "https://acme.com",
        discoverySource: "yc_directory",
      }),
      expect.objectContaining({
        insertCompany: true,
      }),
    );
  });

  it("handles empty Algolia results", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "test",
    });

    const fetchFn = mockFetchMulti([
      () => new Response(mockYcPageHtml("test-key"), { status: 200 }),
      () =>
        new Response(JSON.stringify(mockAlgoliaResponse([], 1, 0)), {
          status: 200,
        }),
    ]);

    const result = await runYcDirectorySeeder(fetchFn);

    expect(result.totalHiringCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
  });
});
