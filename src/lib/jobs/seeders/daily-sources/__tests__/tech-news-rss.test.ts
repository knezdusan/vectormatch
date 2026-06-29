/**
 * Unit tests for D11 — Tech News RSS + LLM Extraction (TDD §2.2)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

// Mock the slugger module
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  containsFundingKeywords,
  extractCompanyNameFromTitle,
  extractFundingArticlesFromRss,
  FUNDING_KEYWORDS,
  runTechNewsRssSeeder,
  TECH_NEWS_FEEDS,
} from "@/lib/jobs/seeders/daily-sources/tech-news-rss";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── containsFundingKeywords ──────────────────────────────────────────────────

describe("containsFundingKeywords", () => {
  it("returns true when title contains 'raises'", () => {
    expect(containsFundingKeywords("Acme raises $10M Series A")).toBe(true);
  });

  it("returns true when title contains 'Series A'", () => {
    expect(containsFundingKeywords("Startup closes Series A round")).toBe(true);
  });

  it("returns true when title contains 'funding'", () => {
    expect(containsFundingKeywords("New company announces funding round")).toBe(
      true,
    );
  });

  it("returns true when title contains 'hiring'", () => {
    expect(containsFundingKeywords("We are hiring engineers")).toBe(true);
  });

  it("returns true when title contains 'acquires'", () => {
    expect(containsFundingKeywords("BigCorp acquires StartupInc")).toBe(true);
  });

  it("returns false when title has no funding keywords", () => {
    expect(containsFundingKeywords("New product launch announced today")).toBe(
      false,
    );
  });

  it("is case-insensitive", () => {
    expect(containsFundingKeywords("ACME RAISES $10M")).toBe(true);
    expect(containsFundingKeywords("company SECURES funding")).toBe(true);
    expect(containsFundingKeywords("SERIES b round closed")).toBe(true);
  });

  it("handles empty text", () => {
    expect(containsFundingKeywords("")).toBe(false);
  });
});

// ── extractCompanyNameFromTitle ──────────────────────────────────────────────

describe("extractCompanyNameFromTitle", () => {
  it("extracts company from 'Acme raises $10M'", () => {
    expect(extractCompanyNameFromTitle("Acme raises $10M Series A")).toBe(
      "Acme",
    );
  });

  it("extracts company from 'Foobar secures $5M Series A'", () => {
    expect(extractCompanyNameFromTitle("Foobar secures $5M in Series A")).toBe(
      "Foobar",
    );
  });

  it("extracts company from 'NewCo lands $20M funding round'", () => {
    expect(extractCompanyNameFromTitle("NewCo lands $20M funding round")).toBe(
      "NewCo",
    );
  });

  it("extracts company from 'BigCorp acquires StartupInc'", () => {
    expect(extractCompanyNameFromTitle("BigCorp acquires StartupInc")).toBe(
      "BigCorp",
    );
  });

  it("extracts multi-word company name", () => {
    expect(extractCompanyNameFromTitle("Acme Corp raises $10M Series A")).toBe(
      "Acme Corp",
    );
  });

  it("returns null when no match", () => {
    expect(extractCompanyNameFromTitle("Just a regular news headline")).toBe(
      null,
    );
  });

  it("returns null for empty string", () => {
    expect(extractCompanyNameFromTitle("")).toBe(null);
  });

  it("returns null when title starts with lowercase", () => {
    expect(extractCompanyNameFromTitle("acme raises $10M")).toBe(null);
  });
});

// ── extractFundingArticlesFromRss ────────────────────────────────────────────

describe("extractFundingArticlesFromRss", () => {
  it("extracts funding articles from valid RSS XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>TechCrunch</title>
          <item>
            <title>Acme raises $10M Series A to build AI tools</title>
            <link>https://example.com/1</link>
          </item>
          <item>
            <title>Foobar secures $5M in Series B funding</title>
            <link>https://example.com/2</link>
          </item>
          <item>
            <title>New product launch announced today</title>
            <link>https://example.com/3</link>
          </item>
        </channel>
      </rss>`;

    const articles = extractFundingArticlesFromRss(xml, "techcrunch");

    expect(articles).toHaveLength(2);
    expect(articles[0].feedName).toBe("techcrunch");
    expect(articles[0].title).toBe(
      "Acme raises $10M Series A to build AI tools",
    );
    expect(articles[0].companyName).toBe("Acme");
    expect(articles[1].companyName).toBe("Foobar");
  });

  it("returns empty array for RSS without funding articles", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>TechCrunch</title>
          <item>
            <title>New product launch announced today</title>
            <link>https://example.com/1</link>
          </item>
          <item>
            <title>Company releases quarterly earnings</title>
            <link>https://example.com/2</link>
          </item>
        </channel>
      </rss>`;

    const articles = extractFundingArticlesFromRss(xml, "techcrunch");
    expect(articles).toHaveLength(0);
  });

  it("returns empty array for empty RSS XML", () => {
    expect(extractFundingArticlesFromRss("", "techcrunch")).toHaveLength(0);
    expect(extractFundingArticlesFromRss("   ", "techcrunch")).toHaveLength(0);
  });

  it("returns empty array for invalid XML", () => {
    const invalidXml = "this is not valid xml at all <<<";
    const articles = extractFundingArticlesFromRss(invalidXml, "techcrunch");
    expect(articles).toHaveLength(0);
  });

  it("handles items with no title", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <link>https://example.com/1</link>
          </item>
          <item>
            <title>Acme raises $10M</title>
            <link>https://example.com/2</link>
          </item>
        </channel>
      </rss>`;

    const articles = extractFundingArticlesFromRss(xml, "techcrunch");
    expect(articles).toHaveLength(1);
    expect(articles[0].companyName).toBe("Acme");
  });

  it("sets companyName to null when regex does not match", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>funding round announced for unnamed startup</title>
            <link>https://example.com/1</link>
          </item>
        </channel>
      </rss>`;

    const articles = extractFundingArticlesFromRss(xml, "techcrunch");
    expect(articles).toHaveLength(1);
    expect(articles[0].companyName).toBeNull();
  });
});

// ── Constants ────────────────────────────────────────────────────────────────

describe("constants", () => {
  it("TECH_NEWS_FEEDS includes all four feeds", () => {
    expect(TECH_NEWS_FEEDS).toHaveLength(4);
    const names = TECH_NEWS_FEEDS.map((f) => f.name);
    expect(names).toContain("techcrunch");
    expect(names).toContain("venturebeat");
    expect(names).toContain("the-verge");
    expect(names).toContain("hn-algolia-funding");
  });

  it("FUNDING_KEYWORDS includes all expected keywords", () => {
    expect(FUNDING_KEYWORDS).toContain("raises");
    expect(FUNDING_KEYWORDS).toContain("funding");
    expect(FUNDING_KEYWORDS).toContain("Series A");
    expect(FUNDING_KEYWORDS).toContain("Series B");
    expect(FUNDING_KEYWORDS).toContain("Series C");
    expect(FUNDING_KEYWORDS).toContain("hiring");
    expect(FUNDING_KEYWORDS).toContain("acquires");
    expect(FUNDING_KEYWORDS).toContain("secures");
    expect(FUNDING_KEYWORDS).toContain("lands");
  });
});

// ── runTechNewsRssSeeder ─────────────────────────────────────────────────────

describe("runTechNewsRssSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeRssXml(titles: string[]): string {
    const items = titles
      .map(
        (t) =>
          `<item><title>${t}</title><link>https://example.com/${t}</link></item>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Feed</title>
          ${items}
        </channel>
      </rss>`;
  }

  function mockFetchSuccess(responses: Record<string, string>): FetchFn {
    return vi.fn(async (url: string) => {
      for (const [key, body] of Object.entries(responses)) {
        if (url.includes(key)) {
          return new Response(body, { status: 200 });
        }
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;
  }

  it("runs full flow: fetches feeds, extracts companies, resolves via Slugger", async () => {
    const fetchFn = mockFetchSuccess({
      "techcrunch.com/feed": makeRssXml([
        "Acme raises $10M Series A",
        "Foobar secures $5M in Series B",
        "Regular news article today",
      ]),
      "venturebeat.com/feed": makeRssXml(["NewCo lands $20M funding round"]),
      "theverge.com/rss": makeRssXml(["New gadget review published"]),
      "hn.algolia.com": JSON.stringify({
        hits: [
          { title: "BigCorp acquires StartupInc" },
          { title: "Unrelated story" },
        ],
      }),
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runTechNewsRssSeeder(fetchFn);

    expect(result.error).toBeUndefined();
    expect(result.fundingArticles).toBe(4);
    expect(result.uniqueCompanies).toBe(4);
    expect(result.resolved).toBe(4);
    expect(result.unresolved).toBe(0);
    expect(resolveSlugger).toHaveBeenCalledTimes(4);
  });

  it("handles individual feed failure gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("techcrunch.com")) {
        return new Response("Server Error", { status: 500 });
      }
      if (url.includes("venturebeat.com")) {
        return new Response(makeRssXml(["Acme raises $10M Series A"]), {
          status: 200,
        });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runTechNewsRssSeeder(fetchFn);

    expect(result.error).toBeUndefined();
    expect(result.uniqueCompanies).toBe(1);
    expect(result.resolved).toBe(1);
  });

  it("handles empty results from all feeds", async () => {
    const fetchFn = mockFetchSuccess({
      "techcrunch.com/feed": makeRssXml(["Regular news article"]),
      "venturebeat.com/feed": makeRssXml(["Another regular article"]),
      "theverge.com/rss": makeRssXml(["New gadget review published"]),
      "hn.algolia.com": JSON.stringify({ hits: [] }),
    });

    const result = await runTechNewsRssSeeder(fetchFn);

    expect(result.error).toBeUndefined();
    expect(result.fundingArticles).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("passes correct SluggerInput with discoverySource and discoveryContext", async () => {
    const fetchFn = mockFetchSuccess({
      "techcrunch.com/feed": makeRssXml(["Acme raises $10M Series A"]),
      "venturebeat.com/feed": makeRssXml([]),
      "theverge.com/rss": makeRssXml([]),
      "hn.algolia.com": JSON.stringify({ hits: [] }),
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runTechNewsRssSeeder(fetchFn);

    expect(resolveSlugger).toHaveBeenCalledTimes(1);
    const call = vi.mocked(resolveSlugger).mock.calls[0];
    expect(call[0].companyName).toBe("Acme");
    expect(call[0].discoverySource).toBe("hn_algolia");
    expect(call[0].discoveryContext).toContain("tech-news:techcrunch");
    expect(call[0].discoveryContext).toContain("article:Acme raises $10M");
    expect(call[1]?.insertCompany).toBe(true);
  });

  it("counts unresolved when Slugger returns failure", async () => {
    const fetchFn = mockFetchSuccess({
      "techcrunch.com/feed": makeRssXml(["Acme raises $10M Series A"]),
      "venturebeat.com/feed": makeRssXml([]),
      "theverge.com/rss": makeRssXml([]),
      "hn.algolia.com": JSON.stringify({ hits: [] }),
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "acme",
    });

    const result = await runTechNewsRssSeeder(fetchFn);

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("counts unresolved when Slugger throws", async () => {
    const fetchFn = mockFetchSuccess({
      "techcrunch.com/feed": makeRssXml(["Acme raises $10M Series A"]),
      "venturebeat.com/feed": makeRssXml([]),
      "theverge.com/rss": makeRssXml([]),
      "hn.algolia.com": JSON.stringify({ hits: [] }),
    });

    vi.mocked(resolveSlugger).mockRejectedValue(new Error("Slugger error"));

    const result = await runTechNewsRssSeeder(fetchFn);

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("deduplicates companies across feeds", async () => {
    const fetchFn = mockFetchSuccess({
      "techcrunch.com/feed": makeRssXml(["Acme raises $10M Series A"]),
      "venturebeat.com/feed": makeRssXml(["Acme raises $15M Series B"]),
      "theverge.com/rss": makeRssXml([]),
      "hn.algolia.com": JSON.stringify({
        hits: [{ title: "Acme raises $20M Series C" }],
      }),
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runTechNewsRssSeeder(fetchFn);

    expect(result.fundingArticles).toBe(3);
    expect(result.uniqueCompanies).toBe(1);
    expect(resolveSlugger).toHaveBeenCalledTimes(1);
  });

  it("skips articles where company name cannot be extracted", async () => {
    const fetchFn = mockFetchSuccess({
      "techcrunch.com/feed": makeRssXml([
        "funding round announced for unnamed startup",
        "Acme raises $10M Series A",
      ]),
      "venturebeat.com/feed": makeRssXml([]),
      "theverge.com/rss": makeRssXml([]),
      "hn.algolia.com": JSON.stringify({ hits: [] }),
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runTechNewsRssSeeder(fetchFn);

    expect(result.fundingArticles).toBe(2);
    expect(result.uniqueCompanies).toBe(1);
    expect(resolveSlugger).toHaveBeenCalledTimes(1);
  });
});
