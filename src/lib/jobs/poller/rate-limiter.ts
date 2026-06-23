// Rate Limiter — Per-ATS Bottleneck Limiters (TDD §4.2)
// src/lib/jobs/poller/rate-limiter.ts
//
// The Phalanx Poller uses one bottleneck instance per ATS platform to enforce
// the global rate limit: max 2 req/s per platform (minTime: 500ms, maxConcurrent: 1).
//
// This is imported by the poller Inngest function and any ATS adapter that
// makes outbound requests.

import Bottleneck from "bottleneck";

/** Global rate limit per ATS: 2 requests per second, 1 concurrent. */
const MIN_TIME_MS = 500; // 500ms between requests = 2 req/s max
const MAX_CONCURRENT = 1;

/**
 * Bottleneck limiters for each ATS platform.  Each limiter is independent,
 * so Greenhouse and Lever can run in parallel without interfering.
 *
 * Usage in an ATS adapter:
 *   const limiter = getLimiter("greenhouse");
 *   const response = await limiter.schedule(() => fetch(url));
 */
const limiters: Record<string, Bottleneck> = {};

export function getLimiter(atsSource: string): Bottleneck {
  if (!limiters[atsSource]) {
    limiters[atsSource] = new Bottleneck({
      minTime: MIN_TIME_MS,
      maxConcurrent: MAX_CONCURRENT,
    });
  }
  return limiters[atsSource];
}
