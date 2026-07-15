/**
 * Unit tests for Q1 — Quality Probe at Insertion (TDD §1.8)
 *
 * Tests:
 *   - determineInitialTier: pure function mapping job count to tier
 *   - countGateZeroJobs: fetches ATS job list, counts Gate 0 passing jobs
 *     for all 6 ATS platforms
 *   - resolveSlugger with insertCompany=true: quality probe + company insertion
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countGateZeroJobs,
  determineInitialTier,
} from "@/lib/jobs/seeders/quality-probe";
import type { FetchFn } from "@/lib/jobs/types";

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

// ── determineInitialTier ─────────────────────────────────────────────────────

describe("determineInitialTier", () => {
  it("returns dormant for 0 jobs", () => {
    expect(determineInitialTier(0)).toBe("dormant");
  });

  it("returns dormant for 1 job", () => {
    expect(determineInitialTier(1)).toBe("dormant");
  });

  it("returns dormant for 2 jobs", () => {
    expect(determineInitialTier(2)).toBe("dormant");
  });

  it("returns active for 3 jobs", () => {
    expect(determineInitialTier(3)).toBe("active");
  });

  it("returns active for 10 jobs", () => {
    expect(determineInitialTier(10)).toBe("active");
  });

  it("returns active for 100 jobs", () => {
    expect(determineInitialTier(100)).toBe("active");
  });

  it("never returns active_hot or dead", () => {
    // active_hot is only set by tier recalculation (approved matches in 30d)
    // dead is only set by the poller (consecutive failures)
    for (let i = 0; i <= 1000; i++) {
      const tier = determineInitialTier(i);
      expect(tier === "dormant" || tier === "active").toBe(true);
    }
  });
});

// ── countGateZeroJobs — Greenhouse ───────────────────────────────────────────

describe("countGateZeroJobs — Greenhouse", () => {
  it("counts engineering jobs correctly", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [
            { id: 1, title: "Senior Frontend Engineer" },
            { id: 2, title: "Backend Engineer" },
            { id: 3, title: "Account Executive" }, // Gate 0 reject
            { id: 4, title: "DevOps Engineer" },
            { id: 5, title: "HR Manager" }, // Gate 0 reject
          ],
        }),
      },
    ]);

    const result = await countGateZeroJobs("greenhouse", "acme", fetchFn);

    expect(result.totalJobs).toBe(5);
    expect(result.gateZeroJobs).toBe(3);
    expect(result.initialTier).toBe("active");
  });

  it("returns dormant when all jobs are non-engineering", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [
            { id: 1, title: "Account Executive" },
            { id: 2, title: "HR Manager" },
          ],
        }),
      },
    ]);

    const result = await countGateZeroJobs("greenhouse", "acme", fetchFn);

    expect(result.totalJobs).toBe(2);
    expect(result.gateZeroJobs).toBe(0);
    expect(result.initialTier).toBe("dormant");
  });
});

// ── countGateZeroJobs — Lever ────────────────────────────────────────────────

describe("countGateZeroJobs — Lever", () => {
  it("counts engineering jobs from Lever 'text' field", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.lever.co/v0/postings/acme",
        status: 200,
        body: JSON.stringify([
          { id: "1", text: "Software Engineer" },
          { id: "2", text: "Sales Lead" }, // Gate 0 reject
          { id: "3", text: "Data Engineer" },
        ]),
      },
    ]);

    const result = await countGateZeroJobs("lever", "acme", fetchFn);

    expect(result.totalJobs).toBe(3);
    expect(result.gateZeroJobs).toBe(2);
    expect(result.initialTier).toBe("dormant"); // ≤2 → dormant
  });
});

// ── countGateZeroJobs — Ashby ────────────────────────────────────────────────

describe("countGateZeroJobs — Ashby", () => {
  it("counts engineering jobs from Ashby 'title' field", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.ashbyhq.com/posting-api/job-board/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [
            { id: "1", title: "Frontend Engineer" },
            { id: "2", title: "Backend Engineer" },
            { id: "3", title: "Full Stack Engineer" },
            { id: "4", title: "Designer" }, // Gate 0 reject
          ],
        }),
      },
    ]);

    const result = await countGateZeroJobs("ashby", "acme", fetchFn);

    expect(result.totalJobs).toBe(4);
    expect(result.gateZeroJobs).toBe(3);
    expect(result.initialTier).toBe("active");
  });
});

// ── countGateZeroJobs — SmartRecruiters ──────────────────────────────────────

describe("countGateZeroJobs — SmartRecruiters", () => {
  it("counts engineering jobs from SmartRecruiters 'name' field", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.smartrecruiters.com/v1/companies/acme",
        status: 200,
        body: JSON.stringify({
          content: [
            { id: "1", name: "Senior Software Engineer" },
            { id: "2", name: "Marketing Manager" }, // Gate 0 reject
            { id: "3", name: "ML Engineer" },
            { id: "4", name: "DevOps Engineer" },
          ],
          totalFound: 4,
        }),
      },
    ]);

    const result = await countGateZeroJobs("smartrecruiters", "acme", fetchFn);

    expect(result.totalJobs).toBe(4);
    expect(result.gateZeroJobs).toBe(3);
    expect(result.initialTier).toBe("active");
  });
});

// ── countGateZeroJobs — Workable ─────────────────────────────────────────────

describe("countGateZeroJobs — Workable", () => {
  it("counts engineering jobs from Workable 'title' field", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "apply.workable.com/api/v1/widget/accounts/acme",
        status: 200,
        body: JSON.stringify([
          { shortcode: "A1", title: "React Engineer" },
          { shortcode: "A2", title: "Sales Rep" }, // Gate 0 reject
          { shortcode: "A3", title: "Node.js Engineer" },
        ]),
      },
    ]);

    const result = await countGateZeroJobs("workable", "acme", fetchFn);

    expect(result.totalJobs).toBe(3);
    expect(result.gateZeroJobs).toBe(2);
    expect(result.initialTier).toBe("dormant");
  });
});

// ── countGateZeroJobs — Recruitee ────────────────────────────────────────────

describe("countGateZeroJobs — Recruitee", () => {
  it("counts engineering jobs from Recruitee 'title' field", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "api.recruitee.com/v1/companies/acme",
        status: 200,
        body: JSON.stringify({
          offers: [
            { id: 1, title: "Senior Engineer" },
            { id: 2, title: "Junior Engineer" },
            { id: 3, title: "Office Manager" }, // Gate 0 reject
            { id: 4, title: "Platform Engineer" },
          ],
        }),
      },
    ]);

    const result = await countGateZeroJobs("recruitee", "acme", fetchFn);

    expect(result.totalJobs).toBe(4);
    expect(result.gateZeroJobs).toBe(3);
    expect(result.initialTier).toBe("active");
  });
});

// ── countGateZeroJobs — Error cases ──────────────────────────────────────────

describe("countGateZeroJobs — Error cases", () => {
  it("returns dormant on 404 (company left ATS)", async () => {
    const fetchFn = mockFetch([]);

    const result = await countGateZeroJobs("greenhouse", "gone", fetchFn);

    expect(result.totalJobs).toBe(0);
    expect(result.gateZeroJobs).toBe(0);
    expect(result.initialTier).toBe("dormant");
  });

  it("returns dormant on network error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await countGateZeroJobs("greenhouse", "acme", fetchFn);

    expect(result.totalJobs).toBe(0);
    expect(result.gateZeroJobs).toBe(0);
    expect(result.initialTier).toBe("dormant");
  });

  it("returns dormant on invalid JSON response", async () => {
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io",
        status: 200,
        body: "<html>Not JSON</html>",
      },
    ]);

    const result = await countGateZeroJobs("greenhouse", "acme", fetchFn);

    expect(result.totalJobs).toBe(0);
    expect(result.initialTier).toBe("dormant");
  });
});

// ── resolveSlugger with insertCompany=true ───────────────────────────────────

// Mock the db module for company insertion tests
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

import { resolveSlugger } from "@/lib/jobs/seeders/slugger";

describe("resolveSlugger with insertCompany=true (Q1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs quality probe and inserts company after slug probe resolution", async () => {
    const { db } = await import("@/db/db");
    const mockSelect = vi.mocked(db.select);
    const mockInsert = vi.mocked(db.insert);

    // DB cache miss (Stage 0)
    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    // Company insertion returns a UUID
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "company-uuid-1" }]),
        }),
      }),
    } as never);

    // Mock fetch: Greenhouse responds with engineering jobs
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [
            { id: 1, title: "Senior Frontend Engineer" },
            { id: 2, title: "Backend Engineer" },
            { id: 3, title: "DevOps Engineer" },
            { id: 4, title: "Full Stack Engineer" },
          ],
        }),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Acme" },
      {
        fetchFn,
        checkDbCache: async () => null,
        addToRetryOnFailure: false,
        insertCompany: true,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.resolvedBy).toBe("slug_probe");
      expect(result.atsSource).toBe("greenhouse");
      expect(result.atsSlug).toBe("acme");
      expect(result.qualityProbe).toBeDefined();
      expect(result.qualityProbe?.gateZeroJobs).toBe(4);
      expect(result.qualityProbe?.initialTier).toBe("active");
      expect(result.companyId).toBe("company-uuid-1");
    }
  });

  it("sets dormant tier when company has zero engineering jobs", async () => {
    const { db } = await import("@/db/db");
    const mockSelect = vi.mocked(db.select);
    const mockInsert = vi.mocked(db.insert);

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ id: "company-uuid-2" }]),
        }),
      }),
    } as never);

    // Greenhouse responds with non-engineering jobs only
    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme",
        status: 200,
        body: JSON.stringify({
          jobs: [
            { id: 1, title: "Account Executive" },
            { id: 2, title: "HR Manager" },
          ],
        }),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Acme" },
      {
        fetchFn,
        checkDbCache: async () => null,
        addToRetryOnFailure: false,
        insertCompany: true,
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.qualityProbe?.gateZeroJobs).toBe(0);
      expect(result.qualityProbe?.initialTier).toBe("dormant");
    }
  });

  it("skips quality probe when insertCompany=false (default)", async () => {
    const { db } = await import("@/db/db");
    const mockSelect = vi.mocked(db.select);
    const mockInsert = vi.mocked(db.insert);

    mockSelect.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as never);

    const fetchFn = mockFetch([
      {
        urlPattern: "boards-api.greenhouse.io/v1/boards/acme",
        status: 200,
        body: JSON.stringify({ jobs: [{ id: 1, title: "Engineer" }] }),
      },
    ]);

    const result = await resolveSlugger(
      { companyName: "Acme" },
      {
        fetchFn,
        checkDbCache: async () => null,
        addToRetryOnFailure: false,
        // insertCompany defaults to false
      },
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.qualityProbe).toBeUndefined();
      expect(result.companyId).toBeUndefined();
    }
    // Insert should not have been called
    expect(mockInsert).not.toHaveBeenCalled();
  });
});
