/**
 * Unit tests for D13 — Meta Ads Library (TDD §2.2 D13)
 *
 * Tests:
 *   - extractCompanyNamesFromAds: page_name extraction
 *   - deduplicateCompanyNames: case-insensitive dedup
 *   - buildAdsApiUrl: URL construction with params
 *   - runMetaAdsSeeder: full seeder with mocked fetch + Slugger
 *   - Error handling: missing token, API failure, Slugger failure
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module (used by Slugger)
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the Slugger
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  buildAdsApiUrl,
  extractCompanyNamesFromAds,
  type MetaAdEntry,
  runMetaAdsSeeder,
} from "@/lib/jobs/seeders/daily-sources/meta-ads";
import { deduplicateCompanyNames } from "@/lib/jobs/seeders/seeder-utils";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

function makeAd(pageName: string, id?: string): MetaAdEntry {
  return {
    id: id ?? `ad_${pageName.toLowerCase()}`,
    page_name: pageName,
    ad_creative_bodies: ["We're hiring!"],
  };
}

function makeApiResponse(
  ads: MetaAdEntry[],
  nextCursor?: string,
): {
  data: MetaAdEntry[];
  paging?: { cursors: { after?: string }; next?: string };
} {
  if (nextCursor) {
    return {
      data: ads,
      paging: {
        cursors: { after: nextCursor },
        next: "https://graph.facebook.com/v19.0/ads_archive?after=abc",
      },
    };
  }
  return { data: ads };
}

function makeSuccessResult(companyName: string) {
  return {
    success: true as const,
    atsSource: "greenhouse" as const,
    atsSlug: companyName.toLowerCase(),
    resolvedBy: "slug_probe" as const,
    canonicalName: companyName,
  };
}

function mockFetchWithResponses(
  responses: { status: number; body: unknown }[],
): FetchFn {
  let callIndex = 0;
  return vi.fn(async (_url: string) => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return new Response(JSON.stringify(resp.body), {
      status: resp.status,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as FetchFn;
}

// ── extractCompanyNamesFromAds ───────────────────────────────────────────────

describe("extractCompanyNamesFromAds", () => {
  it("extracts page_name from ad entries", () => {
    const ads = [makeAd("Acme Corp"), makeAd("Stripe"), makeAd("Vercel")];
    expect(extractCompanyNamesFromAds(ads)).toEqual([
      "Acme Corp",
      "Stripe",
      "Vercel",
    ]);
  });

  it("trims whitespace from page_name", () => {
    const ads = [makeAd("  Acme  "), makeAd("\tStripe\n")];
    expect(extractCompanyNamesFromAds(ads)).toEqual(["Acme", "Stripe"]);
  });

  it("skips entries with empty page_name", () => {
    const ads = [
      makeAd("Acme"),
      { id: "x", page_name: "" },
      { id: "y", page_name: "   " },
      makeAd("Stripe"),
    ];
    expect(extractCompanyNamesFromAds(ads)).toEqual(["Acme", "Stripe"]);
  });

  it("skips entries with missing page_name", () => {
    const ads = [makeAd("Acme"), { id: "x" } as MetaAdEntry, makeAd("Stripe")];
    expect(extractCompanyNamesFromAds(ads)).toEqual(["Acme", "Stripe"]);
  });

  it("returns empty array for empty input", () => {
    expect(extractCompanyNamesFromAds([])).toEqual([]);
  });
});

// ── deduplicateCompanyNames ──────────────────────────────────────────────────

describe("deduplicateCompanyNames", () => {
  it("removes exact duplicates (case-insensitive)", () => {
    expect(deduplicateCompanyNames(["Acme", "acme", "ACME", "Stripe"])).toEqual(
      ["Acme", "Stripe"],
    );
  });

  it("preserves first-occurrence order and casing", () => {
    expect(
      deduplicateCompanyNames(["stripe", "Stripe", "ACME", "acme"]),
    ).toEqual(["stripe", "ACME"]);
  });

  it("skips empty strings", () => {
    expect(deduplicateCompanyNames(["", "  ", "Acme", ""])).toEqual(["Acme"]);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateCompanyNames([])).toEqual([]);
  });
});

// ── buildAdsApiUrl ───────────────────────────────────────────────────────────

describe("buildAdsApiUrl", () => {
  it("builds a URL with required parameters", () => {
    const url = buildAdsApiUrl("test-token", "we're hiring");
    expect(url).toContain("access_token=test-token");
    expect(url).toContain("search_terms=we%27re+hiring");
    expect(url).toContain("ad_type=ALL_ADS");
    expect(url).toContain("ad_active_status=ACTIVE");
    expect(url).toContain("fields=id");
    expect(url).toContain("limit=200");
  });

  it("includes after cursor when provided", () => {
    const url = buildAdsApiUrl("token", "hiring", 200, "cursor123");
    expect(url).toContain("after=cursor123");
  });

  it("omits after cursor when not provided", () => {
    const url = buildAdsApiUrl("token", "hiring");
    expect(url).not.toContain("after=");
  });

  it("uses custom limit", () => {
    const url = buildAdsApiUrl("token", "hiring", 50);
    expect(url).toContain("limit=50");
  });

  it("includes US as reached country", () => {
    const url = buildAdsApiUrl("token", "hiring");
    expect(url).toContain("ad_reached_countries");
  });
});

// ── runMetaAdsSeeder ─────────────────────────────────────────────────────────

describe("runMetaAdsSeeder", () => {
  beforeEach(() => {
    vi.mocked(resolveSlugger).mockReset();
    vi.mocked(resolveSlugger).mockResolvedValue(makeSuccessResult("acme"));
  });

  it("fetches ads, extracts names, and resolves companies", async () => {
    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme"), makeAd("Stripe")]),
      },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 1,
    });

    expect(result.totalAds).toBe(2);
    expect(result.uniqueCompanies).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates companies across search terms", async () => {
    const fetchFn = mockFetchWithResponses([
      { status: 200, body: makeApiResponse([makeAd("Acme")]) },
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme"), makeAd("Stripe")]),
      },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring", "join us"],
      maxPages: 1,
    });

    expect(result.totalAds).toBe(3);
    expect(result.uniqueCompanies).toBe(2);
    expect(result.resolved).toBe(2);
  });

  it("paginates through results up to maxPages", async () => {
    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme")], "cursor1"),
      },
      {
        status: 200,
        body: makeApiResponse([makeAd("Stripe")], "cursor2"),
      },
      {
        status: 200,
        body: makeApiResponse([makeAd("Vercel")]),
      },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 3,
    });

    expect(result.totalAds).toBe(3);
    expect(result.uniqueCompanies).toBe(3);
  });

  it("stops paginating when no next cursor", async () => {
    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme")]), // no cursor
      },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 5,
    });

    expect(result.totalAds).toBe(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("stops paginating when data is empty", async () => {
    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([]),
      },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 5,
    });

    expect(result.totalAds).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
  });

  it("skips search terms that return non-200 status", async () => {
    const fetchFn = mockFetchWithResponses([
      { status: 500, body: { error: "server error" } },
      { status: 200, body: makeApiResponse([makeAd("Acme")]) },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring", "join us"],
      maxPages: 1,
    });

    expect(result.totalAds).toBe(1);
    expect(result.uniqueCompanies).toBe(1);
    expect(result.resolved).toBe(1);
  });

  it("counts unresolved when Slugger returns failure", async () => {
    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme")]),
      },
    ]);

    vi.mocked(resolveSlugger).mockResolvedValueOnce({
      success: false,
      canonicalName: "Acme",
    });

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 1,
    });

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("counts unresolved when Slugger throws", async () => {
    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme")]),
      },
    ]);

    vi.mocked(resolveSlugger).mockRejectedValueOnce(new Error("slugger error"));

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 1,
    });

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("passes correct Slugger input with discoveryContext", async () => {
    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme Corp")]),
      },
    ]);

    await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 1,
    });

    expect(resolveSlugger).toHaveBeenCalledTimes(1);
    const [input, opts] = vi.mocked(resolveSlugger).mock.calls[0];
    expect(input.companyName).toBe("Acme Corp");
    expect(input.discoveryContext).toBe("meta-ads:Acme Corp");
    expect(opts?.insertCompany).toBe(true);
  });

  it("returns error when access token is not provided", async () => {
    const originalEnv = process.env.META_ADS_ACCESS_TOKEN;
    delete process.env.META_ADS_ACCESS_TOKEN;

    const fetchFn = vi.fn() as unknown as FetchFn;

    const result = await runMetaAdsSeeder(fetchFn, {
      searchTerms: ["hiring"],
      maxPages: 1,
    });

    expect(result.error).toContain("META_ADS_ACCESS_TOKEN");
    expect(result.totalAds).toBe(0);
    expect(result.resolved).toBe(0);

    process.env.META_ADS_ACCESS_TOKEN = originalEnv;
  });

  it("uses META_ADS_ACCESS_TOKEN from environment when not passed in opts", async () => {
    process.env.META_ADS_ACCESS_TOKEN = "env-token";

    const fetchFn = mockFetchWithResponses([
      {
        status: 200,
        body: makeApiResponse([makeAd("Acme")]),
      },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      searchTerms: ["hiring"],
      maxPages: 1,
    });

    expect(result.error).toBeUndefined();
    expect(result.totalAds).toBe(1);

    const calledUrl = vi.mocked(fetchFn).mock.calls[0][0] as string;
    expect(calledUrl).toContain("access_token=env-token");

    delete process.env.META_ADS_ACCESS_TOKEN;
  });

  it("uses default search terms when not specified", async () => {
    const fetchFn = mockFetchWithResponses([
      { status: 200, body: makeApiResponse([makeAd("Acme")]) },
    ]);

    await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      maxPages: 1,
    });

    // Default search terms has 6 entries
    expect(fetchFn).toHaveBeenCalledTimes(6);
  });

  it("handles empty ad response gracefully", async () => {
    const fetchFn = mockFetchWithResponses([
      { status: 200, body: { data: [] } },
    ]);

    const result = await runMetaAdsSeeder(fetchFn, {
      accessToken: "test-token",
      searchTerms: ["hiring"],
      maxPages: 1,
    });

    expect(result.totalAds).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
  });
});
