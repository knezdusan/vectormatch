/**
 * Unit tests for the ATS URL parser (TDD §4.1.2).
 *
 * Tests the pure URL extraction and classification logic — no network calls.
 * Covers:
 *   - URL extraction from HN comment text (including trailing punctuation)
 *   - Direct ATS URL classification (Greenhouse, Lever, Ashby)
 *   - Custom URL classification (non-ATS URLs)
 *   - Slug extraction from various URL patterns
 *   - Root domain extraction for cross-seeder dedup
 *   - Edge cases (no URLs, invalid URLs, multiple URLs)
 */

import {
  classifyUrls,
  extractRootDomain,
  extractUrls,
  parseAtsUrl,
} from "@/lib/jobs/seeders/url-parser";

// ── extractUrls ──────────────────────────────────────────────────────────────

describe("extractUrls", () => {
  it("extracts a single URL from text", () => {
    const result = extractUrls(
      "We're hiring! See jobs.lever.co/acme for details.",
    );
    expect(result).toEqual(["https://jobs.lever.co/acme"]);
  });

  it("extracts multiple URLs from text", () => {
    const result = extractUrls(
      "Check jobs.lever.co/acme and boards.greenhouse.io/foobar",
    );
    expect(result).toHaveLength(2);
    expect(result).toContain("https://jobs.lever.co/acme");
    expect(result).toContain("https://boards.greenhouse.io/foobar");
  });

  it("strips trailing periods", () => {
    const result = extractUrls("Visit jobs.lever.co/acme.");
    expect(result).toEqual(["https://jobs.lever.co/acme"]);
  });

  it("strips trailing commas", () => {
    const result = extractUrls("See jobs.lever.co/acme, and apply.");
    expect(result).toEqual(["https://jobs.lever.co/acme"]);
  });

  it("strips trailing exclamation marks", () => {
    const result = extractUrls("Check out jobs.lever.co/acme!");
    expect(result).toEqual(["https://jobs.lever.co/acme"]);
  });

  it("handles URLs with paths and query strings", () => {
    const result = extractUrls("Apply at jobs.lever.co/acme/123?source=hn");
    expect(result).toEqual(["https://jobs.lever.co/acme/123?source=hn"]);
  });

  it("handles URLs in parentheses", () => {
    const result = extractUrls("We're hiring (jobs.lever.co/acme)");
    // The closing paren is stripped by the URL regex character class
    expect(result).toEqual(["https://jobs.lever.co/acme"]);
  });

  it("returns empty array for text with no URLs", () => {
    expect(extractUrls("No URLs here, just plain text.")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractUrls("")).toEqual([]);
  });

  it("extracts http URLs (not just https)", () => {
    const result = extractUrls("Visit http://jobs.lever.co/acme");
    expect(result).toEqual(["http://jobs.lever.co/acme"]);
  });

  it("decodes HTML entities before extracting URLs (real HN Algolia API)", () => {
    // Regression test: discovered via live testing 2026-06-23. The HN Algolia
    // API returns HTML-encoded text where / is &#x2F;, ' is &#x27;, etc.
    // Without decoding, 0 ATS URLs were found across 501 comments.
    const htmlEncoded =
      'Apply at <a href="https:&#x2F;&#x2F;job-boards.greenhouse.io&#x2F;planetscale&#x2F;jobs&#x2F;4251150009" rel="nofollow">https:&#x2F;&#x2F;job-boards.greenhouse.io&#x2F;planetscale&#x2F;jobs&#x2F;4251150009</a>.';
    const result = extractUrls(htmlEncoded);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(
      "https://job-boards.greenhouse.io/planetscale/jobs/4251150009",
    );
  });

  it("decodes HTML entities in inline text URLs", () => {
    const htmlEncoded =
      "We&#x27;re hiring! See jobs.lever.co&#x2F;acme for details.";
    const result = extractUrls(htmlEncoded);
    expect(result).toContain("https://jobs.lever.co/acme");
  });
});

// ── parseAtsUrl — Greenhouse ─────────────────────────────────────────────────

describe("parseAtsUrl — Greenhouse", () => {
  it("parses hosted board URL", () => {
    const result = parseAtsUrl("https://boards.greenhouse.io/acme");
    expect(result).toEqual({
      atsSource: "greenhouse",
      atsSlug: "acme",
      url: "https://boards.greenhouse.io/acme",
    });
  });

  it("parses hosted board URL with trailing path", () => {
    const result = parseAtsUrl("https://boards.greenhouse.io/acme/jobs/123");
    expect(result?.atsSlug).toBe("acme");
  });

  it("parses job-boards.greenhouse.io hostname (alternate Greenhouse board)", () => {
    // Regression test: discovered via live testing 2026-06-23. PlanetScale and
    // other companies use job-boards.greenhouse.io instead of boards.greenhouse.io.
    const result = parseAtsUrl(
      "https://job-boards.greenhouse.io/planetscale/jobs/4251150009",
    );
    expect(result).toEqual({
      atsSource: "greenhouse",
      atsSlug: "planetscale",
      url: "https://job-boards.greenhouse.io/planetscale/jobs/4251150009",
    });
  });

  it("parses API URL", () => {
    const result = parseAtsUrl(
      "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
    );
    expect(result).toEqual({
      atsSource: "greenhouse",
      atsSlug: "acme",
      url: "https://boards-api.greenhouse.io/v1/boards/acme/jobs",
    });
  });

  it("is case-insensitive on hostname", () => {
    const result = parseAtsUrl("https://BOARDS.GREENHOUSE.IO/acme");
    expect(result?.atsSlug).toBe("acme");
  });
});

