import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { cacheLife, cacheTag } from "next/cache";
import { type Post, PostFrontmatterSchema } from "./types";

const POSTS_DIR = path.join(
  process.cwd(),
  "src",
  "app",
  "(public)",
  "blog",
  "_posts",
);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function getAllPostsRaw(): Promise<Post[]> {
  const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith(".mdx"));
  const isDev = process.env.NODE_ENV === "development";
  const now = Date.now();

  const posts: Post[] = [];

  for (const file of files) {
    const slug = file.replace(/\.mdx$/, "");
    const filePath = path.join(POSTS_DIR, file);
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);

    const result = PostFrontmatterSchema.safeParse(data);
    if (!result.success) {
      console.warn(
        `Skipping ${file}: invalid frontmatter - ${result.error.message}`,
      );
      continue;
    }

    // Hide drafts and future-dated posts in production builds.
    // In development they are visible for previewing.
    if (!isDev) {
      if (result.data.draft) continue;
      if (new Date(result.data.publishedAt).getTime() > now) continue;
    }

    posts.push({
      slug,
      frontmatter: result.data,
      rawSource: content,
    });
  }

  return posts.sort(
    (a, b) =>
      new Date(b.frontmatter.publishedAt).getTime() -
      new Date(a.frontmatter.publishedAt).getTime(),
  );
}

export async function getAllPosts(): Promise<Post[]> {
  "use cache";
  cacheLife("max");
  cacheTag("blog-posts");
  return getAllPostsRaw();
}

export async function getPostBySlug(slug: string): Promise<Post | undefined> {
  const posts = await getAllPosts();
  return posts.find((p) => p.slug === slug);
}

export async function getAllSlugs(): Promise<string[]> {
  const posts = await getAllPosts();
  return posts.map((p) => p.slug);
}

export async function getAllCategories(): Promise<string[]> {
  const posts = await getAllPosts();
  return [...new Set(posts.map((p) => p.frontmatter.category))];
}

export async function getAllTags(): Promise<string[]> {
  const posts = await getAllPosts();
  return [...new Set(posts.flatMap((p) => p.frontmatter.tags))];
}

export async function getPostsByCategory(
  categorySlug: string,
): Promise<Post[]> {
  const posts = await getAllPosts();
  return posts.filter(
    (p) => slugify(p.frontmatter.category) === slugify(categorySlug),
  );
}

export async function getPostsByTag(tagSlug: string): Promise<Post[]> {
  const posts = await getAllPosts();
  return posts.filter((p) =>
    p.frontmatter.tags.some((t) => slugify(t) === slugify(tagSlug)),
  );
}

export async function getFeaturedPosts(): Promise<Post[]> {
  const posts = await getAllPosts();
  return posts.filter((p) => p.frontmatter.featured);
}

export async function getAllPostsMap(): Promise<Record<string, Post>> {
  const posts = await getAllPosts();
  return Object.fromEntries(posts.map((p) => [p.slug, p]));
}

export { getAllPostsRaw };
