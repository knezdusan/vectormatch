import { Calendar, Clock, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CoverImage } from "@/components/blog/CoverImage";
import { JsonLd } from "@/components/blog/JsonLd";
import { ArticleCard } from "@/components/mdx/ArticleCard";
import {
  getAllCategories,
  getAllPosts,
  getAllTags,
  getFeaturedPosts,
  slugify,
} from "@/lib/blog/posts";
import { estimateReadTime, formatDate } from "@/lib/blog/utils";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "VectorMatch Blog",
  description:
    "Insights, guides, and deep dives for web developers navigating the hidden job market. Learn how to pitch directly, master ATS systems, and land better opportunities.",
  alternates: {
    canonical: `${SITE_URL}/blog`,
  },
  openGraph: {
    title: "VectorMatch Blog",
    description:
      "Insights, guides, and deep dives for web developers navigating the hidden job market. Learn how to pitch directly, master ATS systems, and land better opportunities.",
    type: "website",
    url: `${SITE_URL}/blog`,
  },
  twitter: {
    card: "summary_large_image",
    title: "VectorMatch Blog",
    description:
      "Insights, guides, and deep dives for web developers navigating the hidden job market.",
  },
};

export default async function BlogIndexPage() {
  const [posts, featured, categories, tags] = await Promise.all([
    getAllPosts(),
    getFeaturedPosts(),
    getAllCategories(),
    getAllTags(),
  ]);

  const latest =
    featured.length > 0
      ? posts.filter((p) => !featured.some((f) => f.slug === p.slug))
      : posts;

  const blogSchema = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "VectorMatch Blog",
    url: `${SITE_URL}/blog`,
    description:
      "Insights, guides, and deep dives for web developers navigating the hidden job market.",
    publisher: {
      "@type": "Organization",
      name: "VectorMatch",
      url: SITE_URL,
    },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.frontmatter.title,
      url: `${SITE_URL}/blog/${post.slug}`,
      datePublished: post.frontmatter.publishedAt.toISOString(),
      dateModified:
        post.frontmatter.updatedAt?.toISOString() ??
        post.frontmatter.publishedAt.toISOString(),
      author: {
        "@type": "Person",
        name: post.frontmatter.author,
      },
    })),
  };

  return (
    <main className="min-h-screen">
      <JsonLd data={blogSchema} />
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h1 className="font-serif text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            VectorMatch Blog
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Insights, guides, and deep dives for web developers navigating the
            hidden job market. Learn how to pitch directly, master ATS systems,
            and land better opportunities.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_300px]">
          <div className="space-y-12">
            {featured.length > 0 && (
              <section>
                <h2 className="font-serif text-2xl font-bold text-foreground">
                  Featured
                </h2>
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  {featured.map((post) => (
                    <ArticleCard key={post.slug} post={post} />
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="font-serif text-2xl font-bold text-foreground">
                Latest
              </h2>
              {latest.length === 0 ? (
                <p className="mt-6 text-muted-foreground">
                  No posts yet. Check back soon.
                </p>
              ) : (
                <div className="mt-6 grid gap-6 sm:grid-cols-2">
                  {latest.map((post) => (
                    <Link
                      key={post.slug}
                      href={`/blog/${post.slug}`}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
                    >
                      <div className="relative aspect-video w-full overflow-hidden bg-muted">
                        <CoverImage
                          src={post.frontmatter.coverImage}
                          alt={post.frontmatter.title}
                          className="transition-transform duration-300 group-hover:scale-105"
                          sizes="(min-width: 640px) 50vw, 100vw"
                        />
                      </div>
                      <div className="flex flex-1 flex-col p-5">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(post.frontmatter.publishedAt)}
                          </span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" />
                            {estimateReadTime(post.rawSource)} min read
                          </span>
                        </div>
                        <h3 className="mt-2 line-clamp-2 font-serif text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                          {post.frontmatter.title}
                        </h3>
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                          {post.frontmatter.description}
                        </p>
                        {post.frontmatter.tags.length > 0 && (
                          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                            {post.frontmatter.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                              >
                                <Tag className="h-3 w-3" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <aside className="space-y-8">
            {categories.length > 0 && (
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  Categories
                </h3>
                <ul className="mt-3 space-y-1.5">
                  {categories.map((category) => (
                    <li key={category}>
                      <Link
                        href={`/blog/category/${slugify(category)}`}
                        className="text-sm text-muted-foreground transition-colors hover:text-primary"
                      >
                        {category}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tags.length > 0 && (
              <div>
                <h3 className="font-serif text-lg font-semibold text-foreground">
                  Tags
                </h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <Link
                      key={tag}
                      href={`/blog/tag/${slugify(tag)}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                    >
                      <Tag className="h-3 w-3" />
                      {tag}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
