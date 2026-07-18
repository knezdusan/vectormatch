// FlareSolverr Client — Cloudflare bypass proxy
// src/lib/jobs/direct-ingestion/flaresolverr-client.ts
//
// FlareSolverr is a self-hosted proxy server that solves Cloudflare and
// DDoS-GUARD challenges using a headless browser. Deployed as a Coolify
// service (docker-compose), it exposes a simple JSON API on port 8191.
//
// Usage:
//   POST http://flaresolverr:8191/v1
//   Body: { "cmd": "request.get", "url": "https://example.com", "maxTimeout": 60000 }
//   Response: { "solution": { "url", "status", "headers", "response" } }
//
// The "response" field contains the full HTML after Cloudflare challenge
// is solved. We parse it with cheerio to extract job data.

const FLARESOLVERR_URL =
  process.env.FLARESOLVERR_URL ?? "http://flaresolverr:8191/v1";

const DEFAULT_TIMEOUT = 60000; // 60 seconds — Cloudflare challenges can take time

export interface FlareSolverrResponse {
  status: string; // "ok" or "error"
  message: string;
  startTimestamp: number;
  endTimestamp: number;
  version: string;
  solution?: {
    url: string;
    status: number;
    headers: Record<string, string>;
    response: string; // full HTML
    cookies: Array<{ name: string; value: string; domain: string }>;
    userAgent: string;
  };
}

/**
 * Fetch a URL through FlareSolverr, bypassing Cloudflare challenges.
 *
 * @param url         The URL to fetch
 * @param maxTimeout  Maximum time to wait for challenge resolution (ms)
 * @returns           The response HTML and metadata, or throws on error
 */
export async function fetchViaFlareSolverr(
  url: string,
  maxTimeout: number = DEFAULT_TIMEOUT,
): Promise<{
  html: string;
  status: number;
  cookies: Array<{ name: string; value: string; domain: string }>;
}> {
  const response = await fetch(FLARESOLVERR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cmd: "request.get",
      url,
      maxTimeout,
    }),
    signal: AbortSignal.timeout(maxTimeout + 10000), // grace period beyond FlareSolverr's own timeout
  });

  if (!response.ok) {
    throw new Error(
      `FlareSolverr HTTP ${response.status}: ${await response.text()}`,
    );
  }

  const data: FlareSolverrResponse = await response.json();

  if (data.status !== "ok" || !data.solution) {
    throw new Error(`FlareSolverr error: ${data.message}`);
  }

  return {
    html: data.solution.response,
    status: data.solution.status,
    cookies: data.solution.cookies,
  };
}

/**
 * Check if FlareSolverr is available (health check).
 * @returns true if the service is reachable and responding
 */
export async function isFlareSolverrAvailable(): Promise<boolean> {
  try {
    const response = await fetch(FLARESOLVERR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cmd: "request.get",
        url: "https://www.google.com",
        maxTimeout: 5000,
      }),
      signal: AbortSignal.timeout(10000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
