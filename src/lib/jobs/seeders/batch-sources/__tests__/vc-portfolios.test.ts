/**
 * Unit tests for B4 — VC Portfolio Mining Seeder (TDD §2.1)
 *
 * Tests:
 *   - extractCompaniesFromHtml: pure function parsing HTML with cheerio
 *   - runVcPortfolioSeeder: full seeder with mocked fetch + Slugger
 *   - Error handling: page fetch failures, network errors
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
  extractCompaniesFromHtml,
  runVcPortfolioSeeder,
  type VcPortfolioSource,
} from "@/lib/jobs/seeders/batch-sources/vc-portfolios";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

const PORTFOLIO_HTML = `
<html>
<body>
  <nav>
    <a href="https://a16z.com/about">About</a>
    <a href="https://a16z.com/team">Team</a>
  </nav>
  <div class="portfolio">
    <a href="https://acme.com">Acme</a>
    <a href="https://foobar.com">Foobar</a>
    <a href="https://github.com/acme">GitHub</a>
    <a href="https://twitter.com/acme">Twitter</a>
    <a href="https://a16z.com/companies/acme">Acme Details</a>
    <a href="https://example.com">Learn more</a>
    <a href="/companies/ghost">Ghost</a>
    <a href="https://newco.io">NewCo</a>
  </div>
</body>
</html>
`;

const PORTFOLIO_HTML_WITH_SELECTOR = `
<html>
<body>
  <nav>
    <a href="https://example.com">Nav Link</a>
  </nav>
  <div class="portfolio-grid">
    <a href="https://acme.com">Acme</a>
    <a href="https://foobar.com">Foobar</a>
  </div>
  <div class="other-links">
    <a href="https://random.com">Random</a>
  </div>
</body>
</html>
`;

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetchHtml(html: string, status = 200): FetchFn {
  return vi.fn(async () => {
    return new Response(html, { status });
  }) as unknown as FetchFn;
}

// ── extractCompaniesFromHtml ─────────────────────────────────────────────────

describe("extractCompaniesFromHtml", () => {
  it("extracts company names + websites from <a> tags", () => {
    const companies = extractCompaniesFromHtml(
      PORTFOLIO_HTML,
      "a16z",
      undefined,
      "https://a16z.com/portfolio/",
    );

    const names = companies.map((c) => c.name);
    expect(names).toContain("Acme");
    expect(names).toContain("Foobar");
    expect(names).toContain("NewCo");
  });

  it("excludes social media links", () => {
    const companies = extractCompaniesFromHtml(
      PORTFOLIO_HTML,
      "a16z",
      undefined,
      "https://a16z.com/portfolio/",
    );

    const websites = companies.map((c) => c.website);
    expect(websites).not.toContain("https://twitter.com/acme");
    expect(websites).not.toContain("https://github.com/acme");
  });

  it("excludes the VC's own domain", () => {
    const companies = extractCompaniesFromHtml(
      PORTFOLIO_HTML,
      "a16z",
      undefined,
      "https://a16z.com/portfolio/",
    );

    const websites = companies.map((c) => c.website);
    expect(websites).not.toContain("https://a16z.com/companies/acme");
    expect(websites).not.toContain("https://a16z.com/about");
  });

  it("excludes relative URLs (no http/https)", () => {
    const companies = extractCompaniesFromHtml(
      PORTFOLIO_HTML,
      "a16z",
      undefined,
      "https://a16z.com/portfolio/",
    );

    const websites = companies.map((c) => c.website);
    expect(websites).not.toContain("/companies/ghost");
  });

  it("excludes common non-company link texts", () => {
    const companies = extractCompaniesFromHtml(
      PORTFOLIO_HTML,
      "a16z",
      undefined,
      "https://a16z.com/portfolio/",
    );

    const names = companies.map((c) => c.name);
    expect(names).not.toContain("Learn more");
  });

  it("deduplicates by hostname", () => {
    const html = `
      <a href="https://acme.com">Acme</a>
      <a href="https://acme.com/about">Acme About</a>
      <a href="https://acme.com/careers">Acme Careers</a>
    `;
    const companies = extractCompaniesFromHtml(html, "test");
    expect(companies).toHaveLength(1);
  });

  it("uses CSS selector when provided", () => {
    const companies = extractCompaniesFromHtml(
      PORTFOLIO_HTML_WITH_SELECTOR,
      "test",
      ".portfolio-grid",
    );

    const names = companies.map((c) => c.name);
    expect(names).toContain("Acme");
    expect(names).toContain("Foobar");
    expect(names).not.toContain("Nav Link");
    expect(names).not.toContain("Random");
  });

  it("handles empty HTML", () => {
    const companies = extractCompaniesFromHtml("<html></html>", "test");
    expect(companies).toHaveLength(0);
  });

  it("handles HTML with no links", () => {
    const companies = extractCompaniesFromHtml(
      "<html><body><p>No links here</p></body></html>",
      "test",
    );
    expect(companies).toHaveLength(0);
  });

  it("excludes very short text (< 2 chars)", () => {
    const html = `<a href="https://acme.com">A</a>`;
    const companies = extractCompaniesFromHtml(html, "test");
    expect(companies).toHaveLength(0);
  });

  it("excludes very long text (> 100 chars)", () => {
    const longText = "A".repeat(101);
    const html = `<a href="https://acme.com">${longText}</a>`;
    const companies = extractCompaniesFromHtml(html, "test");
    expect(companies).toHaveLength(0);
  });

  it("includes vcName in extracted companies", () => {
    const companies = extractCompaniesFromHtml(
      `<a href="https://acme.com">Acme</a>`,
      "Sequoia",
    );
    expect(companies[0].vcName).toBe("Sequoia");
  });
});

// ── runVcPortfolioSeeder ─────────────────────────────────────────────────────

describe("runVcPortfolioSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches VC pages, extracts companies, and runs them through the Slugger", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const sources: VcPortfolioSource[] = [
      { name: "TestVC", url: "https://testvc.com/portfolio" },
    ];

    const fetchFn = mockFetchHtml(
      `<a href="https://acme.com">Acme</a><a href="https://foobar.com">Foobar</a>`,
    );

    const result = await runVcPortfolioSeeder(fetchFn, sources);

    expect(result.pagesFetched).toBe(1);
    expect(result.totalCompaniesExtracted).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("counts resolved and unresolved companies", async () => {
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
        canonicalName: "foobar",
      });

    const sources: VcPortfolioSource[] = [
      { name: "TestVC", url: "https://testvc.com/portfolio" },
    ];

    const fetchFn = mockFetchHtml(
      `<a href="https://acme.com">Acme</a><a href="https://foobar.com">Foobar</a>`,
    );

    const result = await runVcPortfolioSeeder(fetchFn, sources);

    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
  });

  it("handles VC page fetch failure gracefully", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const sources: VcPortfolioSource[] = [
      { name: "FailedVC", url: "https://failedvc.com/portfolio" },
      { name: "GoodVC", url: "https://goodvc.com/portfolio" },
    ];

    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("failedvc")) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(`<a href="https://acme.com">Acme</a>`, {
        status: 200,
      });
    }) as unknown as FetchFn;

    const result = await runVcPortfolioSeeder(fetchFn, sources);

    expect(result.pagesFetched).toBe(1);
    expect(result.pagesFailed).toBe(1);
    expect(result.totalCompaniesExtracted).toBe(1);
  });

  it("handles network error for individual VC page", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const sources: VcPortfolioSource[] = [
      { name: "ErrorVC", url: "https://errorvc.com/portfolio" },
      { name: "GoodVC", url: "https://goodvc.com/portfolio" },
    ];

    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("errorvc")) {
        throw new Error("ECONNREFUSED");
      }
      return new Response(`<a href="https://acme.com">Acme</a>`, {
        status: 200,
      });
    }) as unknown as FetchFn;

    const result = await runVcPortfolioSeeder(fetchFn, sources);

    expect(result.pagesFailed).toBe(1);
    expect(result.pagesFetched).toBe(1);
  });

  it("passes correct SluggerInput with discoverySource=vc_portfolio", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const sources: VcPortfolioSource[] = [
      { name: "TestVC", url: "https://testvc.com/portfolio" },
    ];

    const fetchFn = mockFetchHtml(`<a href="https://acme.com">Acme</a>`);

    await runVcPortfolioSeeder(fetchFn, sources);

    expect(resolveSlugger).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Acme",
        website: "https://acme.com",
        discoverySource: "vc_portfolio",
      }),
      expect.objectContaining({
        insertCompany: true,
      }),
    );
  });

  it("handles empty portfolio page", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "test",
    });

    const sources: VcPortfolioSource[] = [
      { name: "TestVC", url: "https://testvc.com/portfolio" },
    ];

    const fetchFn = mockFetchHtml("<html><body></body></html>");

    const result = await runVcPortfolioSeeder(fetchFn, sources);

    expect(result.totalCompaniesExtracted).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
  });

  it("uses CSS selector when provided in source config", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const sources: VcPortfolioSource[] = [
      {
        name: "TestVC",
        url: "https://testvc.com/portfolio",
        companySelector: ".portfolio-grid",
      },
    ];

    const fetchFn = mockFetchHtml(PORTFOLIO_HTML_WITH_SELECTOR);

    const result = await runVcPortfolioSeeder(fetchFn, sources);

    // Only 2 companies from .portfolio-grid (Acme + Foobar)
    expect(result.totalCompaniesExtracted).toBe(2);
  });
});
