/**
 * Unit tests for the BigQuery HTTPArchive seeder (TDD §4.1.1).
 *
 * Tests the `processBigQueryRows` function (pure domain logic, no BigQuery)
 * and the `runBigQuerySeeder` function (with mocked BigQuery client). The DB
 * insert and slug probe are mocked to avoid requiring live infrastructure.
 *
 * Updated June 2026: Tests reflect the optimized query that uses the
 * `technologies` column (Wappalyzer detection) instead of scanning `payload`.
 * All rows now go through slug probe resolution with an ats_source hint.
 */

import { vi } from "vitest";

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

// Mock the resolve-custom-url module so we don't make DNS/HTTP calls.
vi.mock("@/lib/jobs/seeders/resolve-custom-url", () => ({
  resolveCustomUrl: vi.fn(),
}));

import {
  buildBigQuerySql,
  generateCrawlDates,
  processBigQueryRows,
  runBigQuerySeeder,
} from "@/lib/jobs/seeders/bigquery-seeder";
import type { BigQueryRow } from "@/lib/jobs/seeders/bq-schemas";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { ResolutionResult } from "@/lib/jobs/seeders/resolve-custom-url";
import { resolveCustomUrl } from "@/lib/jobs/seeders/resolve-custom-url";

// ── Test fixtures ────────────────────────────────────────────────────────────

const rowGreenhouse: BigQueryRow = {
  root_page: "acme.com",
  page: "https://acme.com/",
  ats_source: "greenhouse",
};

const rowLever: BigQueryRow = {
  root_page: "foobar.com",
  page: "https://foobar.com/",
  ats_source: "lever",
};

const rowWorkable: BigQueryRow = {
  root_page: "allucent.com",
  page: "https://allucent.com/",
  ats_source: "workable",
};

const rowGreenhouseNoPage: BigQueryRow = {
  root_page: "nopage.com",
  ats_source: "greenhouse",
};

// ── buildBigQuerySql ─────────────────────────────────────────────────────────

describe("buildBigQuerySql", () => {
  it("builds a valid SQL query for a given crawl date", () => {
    const sql = buildBigQuerySql("2026-06-01");
    expect(sql).toContain("date IN ('2026-06-01')");
    expect(sql).toContain("httparchive.crawl.pages");
    expect(sql).toContain("client = 'desktop'");
    expect(sql).toContain("is_root_page");
  });

  it("builds a valid SQL query for multiple crawl dates (multi-partition)", () => {
    const sql = buildBigQuerySql(["2026-06-01", "2026-05-01", "2026-04-01"]);
    expect(sql).toContain("date IN ('2026-06-01', '2026-05-01', '2026-04-01')");
    expect(sql).toContain("httparchive.crawl.pages");
  });

  it("includes all 4 tech tiers", () => {
    const sql = buildBigQuerySql("2026-06-01");
    expect(sql).toContain("Next.js");
    expect(sql).toContain("React");
    expect(sql).toContain("Node.js");
    expect(sql).toContain("Tailwind CSS");
    expect(sql).toContain("PHP");
    expect(sql).toContain("Ruby on Rails");
  });

  it("uses technologies column for ATS detection (not payload)", () => {
    const sql = buildBigQuerySql("2026-06-01");
    expect(sql).toContain("technologies");
    expect(sql).toContain("Greenhouse");
    expect(sql).toContain("Lever");
    expect(sql).toContain("Workable");
    // Must NOT reference payload (the expensive JSON column)
    expect(sql).not.toContain("payload");
    expect(sql).not.toContain("TO_JSON_STRING");
    expect(sql).not.toContain("REGEXP_EXTRACT");
    expect(sql).not.toContain("REGEXP_CONTAINS");
  });

  it("returns ats_source column from technologies detection", () => {
    const sql = buildBigQuerySql("2026-06-01");
    expect(sql).toContain("ats_source");
    expect(sql).toContain("'greenhouse'");
    expect(sql).toContain("'lever'");
    expect(sql).toContain("'workable'");
  });

  it("appends LIMIT when provided", () => {
    const sql = buildBigQuerySql("2026-06-01", 1000);
    expect(sql).toContain("LIMIT 1000");
  });

  it("does not append LIMIT when not provided", () => {
    const sql = buildBigQuerySql("2026-06-01");
    expect(sql).not.toContain("LIMIT");
  });
});

// ── generateCrawlDates ───────────────────────────────────────────────────────

describe("generateCrawlDates", () => {
  it("generates the correct number of monthly dates", () => {
    const dates = generateCrawlDates(3);
    expect(dates).toHaveLength(3);
    // All dates should be the 1st of the month
    for (const date of dates) {
      expect(date).toMatch(/^\d{4}-\d{2}-01$/);
    }
  });

  it("generates dates in descending order (most recent first)", () => {
    const dates = generateCrawlDates(3);
    expect(dates[0] > dates[1]).toBe(true);
    expect(dates[1] > dates[2]).toBe(true);
  });

  it("defaults to 6 partitions", () => {
    const dates = generateCrawlDates();
    expect(dates).toHaveLength(6);
  });
});

// ── processBigQueryRows — slug probe resolution ──────────────────────────────

