/**
 * Unit tests for D5 — We Work Remotely + Jobicy RSS Seeder (TDD §2.2)
 *
 * Tests:
 *   - extractCompanyNamesFromRss: valid RSS, empty RSS, invalid XML, no-colon titles
 *   - deduplicateCompanyNames: basic dedup, case-insensitive, empty filtering
 *   - deduplicateCompanyFeedPairs: dedup by company name with feed provenance
 *   - runWwrRssSeeder: full flow, individual feed failure, empty results,
 *     correct SluggerInput with discoverySource=hn_algolia
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module (used by Slugger)
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the Slugger so we don't hit the DB or ATS APIs
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  deduplicateCompanyFeedPairs,
  extractCompanyNamesFromRss,
  runWwrRssSeeder,
} from "@/lib/jobs/seeders/daily-sources/weworkremotely-rss";
import { deduplicateCompanyNames } from "@/lib/jobs/seeders/seeder-utils";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── extractCompanyNamesFromRss ───────────────────────────────────────────────

describe("extractCompanyNamesFromRss", () => {
  it("extracts company names from valid RSS with 'Company: Title' pattern", () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>We Work Remotely</title>
          <item>
            <title>Acme Corp: Senior Frontend Engineer</title>
            <link>https://weworkremotely.com/jobs/1</link>
          </item>
          <item>
            <title>Stripe: Staff Backend Engineer</title>
            <link>https://weworkremotely.com/jobs/2</link>
          </item>
          <item>
            <title>Docker Inc.: DevOps Engineer</title>
            <link>https://weworkremotely.com/jobs/3</link>
          </item>
        </channel>
      </rss>
    `;

    const names = extractCompanyNamesFromRss(xml);
    expect(names).toHaveLength(3);
    expect(names).toEqual(["Acme Corp", "Stripe", "Docker Inc."]);
  });

  it("returns empty array for empty RSS (no items)", () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>We Work Remotely</title>
        </channel>
      </rss>
    `;

    expect(extractCompanyNamesFromRss(xml)).toHaveLength(0);
  });

  it("returns empty array for invalid XML", () => {
    expect(extractCompanyNamesFromRss("not valid xml at all")).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(extractCompanyNamesFromRss("")).toHaveLength(0);
  });

  it("skips items without a colon in title (no company delimiter)", () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Senior Frontend Engineer</title>
          </item>
          <item>
            <title>Acme: Backend Engineer</title>
          </item>
          <item>
            <title>Just a job title no company</title>
          </item>
        </channel>
      </rss>
    `;

    const names = extractCompanyNamesFromRss(xml);
    expect(names).toHaveLength(1);
    expect(names[0]).toBe("Acme");
  });

  it("skips items with empty title", () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title></title>
          </item>
          <item>
            <title>Acme: Engineer</title>
          </item>
        </channel>
      </rss>
    `;

    const names = extractCompanyNamesFromRss(xml);
    expect(names).toHaveLength(1);
    expect(names[0]).toBe("Acme");
  });

  it("skips items where company part is empty after split", () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>: Engineer</title>
          </item>
          <item>
            <title>Acme: Engineer</title>
          </item>
        </channel>
      </rss>
    `;

    const names = extractCompanyNamesFromRss(xml);
    expect(names).toHaveLength(1);
    expect(names[0]).toBe("Acme");
  });

  it("splits on first colon only (job title may contain colons)", () => {
    const xml = `
      <?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <item>
            <title>Acme: Senior Engineer: Remote Team</title>
          </item>
        </channel>
      </rss>
    `;

    const names = extractCompanyNamesFromRss(xml);
    expect(names).toHaveLength(1);
    expect(names[0]).toBe("Acme");
  });
});

// ── deduplicateCompanyNames ──────────────────────────────────────────────────

describe("deduplicateCompanyNames", () => {
  it("removes exact duplicates", () => {
    const names = ["Acme", "Acme", "Stripe", "Stripe", "Docker"];
    const result = deduplicateCompanyNames(names);
    expect(result).toEqual(["Acme", "Stripe", "Docker"]);
  });

  it("is case-insensitive, preserving first-seen casing", () => {
    const names = ["Acme", "acme", "ACME", "Stripe"];
    const result = deduplicateCompanyNames(names);
    expect(result).toEqual(["Acme", "Stripe"]);
  });

  it("filters out empty strings", () => {
    const names = ["Acme", "", "  ", "Stripe", ""];
    const result = deduplicateCompanyNames(names);
    expect(result).toEqual(["Acme", "Stripe"]);
  });

  it("trims whitespace before dedup", () => {
    const names = ["  Acme  ", "Acme", "Stripe "];
    const result = deduplicateCompanyNames(names);
    expect(result).toEqual(["Acme", "Stripe"]);
  });

  it("handles empty array", () => {
    expect(deduplicateCompanyNames([])).toHaveLength(0);
  });
});

// ── deduplicateCompanyFeedPairs ──────────────────────────────────────────────

describe("deduplicateCompanyFeedPairs", () => {
  it("deduplicates by company name, keeping first feed", () => {
    const pairs = [
      {
        feedUrl: "https://weworkremotely.com/remote-jobs.rss",
        companyName: "Acme",
      },
      {
        feedUrl: "https://weworkremotely.com/remote-engineering-jobs.rss",
        companyName: "Acme",
      },
      { feedUrl: "https://jobicy.com/feed", companyName: "Stripe" },
    ];

    const result = deduplicateCompanyFeedPairs(pairs);
    expect(result).toHaveLength(2);
    expect(result[0].companyName).toBe("Acme");
    expect(result[0].feedUrl).toBe(
      "https://weworkremotely.com/remote-jobs.rss",
    );
    expect(result[1].companyName).toBe("Stripe");
  });

  it("is case-insensitive", () => {
    const pairs = [
      {
        feedUrl: "https://weworkremotely.com/remote-jobs.rss",
        companyName: "Acme",
      },
      { feedUrl: "https://jobicy.com/feed", companyName: "acme" },
    ];

    const result = deduplicateCompanyFeedPairs(pairs);
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe("Acme");
  });

  it("filters out empty company names", () => {
    const pairs = [
      {
        feedUrl: "https://weworkremotely.com/remote-jobs.rss",
        companyName: "",
      },
      { feedUrl: "https://jobicy.com/feed", companyName: "Stripe" },
    ];

    const result = deduplicateCompanyFeedPairs(pairs);
    expect(result).toHaveLength(1);
    expect(result[0].companyName).toBe("Stripe");
  });

  it("handles empty array", () => {
    expect(deduplicateCompanyFeedPairs([])).toHaveLength(0);
  });
});

// ── runWwrRssSeeder ──────────────────────────────────────────────────────────

describe("runWwrRssSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockRssResponse(items: { title: string }[]): string {
    const itemXml = items
      .map(
        (i) =>
          `<item><title>${i.title}</title><link>https://example.com/jobs/${i.title}</link></item>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Test</title>${itemXml}</channel></rss>`;
  }

  function mockFetchByUrl(
    responses: Record<string, { status: number; body: string }>,
  ): FetchFn {
    return vi.fn(async (url: string) => {
      const match = responses[url];
      if (match) {
        return new Response(match.body, { status: match.status });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;
  }

  it("fetches all feeds, extracts companies, resolves via Slugger", async () => {
    const fetchFn = mockFetchByUrl({
      "https://weworkremotely.com/remote-jobs.rss": {
        status: 200,
        body: mockRssResponse([
          { title: "Acme: Frontend Engineer" },
          { title: "Stripe: Backend Engineer" },
        ]),
      },
      "https://weworkremotely.com/remote-engineering-jobs.rss": {
        status: 200,
        body: mockRssResponse([{ title: "Docker: DevOps Engineer" }]),
      },
    });

    // Other feeds return empty
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runWwrRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(3);
    expect(result.uniqueCompanies).toBe(3);
    expect(result.resolved).toBe(3);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("handles individual feed failure gracefully", async () => {
    const fetchFn = mockFetchByUrl({
      "https://weworkremotely.com/remote-jobs.rss": {
        status: 500,
        body: "Server Error",
      },
      "https://weworkremotely.com/remote-engineering-jobs.rss": {
        status: 200,
        body: mockRssResponse([{ title: "Docker: DevOps Engineer" }]),
      },
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "docker",
      resolvedBy: "slug_probe",
      canonicalName: "docker",
    });

    const result = await runWwrRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(1);
    expect(result.uniqueCompanies).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("handles all feeds returning empty results", async () => {
    const fetchFn = mockFetchByUrl({
      "https://weworkremotely.com/remote-jobs.rss": {
        status: 200,
        body: mockRssResponse([]),
      },
    });

    const result = await runWwrRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("counts unresolved when Slugger returns failure", async () => {
    const fetchFn = mockFetchByUrl({
      "https://weworkremotely.com/remote-jobs.rss": {
        status: 200,
        body: mockRssResponse([{ title: "UnknownCo: Engineer" }]),
      },
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "unknownco",
    });

    const result = await runWwrRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(1);
    expect(result.uniqueCompanies).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("passes correct SluggerInput with discoverySource=hn_algolia", async () => {
    const feedUrl = "https://weworkremotely.com/remote-jobs.rss";
    const fetchFn = mockFetchByUrl({
      [feedUrl]: {
        status: 200,
        body: mockRssResponse([{ title: "Acme: Engineer" }]),
      },
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runWwrRssSeeder(fetchFn);

    expect(resolveSlugger).toHaveBeenCalledTimes(1);
    const [input, opts] = vi.mocked(resolveSlugger).mock.calls[0];
    expect(input.companyName).toBe("Acme");
    expect(input.discoverySource).toBe("hn_algolia");
    expect(input.discoveryContext).toBe(`wwr-rss:${feedUrl} company:Acme`);
    expect(opts?.insertCompany).toBe(true);
  });

  it("deduplicates companies across feeds before resolving", async () => {
    const fetchFn = mockFetchByUrl({
      "https://weworkremotely.com/remote-jobs.rss": {
        status: 200,
        body: mockRssResponse([{ title: "Acme: Frontend Engineer" }]),
      },
      "https://weworkremotely.com/remote-engineering-jobs.rss": {
        status: 200,
        body: mockRssResponse([{ title: "Acme: Backend Engineer" }]),
      },
    });

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runWwrRssSeeder(fetchFn);

    // 2 posts total, but only 1 unique company
    expect(result.totalPosts).toBe(2);
    expect(result.uniqueCompanies).toBe(1);
    expect(resolveSlugger).toHaveBeenCalledTimes(1);
  });

  it("handles Slugger throwing an error gracefully", async () => {
    const fetchFn = mockFetchByUrl({
      "https://weworkremotely.com/remote-jobs.rss": {
        status: 200,
        body: mockRssResponse([{ title: "Acme: Engineer" }]),
      },
    });

    vi.mocked(resolveSlugger).mockRejectedValue(new Error("Slugger exploded"));

    const result = await runWwrRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(1);
    expect(result.uniqueCompanies).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });
});
