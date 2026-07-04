/**
 * Unit tests for runSourceFunction — shared boilerplate factory for daily and
 * batch source Inngest functions.
 *
 * Tests cover:
 *   - Circuit-breaker open → skip
 *   - Storage near limit → skip (batch sources only)
 *   - Successful execution → record-success + write-log
 *   - Failed execution → record-failure + re-throw
 *   - Error result (seeder returns error) → logs as failed
 *   - Step IDs match the expected names for Inngest dashboard continuity
 */

import { vi } from "vitest";

// Mock the modules that runSourceFunction dynamically imports.
vi.mock("@/lib/jobs/source-health", () => ({
  isSourceEnabled: vi.fn().mockResolvedValue(true),
  recordSourceSuccess: vi.fn().mockResolvedValue(undefined),
  recordSourceFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/jobs/storage-check", () => ({
  isStorageSafeForRefresh: vi.fn().mockResolvedValue({
    safe: true,
    percentage: 0.3,
    currentMb: 145,
    limitMb: 450,
  }),
  getDatabaseSizeMb: vi.fn().mockResolvedValue(145),
  getIngestionBacklog: vi.fn().mockResolvedValue(0),
  STORAGE_LIMIT_MB: 460,
  NEON_STORAGE_LIMIT_MB: 512,
  STORAGE_WARNING_THRESHOLD: 0.88,
  STORAGE_CRITICAL_THRESHOLD: 0.94,
  STORAGE_INGESTION_HALT_THRESHOLD: 0.88,
  STORAGE_EARLY_WARNING_THRESHOLD: 0.8,
  MAX_UNNORMALIZED_BACKLOG: 3000,
  UNNORMALIZED_BACKLOG_ALERT_THRESHOLD: 2500,
}));

