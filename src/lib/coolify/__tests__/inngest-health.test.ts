/**
 * Unit tests for Inngest Health Monitor — health check logic
 *
 * Tests the HTTP health check function and the ingestion run failure rate
 * function with mocked fetch/database. The pipeline stall query is a simple
 * count over the job table and is exercised by integration tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the "server-only" module
vi.mock("server-only", () => ({}));

// Mock the database module so imports don't fail
const { mockExecute } = vi.hoisted(() => ({ mockExecute: vi.fn() }));
vi.mock("@/db/db", () => ({
  db: {
    execute: mockExecute,
  },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Inngest Health — checkInngestHealth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns unreachable when INNGEST_HEALTH_URL is not configured", async () => {
    vi.stubEnv("INNGEST_HEALTH_URL", "");
    vi.stubEnv("INNGEST_SERVE_ORIGIN", "");

    const { checkInngestHealth } = await import("@/lib/coolify/inngest-health");
    const result = await checkInngestHealth();

    expect(result.reachable).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("returns reachable=true on HTTP 200", async () => {
    vi.stubEnv("INNGEST_HEALTH_URL", "http://inngest:8288/health");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const { checkInngestHealth } = await import("@/lib/coolify/inngest-health");
    const result = await checkInngestHealth();

    expect(result.reachable).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.error).toBeNull();
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns reachable=false on HTTP 500", async () => {
    vi.stubEnv("INNGEST_HEALTH_URL", "http://inngest:8288/health");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const { checkInngestHealth } = await import("@/lib/coolify/inngest-health");
    const result = await checkInngestHealth();

    expect(result.reachable).toBe(false);
    expect(result.statusCode).toBe(500);
    expect(result.error).toBe("HTTP 500");
  });

  it("returns reachable=false on network error", async () => {
    vi.stubEnv("INNGEST_HEALTH_URL", "http://inngest:8288/health");

    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ECONNREFUSED"));

    const { checkInngestHealth } = await import("@/lib/coolify/inngest-health");
    const result = await checkInngestHealth();

    expect(result.reachable).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toContain("ECONNREFUSED");
  });

  it("uses INNGEST_SERVE_ORIGIN as fallback for health URL", async () => {
    vi.stubEnv("INNGEST_HEALTH_URL", "");
    vi.stubEnv("INNGEST_SERVE_ORIGIN", "http://inngest:8288");

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    const { checkInngestHealth } = await import("@/lib/coolify/inngest-health");
    const result = await checkInngestHealth();

    expect(result.reachable).toBe(true);
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]).toBe(
      "http://inngest:8288/health",
    );
  });
});

describe("Inngest Health — checkFunctionFailureRate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockExecute.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns empty metrics when there are not enough runs", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ total_runs: 3, failed_runs: 1, failure_rate: 0.33 }],
    });

    const { checkFunctionFailureRate } = await import(
      "@/lib/coolify/inngest-health"
    );
    const result = await checkFunctionFailureRate();

    expect(result.totalRuns).toBe(3);
    expect(result.failedRuns).toBe(1);
    expect(result.failureRate).toBe(0.33);
    expect(result.thresholdExceeded).toBe(false);
    expect(result.topFailingFunctions).toEqual([]);
  });

  it("returns threshold exceeded and top failing sources when failure rate is high", async () => {
    mockExecute
      .mockResolvedValueOnce({
        rows: [{ total_runs: 20, failed_runs: 12, failure_rate: 0.6 }],
      })
      .mockResolvedValueOnce({
        rows: [
          { function_name: "hn_algolia", failures: 7 },
          { function_name: "greenhouse", failures: 5 },
        ],
      });

    const { checkFunctionFailureRate } = await import(
      "@/lib/coolify/inngest-health"
    );
    const result = await checkFunctionFailureRate();

    expect(result.totalRuns).toBe(20);
    expect(result.failedRuns).toBe(12);
    expect(result.failureRate).toBe(0.6);
    expect(result.thresholdExceeded).toBe(true);
    expect(result.topFailingFunctions).toEqual([
      { name: "hn_algolia", failures: 7 },
      { name: "greenhouse", failures: 5 },
    ]);
  });
});

describe("Inngest Health — THRESHOLDS", () => {
  it("exports expected threshold values", async () => {
    const { THRESHOLDS } = await import("@/lib/coolify/inngest-health");

    expect(THRESHOLDS.HEALTH_CHECK_FAILURE_THRESHOLD).toBe(3);
    expect(THRESHOLDS.FUNCTION_FAILURE_RATE_THRESHOLD).toBe(0.5);
    expect(THRESHOLDS.MIN_RUNS_FOR_FAILURE_RATE).toBe(10);
    expect(THRESHOLDS.PIPELINE_STALL_THRESHOLD_HOURS).toBe(4);
  });
});