// ── parseAtsUrl — Lever ──────────────────────────────────────────────────────

describe("parseAtsUrl — Lever", () => {
  it("parses hosted board URL", () => {
    const result = parseAtsUrl("https://jobs.lever.co/acme");
    expect(result).toEqual({
      atsSource: "lever",
      atsSlug: "acme",
      url: "https://jobs.lever.co/acme",
    });
  });

  it("parses hosted board URL with trailing path", () => {
    const result = parseAtsUrl("https://jobs.lever.co/acme/abc-123");
    expect(result?.atsSlug).toBe("acme");
  });

  it("parses API URL", () => {
    const result = parseAtsUrl(
      "https://api.lever.co/v0/postings/acme?mode=json",
    );
    expect(result?.atsSlug).toBe("acme");
    expect(result?.atsSource).toBe("lever");
  });
});

// ── parseAtsUrl — Ashby ──────────────────────────────────────────────────────

describe("parseAtsUrl — Ashby", () => {
  it("parses jobs.ashbyhq.com URL", () => {
    const result = parseAtsUrl("https://jobs.ashbyhq.com/acme");
    expect(result).toEqual({
      atsSource: "ashby",
      atsSlug: "acme",
      url: "https://jobs.ashbyhq.com/acme",
    });
  });

  it("parses API URL", () => {
    const result = parseAtsUrl(
      "https://api.ashbyhq.com/posting-api/job-board/acme",
    );
    expect(result?.atsSource).toBe("ashby");
    expect(result?.atsSlug).toBe("acme");
  });
});

// ── parseAtsUrl — non-ATS URLs ───────────────────────────────────────────────

describe("parseAtsUrl — non-ATS URLs return null", () => {
  it("returns null for a company career page", () => {
    expect(parseAtsUrl("https://mystartup.com/careers")).toBeNull();
  });

  it("returns null for a generic URL", () => {
    expect(parseAtsUrl("https://example.com")).toBeNull();
  });

  it("returns null for invalid URL string", () => {
    expect(parseAtsUrl("not-a-url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseAtsUrl("")).toBeNull();
  });
});

// ── classifyUrls ─────────────────────────────────────────────────────────────

describe("classifyUrls", () => {
  it("separates ATS URLs from custom URLs", () => {
    const text =
      "We're hiring! See jobs.lever.co/acme or visit mystartup.com/careers";
    const result = classifyUrls(text);

    expect(result.atsUrls).toHaveLength(1);
    expect(result.atsUrls[0].atsSource).toBe("lever");
    expect(result.atsUrls[0].atsSlug).toBe("acme");

    expect(result.customUrls).toHaveLength(1);
    expect(result.customUrls[0]).toBe("https://mystartup.com/careers");
  });

  it("handles text with only ATS URLs", () => {
    const text = "Hiring at boards.greenhouse.io/acme and jobs.lever.co/foobar";
    const result = classifyUrls(text);
    expect(result.atsUrls).toHaveLength(2);
    expect(result.customUrls).toHaveLength(0);
  });

  it("handles text with only custom URLs", () => {
    const text = "Check acme.com/careers and foo.com/jobs";
    const result = classifyUrls(text);
    expect(result.atsUrls).toHaveLength(0);
    expect(result.customUrls).toHaveLength(2);
  });

  it("handles text with no URLs", () => {
    const result = classifyUrls("Just plain text, no links here.");
    expect(result.atsUrls).toHaveLength(0);
    expect(result.customUrls).toHaveLength(0);
  });

  it("handles multiple ATS sources in one comment", () => {
    const text =
      "Greenhouse: boards.greenhouse.io/acme | Lever: jobs.lever.co/foobar | Ashby: jobs.ashbyhq.com/baz";
    const result = classifyUrls(text);
    expect(result.atsUrls).toHaveLength(3);
    const sources = result.atsUrls.map((u) => u.atsSource).sort();
    expect(sources).toEqual(["ashby", "greenhouse", "lever"]);
  });
});

// ── extractRootDomain ────────────────────────────────────────────────────────

describe("extractRootDomain", () => {
  it("extracts root domain from a careers subdomain", () => {
    expect(extractRootDomain("https://careers.acme.com")).toBe("acme.com");
  });

  it("extracts root domain from a jobs subdomain", () => {
    expect(extractRootDomain("https://jobs.acme.com")).toBe("acme.com");
  });

  it("extracts root domain from www subdomain", () => {
    expect(extractRootDomain("https://www.acme.com/careers")).toBe("acme.com");
  });

  it("extracts root domain from bare domain", () => {
    expect(extractRootDomain("https://acme.com/careers")).toBe("acme.com");
  });

  it("returns null for ATS host URLs", () => {
    expect(extractRootDomain("https://jobs.lever.co/acme")).toBeNull();
    expect(extractRootDomain("https://boards.greenhouse.io/acme")).toBeNull();
    expect(extractRootDomain("https://jobs.ashbyhq.com/acme")).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    // "not-a-url" becomes "https://not-a-url" which URL parses as hostname
    // "not-a-url" — only 1 label, so extractRootDomain returns it as-is.
    // A truly invalid URL (with spaces) fails URL parsing.
    expect(extractRootDomain("https://[invalid")).toBeNull();
  });
});
