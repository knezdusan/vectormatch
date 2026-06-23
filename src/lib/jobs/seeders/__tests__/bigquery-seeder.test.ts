/**
 * Unit tests for the BigQuery HTTPArchive seeder (TDD §4.1.1).
 *
 * Tests the `processBigQueryRows` function (pure domain logic, no BigQuery)
 * and the `runBigQuerySeeder` function (with mocked BigQuery client). The DB
 * insert and slug probe are mocked to avoid requiring live infrastructure.
 */

import { vi } from "vitest";

// Mock the company-repository module so we don't hit the real database.
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
  }),
}));

// Mock the resolve-custom-url module so we don't make DNS/HTTP calls.
vi.mock("@/lib/jobs/seeders/resolve-custom-url", () => ({
  resolveCustomUrl: vi.fn(),
}));

import {
  buildBigQuerySql,
  processBigQueryRows,
  runBigQuerySeeder,
} from "@/lib/jobs/seeders/bigquery-seeder";
import type { BigQueryRow } from "@/lib/jobs/seeders/bq-schemas";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { ResolutionResult } from "@/lib/jobs/seeders/resolve-custom-url";
import { resolveCustomUrl } from "@/lib/jobs/seeders/resolve-custom-url";

// ── Test fixtures ────────────────────────────────────────────────────────────

const rowWithGreenhouseSlug: BigQueryRow = {
  root_page: "acme.com",
  page: "https://acme.com/",
  greenhouse_slug: "acme",
  lever_slug: null,
  ashby_slug: null,
};

const rowWithLeverSlug: BigQueryRow = {
  root_page: "foobar.com",
  page: "https://foobar.com/",
  greenhouse_slug: null,
  lever_slug: "foobar",
  ashby_slug: null,
};

const rowWithAshbySlug: BigQueryRow = {
  root_page: "baz.com",
  page: "https://baz.com/",
  greenhouse_slug: null,
  lever_slug: null,
  ashby_slug: "baz",
};

const rowWithoutSlug: BigQueryRow = {
  root_page: "startup.com",
  page: "https://startup.com/",
  greenhouse_slug: null,
  lever_slug: null,
  ashby_slug: null,
};

const rowWithMultipleSlugs: BigQueryRow = {
  root_page: "multi.com",
  page: "https://multi.com/",
  greenhouse_slug: "multi-eng",
  lever_slug: "multi-sales",
  ashby_slug: null,
};

// ── buildBigQuerySql ─────────────────────────────────────────────────────────

describe("buildBigQuerySql", () => {
  it("builds a valid SQL query for a given crawl date", () => {
    const sql = buildBigQuerySql("2024-06-01");
    expect(sql).toContain("date = '2024-06-01'");
    expect(sql).toContain("httparchive.crawl.pages");
    expect(sql).toContain("client = 'desktop'");
    expect(sql).toContain("is_root_page");
  });

  it("includes all 4 tech tiers", () => {
    const sql = buildBigQuerySql("2024-06-01");
    expect(sql).toContain("Next.js");
    expect(sql).toContain("React");
    expect(sql).toContain("Node.js");
    expect(sql).toContain("Tailwind CSS");
    expect(sql).toContain("PHP");
    expect(sql).toContain("Ruby on Rails");
  });

  it("includes ATS URL regex filters", () => {
    const sql = buildBigQuerySql("2024-06-01");
    // The SQL uses escaped dots (\\.) in regex patterns, so we check for
    // the domain name without the TLD separator.
    expect(sql).toContain("greenhouse");
    expect(sql).toContain("lever");
    expect(sql).toContain("ashbyhq");
  });

  it("includes REGEXP_EXTRACT for slug extraction", () => {
    const sql = buildBigQuerySql("2024-06-01");
    expect(sql).toContain("greenhouse_slug");
    expect(sql).toContain("lever_slug");
    expect(sql).toContain("ashby_slug");
    expect(sql).toContain("REGEXP_EXTRACT");
  });

  it("appends LIMIT when provided", () => {
    const sql = buildBigQuerySql("2024-06-01", 1000);
    expect(sql).toContain("LIMIT 1000");
  });

  it("does not append LIMIT when not provided", () => {
    const sql = buildBigQuerySql("2024-06-01");
    expect(sql).not.toContain("LIMIT");
  });
});

// ── processBigQueryRows — direct slug extraction ─────────────────────────────

