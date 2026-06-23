// HN Algolia API Response Schemas
// src/lib/jobs/seeders/hn-schemas.ts
//
// Defensive Zod schemas for the Hacker News Algolia Search API.
// API docs: https://hn.algolia.com/api
//
// The HN seeder queries `search_by_date` for "Ask HN: Who is hiring" threads.
// The hits are a mix of stories (the main "Who is hiring" post, with
// `story_text`) and comments (individual job postings, with `comment_text`).
// We only care about comments — that's where companies post job URLs.
//
// ── Error handling pattern (same as ATS schemas) ─────────────────────────────
// Always use `safeParse()`, never `parse()`. The HN API is outside our control.
// If the response shape changes, safeParse returns `{ success: false }` and the
// seeder logs the error to ingestionLog without crashing.
//
// See TDD §4.1.2 and the Zod schema inventory (§4.2.3).

import { z } from "zod";

// A single HN Algolia hit. Both stories and comments share this shape — the
// difference is which text field is populated (story_text vs comment_text).
// We use `.passthrough()` because the API returns many fields we don't need
// (_highlightResult, _tags, children, etc.) and we don't want to break when
// Algolia adds new ones.
export const hnAlgoliaHitSchema = z
  .object({
    objectID: z.string(),
    author: z.string(),
    // Present on comments — this is where job postings with URLs live.
    comment_text: z.string().optional(),
    // Present on stories — the main "Who is hiring" post. We skip these.
    story_text: z.string().optional(),
    // The parent story title (e.g. "Ask HN: Who is hiring? (January 2024)").
    title: z.string().optional(),
    created_at: z.string(),
    // HN item URL (e.g. "https://news.ycombinator.com/item?id=12345").
    // Sometimes absent; we use objectID to construct it as a fallback.
    url: z.string().optional(),
    // Parent story ID — present on comments.
    story_id: z.number().optional(),
    // Unix timestamp (integer) — present on all hits.
    created_at_i: z.number().optional(),
  })
  .passthrough();

// The full HN Algolia search response. We need pagination fields to fetch all
// pages of a "Who is hiring" thread (can have 500+ comments).
export const hnAlgoliaResponseSchema = z
  .object({
    hits: z.array(hnAlgoliaHitSchema),
    nbHits: z.number(),
    page: z.number(), // 0-indexed current page
    nbPages: z.number(), // total number of pages
    hitsPerPage: z.number(),
  })
  .passthrough();

// ── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type HnAlgoliaHit = z.infer<typeof hnAlgoliaHitSchema>;
export type HnAlgoliaResponse = z.infer<typeof hnAlgoliaResponseSchema>;
