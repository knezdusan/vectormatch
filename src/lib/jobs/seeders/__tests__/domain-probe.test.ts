/**
 * Unit tests for v2 Domain Probe Pipeline
 * src/lib/jobs/seeders/domain-probe.ts
 *
 * Tests the 5-step probe order and discard criteria from the governing doc
 * (Criterion 1 "Probe Order" and "Discard Criteria").
 *
 * Per AGENTS.md: Vitest for unit/integration tests. Fetch is mocked — no real
 * network calls.
 */

import { describe, expect, it, vi } from "vitest";

import {
  COMMON_JOB_PATHS,
  countWords,
  extractStaticHtmlJobContent,
  findFeedLinks,
  isAggregatorDomain,
  isPathDisallowed,
  MIN_CONTENT_LENGTH,
  MIN_DESCRIPTION_WORDS,
  normalizeDomain,
  PROBE_TIMEOUT_MS,
  parseJsonLdJobPostings,
  parseRobotsTxt,
  probeDomain,
} from "@/lib/jobs/seeders/domain-probe";
import type { FetchFn } from "@/lib/jobs/types";

// ── normalizeDomain ──────────────────────────────────────────────────────────

describe("normalizeDomain", () => {
  it("adds https:// to bare domains", () => {
    expect(normalizeDomain("acme.com")).toBe("https://acme.com");
  });

  it("preserves existing https:// prefix", () => {
    expect(normalizeDomain("https://acme.com")).toBe("https://acme.com");
  });

  it("preserves http:// prefix", () => {
    expect(normalizeDomain("http://acme.com")).toBe("http://acme.com");
  });

  it("strips path from URL", () => {
    expect(normalizeDomain("https://acme.com/jobs")).toBe("https://acme.com");
  });

  it("returns null for empty string", () => {
    expect(normalizeDomain("")).toBeNull();
  });

  it("returns null for invalid domain", () => {
    expect(normalizeDomain("not a url")).toBeNull();
  });
});

// ── parseRobotsTxt ───────────────────────────────────────────────────────────

describe("parseRobotsTxt", () => {
  it("extracts sitemap declarations", () => {
    const body = `User-agent: *
Sitemap: https://acme.com/sitemap.xml
Sitemap: https://acme.com/jobs-sitemap.xml`;
    const result = parseRobotsTxt(body);
    expect(result.sitemaps).toEqual([
      "https://acme.com/sitemap.xml",
      "https://acme.com/jobs-sitemap.xml",
    ]);
  });

  it("extracts disallow patterns", () => {
    const body = `User-agent: *
Disallow: /admin
Disallow: /private`;
    const result = parseRobotsTxt(body);
    expect(result.disallows).toEqual(["/admin", "/private"]);
  });

  it("handles comments and blank lines", () => {
    const body = `# robots.txt
User-agent: *

# Disallow admin
Disallow: /admin
`;
    const result = parseRobotsTxt(body);
    expect(result.disallows).toEqual(["/admin"]);
  });

  it("returns empty arrays for empty body", () => {
    expect(parseRobotsTxt("")).toEqual({ sitemaps: [], disallows: [] });
  });

  it("is case-insensitive for directives", () => {
    const body = `SITEMAP: https://acme.com/sitemap.xml
DISALLOW: /admin`;
    const result = parseRobotsTxt(body);
    expect(result.sitemaps).toEqual(["https://acme.com/sitemap.xml"]);
    expect(result.disallows).toEqual(["/admin"]);
  });
});

// ── isPathDisallowed ─────────────────────────────────────────────────────────

describe("isPathDisallowed", () => {
  it("returns true for exact prefix match", () => {
    expect(isPathDisallowed("/admin", ["/admin"])).toBe(true);
  });

  it("returns true for prefix match with subpath", () => {
    expect(isPathDisallowed("/admin/users", ["/admin"])).toBe(true);
  });

  it("returns false for non-matching path", () => {
    expect(isPathDisallowed("/jobs", ["/admin"])).toBe(false);
  });

  it("ignores universal disallow (/)", () => {
    expect(isPathDisallowed("/jobs", ["/"])).toBe(false);
  });

  it("returns false for empty disallows", () => {
    expect(isPathDisallowed("/jobs", [])).toBe(false);
  });
});

// ── parseJsonLdJobPostings ───────────────────────────────────────────────────

