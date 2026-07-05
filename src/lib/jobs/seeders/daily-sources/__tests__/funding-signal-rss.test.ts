/**
 * Unit tests for v2 Funding-Signal RSS Seeder
 * src/lib/jobs/seeders/daily-sources/funding-signal-rss.ts
 *
 * Tests the v2 funding-signal discovery layer:
 *   - RSS/Atom parsing and funding-article extraction
 *   - Company name extraction from headlines
 *   - Employee count estimation from funding stage
 *   - Public-company signal detection
 *   - Startup filter (< 50 employees)
 *   - Full seeder run with mocked Slugger + fetch
 *
 * Per AGENTS.md: Vitest for unit/integration tests. The Slugger and fetch are
 * mocked — no real network calls or DB mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the Slugger so no real ATS probes / DB inserts happen.
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  containsFundingRoundKeywords,
  containsPublicCompanySignals,
  estimateEmployeeCountFromStage,
  extractCompanyNameFromTitle,
  extractFundingArticlesFromRss,
  passesStartupFilter,
  runFundingSignalRssSeeder,
  STARTUP_EMPLOYEE_THRESHOLD,
} from "@/lib/jobs/seeders/daily-sources/funding-signal-rss";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── containsFundingRoundKeywords ─────────────────────────────────────────────

describe("containsFundingRoundKeywords", () => {
  it("detects 'raises' keyword", () => {
    expect(containsFundingRoundKeywords("Acme raises $10M Series A")).toBe(
      true,
    );
  });

  it("detects 'Series A' keyword", () => {
    expect(containsFundingRoundKeywords("Company closes Series A round")).toBe(
      true,
    );
  });

  it("detects 'seed funding' keyword", () => {
    expect(containsFundingRoundKeywords("Startup secures seed funding")).toBe(
      true,
    );
  });

  it("detects 'pre-seed' keyword", () => {
    expect(containsFundingRoundKeywords("NewCo lands pre-seed round")).toBe(
      true,
    );
  });

  it("returns false for non-funding articles", () => {
    expect(containsFundingRoundKeywords("Company launches new product")).toBe(
      false,
    );
  });

  it("is case-insensitive", () => {
    expect(containsFundingRoundKeywords("ACME RAISES $5M")).toBe(true);
  });
});

// ── containsPublicCompanySignals ─────────────────────────────────────────────

describe("containsPublicCompanySignals", () => {
  it("detects IPO mention", () => {
    expect(containsPublicCompanySignals("Company files for IPO")).toBe(true);
  });

  it("detects NYSE ticker", () => {
    expect(containsPublicCompanySignals("Acme (NYSE: ACME) raises debt")).toBe(
      true,
    );
  });

  it("detects NASDAQ ticker", () => {
    expect(
      containsPublicCompanySignals("TechCorp (NASDAQ: TC) announces round"),
    ).toBe(true);
  });

  it("returns false for private companies", () => {
    expect(containsPublicCompanySignals("Acme raises $10M Series A")).toBe(
      false,
    );
  });
});

// ── extractCompanyNameFromTitle ──────────────────────────────────────────────

describe("extractCompanyNameFromTitle", () => {
  it("extracts company name before 'raises'", () => {
    expect(extractCompanyNameFromTitle("Acme raises $10M Series A")).toBe(
      "Acme",
    );
  });

  it("extracts company name before 'secures'", () => {
    expect(
      extractCompanyNameFromTitle("Foobar secures $5M in seed funding"),
    ).toBe("Foobar");
  });

  it("extracts multi-word company names", () => {
    expect(extractCompanyNameFromTitle("Acme Labs raises $10M Series A")).toBe(
      "Acme Labs",
    );
  });

  it("extracts company names with dots", () => {
    expect(extractCompanyNameFromTitle("Stripe.com raises $50M Series B")).toBe(
      "Stripe.com",
    );
  });

  it("returns null for titles without funding keywords", () => {
    expect(
      extractCompanyNameFromTitle("Company launches new product"),
    ).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractCompanyNameFromTitle("")).toBeNull();
  });
});

// ── estimateEmployeeCountFromStage ───────────────────────────────────────────

describe("estimateEmployeeCountFromStage", () => {
  it("estimates pre-seed at 5 employees", () => {
    const { stage, estimate } = estimateEmployeeCountFromStage(
      "Acme closes pre-seed round",
    );
    expect(stage).toBe("pre_seed");
    expect(estimate).toBe(5);
  });

  it("estimates seed at 15 employees", () => {
    const { stage, estimate } = estimateEmployeeCountFromStage(
      "Acme secures seed funding",
    );
    expect(stage).toBe("seed");
    expect(estimate).toBe(15);
  });

  it("estimates Series A at 35 employees", () => {
    const { stage, estimate } = estimateEmployeeCountFromStage(
      "Acme raises $10M Series A",
    );
    expect(stage).toBe("series_a");
    expect(estimate).toBe(35);
  });

  it("estimates Series B at 60 employees (above threshold)", () => {
    const { stage, estimate } = estimateEmployeeCountFromStage(
      "BigCorp raises $50M Series B",
    );
    expect(stage).toBe("series_b");
    expect(estimate).toBe(60);
  });

  it("estimates Series C+ at 100 employees", () => {
    const { stage, estimate } = estimateEmployeeCountFromStage(
      "MegaCorp raises $100M Series C",
    );
    expect(stage).toBe("series_c_plus");
    expect(estimate).toBe(100);
  });

  it("returns null when no stage is detected", () => {
    const { stage, estimate } = estimateEmployeeCountFromStage(
      "Acme announces new product",
    );
    expect(stage).toBeNull();
    expect(estimate).toBeNull();
  });
});

// ── passesStartupFilter ──────────────────────────────────────────────────────

describe("passesStartupFilter", () => {
  it("passes for employee count below threshold", () => {
    expect(passesStartupFilter(15)).toBe(true);
    expect(passesStartupFilter(35)).toBe(true);
    expect(passesStartupFilter(49)).toBe(true);
  });

  it("filters out employee count at or above threshold", () => {
    expect(passesStartupFilter(STARTUP_EMPLOYEE_THRESHOLD)).toBe(false);
    expect(passesStartupFilter(60)).toBe(false);
    expect(passesStartupFilter(100)).toBe(false);
  });

  it("passes for null employee count (unknown — allow through)", () => {
    expect(passesStartupFilter(null)).toBe(true);
  });
});

// ── extractFundingArticlesFromRss ────────────────────────────────────────────

describe("extractFundingArticlesFromRss", () => {
  it("extracts funding articles from RSS XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>TechCrunch</title>
          <item>
            <title>Acme raises $10M Series A</title>
            <description>Startup Acme raises Series A</description>
          </item>
          <item>
            <title>Non-funding article about a product launch</title>
            <description>Some product news</description>
          </item>
        </channel>
      </rss>`;
    const articles = extractFundingArticlesFromRss(xml, "techcrunch");
    expect(articles).toHaveLength(1);
    expect(articles[0].companyName).toBe("Acme");
    expect(articles[0].fundingStage).toBe("series_a");
    expect(articles[0].estimatedEmployeeCount).toBe(35);
    expect(articles[0].isPublic).toBe(false);
  });

  it("extracts from Atom feeds (<entry> elements)", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>VentureBeat</title>
        <entry>
          <title>Foobar secures seed funding</title>
        </entry>
      </feed>`;
    const articles = extractFundingArticlesFromRss(xml, "venturebeat");
    expect(articles).toHaveLength(1);
    expect(articles[0].companyName).toBe("Foobar");
    expect(articles[0].fundingStage).toBe("seed");
  });

  it("detects public-company signals in funding articles", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme (NYSE: ACME) raises debt round</title></item>
      </channel></rss>`;
    const articles = extractFundingArticlesFromRss(xml, "test");
    expect(articles).toHaveLength(1);
    expect(articles[0].isPublic).toBe(true);
  });

  it("returns empty array for invalid XML", () => {
    expect(extractFundingArticlesFromRss("not xml", "test")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(extractFundingArticlesFromRss("", "test")).toEqual([]);
    expect(extractFundingArticlesFromRss("   ", "test")).toEqual([]);
  });

  it("skips items without titles", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><description>no title here</description></item>
        <item><title>Acme raises $5M seed round</title></item>
      </channel></rss>`;
    const articles = extractFundingArticlesFromRss(xml, "test");
    expect(articles).toHaveLength(1);
  });

  it("skips items without a detectable company name", () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>raises $5M seed round</title></item>
      </channel></rss>`;
    const articles = extractFundingArticlesFromRss(xml, "test");
    expect(articles).toHaveLength(1);
    expect(articles[0].companyName).toBeNull();
  });
});

// ── runFundingSignalRssSeeder (integration with mocks) ───────────────────────

describe("runFundingSignalRssSeeder", () => {
  beforeEach(() => {
    vi.mocked(resolveSlugger).mockReset();
  });

  function makeMockFetch(responses: Record<string, string>): FetchFn {
    return (async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      const body = responses[urlStr];
      if (body === undefined) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(body, { status: 200 });
    }) as FetchFn;
  }

  it("processes funding articles and resolves companies via the Slugger", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme raises $10M Series A</title></item>
        <item><title>Foobar secures seed funding</title></item>
      </channel></rss>`;

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runFundingSignalRssSeeder(
      makeMockFetch({ "https://techcrunch.com/feed/": xml }),
    );

    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.filteredByStartupThreshold).toBe(0);
    // Slugger was called with discoverySource = "funding_signal"
    expect(resolveSlugger).toHaveBeenCalledTimes(2);
    const firstCall = vi.mocked(resolveSlugger).mock.calls[0][0];
    expect(firstCall.discoverySource).toBe("funding_signal");
  });

  it("filters out Series B+ companies via the startup filter", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme raises $10M Series A</title></item>
        <item><title>BigCorp raises $50M Series B</title></item>
        <item><title>MegaCorp raises $100M Series C</title></item>
      </channel></rss>`;

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runFundingSignalRssSeeder(
      makeMockFetch({ "https://techcrunch.com/feed/": xml }),
    );

    // Only Acme (Series A, 35 est.) passes the filter
    expect(result.resolved).toBe(1);
    expect(result.filteredByStartupThreshold).toBe(2);
    expect(resolveSlugger).toHaveBeenCalledTimes(1);
  });

  it("passes employeeCount through to the Slugger", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme raises $10M Series A</title></item>
      </channel></rss>`;

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runFundingSignalRssSeeder(
      makeMockFetch({ "https://techcrunch.com/feed/": xml }),
    );

    const call = vi.mocked(resolveSlugger).mock.calls[0][0];
    expect(call.employeeCount).toBe(35); // Series A estimate
  });

  it("passes isPublic through to the Slugger when detected", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme (NYSE: ACME) raises extension round</title></item>
      </channel></rss>`;

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runFundingSignalRssSeeder(
      makeMockFetch({ "https://techcrunch.com/feed/": xml }),
    );

    const call = vi.mocked(resolveSlugger).mock.calls[0][0];
    expect(call.isPublic).toBe(true);
  });

  it("counts unresolved companies when the Slugger fails", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme raises $10M Series A</title></item>
      </channel></rss>`;

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "acme",
    });

    const result = await runFundingSignalRssSeeder(
      makeMockFetch({ "https://techcrunch.com/feed/": xml }),
    );

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("handles Slugger exceptions as unresolved", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme raises $10M Series A</title></item>
      </channel></rss>`;

    vi.mocked(resolveSlugger).mockRejectedValue(new Error("network error"));

    const result = await runFundingSignalRssSeeder(
      makeMockFetch({ "https://techcrunch.com/feed/": xml }),
    );

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("continues when individual feeds fail (non-200)", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    // All feeds return 404 — no articles, no resolver calls
    const result = await runFundingSignalRssSeeder(makeMockFetch({}));

    expect(result.fundingArticles).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates companies across feeds", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <item><title>Acme raises $10M Series A</title></item>
      </channel></rss>`;

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    // Same article in two feeds — should only resolve once
    const result = await runFundingSignalRssSeeder(
      makeMockFetch({
        "https://techcrunch.com/feed/": xml,
        "https://venturebeat.com/feed/": xml,
      }),
    );

    expect(result.uniqueCompanies).toBe(1);
    expect(resolveSlugger).toHaveBeenCalledTimes(1);
  });
});
