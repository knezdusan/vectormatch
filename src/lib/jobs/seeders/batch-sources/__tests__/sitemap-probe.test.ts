/**
 * Unit tests for B10 — Sitemap.xml Probing Seeder (TDD §2.1)
 *
 * Tests:
 *   - normalizeWebsite: URL normalization
 *   - extractUrlsFromSitemap: XML sitemap URL extraction
 *   - extractAtsCompanyInputs: ATS URL → SeedCompanyInput extraction
 *   - runSitemapProbeSeeder: full seeder with mocked DB + fetch
 *   - Error handling: sitemap fetch failures, DB errors
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

// Mock the company-repository
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
    insertedCompanyIds: [],
    insertedCompanies: [],
  }),
}));

// Mock the sluggerRetry schema
vi.mock("@/db/schemas/jobs/sluggerRetry", () => ({
  sluggerRetry: {
    companyName: "company_name",
    website: "website",
  },
}));

import { db } from "@/db/db";
import {
  extractAtsCompanyInputs,
  extractUrlsFromSitemap,
  normalizeWebsite,
  runSitemapProbeSeeder,
} from "@/lib/jobs/seeders/batch-sources/sitemap-probe";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://acme.com/</loc></url>
  <url><loc>https://acme.com/about</loc></url>
  <url><loc>https://boards.greenhouse.io/acme/jobs/123</loc></url>
  <url><loc>https://jobs.lever.co/foobar/abc-456</loc></url>
  <url><loc>https://acme.com/blog</loc></url>
</urlset>`;

const SITEMAP_INDEX_XML = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://acme.com/sitemap1.xml</loc></sitemap>
  <sitemap><loc>https://acme.com/sitemap2.xml</loc></sitemap>
</sitemapindex>`;

const EMPTY_SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>`;

// ── normalizeWebsite ─────────────────────────────────────────────────────────

describe("normalizeWebsite", () => {
  it("normalizes a full URL to protocol + host", () => {
    expect(normalizeWebsite("https://acme.com/some/path")).toBe(
      "https://acme.com",
    );
  });

  it("normalizes a URL with port", () => {
    expect(normalizeWebsite("http://localhost:3000/path")).toBe(
      "http://localhost:3000",
    );
  });

  it("adds https:// prefix for bare domains", () => {
    expect(normalizeWebsite("acme.com")).toBe("https://acme.com");
  });

  it("returns null for invalid URLs", () => {
    expect(normalizeWebsite("not a url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeWebsite("")).toBeNull();
  });
});

// ── extractUrlsFromSitemap ───────────────────────────────────────────────────

describe("extractUrlsFromSitemap", () => {
  it("extracts URLs from a standard sitemap", () => {
    const urls = extractUrlsFromSitemap(SITEMAP_XML);
    expect(urls).toHaveLength(5);
    expect(urls).toContain("https://acme.com/");
    expect(urls).toContain("https://boards.greenhouse.io/acme/jobs/123");
  });

  it("extracts URLs from a sitemap index", () => {
    const urls = extractUrlsFromSitemap(SITEMAP_INDEX_XML);
    expect(urls).toHaveLength(2);
    expect(urls).toContain("https://acme.com/sitemap1.xml");
  });

  it("handles empty sitemap", () => {
    const urls = extractUrlsFromSitemap(EMPTY_SITEMAP);
    expect(urls).toHaveLength(0);
  });

  it("handles invalid XML", () => {
    const urls = extractUrlsFromSitemap("not xml");
    expect(urls).toHaveLength(0);
  });
});

// ── extractAtsCompanyInputs ──────────────────────────────────────────────────

describe("extractAtsCompanyInputs", () => {
  it("extracts ATS company inputs from sitemap URLs", () => {
    const urls = [
      "https://acme.com/",
      "https://boards.greenhouse.io/acme/jobs/123",
      "https://jobs.lever.co/foobar/abc-456",
      "https://acme.com/blog",
    ];

    const inputs = extractAtsCompanyInputs(urls, "Acme");

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("greenhouse");
    expect(inputs[0].discoverySource).toBe("sitemap_probe");
    expect(inputs[1].atsSlug).toBe("foobar");
    expect(inputs[1].atsSource).toBe("lever");
  });

  it("deduplicates by (atsSource, atsSlug)", () => {
    const urls = [
      "https://boards.greenhouse.io/acme/jobs/123",
      "https://boards.greenhouse.io/acme/jobs/456",
      "https://boards.greenhouse.io/acme/jobs/789",
    ];

    const inputs = extractAtsCompanyInputs(urls, "Acme");
    expect(inputs).toHaveLength(1);
  });

  it("skips non-ATS URLs", () => {
    const urls = [
      "https://acme.com/",
      "https://acme.com/careers",
      "https://example.com/blog",
    ];

    const inputs = extractAtsCompanyInputs(urls, "Acme");
    expect(inputs).toHaveLength(0);
  });

  it("handles empty URL list", () => {
    const inputs = extractAtsCompanyInputs([], "Acme");
    expect(inputs).toHaveLength(0);
  });

  it("includes discoveryContext with company name and URL", () => {
    const inputs = extractAtsCompanyInputs(
      ["https://boards.greenhouse.io/acme/jobs/123"],
      "Acme",
    );

    expect(inputs[0].discoveryContext).toContain("sitemap:Acme");
    expect(inputs[0].discoveryContext).toContain("boards.greenhouse.io/acme");
  });

  it("extracts Recruitee slug from subdomain", () => {
    const inputs = extractAtsCompanyInputs(
      ["https://acme.recruitee.com/o/devops-engineer"],
      "Acme",
    );

    expect(inputs).toHaveLength(1);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("recruitee");
  });
});

// ── runSitemapProbeSeeder ────────────────────────────────────────────────────

describe("runSitemapProbeSeeder", () => {
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

  function mockRetryCompanies(
    companies: { companyName: string; website: string | null }[],
  ) {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(companies),
      }),
    } as never);
  }

  it("probes sitemaps for retry companies and inserts ATS discoveries", async () => {
    mockRetryCompanies([{ companyName: "Acme", website: "https://acme.com" }]);

    const fetchFn = vi.fn(async (url: string) => {
      // Only the root sitemap.xml returns content
      if (url === "https://acme.com/sitemap.xml") {
        return new Response(SITEMAP_XML, { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    expect(result.companiesProbed).toBe(1);
    expect(result.sitemapsFound).toBe(1);
    expect(result.atsUrlsFound).toBe(2);
    expect(result.companiesInserted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("probes all 3 sitemap paths per company", async () => {
    mockRetryCompanies([{ companyName: "Acme", website: "https://acme.com" }]);

    const fetchedUrls: string[] = [];
    const fetchFn = vi.fn(async (url: string) => {
      fetchedUrls.push(url);
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    await runSitemapProbeSeeder(fetchFn);

    expect(fetchedUrls).toContain("https://acme.com/sitemap.xml");
    expect(fetchedUrls).toContain("https://acme.com/jobs/sitemap.xml");
    expect(fetchedUrls).toContain("https://acme.com/careers/sitemap.xml");
  });

  it("handles all sitemap paths returning 404", async () => {
    mockRetryCompanies([{ companyName: "Acme", website: "https://acme.com" }]);

    const fetchFn = vi.fn(async () => {
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    expect(result.companiesProbed).toBe(1);
    expect(result.sitemapsFound).toBe(0);
    expect(result.atsUrlsFound).toBe(0);
    expect(result.companiesInserted).toBe(0);
  });

  it("handles network error for individual sitemap path", async () => {
    mockRetryCompanies([{ companyName: "Acme", website: "https://acme.com" }]);

    const fetchFn = vi.fn(async (url: string) => {
      // Only the root sitemap throws — others succeed
      if (url === "https://acme.com/sitemap.xml") {
        throw new Error("ECONNREFUSED");
      }
      return new Response(SITEMAP_XML, { status: 200 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    // /sitemap.xml failed but /jobs/sitemap.xml and /careers/sitemap.xml succeeded
    expect(result.sitemapsFound).toBeGreaterThanOrEqual(1);
  });

  it("skips companies without websites", async () => {
    mockRetryCompanies([
      { companyName: "NoWebsite", website: null },
      { companyName: "Acme", website: "https://acme.com" },
    ]);

    const fetchFn = vi.fn(async () => {
      return new Response(SITEMAP_XML, { status: 200 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    expect(result.companiesProbed).toBe(1); // Only Acme
  });

  it("handles empty retry queue", async () => {
    mockRetryCompanies([]);

    const fetchFn = vi.fn(async () => {
      return new Response("", { status: 200 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    expect(result.companiesProbed).toBe(0);
    expect(result.sitemapsFound).toBe(0);
  });

  it("handles invalid website URLs gracefully", async () => {
    mockRetryCompanies([{ companyName: "BadUrl", website: "not a url" }]);

    const fetchFn = vi.fn(async () => {
      return new Response("", { status: 200 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    expect(result.companiesProbed).toBe(0); // Invalid URL → not probed
  });

  it("deduplicates ATS slugs across sitemaps", async () => {
    mockRetryCompanies([{ companyName: "Acme", website: "https://acme.com" }]);

    const fetchFn = vi.fn(async (url: string) => {
      // All sitemap paths return the same ATS URLs
      return new Response(SITEMAP_XML, { status: 200 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    // Same ATS URLs found in multiple sitemaps → deduplicated
    expect(result.atsUrlsFound).toBe(2); // acme + foobar
  });

  it("passes insert inputs with discoverySource=sitemap_probe", async () => {
    mockRetryCompanies([{ companyName: "Acme", website: "https://acme.com" }]);

    const fetchFn = vi.fn(async (url: string) => {
      if (url === "https://acme.com/sitemap.xml") {
        return new Response(SITEMAP_XML, { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    await runSitemapProbeSeeder(fetchFn);

    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoverySource).toBe("sitemap_probe");
  });

  it("handles DB query error gracefully", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("DB connection lost")),
      }),
    } as never);

    const fetchFn = vi.fn(async () => {
      return new Response("", { status: 200 });
    }) as unknown as FetchFn;

    const result = await runSitemapProbeSeeder(fetchFn);

    expect(result.error).toBe("DB connection lost");
    expect(result.companiesProbed).toBe(0);
  });
});
