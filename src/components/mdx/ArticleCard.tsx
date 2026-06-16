import Link from "next/link";
import type { Post } from "@/lib/blog/types";

export function ArticleCard({ post }: { post?: Post }) {
  if (!post) return null;

  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40"
    >
      <div className="aspect-video w-full overflow-hidden bg-muted">
        <img
          src={post.frontmatter.coverImage}
          alt={post.frontmatter.title}
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      </div>
      <div className="p-4">
        <h4 className="line-clamp-2 text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
          {post.frontmatter.title}
        </h4>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {post.frontmatter.description}
        </p>
      </div>
    </Link>
  );
}
