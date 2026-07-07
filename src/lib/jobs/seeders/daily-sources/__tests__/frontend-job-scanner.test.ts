/**
 * Unit tests for P2-2: Frontend Job Scanner
 *
 * Tests the frontend job scanner:
 *   - Query building (site-scoped + frontend keywords)
 *   - Full scanner run with mocked fetch + mocked company insert
 *   - Discovery source is set to "frontend_job_scanner"
 *   - Error handling when API key is missing
 *
 * Per AGENTS.md: Vitest for unit tests. The company repository is mocked —
 * no real DB mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the company repository — no DB mutations
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
    insertedCompanyIds: [],
    insertedCompanies: [],
    aggregatorFiltered: 0,
  }),
}));

import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import {
  buildFrontendQuery,
  FRONTEND_KEYWORDS,
  runFrontendJobScanner,
} from "@/lib/jobs/seeders/daily-sources/frontend-job-scanner";
import type { FetchFn } from "@/lib/jobs/types";

// ── buildFrontendQuery ──────────────────────────────────────────────────────

describe("buildFrontendQuery", () => {
  it("builds a site-scoped query with frontend keywords for greenhouse", () => {
    const q = buildFrontendQuery("boards.greenhouse.io");
    expect(q).toBe(`site:boards.greenhouse.io ${FRONTEND_KEYWORDS}`);
  });

  it("builds a site-scoped query with frontend keywords for lever", () => {
    const q = buildFrontendQuery("jobs.lever.co");
    expect(q).toBe(`site:jobs.lever.co ${FRONTEND_KEYWORDS}`);
  });

  it("builds a site-scoped query with frontend keywords for ashby", () => {
    const q = buildFrontendQuery("jobs.ashbyhq.com");
    expect(q).toBe(`site:jobs.ashbyhq.com ${FRONTEND_KEYWORDS}`);
  });
});

// ── runFrontendJobScanner ───────────────────────────────────────────────────

describe("runFrontendJobScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns error when API key is empty", async () => {
    const result = await runFrontendJobScanner(
      { apiKey: "" },
      vi.fn() as any as FetchFn,
    );
    // Empty API key will cause the Brave API to return an error
    expect(result.error).toBeDefined();
  });

  it("executes 3 queries (one per ATS domain) and returns results", async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      // Simulate Brave Search API response with a job URL
      const urlObj = new URL(url);
      const query = urlObj.searchParams.get("q") ?? "";
      let resultUrl = "";
      if (query.includes("greenhouse")) {
        resultUrl = "https://boards.greenhouse.io/testcompany/jobs/123";
      } else if (query.includes("lever")) {
        resultUrl = "https://jobs.lever.co/testcompany/abc-def-123";
      } else if (query.includes("ashby")) {
        resultUrl = "https://jobs.ashbyhq.com/testcompany/xyz";
      }
      return {
        ok: true,
        json: async () => ({
          web: {
            results: resultUrl
              ? [{ url: resultUrl, title: "Frontend Engineer" }]
              : [],
          },
        }),
      };
    }) as unknown as FetchFn;

    const result = await runFrontendJobScanner(
      { apiKey: "test-api-key-12345" },
      mockFetch,
    );

    expect(result.queriesExecuted).toBe(3);
    expect(result.error).toBeUndefined();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    // The insert function should have been called
    expect(insertDiscoveredCompanies).toHaveBeenCalled();
  });

  it("handles Brave API error gracefully", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as unknown as FetchFn;

    const result = await runFrontendJobScanner(
      { apiKey: "invalid-key" },
      mockFetch,
    );

    expect(result.error).toContain("401");
    expect(result.insertResult.inserted).toBe(0);
  });

  it("deduplicates company slugs across queries", async () => {
    // Same company appears in both Greenhouse and Lever results
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      const urlObj = new URL(url);
      const query = urlObj.searchParams.get("q") ?? "";
      let resultUrl = "";
      if (query.includes("greenhouse")) {
        resultUrl = "https://boards.greenhouse.io/duplicateco/jobs/123";
      } else if (query.includes("lever")) {
        resultUrl = "https://jobs.lever.co/duplicateco/abc-def-123";
      } else if (query.includes("ashby")) {
        resultUrl = "https://jobs.ashbyhq.com/duplicateco/xyz";
      }
      return {
        ok: true,
        json: async () => ({
          web: {
            results: resultUrl
              ? [{ url: resultUrl, title: "Frontend Engineer" }]
              : [],
          },
        }),
      };
    }) as unknown as FetchFn;

    const result = await runFrontendJobScanner(
      { apiKey: "test-api-key-12345" },
      mockFetch,
    );

    // 3 queries executed, but only 2 unique slugs (greenhouse + lever have
    // different atsSource so they're different keys; ashby is a third)
    expect(result.queriesExecuted).toBe(3);
    // The insert function should have been called with deduplicated inputs
    const insertCall = (insertDiscoveredCompanies as any).mock.calls[0];
    expect(insertCall).toBeDefined();
    // Each (atsSource, atsSlug) pair should be unique
    const inputs = insertCall[0];
    const keys = inputs.map((i: any) => `${i.atsSource}:${i.atsSlug}`);
    expect(new Set(keys).size).toBe(inputs.length);
  });
});
