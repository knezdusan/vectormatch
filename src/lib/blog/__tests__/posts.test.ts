import { describe, expect, it, vi } from "vitest";

// posts.ts imports next/cache, whose directives are no-ops under happy-dom.
// (`server-only` is aliased to a stub in vitest.config.mts.)
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import {
  getAllPosts,
  getAllSlugs,
  getPostBySlug,
  getPostsByCategory,
  getPostsByTag,
  slugify,
} from "@/lib/blog/posts";
import {
  BLOG_CATEGORIES,
  BLOG_TAGS,
  isValidCategory,
  isValidTag,
} from "@/lib/blog/taxonomy";
import { PostFrontmatterSchema } from "@/lib/blog/types";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("ATS & Hiring Systems")).toBe("ats-hiring-systems");
    expect(slugify("Job Search Strategy")).toBe("job-search-strategy");
  });

  it("collapses non-alphanumeric runs and trims edge hyphens", () => {
    expect(slugify("  Node.js & React!! ")).toBe("node-js-react");
    expect(slugify("C++ / Rust")).toBe("c-rust");
  });

  it("is idempotent on already-slugified input", () => {
    expect(slugify("ats-hiring-systems")).toBe("ats-hiring-systems");
  });
});

// ---------------------------------------------------------------------------
// Taxonomy validation
// ---------------------------------------------------------------------------

describe("taxonomy", () => {
  it("exports a non-empty closed set of categories", () => {
    expect(BLOG_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("exports a non-empty closed set of tags", () => {
    expect(BLOG_TAGS.length).toBeGreaterThan(0);
  });

  it("no tag label duplicates a category label", () => {
    for (const tag of BLOG_TAGS) {
      expect(BLOG_CATEGORIES).not.toContain(tag);
    }
  });

  it("isValidCategory returns true for known categories", () => {
    expect(isValidCategory("ATS & Hiring Systems")).toBe(true);
    expect(isValidCategory("Market Intelligence")).toBe(true);
  });

  it("isValidCategory returns false for unknown categories", () => {
    expect(isValidCategory("ATS Guides")).toBe(false);
    expect(isValidCategory("Career Strategy")).toBe(false);
    expect(isValidCategory("")).toBe(false);
  });

  it("isValidTag returns true for known tags", () => {
    expect(isValidTag("React")).toBe(true);
    expect(isValidTag("Greenhouse")).toBe(true);
    expect(isValidTag("ATS")).toBe(true);
  });

  it("isValidTag returns false for unknown tags", () => {
    expect(isValidTag("Career Strategy")).toBe(false);
    expect(isValidTag("Job Search")).toBe(false);
    expect(isValidTag("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PostFrontmatterSchema — taxonomy enforcement + length bounds
// ---------------------------------------------------------------------------

describe("PostFrontmatterSchema", () => {
  const valid = {
    title: "Hello",
    description: "A post",
    publishedAt: "2026-01-01",
    author: "VectorMatch Team",
    tags: ["ATS"],
    coverImage: "/assets/blog/x.jpg",
    category: "ATS & Hiring Systems",
  };

  it("accepts valid frontmatter and coerces the date", () => {
    const parsed = PostFrontmatterSchema.parse(valid);
    expect(parsed.publishedAt).toBeInstanceOf(Date);
    // featured defaults to false when omitted
    expect(parsed.featured).toBe(false);
    // draft defaults to false when omitted
    expect(parsed.draft).toBe(false);
  });

  it("rejects frontmatter missing required fields", () => {
    const { title: _title, ...withoutTitle } = valid;
    expect(PostFrontmatterSchema.safeParse(withoutTitle).success).toBe(false);
  });

  it("rejects a non-array tags value", () => {
    expect(
      PostFrontmatterSchema.safeParse({ ...valid, tags: "ATS" }).success,
    ).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      category: "ATS Guides",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown tag", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      tags: ["ATS", "Career Strategy"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts all valid tags from the taxonomy", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      tags: ["React", "Next.js", "TypeScript"],
      category: "Market Intelligence",
    });
    expect(result.success).toBe(true);
  });

  it("rejects more than 6 tags", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      tags: [
        "ATS",
        "React",
        "Next.js",
        "TypeScript",
        "Greenhouse",
        "Lever",
        "Ashby",
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero tags", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      tags: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a title longer than 70 characters", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      title: "A".repeat(71),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a description longer than 170 characters", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      description: "A".repeat(171),
    });
    expect(result.success).toBe(false);
  });

  it("accepts draft: true", () => {
    const result = PostFrontmatterSchema.safeParse({
      ...valid,
      draft: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.draft).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Post queries (reads real src/app/(public)/blog/_posts MDX)
// ---------------------------------------------------------------------------

describe("post queries (reads real src/app/(public)/blog/_posts MDX)", () => {
  it("returns posts sorted by publishedAt descending", async () => {
    const posts = await getAllPosts();
    expect(posts.length).toBeGreaterThan(0);
    for (let i = 1; i < posts.length; i++) {
      expect(
        posts[i - 1].frontmatter.publishedAt.getTime(),
      ).toBeGreaterThanOrEqual(posts[i].frontmatter.publishedAt.getTime());
    }
  });

  it("resolves a post by slug and returns undefined for unknown slugs", async () => {
    const slugs = await getAllSlugs();
    const first = await getPostBySlug(slugs[0]);
    expect(first?.slug).toBe(slugs[0]);
    expect(await getPostBySlug("does-not-exist")).toBeUndefined();
  });

  it("filters by category and tag using slug equality", async () => {
    const posts = await getAllPosts();
    const sampleCategory = posts[0].frontmatter.category;
    const byCategory = await getPostsByCategory(slugify(sampleCategory));
    expect(byCategory.length).toBeGreaterThan(0);
    expect(
      byCategory.every(
        (p) => slugify(p.frontmatter.category) === slugify(sampleCategory),
      ),
    ).toBe(true);

    const sampleTag = posts[0].frontmatter.tags[0];
    const byTag = await getPostsByTag(slugify(sampleTag));
    expect(byTag.length).toBeGreaterThan(0);
  });

  it("all seed posts use valid taxonomy values", async () => {
    const posts = await getAllPosts();
    for (const post of posts) {
      expect(isValidCategory(post.frontmatter.category)).toBe(true);
      for (const tag of post.frontmatter.tags) {
        expect(isValidTag(tag)).toBe(true);
      }
      // No tag should equal the category label
      expect(post.frontmatter.tags).not.toContain(post.frontmatter.category);
    }
  });
});
