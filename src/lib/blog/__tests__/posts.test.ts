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
import { PostFrontmatterSchema } from "@/lib/blog/types";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("ATS Guides")).toBe("ats-guides");
    expect(slugify("Career Strategy")).toBe("career-strategy");
  });

  it("collapses non-alphanumeric runs and trims edge hyphens", () => {
    expect(slugify("  Node.js & React!! ")).toBe("node-js-react");
    expect(slugify("C++ / Rust")).toBe("c-rust");
  });

  it("is idempotent on already-slugified input", () => {
    expect(slugify("ats-guides")).toBe("ats-guides");
  });
});

describe("PostFrontmatterSchema", () => {
  const valid = {
    title: "Hello",
    description: "A post",
    publishedAt: "2026-01-01",
    author: "VectorMatch Team",
    tags: ["ATS"],
    coverImage: "/assets/blog/x.jpg",
    category: "ATS Guides",
  };

  it("accepts valid frontmatter and coerces the date", () => {
    const parsed = PostFrontmatterSchema.parse(valid);
    expect(parsed.publishedAt).toBeInstanceOf(Date);
    // featured defaults to false when omitted
    expect(parsed.featured).toBe(false);
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
});

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
});
