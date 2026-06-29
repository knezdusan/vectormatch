/**
 * Unit tests for B5 — Developer Newsletter Archives Seeder (TDD §2.1)
 *
 * Tests:
 *   - extractIssueUrls: pure function extracting issue URLs from archive page
 *   - extractLinksFromIssue: pure function extracting external links from issue
 *   - classifyLinks: dual strategy (direct ATS vs Slugger)
 *   - runNewsletterArchiveSeeder: full seeder with mocked fetch + Slugger
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module (used by Slugger)
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock the Slugger
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

// Mock the company-repository
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
    insertedCompanyIds: [],
    insertedCompanies: [],
  }),
}));

import {
  classifyLinks,
  extractIssueUrls,
  extractLinksFromIssue,
  type NewsletterLink,
  runNewsletterArchiveSeeder,
} from "@/lib/jobs/seeders/batch-sources/newsletter-archives";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Test fixtures ────────────────────────────────────────────────────────────

const ARCHIVE_HTML = `
<html><body>
  <nav>
    <a href="/about">About</a>
    <a href="/subscribe">Subscribe</a>
  </nav>
  <div class="issues">
    <a href="/issues/700">Issue 700</a>
    <a href="/issues/699">Issue 699</a>
    <a href="/issues/698">Issue 698</a>
    <a href="/issues/697">Issue 697</a>
  </div>
</body></html>
`;

const ISSUE_HTML = `
<html><body>
  <nav>
    <a href="https://javascriptweekly.com/about">About</a>
    <a href="https://javascriptweekly.com/subscribe">Subscribe</a>
  </nav>
  <div class="content">
    <a href="https://boards.greenhouse.io/acme/jobs/123">Acme is hiring!</a>
    <a href="https://jobs.lever.co/foobar/abc-456">Foobar Senior Engineer</a>
    <a href="https://acme.com/careers">Acme</a>
    <a href="https://example.com/article">Great Article About JS — A Deep Dive</a>
    <a href="https://twitter.com/acme">Twitter</a>
    <a href="https://github.com/acme/repo">GitHub</a>
    <a href="https://workable.com/company">Some Company</a>
  </div>
</body></html>
`;

// ── extractIssueUrls ─────────────────────────────────────────────────────────

describe("extractIssueUrls", () => {
  it("extracts issue URLs from archive page", () => {
    const urls = extractIssueUrls(
      ARCHIVE_HTML,
      "https://javascriptweekly.com/issues",
      10,
    );

    expect(urls).toHaveLength(4);
    expect(urls[0]).toBe("https://javascriptweekly.com/issues/700");
    expect(urls[1]).toBe("https://javascriptweekly.com/issues/699");
  });

  it("resolves relative URLs using the archive URL base", () => {
    const urls = extractIssueUrls(
      ARCHIVE_HTML,
      "https://javascriptweekly.com/issues",
      10,
    );

    for (const url of urls) {
      expect(url.startsWith("https://javascriptweekly.com/")).toBe(true);
    }
  });

  it("respects maxIssues limit", () => {
    const urls = extractIssueUrls(
      ARCHIVE_HTML,
      "https://javascriptweekly.com/issues",
      2,
    );

    expect(urls).toHaveLength(2);
  });

  it("deduplicates issue URLs", () => {
    const html = `
      <a href="/issues/700">Issue 700</a>
      <a href="/issues/700">Issue 700 (dup)</a>
    `;
    const urls = extractIssueUrls(
      html,
      "https://javascriptweekly.com/issues",
      10,
    );

    expect(urls).toHaveLength(1);
  });

  it("handles empty archive page", () => {
    const urls = extractIssueUrls(
      "<html></html>",
      "https://javascriptweekly.com/issues",
      10,
    );

    expect(urls).toHaveLength(0);
  });

  it("handles archives with /archives/ pattern (CSS Weekly)", () => {
    const html = `<a href="/archives/issue-123">Issue 123</a>`;
    const urls = extractIssueUrls(html, "https://css-weekly.com/archives/", 10);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe("https://css-weekly.com/archives/issue-123");
  });
});

// ── extractLinksFromIssue ────────────────────────────────────────────────────

describe("extractLinksFromIssue", () => {
  it("extracts external links from issue page", () => {
    const links = extractLinksFromIssue(
      ISSUE_HTML,
      "JavaScript Weekly",
      "https://javascriptweekly.com/issues/700",
    );

    const urls = links.map((l) => l.url);
    expect(urls).toContain("https://boards.greenhouse.io/acme/jobs/123");
    expect(urls).toContain("https://jobs.lever.co/foobar/abc-456");
    expect(urls).toContain("https://acme.com/careers");
  });

  it("excludes the newsletter's own domain", () => {
    const links = extractLinksFromIssue(
      ISSUE_HTML,
      "JavaScript Weekly",
      "https://javascriptweekly.com/issues/700",
    );

    const urls = links.map((l) => l.url);
    expect(urls).not.toContain("https://javascriptweekly.com/about");
    expect(urls).not.toContain("https://javascriptweekly.com/subscribe");
  });

  it("excludes social media links", () => {
    const links = extractLinksFromIssue(
      ISSUE_HTML,
      "JavaScript Weekly",
      "https://javascriptweekly.com/issues/700",
    );

    const urls = links.map((l) => l.url);
    expect(urls).not.toContain("https://twitter.com/acme");
    expect(urls).not.toContain("https://github.com/acme/repo");
  });

  it("excludes non-HTTP links", () => {
    const html = `<a href="mailto:test@test.com">Email</a><a href="/local">Local</a>`;
    const links = extractLinksFromIssue(html, "test");
    expect(links).toHaveLength(0);
  });

  it("deduplicates by URL", () => {
    const html = `
      <a href="https://acme.com">Acme</a>
      <a href="https://acme.com">Acme Again</a>
    `;
    const links = extractLinksFromIssue(html, "test");
    expect(links).toHaveLength(1);
  });

  it("includes newsletter name in extracted links", () => {
    const links = extractLinksFromIssue(
      `<a href="https://acme.com">Acme</a>`,
      "React Status",
    );
    expect(links[0].newsletter).toBe("React Status");
  });

  it("excludes very short text (< 2 chars)", () => {
    const html = `<a href="https://acme.com">A</a>`;
    const links = extractLinksFromIssue(html, "test");
    expect(links).toHaveLength(0);
  });

  it("handles empty issue page", () => {
    const links = extractLinksFromIssue("<html></html>", "test");
    expect(links).toHaveLength(0);
  });
});

// ── classifyLinks ────────────────────────────────────────────────────────────

describe("classifyLinks", () => {
  const links: NewsletterLink[] = [
    {
      url: "https://boards.greenhouse.io/acme/jobs/123",
      text: "Acme is hiring!",
      newsletter: "JS Weekly",
    },
    {
      url: "https://jobs.lever.co/foobar/abc-456",
      text: "Foobar Senior Engineer",
      newsletter: "JS Weekly",
    },
    {
      url: "https://acme.com/careers",
      text: "Acme",
      newsletter: "JS Weekly",
    },
    {
      url: "https://example.com/article",
      text: "Great Article About JS — A Deep Dive",
      newsletter: "JS Weekly",
    },
  ];

  it("classifies ATS URLs as direct slug extraction", () => {
    const { direct } = classifyLinks(links);

    expect(direct).toHaveLength(2);
    expect(direct[0].atsSlug).toBe("acme");
    expect(direct[0].atsSource).toBe("greenhouse");
    expect(direct[0].discoverySource).toBe("newsletter_archive");
    expect(direct[1].atsSlug).toBe("foobar");
    expect(direct[1].atsSource).toBe("lever");
  });

  it("classifies non-ATS URLs as Slugger candidates", () => {
    const { slugger } = classifyLinks(links);

    // "Acme" is short enough, "Great Article About JS — A Deep Dive" has " — "
    expect(slugger).toHaveLength(1);
    expect(slugger[0].companyName).toBe("Acme");
    expect(slugger[0].website).toBe("https://acme.com/careers");
  });

  it("excludes article titles with em-dash from Slugger candidates", () => {
    const { slugger } = classifyLinks(links);
    const names = slugger.map((s) => s.companyName);
    expect(names).not.toContain("Great Article About JS — A Deep Dive");
  });

  it("deduplicates direct ATS slugs", () => {
    const dupLinks: NewsletterLink[] = [
      {
        url: "https://boards.greenhouse.io/acme/jobs/123",
        text: "Acme hiring",
        newsletter: "JS Weekly",
      },
      {
        url: "https://boards.greenhouse.io/acme/jobs/456",
        text: "Acme another role",
        newsletter: "JS Weekly",
      },
    ];
    const { direct } = classifyLinks(dupLinks);
    expect(direct).toHaveLength(1);
  });

  it("handles empty links", () => {
    const { direct, slugger } = classifyLinks([]);
    expect(direct).toHaveLength(0);
    expect(slugger).toHaveLength(0);
  });
});

// ── runNewsletterArchiveSeeder ───────────────────────────────────────────────

describe("runNewsletterArchiveSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 2,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: ["id-1", "id-2"],
      insertedCompanies: [],
    });
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });
  });

  it("crawls archive + issues, extracts links, inserts companies", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/issues") && !url.includes("/issues/")) {
        // Archive page
        return new Response(ARCHIVE_HTML, { status: 200 });
      }
      if (url.match(/\/issues\/\d+/)) {
        // Issue page
        return new Response(ISSUE_HTML, { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    const result = await runNewsletterArchiveSeeder(
      fetchFn,
      [
        {
          name: "JS Weekly",
          archiveUrl: "https://javascriptweekly.com/issues",
        },
      ],
      2, // Only crawl 2 issues
    );

    expect(result.issuesCrawled).toBe(2);
    expect(result.totalLinksExtracted).toBeGreaterThan(0);
    expect(result.directSlugInserts).toBeGreaterThan(0);
    expect(result.error).toBeUndefined();
  });

  it("handles archive page fetch failure gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    const result = await runNewsletterArchiveSeeder(
      fetchFn,
      [
        {
          name: "JS Weekly",
          archiveUrl: "https://javascriptweekly.com/issues",
        },
      ],
      5,
    );

    expect(result.issuesCrawled).toBe(0);
    expect(result.error).toBeUndefined(); // Not a critical error — just skipped
  });

  it("handles network error for archive page gracefully", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as FetchFn;

    const result = await runNewsletterArchiveSeeder(
      fetchFn,
      [
        {
          name: "JS Weekly",
          archiveUrl: "https://javascriptweekly.com/issues",
        },
      ],
      5,
    );

    expect(result.issuesCrawled).toBe(0);
    expect(result.error).toBeUndefined(); // Individual newsletter failure — not critical
  });

  it("handles individual issue fetch failure gracefully", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/issues") && !url.includes("/issues/")) {
        return new Response(ARCHIVE_HTML, { status: 200 });
      }
      // All issue pages fail
      return new Response("Server Error", { status: 500 });
    }) as unknown as FetchFn;

    const result = await runNewsletterArchiveSeeder(
      fetchFn,
      [
        {
          name: "JS Weekly",
          archiveUrl: "https://javascriptweekly.com/issues",
        },
      ],
      3,
    );

    expect(result.issuesCrawled).toBe(0); // No issues successfully crawled
  });

  it("passes correct SluggerInput with discoverySource=newsletter_archive", async () => {
    const fetchFn = vi.fn(async (url: string) => {
      if (url.includes("/issues") && !url.includes("/issues/")) {
        return new Response(ARCHIVE_HTML, { status: 200 });
      }
      if (url.match(/\/issues\/\d+/)) {
        return new Response(ISSUE_HTML, { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    }) as unknown as FetchFn;

    await runNewsletterArchiveSeeder(
      fetchFn,
      [
        {
          name: "JS Weekly",
          archiveUrl: "https://javascriptweekly.com/issues",
        },
      ],
      1,
    );

    // Check that resolveSlugger was called with correct discoverySource
    const calls = vi.mocked(resolveSlugger).mock.calls;
    for (const call of calls) {
      expect(call[0].discoverySource).toBe("newsletter_archive");
    }
  });

  it("handles empty newsletter list", async () => {
    const fetchFn = vi.fn(async () => {
      return new Response("", { status: 200 });
    }) as unknown as FetchFn;

    const result = await runNewsletterArchiveSeeder(fetchFn, [], 5);

    expect(result.issuesCrawled).toBe(0);
    expect(result.totalLinksExtracted).toBe(0);
  });
});
