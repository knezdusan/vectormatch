import { Calendar, Clock, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CoverImage } from "@/components/blog/CoverImage";
import {
  getAllCategories,
  getPostsByCategory,
  slugify,
} from "@/lib/blog/posts";
import { estimateReadTime, formatDate } from "@/lib/blog/utils";
import { SITE_URL } from "@/lib/site";

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  const categories = await getAllCategories();
  return categories.map((category) => ({ category: slugify(category) }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { category } = await params;
  const categories = await getAllCategories();
  const displayName =
    categories.find((c) => slugify(c) === category) ?? category;

  const url = `${SITE_URL}/blog/category/${category}`;

  return {
    title: `${displayName} — VectorMatch Blog`,
    description:
      "Browse all VectorMatch blog posts in the " +
      displayName +
      " category. Insights for web developers navigating the hidden job market.",
    alternates: { canonical: url },
    openGraph: {
      title: `${displayName} — VectorMatch Blog`,
      description:
        "Browse all VectorMatch blog posts in the " +
        displayName +
        " category. Insights for web developers navigating the hidden job market.",
      type: "website",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title: `${displayName} — VectorMatch Blog`,
      description: `Browse all VectorMatch blog posts in the ${displayName} category.`,
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const [posts, categories] = await Promise.all([
    getPostsByCategory(category),
    getAllCategories(),
  ]);

  if (posts.length === 0) notFound();

  const displayName = posts[0].frontmatter.category;

  return (
    <main className="min-h-screen">
      <section className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <Link
            href="/blog"
            className="text-sm text-muted-foreground transition-colors hover:text-primary"
          >
            &larr; All posts
          </Link>
          <h1 className="mt-2 font-serif text-3xl font-bold text-foreground sm:text-4xl">
            {displayName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {posts.length} {posts.length === 1 ? "post" : "posts"} in this
            category
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-6 sm:grid-cols-2">
            {posts.map((post) => (
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

          <aside>
            <div>
              <h3 className="font-serif text-lg font-semibold text-foreground">
                All Categories
              </h3>
              <ul className="mt-3 space-y-1.5">
                {categories.map((cat) => (
                  <li key={cat}>
                    <Link
                      href={`/blog/category/${slugify(cat)}`}
                      className={
                        "text-sm transition-colors hover:text-primary " +
                        (slugify(cat) === category
                          ? "font-medium text-primary"
                          : "text-muted-foreground")
                      }
                    >
                      {cat}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
