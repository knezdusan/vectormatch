/**
 * Unit tests for v2 GitHub Events API Probe Seeder
 * src/lib/jobs/seeders/daily-sources/github-events-probe.ts
 *
 * Tests the v2 GitHub Events API probe:
 *   - URL building
 *   - Event parsing (array + wrapped formats)
 *   - Recent activity detection
 *   - Full seeder run with mocked Slugger + fetch
 *
 * Per AGENTS.md: Vitest for unit/integration tests. The Slugger and fetch are
 * mocked — no real network calls or DB mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  buildGithubEventsUrl,
  hasRecentActivity,
  parseGithubEventsResponse,
  RECENT_ACTIVITY_WINDOW_DAYS,
  runGithubEventsProbeSeeder,
} from "@/lib/jobs/seeders/daily-sources/github-events-probe";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── buildGithubEventsUrl ─────────────────────────────────────────────────────

describe("buildGithubEventsUrl", () => {
  it("builds the correct GitHub Events API URL", () => {
    expect(buildGithubEventsUrl("vercel")).toBe(
      "https://api.github.com/users/vercel/events/public",
    );
  });

  it("builds URLs for different orgs", () => {
    expect(buildGithubEventsUrl("supabase")).toContain("/users/supabase/");
    expect(buildGithubEventsUrl("calcom")).toContain("/users/calcom/");
  });
});

// ── parseGithubEventsResponse ────────────────────────────────────────────────

describe("parseGithubEventsResponse", () => {
  it("parses a bare array of events", () => {
    const json = JSON.stringify([
      { type: "PushEvent", created_at: "2026-07-05T10:00:00Z" },
      { type: "CreateEvent", created_at: "2026-07-04T10:00:00Z" },
    ]);
    const events = parseGithubEventsResponse(json);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("PushEvent");
  });

  it("parses a wrapped { data: [] } format", () => {
    const json = JSON.stringify({
      data: [{ type: "PushEvent", created_at: "2026-07-05T10:00:00Z" }],
    });
    const events = parseGithubEventsResponse(json);
    expect(events).toHaveLength(1);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseGithubEventsResponse("not json")).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(parseGithubEventsResponse("")).toEqual([]);
    expect(parseGithubEventsResponse("   ")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseGithubEventsResponse('{"foo": "bar"}')).toEqual([]);
    expect(parseGithubEventsResponse('"string"')).toEqual([]);
    expect(parseGithubEventsResponse("42")).toEqual([]);
  });

  it("filters out malformed event objects", () => {
    const json = JSON.stringify([
      { type: "PushEvent", created_at: "2026-07-05T10:00:00Z" },
      { type: "PushEvent" }, // missing created_at
      { created_at: "2026-07-05T10:00:00Z" }, // missing type
      "not an object",
      null,
    ]);
    const events = parseGithubEventsResponse(json);
    expect(events).toHaveLength(1);
  });
});

// ── hasRecentActivity ────────────────────────────────────────────────────────

describe("hasRecentActivity", () => {
  const now = new Date("2026-07-05T12:00:00Z");

  it("returns true when an event is within the activity window", () => {
    const events = [
      { type: "PushEvent", created_at: "2026-07-04T10:00:00Z" }, // 1 day ago
    ];
    expect(hasRecentActivity(events, now)).toBe(true);
  });

  it("returns true when at least one event is recent (mixed old/new)", () => {
    const events = [
      { type: "PushEvent", created_at: "2026-06-01T10:00:00Z" }, // old
      { type: "PushEvent", created_at: "2026-07-03T10:00:00Z" }, // 2 days ago
    ];
    expect(hasRecentActivity(events, now)).toBe(true);
  });

  it("returns false when all events are outside the window", () => {
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - RECENT_ACTIVITY_WINDOW_DAYS);
    const events = [
      { type: "PushEvent", created_at: "2026-06-01T10:00:00Z" }, // old
    ];
    expect(hasRecentActivity(events, now)).toBe(false);
  });

  it("returns false for empty events", () => {
    expect(hasRecentActivity([], now)).toBe(false);
  });

  it("handles invalid timestamps gracefully", () => {
    const events = [
      { type: "PushEvent", created_at: "invalid-date" },
      { type: "PushEvent", created_at: "2026-07-04T10:00:00Z" }, // valid
    ];
    expect(hasRecentActivity(events, now)).toBe(true);
  });

  it("returns false when all timestamps are invalid", () => {
    const events = [{ type: "PushEvent", created_at: "invalid" }];
    expect(hasRecentActivity(events, now)).toBe(false);
  });
});

// ── runGithubEventsProbeSeeder (integration with mocks) ──────────────────────

describe("runGithubEventsProbeSeeder", () => {
  beforeEach(() => {
    vi.mocked(resolveSlugger).mockReset();
  });

  function makeMockFetch(
    responses: Record<string, { status: number; body: string }>,
  ): FetchFn {
    return (async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      const mock = responses[urlStr];
      if (mock === undefined) {
        return new Response("Not Found", { status: 404 });
      }
      return new Response(mock.body, { status: mock.status });
    }) as FetchFn;
  }

  it("resolves active orgs via the Slugger", async () => {
    const recentEvent = JSON.stringify([
      { type: "PushEvent", created_at: new Date().toISOString() },
    ]);

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "vercel",
      resolvedBy: "slug_probe",
      canonicalName: "vercel",
    });

    const responses: Record<string, { status: number; body: string }> = {};
    for (const org of ["vercel", "supabase"]) {
      responses[`https://api.github.com/users/${org}/events/public`] = {
        status: 200,
        body: recentEvent,
      };
    }

    const result = await runGithubEventsProbeSeeder(makeMockFetch(responses), [
      "vercel",
      "supabase",
    ]);

    expect(result.activeOrgs).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.inactiveOrgs).toBe(0);
    expect(resolveSlugger).toHaveBeenCalledTimes(2);

    const call = vi.mocked(resolveSlugger).mock.calls[0][0];
    expect(call.discoverySource).toBe("github_probe");
  });

  it("skips inactive orgs (no recent events)", async () => {
    const oldEvent = JSON.stringify([
      {
        type: "PushEvent",
        created_at: "2020-01-01T00:00:00Z",
      },
    ]);

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "vercel",
      resolvedBy: "slug_probe",
      canonicalName: "vercel",
    });

    const result = await runGithubEventsProbeSeeder(
      makeMockFetch({
        "https://api.github.com/users/vercel/events/public": {
          status: 200,
          body: oldEvent,
        },
      }),
      ["vercel"],
    );

    expect(result.activeOrgs).toBe(0);
    expect(result.inactiveOrgs).toBe(1);
    expect(result.resolved).toBe(0);
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("skips orgs that return 404 (non-existent)", async () => {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "ghost",
      resolvedBy: "slug_probe",
      canonicalName: "ghost",
    });

    const result = await runGithubEventsProbeSeeder(makeMockFetch({}), [
      "ghost-org",
    ]);

    expect(result.activeOrgs).toBe(0);
    expect(result.inactiveOrgs).toBe(1);
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("counts unresolved when the Slugger fails", async () => {
    const recentEvent = JSON.stringify([
      { type: "PushEvent", created_at: new Date().toISOString() },
    ]);

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "vercel",
    });

    const result = await runGithubEventsProbeSeeder(
      makeMockFetch({
        "https://api.github.com/users/vercel/events/public": {
          status: 200,
          body: recentEvent,
        },
      }),
      ["vercel"],
    );

    expect(result.activeOrgs).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("handles Slugger exceptions (counts as inactive via per-org catch)", async () => {
    const recentEvent = JSON.stringify([
      { type: "PushEvent", created_at: new Date().toISOString() },
    ]);

    vi.mocked(resolveSlugger).mockRejectedValue(new Error("network error"));

    const result = await runGithubEventsProbeSeeder(
      makeMockFetch({
        "https://api.github.com/users/vercel/events/public": {
          status: 200,
          body: recentEvent,
        },
      }),
      ["vercel"],
    );

    // The per-org catch counts it as inactive (resolveSlugger is inside the
    // try block that catches all per-org failures).
    expect(result.resolved).toBe(0);
  });

  it("does not pass employeeCount (GitHub orgs don't expose it)", async () => {
    const recentEvent = JSON.stringify([
      { type: "PushEvent", created_at: new Date().toISOString() },
    ]);

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "vercel",
      resolvedBy: "slug_probe",
      canonicalName: "vercel",
    });

    await runGithubEventsProbeSeeder(
      makeMockFetch({
        "https://api.github.com/users/vercel/events/public": {
          status: 200,
          body: recentEvent,
        },
      }),
      ["vercel"],
    );

    const call = vi.mocked(resolveSlugger).mock.calls[0][0];
    expect(call.employeeCount).toBeUndefined();
  });
});
