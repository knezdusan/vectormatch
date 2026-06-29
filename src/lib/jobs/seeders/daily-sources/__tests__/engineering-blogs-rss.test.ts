/**
 * Unit tests for D9 — Company Engineering Blog RSS Seeder
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db and slugger modules
vi.mock("@/db/db", () => ({ db: { select: vi.fn(), insert: vi.fn() } }));
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

import {
  containsHiringKeywords,
  ENGINEERING_BLOGS,
  extractHiringPostsFromRss,
  HIRING_KEYWORDS,
  runEngineeringBlogsRssSeeder,
} from "@/lib/jobs/seeders/daily-sources/engineering-blogs-rss";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── containsHiringKeywords ───────────────────────────────────────────────────

describe("containsHiringKeywords", () => {
  it("returns true when 'hiring' is in the title", () => {
    expect(containsHiringKeywords("We are hiring engineers!")).toBe(true);
  });

  it("returns true when 'careers' is in the description", () => {
    expect(containsHiringKeywords("Check out our new careers page")).toBe(true);
  });

  it("returns false when no keywords are present", () => {
    expect(containsHiringKeywords("New blog post about our architecture")).toBe(
      false,
    );
  });

  it("is case-insensitive", () => {
    expect(containsHiringKeywords("WE ARE HIRING!")).toBe(true);
    expect(containsHiringKeywords("Join Our Team today")).toBe(true);
    expect(containsHiringKeywords("CAREERS at Acme")).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(containsHiringKeywords("")).toBe(false);
  });

  it("detects 'join us' keyword", () => {
    expect(containsHiringKeywords("Come join us at Acme")).toBe(true);
  });

  it('detects "we\'re looking for" keyword', () => {
    expect(containsHiringKeywords("We're looking for a senior engineer")).toBe(
      true,
    );
  });
});

// ── extractHiringPostsFromRss ────────────────────────────────────────────────

describe("extractHiringPostsFromRss", () => {
  const validRssWithHiring = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Netflix Tech Blog</title>
    <item>
      <title>We are hiring senior engineers</title>
      <description>Join our team to build the future of streaming.</description>
      <link>https://netflixtechblog.com/hiring</link>
    </item>
    <item>
      <title>Our new recommendation architecture</title>
      <description>A deep dive into our ML pipeline.</description>
      <link>https://netflixtechblog.com/recs</link>
    </item>
  </channel>
</rss>`;

  const validRssWithoutHiring = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Stripe Blog</title>
    <item>
      <title>Designing our new API</title>
      <description>How we approach API versioning.</description>
    </item>
    <item>
      <title>Scaling our payments infrastructure</title>
      <description>A post about our backend architecture.</description>
    </item>
  </channel>
</rss>`;

  const emptyRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Empty Blog</title>
  </channel>
</rss>`;

  it("extracts hiring posts from valid RSS", () => {
    const posts = extractHiringPostsFromRss(
      validRssWithHiring,
      "Netflix Tech Blog",
      "Netflix",
    );
    expect(posts).toHaveLength(1);
    expect(posts[0].companyName).toBe("Netflix");
    expect(posts[0].blogName).toBe("Netflix Tech Blog");
    expect(posts[0].title).toBe("We are hiring senior engineers");
  });

  it("returns empty array for valid RSS without hiring posts", () => {
    const posts = extractHiringPostsFromRss(
      validRssWithoutHiring,
      "Stripe Blog",
      "Stripe",
    );
    expect(posts).toHaveLength(0);
  });

  it("returns empty array for empty RSS (no items)", () => {
    const posts = extractHiringPostsFromRss(emptyRss, "Empty Blog", "EmptyCo");
    expect(posts).toHaveLength(0);
  });

  it("returns empty array for empty XML string", () => {
    const posts = extractHiringPostsFromRss("", "Blog", "Co");
    expect(posts).toHaveLength(0);
  });

  it("returns empty array for invalid XML", () => {
    const posts = extractHiringPostsFromRss(
      "this is not valid xml at all",
      "Blog",
      "Co",
    );
    expect(posts).toHaveLength(0);
  });

  it("detects hiring keyword in description only", () => {
    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Blog</title>
    <item>
      <title>Engineering update</title>
      <description>We have open careers positions available.</description>
    </item>
  </channel>
</rss>`;
    const posts = extractHiringPostsFromRss(rss, "Blog", "Co");
    expect(posts).toHaveLength(1);
  });
});

// ── runEngineeringBlogsRssSeeder ─────────────────────────────────────────────

describe("runEngineeringBlogsRssSeeder", () => {
  const hiringRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Netflix Tech Blog</title>
    <item>
      <title>We are hiring</title>
      <description>Join our team.</description>
    </item>
    <item>
      <title>Architecture post</title>
      <description>How we built it.</description>
    </item>
  </channel>
</rss>`;

  const nonHiringRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Stripe Blog</title>
    <item>
      <title>API design</title>
      <description>Versioning strategies.</description>
    </item>
  </channel>
</rss>`;

  function makeFetchFn(
    responses: Record<string, { ok: boolean; text: string }>,
  ): FetchFn {
    return (async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      const match = responses[urlStr];
      if (!match) {
        return new Response("not found", { status: 404 });
      }
      return {
        ok: match.ok,
        text: async () => match.text,
      } as Response;
    }) as FetchFn;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs the full flow: fetches feeds, extracts hiring posts, resolves companies", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "netflix",
      resolvedBy: "slug_probe",
      canonicalName: "netflix",
    });

    const responses: Record<string, { ok: boolean; text: string }> = {};
    for (const blog of ENGINEERING_BLOGS) {
      responses[blog.url] = {
        ok: true,
        text: blog.companyName === "Netflix" ? hiringRss : nonHiringRss,
      };
    }
    const fetchFn = makeFetchFn(responses);

    const result = await runEngineeringBlogsRssSeeder(fetchFn);

    expect(result.totalPosts).toBeGreaterThan(0);
    expect(result.hiringPosts).toBeGreaterThanOrEqual(1);
    expect(result.uniqueCompanies).toBeGreaterThanOrEqual(1);
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    expect(result.unresolved).toBe(0);
    expect(mockedResolveSlugger).toHaveBeenCalled();
  });

  it("continues when an individual blog feed fails (non-ok response)", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "stripe",
      resolvedBy: "slug_probe",
      canonicalName: "stripe",
    });

    const responses: Record<string, { ok: boolean; text: string }> = {};
    for (const blog of ENGINEERING_BLOGS) {
      if (blog.companyName === "Netflix") {
        // Netflix fails (non-ok)
        responses[blog.url] = { ok: false, text: "error" };
      } else if (blog.companyName === "Stripe") {
        // Stripe has a hiring post
        responses[blog.url] = {
          ok: true,
          text: `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Stripe Blog</title>
    <item>
      <title>We are hiring</title>
      <description>Join our team.</description>
    </item>
  </channel>
</rss>`,
        };
      } else {
        responses[blog.url] = { ok: true, text: nonHiringRss };
      }
    }
    const fetchFn = makeFetchFn(responses);

    const result = await runEngineeringBlogsRssSeeder(fetchFn);

    // Seeder did not abort — Stripe was still processed
    expect(result.hiringPosts).toBeGreaterThanOrEqual(1);
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    expect(result.error).toBeUndefined();
  });

  it("continues when an individual blog fetch throws", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockResolvedValue({
      success: false,
      canonicalName: "stripe",
    });

    const fetchFn = (async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("netflix")) {
        throw new Error("network error");
      }
      return {
        ok: true,
        text: async () => nonHiringRss,
      } as Response;
    }) as FetchFn;

    const result = await runEngineeringBlogsRssSeeder(fetchFn);

    // No hiring posts but seeder completed without aborting
    expect(result.error).toBeUndefined();
    expect(result.totalPosts).toBeGreaterThanOrEqual(0);
  });

  it("returns empty results when no hiring posts are found", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockResolvedValue({
      success: false,
      canonicalName: "none",
    });

    const responses: Record<string, { ok: boolean; text: string }> = {};
    for (const blog of ENGINEERING_BLOGS) {
      responses[blog.url] = { ok: true, text: nonHiringRss };
    }
    const fetchFn = makeFetchFn(responses);

    const result = await runEngineeringBlogsRssSeeder(fetchFn);

    expect(result.hiringPosts).toBe(0);
    expect(result.uniqueCompanies).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(mockedResolveSlugger).not.toHaveBeenCalled();
  });

  it("passes correct SluggerInput with discoverySource and discoveryContext", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "netflix",
      resolvedBy: "slug_probe",
      canonicalName: "netflix",
    });

    const responses: Record<string, { ok: boolean; text: string }> = {};
    for (const blog of ENGINEERING_BLOGS) {
      responses[blog.url] = {
        ok: true,
        text: blog.companyName === "Netflix" ? hiringRss : nonHiringRss,
      };
    }
    const fetchFn = makeFetchFn(responses);

    await runEngineeringBlogsRssSeeder(fetchFn);

    expect(mockedResolveSlugger).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Netflix",
        discoverySource: "hn_algolia",
        discoveryContext: expect.stringContaining("eng-blog:"),
      }),
      expect.objectContaining({
        insertCompany: true,
      }),
    );
  });

  it("deduplicates companies across blogs", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "netflix",
      resolvedBy: "slug_probe",
      canonicalName: "netflix",
    });

    // Two blogs both with companyName "Netflix" — should only resolve once
    const responses: Record<string, { ok: boolean; text: string }> = {};
    for (const blog of ENGINEERING_BLOGS) {
      responses[blog.url] = {
        ok: true,
        text: blog.companyName === "Netflix" ? hiringRss : nonHiringRss,
      };
    }
    const fetchFn = makeFetchFn(responses);

    const result = await runEngineeringBlogsRssSeeder(fetchFn);

    // Only one unique company (Netflix) — resolveSlugger called once
    expect(result.uniqueCompanies).toBe(1);
    expect(mockedResolveSlugger).toHaveBeenCalledTimes(1);
  });

  it("counts unresolved companies when Slugger fails", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockResolvedValue({
      success: false,
      canonicalName: "netflix",
    });

    const responses: Record<string, { ok: boolean; text: string }> = {};
    for (const blog of ENGINEERING_BLOGS) {
      responses[blog.url] = {
        ok: true,
        text: blog.companyName === "Netflix" ? hiringRss : nonHiringRss,
      };
    }
    const fetchFn = makeFetchFn(responses);

    const result = await runEngineeringBlogsRssSeeder(fetchFn);

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
  });

  it("counts unresolved when Slugger throws", async () => {
    const mockedResolveSlugger = vi.mocked(resolveSlugger);
    mockedResolveSlugger.mockRejectedValue(new Error("slugger error"));

    const responses: Record<string, { ok: boolean; text: string }> = {};
    for (const blog of ENGINEERING_BLOGS) {
      responses[blog.url] = {
        ok: true,
        text: blog.companyName === "Netflix" ? hiringRss : nonHiringRss,
      };
    }
    const fetchFn = makeFetchFn(responses);

    const result = await runEngineeringBlogsRssSeeder(fetchFn);

    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
    expect(result.error).toBeUndefined();
  });
});

// ── Constants sanity checks ──────────────────────────────────────────────────

describe("ENGINEERING_BLOGS", () => {
  it("contains the expected curated list of blogs", () => {
    const names = ENGINEERING_BLOGS.map((b) => b.name);
    expect(names).toContain("Netflix Tech Blog");
    expect(names).toContain("Airbnb Engineering");
    expect(names).toContain("Uber Engineering");
    expect(names).toContain("Stripe Blog");
    expect(names).toContain("Cloudflare Blog");
    expect(names).toContain("Discord Blog");
    expect(names).toContain("Instagram Engineering");
    expect(names).toContain("Twitter Engineering");
  });

  it("each blog has name, url, and companyName", () => {
    for (const blog of ENGINEERING_BLOGS) {
      expect(blog.name).toBeTruthy();
      expect(blog.url).toBeTruthy();
      expect(blog.companyName).toBeTruthy();
    }
  });
});

describe("HIRING_KEYWORDS", () => {
  it("contains the expected keywords", () => {
    expect(HIRING_KEYWORDS).toContain("hiring");
    expect(HIRING_KEYWORDS).toContain("careers");
    expect(HIRING_KEYWORDS).toContain("jobs");
    expect(HIRING_KEYWORDS).toContain("we're looking for");
    expect(HIRING_KEYWORDS).toContain("join our team");
    expect(HIRING_KEYWORDS).toContain("join us");
  });
});
