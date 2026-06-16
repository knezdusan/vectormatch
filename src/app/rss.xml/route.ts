import { getAllPosts } from "@/lib/blog/posts";
import { SITE_URL } from "@/lib/site";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const posts = await getAllPosts();

  const items = posts
    .map((post) => {
      const url = `${SITE_URL}/blog/${post.slug}`;
      const pubDate = post.frontmatter.publishedAt.toUTCString();
      const coverImage = post.frontmatter.coverImage.startsWith("http")
        ? post.frontmatter.coverImage
        : `${SITE_URL}${post.frontmatter.coverImage}`;
      const imageType = coverImage.endsWith(".svg")
        ? "image/svg+xml"
        : coverImage.endsWith(".png")
          ? "image/png"
          : "image/jpeg";

      return [
        "    <item>",
        `      <title>${escapeXml(post.frontmatter.title)}</title>`,
        `      <description>${escapeXml(post.frontmatter.description)}</description>`,
        `      <link>${escapeXml(url)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <author>${escapeXml(post.frontmatter.author)}</author>`,
        `      <category>${escapeXml(post.frontmatter.category)}</category>`,
        `      <enclosure url="${escapeXml(coverImage)}" type="${imageType}" />`,
        ...post.frontmatter.tags.map(
          (tag) => `      <category>${escapeXml(tag)}</category>`,
        ),
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const rss = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    "    <title>VectorMatch Blog</title>",
    `    <link>${SITE_URL}/blog</link>`,
    "    <description>Insights, guides, and deep dives for web developers navigating the hidden job market.</description>",
    "    <language>en-us</language>",
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}/rss.xml" rel="self" type="application/rss+xml" />`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return new Response(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
