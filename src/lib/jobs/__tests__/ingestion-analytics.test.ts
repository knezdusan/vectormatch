/**
 * Unit tests for Ingestion Analytics Query Layer
 *
 * Mocks the DB layer (`@/db/db`) so no real database is touched, per
 * AGENTS.md "Database Mutation in Tests" rules.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module — every chain method used by ingestion-analytics is
// mocked as a thenable so `await` works at any point in the chain.
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

import { db } from "@/db/db";
import {
  getIngestionSummary,
  getIngestionTrends,
  getRecentIngestionRuns,
  getSourcePerformance,
  getTopIngestionErrors,
} from "@/lib/jobs/ingestion-analytics";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockSelectReturn(rows: unknown[]): void {
  const chain = Object.assign(Promise.resolve(rows), {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  });
  vi.mocked(db.select).mockReturnValue(chain as never);
}

// ── getIngestionSummary ──────────────────────────────────────────────────────

describe("getIngestionSummary", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns aggregated summary with computed rates", async () => {
    mockSelectReturn([
      {
        totalRuns: 10,
        successfulRuns: 8,
        partialRuns: 1,
        failedRuns: 1,
        itemsProcessed: 1000,
        itemsInserted: 200,
        itemsUpdated: 50,
        itemsRejected: 100,
        itemsSkipped: 650,
        avgDurationMs: 15000,
      },
    ]);

    const summary = await getIngestionSummary(7);

    expect(summary.totalRuns).toBe(10);
    expect(summary.successfulRuns).toBe(8);
    expect(summary.partialRuns).toBe(1);
    expect(summary.failedRuns).toBe(1);
    expect(summary.itemsProcessed).toBe(1000);
    expect(summary.itemsInserted).toBe(200);
    expect(summary.itemsUpdated).toBe(50);
    expect(summary.itemsRejected).toBe(100);
    expect(summary.itemsSkipped).toBe(650);
    expect(summary.successRate).toBe(0.8);
    expect(summary.yieldRate).toBe(0.2);
    expect(summary.rejectionRate).toBe(0.1);
    expect(summary.skipRate).toBe(0.65);
    expect(summary.avgDurationMs).toBe(15000);
  });

  it("returns zero rates when there are no runs", async () => {
    mockSelectReturn([
      {
        totalRuns: 0,
        successfulRuns: 0,
        partialRuns: 0,
        failedRuns: 0,
        itemsProcessed: 0,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        avgDurationMs: 0,
      },
    ]);

    const summary = await getIngestionSummary(1);

    expect(summary.totalRuns).toBe(0);
    expect(summary.successRate).toBe(0);
    expect(summary.yieldRate).toBe(0);
    expect(summary.rejectionRate).toBe(0);
    expect(summary.skipRate).toBe(0);
  });
});

// ── getSourcePerformance ─────────────────────────────────────────────────────

describe("getSourcePerformance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns per-source rows with computed rates and health status", async () => {
    mockSelectReturn([
      {
        source: "daily-source-hn-algolia",
        runs: 10,
        successfulRuns: 9,
        partialRuns: 1,
        failedRuns: 0,
        itemsProcessed: 500,
        itemsInserted: 100,
        itemsUpdated: 10,
        itemsRejected: 50,
        itemsSkipped: 340,
        avgDurationMs: 5000,
        lastRunAt: new Date("2026-07-06T10:00:00Z"),
        sourceHealthStatus: "active",
      },
      {
        source: "batch-source-brave-search",
        runs: 2,
        successfulRuns: 1,
        partialRuns: 0,
        failedRuns: 1,
        itemsProcessed: 100,
        itemsInserted: 10,
        itemsUpdated: 0,
        itemsRejected: 40,
        itemsSkipped: 50,
        avgDurationMs: 25000,
        lastRunAt: new Date("2026-07-05T10:00:00Z"),
        sourceHealthStatus: "degraded",
      },
    ]);

    const rows = await getSourcePerformance(7);

    expect(rows).toHaveLength(2);

    const hn = rows[0];
    expect(hn.source).toBe("daily-source-hn-algolia");
    expect(hn.runs).toBe(10);
    expect(hn.yieldRate).toBe(0.2);
    expect(hn.rejectionRate).toBe(0.1);
    expect(hn.skipRate).toBe(0.68);
    expect(hn.successRate).toBe(0.9);
    expect(hn.sourceHealthStatus).toBe("active");

    const brave = rows[1];
    expect(brave.source).toBe("batch-source-brave-search");
    expect(brave.yieldRate).toBe(0.1);
    expect(brave.successRate).toBe(0.5);
    expect(brave.sourceHealthStatus).toBe("degraded");
  });

  it("falls back to unknown for null source and status", async () => {
    mockSelectReturn([
      {
        source: null,
        runs: 1,
        successfulRuns: 1,
        partialRuns: 0,
        failedRuns: 0,
        itemsProcessed: 10,
        itemsInserted: 10,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        avgDurationMs: 1000,
        lastRunAt: null,
        sourceHealthStatus: null,
      },
    ]);

    const rows = await getSourcePerformance(7);

    expect(rows[0].source).toBe("unknown");
    expect(rows[0].sourceHealthStatus).toBe("unknown");
    expect(rows[0].lastRunAt).toBeNull();
  });
});

// ── getIngestionTrends ───────────────────────────────────────────────────────

describe("getIngestionTrends", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns daily trend points grouped by source", async () => {
    mockSelectReturn([
      {
        date: "2026-07-06",
        source: "daily-source-hn-algolia",
        itemsProcessed: 100,
        itemsInserted: 20,
        itemsRejected: 10,
        itemsSkipped: 60,
        runs: 1,
      },
      {
        date: "2026-07-06",
        source: "daily-source-reddit-rss",
        itemsProcessed: 50,
        itemsInserted: 5,
        itemsRejected: 5,
        itemsSkipped: 30,
        runs: 1,
      },
      {
        date: "2026-07-05",
        source: "daily-source-hn-algolia",
        itemsProcessed: 80,
        itemsInserted: 15,
        itemsRejected: 8,
        itemsSkipped: 50,
        runs: 1,
      },
    ]);

    const trends = await getIngestionTrends(7);

    expect(trends).toHaveLength(3);
    expect(trends[0].date).toBe("2026-07-06");
    expect(trends[0].source).toBe("daily-source-hn-algolia");
    expect(trends[0].itemsProcessed).toBe(100);
    expect(trends[1].source).toBe("daily-source-reddit-rss");
  });
});

// ── getRecentIngestionRuns ───────────────────────────────────────────────────

describe("getRecentIngestionRuns", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns recent runs with duration and status", async () => {
    const runAt = new Date("2026-07-06T10:00:00Z");
    mockSelectReturn([
      {
        id: "run-1",
        source: "daily-source-hn-algolia",
        status: "success",
        type: "seed",
        itemsProcessed: 100,
        itemsInserted: 20,
        itemsUpdated: 2,
        itemsRejected: 10,
        itemsSkipped: 60,
        durationMs: 5000,
        errorMessage: null,
        createdAt: runAt,
      },
      {
        id: "run-2",
        source: "batch-source-brave-search",
        status: "failed",
        type: "seed",
        itemsProcessed: 0,
        itemsInserted: 0,
        itemsUpdated: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
        durationMs: null,
        errorMessage: "BRAVE_SEARCH_API_KEY not configured",
        createdAt: runAt,
      },
    ]);

    const runs = await getRecentIngestionRuns(7, 10);

    expect(runs).toHaveLength(2);
    expect(runs[0].source).toBe("daily-source-hn-algolia");
    expect(runs[0].status).toBe("success");
    expect(runs[0].durationMs).toBe(5000);
    expect(runs[1].source).toBe("batch-source-brave-search");
    expect(runs[1].status).toBe("failed");
    expect(runs[1].durationMs).toBeNull();
    expect(runs[1].errorMessage).toBe("BRAVE_SEARCH_API_KEY not configured");
  });
});

// ── getTopIngestionErrors ─────────────────────────────────────────────────────

describe("getTopIngestionErrors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns grouped errors ordered by count", async () => {
    const lastAt = new Date("2026-07-06T10:00:00Z");
    mockSelectReturn([
      {
        source: "daily-source-brave-search",
        errorMessage: "timeout",
        count: 5,
        lastAt,
      },
      {
        source: "daily-source-certstream",
        errorMessage: "rate limited",
        count: 2,
        lastAt,
      },
    ]);

    const errors = await getTopIngestionErrors(7, 10);

    expect(errors).toHaveLength(2);
    expect(errors[0].source).toBe("daily-source-brave-search");
    expect(errors[0].errorMessage).toBe("timeout");
    expect(errors[0].count).toBe(5);
    expect(errors[0].lastAt).toEqual(lastAt);
    expect(errors[1].count).toBe(2);
  });
});
