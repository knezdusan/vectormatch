/**
 * Unit tests for Coolify API client — Inngest service control
 *
 * Tests the status parsing logic and API call construction.
 * Fetch is mocked to simulate Coolify API responses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the "server-only" module so the import doesn't throw in tests
vi.mock("server-only", () => ({}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Set up environment variables for the Coolify client.
 */
function setEnv(env: Record<string, string | undefined>) {
  vi.stubEnv("COOLIFY_API_TOKEN", env.COOLIFY_API_TOKEN ?? "test-token");
  vi.stubEnv("COOLIFY_BASE_URL", env.COOLIFY_BASE_URL ?? "https://coolify.test");
  vi.stubEnv(
    "COOLIFY_INNGEST_SERVICE_UUID",
    env.COOLIFY_INNGEST_SERVICE_UUID ?? "test-service-uuid",
  );
}

/**
 * Create a mock fetch response.
 */
function mockResponse(
  body: unknown,
  status = 200,
  ok = true,
): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    text: () =>
      Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Coolify Client — getInngestStatus", () => {
  beforeEach(() => {
    setEnv({});
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns unknown status when Coolify API is not configured", async () => {
    vi.stubEnv("COOLIFY_API_TOKEN", "");
    const { getInngestStatus } = await import("@/lib/coolify/client");
    const result = await getInngestStatus();

    expect(result.label).toBe("Unknown");
    expect(result.isRunning).toBe(false);
    expect(result.error).toContain("not configured");
  });

  it("parses running:healthy status correctly", async () => {
    vi.stubEnv(
      "COOLIFY_BASE_URL",
      "https://coolify.test",
    );
    vi.stubEnv("COOLIFY_API_TOKEN", "test-token");

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        data: {
          uuid: "test-service-uuid",
          name: "inngest",
          status: "running:healthy",
          description: "Inngest server",
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      }),
    );

    const { getInngestStatus } = await import("@/lib/coolify/client");
    const result = await getInngestStatus();

    expect(result.coolifyStatus).toBe("running:healthy");
    expect(result.isRunning).toBe(true);
    expect(result.isPaused).toBe(false);
    expect(result.label).toBe("Running");
  });

  it("parses exited status as paused", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        data: {
          uuid: "test-service-uuid",
          name: "inngest",
          status: "exited",
          description: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      }),
    );

    const { getInngestStatus } = await import("@/lib/coolify/client");
    const result = await getInngestStatus();

    expect(result.coolifyStatus).toBe("exited");
    expect(result.isRunning).toBe(false);
    expect(result.isPaused).toBe(true);
    expect(result.label).toBe("Paused");
  });

  it("parses running:unhealthy status correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse({
        data: {
          uuid: "test-service-uuid",
          name: "inngest",
          status: "running:unhealthy",
          description: null,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      }),
    );

    const { getInngestStatus } = await import("@/lib/coolify/client");
    const result = await getInngestStatus();

    expect(result.isRunning).toBe(false);
    expect(result.label).toBe("Unhealthy");
  });

  it("handles API errors gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse("Internal Server Error", 500, false),
    );

    const { getInngestStatus } = await import("@/lib/coolify/client");
    const result = await getInngestStatus();

    expect(result.label).toBe("Unknown");
    expect(result.error).toContain("500");
  });

  it("handles network errors gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const { getInngestStatus } = await import("@/lib/coolify/client");
    const result = await getInngestStatus();

    expect(result.label).toBe("Unknown");
    expect(result.error).toContain("ECONNREFUSED");
  });
});

describe("Coolify Client — control actions", () => {
  beforeEach(() => {
    setEnv({});
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends POST to start endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResponse({}));

    const { startInngest } = await import("@/lib/coolify/client");
    const result = await startInngest();

    expect(result.success).toBe(true);
    expect(result.action).toBe("start");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://coolify.test/api/v1/services/test-service-uuid/start",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends POST to stop endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResponse({}));

    const { stopInngest } = await import("@/lib/coolify/client");
    const result = await stopInngest();

    expect(result.success).toBe(true);
    expect(result.action).toBe("stop");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://coolify.test/api/v1/services/test-service-uuid/stop",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("sends POST to restart endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockResponse({}));

    const { restartInngest } = await import("@/lib/coolify/client");
    const result = await restartInngest();

    expect(result.success).toBe(true);
    expect(result.action).toBe("restart");
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://coolify.test/api/v1/services/test-service-uuid/restart",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("returns failure on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockResponse("Forbidden", 403, false),
    );

    const { startInngest } = await import("@/lib/coolify/client");
    const result = await startInngest();

    expect(result.success).toBe(false);
    expect(result.message).toContain("403");
  });
});
