/**
 * Unit tests for the HN Algolia seeder orchestrator (TDD §4.1.2).
 *
 * Tests the `processHnHits` function (pure domain logic, no network) and the
 * `runHnAlgoliaSeeder` function (with mocked fetch). The DB insert is mocked
 * to avoid requiring a live database connection.
 */

import { vi } from "vitest";

// Mock the company-repository module so we don't hit the real database.
vi.mock("@/lib/jobs/seeders/company-repository", () => ({
  insertDiscoveredCompanies: vi.fn().mockResolvedValue({
    inserted: 0,
    skipped: 0,
    rejected: [],
  }),
}));

import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import { processHnHits } from "@/lib/jobs/seeders/hn-algolia";
import type { HnAlgoliaHit } from "@/lib/jobs/seeders/hn-schemas";

// ── Test fixtures ────────────────────────────────────────────────────────────

const commentWithLeverUrl: HnAlgoliaHit = {
  objectID: "c1",
  author: "acme_recruiter",
  comment_text:
    "We're hiring! Senior Frontend Engineer. Apply at jobs.lever.co/acme",
  title: "Ask HN: Who is hiring? (January 2024)",
  created_at: "2024-01-15T10:00:00Z",
  story_id: 10000,
};

const commentWithGreenhouseUrl: HnAlgoliaHit = {
  objectID: "c2",
  author: "foobar_cto",
  comment_text:
    "foobar is hiring. Check boards.greenhouse.io/foobar for our open roles.",
  title: "Ask HN: Who is hiring? (January 2024)",
  created_at: "2024-01-15T11:00:00Z",
  story_id: 10000,
};

const commentWithCustomUrl: HnAlgoliaHit = {
  objectID: "c3",
  author: "startup_dev",
  comment_text: "My startup is hiring! See mystartup.com/careers",
  title: "Ask HN: Who is hiring? (January 2024)",
  created_at: "2024-01-15T12:00:00Z",
  story_id: 10000,
};

const commentWithMultipleUrls: HnAlgoliaHit = {
  objectID: "c4",
  author: "multi_company",
  comment_text:
    "We use both boards.greenhouse.io/acme-eng and jobs.lever.co/acme-sales",
  title: "Ask HN: Who is hiring? (January 2024)",
  created_at: "2024-01-15T13:00:00Z",
  story_id: 10000,
};

const storyHit: HnAlgoliaHit = {
  objectID: "10000",
  author: "dang",
  story_text: "Ask HN: Who is hiring? Please post job listings here.",
  title: "Ask HN: Who is hiring? (January 2024)",
  created_at: "2024-01-01T00:00:00Z",
};

const commentWithNoUrls: HnAlgoliaHit = {
  objectID: "c5",
  author: "curious_dev",
  comment_text: "Any remote opportunities for junior developers?",
  title: "Ask HN: Who is hiring? (January 2024)",
  created_at: "2024-01-15T14:00:00Z",
  story_id: 10000,
};

// ── processHnHits ────────────────────────────────────────────────────────────

describe("processHnHits", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(insertDiscoveredCompanies).mockResolvedValue({
      inserted: 0,
      skipped: 0,
      rejected: [],
    });
  });

  it("processes comments with ATS URLs and extracts companies", async () => {
    const result = await processHnHits([
      storyHit,
      commentWithLeverUrl,
      commentWithGreenhouseUrl,
    ]);

    expect(result.commentsProcessed).toBe(2); // 2 comments (story excluded)
    expect(result.atsUrlsFound).toBe(2);
    expect(result.customUrls).toHaveLength(0);
    expect(result.uniqueCompanies).toBe(2);
  });

  it("separates custom URLs from ATS URLs", async () => {
    const result = await processHnHits([
      commentWithLeverUrl,
      commentWithCustomUrl,
    ]);

    expect(result.atsUrlsFound).toBe(1);
    expect(result.customUrlsFound).toBe(1);
    expect(result.customUrls).toContain("https://mystartup.com/careers");
  });

  it("deduplicates ATS URLs within the batch (same slug from multiple comments)", async () => {
    const comment1: HnAlgoliaHit = {
      ...commentWithLeverUrl,
      objectID: "c1a",
    };
    const comment2: HnAlgoliaHit = {
      ...commentWithLeverUrl,
      objectID: "c1b",
    };

    const result = await processHnHits([comment1, comment2]);

    expect(result.atsUrlsFound).toBe(2); // Two URLs found
    expect(result.uniqueCompanies).toBe(1); // But only 1 unique company
  });

  it("handles a company with multiple ATS sources (Greenhouse + Lever)", async () => {
    const result = await processHnHits([commentWithMultipleUrls]);

    expect(result.atsUrlsFound).toBe(2);
    expect(result.uniqueCompanies).toBe(2); // Different (source, slug) pairs
  });

  it("skips story hits (only processes comments)", async () => {
    const result = await processHnHits([storyHit]);
    expect(result.commentsProcessed).toBe(0);
    expect(result.atsUrlsFound).toBe(0);
  });

  it("handles comments with no URLs", async () => {
    const result = await processHnHits([commentWithNoUrls]);
    expect(result.commentsProcessed).toBe(1);
    expect(result.atsUrlsFound).toBe(0);
    expect(result.customUrlsFound).toBe(0);
  });

  it("handles empty hits array", async () => {
    const result = await processHnHits([]);
    expect(result.commentsProcessed).toBe(0);
    expect(result.atsUrlsFound).toBe(0);
    expect(result.insertResult.inserted).toBe(0);
  });

  it("calls insertDiscoveredCompanies with the extracted companies", async () => {
    await processHnHits([commentWithLeverUrl, commentWithGreenhouseUrl]);

    expect(insertDiscoveredCompanies).toHaveBeenCalledTimes(1);
    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg).toHaveLength(2);
    expect(callArg).toContainEqual({
      atsSlug: "acme",
      atsSource: "lever",
      discoverySource: "hn_algolia",
      discoveryContext: "https://news.ycombinator.com/item?id=c1",
    });
  });

  it("builds discoveryContext from the HN comment URL", async () => {
    const commentWithExplicitUrl: HnAlgoliaHit = {
      ...commentWithLeverUrl,
      url: "https://news.ycombinator.com/item?id=99999",
    };

    await processHnHits([commentWithExplicitUrl]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoveryContext).toBe(
      "https://news.ycombinator.com/item?id=99999",
    );
  });

  it("falls back to objectID-based URL when url field is absent", async () => {
    await processHnHits([commentWithLeverUrl]);

    const callArg = vi.mocked(insertDiscoveredCompanies).mock.calls[0][0];
    expect(callArg[0].discoveryContext).toBe(
      "https://news.ycombinator.com/item?id=c1",
    );
  });
});
