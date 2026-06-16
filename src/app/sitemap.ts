import type { MetadataRoute } from "next";
import { getAllPosts, slugify } from "@/lib/blog/posts";
import { SITE_URL } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await getAllPosts();

  const blogUrls: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: post.frontmatter.updatedAt ?? post.frontmatter.publishedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const categoryUrls: MetadataRoute.Sitemap = [
    ...new Set(posts.map((p) => p.frontmatter.category)),
  ].map((category) => ({
    url: `${SITE_URL}/blog/category/${slugify(category)}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  const tagUrls: MetadataRoute.Sitemap = [
    ...new Set(posts.flatMap((p) => p.frontmatter.tags)),
  ].map((tag) => ({
    url: `${SITE_URL}/blog/tag/${slugify(tag)}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...blogUrls,
    ...categoryUrls,
    ...tagUrls,
  ];
}