vi.mock("@/lib/jobs/poller/ingestion-log", () => ({
  writeIngestionLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("server-only", () => ({}));

import { runSourceFunction } from "@/inngest/source-helpers";
import { writeIngestionLog } from "@/lib/jobs/poller/ingestion-log";
import {
  isSourceEnabled,
  recordSourceFailure,
  recordSourceSuccess,
} from "@/lib/jobs/source-health";
import { isStorageSafeForRefresh } from "@/lib/jobs/storage-check";

// =============================================================================
// MOCK STEP CONTEXT — simulates Inngest's step.run(id, fn)
// =============================================================================

/** Records the step IDs used for dashboard continuity verification. */
function createMockStep() {
  const stepIds: string[] = [];
  const step = {
    run: vi.fn(async (id: string, fn: () => Promise<unknown>) => {
      stepIds.push(id);
      return fn();
    }),
  };
  // Cast to satisfy the StepContext type — runSourceFunction only uses step.run()
  return { step: step as never, stepIds };
}

// =============================================================================
// FIXTURES
// =============================================================================

interface TestSeederResult {
  totalPosts: number;
  insertResult: { inserted: number; rejected: number; skipped: number };
  error: string | null;
}

const successResult: TestSeederResult = {
  totalPosts: 50,
  insertResult: { inserted: 10, rejected: 5, skipped: 35 },
  error: null,
};

const errorResult: TestSeederResult = {
  totalPosts: 0,
  insertResult: { inserted: 0, rejected: 0, skipped: 0 },
  error: "API returned 500",
};

// =============================================================================
// TESTS
// =============================================================================

describe("runSourceFunction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Circuit breaker ──────────────────────────────────────────────────────

  it("skips when circuit breaker is open (isSourceEnabled returns false)", async () => {
    vi.mocked(isSourceEnabled).mockResolvedValueOnce(false);
    const { step } = createMockStep();

    const result = await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      execute: vi.fn(),
      buildLogEntry: vi.fn(),
    });

    expect(result).toEqual({ skipped: true, reason: "circuit-breaker-open" });
    expect(isSourceEnabled).toHaveBeenCalledWith("daily-source-test");
  });

  it("does not call execute when circuit breaker is open", async () => {
    vi.mocked(isSourceEnabled).mockResolvedValueOnce(false);
    const { step } = createMockStep();
    const execute = vi.fn();

    await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      execute,
      buildLogEntry: vi.fn(),
    });

    expect(execute).not.toHaveBeenCalled();
  });

  // ── Storage safety (batch sources only) ──────────────────────────────────

  it("skips when storage is near limit (batch source with checkStorage=true)", async () => {
    vi.mocked(isStorageSafeForRefresh).mockResolvedValueOnce({
      safe: false,
      percentage: 0.95,
      currentMb: 427,
      limitMb: 450,
    });
    const { step } = createMockStep();

    const result = await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "batch-source-test",
      logSource: "test_batch",
      checkStorage: true,
      execute: vi.fn(),
      buildLogEntry: vi.fn(),
    });

    expect(result).toMatchObject({
      skipped: true,
      reason: "storage-near-limit",
      safe: false,
      percentage: 0.95,
    });
  });

  it("does NOT check storage for daily sources (checkStorage=false)", async () => {
    const { step } = createMockStep();

    await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      checkStorage: false,
      execute: vi.fn().mockResolvedValue(successResult),
      buildLogEntry: () => ({
        itemsProcessed: 50,
        itemsInserted: 10,
        itemsRejected: 5,
        itemsSkipped: 35,
      }),
    });

    expect(isStorageSafeForRefresh).not.toHaveBeenCalled();
  });

  // ── Success path ─────────────────────────────────────────────────────────

  it("calls recordSourceSuccess on successful execution", async () => {
    const { step } = createMockStep();

    await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      execute: vi.fn().mockResolvedValue(successResult),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalPosts,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected,
        itemsSkipped: r.insertResult.skipped,
      }),
    });

    expect(recordSourceSuccess).toHaveBeenCalledWith("daily-source-test");
  });

  it("writes ingestion log with correct fields on success", async () => {
    const { step } = createMockStep();

    await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      execute: vi.fn().mockResolvedValue(successResult),
      buildLogEntry: (r) => ({
        itemsProcessed: r.totalPosts,
        itemsInserted: r.insertResult.inserted,
        itemsRejected: r.insertResult.rejected,
        itemsSkipped: r.insertResult.skipped,
      }),
    });

    expect(writeIngestionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "seed",
        status: "success",
        source: "test_source",
        itemsProcessed: 50,
        itemsInserted: 10,
        itemsRejected: 5,
        itemsSkipped: 35,
      }),
    );
  });

  it("returns the seeder result unchanged on success", async () => {
    const { step } = createMockStep();

    const result = await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      execute: vi.fn().mockResolvedValue(successResult),
      buildLogEntry: () => ({
        itemsProcessed: 50,
        itemsInserted: 10,
        itemsRejected: 5,
        itemsSkipped: 35,
      }),
    });

    expect(result).toEqual(successResult);
  });

  // ── Error result (seeder returns error but doesn't throw) ────────────────

  it("logs as failed when seeder returns an error string", async () => {
    const { step } = createMockStep();

    await runSourceFunction<TestSeederResult>({
      step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      execute: vi.fn().mockResolvedValue(errorResult),
      buildLogEntry: () => ({
        itemsProcessed: 0,
        itemsInserted: 0,
        itemsRejected: 0,
        itemsSkipped: 0,
      }),
    });

    expect(writeIngestionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "API returned 500",
      }),
    );
    // Still records success (the seeder didn't throw — it returned an error)
    expect(recordSourceSuccess).toHaveBeenCalled();
  });

  // ── Failure path (seeder throws) ─────────────────────────────────────────

  it("calls recordSourceFailure and re-throws when execute throws", async () => {
    const { step } = createMockStep();
    const error = new Error("Network timeout");

    await expect(
      runSourceFunction<TestSeederResult>({
        step,
        sourceName: "daily-source-test",
        logSource: "test_source",
        execute: vi.fn().mockRejectedValue(error),
        buildLogEntry: vi.fn(),
      }),
    ).rejects.toThrow("Network timeout");

    expect(recordSourceFailure).toHaveBeenCalledWith(
      "daily-source-test",
      "Error: Network timeout",
    );
  });

  it("does NOT write ingestion log when execute throws (failure path)", async () => {
    const { step } = createMockStep();

    await expect(
      runSourceFunction<TestSeederResult>({
        step,
        sourceName: "daily-source-test",
        logSource: "test_source",
        execute: vi.fn().mockRejectedValue(new Error("fail")),
        buildLogEntry: vi.fn(),
      }),
    ).rejects.toThrow();

    expect(writeIngestionLog).not.toHaveBeenCalled();
  });

  // ── Step ID continuity ───────────────────────────────────────────────────

  it("uses expected step IDs for dashboard continuity", async () => {
    const mock = createMockStep();

    await runSourceFunction<TestSeederResult>({
      step: mock.step,
      sourceName: "daily-source-test",
      logSource: "test_source",
      execute: vi.fn().mockResolvedValue(successResult),
      buildLogEntry: () => ({
        itemsProcessed: 50,
        itemsInserted: 10,
        itemsRejected: 5,
        itemsSkipped: 35,
      }),
    });

    expect(mock.stepIds).toContain("check-health");
    expect(mock.stepIds).toContain("record-success");
    expect(mock.stepIds).toContain("write-log");
  });

  it("uses check-storage step ID for batch sources", async () => {
    const mock = createMockStep();

    await runSourceFunction<TestSeederResult>({
      step: mock.step,
      sourceName: "batch-source-test",
      logSource: "test_batch",
      checkStorage: true,
      execute: vi.fn().mockResolvedValue(successResult),
      buildLogEntry: () => ({
        itemsProcessed: 50,
        itemsInserted: 10,
        itemsRejected: 5,
        itemsSkipped: 35,
      }),
    });

    expect(mock.stepIds).toContain("check-storage");
  });

  it("uses record-failure step ID when execute throws", async () => {
    const mock = createMockStep();

    await expect(
      runSourceFunction<TestSeederResult>({
        step: mock.step,
        sourceName: "daily-source-test",
        logSource: "test_source",
        execute: vi.fn().mockRejectedValue(new Error("fail")),
        buildLogEntry: vi.fn(),
      }),
    ).rejects.toThrow();

    expect(mock.stepIds).toContain("record-failure");
  });
});
