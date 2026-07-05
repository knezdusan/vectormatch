/**
 * Unit tests for Pre-Flight Storage Check (Sprint 4 Task 4) + Sprint 8
 * Ingestion Guard.
 *
 * Tests:
 *   - getDatabaseSizeMb: queries pg_database_size, returns a number
 *   - isStorageSafeForRefresh: threshold logic for batch source refreshes
 *   - isStorageSafeForIngestion: storage + backlog guard for job upserts
 *   - Error handling: DB query failure
 *
 * The DB layer is mocked — no real database connection.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn(),
    select: vi.fn(),
  },
}));

import { db } from "@/db/db";
import {
  getDatabaseSizeMb,
  getIngestionBacklog,
  isStorageSafeForIngestion,
  isStorageSafeForRefresh,
  MAX_UNNORMALIZED_BACKLOG,
  NEON_STORAGE_LIMIT_MB,
  STORAGE_CRITICAL_THRESHOLD,
  STORAGE_INGESTION_HALT_THRESHOLD,
  STORAGE_LIMIT_MB,
  STORAGE_WARNING_THRESHOLD,
  shouldSkipEmergencyPurge,
} from "@/lib/jobs/storage-check";

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockDbSize(sizeMb: number): void {
  vi.mocked(db.execute).mockResolvedValue({
    rows: [{ size_mb: sizeMb }],
    rowCount: 1,
  } as never);
}

function mockBacklog(count: number): void {
  vi.mocked(db.select).mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue([{ count }]),
    }),
  } as never);
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe("storage-check constants", () => {
  it("STORAGE_LIMIT_MB is 460 (safety-margined for pg_database_size)", () => {
    expect(STORAGE_LIMIT_MB).toBe(460);
  });

  it("NEON_STORAGE_LIMIT_MB is 512 (Neon Free tier actual limit)", () => {
    expect(NEON_STORAGE_LIMIT_MB).toBe(512);
  });

  it("STORAGE_WARNING_THRESHOLD is 0.88 for batch refresh guard", () => {
    expect(STORAGE_WARNING_THRESHOLD).toBe(0.88);
  });

  it("STORAGE_CRITICAL_THRESHOLD is 0.94 for legacy alert boundary", () => {
    expect(STORAGE_CRITICAL_THRESHOLD).toBe(0.94);
  });

  it("STORAGE_INGESTION_HALT_THRESHOLD is 0.88", () => {
    expect(STORAGE_INGESTION_HALT_THRESHOLD).toBe(0.88);
  });

  it("MAX_UNNORMALIZED_BACKLOG is 3000", () => {
    expect(MAX_UNNORMALIZED_BACKLOG).toBe(3000);
  });
});

// ── shouldSkipEmergencyPurge ────────────────────────────────────────────────────

describe("shouldSkipEmergencyPurge", () => {
  it("skips auto purge when storage is below the halt threshold", () => {
    expect(shouldSkipEmergencyPurge(false, 0.4)).toBe(true);
  });

  it("runs auto purge when storage is at or above the halt threshold", () => {
    expect(
      shouldSkipEmergencyPurge(false, STORAGE_INGESTION_HALT_THRESHOLD),
    ).toBe(false);
    expect(shouldSkipEmergencyPurge(false, 0.95)).toBe(false);
  });

  it("always runs on manual trigger regardless of storage percentage", () => {
    expect(shouldSkipEmergencyPurge(true, 0.4)).toBe(false);
    expect(shouldSkipEmergencyPurge(true, 0.95)).toBe(false);
  });
});

// ── getDatabaseSizeMb ─────────────────────────────────────────────────────────

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

// ── getIngestionBacklog ───────────────────────────────────────────────────────

describe("getIngestionBacklog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the count of unnormalized active + normalization_failed jobs", async () => {
    mockBacklog(123);
    const count = await getIngestionBacklog();
    expect(count).toBe(123);
  });
});

// ── isStorageSafeForRefresh ───────────────────────────────────────────────────

describe("isStorageSafeForRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns safe=true when storage is well below the warning threshold", async () => {
    mockDbSize(200);
    const status = await isStorageSafeForRefresh();

    expect(status.safe).toBe(true);
    expect(status.currentMb).toBe(200);
    expect(status.limitMb).toBe(460);
    expect(status.percentage).toBeCloseTo(200 / 460, 5);
  });

  it("returns safe=true when storage is just below the warning threshold", async () => {
    // 404MB is below 405MB (88% of 460)
    mockDbSize(404);
    const status = await isStorageSafeForRefresh();
    expect(status.safe).toBe(true);
  });

  it("returns safe=false when storage exceeds the warning threshold (~405MB)", async () => {
    mockDbSize(410);
    const status = await isStorageSafeForRefresh();

    expect(status.safe).toBe(false);
    expect(status.percentage).toBeGreaterThan(STORAGE_WARNING_THRESHOLD);
  });

  it("returns safe=false when storage exceeds the limit", async () => {
    mockDbSize(600);
    const status = await isStorageSafeForRefresh();

    expect(status.safe).toBe(false);
    expect(status.percentage).toBeGreaterThan(1);
  });
});

// ── isStorageSafeForIngestion ──────────────────────────────────────────────────

describe("isStorageSafeForIngestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.FORCE_INGESTION;
  });

  it("returns allow=true when storage and backlog are healthy", async () => {
    mockDbSize(256);
    mockBacklog(100);
    const status = await isStorageSafeForIngestion();

    expect(status.allow).toBe(true);
    expect(status.currentMb).toBe(256);
    expect(status.limitMb).toBe(460);
    expect(status.percentage).toBeCloseTo(256 / 460, 5);
    expect(status.unnormalizedCount).toBe(100);
    expect(status.maxUnnormalized).toBe(MAX_UNNORMALIZED_BACKLOG);
    expect(status.forced).toBe(false);
  });

  it("returns allow=false when storage exceeds the ingestion halt threshold", async () => {
    // 410MB > 88% of 460 = 405MB
    mockDbSize(410);
    mockBacklog(100);
    const status = await isStorageSafeForIngestion();

    expect(status.allow).toBe(false);
    expect(status.percentage).toBeGreaterThan(STORAGE_INGESTION_HALT_THRESHOLD);
    expect(status.reason).toContain("ingestion halted");
  });

  it("returns allow=false when the unnormalized backlog exceeds the limit", async () => {
    mockDbSize(256);
    mockBacklog(MAX_UNNORMALIZED_BACKLOG + 1);
    const status = await isStorageSafeForIngestion();

    expect(status.allow).toBe(false);
    expect(status.reason).toContain("normalization backlog");
  });

  it("returns allow=true when FORCE_INGESTION=1 is set", async () => {
    process.env.FORCE_INGESTION = "1";
    mockDbSize(600);
    mockBacklog(9999);
    const status = await isStorageSafeForIngestion();

    expect(status.allow).toBe(true);
    expect(status.forced).toBe(true);
  });
});
