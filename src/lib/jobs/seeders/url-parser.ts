// ATS URL Parser — Extraction and Classification
// src/lib/jobs/seeders/url-parser.ts
//
// Pure functions for extracting URLs from HN comment text and classifying them
// as direct ATS URLs or custom (non-ATS) URLs. No network calls — this module
// is fully testable in isolation.
//
// ── Two URL categories (TDD §4.1.2) ──────────────────────────────────────────
//
// 1. Direct ATS URLs — immediately map to a (atsSource, atsSlug) tuple:
//    - boards.greenhouse.io/{slug}     → greenhouse
//    - jobs.lever.co/{slug}            → lever
//    - api.ashbyhq.com/posting-api/job-board/{slug} → ashby (API URL)
//    - jobs.ashbyhq.com/{slug}         → ashby (hosted board)
//    - careers.ashbyhq.com/{slug}      → ashby (hosted board, primary pattern)
//
// 2. Custom URLs — anything else (e.g. mystartup.com/careers). These go to the
//    resolve-custom-url module for CNAME + slug probe resolution.
//
// See TDD §4.1.2 for the full specification.

import type { AtsSource } from "./schemas";

// ── Types ────────────────────────────────────────────────────────────────────

/** A URL classified as a direct ATS link, with the extracted slug. */
export interface ParsedAtsUrl {
  atsSource: AtsSource;
  atsSlug: string;
  /** The original URL string from the comment text. */
  url: string;
}

/** Result of classifying a single extracted URL. */
export type ClassifiedUrl =
  | { kind: "ats"; parsed: ParsedAtsUrl }
  | { kind: "custom"; url: string };

// ── URL extraction ───────────────────────────────────────────────────────────

