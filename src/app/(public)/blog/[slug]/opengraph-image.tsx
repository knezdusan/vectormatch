import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { getAllSlugs, getPostBySlug } from "@/lib/blog/posts";

export const alt = "VectorMatch Blog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function BlogPostOGImage({ params }: Props) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) {
    return new ImageResponse(<div style={{ display: "flex" }} />, size);
  }

  const logoBuffer = await readFile(
    join(process.cwd(), "public", "web-app-manifest-512x512.png"),
  );
  const logoSrc = `data:image/png;base64,${logoBuffer.toString("base64")}`;

  const title = post.frontmatter.title;
  const category = post.frontmatter.category;
  const description = post.frontmatter.description;

  // Truncate title for the image canvas — keep it readable at 1200px wide.
  const maxTitleChars = 75;
  const displayTitle =
    title.length > maxTitleChars
      ? `${title.slice(0, maxTitleChars).trimEnd()}…`
      : title;

  // Truncate description to ~140 chars for the subtitle line.
  const maxDescChars = 140;
  const displayDesc =
    description.length > maxDescChars
      ? `${description.slice(0, maxDescChars).trimEnd()}…`
      : description;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background:
          "radial-gradient(circle at 32% 35%, rgba(126, 58, 242, 0.35) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(192, 38, 211, 0.25) 0%, transparent 50%), #16161e",
        padding: 80,
        fontFamily: "sans-serif",
      }}
    >
      {/* Header: logo + brand name */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        {/* biome-ignore lint/performance/noImgElement: <img> is required inside Next.js ImageResponse to embed a local icon. */}
        <img
          src={logoSrc}
          width={48}
          height={48}
          alt=""
          style={{ borderRadius: 12 }}
        />
        <span
          style={{
            fontSize: 26,
            fontWeight: 700,
            color: "#fafafa",
            letterSpacing: "-0.02em",
          }}
        >
          VectorMatch
        </span>
      </div>

      {/* Body: category pill + title + description */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "8px 18px",
            borderRadius: 999,
            background: "rgba(168, 85, 247, 0.15)",
            border: "1px solid rgba(168, 85, 247, 0.3)",
            fontSize: 20,
            color: "#c084fc",
            fontWeight: 600,
            alignSelf: "flex-start",
          }}
        >
          {category}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 800,
            lineHeight: 1.15,
            letterSpacing: "-0.03em",
            color: "#fafafa",
            maxWidth: 1000,
          }}
        >
          {displayTitle}
        </div>

        <div
          style={{
            display: "flex",
            fontSize: 26,
            color: "#a1a1aa",
            maxWidth: 950,
            lineHeight: 1.4,
          }}
        >
          {displayDesc}
        </div>
      </div>

      {/* Footer: domain */}
      <div
        style={{
          display: "flex",
          fontSize: 22,
          color: "#71717a",
          fontWeight: 500,
        }}
      >
        vectormatch.dev/blog
      </div>
    </div>,
    { ...size },
  );
}
