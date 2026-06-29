/**
 * Unit tests for D10 — GitHub Trending + CONTRIBUTING.md Seeder (TDD §2.10)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module (required by slugger transitive imports)
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

// Mock the slugger so we don't hit ATS APIs or the DB during tests
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  deduplicateOrgNames,
  extractOrgNamesFromHtml,
  runGithubTrendingSeeder,
} from "@/lib/jobs/seeders/daily-sources/github-trending";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── extractOrgNamesFromHtml ──────────────────────────────────────────────────

describe("extractOrgNamesFromHtml", () => {
  it("extracts org names from valid HTML with multiple repos", () => {
    const html = `
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/acme/widget" class="Link">acme / <span>widget</span></a>
        </h2>
      </article>
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/foobar/cli" class="Link">foobar / <span>cli</span></a>
        </h2>
      </article>
      <article class="Box-row">
        <h2 class="h3 lh-condensed">
          <a href="/newco/platform" class="Link">newco / <span>platform</span></a>
        </h2>
      </article>
    `;

    const orgs = extractOrgNamesFromHtml(html);
    expect(orgs).toEqual(["acme", "foobar", "newco"]);
  });

  it("returns an empty array for empty HTML", () => {
    expect(extractOrgNamesFromHtml("")).toEqual([]);
  });

  it("returns an empty array for HTML with no Box-row articles", () => {
    const html = `
      <html>
        <body>
          <div>Some other content</div>
          <a href="/acme/widget">acme / widget</a>
        </body>
      </html>
    `;
    expect(extractOrgNamesFromHtml(html)).toEqual([]);
  });

  it("returns an empty array for invalid/malformed HTML", () => {
    expect(extractOrgNamesFromHtml("<<<not html>>>")).toEqual([]);
    expect(extractOrgNamesFromHtml("plain text with no tags")).toEqual([]);
  });

  it("skips repos without an org prefix (single-segment paths)", () => {
    const html = `
      <article class="Box-row">
        <h2><a href="/just-a-repo">just-a-repo</a></h2>
      </article>
      <article class="Box-row">
        <h2><a href="/acme/widget">acme / widget</a></h2>
      </article>
    `;
    const orgs = extractOrgNamesFromHtml(html);
    expect(orgs).toEqual(["acme"]);
  });

  it("skips GitHub-internal paths like /orgs, /topics, /trending", () => {
    const html = `
      <article class="Box-row">
        <h2><a href="/orgs/some-org">orgs / some-org</a></h2>
      </article>
      <article class="Box-row">
        <h2><a href="/topics/rust">topics / rust</a></h2>
      </article>
      <article class="Box-row">
        <h2><a href="/trending/python">trending / python</a></h2>
      </article>
      <article class="Box-row">
        <h2><a href="/acme/widget">acme / widget</a></h2>
      </article>
    `;
    const orgs = extractOrgNamesFromHtml(html);
    expect(orgs).toEqual(["acme"]);
  });

  it("preserves duplicates (dedup is a separate function)", () => {
    const html = `
      <article class="Box-row"><h2><a href="/acme/widget">acme / widget</a></h2></article>
      <article class="Box-row"><h2><a href="/acme/cli">acme / cli</a></h2></article>
    `;
    const orgs = extractOrgNamesFromHtml(html);
    expect(orgs).toEqual(["acme", "acme"]);
  });

  it("ignores query strings and hash fragments in href", () => {
    const html = `
      <article class="Box-row">
        <h2><a href="/acme/widget?tab=readme">acme / widget</a></h2>
      </article>
    `;
    const orgs = extractOrgNamesFromHtml(html);
    expect(orgs).toEqual(["acme"]);
  });

  it("skips anchors without an href attribute", () => {
    const html = `
      <article class="Box-row">
        <h2><a class="Link">no href</a></h2>
      </article>
      <article class="Box-row">
        <h2><a href="/acme/widget">acme / widget</a></h2>
      </article>
    `;
    const orgs = extractOrgNamesFromHtml(html);
    expect(orgs).toEqual(["acme"]);
  });
});

// ── deduplicateOrgNames ──────────────────────────────────────────────────────

describe("deduplicateOrgNames", () => {
  it("removes exact duplicates, preserving first-seen order", () => {
    const result = deduplicateOrgNames([
      "acme",
      "foobar",
      "acme",
      "newco",
      "foobar",
    ]);
    expect(result).toEqual(["acme", "foobar", "newco"]);
  });

  it("deduplicates case-insensitively, keeping the first casing", () => {
    const result = deduplicateOrgNames(["Acme", "acme", "ACME", "Foobar"]);
    expect(result).toEqual(["Acme", "Foobar"]);
  });

  it("filters out empty results when given an empty array", () => {
    expect(deduplicateOrgNames([])).toEqual([]);
  });

  it("returns the same array when there are no duplicates", () => {
    const result = deduplicateOrgNames(["acme", "foobar", "newco"]);
    expect(result).toEqual(["acme", "foobar", "newco"]);
  });

  it("handles a single element", () => {
    expect(deduplicateOrgNames(["acme"])).toEqual(["acme"]);
  });
});

// ── runGithubTrendingSeeder ──────────────────────────────────────────────────

describe("runGithubTrendingSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeTrendingHtml(orgs: { org: string; repo: string }[]): string {
    return orgs
      .map(
        ({ org, repo }) => `
          <article class="Box-row">
            <h2 class="h3 lh-condensed">
              <a href="/${org}/${repo}" class="Link">${org} / <span>${repo}</span></a>
            </h2>
          </article>`,
      )
      .join("\n");
  }

  function mockFetchHtml(
    html: string,
    contributing: Record<string, string> = {},
  ): FetchFn {
    return vi.fn(async (url: string) => {
      if (url.includes("github.com/trending")) {
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html" },
        });
      }
      // CONTRIBUTING.md fetches — return provided content or 404
      for (const [org, content] of Object.entries(contributing)) {
        if (url.includes(`/${org}/`)) {
          return new Response(content, { status: 200 });
        }
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;
  }

  function mockSluggerSuccess(): void {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    } as SluggerResult);
  }

  function mockSluggerFailure(): void {
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "acme",
    } as SluggerResult);
  }

  it("scrapes trending, resolves orgs through the Slugger with correct input", async () => {
    mockSluggerSuccess();
    const html = makeTrendingHtml([
      { org: "acme", repo: "widget" },
      { org: "foobar", repo: "cli" },
    ]);
    const fetchFn = mockFetchHtml(html);

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(2);
    expect(result.uniqueOrgs).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();

    // resolveSlugger should have been called once per unique org
    expect(resolveSlugger).toHaveBeenCalledTimes(2);

    // Verify the SluggerInput shape
    const firstCall = vi.mocked(resolveSlugger).mock.calls[0];
    expect(firstCall[0]).toEqual({
      companyName: "acme",
      discoverySource: "hn_algolia",
      discoveryContext: "github-trending:acme",
    });
    expect(firstCall[1]).toEqual({
      fetchFn,
      insertCompany: true,
    });
  });

  it("deduplicates orgs before calling the Slugger", async () => {
    mockSluggerSuccess();
    const html = makeTrendingHtml([
      { org: "acme", repo: "widget" },
      { org: "acme", repo: "cli" },
      { org: "foobar", repo: "platform" },
    ]);
    const fetchFn = mockFetchHtml(html);

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(3);
    expect(result.uniqueOrgs).toBe(2);
    expect(resolveSlugger).toHaveBeenCalledTimes(2);
  });

  it("returns an error result when the trending page fetch fails", async () => {
    const fetchFn = vi.fn(
      async () => new Response("Server Error", { status: 500 }),
    ) as unknown as FetchFn;

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(0);
    expect(result.uniqueOrgs).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toContain("HTTP 500");
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("returns an error result when fetch throws", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("Network down");
    }) as unknown as FetchFn;

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(0);
    expect(result.error).toContain("Network down");
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("handles empty trending results (no repos found)", async () => {
    const fetchFn = mockFetchHtml("<html><body>No repos today</body></html>");

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(0);
    expect(result.uniqueOrgs).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("counts unresolved orgs when the Slugger fails", async () => {
    mockSluggerFailure();
    const html = makeTrendingHtml([
      { org: "acme", repo: "widget" },
      { org: "foobar", repo: "cli" },
    ]);
    const fetchFn = mockFetchHtml(html);

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(2);
    expect(result.uniqueOrgs).toBe(2);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("handles mixed resolved and unresolved orgs", async () => {
    const html = makeTrendingHtml([
      { org: "acme", repo: "widget" },
      { org: "foobar", repo: "cli" },
      { org: "newco", repo: "platform" },
    ]);
    const fetchFn = mockFetchHtml(html);

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce({
        success: true,
        atsSource: "greenhouse",
        atsSlug: "acme",
        resolvedBy: "slug_probe",
        canonicalName: "acme",
      } as SluggerResult)
      .mockResolvedValueOnce({
        success: false,
        canonicalName: "foobar",
      } as SluggerResult)
      .mockResolvedValueOnce({
        success: true,
        atsSource: "lever",
        atsSlug: "newco",
        resolvedBy: "db_cache",
        canonicalName: "newco",
      } as SluggerResult);

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(3);
    expect(result.uniqueOrgs).toBe(3);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(1);
  });

  it("continues processing if a single Slugger call throws", async () => {
    const html = makeTrendingHtml([
      { org: "acme", repo: "widget" },
      { org: "foobar", repo: "cli" },
    ]);
    const fetchFn = mockFetchHtml(html);

    vi.mocked(resolveSlugger)
      .mockRejectedValueOnce(new Error("Slugger exploded"))
      .mockResolvedValueOnce({
        success: true,
        atsSource: "greenhouse",
        atsSlug: "foobar",
        resolvedBy: "slug_probe",
        canonicalName: "foobar",
      } as SluggerResult);

    const result = await runGithubTrendingSeeder(fetchFn);

    expect(result.totalRepos).toBe(2);
    expect(result.uniqueOrgs).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("uses discoveryContext format github-trending:{orgName}", async () => {
    mockSluggerSuccess();
    const html = makeTrendingHtml([{ org: "AcmeCorp", repo: "widget" }]);
    const fetchFn = mockFetchHtml(html);

    await runGithubTrendingSeeder(fetchFn);

    const call = vi.mocked(resolveSlugger).mock.calls[0];
    expect(call[0].discoveryContext).toBe("github-trending:AcmeCorp");
  });
});
