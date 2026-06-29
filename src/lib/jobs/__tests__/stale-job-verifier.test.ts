/**
 * Unit tests for G4 — Stale Job Verification (TDD §1.6)
 *
 * Tests:
 *   - verifyJobExists: fetches ATS job list, checks if externalJobId is present
 *   - extractJobIds: parses job IDs from each ATS response format
 *   - Stale-job-queries: getApprovedMatchesForVerification, markMatchesStale
 *
 * All ATS API calls are mocked — no real network requests.
 */

import { describe, expect, it, vi } from "vitest";
import type { FetchFn } from "@/lib/jobs/types";
import { verifyJobExists } from "@/lib/jobs/verify-job-exists";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetch(
  responses: { urlPattern: string; status: number; body: string }[],
): FetchFn {
  const mock = vi.fn(async (url: string) => {
    for (const { urlPattern, status, body } of responses) {
      if (url.includes(urlPattern)) {
        return new Response(body, { status });
      }
    }
    return new Response("Not Found", { status: 404 });
  });
  return mock as unknown as FetchFn;
}

// ── verifyJobExists — Greenhouse ─────────────────────────────────────────────

describe("verifyJobExists — Greenhouse", () => {
  it("returns exists=true when job ID is in the response", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [
            { id: 12345, title: "Engineer" },
            { id: 67890, title: "Designer" },
          ],
        }),
      },
    ]);

    const result = await verifyJobExists(
      "greenhouse",
      "acme",
      "12345",
      fetchFn,
    );

    expect(result.exists).toBe(true);
    expect(result.reason).toBe("exists");
  });

  it("returns not_found when job ID is not in the response", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [{ id: 67890, title: "Designer" }],
        }),
      },
    ]);

    const result = await verifyJobExists(
      "greenhouse",
      "acme",
      "12345",
      fetchFn,
    );

    expect(result.exists).toBe(false);
    expect(result.reason).toBe("not_found");
  });
});

// ── verifyJobExists — Lever ──────────────────────────────────────────────────

describe("verifyJobExists — Lever", () => {
  it("returns exists=true for matching job ID", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/acme",
        status: 200,
        body: JSON.stringify([
          { id: "abc-123", title: "Engineer" },
          { id: "def-456", title: "PM" },
        ]),
      },
    ]);

    const result = await verifyJobExists("lever", "acme", "abc-123", fetchFn);

    expect(result.exists).toBe(true);
  });

  it("returns not_found for missing job ID", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/acme",
        status: 200,
        body: JSON.stringify([{ id: "def-456", title: "PM" }]),
      },
    ]);

    const result = await verifyJobExists("lever", "acme", "abc-123", fetchFn);

    expect(result.exists).toBe(false);
    expect(result.reason).toBe("not_found");
  });
});

// ── verifyJobExists — Ashby ──────────────────────────────────────────────────

describe("verifyJobExists — Ashby", () => {
  it("returns exists=true for matching job ID", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.ashbyhq.com/posting-api/job-board/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [{ id: "job-001", title: "Engineer" }],
        }),
      },
    ]);

    const result = await verifyJobExists("ashby", "acme", "job-001", fetchFn);

    expect(result.exists).toBe(true);
  });
});

// ── verifyJobExists — SmartRecruiters ────────────────────────────────────────

describe("verifyJobExists — SmartRecruiters", () => {
  it("returns exists=true for matching job ID in content array", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.smartrecruiters.com/v1/companies/acme",
        status: 200,
        body: JSON.stringify({
          content: [
            { id: "74983486", name: "Engineer" },
            { id: "74983487", name: "Designer" },
          ],
        }),
      },
    ]);

    const result = await verifyJobExists(
      "smartrecruiters",
      "acme",
      "74983486",
      fetchFn,
    );

    expect(result.exists).toBe(true);
  });

  it("returns not_found for missing job ID", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.smartrecruiters.com/v1/companies/acme",
        status: 200,
        body: JSON.stringify({
          content: [{ id: "74983487", name: "Designer" }],
        }),
      },
    ]);

    const result = await verifyJobExists(
      "smartrecruiters",
      "acme",
      "74983486",
      fetchFn,
    );

    expect(result.exists).toBe(false);
    expect(result.reason).toBe("not_found");
  });
});

// ── verifyJobExists — Workable ───────────────────────────────────────────────

