/**
 * Unit tests for the rate limiter — distributed mode (Redis-backed).
 *
 * These tests verify the WIRING logic: when REDIS_URL is set, the limiter
 * creates a Bottleneck.IORedisConnection and passes the correct options to
 * Bottleneck (datastore: "ioredis", per-ATS id namespace, shared connection).
 *
 * Both `ioredis` and `bottleneck` are mocked because:
 *   1. We don't want to require a running Redis server
 *   2. Bottleneck's IORedisConnection creates real Redis connections
 *      (client + subscriber, Lua script loading, pub/sub) that can't be
 *      easily mocked at the ioredis level
 *
 * The actual rate-limiting algorithm is identical in both modes (only the
 * datastore differs), so it's tested in rate-limiter.test.ts with the real
 * Bottleneck in in-process mode.
 *
 * Design note: the limiter uses fail-closed semantics. When REDIS_URL is set
 * and Redis is unreachable, Bottleneck.schedule() throws (after ioredis
 * retries). This is intentional — it's safer to stall ingestion than to risk
 * uncoordinated requests that could trigger an ATS IP ban.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// MOCKS — both ioredis and Bottleneck are mocked
// =============================================================================

const {
  mockIORedisConstructor,
  mockConnectionOn,
  mockConnectionDisconnect,
  mockBottleneckConstructor,
  mockBottleneckSchedule,
  mockBottleneckDisconnect,
  mockIORedisConnectionConstructor,
} = vi.hoisted(() => {
  // Mock the raw ioredis class (passed as `Redis` to IORedisConnection)
  const mockIORedisConstructor = vi.fn(function MockIORedis() {});

  // Mock Bottleneck.IORedisConnection — records options, has .on() and .disconnect()
  const mockConnectionOn = vi.fn();
  const mockConnectionDisconnect = vi.fn().mockResolvedValue(undefined);
  const mockIORedisConnectionConstructor = vi.fn(function MockIORedisConnection(
    this: Record<string, unknown>,
  ) {
    this.on = mockConnectionOn;
    this.disconnect = mockConnectionDisconnect;
  });

  // Mock Bottleneck: records constructor options, .schedule() just runs the fn
  const mockBottleneckSchedule = vi.fn(async (fn: () => Promise<unknown>) =>
    fn(),
  );
  const mockBottleneckDisconnect = vi.fn();
  const mockBottleneckConstructor = vi.fn(function MockBottleneck(
    this: Record<string, unknown>,
  ) {
    this.schedule = mockBottleneckSchedule;
    this.disconnect = mockBottleneckDisconnect;
  });

  // Attach IORedisConnection as a static property on the Bottleneck mock.
  // Cast through unknown because vi.fn() doesn't have static properties in its type.
  (
    mockBottleneckConstructor as unknown as Record<string, unknown>
  ).IORedisConnection = mockIORedisConnectionConstructor;

  return {
    mockIORedisConstructor,
    mockConnectionOn,
    mockConnectionDisconnect,
    mockBottleneckConstructor,
    mockBottleneckSchedule,
    mockBottleneckDisconnect,
    mockIORedisConnectionConstructor,
  };
});

vi.mock("ioredis", () => ({ default: mockIORedisConstructor }));
vi.mock("bottleneck", () => ({ default: mockBottleneckConstructor }));

// =============================================================================
// TESTS — Distributed mode (REDIS_URL set)
// =============================================================================

describe("rate-limiter — distributed mode (REDIS_URL set)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";

    // .on() returns the instance for chainability
    mockConnectionOn.mockImplementation(function (this: unknown) {
      return this;
    });
  });

  afterEach(async () => {
    const { disconnectRedis } = await import("../rate-limiter");
    await disconnectRedis();
    delete process.env.REDIS_URL;
  });

  it("creates a Bottleneck.IORedisConnection when REDIS_URL is set", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");

    expect(mockIORedisConnectionConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        clientOptions: "redis://localhost:6379",
      }),
    );
  });

  it("passes the IORedis class to IORedisConnection", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");

    expect(mockIORedisConnectionConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        Redis: mockIORedisConstructor,
      }),
    );
  });

  it("reports distributedMode = true (connection object exists)", async () => {
    const { getLimiter, isDistributedMode } = await import("../rate-limiter");
    getLimiter("greenhouse");

    expect(isDistributedMode()).toBe(true);
  });

  it("creates Bottleneck with datastore='ioredis' and per-ATS id", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");

    expect(mockBottleneckConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ats:greenhouse",
        datastore: "ioredis",
        minTime: 500,
        maxConcurrent: 1,
        clearBatcherBeforeStop: true,
      }),
    );
  });

  it("passes the shared IORedisConnection to Bottleneck", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");

    const callArgs = mockBottleneckConstructor.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(callArgs[0].connection).toBeDefined();
    expect(callArgs[0].connection).toBeTypeOf("object");
  });

  it("shares a single IORedisConnection across multiple ATS sources", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");
    getLimiter("lever");
    getLimiter("ashby");

    // IORedisConnection should only be instantiated once (shared connection)
    expect(mockIORedisConnectionConstructor).toHaveBeenCalledTimes(1);
    // But Bottleneck should be called once per ATS source
    expect(mockBottleneckConstructor).toHaveBeenCalledTimes(3);
  });

  it("creates distinct Bottleneck ids per ATS source", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");
    getLimiter("lever");

    const greenhouseArgs = mockBottleneckConstructor.mock
      .calls[0] as unknown as [Record<string, unknown>];
    const leverArgs = mockBottleneckConstructor.mock.calls[1] as unknown as [
      Record<string, unknown>,
    ];

    expect(greenhouseArgs[0].id).toBe("ats:greenhouse");
    expect(leverArgs[0].id).toBe("ats:lever");
  });

  it("registers an error event handler on the connection", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");

    expect(mockConnectionOn).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });

  it("returns a limiter with a working .schedule() method", async () => {
    const { getLimiter } = await import("../rate-limiter");
    const limiter = getLimiter("greenhouse");

    const result = await limiter.schedule(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
    expect(mockBottleneckSchedule).toHaveBeenCalled();
  });
});

// =============================================================================
// TESTS — Init failure (IORedisConnection constructor throws)
// =============================================================================

describe("rate-limiter — init failure (connection constructor throws)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REDIS_URL = "redis://malformed-url";

    // Constructor throws synchronously. Use a regular function so Vitest's
    // constructor-spy detection is happy when Bottleneck calls `new` on it.
    mockIORedisConnectionConstructor.mockImplementation(
      function throwInvalidURL() {
        throw new Error("Invalid URL");
      },
    );
  });

  afterEach(async () => {
    const { disconnectRedis } = await import("../rate-limiter");
    await disconnectRedis();
    delete process.env.REDIS_URL;
  });

  it("falls back to in-process mode when constructor throws", async () => {
    const { getLimiter, isDistributedMode } = await import("../rate-limiter");
    const limiter = getLimiter("greenhouse");

    expect(isDistributedMode()).toBe(false);

    const result = await limiter.schedule(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("creates Bottleneck WITHOUT datastore='ioredis' in fallback", async () => {
    const { getLimiter } = await import("../rate-limiter");
    getLimiter("greenhouse");

    expect(mockBottleneckConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        minTime: 500,
        maxConcurrent: 1,
      }),
    );
    const callArgs = mockBottleneckConstructor.mock.calls[0] as unknown as [
      Record<string, unknown>,
    ];
    expect(callArgs[0].datastore).toBeUndefined();
    expect(callArgs[0].connection).toBeUndefined();
  });
});

// =============================================================================
// TESTS — Cleanup (distributed mode)
// =============================================================================

describe("rate-limiter — disconnectRedis cleanup (distributed)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REDIS_URL = "redis://localhost:6379";

    // Reset mock implementations (clearAllMocks only clears call counts, not
    // implementations set by previous describe blocks)
    mockIORedisConnectionConstructor.mockImplementation(
      function MockIORedisConnection(this: Record<string, unknown>) {
        this.on = mockConnectionOn;
        this.disconnect = mockConnectionDisconnect;
      },
    );
    mockBottleneckConstructor.mockImplementation(function MockBottleneck(
      this: Record<string, unknown>,
    ) {
      this.schedule = mockBottleneckSchedule;
      this.disconnect = mockBottleneckDisconnect;
    });
    mockConnectionOn.mockImplementation(function (this: unknown) {
      return this;
    });
  });

  afterEach(async () => {
    delete process.env.REDIS_URL;
  });

  it("calls connection.disconnect() when a connection exists", async () => {
    const { getLimiter, disconnectRedis } = await import("../rate-limiter");
    getLimiter("greenhouse");
    await disconnectRedis();

    expect(mockConnectionDisconnect).toHaveBeenCalled();
  });

  it("calls disconnect() on all cached Bottleneck limiters", async () => {
    const { getLimiter, disconnectRedis } = await import("../rate-limiter");
    getLimiter("greenhouse");
    getLimiter("lever");
    await disconnectRedis();

    expect(mockBottleneckDisconnect).toHaveBeenCalledTimes(2);
  });

  it("resets distributedMode after disconnect", async () => {
    const { getLimiter, isDistributedMode, disconnectRedis } = await import(
      "../rate-limiter"
    );
    getLimiter("greenhouse");
    expect(isDistributedMode()).toBe(true);

    await disconnectRedis();
    expect(isDistributedMode()).toBe(false);
  });

  it("allows re-initialization after disconnect", async () => {
    const { getLimiter, disconnectRedis } = await import("../rate-limiter");
    getLimiter("greenhouse");
    await disconnectRedis();

    mockIORedisConnectionConstructor.mockClear();
    getLimiter("lever");
    expect(mockIORedisConnectionConstructor).toHaveBeenCalledTimes(1);
  });
});
