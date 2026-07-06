/**
 * Unit tests for IngestionAnalytics component
 *
 * Mocks the ingestion-analytics query layer so no real database is touched.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/ingestion-analytics", () => ({
  getIngestionSummary: vi.fn().mockResolvedValue({
    totalRuns: 10,
    successfulRuns: 8,
    partialRuns: 1,
    failedRuns: 1,
    itemsProcessed: 1000,
    itemsInserted: 200,
    itemsUpdated: 50,
    itemsRejected: 100,
    itemsSkipped: 650,
    successRate: 0.8,
    yieldRate: 0.2,
    rejectionRate: 0.1,
    skipRate: 0.65,
    avgDurationMs: 15000,
  }),
  getSourcePerformance: vi.fn().mockResolvedValue([
    {
      source: "daily-source-hn-algolia",
      runs: 5,
      successfulRuns: 5,
      partialRuns: 0,
      failedRuns: 0,
      itemsProcessed: 500,
      itemsInserted: 100,
      itemsUpdated: 10,
      itemsRejected: 50,
      itemsSkipped: 340,
      yieldRate: 0.2,
      rejectionRate: 0.1,
      skipRate: 0.68,
      successRate: 1,
      avgDurationMs: 5000,
      lastRunAt: new Date("2026-07-06T10:00:00Z"),
      sourceHealthStatus: "active",
    },
  ]),
  getIngestionTrends: vi.fn().mockResolvedValue([]),
  getRecentIngestionRuns: vi.fn().mockResolvedValue([]),
  getTopIngestionErrors: vi.fn().mockResolvedValue([]),
}));

import { render, screen } from "@testing-library/react";

import { IngestionAnalytics } from "@/components/admin/IngestionAnalytics";

describe("IngestionAnalytics", () => {
  it("renders summary cards and source performance table", async () => {
    render(await IngestionAnalytics({ range: "7" }));

    expect(screen.getByText("Ingestion Performance")).toBeInTheDocument();
    expect(screen.getByText("Total Runs")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("Items Processed")).toBeInTheDocument();
    expect(screen.getByText("1,000")).toBeInTheDocument();
    expect(screen.getByText("Yield Rate")).toBeInTheDocument();
    expect(screen.getAllByText("20.0%")).toHaveLength(2); // summary card + source table

    expect(screen.getByText("Source Performance")).toBeInTheDocument();
    expect(screen.getByText("daily-source-hn-algolia")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });
});
