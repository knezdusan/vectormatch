/**
 * Closed vocabulary for blog categories and tags.
 *
 * This is the single source of truth for the blog taxonomy. The
 * PostFrontmatterSchema in types.ts enforces that every post's
 * `category` and `tags` come from these lists — unknown values fail
 * the build.
 *
 * Design principles:
 * - Categories are broad content pillars (exactly one per post).
 * - Tags are cross-cutting, reusable topics (1-6 per post).
 * - No tag label duplicates a category label (the two axes are distinct).
 * - Slug derivation uses the shared slugify() from posts.ts so URLs
 *   are stable and consistent across all routes.
 */

// ---------------------------------------------------------------------------
// Categories — broad content pillars, mission-aligned
// ---------------------------------------------------------------------------

export const BLOG_CATEGORIES = [
  "ATS & Hiring Systems",
  "Job Search Strategy",
  "Remote & Global Work",
  "Developer Career Growth",
  "Market Intelligence",
  "Product & Engineering",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const CATEGORY_DESCRIPTIONS: Record<BlogCategory, string> = {
  "ATS & Hiring Systems":
    "How Greenhouse, Lever, Ashby, Workday, and other Applicant Tracking Systems actually rank and filter candidates — and how to use that knowledge to your advantage.",
  "Job Search Strategy":
    "Tactics for standing out in a saturated market: direct pitching, bypassing HR bottlenecks, and finding hidden opportunities before the crowd.",
  "Remote & Global Work":
    "Remote-first roles, work authorization, compliance (W-8BEN, B2B, EU Blue Card), and navigating international contractor arrangements.",
  "Developer Career Growth":
    "Skills, positioning, salary negotiation, seniority progression, and building a credible developer profile.",
  "Market Intelligence":
    "Data-driven analysis of the developer job market: which skills are rising, which are fading, and where the demand actually lives.",
  "Product & Engineering":
    "Behind-the-scenes at VectorMatch: how the 3-Gate matching funnel works, engineering decisions, and product philosophy.",
};

// ---------------------------------------------------------------------------
// Tags — cross-cutting, reusable topics
// ---------------------------------------------------------------------------

export const BLOG_TAGS = [
  // Technologies
  "React",
  "Next.js",
  "TypeScript",
  "Tailwind CSS",
  "GraphQL",
  "Node.js",
  "Vue",
  "Angular",
  "PHP",
  "Laravel",
  "Python",
  // ATS platforms
  "Greenhouse",
  "Lever",
  "Ashby",
  "Workday",
  "SmartRecruiters",
  // Topics
  "ATS",
  "LinkedIn",
  "Resume",
  "Cover Letter",
  "Interviews",
  "Salary",
  "Remote",
  "Freelance",
  "B2B",
  "Work Authorization",
  "AI",
  "Networking",
  "Portfolio",
  "Skills",
  "Seniority",
] as const;

export type BlogTag = (typeof BLOG_TAGS)[number];

// ---------------------------------------------------------------------------
// Validation helpers (used by the Zod schema in types.ts)
// ---------------------------------------------------------------------------

export function isValidCategory(value: string): value is BlogCategory {
  return (BLOG_CATEGORIES as readonly string[]).includes(value);
}

export function isValidTag(value: string): value is BlogTag {
  return (BLOG_TAGS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Display helpers (used by route pages)
// ---------------------------------------------------------------------------

/**
 * Human-readable description for a category, suitable for <meta> tags
 * and category page headers. Falls back to a generic string for safety.
 */
export function getCategoryDescription(category: string): string {
  return (
    CATEGORY_DESCRIPTIONS[category as BlogCategory] ??
    "Insights for web developers navigating the hidden job market."
  );
}
