import { z } from "zod/v4";

export const PostFrontmatterSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  publishedAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
  author: z.string().min(1),
  tags: z.array(z.string().min(1)),
  featured: z.boolean().default(false),
  coverImage: z.string().min(1),
  category: z.string().min(1),
});

export type PostFrontmatter = z.infer<typeof PostFrontmatterSchema>;

export interface Post {
  slug: string;
  frontmatter: PostFrontmatter;
  rawSource: string;
}
