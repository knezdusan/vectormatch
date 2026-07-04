/**
 * Unit tests for Admin Query Layer (Sprint 4 Tasks 5–6)
 *
 * Tests the query functions in admin-queries.ts with a mocked Drizzle db.
 * No real database connection — all db methods are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the storage-check module (used by getInfraStats)
vi.mock("@/lib/jobs/storage-check", () => ({
  getDatabaseSizeMb: vi.fn().mockResolvedValue(256),
  getIngestionBacklog: vi.fn().mockResolvedValue(42),
  STORAGE_LIMIT_MB: 512,
  STORAGE_WARNING_THRESHOLD: 0.88,
  STORAGE_CRITICAL_THRESHOLD: 0.94,
  STORAGE_INGESTION_HALT_THRESHOLD: 0.88,
  STORAGE_EARLY_WARNING_THRESHOLD: 0.8,
  MAX_UNNORMALIZED_BACKLOG: 3000,
  UNNORMALIZED_BACKLOG_ALERT_THRESHOLD: 2500,
}));

// Mock the matching-config module (used by getInfraStats)
vi.mock("@/lib/jobs/matching-config", () => ({
  GATE2_MAX_COSINE_DISTANCE: 0.5,
}));

// Mock the db module — every method used by admin-queries is mocked.
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

import { db } from "@/db/db";
import {
  getAllSourceHealth,
  getFunnelStats,
  getFusionScoreDistribution,
  getInfraStats,
  getJobStatusDistribution,
  getMatchQueueStatusDistribution,
  getPurgeCandidates,
  getQualityScoreDistribution,
  getSystemOverviewStats,
  getTierDistribution,
  getTopCompaniesByQuality,
} from "@/lib/jobs/admin-queries";

// ── Mock helpers ─────────────────────────────────────────────────────────────

/**
 * Mock db.select(...).from(...).[where().][innerJoin().][orderBy().][limit(n)|groupBy()]
 * to return rows. The chain is a Promise (thenable) with chainable methods added
 * via Object.assign so `await` works at any point in the chain.
 */
function mockSelectReturn(rows: unknown[]): void {
  const chain = Object.assign(Promise.resolve(rows), {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
  });
  vi.mocked(db.select).mockReturnValue(chain as never);
}

/** Mock db.execute to return rows. */
function mockExecuteReturn(rows: unknown[]): void {
  vi.mocked(db.execute).mockResolvedValue({
    rows,
    rowCount: rows.length,
  } as never);
}

// ── getInfraStats ────────────────────────────────────────────────────────────

describe("getInfraStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns storage stats, gate2 threshold, and backlog", async () => {
    const stats = await getInfraStats();
    expect(stats.storageMb).toBe(256);
    expect(stats.storageLimitMb).toBe(512);
    expect(stats.storagePercentage).toBeCloseTo(0.5, 5);
    expect(stats.gate2Threshold).toBe(0.5);
    expect(stats.unnormalizedCount).toBe(42);
    expect(stats.maxUnnormalized).toBe(3000);
  });
});

// ── getAllSourceHealth ───────────────────────────────────────────────────────

describe("getAllSourceHealth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns source health rows ordered by urgency", async () => {
    const rows = [
      {
        sourceName: "batch-source-crt-sh",
        status: "disabled",
        consecutiveFailures: 5,
        lastSuccessAt: null,
        lastFailureAt: new Date(),
        lastError: "timeout",
        totalRuns: 10,
        totalFailures: 5,
        disabledAt: new Date(),
        disabledReason: "auto: 5 consecutive failures",
      },
    ];
    mockSelectReturn(rows);
    const result = await getAllSourceHealth();
    expect(result).toHaveLength(1);
    expect(result[0].sourceName).toBe("batch-source-crt-sh");
    expect(result[0].status).toBe("disabled");
  });
});

// ── getFunnelStats ───────────────────────────────────────────────────────────

describe("getFunnelStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns funnel stats with approval rate", async () => {
    // getFunnelStats makes 5 db.select calls — each returns a count.
    const counts = [100, 80, 24, 6, 18]; // totalJobs, gate0, gate12, approved, rejected
    let callIndex = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const idx = callIndex++;
      const chain = Object.assign(Promise.resolve([{ cnt: counts[idx] }]), {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      });
      return chain as never;
    });

    const stats = await getFunnelStats(7);
    expect(stats.totalJobs).toBe(100);
    expect(stats.gate0Passed).toBe(80);
    expect(stats.gate12Candidates).toBe(24);
    expect(stats.gate3Approved).toBe(6);
    expect(stats.gate3Rejected).toBe(18);
    expect(stats.approvalRate).toBeCloseTo(6 / 24, 5);
  });

  it("returns zero approval rate when no candidates", async () => {
    const chain = Object.assign(Promise.resolve([{ cnt: 0 }]), {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
    });
    vi.mocked(db.select).mockReturnValue(chain as never);
    const stats = await getFunnelStats(7);
    expect(stats.approvalRate).toBe(0);
  });
});