describe("processBigQueryRows — slug probe resolution", () => {
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

  it("calls resolveCustomUrl with ats_source hint for each row", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "hn_custom_url",
        rootDomain: "acme.com",
        discoveryContext: "https://acme.com",
      },
      resolvedBy: "cname",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    await processBigQueryRows([rowGreenhouse]);

    expect(resolveCustomUrl).toHaveBeenCalledTimes(1);
    expect(resolveCustomUrl).toHaveBeenCalledWith(
      "https://acme.com",
      undefined,
      undefined,
      "greenhouse",
    );
  });

  it("overrides discoverySource to httparchive", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "hn_custom_url",
        rootDomain: "acme.com",
        discoveryContext: "https://acme.com",
      },
      resolvedBy: "cname",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    await processBigQueryRows([rowGreenhouse]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoverySource).toBe("httparchive");
  });

  it("passes lever as ats_source hint for lever rows", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "foobar",
        atsSource: "lever",
        discoverySource: "hn_custom_url",
        rootDomain: "foobar.com",
        discoveryContext: "https://foobar.com",
      },
      resolvedBy: "slug_probe",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    await processBigQueryRows([rowLever]);

    expect(resolveCustomUrl).toHaveBeenCalledWith(
      "https://foobar.com",
      undefined,
      undefined,
      "lever",
    );
  });

  it("passes workable as ats_source hint for workable rows", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "allucent",
        atsSource: "workable",
        discoverySource: "hn_custom_url",
        rootDomain: "allucent.com",
        discoveryContext: "https://allucent.com",
      },
      resolvedBy: "slug_probe",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    await processBigQueryRows([rowWorkable]);

    expect(resolveCustomUrl).toHaveBeenCalledWith(
      "https://allucent.com",
      undefined,
      undefined,
      "workable",
    );
  });

  it("counts resolved and unresolved domains", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "hn_custom_url",
        rootDomain: "acme.com",
        discoveryContext: "https://acme.com",
      },
      resolvedBy: "cname",
    };
    const failResult: ResolutionResult = {
      success: false,
      url: "https://foobar.com",
      reason: "cname_and_slug_probe_failed",
    };
    vi.mocked(resolveCustomUrl)
      .mockResolvedValueOnce(successResult)
      .mockResolvedValueOnce(failResult);

    const result = await processBigQueryRows([rowGreenhouse, rowLever]);

    expect(result.slugProbesAttempted).toBe(2);
    expect(result.slugProbesResolved).toBe(1);
    expect(result.unresolved).toBe(1);
  });

  it("handles multiple rows and inserts all resolved companies", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "hn_custom_url",
        rootDomain: "acme.com",
        discoveryContext: "https://acme.com",
      },
      resolvedBy: "cname",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    await processBigQueryRows([rowGreenhouse, rowLever]);

    expect(resolveCustomUrl).toHaveBeenCalledTimes(2);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg).toHaveLength(2);
  });
});

// ── processBigQueryRows — edge cases ─────────────────────────────────────────

describe("processBigQueryRows — edge cases", () => {
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

  it("handles empty rows array", async () => {
    const result = await processBigQueryRows([]);

    expect(result.domainsFound).toBe(0);
    expect(result.slugProbesAttempted).toBe(0);
    expect(result.slugProbesResolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
  });

  it("handles rows with missing page field", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "nopage",
        atsSource: "greenhouse",
        discoverySource: "hn_custom_url",
        rootDomain: "nopage.com",
        discoveryContext: "https://nopage.com",
      },
      resolvedBy: "cname",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    await processBigQueryRows([rowGreenhouseNoPage]);

    expect(resolveCustomUrl).toHaveBeenCalledWith(
      "https://nopage.com",
      undefined,
      undefined,
      "greenhouse",
    );
  });
});

// ── runBigQuerySeeder ────────────────────────────────────────────────────────

describe("runBigQuerySeeder", () => {
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

  it("calls the BigQuery query function with the built SQL", async () => {
    const queryFn = vi.fn().mockResolvedValue([rowGreenhouse]);

    await runBigQuerySeeder("2026-06-01", queryFn);

    expect(queryFn).toHaveBeenCalledTimes(1);
    const sql = queryFn.mock.calls[0][0];
    expect(sql).toContain("date IN ('2026-06-01')");
  });

  it("passes the limit to the SQL query", async () => {
    const queryFn = vi.fn().mockResolvedValue([]);

    await runBigQuerySeeder("2026-06-01", queryFn, undefined, undefined, 500);

    const sql = queryFn.mock.calls[0][0];
    expect(sql).toContain("LIMIT 500");
  });

  it("returns error result when BigQuery query fails", async () => {
    const queryFn = vi
      .fn()
      .mockRejectedValue(new Error("BigQuery unavailable"));

    const result = await runBigQuerySeeder("2026-06-01", queryFn);

    expect(result.error).toBe("BigQuery unavailable");
    expect(result.domainsFound).toBe(0);
  });

  it("returns error result when Zod validation fails", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ wrong: "shape" }]);

    const result = await runBigQuerySeeder("2026-06-01", queryFn);

    expect(result.error).toBeTruthy();
    expect(result.domainsFound).toBe(0);
  });
});
