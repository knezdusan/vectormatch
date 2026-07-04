/**
 * Unit tests for Inngest Health Monitor — health check logic
 *
 * Tests the HTTP health check function with mocked fetch.
 * The DB query functions (function failure rate, pipeline stall) are
 * tested via integration tests since they require a database connection.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the "server-only" module
vi.mock("server-only", () => ({}));

// Mock the database module so imports don't fail
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn().mockResolvedValue({ rows: [{ cnt: 0 }] }),
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

describe("Inngest Health — THRESHOLDS", () => {
  it("exports expected threshold values", async () => {
    const { THRESHOLDS } = await import("@/lib/coolify/inngest-health");

    expect(THRESHOLDS.HEALTH_CHECK_FAILURE_THRESHOLD).toBe(3);
    expect(THRESHOLDS.FUNCTION_FAILURE_RATE_THRESHOLD).toBe(0.5);
    expect(THRESHOLDS.MIN_RUNS_FOR_FAILURE_RATE).toBe(10);
    expect(THRESHOLDS.PIPELINE_STALL_THRESHOLD_HOURS).toBe(4);
  });
});
