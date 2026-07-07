/**
 * Unit tests for the rate limiter — in-process mode (src/lib/jobs/poller/rate-limiter.ts).
 *
 * These tests use the REAL Bottleneck (no mock) to verify that in-process
 * rate limiting works correctly when REDIS_URL is unset. This is the mode
 * used in local dev and CI.
 *
 * Distributed mode (Redis-backed) tests are in rate-limiter-distributed.test.ts
 * because they require mocking Bottleneck itself to avoid needing a real Redis
 * server (Bottleneck's RedisDatastore creates complex Redis connections that
 * can't be easily mocked at the ioredis level).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// TESTS — In-process mode (REDIS_URL unset)
// =============================================================================

describe("rate-limiter — in-process mode (REDIS_URL unset)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
  });

  afterEach(async () => {
    const { disconnectRedis } = await import("../rate-limiter");
    await disconnectRedis();
  });

  it("returns a working Bottleneck limiter", async () => {
    const { getLimiter } = await import("../rate-limiter");
    const limiter = getLimiter("greenhouse");

    expect(limiter).toBeDefined();
    const result = await limiter.schedule(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("returns the same limiter instance for the same ATS source", async () => {
    const { getLimiter } = await import("../rate-limiter");
    const limiter1 = getLimiter("lever");
    const limiter2 = getLimiter("lever");

    expect(limiter1).toBe(limiter2);
  });

  it("returns different limiter instances for different ATS sources", async () => {
    const { getLimiter } = await import("../rate-limiter");
    const greenhouseLimiter = getLimiter("greenhouse");
    const leverLimiter = getLimiter("lever");

    expect(greenhouseLimiter).not.toBe(leverLimiter);
  });

  it("reports distributedMode = false", async () => {
    const { getLimiter, isDistributedMode } = await import("../rate-limiter");
    getLimiter("greenhouse");

    expect(isDistributedMode()).toBe(false);
  });

  it("enforces the minTime rate limit between calls", async () => {
    const { getLimiter } = await import("../rate-limiter");
    const limiter = getLimiter("test-rate");

    const timestamps: number[] = [];
    const recordTimestamp = () => {
      timestamps.push(Date.now());
      return Promise.resolve();
    };

    // Schedule 3 calls — they should be spaced at least ~500ms apart
    await limiter.schedule(recordTimestamp);
    await limiter.schedule(recordTimestamp);
    await limiter.schedule(recordTimestamp);

    expect(timestamps).toHaveLength(3);
    const gap1 = timestamps[1] - timestamps[0];
    const gap2 = timestamps[2] - timestamps[1];
    expect(gap1).toBeGreaterThanOrEqual(450); // ~500ms - 50ms tolerance
    expect(gap2).toBeGreaterThanOrEqual(450);
  });
});

// =============================================================================
// TESTS — Cleanup (in-process mode)
// =============================================================================

describe("rate-limiter — disconnectRedis cleanup (in-process)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.REDIS_URL;
  });

  it("clears cached limiters so new instances can be created", async () => {
    const { getLimiter, disconnectRedis } = await import("../rate-limiter");
    const limiter1 = getLimiter("greenhouse");
    await disconnectRedis();
    const limiter2 = getLimiter("greenhouse");

    expect(limiter2).not.toBe(limiter1);
  });

  it("is safe to call multiple times", async () => {
    const { disconnectRedis } = await import("../rate-limiter");
    await expect(disconnectRedis()).resolves.not.toThrow();
    await expect(disconnectRedis()).resolves.not.toThrow();
  });
});