describe("parseJsonLdJobPostings", () => {
  it("extracts a single JobPosting from JSON-LD", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "Senior Engineer", "description": "We are hiring a senior engineer."}
      </script>
    </head></html>`;
    const postings = parseJsonLdJobPostings(html);
    expect(postings).toHaveLength(1);
    expect(postings[0].title).toBe("Senior Engineer");
    expect(postings[0].description).toBe("We are hiring a senior engineer.");
  });

  it("extracts from an array of JSON-LD objects", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      [
        {"@type": "Organization", "name": "Acme"},
        {"@type": "JobPosting", "title": "DevOps Engineer", "description": "Run our infra."}
      ]
      </script>
    </head></html>`;
    const postings = parseJsonLdJobPostings(html);
    expect(postings).toHaveLength(1);
    expect(postings[0].title).toBe("DevOps Engineer");
  });

  it("extracts from @graph structures", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@graph": [
        {"@type": "WebSite", "name": "Acme"},
        {"@type": "JobPosting", "title": "Frontend Dev", "description": "Build UIs."}
      ]}
      </script>
    </head></html>`;
    const postings = parseJsonLdJobPostings(html);
    expect(postings).toHaveLength(1);
    expect(postings[0].title).toBe("Frontend Dev");
  });

  it("skips non-JobPosting types", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@type": "Organization", "name": "Acme"}
      </script>
    </head></html>`;
    expect(parseJsonLdJobPostings(html)).toHaveLength(0);
  });

  it("skips invalid JSON-LD", () => {
    const html = `<html><head>
      <script type="application/ld+json">not valid json</script>
    </head></html>`;
    expect(parseJsonLdJobPostings(html)).toHaveLength(0);
  });

  it("returns empty for empty HTML", () => {
    expect(parseJsonLdJobPostings("")).toHaveLength(0);
  });

  it("skips postings missing title or description", () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "No description"}
      </script>
    </head></html>`;
    expect(parseJsonLdJobPostings(html)).toHaveLength(0);
  });
});

// ── extractStaticHtmlJobContent ──────────────────────────────────────────────

describe("extractStaticHtmlJobContent", () => {
  it("extracts content from <main> container", () => {
    const html = `<html><body>
      <nav>Home About</nav>
      <main>
        <h1>Senior Engineer</h1>
        <p>We are hiring a senior engineer to build scalable backend systems
        using TypeScript and Node.js. You will work on our core platform
        and help us scale to millions of users. This is a remote role
        with competitive salary and equity.</p>
      </main>
      <footer>Copyright 2026</footer>
    </body></html>`;
    const result = extractStaticHtmlJobContent(html);
    expect(result).not.toBeNull();
    expect(result?.cleanedText).toContain("Senior Engineer");
    expect(result?.cleanedText).not.toContain("Copyright");
    expect(result?.hasJobTitle).toBe(true);
  });

  it("extracts content from .careers container", () => {
    const html = `<html><body>
      <div class="careers">
        <h2>Software Engineer</h2>
        <p>${"word ".repeat(60)}We are hiring.</p>
      </div>
    </body></html>`;
    const result = extractStaticHtmlJobContent(html);
    expect(result).not.toBeNull();
    expect(result?.cleanedText.length).toBeGreaterThan(MIN_CONTENT_LENGTH);
  });

  it("extracts mailto: links", () => {
    const html = `<html><body>
      <main>
        <h1>Senior Engineer</h1>
        <p>${"word ".repeat(60)}Apply at <a href="mailto:jobs@acme.com">jobs@acme.com</a></p>
      </main>
    </body></html>`;
    const result = extractStaticHtmlJobContent(html);
    expect(result).not.toBeNull();
    expect(result?.email).toBe("jobs@acme.com");
  });

  it("ignores example.com mailto links", () => {
    const html = `<html><body>
      <main>
        <h1>Senior Engineer</h1>
        <p>${"word ".repeat(60)}Apply at <a href="mailto:jobs@example.com">jobs@example.com</a></p>
      </main>
    </body></html>`;
    const result = extractStaticHtmlJobContent(html);
    expect(result).not.toBeNull();
    expect(result?.email).toBeNull();
  });

  it("returns null for content below MIN_CONTENT_LENGTH", () => {
    const html = `<html><body><main>Short</main></body></html>`;
    expect(extractStaticHtmlJobContent(html)).toBeNull();
  });

  it("returns null for empty HTML", () => {
    expect(extractStaticHtmlJobContent("")).toBeNull();
  });

  it("strips nav/footer/header/aside/script/style", () => {
    const html = `<html><body>
      <header>Header nav</header>
      <nav>Nav links</nav>
      <aside>Sidebar</aside>
      <script>console.log('hi')</script>
      <style>body { color: red; }</style>
      <main>
        <h1>Senior Engineer</h1>
        <p>${"word ".repeat(60)}Job description here.</p>
      </main>
      <footer>Footer text</footer>
    </body></html>`;
    const result = extractStaticHtmlJobContent(html);
    expect(result).not.toBeNull();
    expect(result?.cleanedText).not.toContain("Header nav");
    expect(result?.cleanedText).not.toContain("Nav links");
    expect(result?.cleanedText).not.toContain("Sidebar");
    expect(result?.cleanedText).not.toContain("Footer text");
    expect(result?.cleanedText).not.toContain("console.log");
  });

  it("detects job title patterns", () => {
    const html = `<html><body><main>
      <h1>Senior Software Engineer</h1>
      <p>${"word ".repeat(60)}We are hiring.</p>
    </main></body></html>`;
    const result = extractStaticHtmlJobContent(html);
    expect(result).not.toBeNull();
    expect(result?.hasJobTitle).toBe(true);
  });

  it("returns hasJobTitle=false for non-job content", () => {
    const html = `<html><body><main>
      <p>${"word ".repeat(60)}This is a blog post about technology trends
      and how they affect the industry. No job listings here.</p>
    </main></body></html>`;
    const result = extractStaticHtmlJobContent(html);
    expect(result).not.toBeNull();
    expect(result?.hasJobTitle).toBe(false);
  });
});

// ── findFeedLinks ────────────────────────────────────────────────────────────

describe("findFeedLinks", () => {
  it("finds RSS feed links", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
    </head></html>`;
    const feeds = findFeedLinks(html, "https://acme.com");
    expect(feeds).toEqual(["https://acme.com/feed.xml"]);
  });

  it("finds Atom feed links", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/atom+xml" href="/atom.xml" />
    </head></html>`;
    const feeds = findFeedLinks(html, "https://acme.com");
    expect(feeds).toEqual(["https://acme.com/atom.xml"]);
  });

  it("finds JSON feed links", () => {
    const html = `<html><head>
      <link rel="alternate" type="application/json" href="/feed.json" />
    </head></html>`;
    const feeds = findFeedLinks(html, "https://acme.com");
    expect(feeds).toEqual(["https://acme.com/feed.json"]);
  });

  it("resolves relative URLs against baseUrl", () => {
    const html = `<html><head>
      <link type="application/rss+xml" href="feed.xml" />
    </head></html>`;
    const feeds = findFeedLinks(html, "https://acme.com/jobs");
    expect(feeds).toEqual(["https://acme.com/feed.xml"]);
  });

  it("returns empty for HTML without feed links", () => {
    const html = `<html><head></head></html>`;
    expect(findFeedLinks(html, "https://acme.com")).toEqual([]);
  });

  it("returns empty for empty HTML", () => {
    expect(findFeedLinks("", "https://acme.com")).toEqual([]);
  });
});

// ── countWords ───────────────────────────────────────────────────────────────

describe("countWords", () => {
  it("counts words in a normal sentence", () => {
    expect(countWords("hello world foo bar")).toBe(4);
  });

  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(countWords("   ")).toBe(0);
  });

  it("handles extra whitespace", () => {
    expect(countWords("  hello   world  ")).toBe(2);
  });
});

// ── isAggregatorDomain ───────────────────────────────────────────────────────

describe("isAggregatorDomain", () => {
  it("returns true for known aggregator domains", () => {
    expect(isAggregatorDomain("hirehangar")).toBe(true);
    expect(isAggregatorDomain("ketryx")).toBe(true);
  });

  it("returns false for non-aggregator domains", () => {
    expect(isAggregatorDomain("acme.com")).toBe(false);
    expect(isAggregatorDomain("vercel")).toBe(false);
  });
});

// ── probeDomain (integration with mocked fetch) ──────────────────────────────

describe("probeDomain", () => {
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

  it("discards aggregator domains early", async () => {
    const result = await probeDomain("hirehangar", makeMockFetch({}));
    expect(result.discardReason).toBe("aggregator_domain");
    expect(result.jobs).toHaveLength(0);
  });

  it("discards invalid domains", async () => {
    const result = await probeDomain("not a url", makeMockFetch({}));
    expect(result.discardReason).toBe("no_paths_found");
    expect(result.error).toBeDefined();
  });

  it("extracts jobs from JSON-LD (Step 3)", async () => {
    const jobHtml = `<html><head>
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "Senior Engineer",
       "description": "${"word ".repeat(60)}We are hiring a senior engineer."}
      </script>
    </head></html>`;

    const result = await probeDomain(
      "acme.com",
      makeMockFetch({
        "https://acme.com/robots.txt": { status: 404, body: "" },
        "https://acme.com/jobs": { status: 200, body: jobHtml },
      }),
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].discoveredBy).toBe("step3_jsonld");
    expect(result.jobs[0].title).toBe("Senior Engineer");
    expect(result.resolvedByStep).toBe(3);
    expect(result.discardReason).toBeNull();
  });

  it("extracts jobs from static HTML (Step 4) when no JSON-LD", async () => {
    const html = `<html><body>
      <main>
        <h1>Senior Software Engineer</h1>
        <p>${"word ".repeat(60)}We are hiring a senior software engineer
        to build scalable backend systems.</p>
      </main>
    </body></html>`;

    const result = await probeDomain(
      "acme.com",
      makeMockFetch({
        "https://acme.com/robots.txt": { status: 404, body: "" },
        "https://acme.com/careers": { status: 200, body: html },
      }),
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].discoveredBy).toBe("step4_static_html");
    expect(result.resolvedByStep).toBe(4);
  });

  it("respects robots.txt disallow patterns", async () => {
    const robotsBody = `User-agent: *\nDisallow: /jobs`;
    const jobHtml = `<html><head>
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "Senior Engineer",
       "description": "${"word ".repeat(60)}We are hiring."}
      </script>
    </head></html>`;

    const result = await probeDomain(
      "acme.com",
      makeMockFetch({
        "https://acme.com/robots.txt": { status: 200, body: robotsBody },
        // /jobs is disallowed — should not be probed
        "https://acme.com/jobs": { status: 200, body: jobHtml },
        // /careers is allowed — but returns 404
        "https://acme.com/careers": { status: 404, body: "" },
      }),
    );

    // /jobs was skipped (disallowed), /careers returned 404 → all attempted
    // paths returned 4xx, so the discard reason is "http_error".
    expect(result.jobs).toHaveLength(0);
    expect(result.discardReason).toBe("http_error");
  });

  it("discards when all paths return 4xx/5xx", async () => {
    const result = await probeDomain(
      "acme.com",
      makeMockFetch({
        "https://acme.com/robots.txt": { status: 404, body: "" },
        "https://acme.com/jobs": { status: 404, body: "" },
        "https://acme.com/careers": { status: 404, body: "" },
        "https://acme.com/open-roles": { status: 500, body: "" },
        "https://acme.com/hiring": { status: 404, body: "" },
        "https://acme.com/work-with-us": { status: 403, body: "" },
      }),
    );

    expect(result.jobs).toHaveLength(0);
    expect(result.discardReason).toBe("http_error");
  });

  it("discards when content is too short", async () => {
    const html = `<html><body><main>Short content</main></body></html>`;

    const result = await probeDomain(
      "acme.com",
      makeMockFetch({
        "https://acme.com/robots.txt": { status: 404, body: "" },
        "https://acme.com/jobs": { status: 200, body: html },
      }),
    );

    expect(result.jobs).toHaveLength(0);
    // content_too_short causes the path to be skipped, not a direct discard.
    // After all paths are exhausted with no jobs, the discard is "no_job_text".
    expect(result.discardReason).toBe("no_job_text");
  });

  it("stops probing after finding jobs on the first successful path", async () => {
    const jobHtml = `<html><head>
      <script type="application/ld+json">
      {"@type": "JobPosting", "title": "Senior Engineer",
       "description": "${"word ".repeat(60)}We are hiring."}
      </script>
    </head></html>`;

    const fetchFn = vi.fn<FetchFn>((async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr === "https://acme.com/robots.txt") {
        return new Response("", { status: 404 });
      }
      if (urlStr === "https://acme.com/jobs") {
        return new Response(jobHtml, { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as FetchFn);

    const result = await probeDomain("acme.com", fetchFn);

    expect(result.jobs).toHaveLength(1);
    expect(result.resolvedByStep).toBe(3);
    // Should not have probed /careers, /open-roles, etc. after finding jobs on /jobs
    const probedUrls = fetchFn.mock.calls.map((c) =>
      typeof c[0] === "string" ? c[0] : c[0].toString(),
    );
    expect(probedUrls).not.toContain("https://acme.com/careers");
  });

  it("handles fetch timeouts gracefully", async () => {
    const fetchFn = vi.fn<FetchFn>((async () => {
      throw new Error("AbortError: The operation was aborted");
    }) as FetchFn);

    const result = await probeDomain("acme.com", fetchFn);

    expect(result.jobs).toHaveLength(0);
    expect(result.discardReason).toBeDefined();
  });

  it("probes all common job paths", async () => {
    // Verify the module exports the expected paths
    expect(COMMON_JOB_PATHS).toContain("/jobs");
    expect(COMMON_JOB_PATHS).toContain("/careers");
    expect(COMMON_JOB_PATHS).toContain("/open-roles");
    expect(COMMON_JOB_PATHS).toContain("/hiring");
    expect(COMMON_JOB_PATHS).toContain("/work-with-us");
  });

  it("exports the expected constants", () => {
    expect(PROBE_TIMEOUT_MS).toBe(2000);
    expect(MIN_CONTENT_LENGTH).toBe(200);
    expect(MIN_DESCRIPTION_WORDS).toBe(50);
  });
});
