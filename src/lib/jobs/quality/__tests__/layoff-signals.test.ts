/**
 * Unit tests for Q3 — Layoff Signal Checker (CORPUS_EXPANSION_TDD §3.3)
 *
 * Tests the pure functions (parseLayoffRss, normalizeCompanyName, namesMatch)
 * and the database function (checkLayoffSignals) with mocked fetch + db.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  namesMatch,
  normalizeCompanyName,
  parseLayoffRss,
} from "@/lib/jobs/quality/layoff-signals";

// =============================================================================
// parseLayoffRss — pure function
// =============================================================================

describe("parseLayoffRss", () => {
  it("extracts company names from <title> elements in RSS items", () => {
    const xml = `
      <rss><channel>
        <item><title>Stripe - 500 layoffs</title></item>
        <item><title>Meta lays off 11000 employees</title></item>
        <item><title>Twitter layoffs</title></item>
      </channel></rss>
    `;
    const names = parseLayoffRss(xml);
    expect(names).toContain("Stripe");
    expect(names).toContain("Meta");
    expect(names).toContain("Twitter");
    expect(names).toHaveLength(3);
  });

  it("handles CDATA-wrapped titles", () => {
    const xml = `
      <rss><channel>
        <item><title><![CDATA[Acme Corp - 200 layoffs]]></title></item>
      </channel></rss>
    `;
    const names = parseLayoffRss(xml);
    expect(names).toContain("Acme Corp");
  });

  it("decodes HTML entities in titles", () => {
    const xml = `
      <rss><channel>
        <item><title>Smith &amp; Co - 50 layoffs</title></item>
        <item><title>O&#39;Reilly - 30 layoffs</title></item>
      </channel></rss>
    `;
    const names = parseLayoffRss(xml);
    expect(names).toContain("Smith & Co");
    expect(names).toContain("O'Reilly");
  });

  it("deduplicates company names", () => {
    const xml = `
      <rss><channel>
        <item><title>Stripe - 500 layoffs</title></item>
        <item><title>Stripe lays off 200 more</title></item>
        <item><title>Meta - 11000 layoffs</title></item>
      </channel></rss>
    `;
    const names = parseLayoffRss(xml);
    expect(names).toHaveLength(2);
    expect(names).toContain("Stripe");
    expect(names).toContain("Meta");
  });

  it("returns empty array for empty or invalid XML", () => {
    expect(parseLayoffRss("")).toEqual([]);
    expect(parseLayoffRss("not xml")).toEqual([]);
    expect(parseLayoffRss("<rss></rss>")).toEqual([]);
  });

  it("strips 'lays off' and 'layoffs' suffixes from company names", () => {
    const xml = `
      <rss><channel>
        <item><title>Salesforce lays off 8000 employees</title></item>
        <item><title>Google layoffs</title></item>
      </channel></rss>
    `;
    const names = parseLayoffRss(xml);
    expect(names).toContain("Salesforce");
    expect(names).toContain("Google");
  });
});

// =============================================================================
// normalizeCompanyName — pure function
// =============================================================================

describe("normalizeCompanyName", () => {
  it("lowercases the name", () => {
    expect(normalizeCompanyName("Stripe")).toBe("stripe");
    expect(normalizeCompanyName("META PLATFORMS")).toBe("meta platforms");
  });

  it("strips common suffixes (Inc, LLC, Ltd, Corp, etc.)", () => {
    expect(normalizeCompanyName("Stripe Inc.")).toBe("stripe");
    expect(normalizeCompanyName("Acme LLC")).toBe("acme");
    expect(normalizeCompanyName("Foo Ltd")).toBe("foo");
    expect(normalizeCompanyName("Bar Corp")).toBe("bar");
    expect(normalizeCompanyName("Acme Technologies Co.")).toBe(
      "acme technologies",
    );
  });

  it("removes punctuation", () => {
    expect(normalizeCompanyName("Smith, Jones & Co.")).toBe("smith jones &");
    expect(normalizeCompanyName("O'Reilly")).toBe("oreilly");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeCompanyName("  Foo   Bar  ")).toBe("foo bar");
  });

  it("handles empty string", () => {
    expect(normalizeCompanyName("")).toBe("");
  });
});

// =============================================================================
// namesMatch — pure function
// =============================================================================

describe("namesMatch", () => {
  it("matches identical names after normalization", () => {
    expect(namesMatch("Stripe", "Stripe Inc.")).toBe(true);
    expect(namesMatch("Meta", "Meta Platforms")).toBe(true);
    expect(namesMatch("Google", "Google LLC")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(namesMatch("STRIPE", "stripe")).toBe(true);
    expect(namesMatch("Meta", "META")).toBe(true);
  });

  it("matches when one name is a substring of the other", () => {
    expect(namesMatch("Meta", "Meta Platforms Inc.")).toBe(true);
    expect(namesMatch("Meta Platforms Inc.", "Meta")).toBe(true);
  });

  it("does not match unrelated companies", () => {
    expect(namesMatch("Stripe", "PayPal")).toBe(false);
    expect(namesMatch("Meta", "Microsoft")).toBe(false);
  });

  it("does not match very short names (< 2 chars)", () => {
    expect(namesMatch("A", "A Inc.")).toBe(false);
    expect(namesMatch("AB", "AB Inc.")).toBe(true);
  });
});

// =============================================================================
// checkLayoffSignals — database function (mocked)
// =============================================================================

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { checkLayoffSignals } from "@/lib/jobs/quality/layoff-signals";

describe("checkLayoffSignals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero counts when fetch fails", async () => {
    const failingFetch = vi.fn().mockRejectedValue(new Error("network error"));
    const result = await checkLayoffSignals(failingFetch);

    expect(result).toEqual({
      layoffsParsed: 0,
      companiesMatched: 0,
      companiesDemoted: 0,
      matchedNames: [],
    });
  });

  it("returns zero counts when fetch returns non-OK status", async () => {
    const nonOkFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 });
    const result = await checkLayoffSignals(nonOkFetch);

    expect(result.layoffsParsed).toBe(0);
    expect(result.companiesDemoted).toBe(0);
  });

  it("parses RSS, matches companies, and demotes from active_hot to active", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

    // Mock fetch returning a valid RSS feed with 2 companies
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(`
        <rss><channel>
          <item><title>Stripe - 500 layoffs</title></item>
          <item><title>Meta - 11000 layoffs</title></item>
        </channel></rss>
      `),
    });

    // Mock db.execute for each company name (2 calls, one per layoff name)
    // First call (Stripe) → 1 company demoted
    executeMock.mockResolvedValueOnce({
      rows: [{ company_name: "Stripe Inc." }],
    });
    // Second call (Meta) → 1 company demoted
    executeMock.mockResolvedValueOnce({
      rows: [{ company_name: "Meta Platforms" }],
    });

    const result = await checkLayoffSignals(mockFetch);

    expect(result.layoffsParsed).toBe(2);
    expect(result.companiesDemoted).toBe(2);
    expect(result.matchedNames).toContain("Stripe Inc.");
    expect(result.matchedNames).toContain("Meta Platforms");
    expect(executeMock).toHaveBeenCalledTimes(2);
  });

  it("demotes using ILIKE match against company_name and canonical_name", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(`
        <rss><channel>
          <item><title>Acme - 100 layoffs</title></item>
        </channel></rss>
      `),
    });

    executeMock.mockResolvedValueOnce({ rows: [] });

    await checkLayoffSignals(mockFetch);

    // Verify the SQL uses ILIKE and checks both company_name and canonical_name
    const sqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(sqlObj);

    expect(fullSql).toContain("ILIKE");
    expect(fullSql).toContain("company_name");
    expect(fullSql).toContain("canonical_name");
    expect(fullSql).toContain("active_hot");
    expect(fullSql).toContain("'active'::company_tier");
  });
});

// ── Helper ───────────────────────────────────────────────────────────────────

function getSqlText(sqlObj: unknown): string {
  if (sqlObj === null || typeof sqlObj !== "object") return String(sqlObj);
  const obj = sqlObj as Record<string, unknown>;
  const chunks = obj.queryChunks;
  if (Array.isArray(chunks)) {
    return chunks
      .map((chunk) => {
        if (chunk && typeof chunk === "object" && "value" in chunk) {
          const val = (chunk as { value: unknown }).value;
          return Array.isArray(val) ? val.join("") : String(val);
        }
        return String(chunk);
      })
      .join("");
  }
  return String(sqlObj);
}