describe("verifyJobExists — Workable", () => {
  it("returns exists=true for matching shortcode", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "apply.workable.com/api/v1/widget/accounts/acme",
        status: 200,
        body: JSON.stringify([
          { shortcode: "ABC123", title: "Engineer" },
          { shortcode: "DEF456", title: "PM" },
        ]),
      },
    ]);

    const result = await verifyJobExists("workable", "acme", "ABC123", fetchFn);

    expect(result.exists).toBe(true);
  });
});

// ── verifyJobExists — Recruitee ──────────────────────────────────────────────

describe("verifyJobExists — Recruitee", () => {
  it("returns exists=true for matching job ID in offers array", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.recruitee.com/v1/companies/acme",
        status: 200,
        body: JSON.stringify({
          offers: [
            { id: 1853589, title: "Engineer" },
            { id: 1853590, title: "Designer" },
          ],
        }),
      },
    ]);

    const result = await verifyJobExists(
      "recruitee",
      "acme",
      "1853589",
      fetchFn,
    );

    expect(result.exists).toBe(true);
  });
});

// ── verifyJobExists — Error cases ────────────────────────────────────────────

describe("verifyJobExists — Error cases", () => {
  it("returns company_gone on 404", async () => {
    const fetchFn = mockFetch([]);

    const result = await verifyJobExists(
      "greenhouse",
      "nonexistent",
      "12345",
      fetchFn,
    );

    expect(result.exists).toBe(false);
    expect(result.reason).toBe("company_gone");
  });

  it("returns error on HTTP 500", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io",
        status: 500,
        body: "Internal Server Error",
      },
    ]);

    const result = await verifyJobExists(
      "greenhouse",
      "acme",
      "12345",
      fetchFn,
    );

    expect(result.exists).toBe(false);
    expect(result.reason).toBe("error");
    expect(result.error).toContain("500");
  });

  it("returns error on network failure", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await verifyJobExists(
      "greenhouse",
      "acme",
      "12345",
      fetchFn,
    );

    expect(result.exists).toBe(false);
    expect(result.reason).toBe("error");
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("returns error on invalid JSON response", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io",
        status: 200,
        body: "<html>Not JSON</html>",
      },
    ]);

    const result = await verifyJobExists(
      "greenhouse",
      "acme",
      "12345",
      fetchFn,
    );

    expect(result.exists).toBe(false);
    expect(result.reason).toBe("error");
  });
});

// ── stale-job-queries ────────────────────────────────────────────────────────

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

import {
  countApprovedMatches,
  getApprovedMatchesForVerification,
  markMatchesStale,
} from "@/lib/jobs/stale-job-queries";

describe("stale-job-queries", () => {
  describe("getApprovedMatchesForVerification", () => {
    it("queries approved matches joined with jobs", async () => {
      const { db } = await import("@/db/db");
      const mockSelect = vi.mocked(db.select);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([
              {
                matchId: "match-1",
                jobId: "job-1",
                atsSource: "greenhouse",
                atsSlug: "acme",
                externalJobId: "12345",
              },
            ]),
          }),
        }),
      } as never);

      const result = await getApprovedMatchesForVerification(30);

      expect(result).toHaveLength(1);
      expect(result[0].matchId).toBe("match-1");
      expect(result[0].atsSource).toBe("greenhouse");
      expect(result[0].externalJobId).toBe("12345");
    });

    it("returns empty array when no approved matches", async () => {
      const { db } = await import("@/db/db");
      const mockSelect = vi.mocked(db.select);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      const result = await getApprovedMatchesForVerification(30);

      expect(result).toHaveLength(0);
    });
  });

  describe("markMatchesStale", () => {
    it("returns 0 when matchIds is empty", async () => {
      const result = await markMatchesStale([]);
      expect(result).toBe(0);
    });

    it("updates match status to stale", async () => {
      const { db } = await import("@/db/db");
      const mockUpdate = vi.mocked(db.update);
      mockUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi
              .fn()
              .mockResolvedValue([{ id: "match-1" }, { id: "match-2" }]),
          }),
        }),
      } as never);

      const result = await markMatchesStale(["match-1", "match-2"]);

      expect(result).toBe(2);
    });
  });

  describe("countApprovedMatches", () => {
    it("returns count of approved matches", async () => {
      const { db } = await import("@/db/db");
      const mockSelect = vi.mocked(db.select);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 42 }]),
        }),
      } as never);

      const result = await countApprovedMatches(30);

      expect(result).toBe(42);
    });

    it("returns 0 when no matches", async () => {
      const { db } = await import("@/db/db");
      const mockSelect = vi.mocked(db.select);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as never);

      const result = await countApprovedMatches(30);

      expect(result).toBe(0);
    });
  });
});
