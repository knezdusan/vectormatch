/**
 * Unit tests for B2/D1 — Google CSE Seeder (TDD §2.1, §2.2)
 *
 * Tests:
 *   - extractSlugFromUrl: slug extraction for all 6 ATS URL patterns
 *   - inferAtsSourceFromUrl: hostname → ATS source mapping
 *   - extractCompaniesFromResults: dedup + SeedCompanyInput extraction
 *   - runGoogleCseBatch: full batch sweep with mocked fetch + DB insert
 *   - runGoogleCseDaily: daily sweep with dateRestrict=d1
 *   - Error handling: API errors, network failures
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
  extractCompaniesFromResults,
  extractSlugFromUrl,
  inferAtsSourceFromUrl,
  runGoogleCseBatch,
  runGoogleCseDaily,
} from "@/lib/jobs/seeders/batch-sources/google-cse";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { FetchFn } from "@/lib/jobs/types";

const CONFIG = { apiKey: "test-key", cseId: "test-cx" };

// ── Mock fetch helper ────────────────────────────────────────────────────────

function mockCseFetch(responses: { body: unknown }[]): FetchFn {
  let callIndex = 0;
  const mock = vi.fn(async () => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return new Response(JSON.stringify(resp.body), { status: 200 });
  });
  return mock as unknown as FetchFn;
}

// ── extractSlugFromUrl ───────────────────────────────────────────────────────

describe("extractSlugFromUrl", () => {
  it("extracts slug from Greenhouse URL (first path segment)", () => {
    expect(
      extractSlugFromUrl(
        "https://boards.greenhouse.io/acme/jobs/12345",
        "greenhouse",
      ),
    ).toBe("acme");
  });

  it("extracts slug from Lever URL", () => {
    expect(
      extractSlugFromUrl("https://jobs.lever.co/acme/abc-123-def", "lever"),
    ).toBe("acme");
  });

  it("extracts slug from Ashby URL", () => {
    expect(
      extractSlugFromUrl("https://jobs.ashbyhq.com/acme/abc123", "ashby"),
    ).toBe("acme");
  });

  it("extracts slug from SmartRecruiters URL", () => {
    expect(
      extractSlugFromUrl(
        "https://jobs.smartrecruiters.com/acme/74983486",
        "smartrecruiters",
      ),
    ).toBe("acme");
  });

  it("extracts slug from Workable URL", () => {
    expect(
      extractSlugFromUrl(
        "https://apply.workable.com/acme/j/ABC123",
        "workable",
      ),
    ).toBe("acme");
  });

  it("extracts slug from Recruitee URL (subdomain)", () => {
    expect(
      extractSlugFromUrl(
        "https://acme.recruitee.com/o/devops-engineer",
        "recruitee",
      ),
    ).toBe("acme");
  });

  it("returns null for invalid URL", () => {
    expect(extractSlugFromUrl("not-a-url", "greenhouse")).toBeNull();
  });

  it("returns null for URL with no path segments", () => {
    expect(
      extractSlugFromUrl("https://boards.greenhouse.io/", "greenhouse"),
    ).toBeNull();
  });

  it("rejects common non-slug path segments", () => {
    expect(
      extractSlugFromUrl("https://boards.greenhouse.io/jobs/123", "greenhouse"),
    ).toBeNull();
    expect(
      extractSlugFromUrl(
        "https://boards.greenhouse.io/board/config",
        "greenhouse",
      ),
    ).toBeNull();
  });

  it("rejects www subdomain for Recruitee", () => {
    expect(
      extractSlugFromUrl("https://www.recruitee.com/o/some-job", "recruitee"),
    ).toBeNull();
  });

  it("rejects api subdomain for Recruitee", () => {
    expect(
      extractSlugFromUrl(
        "https://api.recruitee.com/v1/companies/test",
        "recruitee",
      ),
    ).toBeNull();
  });
});

// ── inferAtsSourceFromUrl ────────────────────────────────────────────────────

describe("inferAtsSourceFromUrl", () => {
  it("infers greenhouse from boards.greenhouse.io", () => {
    expect(
      inferAtsSourceFromUrl("https://boards.greenhouse.io/acme/jobs/123"),
    ).toBe("greenhouse");
  });

  it("infers lever from jobs.lever.co", () => {
    expect(inferAtsSourceFromUrl("https://jobs.lever.co/acme/abc")).toBe(
      "lever",
    );
  });

  it("infers ashby from jobs.ashbyhq.com", () => {
    expect(inferAtsSourceFromUrl("https://jobs.ashbyhq.com/acme/abc")).toBe(
      "ashby",
    );
  });

  it("infers smartrecruiters from jobs.smartrecruiters.com", () => {
    expect(inferAtsSourceFromUrl("https://jobs.smartrecruiters.com/acme")).toBe(
      "smartrecruiters",
    );
  });

  it("infers workable from apply.workable.com", () => {
    expect(inferAtsSourceFromUrl("https://apply.workable.com/acme/j/ABC")).toBe(
      "workable",
    );
  });

  it("infers recruitee from *.recruitee.com", () => {
    expect(inferAtsSourceFromUrl("https://acme.recruitee.com/o/job")).toBe(
      "recruitee",
    );
  });

  it("returns null for non-ATS URL", () => {
    expect(inferAtsSourceFromUrl("https://example.com/careers")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(inferAtsSourceFromUrl("not-a-url")).toBeNull();
  });
});

// ── extractCompaniesFromResults ──────────────────────────────────────────────

describe("extractCompaniesFromResults", () => {
  it("extracts unique company inputs from search results", () => {
    const items = [
      { link: "https://boards.greenhouse.io/acme/jobs/123" },
      { link: "https://jobs.lever.co/foobar/abc-456" },
    ];

    const inputs = extractCompaniesFromResults(
      items,
      "site:boards.greenhouse.io",
    );

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("greenhouse");
    expect(inputs[0].discoverySource).toBe("google_cse");
  });

  it("deduplicates by (atsSource, atsSlug)", () => {
    const items = [
      { link: "https://boards.greenhouse.io/acme/jobs/123" },
      { link: "https://boards.greenhouse.io/acme/jobs/456" }, // Same company
      { link: "https://boards.greenhouse.io/acme/jobs/789" }, // Same company
    ];

    const inputs = extractCompaniesFromResults(items, "test");

    expect(inputs).toHaveLength(1);
    expect(inputs[0].atsSlug).toBe("acme");
  });

  it("skips non-ATS URLs", () => {
    const items = [
      { link: "https://example.com/careers" },
      { link: "https://boards.greenhouse.io/acme/jobs/123" },
    ];

    const inputs = extractCompaniesFromResults(items, "test");

    expect(inputs).toHaveLength(1);
    expect(inputs[0].atsSlug).toBe("acme");
  });

  it("skips URLs where slug can't be extracted", () => {
    const items = [
      { link: "https://boards.greenhouse.io/" }, // No path segments
      { link: "https://boards.greenhouse.io/acme/jobs/123" },
    ];

    const inputs = extractCompaniesFromResults(items, "test");

    expect(inputs).toHaveLength(1);
  });

  it("handles empty results", () => {
    const inputs = extractCompaniesFromResults([], "test");
    expect(inputs).toHaveLength(0);
  });
});

// ── runGoogleCseBatch ────────────────────────────────────────────────────────

describe("runGoogleCseBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 2,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: ["id-1", "id-2"],
      insertedCompanies: [],
      aggregatorFiltered: 0,
    });
  });

  it("queries all 6 ATS domains and inserts companies", async () => {
    const fetchFn = mockCseFetch([
      {
        body: {
          items: [{ link: "https://boards.greenhouse.io/acme/jobs/123" }],
        },
      },
      {
        body: {
          items: [{ link: "https://jobs.lever.co/foobar/abc" }],
        },
      },
      { body: { items: [] } }, // Ashby: no results
      { body: { items: [] } }, // SmartRecruiters: no results
      { body: { items: [] } }, // Workable: no results
      { body: { items: [] } }, // Recruitee: no results
    ]);

    const result = await runGoogleCseBatch(CONFIG, fetchFn);

    expect(result.queriesExecuted).toBe(6);
    expect(result.totalResultsFound).toBe(2);
    expect(result.uniqueCompanySlugs).toBe(2);
    expect(result.insertResult.inserted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates companies across queries", async () => {
    // Same company appears in both Greenhouse and Lever results
    const fetchFn = mockCseFetch([
      {
        body: {
          items: [{ link: "https://boards.greenhouse.io/acme/jobs/123" }],
        },
      },
      {
        body: {
          items: [{ link: "https://jobs.lever.co/acme/abc" }],
        },
      },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
    ]);

    const result = await runGoogleCseBatch(CONFIG, fetchFn);

    // Both are "acme" but different ATS sources → 2 unique entries
    expect(result.uniqueCompanySlugs).toBe(2);
  });

  it("handles API error gracefully", async () => {
    const fetchFn = mockCseFetch([
      {
        body: {
          error: { code: 403, message: "Daily limit exceeded" },
        },
      },
    ]);

    const result = await runGoogleCseBatch(CONFIG, fetchFn);

    expect(result.error).toContain("Daily limit exceeded");
    expect(result.insertResult.inserted).toBe(0);
  });

  it("handles network error gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await runGoogleCseBatch(CONFIG, fetchFn);

    expect(result.error).toContain("ECONNREFUSED");
  });

  it("handles all-empty results", async () => {
    const fetchFn = mockCseFetch([
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
    ]);

    const result = await runGoogleCseBatch(CONFIG, fetchFn);

    expect(result.totalResultsFound).toBe(0);
    expect(result.uniqueCompanySlugs).toBe(0);
    expect(result.queriesExecuted).toBe(6);
  });
});

// ── runGoogleCseDaily ────────────────────────────────────────────────────────

describe("runGoogleCseDaily", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 1,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: ["id-1"],
      insertedCompanies: [],
      aggregatorFiltered: 0,
    });
  });

  it("passes dateRestrict=d1 and sort=date to the API", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      // Verify the URL contains dateRestrict and sort params
      expect(url).toContain("dateRestrict=d1");
      expect(url).toContain("sort=date");
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }) as unknown as FetchFn;

    await runGoogleCseDaily(CONFIG, fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(6); // 6 ATS domains
  });

  it("inserts newly discovered companies", async () => {
    const fetchFn = mockCseFetch([
      {
        body: {
          items: [{ link: "https://boards.greenhouse.io/newco/jobs/999" }],
        },
      },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
      { body: { items: [] } },
    ]);

    const result = await runGoogleCseDaily(CONFIG, fetchFn);

    expect(result.totalResultsFound).toBe(1);
    expect(result.uniqueCompanySlugs).toBe(1);
    expect(result.insertResult.inserted).toBe(1);
  });
});