// Matches URLs in plain text — both protocol-prefixed (https://...) and bare
// domain URLs (jobs.lever.co/acme). HN comments use plain text URLs (not
// markdown), and most posters omit the protocol. Trailing punctuation is
// stripped (common in HN comments: "Check out jobs.lever.co/acme.").
//
// The regex has two alternatives:
//   1. Protocol-prefixed: https?:// followed by non-whitespace, non-bracket chars
//   2. Bare domain: starts with a word char, contains at least one dot followed
//      by 2+ alpha chars (TLD), optionally followed by a path. This avoids
//      matching "foo.bar" in prose (which has no TLD-like suffix) while catching
//      "jobs.lever.co/acme" and "boards.greenhouse.io/foobar".
const URL_REGEX =
  /https?:\/\/[^\s<>"')\]]+|[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(?:\/[^\s<>"')\]]*)?/gi;

/**
 * Decode HTML entities in text. The HN Algolia API returns HTML-encoded comment
 * text where `/` is `&#x2F;`, `'` is `&#x27;`, `&` is `&amp;`, etc. This makes
 * URL extraction impossible on the raw text — URLs appear as
 * `https:&#x2F;&#x2F;job-boards.greenhouse.io&#x2F;planetscale` instead of
 * `https://job-boards.greenhouse.io/planetscale`.
 *
 * Discovered via live testing 2026-06-23: 0 ATS URLs found across 501 HN
 * comments because all URLs were HTML-encoded.
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x2F;/gi, "/")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2A;/gi, "*")
    .replace(/&#x3D;/gi, "=")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec) =>
      String.fromCharCode(Number.parseInt(dec, 10)),
    );
}

/**
 * Extract all URLs from a block of plain text (e.g. an HN comment body).
 * Strips trailing punctuation that is commonly appended to URLs in prose.
 * Returns URLs in order of appearance. Duplicates are preserved (the caller
 * can dedup if needed).
 *
 * The text is HTML-decoded first, because the HN Algolia API returns HTML-encoded
 * text (e.g. `&#x2F;` for `/`). Without decoding, URLs inside `<a href="...">`
 * tags and inline text are not matchable by the URL regex.
 *
 * @example
 * extractUrls("We're hiring! See jobs.lever.co/acme for details.")
 * // → ["https://jobs.lever.co/acme"]
 */
export function extractUrls(text: string): string[] {
  // Decode HTML entities first — HN Algolia returns encoded text.
  const decoded = decodeHtmlEntities(text);
  const matches = decoded.match(URL_REGEX);
  if (!matches) return [];
  return matches.map((url) => {
    // Strip trailing punctuation (common in prose: "Check jobs.lever.co/acme.")
    const cleaned = url.replace(/[.,;:!?]+$/, "");
    // Normalize bare URLs by prepending https:// — HN comments often omit
    // the protocol, but downstream code (parseAtsUrl, extractRootDomain)
    // expects a full URL.
    if (!cleaned.match(/^https?:\/\//)) {
      return `https://${cleaned}`;
    }
    return cleaned;
  });
}

// ── ATS URL classification ───────────────────────────────────────────────────

// Hostname → ATS source mapping for direct ATS URLs. The pathname pattern
// determines how to extract the slug.
const ATS_HOST_PATTERNS: Record<
  string,
  { source: AtsSource; slugExtractor: (pathname: string) => string | null }
> = {
  // Greenhouse hosted board: boards.greenhouse.io/{slug}
  "boards.greenhouse.io": {
    source: "greenhouse",
    slugExtractor: (path) => extractFirstPathSegment(path),
  },
  // Greenhouse hosted board (alternate hostname): job-boards.greenhouse.io/{slug}
  // Discovered via live testing 2026-06-23: PlanetScale uses this hostname.
  "job-boards.greenhouse.io": {
    source: "greenhouse",
    slugExtractor: (path) => extractFirstPathSegment(path),
  },
  // Greenhouse API: boards-api.greenhouse.io/v1/boards/{slug}/jobs
  "boards-api.greenhouse.io": {
    source: "greenhouse",
    slugExtractor: (path) => extractPathSegmentAfter(path, "boards"),
  },
  // Lever hosted board: jobs.lever.co/{slug}
  "jobs.lever.co": {
    source: "lever",
    slugExtractor: (path) => extractFirstPathSegment(path),
  },
  // Lever API: api.lever.co/v0/postings/{slug}
  "api.lever.co": {
    source: "lever",
    slugExtractor: (path) => extractPathSegmentAfter(path, "postings"),
  },
  // Ashby API: api.ashbyhq.com/posting-api/job-board/{slug}
  "api.ashbyhq.com": {
    source: "ashby",
    slugExtractor: (path) => extractPathSegmentAfter(path, "job-board"),
  },
  // Ashby hosted board: careers.ashbyhq.com/{slug} (primary pattern)
  "careers.ashbyhq.com": {
    source: "ashby",
    slugExtractor: (path) => extractFirstPathSegment(path),
  },
  // Ashby hosted board: jobs.ashbyhq.com/{slug} (legacy/alternate pattern)
  "jobs.ashbyhq.com": {
    source: "ashby",
    slugExtractor: (path) => extractFirstPathSegment(path),
  },
};

/**
 * Try to classify a URL as a direct ATS link. Returns the parsed (atsSource,
 * atsSlug) tuple if the URL matches a known ATS pattern, or null if it's a
 * custom URL that needs resolution.
 *
 * @example
 * parseAtsUrl("https://jobs.lever.co/acme")
 * // → { atsSource: "lever", atsSlug: "acme", url: "..." }
 *
 * parseAtsUrl("https://mystartup.com/careers")
 * // → null
 */
export function parseAtsUrl(url: string): ParsedAtsUrl | null {
  let parsed: URL;
  try {
    // Bare URLs (without protocol) need https:// prepended for URL parsing.
    // HN comments often have bare URLs like "jobs.lever.co/acme".
    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();
  const pattern = ATS_HOST_PATTERNS[hostname];
  if (!pattern) return null;

  const slug = pattern.slugExtractor(parsed.pathname);
  if (!slug) return null;

  return {
    atsSource: pattern.source,
    atsSlug: slug,
    url,
  };
}

/**
 * Classify all URLs in a text block. Returns two arrays: direct ATS URLs
 * (immediately usable) and custom URLs (need CNAME/slug-probe resolution).
 *
 * This is the primary entry point for the HN seeder's text processing phase.
 *
 * @example
 * classifyUrls("Hiring! jobs.lever.co/acme and mystartup.com/careers")
 * // → {
 * //   atsUrls: [{ atsSource: "lever", atsSlug: "acme", ... }],
 * //   customUrls: ["https://mystartup.com/careers"]
 * // }
 */
export function classifyUrls(text: string): {
  atsUrls: ParsedAtsUrl[];
  customUrls: string[];
} {
  const urls = extractUrls(text);
  const atsUrls: ParsedAtsUrl[] = [];
  const customUrls: string[] = [];

  for (const url of urls) {
    const parsed = parseAtsUrl(url);
    if (parsed) {
      atsUrls.push(parsed);
    } else {
      customUrls.push(url);
    }
  }

  return { atsUrls, customUrls };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Extract the first non-empty path segment (e.g. "/acme/jobs" → "acme"). */
function extractFirstPathSegment(pathname: string): string | null {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  return segments[0] ?? null;
}

/**
 * Extract the path segment that follows a known prefix segment.
 * E.g. extractPathSegmentAfter("/v1/boards/acme/jobs", "boards") → "acme"
 */
function extractPathSegmentAfter(
  pathname: string,
  after: string,
): string | null {
  const segments = pathname.split("/").filter((s) => s.length > 0);
  const idx = segments.indexOf(after);
  if (idx === -1 || idx + 1 >= segments.length) return null;
  return segments[idx + 1] ?? null;
}

/**
 * Extract a root domain from a URL for cross-seeder dedup.
 * E.g. "https://careers.acme.com" → "acme.com"
 *      "https://jobs.lever.co/acme" → null (ATS host, not a company domain)
 *
 * Returns null for ATS hostnames (those are not company domains).
 */
export function extractRootDomain(url: string): string | null {
  let parsed: URL;
  try {
    const normalized = url.match(/^https?:\/\//) ? url : `https://${url}`;
    parsed = new URL(normalized);
  } catch {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Don't extract root domain from ATS hosts — the slug is the company
  // identifier, not the hostname.
  if (hostname in ATS_HOST_PATTERNS) return null;

  // Strip leading "www." and known career subdomains.
  const cleaned = hostname
    .replace(/^www\./, "")
    .replace(/^(careers|jobs|hiring|join|work)\./, "");

  // Return the last two labels (e.g. "acme.com" from "careers.acme.com").
  // For co.uk etc. this is simplistic, but sufficient for dedup — the
  // poller's slug probe is the authoritative resolver.
  const labels = cleaned.split(".");
  if (labels.length < 2) return cleaned || null;
  return labels.slice(-2).join(".");
}
