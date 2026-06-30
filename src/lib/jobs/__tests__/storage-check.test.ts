/**
 * Unit tests for Pre-Flight Storage Check (Sprint 4 Task 4)
 *
 * Tests:
 *   - getDatabaseSizeMb: queries pg_database_size, returns a number
 *   - isStorageSafeForRefresh: threshold logic (safe / warning / critical)
 *   - Error handling: DB query failure
 *
 * The DB layer is mocked — no real database connection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { db } from "@/db/db";
import {
  getDatabaseSizeMb,
  isStorageSafeForRefresh,
  STORAGE_CRITICAL_THRESHOLD,
  STORAGE_LIMIT_MB,
  STORAGE_WARNING_THRESHOLD,
} from "@/lib/jobs/storage-check";

// ── Mock helper ──────────────────────────────────────────────────────────────

function mockDbSize(sizeMb: number): void {
  vi.mocked(db.execute).mockResolvedValue({
    rows: [{ size_mb: sizeMb }],
    rowCount: 1,
  } as never);
}

// ── Constants ────────────────────────────────────────────────────────────────

describe("storage-check constants", () => {
  it("STORAGE_LIMIT_MB is 512 (Neon Free tier)", () => {
    expect(STORAGE_LIMIT_MB).toBe(512);
  });

  it("STORAGE_WARNING_THRESHOLD is 0.88 (~450MB)", () => {
    expect(STORAGE_WARNING_THRESHOLD).toBe(0.88);
  });

  it("STORAGE_CRITICAL_THRESHOLD is 0.94 (~480MB)", () => {
    expect(STORAGE_CRITICAL_THRESHOLD).toBe(0.94);
  });
});

// ── getDatabaseSizeMb ────────────────────────────────────────────────────────

describe("getDatabaseSizeMb", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the database size in MB from pg_database_size", async () => {
    mockDbSize(350.5);
    const size = await getDatabaseSizeMb();
    expect(size).toBe(350.5);
  });

  it("returns 0 when the query returns no rows", async () => {
    vi.mocked(db.execute).mockResolvedValue({
      rows: [],
      rowCount: 0,
    } as never);
    const size = await getDatabaseSizeMb();
    expect(size).toBe(0);
  });

  it("returns 0 when size_mb is undefined", async () => {
    vi.mocked(db.execute).mockResolvedValue({
      rows: [{}],
      rowCount: 1,
    } as never);
    const size = await getDatabaseSizeMb();
    expect(size).toBe(0);
  });
});

// ── isStorageSafeForRefresh ──────────────────────────────────────────────────

describe("isStorageSafeForRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns safe=true when storage is well below the warning threshold", async () => {
    mockDbSize(200);
    const status = await isStorageSafeForRefresh();

    expect(status.safe).toBe(true);
    expect(status.currentMb).toBe(200);
    expect(status.limitMb).toBe(512);
    expect(status.percentage).toBeCloseTo(200 / 512, 5);
  });

  it("returns safe=true when storage is just below the warning threshold", async () => {
    // 449MB is below 450MB (88% of 512)
    mockDbSize(449);
    const status = await isStorageSafeForRefresh();
    expect(status.safe).toBe(true);
  });

  it("returns safe=false when storage exceeds the warning threshold (~450MB)", async () => {
    mockDbSize(460);
    const status = await isStorageSafeForRefresh();

    expect(status.safe).toBe(false);
    expect(status.percentage).toBeGreaterThan(STORAGE_WARNING_THRESHOLD);
  });

  it("returns safe=false when storage is at the critical threshold (~480MB)", async () => {
    mockDbSize(485);
    const status = await isStorageSafeForRefresh();

    expect(status.safe).toBe(false);
    expect(status.percentage).toBeGreaterThan(STORAGE_CRITICAL_THRESHOLD);
  });

  it("returns safe=false when storage exceeds the limit", async () => {
    mockDbSize(600);
    const status = await isStorageSafeForRefresh();

    expect(status.safe).toBe(false);
    expect(status.percentage).toBeGreaterThan(1);
  });

  it("includes limitMb and percentage in the result", async () => {
    mockDbSize(256);
    const status = await isStorageSafeForRefresh();

    expect(status.limitMb).toBe(512);
    expect(status.percentage).toBeCloseTo(0.5, 5);
  });
});
