/**
 * Unit tests for Q5 — Multi-Intent Fusion Scoring (CORPUS_EXPANSION_TDD §3.4)
 *
 * Tests recordDiscoverySource, getDiscoverySources, and hasBeenDiscoveredBy
 * with mocked db.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

import {
  getDiscoverySources,
  hasBeenDiscoveredBy,
  recordDiscoverySource,
} from "@/lib/jobs/quality/fusion-score";

// Type the mocked db
const getMockDb = async () => {
  const { db } = await import("@/db/db");
  return db as unknown as {
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
};

describe("recordDiscoverySource", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("increments fusion score when a new source is recorded", async () => {
    const db = await getMockDb();

    // Mock insert returning a row (new source)
    const insertReturn = vi.fn().mockResolvedValueOnce([{ id: "src-1" }]);
    db.insert.mockReturnValueOnce({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          target: [],
          returning: insertReturn,
        })),
      })),
    });

    // Mock update returning the incremented score
    db.update.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValueOnce([{ fusionScore: 2 }]),
        })),
      })),
    });

    const result = await recordDiscoverySource("company-1", "hn_algolia");

    expect(result.fusionScore).toBe(2);
    expect(result.isNewSource).toBe(true);
    expect(result.companyId).toBe("company-1");
  });

  it("does not increment fusion score when source already recorded", async () => {
    const db = await getMockDb();

    // Mock insert returning empty (duplicate source — onConflictDoNothing)
    const insertReturn = vi.fn().mockResolvedValueOnce([]);
    db.insert.mockReturnValueOnce({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          target: [],
          returning: insertReturn,
        })),
      })),
    });

    // Mock select returning current fusion score
    db.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValueOnce([{ fusionScore: 3 }]),
        })),
      })),
    });

    const result = await recordDiscoverySource("company-1", "hn_algolia");

    expect(result.fusionScore).toBe(3);
    expect(result.isNewSource).toBe(false);
    // Verify update was NOT called (no increment)
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns fusionScore 1 when company not found in select fallback", async () => {
    const db = await getMockDb();

    // Mock insert returning empty (duplicate)
    const insertReturn = vi.fn().mockResolvedValueOnce([]);
    db.insert.mockReturnValueOnce({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(() => ({
          target: [],
          returning: insertReturn,
        })),
      })),
    });

    // Mock select returning empty (company not found)
    db.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValueOnce([]),
        })),
      })),
    });

    const result = await recordDiscoverySource("nonexistent", "hn_algolia");

    expect(result.fusionScore).toBe(1);
    expect(result.isNewSource).toBe(false);
  });
});

describe("getDiscoverySources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all discovery sources for a company", async () => {
    const db = await getMockDb();
    db.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi
          .fn()
          .mockResolvedValueOnce([
            { discoverySource: "hn_algolia" },
            { discoverySource: "yc_directory" },
            { discoverySource: "vc_portfolio" },
          ]),
      })),
    });

    const sources = await getDiscoverySources("company-1");
    expect(sources).toEqual(["hn_algolia", "yc_directory", "vc_portfolio"]);
  });

  it("returns empty array when company has no recorded sources", async () => {
    const db = await getMockDb();
    db.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValueOnce([]),
      })),
    });

    const sources = await getDiscoverySources("company-1");
    expect(sources).toEqual([]);
  });
});

describe("hasBeenDiscoveredBy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the source has been recorded", async () => {
    const db = await getMockDb();
    db.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValueOnce([{ id: "src-1" }]),
        })),
      })),
    });

    const result = await hasBeenDiscoveredBy("company-1", "hn_algolia");
    expect(result).toBe(true);
  });

  it("returns false when the source has not been recorded", async () => {
    const db = await getMockDb();
    db.select.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValueOnce([]),
        })),
      })),
    });

    const result = await hasBeenDiscoveredBy("company-1", "vc_portfolio");
    expect(result).toBe(false);
  });
});