describe("processBigQueryRows — direct slug extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 0,
      skipped: 0,
      rejected: [],
    });
  });

  it("extracts Greenhouse slugs directly from BigQuery results", async () => {
    await processBigQueryRows([rowWithGreenhouseSlug]);

    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0]).toEqual({
      atsSlug: "acme",
      atsSource: "greenhouse",
      rootDomain: "acme.com",
      discoverySource: "httparchive",
      discoveryContext: "https://acme.com/",
    });
  });

  it("extracts Lever slugs directly from BigQuery results", async () => {
    await processBigQueryRows([rowWithLeverSlug]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].atsSource).toBe("lever");
    expect(callArg[0].atsSlug).toBe("foobar");
  });

  it("extracts Ashby slugs directly from BigQuery results", async () => {
    await processBigQueryRows([rowWithAshbySlug]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].atsSource).toBe("ashby");
    expect(callArg[0].atsSlug).toBe("baz");
  });

  it("prefers Greenhouse when multiple slugs are present", async () => {
    await processBigQueryRows([rowWithMultipleSlugs]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg).toHaveLength(1);
    expect(callArg[0].atsSource).toBe("greenhouse");
    expect(callArg[0].atsSlug).toBe("multi-eng");
  });

  it("handles multiple rows with direct slugs", async () => {
    await processBigQueryRows([
      rowWithGreenhouseSlug,
      rowWithLeverSlug,
      rowWithAshbySlug,
    ]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg).toHaveLength(3);
  });
});

// ── processBigQueryRows — slug probe fallback ────────────────────────────────

describe("processBigQueryRows — slug probe fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 0,
      skipped: 0,
      rejected: [],
    });
  });

  it("calls resolveCustomUrl for rows without direct slugs", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "startup",
        atsSource: "greenhouse",
        discoverySource: "hn_custom_url",
        rootDomain: "startup.com",
        discoveryContext: "https://startup.com",
      },
      resolvedBy: "slug_probe",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    const result = await processBigQueryRows([rowWithoutSlug]);

    expect(resolveCustomUrl).toHaveBeenCalledTimes(1);
    expect(resolveCustomUrl).toHaveBeenCalledWith(
      "https://startup.com",
      undefined,
      undefined,
    );
    expect(result.slugProbesAttempted).toBe(1);
    expect(result.slugProbesResolved).toBe(1);
    expect(result.unresolved).toBe(0);
  });

  it("counts unresolved domains when slug probe fails", async () => {
    const failResult: ResolutionResult = {
      success: false,
      url: "https://startup.com",
      reason: "cname_and_slug_probe_failed",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(failResult);

    const result = await processBigQueryRows([rowWithoutSlug]);

    expect(result.slugProbesAttempted).toBe(1);
    expect(result.slugProbesResolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("mixes direct slugs and probe results in the same batch", async () => {
    const successResult: ResolutionResult = {
      success: true,
      input: {
        atsSlug: "startup",
        atsSource: "lever",
        discoverySource: "hn_custom_url",
        rootDomain: "startup.com",
        discoveryContext: "https://startup.com",
      },
      resolvedBy: "slug_probe",
    };
    vi.mocked(resolveCustomUrl).mockResolvedValue(successResult);

    const result = await processBigQueryRows([
      rowWithGreenhouseSlug, // direct
      rowWithoutSlug, // probe
    ]);

    expect(result.directSlugsExtracted).toBe(1);
    expect(result.slugProbesAttempted).toBe(1);
    expect(result.slugProbesResolved).toBe(1);

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
    });
  });

  it("handles empty rows array", async () => {
    const result = await processBigQueryRows([]);

    expect(result.domainsFound).toBe(0);
    expect(result.directSlugsExtracted).toBe(0);
    expect(result.slugProbesAttempted).toBe(0);
    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
  });

  it("handles rows with missing page field (falls back to constructed URL)", async () => {
    const row: BigQueryRow = {
      root_page: "acme.com",
      greenhouse_slug: "acme",
      lever_slug: null,
      ashby_slug: null,
    };

    await processBigQueryRows([row]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoveryContext).toBe("https://acme.com/");
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
    });
  });

  it("calls the BigQuery query function with the built SQL", async () => {
    const queryFn = vi.fn().mockResolvedValue([rowWithGreenhouseSlug]);

    await runBigQuerySeeder("2024-06-01", queryFn);

    expect(queryFn).toHaveBeenCalledTimes(1);
    const sql = queryFn.mock.calls[0][0];
    expect(sql).toContain("date = '2024-06-01'");
  });

  it("passes the limit to the SQL query", async () => {
    const queryFn = vi.fn().mockResolvedValue([]);

    await runBigQuerySeeder("2024-06-01", queryFn, undefined, undefined, 500);

    const sql = queryFn.mock.calls[0][0];
    expect(sql).toContain("LIMIT 500");
  });

  it("returns error result when BigQuery query fails", async () => {
    const queryFn = vi
      .fn()
      .mockRejectedValue(new Error("BigQuery unavailable"));

    const result = await runBigQuerySeeder("2024-06-01", queryFn);

    expect(result.error).toBe("BigQuery unavailable");
    expect(result.domainsFound).toBe(0);
  });

  it("returns error result when Zod validation fails", async () => {
    const queryFn = vi.fn().mockResolvedValue([{ wrong: "shape" }]);

    const result = await runBigQuerySeeder("2024-06-01", queryFn);

    expect(result.error).toBeTruthy();
    expect(result.domainsFound).toBe(0);
  });
});