// ── getTierDistribution ──────────────────────────────────────────────────────

describe("getTierDistribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns tier counts grouped by tier", async () => {
    const rows = [
      { tier: "active_hot", count: 50 },
      { tier: "active", count: 200 },
      { tier: "dormant", count: 100 },
      { tier: "dead", count: 30 },
    ];
    const chain = Object.assign(Promise.resolve(rows), {
      from: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
    });
    vi.mocked(db.select).mockReturnValue(chain as never);
    const result = await getTierDistribution();
    expect(result).toHaveLength(4);
    expect(result[0].tier).toBe("active_hot");
    expect(result[0].count).toBe(50);
  });
});

// ── getQualityScoreDistribution ──────────────────────────────────────────────

describe("getQualityScoreDistribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns quality score buckets", async () => {
    mockExecuteReturn([
      { bucket: "0-10", count: 100 },
      { bucket: "10-30", count: 50 },
      { bucket: "30-50", count: 20 },
      { bucket: "50-100", count: 10 },
    ]);
    const result = await getQualityScoreDistribution();
    expect(result).toHaveLength(4);
    expect(result[0].bucket).toBe("0-10");
    expect(result[0].count).toBe(100);
  });
});

// ── getFusionScoreDistribution ───────────────────────────────────────────────

describe("getFusionScoreDistribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns fusion score distribution", async () => {
    mockExecuteReturn([
      { score: 1, count: 5000 },
      { score: 2, count: 800 },
      { score: 3, count: 100 },
      { score: 5, count: 20 },
    ]);
    const result = await getFusionScoreDistribution();
    expect(result).toHaveLength(4);
    expect(result[0].fusionScore).toBe(1);
    expect(result[0].count).toBe(5000);
  });
});

// ── getTopCompaniesByQuality ─────────────────────────────────────────────────

describe("getTopCompaniesByQuality", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns top companies by quality score", async () => {
    const rows = [
      {
        companyId: "uuid-1",
        atsSlug: "acme",
        atsSource: "greenhouse",
        companyName: "Acme Corp",
        score: 95,
        approvedMatches: 10,
        fusionScore: 3,
        tier: "active_hot",
      },
    ];
    mockSelectReturn(rows);
    const result = await getTopCompaniesByQuality(10);
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe("Acme Corp");
    expect(result[0].score).toBe(95);
  });
});

// ── getPurgeCandidates ───────────────────────────────────────────────────────

describe("getPurgeCandidates", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns low-quality active-tier companies", async () => {
    const rows = [
      {
        companyId: "uuid-2",
        atsSlug: "bad-co",
        atsSource: "lever",
        companyName: "Bad Co",
        score: 5,
        approvedMatches: 0,
        fusionScore: 1,
        tier: "active",
      },
    ];
    mockSelectReturn(rows);
    const result = await getPurgeCandidates(10);
    expect(result).toHaveLength(1);
    expect(result[0].score).toBe(5);
    expect(result[0].tier).toBe("active");
  });
});

// ── getSystemOverviewStats ───────────────────────────────────────────────────

describe("getSystemOverviewStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns aggregated system counts", async () => {
    const counts = [10, 8, 50, 1200, 900, 3000, 45, 3];
    let callIndex = 0;
    vi.mocked(db.select).mockImplementation(() => {
      const idx = callIndex++;
      const chain = Object.assign(Promise.resolve([{ cnt: counts[idx] }]), {
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
      });
      return chain as never;
    });

    const result = await getSystemOverviewStats();
    expect(result.totalUsers).toBe(10);
    expect(result.onboardedUsers).toBe(8);
    expect(result.totalCompanies).toBe(50);
    expect(result.totalJobs).toBe(1200);
    expect(result.activeJobs).toBe(900);
    expect(result.totalMatches).toBe(3000);
    expect(result.approvedMatches).toBe(45);
    expect(result.staleMatches24h).toBe(3);
  });
});

// ── getJobStatusDistribution ─────────────────────────────────────────────────

describe("getJobStatusDistribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns job status counts grouped by status", async () => {
    const rows = [
      { status: "active", count: 800 },
      { status: "stale", count: 150 },
      { status: "rejected", count: 50 },
    ];
    const chain = Object.assign(Promise.resolve(rows), {
      from: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    });
    vi.mocked(db.select).mockReturnValue(chain as never);

    const result = await getJobStatusDistribution();
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ status: "active", count: 800 });
  });
});

// ── getMatchQueueStatusDistribution ────────────────────────────────────────────

describe("getMatchQueueStatusDistribution", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns match queue status counts grouped by status", async () => {
    const rows = [
      { status: "pending", count: 120 },
      { status: "approved", count: 45 },
      { status: "rejected", count: 30 },
    ];
    const chain = Object.assign(Promise.resolve(rows), {
      from: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
    });
    vi.mocked(db.select).mockReturnValue(chain as never);

    const result = await getMatchQueueStatusDistribution();
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ status: "pending", count: 120 });
  });
});
