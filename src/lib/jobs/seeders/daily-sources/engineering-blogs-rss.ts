// D9: Company Engineering Blog RSS Seeder
// src/lib/jobs/seeders/daily-sources/engineering-blogs-rss.ts
//
// Fetches RSS feeds from major tech company engineering blogs, looks for posts
// mentioning "hiring", "careers", or "jobs", and runs those company names
// through the Slugger for ATS slug resolution.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch RSS XML from each engineering blog feed
// 2. Parse XML using cheerio, extract <item> elements
// 3. Filter for posts whose title or description contains hiring keywords
// 4. Extract the company name from feed metadata (or infer from blog name)
// 5. Run each unique company through the Slugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 0-5 companies/run — engineering blogs rarely post about hiring, but when
// they do, the company is high-quality and likely has a configured ATS.

import * as cheerio from "cheerio";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

interface EngineeringBlog {
  name: string;
  url: string;
  companyName: string;
}

/** Curated list of major tech company engineering blog RSS feeds. */
export const ENGINEERING_BLOGS: EngineeringBlog[] = [
  {
    name: "Netflix Tech Blog",
    url: "https://netflixtechblog.com/feed",
    companyName: "Netflix",
  },
  {
    name: "Airbnb Engineering",
    url: "https://medium.com/feed/airbnb-engineering",
    companyName: "Airbnb",
  },
  {
    name: "Uber Engineering",
    url: "https://eng.uber.com/feed/",
    companyName: "Uber",
  },
  {
    name: "Stripe Blog",
    url: "https://stripe.com/blog/feed",
    companyName: "Stripe",
  },
  {
    name: "Cloudflare Blog",
    url: "https://blog.cloudflare.com/rss/",
    companyName: "Cloudflare",
  },
  {
    name: "Discord Blog",
    url: "https://discord.com/blog/rss.xml",
    companyName: "Discord",
  },
  {
    name: "Instagram Engineering",
    url: "https://instagram-engineering.com/feed/",
    companyName: "Instagram",
  },
  {
    name: "Twitter Engineering",
    url: "https://blog.twitter.com/engineering/en/blog.rss",
    companyName: "Twitter",
  },
];

/** Keywords that indicate a post is hiring-related. */
export const HIRING_KEYWORDS: string[] = [
  "hiring",
  "careers",
  "jobs",
  "we're looking for",
  "join our team",
  "join us",
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface HiringPost {
  companyName: string;
  blogName: string;
  title: string;
}

export interface EngineeringBlogsResult {
  totalPosts: number;
  hiringPosts: number;
  uniqueCompanies: number;
  resolved: number;
  unresolved: number;
  error?: string;
}

// ── Pure function: hiring keyword detection ──────────────────────────────────

/**
 * Check if a text contains any hiring keywords (case-insensitive).
 *
 * @param text  The text to search (post title, description, etc.)
 * @returns     true if any hiring keyword is found
 */
export function containsHiringKeywords(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return HIRING_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// ── Pure function: extract hiring posts from RSS XML ─────────────────────────

/**
 * Parse RSS XML using cheerio and extract hiring-related posts.
 *
 * Iterates over <item> elements, checks each post's <title> and <description>
 * for hiring keywords, and returns matching posts with the company name.
 *
 * @param xml          The raw RSS XML string
 * @param blogName     The display name of the blog
 * @param companyName  The company name to associate with hiring posts
 * @returns            Array of hiring posts
 */
export function extractHiringPostsFromRss(
  xml: string,
  blogName: string,
  companyName: string,
): HiringPost[] {
  if (!xml || xml.trim().length === 0) return [];

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(xml, { xml: true });
  } catch {
    // Invalid XML — return empty
    return [];
  }

  const posts: HiringPost[] = [];

  $("item").each((_, element) => {
    const title = $(element).find("title").text().trim();
    const description = $(element).find("description").text().trim();

    const combined = `${title} ${description}`;
    if (containsHiringKeywords(combined)) {
      posts.push({ companyName, blogName, title: title || "(untitled)" });
    }
  });

  return posts;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the engineering blog RSS seeder. Fetches each blog's RSS feed, extracts
 * hiring-related posts, deduplicates companies across blogs, and runs each
 * unique company through the Slugger.
 *
 * Individual blog feed failures are logged but do not stop the seeder.
 *
 * @param fetchFn  Injectable fetch function (defaults to global fetch)
 * @returns        Result with counts and any critical error
 */
export async function runEngineeringBlogsRssSeeder(
  fetchFn: FetchFn = fetch,
): Promise<EngineeringBlogsResult> {
  let totalPosts = 0;
  const allHiringPosts: HiringPost[] = [];

  for (const blog of ENGINEERING_BLOGS) {
    try {
      const response = await fetchFn(blog.url);
      if (!response.ok) {
        // Individual blog failure — skip, don't abort
        continue;
      }

      const xml = await response.text();
      const items = extractHiringPostsFromRss(xml, blog.name, blog.companyName);

      // Count total posts parsed from this feed
      let $: cheerio.CheerioAPI;
      try {
        $ = cheerio.load(xml, { xml: true });
        totalPosts += $("item").length;
      } catch {
        // XML parse error — skip counting
      }

      allHiringPosts.push(...items);
    } catch {
      // Network error or parse failure for this blog — continue with others
    }
  }

  // Deduplicate companies across blogs (by canonical company name, case-insensitive)
  const seenCompanies = new Set<string>();
  const uniqueCompanies: HiringPost[] = [];
  for (const post of allHiringPosts) {
    const key = post.companyName.toLowerCase().trim();
    if (seenCompanies.has(key)) continue;
    seenCompanies.add(key);
    uniqueCompanies.push(post);
  }

  // Run each unique company through the Slugger
  let resolved = 0;
  let unresolved = 0;

  for (const post of uniqueCompanies) {
    try {
      const result: SluggerResult = await resolveSlugger(
        {
          companyName: post.companyName,
          discoverySource: "hn_algolia",
          discoveryContext: `eng-blog:${post.blogName}`,
        },
        {
          fetchFn,
          insertCompany: true,
        },
      );

      if (result.success) {
        resolved++;
      } else {
        unresolved++;
      }
    } catch {
      // Slugger failure for a single company — count as unresolved, continue
      unresolved++;
    }
  }

  return {
    totalPosts,
    hiringPosts: allHiringPosts.length,
    uniqueCompanies: uniqueCompanies.length,
    resolved,
    unresolved,
  };
}
