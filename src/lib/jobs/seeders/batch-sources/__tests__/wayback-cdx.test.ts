/**
 * Unit tests for B7 — Wayback Machine CDX Seeder (TDD §2.1)
 *
 * Tests:
 *   - computeDateFilter: date string generation for CDX `from` parameter
 *   - extractSlugFromArchivedUrl: slug extraction for all 6 ATS URL patterns
 *   - extractCompaniesFromCdxRows: dedup + SeedCompanyInput extraction
 *   - runWaybackCdxSeeder: full seeder with mocked fetch + DB insert
 *   - Error handling: API failures, network errors
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the company-repository module
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
  computeDateFilter,
  extractCompaniesFromCdxRows,
  extractSlugFromArchivedUrl,
  runWaybackCdxSeeder,
} from "@/lib/jobs/seeders/batch-sources/wayback-cdx";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { FetchFn } from "@/lib/jobs/types";

// ── Mock fetch helper ────────────────────────────────────────────────────────

function mockCdxFetch(responses: { body: unknown }[]): FetchFn {
  let callIndex = 0;
  const mock = vi.fn(async () => {
    const resp = responses[Math.min(callIndex, responses.length - 1)];
    callIndex++;
    return new Response(JSON.stringify(resp.body), { status: 200 });
  });
  return mock as unknown as FetchFn;
}

// ── computeDateFilter ────────────────────────────────────────────────────────

describe("computeDateFilter", () => {
  it("returns a date string in YYYYMMDD format", () => {
    const result = computeDateFilter(18);
    expect(result).toMatch(/^\d{8}$/);
  });

  it("returns a date approximately 18 months in the past", () => {
    // We can't test exact date since it depends on "now", but we can verify
    // it's in the past and roughly 18 months ago
    const result = computeDateFilter(18);
    const year = Number.parseInt(result.slice(0, 4), 10);
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    // Should be 1-2 years before current year (18 months ≈ 1.5 years)
    expect(year).toBeGreaterThanOrEqual(currentYear - 2);
    expect(year).toBeLessThanOrEqual(currentYear);
  });

  it("handles month underflow correctly", () => {
    // If current month is January (0), 18 months back should wrap correctly
    const result = computeDateFilter(18);
    // Just verify it doesn't produce invalid dates
    const month = Number.parseInt(result.slice(4, 6), 10);
    expect(month).toBeGreaterThanOrEqual(1);
    expect(month).toBeLessThanOrEqual(12);
  });
});

// ── extractSlugFromArchivedUrl ───────────────────────────────────────────────

describe("extractSlugFromArchivedUrl", () => {
  it("extracts slug from Greenhouse URL", () => {
    expect(
      extractSlugFromArchivedUrl(
        "https://boards.greenhouse.io/acme/jobs/12345",
        "greenhouse",
      ),
    ).toBe("acme");
  });

  it("extracts slug from Lever URL", () => {
    expect(
      extractSlugFromArchivedUrl("https://jobs.lever.co/acme/abc-123", "lever"),
    ).toBe("acme");
  });

  it("extracts slug from Ashby URL", () => {
    expect(
      extractSlugFromArchivedUrl(
        "https://jobs.ashbyhq.com/acme/abc123",
        "ashby",
      ),
    ).toBe("acme");
  });

  it("extracts slug from SmartRecruiters URL", () => {
    expect(
      extractSlugFromArchivedUrl(
        "https://jobs.smartrecruiters.com/acme/74983486",
        "smartrecruiters",
      ),
    ).toBe("acme");
  });

  it("extracts slug from Workable URL", () => {
    expect(
      extractSlugFromArchivedUrl(
        "https://apply.workable.com/acme/j/ABC123",
        "workable",
      ),
    ).toBe("acme");
  });

  it("extracts slug from Recruitee URL (subdomain)", () => {
    expect(
      extractSlugFromArchivedUrl(
        "https://acme.recruitee.com/o/devops-engineer",
        "recruitee",
      ),
    ).toBe("acme");
  });

  it("returns null for invalid URL", () => {
    expect(extractSlugFromArchivedUrl("not-a-url", "greenhouse")).toBeNull();
  });

  it("returns null for URL with no path segments", () => {
    expect(
      extractSlugFromArchivedUrl("https://boards.greenhouse.io/", "greenhouse"),
    ).toBeNull();
  });

  it("rejects common non-slug path segments", () => {
    expect(
      extractSlugFromArchivedUrl(
        "https://boards.greenhouse.io/jobs/123",
        "greenhouse",
      ),
    ).toBeNull();
  });

  it("rejects www subdomain for Recruitee", () => {
    expect(
      extractSlugFromArchivedUrl(
        "https://www.recruitee.com/o/some-job",
        "recruitee",
      ),
    ).toBeNull();
  });
});

// ── extractCompaniesFromCdxRows ──────────────────────────────────────────────

describe("extractCompaniesFromCdxRows", () => {
  it("extracts unique company inputs from CDX rows", () => {
    const rows = [
      ["https://boards.greenhouse.io/acme/jobs/123", "20240601"],
      ["https://boards.greenhouse.io/foobar/jobs/456", "20240602"],
    ];

    const inputs = extractCompaniesFromCdxRows(rows, "greenhouse");

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("greenhouse");
    expect(inputs[0].discoverySource).toBe("wayback_cdx");
  });

  it("deduplicates by (atsSource, atsSlug)", () => {
    const rows = [
      ["https://boards.greenhouse.io/acme/jobs/123", "20240601"],
      ["https://boards.greenhouse.io/acme/jobs/456", "20240602"],
      ["https://boards.greenhouse.io/acme/jobs/789", "20240603"],
    ];

    const inputs = extractCompaniesFromCdxRows(rows, "greenhouse");
    expect(inputs).toHaveLength(1);
  });

  it("skips rows where slug can't be extracted", () => {
    const rows = [
      ["https://boards.greenhouse.io/", "20240601"],
      ["https://boards.greenhouse.io/acme/jobs/123", "20240602"],
    ];

    const inputs = extractCompaniesFromCdxRows(rows, "greenhouse");
    expect(inputs).toHaveLength(1);
  });

  it("handles empty rows", () => {
    const inputs = extractCompaniesFromCdxRows([], "greenhouse");
    expect(inputs).toHaveLength(0);
  });

  it("skips rows with missing URL", () => {
    const rows = [["", "20240601"]];
    const inputs = extractCompaniesFromCdxRows(rows, "greenhouse");
    expect(inputs).toHaveLength(0);
  });

  it("includes discoveryContext with archived URL", () => {
    const rows = [["https://boards.greenhouse.io/acme/jobs/123", "20240601"]];
    const inputs = extractCompaniesFromCdxRows(rows, "greenhouse");
    expect(inputs[0].discoveryContext).toContain("wayback:");
    expect(inputs[0].discoveryContext).toContain("boards.greenhouse.io/acme");
  });
});

// ── runWaybackCdxSeeder ──────────────────────────────────────────────────────

describe("runWaybackCdxSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 2,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: ["id-1", "id-2"],
      insertedCompanies: [],
    });
  });

  it("queries all 6 ATS domains and inserts companies", async () => {
    const fetchFn = mockCdxFetch([
      {
        body: [
          ["original", "timestamp"],
          ["https://boards.greenhouse.io/acme/jobs/123", "20240601"],
        ],
      },
      {
        body: [
          ["original", "timestamp"],
          ["https://jobs.lever.co/foobar/abc", "20240602"],
        ],
      },
      { body: [["original", "timestamp"]] }, // Ashby: no results
      { body: [["original", "timestamp"]] }, // SmartRecruiters: no results
      { body: [["original", "timestamp"]] }, // Workable: no results
      { body: [["original", "timestamp"]] }, // Recruitee: no results
    ]);

    const result = await runWaybackCdxSeeder(fetchFn);

    expect(result.totalRows).toBe(2);
    expect(result.uniqueCompanySlugs).toBe(2);
    expect(result.insertResult.inserted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates companies across domains", async () => {
    // Same slug "acme" appears in both Greenhouse and Lever
    const fetchFn = mockCdxFetch([
      {
        body: [
          ["original", "timestamp"],
          ["https://boards.greenhouse.io/acme/jobs/123", "20240601"],
        ],
      },
      {
        body: [
          ["original", "timestamp"],
          ["https://jobs.lever.co/acme/abc", "20240602"],
        ],
      },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
    ]);

    const result = await runWaybackCdxSeeder(fetchFn);

    // Both are "acme" but different ATS sources → 2 unique entries
    expect(result.uniqueCompanySlugs).toBe(2);
  });

  it("handles individual domain API failure gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("boards.greenhouse.io")) {
        return new Response("Server Error", { status: 500 });
      }
      if (url.includes("jobs.lever.co")) {
        return new Response(
          JSON.stringify([
            ["original", "timestamp"],
            ["https://jobs.lever.co/acme/abc", "20240602"],
          ]),
          { status: 200 },
        );
      }
      // All other domains: empty results
      return new Response(JSON.stringify([["original", "timestamp"]]), {
        status: 200,
      });
    }) as unknown as FetchFn;

    const result = await runWaybackCdxSeeder(fetchFn);

    // Greenhouse failed but Lever succeeded
    expect(result.uniqueCompanySlugs).toBe(1);
    expect(result.error).toBeUndefined(); // Individual failure — not critical
  });

  it("handles network error for individual domain gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("boards.greenhouse.io")) {
        throw new Error("ECONNREFUSED");
      }
      if (url.includes("jobs.lever.co")) {
        return new Response(
          JSON.stringify([
            ["original", "timestamp"],
            ["https://jobs.lever.co/acme/abc", "20240602"],
          ]),
          { status: 200 },
        );
      }
      // All other domains: empty results
      return new Response(JSON.stringify([["original", "timestamp"]]), {
        status: 200,
      });
    }) as unknown as FetchFn;

    const result = await runWaybackCdxSeeder(fetchFn);

    expect(result.uniqueCompanySlugs).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("handles all-empty CDX results", async () => {
    const fetchFn = mockCdxFetch([
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
    ]);

    const result = await runWaybackCdxSeeder(fetchFn);

    expect(result.totalRows).toBe(0);
    expect(result.uniqueCompanySlugs).toBe(0);
  });

  it("passes insert inputs with discoverySource=wayback_cdx", async () => {
    const fetchFn = mockCdxFetch([
      {
        body: [
          ["original", "timestamp"],
          ["https://boards.greenhouse.io/acme/jobs/123", "20240601"],
        ],
      },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
      { body: [["original", "timestamp"]] },
    ]);

    await runWaybackCdxSeeder(fetchFn);

    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoverySource).toBe("wayback_cdx");
  });
});
