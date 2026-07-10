import { ArrowLeft, Calendar, Clock, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import { CoverImage } from "@/components/blog/CoverImage";
import { Giscus } from "@/components/blog/Giscus";
import { JsonLd } from "@/components/blog/JsonLd";
import { ArticleCard } from "@/components/mdx/ArticleCard";
import { mdxComponents } from "@/components/mdx/mdx-components";
import {
  getAllPosts,
  getAllPostsMap,
  getAllSlugs,
  getPostBySlug,
  slugify,
} from "@/lib/blog/posts";
import { estimateReadTime, formatDate } from "@/lib/blog/utils";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) return {};

  const url = `https://vectormatch.dev/blog/${slug}`;

  return {
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      type: "article",
      publishedTime: post.frontmatter.publishedAt.toISOString(),
      modifiedTime: post.frontmatter.updatedAt?.toISOString(),
      authors: [post.frontmatter.author],
      tags: post.frontmatter.tags,
      images: [
        {
          url: post.frontmatter.coverImage,
          width: 1200,
          height: 630,
          alt: post.frontmatter.title,
        },
      ],
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      images: [post.frontmatter.coverImage],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
  if (!post) notFound();

  const [allPostsMap, allPosts] = await Promise.all([
    getAllPostsMap(),
    getAllPosts(),
  ]);

  // Resolve <ArticleCard slug="..." /> used inside MDX at build time (no runtime fetch).
  const components = {
    ...mdxComponents,
    ArticleCard: ({ slug: cardSlug }: { slug: string }) => (
      <ArticleCard post={allPostsMap[cardSlug]} />
    ),
  };

  const readTime = estimateReadTime(post.rawSource);
  const publishedDate = formatDate(post.frontmatter.publishedAt);
  const updatedDate = post.frontmatter.updatedAt
    ? formatDate(post.frontmatter.updatedAt)
    : null;

  const related = allPosts
    .filter((p) => {
      if (p.slug === post.slug) return false;
      const sameCategory =
        p.frontmatter.category.toLowerCase() ===
        post.frontmatter.category.toLowerCase();
      const sharedTags = p.frontmatter.tags.some((t) =>
        post.frontmatter.tags.some(
          (pt) => pt.toLowerCase() === t.toLowerCase(),
        ),
      );
      return sameCategory || sharedTags;
    })
    .slice(0, 3);

  const canonicalUrl = `https://vectormatch.dev/blog/${slug}`;

  const blogPostingSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.frontmatter.title,
    description: post.frontmatter.description,
    image: post.frontmatter.coverImage,
    datePublished: post.frontmatter.publishedAt.toISOString(),
    dateModified:
      post.frontmatter.updatedAt?.toISOString() ??
      post.frontmatter.publishedAt.toISOString(),
    author: {
      "@type": "Person",
      name: post.frontmatter.author,
    },
    keywords: post.frontmatter.tags.join(", "),
    url: canonicalUrl,
    publisher: {
      "@type": "Organization",
      name: "VectorMatch",
      logo: {
        "@type": "ImageObject",
        url: "https://vectormatch.dev/logo.png",
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://vectormatch.dev",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: "https://vectormatch.dev/blog",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.frontmatter.title,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <>
      <JsonLd data={blogPostingSchema} />
      <JsonLd data={breadcrumbSchema} />

      <main className="min-h-screen">
        <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6 lg:px-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to blog
          </Link>
        </div>

        <div className="mx-auto mt-8 max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
            <CoverImage
              src={post.frontmatter.coverImage}
              alt={post.frontmatter.title}
              sizes="(min-width: 768px) 768px, 100vw"
              priority
            />
          </div>
        </div>

        <article className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
          <Link
            href={`/blog/category/${slugify(post.frontmatter.category)}`}
            className="inline-block rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
          >
            {post.frontmatter.category}
          </Link>

          <h1 className="mt-4 font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {post.frontmatter.title}
          </h1>

          <p className="mt-3 text-lg text-muted-foreground">
            {post.frontmatter.description}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {publishedDate}
              {updatedDate && ` (updated ${updatedDate})`}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {readTime} min read
            </span>
            <span className="font-medium text-foreground">
              {post.frontmatter.author}
            </span>
          </div>

          {post.frontmatter.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {post.frontmatter.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/blog/tag/${slugify(tag)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                </Link>
              ))}
            </div>
          )}

          <hr className="mt-8 border-border" />

          <div className="prose prose-lg prose-invert mt-8 max-w-none">
            <MDXRemote
              source={post.rawSource}
              components={components}
              options={{ blockJS: false }}
            />
          </div>
        </article>

        {related.length > 0 && (
          <section className="border-t border-border bg-card/30">
            <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
              <h2 className="font-serif text-2xl font-bold text-foreground">
                Related Posts
              </h2>
              <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((rp) => (
                  <ArticleCard key={rp.slug} post={rp} />
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:px-8">
          <Giscus />
        </div>
      </main>
    </>
  );
}
