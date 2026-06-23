/**
 * Unit tests for the HN Algolia Zod schemas (TDD §4.1.2, §4.2.3).
 *
 * Validates the defensive schemas against the actual HN Algolia API response
 * shape. Uses safeParse — the pipeline never crashes on a bad response.
 */

import {
  hnAlgoliaHitSchema,
  hnAlgoliaResponseSchema,
} from "@/lib/jobs/seeders/hn-schemas";

// ── hnAlgoliaHitSchema ───────────────────────────────────────────────────────

describe("hnAlgoliaHitSchema", () => {
  const validCommentHit = {
    objectID: "12345",
    author: "acme_recruiter",
    comment_text: "We're hiring! See jobs.lever.co/acme",
    title: "Ask HN: Who is hiring? (January 2024)",
    created_at: "2024-01-15T10:00:00Z",
    story_id: 10000,
    created_at_i: 1705312802,
  };

  const validStoryHit = {
    objectID: "10000",
    author: "dang",
    story_text: "Ask HN: Who is hiring? Please post job listings here.",
    title: "Ask HN: Who is hiring? (January 2024)",
    created_at: "2024-01-01T00:00:00Z",
  };

  it("parses a valid comment hit", () => {
    const result = hnAlgoliaHitSchema.safeParse(validCommentHit);
    expect(result.success).toBe(true);
  });

  it("parses a valid story hit (no comment_text)", () => {
    const result = hnAlgoliaHitSchema.safeParse(validStoryHit);
    expect(result.success).toBe(true);
  });

  it("allows extra fields (passthrough — _highlightResult, _tags, etc.)", () => {
    const result = hnAlgoliaHitSchema.safeParse({
      ...validCommentHit,
      _highlightResult: { author: { value: "acme_recruiter" } },
      _tags: ["comment", "author_acme_recruiter", "story_10000"],
      children: [12346, 12347],
    });
    expect(result.success).toBe(true);
  });

  it("fails when objectID is missing", () => {
    const result = hnAlgoliaHitSchema.safeParse({
      author: "test",
      created_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("fails when author is missing", () => {
    const result = hnAlgoliaHitSchema.safeParse({
      objectID: "1",
      created_at: "2024-01-01T00:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("fails when created_at is missing", () => {
    const result = hnAlgoliaHitSchema.safeParse({
      objectID: "1",
      author: "test",
    });
    expect(result.success).toBe(false);
  });

  it("does not throw on malformed input (safeParse contract)", () => {
    expect(() => hnAlgoliaHitSchema.safeParse(null)).not.toThrow();
    expect(() => hnAlgoliaHitSchema.safeParse("string")).not.toThrow();
    expect(() => hnAlgoliaHitSchema.safeParse(42)).not.toThrow();
  });
});

// ── hnAlgoliaResponseSchema ──────────────────────────────────────────────────

describe("hnAlgoliaResponseSchema", () => {
  const validResponse = {
    hits: [
      {
        objectID: "1",
        author: "user1",
        comment_text: "Hiring at jobs.lever.co/acme",
        created_at: "2024-01-15T10:00:00Z",
      },
    ],
    nbHits: 500,
    page: 0,
    nbPages: 10,
    hitsPerPage: 50,
  };

  it("parses a valid response", () => {
    const result = hnAlgoliaResponseSchema.safeParse(validResponse);
    expect(result.success).toBe(true);
  });

  it("parses a response with empty hits", () => {
    const result = hnAlgoliaResponseSchema.safeParse({
      hits: [],
      nbHits: 0,
      page: 0,
      nbPages: 0,
      hitsPerPage: 50,
    });
    expect(result.success).toBe(true);
  });

  it("allows extra top-level fields (passthrough)", () => {
    const result = hnAlgoliaResponseSchema.safeParse({
      ...validResponse,
      exhaustive: { nbHits: false, typo: false },
      processingTimeMS: 44,
      query: "Ask HN Who is hiring",
    });
    expect(result.success).toBe(true);
  });

  it("fails when hits is missing", () => {
    const result = hnAlgoliaResponseSchema.safeParse({
      nbHits: 0,
      page: 0,
      nbPages: 0,
      hitsPerPage: 50,
    });
    expect(result.success).toBe(false);
  });

  it("fails when pagination fields are missing", () => {
    const result = hnAlgoliaResponseSchema.safeParse({
      hits: [],
    });
    expect(result.success).toBe(false);
  });

  it("does not throw on malformed input (safeParse contract)", () => {
    expect(() => hnAlgoliaResponseSchema.safeParse(null)).not.toThrow();
    expect(() => hnAlgoliaResponseSchema.safeParse("string")).not.toThrow();
  });
});
