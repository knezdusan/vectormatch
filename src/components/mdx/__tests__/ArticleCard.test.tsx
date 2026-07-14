import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArticleCard } from "@/components/mdx/ArticleCard";
import type { Post } from "@/lib/blog/types";

const post: Post = {
  slug: "how-greenhouse-works",
  rawSource: "body",
  frontmatter: {
    title: "How Greenhouse Works",
    description: "An insider look at the ATS.",
    publishedAt: new Date("2026-01-01"),
    author: "VectorMatch Team",
    tags: ["ATS"],
    featured: false,
    coverImage: "/assets/blog/greenhouse.jpg",
    category: "ATS & Hiring Systems",
    draft: false,
  },
};

describe("ArticleCard", () => {
  it("renders the resolved post as a link to its slug", () => {
    render(<ArticleCard post={post} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/blog/how-greenhouse-works");
    expect(screen.getByText("How Greenhouse Works")).toBeInTheDocument();
    expect(screen.getByText("An insider look at the ATS.")).toBeInTheDocument();
  });

  it("renders nothing when the post is unresolved (unknown slug)", () => {
    const { container } = render(<ArticleCard post={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
