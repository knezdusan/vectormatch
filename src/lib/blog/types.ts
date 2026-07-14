import { z } from "zod/v4";
import {
  BLOG_CATEGORIES,
  BLOG_TAGS,
  isValidCategory,
  isValidTag,
} from "./taxonomy";

export const PostFrontmatterSchema = z.object({
  title: z.string().min(1).max(70),
  description: z.string().min(1).max(170),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  author: z.string().min(1),
  tags: z
    .array(z.string().min(1))
    .min(1, "At least one tag is required")
    .max(6, "Maximum 6 tags per post")
    .refine(
      (tags: string[]) => tags.every(isValidTag),
      `Unknown tag(s). Allowed tags: ${BLOG_TAGS.join(", ")}`,
    ),
  featured: z.boolean().default(false),
  coverImage: z.string().min(1),
  category: z
    .string()
    .min(1)
    .refine(
      isValidCategory,
      `Unknown category. Allowed: ${BLOG_CATEGORIES.join(", ")}`,
    ),
  draft: z.boolean().default(false),
});

export type PostFrontmatter = z.infer<typeof PostFrontmatterSchema>;

export interface Post {
  slug: string;
  frontmatter: PostFrontmatter;
  rawSource: string;
}
