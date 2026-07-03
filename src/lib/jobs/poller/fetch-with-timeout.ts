// Fetch With Timeout — Guards Against Hanging ATS Requests
// src/lib/jobs/poller/fetch-with-timeout.ts
//
// Sprint 7 healthcheck finding: `fetchJobsFromAts` and the SmartRecruiters
// detail fetch called the injectable `fetchFn` directly with no timeout. A
// single ATS endpoint that hangs (no response, no error) can block the
// `batchPollTier` sequential poll loop indefinitely, consuming the entire
// Inngest step/function time budget on ONE company and causing the whole
// batch to make near-zero progress per run (observed: ~3-6 companies polled
// per 3h cron cycle instead of the target 100).
//
// This wraps any injectable `FetchFn` call with an `AbortController`-based
// timeout. A timeout surfaces as a normal `AbortError`, which the existing
// try/catch blocks in `ats-adapters.ts` and `smartrecruiters-detail.ts`
// already treat as a recoverable ("network"/failed) result — no caller
// changes needed beyond passing calls through this wrapper.

import type { FetchFn } from "@/lib/jobs/types";

/** Default timeout for a single ATS API request (list or detail). */
const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

/**
 * Call `fetchFn(url)` with a timeout. If the request doesn't settle within
 * `timeoutMs`, the underlying request is aborted and the returned promise
 * rejects with an `AbortError` (same shape as a native fetch abort).
 *
 * Safe to use with mocked `fetchFn` in tests — the extra `init.signal` is
 * simply ignored by mocks that don't inspect their arguments.
 */
export async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  timeoutMs: number = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
