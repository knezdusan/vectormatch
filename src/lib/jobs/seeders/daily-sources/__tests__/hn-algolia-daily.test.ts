/**
 * Unit tests for D2 — HN Algolia Daily ATS Link Mining (TDD §2.2)
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

import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import {
  buildCompanyInputsFromAtsUrls,
  computeYesterdayTimestamp,
  extractAtsUrlsFromText,
  runHnAlgoliaDailySeeder,
} from "@/lib/jobs/seeders/daily-sources/hn-algolia-daily";
import type { FetchFn } from "@/lib/jobs/types";

// ── computeYesterdayTimestamp ────────────────────────────────────────────────

describe("computeYesterdayTimestamp", () => {
  it("returns a Unix timestamp in seconds", () => {
    const result = computeYesterdayTimestamp();
    expect(result).toBeGreaterThan(0);
    expect(Number.isInteger(result)).toBe(true);
  });

  it("returns a timestamp approximately 86400 seconds in the past", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = computeYesterdayTimestamp();
    const diff = now - result;
    expect(diff).toBeGreaterThanOrEqual(86000);
    expect(diff).toBeLessThanOrEqual(87000);
  });
});

// ── extractAtsUrlsFromText ───────────────────────────────────────────────────

describe("extractAtsUrlsFromText", () => {
  it("extracts Greenhouse URLs from comment text", () => {
    const text = "Check out https://boards.greenhouse.io/acme/jobs/123";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("greenhouse");
    expect(results[0].url).toBe("https://boards.greenhouse.io/acme/jobs/123");
  });

  it("extracts Lever URLs from comment text", () => {
    const text = "We're hiring: https://jobs.lever.co/foobar/abc-456";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("lever");
  });

  it("extracts Ashby URLs from comment text", () => {
    const text = "Apply at https://jobs.ashbyhq.com/newco/xyz";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("ashby");
  });

  it("extracts multiple ATS URLs from the same comment", () => {
    const text = `
      We use Greenhouse: https://boards.greenhouse.io/acme/jobs/123
      Also Lever: https://jobs.lever.co/foobar/abc
    `;
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(2);
  });

  it("ignores non-ATS URLs", () => {
    const text = "Visit https://acme.com or https://github.com/acme";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(0);
  });

  it("handles empty text", () => {
    expect(extractAtsUrlsFromText("")).toHaveLength(0);
  });

  it("handles text with no URLs", () => {
    expect(extractAtsUrlsFromText("Just a comment with no links")).toHaveLength(
      0,
    );
  });

  it("extracts URLs with trailing punctuation", () => {
    const text = "Hiring at https://boards.greenhouse.io/acme/jobs/123.";
    const results = extractAtsUrlsFromText(text);
    // The regex should capture the URL without the trailing period
    expect(results).toHaveLength(1);
  });
});

// ── buildCompanyInputsFromAtsUrls ────────────────────────────────────────────

describe("buildCompanyInputsFromAtsUrls", () => {
  it("builds SeedCompanyInput from ATS URLs", () => {
    const urls = [
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        atsSource: "greenhouse" as const,
      },
      { url: "https://jobs.lever.co/foobar/abc", atsSource: "lever" as const },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls);

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("greenhouse");
    expect(inputs[0].discoverySource).toBe("hn_algolia");
  });

  it("deduplicates by (atsSource, atsSlug)", () => {
    const urls = [
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        atsSource: "greenhouse" as const,
      },
      {
        url: "https://boards.greenhouse.io/acme/jobs/456",
        atsSource: "greenhouse" as const,
      },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls);
    expect(inputs).toHaveLength(1);
  });

  it("skips URLs where slug can't be extracted", () => {
    const urls = [
      {
        url: "https://boards.greenhouse.io/",
        atsSource: "greenhouse" as const,
      },
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        atsSource: "greenhouse" as const,
      },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls);
    expect(inputs).toHaveLength(1);
  });

  it("handles empty URL list", () => {
    expect(buildCompanyInputsFromAtsUrls([])).toHaveLength(0);
  });
});

// ── runHnAlgoliaDailySeeder ──────────────────────────────────────────────────

describe("runHnAlgoliaDailySeeder", () => {
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

  function mockHnFetch(hitsByDomain: Record<string, HnHit[]>): FetchFn {
    return vi.fn(async (url: string) => {
      for (const [domain, hits] of Object.entries(hitsByDomain)) {
        if (url.includes(`query=${encodeURIComponent(domain)}`)) {
          return new Response(JSON.stringify({ hits, nbPages: 1 }), {
            status: 200,
          });
        }
      }
      return new Response(JSON.stringify({ hits: [], nbPages: 1 }), {
        status: 200,
      });
    }) as unknown as FetchFn;
  }

  interface HnHit {
    objectID: string;
    comment_text?: string;
    created_at_i?: number;
  }

  it("queries HN Algolia, extracts ATS URLs, inserts companies", async () => {
    const fetchFn = mockHnFetch({
      "boards.greenhouse.io": [
        {
          objectID: "1",
          comment_text:
            "We're hiring https://boards.greenhouse.io/acme/jobs/123",
          created_at_i: Math.floor(Date.now() / 1000),
        },
      ],
      "jobs.lever.co": [
        {
          objectID: "2",
          comment_text: "Apply at https://jobs.lever.co/foobar/abc",
          created_at_i: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const result = await runHnAlgoliaDailySeeder(fetchFn);

    expect(result.totalComments).toBe(2);
    expect(result.atsUrlsFound).toBe(2);
    expect(result.uniqueSlugsExtracted).toBe(2);
    expect(result.insertResult.inserted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("handles individual domain API failure gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("boards.greenhouse.io")) {
        return new Response("Server Error", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          hits: [
            {
              objectID: "2",
              comment_text: "Apply at https://jobs.lever.co/foobar/abc",
              created_at_i: Math.floor(Date.now() / 1000),
            },
          ],
          nbPages: 1,
        }),
        { status: 200 },
      );
    }) as unknown as FetchFn;

    const result = await runHnAlgoliaDailySeeder(fetchFn);

    expect(result.uniqueSlugsExtracted).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("handles empty HN results", async () => {
    const fetchFn = mockHnFetch({});

    const result = await runHnAlgoliaDailySeeder(fetchFn);

    expect(result.totalComments).toBe(0);
    expect(result.atsUrlsFound).toBe(0);
    expect(result.uniqueSlugsExtracted).toBe(0);
  });

  it("deduplicates ATS URLs across comments", async () => {
    const fetchFn = mockHnFetch({
      "boards.greenhouse.io": [
        {
          objectID: "1",
          comment_text: "Hiring https://boards.greenhouse.io/acme/jobs/123",
          created_at_i: Math.floor(Date.now() / 1000),
        },
        {
          objectID: "2",
          comment_text: "Also https://boards.greenhouse.io/acme/jobs/456",
          created_at_i: Math.floor(Date.now() / 1000),
        },
      ],
    });

    const result = await runHnAlgoliaDailySeeder(fetchFn);

    expect(result.atsUrlsFound).toBe(2);
    expect(result.uniqueSlugsExtracted).toBe(1); // Same slug "acme"
  });

  it("passes insert inputs with discoverySource=hn_algolia", async () => {
    const fetchFn = mockHnFetch({
      "boards.greenhouse.io": [
        {
          objectID: "1",
          comment_text: "Hiring https://boards.greenhouse.io/acme/jobs/123",
          created_at_i: Math.floor(Date.now() / 1000),
        },
      ],
    });

    await runHnAlgoliaDailySeeder(fetchFn);

    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoverySource).toBe("hn_algolia");
  });
});
