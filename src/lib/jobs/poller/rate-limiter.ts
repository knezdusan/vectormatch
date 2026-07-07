// Rate Limiter — Per-ATS Bottleneck Limiters (TDD §4.2)
// src/lib/jobs/poller/rate-limiter.ts
//
// The Phalanx Poller uses one bottleneck instance per ATS platform to enforce
// the global rate limit: max 2 req/s per platform (minTime: 500ms, maxConcurrent: 1).
//
// This is imported by the poller Inngest function and any ATS adapter that
// makes outbound requests.
//
// ── Distributed Mode (Redis) ──────────────────────────────────────────────────
// When REDIS_URL is set, limiters use Bottleneck's Redis datastore so the
// 2 req/s cap is enforced GLOBALLY across all worker processes. This is
// critical for multi-worker Inngest deployments — without it, each process
// gets its own in-process limiter and the aggregate rate can exceed 2 req/s,
// risking IP bans from ATS platforms.
//
// When REDIS_URL is unset (local dev, CI), limiters fall back to in-process
// mode. This is the expected mode for development — a single process enforces
// the cap correctly.
//
// ── Connection Management ────────────────────────────────────────────────────
// A single Bottleneck.IORedisConnection is created per process and shared
// across all per-ATS limiters. IORedisConnection handles:
//   - Creating the Redis client + subscriber (via duplicate())
//   - Loading Bottleneck's Lua scripts
//   - Reconnection logic
//   - The .ready() promise (resolves when both clients are connected)
//
// ── Failure Mode (fail-closed) ────────────────────────────────────────────────
// If Redis is configured but unreachable, Bottleneck.schedule() will throw
// after ioredis exhausts its retries. The caller (fetchJobsFromAts) catches
// this and returns a "network" error, which the circuit breaker interprets as
// a degraded source. This is the correct failure mode: it's safer to stall
// ingestion than to risk uncoordinated requests that could trigger an ATS IP
// ban. IP bans are catastrophic (can block all ingestion for a company
// permanently) and hard to recover from. A stalled poller self-heals when
// Redis returns.

import Bottleneck from "bottleneck";
import IORedis from "ioredis";

/** Global rate limit per ATS: 2 requests per second, 1 concurrent. */
const MIN_TIME_MS = 500; // 500ms between requests = 2 req/s max
const MAX_CONCURRENT = 1;

/**
 * Shared Bottleneck Redis connection (lazily initialized once per process).
 * All per-ATS limiters share this connection to avoid opening multiple Redis
 * connections. Null when REDIS_URL is unset (in-process mode for dev/CI).
 *
 * IORedisConnection manages its own Redis client + subscriber pair, Lua script
 * loading, and reconnection logic. We only need to create it once and pass it
 * to each Bottleneck instance.
 */
let bottleneckConnection: Bottleneck.IORedisConnection | null = null;
let redisInitAttempted = false;

/**
 * Initialize the Bottleneck Redis connection for distributed rate limiting.
 * Called lazily on first getLimiter() call when REDIS_URL is set.
 */
function initRedis(): void {
  if (redisInitAttempted) return;
  redisInitAttempted = true;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    return; // In-process mode — no Redis configured
  }

  try {
    // Create a Bottleneck IORedisConnection. This handles creating the Redis
    // client + subscriber, loading Lua scripts, and reconnection. We pass the
    // IORedis class explicitly so Bottleneck doesn't need to require it at
    // runtime (which can fail in bundled environments).
    bottleneckConnection = new Bottleneck.IORedisConnection({
      clientOptions: redisUrl,
      Redis: IORedis,
    });

    // Log connection errors for operational visibility. IORedisConnection
    // handles reconnection internally — we just log for diagnostics.
    bottleneckConnection.on("error", (err: unknown) => {
      console.error(
        "[rate-limiter] Redis connection error — rate limiting may stall until Redis recovers:",
        err instanceof Error ? err.message : String(err),
      );
    });
  } catch (err) {
    console.error(
      "[rate-limiter] Failed to initialize Redis connection — using in-process mode:",
      err instanceof Error ? err.message : String(err),
    );
    bottleneckConnection = null;
  }
}

/**
 * Bottleneck limiters for each ATS platform. Each limiter is independent,
 * so Greenhouse and Lever can run in parallel without interfering.
 *
 * In Redis mode, all limiters share the same IORedisConnection but use
 * distinct key namespaces (Bottleneck's `id` option) so their rate limits
 * are tracked independently per ATS source.
 *
 * Usage in an ATS adapter:
 *   const limiter = getLimiter("greenhouse");
 *   const response = await limiter.schedule(() => fetch(url));
 */
const limiters: Record<string, Bottleneck> = {};

export function getLimiter(atsSource: string): Bottleneck {
  if (!limiters[atsSource]) {
    initRedis();

    if (bottleneckConnection) {
      // Distributed mode: Redis-backed Bottleneck enforces the cap globally.
      // The `id` namespaces this limiter's state in Redis so each ATS source
      // has independent rate tracking. `clearBatcherBeforeStop` prevents
      // stale batch state from lingering across worker restarts.
      limiters[atsSource] = new Bottleneck({
        id: `ats:${atsSource}`,
        datastore: "ioredis",
        connection: bottleneckConnection,
        minTime: MIN_TIME_MS,
        maxConcurrent: MAX_CONCURRENT,
        clearBatcherBeforeStop: true,
      });
    } else {
      // In-process mode (dev, CI, or Redis init failed before any connection
      // object was created). The rate cap is only enforced within this process.
      if (process.env.REDIS_URL) {
        console.warn(
          `[rate-limiter] REDIS_URL is set but Redis connection failed to initialize — ` +
            `using in-process limiter for "${atsSource}". ` +
            `Rate cap (2 req/s) is NOT enforced across multiple workers.`,
        );
      }
      limiters[atsSource] = new Bottleneck({
        minTime: MIN_TIME_MS,
        maxConcurrent: MAX_CONCURRENT,
      });
    }
  }
  return limiters[atsSource];
}

/**
 * Whether this process is using Redis-backed distributed rate limiting.
 * Exposed for diagnostics and tests. Returns false in dev/CI or when Redis
 * initialization failed before creating a connection object.
 */
export function isDistributedMode(): boolean {
  return bottleneckConnection !== null;
}

/**
 * Gracefully disconnect the Redis connection and all limiters. Intended for
 * test teardown and clean process shutdown. Safe to call multiple times.
 */
export async function disconnectRedis(): Promise<void> {
  // Disconnect all cached limiters first so no new schedules use the
  // closing connection
  for (const key of Object.keys(limiters)) {
    try {
      limiters[key].disconnect();
    } catch {
      // Ignore — limiter may already be disconnected
    }
    delete limiters[key];
  }

  if (bottleneckConnection) {
    try {
      await bottleneckConnection.disconnect();
    } catch {
      // Ignore errors on teardown — connection may already be closed
    }
    bottleneckConnection = null;
  }
  redisInitAttempted = false;
}
