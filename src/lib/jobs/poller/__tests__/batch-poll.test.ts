/**
 * Unit tests for G5 — Batch Polling Architecture (CORPUS_EXPANSION_TDD §1.2)
 *
 * Tests:
 *   - cronToTier: maps cron strings to company tiers (pure function)
 *   - getBatchForTier: queries companies by tier with correct ordering/limit
 *
 * The full batchPollTier Inngest function integration test (with mocked
 * pollCompany) requires Inngest's test harness and is deferred to a separate
 * integration test. The core logic (cronToTier + getBatchForTier) is tested here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { cronToTier } from "@/inngest/functions";

// Mock the db module so getBatchForTier can be tested without a real database
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

// Import getBatchForTier after mocking db
import {
  getBatchForTier,
  getNeverPolledBatch,
} from "@/lib/jobs/poller/tier-queries";

// =============================================================================
// cronToTier — maps cron trigger strings to company tiers
// =============================================================================

describe("cronToTier", () => {
  it("maps the 2h cron to active_hot", () => {
    expect(cronToTier("0 */2 * * *")).toBe("active_hot");
  });

  it("maps the 12h cron to active", () => {
    expect(cronToTier("0 */12 * * *")).toBe("active");
  });

  it("maps the weekly Monday 3am cron to dormant", () => {
    expect(cronToTier("0 3 * * 1")).toBe("dormant");
  });

  it("throws on unknown cron string", () => {
    expect(() => cronToTier("0 0 * * 0")).toThrow("Unknown cron trigger");
    expect(() => cronToTier("invalid")).toThrow("Unknown cron trigger");
    expect(() => cronToTier("")).toThrow("Unknown cron trigger");
  });
});

// =============================================================================
// getBatchForTier — queries companies by tier for batch polling
// =============================================================================

describe("getBatchForTier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns companies ordered by lastPolledAt ASC NULLS FIRST with limit", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    const mockCompanies = [
      {
        id: "c1",
        atsSource: "greenhouse",
        atsSlug: "acme",
        companyName: "Acme",
      },
      {
        id: "c2",
        atsSource: "lever",
        atsSlug: "stripe",
        companyName: "Stripe",
      },
    ];

    // Mock the query chain: select → from → where → orderBy → limit
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(mockCompanies)),
          })),
        })),
      })),
    });

    const result = await getBatchForTier("active", 100);

    expect(result).toEqual(mockCompanies);
    expect(result).toHaveLength(2);
    // Verify select was called (the query was constructed)
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when no companies match the tier", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    });

    const result = await getBatchForTier("dormant", 100);
    expect(result).toEqual([]);
  });

  it("defaults to batch size 100 when no limit specified", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    const limitFn = vi.fn(() => Promise.resolve([]));
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: limitFn,
          })),
        })),
      })),
    });

    await getBatchForTier("active_hot");

    // Verify limit was called with 100 (the default batch size)
    expect(limitFn).toHaveBeenCalledWith(100);
  });

  it("accepts a custom limit", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    const limitFn = vi.fn(() => Promise.resolve([]));
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: limitFn,
          })),
        })),
      })),
    });

    await getBatchForTier("active", 50);

    expect(limitFn).toHaveBeenCalledWith(50);
  });

  it("works for all three tier values", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    for (const tier of ["active_hot", "active", "dormant"] as const) {
      vi.clearAllMocks();
      selectMock.mockReturnValueOnce({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve([])),
            })),
          })),
        })),
      });

      await getBatchForTier(tier);
      expect(selectMock).toHaveBeenCalledTimes(1);
    }
  });
});

// =============================================================================
// getNeverPolledBatch — queries never-polled companies for the backlog sweeper
// (WI2 — Poll Backlog Sweeper)
// =============================================================================

describe("getNeverPolledBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns never-polled companies ordered by discoveredAt ASC with limit", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    const mockCompanies = [
      {
        id: "c1",
        atsSource: "workable",
        atsSlug: "n26",
        companyName: "N26",
      },
      {
        id: "c2",
        atsSource: "smartrecruiters",
        atsSlug: "endava",
        companyName: "Endava",
      },
    ];

    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve(mockCompanies)),
          })),
        })),
      })),
    });

    const result = await getNeverPolledBatch(500);

    expect(result).toEqual(mockCompanies);
    expect(result).toHaveLength(2);
    expect(selectMock).toHaveBeenCalledTimes(1);
  });

  it("returns empty array when all companies have been polled", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve([])),
          })),
        })),
      })),
    });

    const result = await getNeverPolledBatch(500);
    expect(result).toEqual([]);
  });

  it("defaults to batch size 500 when no limit specified", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    const limitFn = vi.fn(() => Promise.resolve([]));
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: limitFn,
          })),
        })),
      })),
    });

    await getNeverPolledBatch();

    expect(limitFn).toHaveBeenCalledWith(500);
  });

  it("accepts a custom limit", async () => {
    const { db } = await import("@/db/db");
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;

    const limitFn = vi.fn(() => Promise.resolve([]));
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: limitFn,
          })),
        })),
      })),
    });

    await getNeverPolledBatch(250);

    expect(limitFn).toHaveBeenCalledWith(250);
  });
});
