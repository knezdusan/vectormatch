/**
 * Unit tests for the ATS adapters (TDD §4.4).
 *
 * Tests the fetch + Zod validate + normalize pipeline for each ATS platform
 * with mocked fetch. No real network calls are made.
 *
 * Covers:
 *   - Greenhouse: valid response, validation failure, HTTP error
 *   - Lever: valid response (bare array), validation failure
 *   - Ashby: valid response, validation failure
 *   - Normalization: field name mapping (title/text, id, url)
 *   - Rate limiting: bottleneck integration (mocked)
 */

import { vi } from "vitest";

// Mock the rate limiter so tests don't actually throttle
vi.mock("@/lib/jobs/poller/rate-limiter", () => ({
  getLimiter: () => ({
    schedule: (fn: () => Promise<unknown>) => fn(),
  }),
}));

import { fetchJobsFromAts } from "@/lib/jobs/poller/ats-adapters";
import type { FetchFn } from "@/lib/jobs/types";

// ── Mock helpers ─────────────────────────────────────────────────────────────

function mockFetch(response: Response): FetchFn {
  const fn = vi.fn(async () => response);
  return fn as unknown as FetchFn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── Greenhouse ───────────────────────────────────────────────────────────────

describe("fetchJobsFromAts — Greenhouse", () => {
  const validGreenhouseResponse = {
    jobs: [
      {
        id: 12345,
        title: "Senior Frontend Engineer",
        absolute_url: "https://boards.greenhouse.io/acme/jobs/12345",
        location: { name: "Remote" },
        content: "<p>Job description</p>",
      },
      {
        id: 12346,
        title: "Backend Developer",
        absolute_url: "https://boards.greenhouse.io/acme/jobs/12346",
      },
    ],
    meta: { total: 2 },
  };

  it("fetches and normalizes Greenhouse jobs", async () => {
    const result = await fetchJobsFromAts(
      "greenhouse",
      "acme",
      mockFetch(jsonResponse(validGreenhouseResponse)),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].externalJobId).toBe("12345");
      expect(result.jobs[0].title).toBe("Senior Frontend Engineer");
      expect(result.jobs[0].url).toBe(
        "https://boards.greenhouse.io/acme/jobs/12345",
      );
      expect(result.jobs[0].rawJson).toContain("Senior Frontend Engineer");
    }
  });

  it("returns validation error on malformed Greenhouse response", async () => {
    const result = await fetchJobsFromAts(
      "greenhouse",
      "acme",
      mockFetch(jsonResponse({ wrong: "shape" })),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("validation");
      expect(result.error).toContain("Greenhouse");
    }
  });

  it("returns HTTP error on non-200 status", async () => {
    const result = await fetchJobsFromAts(
      "greenhouse",
      "acme",
      mockFetch(new Response("Not Found", { status: 404 })),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("http");
      expect(result.error).toContain("404");
    }
  });
});

// ── Lever ────────────────────────────────────────────────────────────────────

describe("fetchJobsFromAts — Lever", () => {
  const validLeverResponse = [
    {
      id: "abc-123",
      text: "Full Stack Engineer",
      hostedUrl: "https://jobs.lever.co/acme/abc-123",
      categories: { location: "San Francisco", commitment: "Full-time" },
      descriptionPlain: "We're hiring!",
    },
    {
      id: "def-456",
      text: "DevOps Engineer",
      hostedUrl: "https://jobs.lever.co/acme/def-456",
    },
  ];

  it("fetches and normalizes Lever jobs (bare array response)", async () => {
    const result = await fetchJobsFromAts(
      "lever",
      "acme",
      mockFetch(jsonResponse(validLeverResponse)),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs).toHaveLength(2);
      expect(result.jobs[0].externalJobId).toBe("abc-123");
      expect(result.jobs[0].title).toBe("Full Stack Engineer"); // "text" → "title"
      expect(result.jobs[0].url).toBe("https://jobs.lever.co/acme/abc-123");
    }
  });

  it("returns validation error on malformed Lever response", async () => {
    const result = await fetchJobsFromAts(
      "lever",
      "acme",
      mockFetch(jsonResponse({ not: "an array" })),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("validation");
    }
  });
});

// ── Ashby ────────────────────────────────────────────────────────────────────

describe("fetchJobsFromAts — Ashby", () => {
  const validAshbyResponse = {
    jobs: [
      {
        id: "ashby-001",
        title: "Platform Engineer",
        location: { locationName: "Remote (US)" },
        descriptionHtml: "<p>Job description</p>",
        externalLink: "https://careers.ashbyhq.com/acme/ashby-001",
        workplace: "remote",
      },
    ],
  };

  it("fetches and normalizes Ashby jobs", async () => {
    const result = await fetchJobsFromAts(
      "ashby",
      "acme",
      mockFetch(jsonResponse(validAshbyResponse)),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].externalJobId).toBe("ashby-001");
      expect(result.jobs[0].title).toBe("Platform Engineer");
      expect(result.jobs[0].url).toBe(
        "https://careers.ashbyhq.com/acme/ashby-001",
      );
    }
  });

  it("returns validation error on malformed Ashby response", async () => {
    const result = await fetchJobsFromAts(
      "ashby",
      "acme",
      mockFetch(jsonResponse({ wrong: "shape" })),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("validation");
    }
  });
});

// ── Network errors ───────────────────────────────────────────────────────────

describe("fetchJobsFromAts — network errors", () => {
  it("returns network error when fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await fetchJobsFromAts("greenhouse", "acme", fetchFn);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.kind).toBe("network");
      expect(result.error).toContain("ECONNREFUSED");
    }
  });
});

// ── Normalization edge cases ─────────────────────────────────────────────────

describe("fetchJobsFromAts — normalization", () => {
  it("handles empty jobs array from Greenhouse", async () => {
    const result = await fetchJobsFromAts(
      "greenhouse",
      "acme",
      mockFetch(jsonResponse({ jobs: [] })),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs).toHaveLength(0);
    }
  });

  it("handles empty jobs array from Lever", async () => {
    const result = await fetchJobsFromAts(
      "lever",
      "acme",
      mockFetch(jsonResponse([])),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs).toHaveLength(0);
    }
  });

  it("preserves raw JSON in normalized jobs", async () => {
    const result = await fetchJobsFromAts(
      "greenhouse",
      "acme",
      mockFetch(
        jsonResponse({
          jobs: [
            {
              id: 1,
              title: "Engineer",
              absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
              custom_field: "preserved",
            },
          ],
        }),
      ),
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.jobs[0].rawJson).toContain("custom_field");
      expect(result.jobs[0].rawJson).toContain("preserved");
    }
  });
});
