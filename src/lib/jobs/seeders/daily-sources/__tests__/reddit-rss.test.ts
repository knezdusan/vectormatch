/**
 * Unit tests for D3 — Reddit RSS Hiring Feeds Seeder (TDD §2.2)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the company-repository module
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
    insertedCompanyIds: [],
    insertedCompanies: [],
  }),
}));

import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import {
  buildCompanyInputsFromAtsUrls,
  buildRedditRssUrl,
  extractAtsUrlsFromText,
  extractUrlsFromRss,
  runRedditRssSeeder,
} from "@/lib/jobs/seeders/daily-sources/reddit-rss";
import type { FetchFn } from "@/lib/jobs/types";

// ── buildRedditRssUrl ────────────────────────────────────────────────────────

describe("buildRedditRssUrl", () => {
  it("builds the correct RSS search URL for a subreddit", () => {
    const url = buildRedditRssUrl("reactjs");
    expect(url).toBe(
      "https://www.reddit.com/r/reactjs/search.rss?q=hiring&sort=new&restrict_sr=on",
    );
  });

  it("builds URLs for different subreddits", () => {
    expect(buildRedditRssUrl("typescript")).toContain("/r/typescript/");
    expect(buildRedditRssUrl("forhire")).toContain("/r/forhire/");
  });
});

// ── extractAtsUrlsFromText ───────────────────────────────────────────────────

describe("extractAtsUrlsFromText", () => {
  it("extracts Greenhouse URLs from text", () => {
    const text = "Check out https://boards.greenhouse.io/acme/jobs/123";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("greenhouse");
    expect(results[0].url).toBe("https://boards.greenhouse.io/acme/jobs/123");
  });

  it("extracts Lever URLs from text", () => {
    const text = "We're hiring: https://jobs.lever.co/foobar/abc-456";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("lever");
  });

  it("extracts Ashby URLs from text", () => {
    const text = "Apply at https://jobs.ashbyhq.com/newco/xyz";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("ashby");
  });

  it("extracts SmartRecruiters URLs from text", () => {
    const text = "See https://jobs.smartrecruiters.com/acme/jobs/456";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("smartrecruiters");
  });

  it("extracts Workable URLs from text", () => {
    const text = "Apply via https://apply.workable.com/acme/jobs/789";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(1);
    expect(results[0].atsSource).toBe("workable");
  });

  it("extracts multiple ATS URLs from the same text", () => {
    const text = `
      We use Greenhouse: https://boards.greenhouse.io/acme/jobs/123
      Also Lever: https://jobs.lever.co/foobar/abc
    `;
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(2);
  });

  it("ignores non-ATS URLs", () => {
    const text = "Visit https://acme.com or https://github.com/acme";
    const results = extractAtsUrlsFromText(text);
    expect(results).toHaveLength(0);
  });

  it("handles empty text", () => {
    expect(extractAtsUrlsFromText("")).toHaveLength(0);
  });

  it("handles text with no URLs", () => {
    expect(extractAtsUrlsFromText("Just a post with no links")).toHaveLength(0);
  });
});

// ── extractUrlsFromRss ───────────────────────────────────────────────────────

describe("extractUrlsFromRss", () => {
  it("extracts post content from standard RSS XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>r/reactjs hiring</title>
          <item>
            <title>[Hiring] Senior React Engineer at Acme</title>
            <description>Apply at https://boards.greenhouse.io/acme/jobs/123</description>
            <content:encoded><![CDATA[We are hiring! https://boards.greenhouse.io/acme/jobs/123]]></content:encoded>
          </item>
          <item>
            <title>[For Hire] Frontend Developer</title>
            <description>Check https://jobs.lever.co/foobar/abc</description>
          </item>
        </channel>
      </rss>`;

    const posts = extractUrlsFromRss(xml);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toContain("boards.greenhouse.io/acme");
    expect(posts[1]).toContain("jobs.lever.co/foobar");
  });

  it("returns empty array for RSS with no items", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0">
        <channel>
          <title>Empty feed</title>
        </channel>
      </rss>`;

    const posts = extractUrlsFromRss(xml);
    expect(posts).toHaveLength(0);
  });

  it("handles invalid XML gracefully", () => {
    const posts = extractUrlsFromRss("not valid xml at all");
    expect(posts).toHaveLength(0);
  });

  it("handles empty string", () => {
    const posts = extractUrlsFromRss("");
    expect(posts).toHaveLength(0);
  });

  it("combines title, description, and content:encoded text", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <item>
            <title>Hiring Post</title>
            <description>Description text</description>
            <content:encoded><![CDATA[Content text with https://jobs.ashbyhq.com/newco/xyz]]></content:encoded>
          </item>
        </channel>
      </rss>`;

    const posts = extractUrlsFromRss(xml);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toContain("Hiring Post");
    expect(posts[0]).toContain("Description text");
    expect(posts[0]).toContain("jobs.ashbyhq.com/newco");
  });
});

// ── buildCompanyInputsFromAtsUrls ────────────────────────────────────────────

describe("buildCompanyInputsFromAtsUrls", () => {
  it("builds SeedCompanyInput from ATS URLs", () => {
    const urls = [
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        atsSource: "greenhouse" as const,
      },
      { url: "https://jobs.lever.co/foobar/abc", atsSource: "lever" as const },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls);

    expect(inputs).toHaveLength(2);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("greenhouse");
    expect(inputs[0].discoverySource).toBe("hn_algolia");
  });

  it("deduplicates by (atsSource, atsSlug)", () => {
    const urls = [
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        atsSource: "greenhouse" as const,
      },
      {
        url: "https://boards.greenhouse.io/acme/jobs/456",
        atsSource: "greenhouse" as const,
      },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls);
    expect(inputs).toHaveLength(1);
  });

  it("handles empty URL list", () => {
    expect(buildCompanyInputsFromAtsUrls([])).toHaveLength(0);
  });

  it("skips URLs where slug can't be extracted", () => {
    const urls = [
      {
        url: "https://boards.greenhouse.io/",
        atsSource: "greenhouse" as const,
      },
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        atsSource: "greenhouse" as const,
      },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls);
    expect(inputs).toHaveLength(1);
  });

  it("extracts subdomain slug for Recruitee URLs", () => {
    const urls = [
      {
        url: "https://acme.recruitee.com/jobs",
        atsSource: "recruitee" as const,
      },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].atsSlug).toBe("acme");
    expect(inputs[0].atsSource).toBe("recruitee");
  });

  it("uses contextPrefix in discoveryContext when provided", () => {
    const urls = [
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        atsSource: "greenhouse" as const,
      },
    ];

    const inputs = buildCompanyInputsFromAtsUrls(urls, "reddit:reactjs");
    expect(inputs[0].discoveryContext).toBe(
      "reddit:reactjs url:https://boards.greenhouse.io/acme/jobs/123",
    );
  });
});

// ── runRedditRssSeeder ───────────────────────────────────────────────────────

describe("runRedditRssSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 2,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: ["id-1", "id-2"],
      insertedCompanies: [],
      aggregatorFiltered: 0,
    });
  });

  function mockRedditFetch(feedsBySubreddit: Record<string, string>): FetchFn {
    return vi.fn(async (url: string) => {
      for (const [subreddit, xml] of Object.entries(feedsBySubreddit)) {
        if (url.includes(`/r/${subreddit}/`)) {
          return new Response(xml, { status: 200 });
        }
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;
  }

  function makeRssXml(items: { title: string; description: string }[]): string {
    const itemsXml = items
      .map(
        (item) => `
          <item>
            <title>${item.title}</title>
            <description>${item.description}</description>
          </item>`,
      )
      .join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>Reddit Search</title>
          ${itemsXml}
        </channel>
      </rss>`;
  }

  it("fetches all subreddits, extracts ATS URLs, inserts companies", async () => {
    const fetchFn = mockRedditFetch({
      reactjs: makeRssXml([
        {
          title: "[Hiring] React Engineer",
          description: "Apply at https://boards.greenhouse.io/acme/jobs/123",
        },
      ]),
      typescript: makeRssXml([
        {
          title: "[Hiring] TS Developer",
          description: "We use https://jobs.lever.co/foobar/abc",
        },
      ]),
    });

    const result = await runRedditRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(2);
    expect(result.atsUrlsFound).toBe(2);
    expect(result.uniqueSlugsExtracted).toBe(2);
    expect(result.insertResult.inserted).toBe(2);
    expect(result.error).toBeUndefined();
  });

  it("handles individual subreddit failure gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/r/reactjs/")) {
        return new Response("Server Error", { status: 500 });
      }
      if (url.includes("/r/typescript/")) {
        return new Response(
          makeRssXml([
            {
              title: "[Hiring] TS Dev",
              description: "Apply at https://jobs.lever.co/foobar/abc",
            },
          ]),
          { status: 200 },
        );
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    const result = await runRedditRssSeeder(fetchFn);

    expect(result.uniqueSlugsExtracted).toBe(1);
    expect(result.error).toBeUndefined();
  });

  it("handles empty results from all subreddits", async () => {
    const fetchFn = mockRedditFetch({});

    const result = await runRedditRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(0);
    expect(result.atsUrlsFound).toBe(0);
    expect(result.uniqueSlugsExtracted).toBe(0);
  });

  it("handles RSS feeds with no ATS URLs", async () => {
    const fetchFn = mockRedditFetch({
      reactjs: makeRssXml([
        {
          title: "[Hiring] Engineer",
          description: "Apply at https://acme.com/careers",
        },
      ]),
    });

    const result = await runRedditRssSeeder(fetchFn);

    expect(result.totalPosts).toBe(1);
    expect(result.atsUrlsFound).toBe(0);
    expect(result.uniqueSlugsExtracted).toBe(0);
  });

  it("deduplicates ATS URLs across subreddits", async () => {
    const fetchFn = mockRedditFetch({
      reactjs: makeRssXml([
        {
          title: "[Hiring] React",
          description: "Hiring https://boards.greenhouse.io/acme/jobs/123",
        },
      ]),
      typescript: makeRssXml([
        {
          title: "[Hiring] TS",
          description: "Also https://boards.greenhouse.io/acme/jobs/456",
        },
      ]),
    });

    const result = await runRedditRssSeeder(fetchFn);

    expect(result.atsUrlsFound).toBe(2);
    expect(result.uniqueSlugsExtracted).toBe(1); // Same slug "acme"
  });

  it("passes insert inputs with discoverySource=hn_algolia", async () => {
    const fetchFn = mockRedditFetch({
      reactjs: makeRssXml([
        {
          title: "[Hiring] React",
          description: "Hiring https://boards.greenhouse.io/acme/jobs/123",
        },
      ]),
    });

    await runRedditRssSeeder(fetchFn);

    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoverySource).toBe("hn_algolia");
  });

  it("includes subreddit in discoveryContext", async () => {
    const fetchFn = mockRedditFetch({
      reactjs: makeRssXml([
        {
          title: "[Hiring] React",
          description: "Hiring https://boards.greenhouse.io/acme/jobs/123",
        },
      ]),
    });

    await runRedditRssSeeder(fetchFn);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoveryContext).toContain("reddit:reactjs");
    expect(callArg[0].discoveryContext).toContain("url:");
  });
});
