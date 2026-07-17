// WeWorkRemotely Direct Ingestion Adapter
// src/lib/jobs/direct-ingestion/weworkremotely.ts
//
// Fetches jobs from the WeWorkRemotely RSS feed
// (https://weworkremotely.com/remote-jobs.rss) and transforms them into
// DirectIngestionJob objects. WWR is a remote-first job board — every listed
// job is remote by definition.
//
// API: GET https://weworkremotely.com/remote-jobs.rss
// Response: RSS 2.0 XML with <item> entries. Each item has:
//   <title>Company Name: Job Title</title>   (split on first colon)
//   <region>Anywhere in the World</region>
//   <category>Front-End Programming</category>
//   <type>Full-Time</type>
//   <link>https://weworkremotely.com/remote-jobs/...</link>
//   <pubDate>Tue, 07 Jul 2026 12:49:42 +0000</pubDate>
//   <description>HTML-escaped content</description>
//
// The project has no XML parser dependency. The WWR feed is well-structured and
// consistent, so we extract <item> blocks and per-field content with targeted
// regex — no new dependency needed.

import { scanTagsRegex } from "../job-normalizer";
import {
  type DirectFetchResult,
  type DirectIngestionJob,
  normalizeEmploymentType,
  safeParseDate,
  stripHtmlToText,
} from "./types";

/** Maps WWR <category> values to normalized tag arrays. */
const CATEGORY_TAG_MAP: Record<string, string[]> = {
  "front-end programming": ["frontend"],
  "full-stack programming": ["frontend", "backend"],
  "back-end programming": ["backend"],
  "devops and sysadmin": ["devops"],
  design: ["design"],
  "sales and marketing": ["marketing"],
  "customer support": ["support"],
  product: ["product"],
  "management and finance": ["management"],
  "all other remote": [],
};

/**
 * Fetch and normalize jobs from the WeWorkRemotely RSS feed.
 *
 * @param maxJobs        Maximum jobs to return after filtering
 * @param techFilter     Function to filter jobs by tech-stack overlap
 * @param fetchFn        Injectable fetch (defaults to global fetch)
 * @returns              DirectFetchResult with filtered DirectIngestionJob[]
 */
export async function fetchWeWorkRemotelyJobs(
  maxJobs: number,
  techFilter: (job: {
    tags: string[];
    title: string;
    description: string;
  }) => boolean,
  fetchFn: typeof fetch = fetch,
): Promise<DirectFetchResult> {
  try {
    const response = await fetchFn(
      "https://weworkremotely.com/remote-jobs.rss",
      {
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      return {
        success: false,
        error: `WeWorkRemotely RSS HTTP ${response.status} ${response.statusText}`,
        totalAvailable: 0,
      };
    }

    const xml = await response.text();
    const items = extractItems(xml);
    const totalAvailable = items.length;
    const filteredJobs: DirectIngestionJob[] = [];

    for (const item of items) {
      const { companyName, jobTitle } = splitTitle(item.title);
      const categoryTags = mapCategory(item.category);
      const description = parseDescription(item.description);

      // Directive 13, B3.2: Extract technology-specific tags from the job title
      // and description using the canonical tag regex scanner. Previously, the
      // WWR adapter only used category-based tags ("frontend", "backend") which
      // are too generic for the stack-disjoint gate — jobs with "react" in the
      // title were getting tags=["frontend"] and being rejected as stack-disjoint
      // because "frontend" is not in the JS family constant array.
      const textTags = scanTagsRegex(`${jobTitle} ${description}`);
      const tags = [...new Set([...categoryTags, ...textTags])];

      // Apply persona tech filter
      if (!techFilter({ tags, title: jobTitle, description })) {
        continue;
      }

      const job: DirectIngestionJob = {
        externalJobId: extractJobId(item.link),
        title: jobTitle,
        companyName,
        normalizedText: description,
        extractedTags: tags,
        applyUrl: item.link || null,
        jobUrl: item.link || null,
        locationName: item.region || null,
        workplaceType: "remote", // WWR is remote-first
        employmentType: normalizeEmploymentType(item.type),
        remoteScope: inferRemoteScope(item.region),
        compensationMin: null,
        compensationMax: null,
        compensationCurrency: null,
        experienceMinYears: null,
        experienceMaxYears: null,
        publishedAt: item.pubDate ? safeParseDate(item.pubDate) : null,
      };

      filteredJobs.push(job);

      if (filteredJobs.length >= maxJobs) {
        break;
      }
    }

    return { success: true, jobs: filteredJobs, totalAvailable };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      totalAvailable: 0,
    };
  }
}

// ── RSS parsing helpers ──────────────────────────────────────────────────────

interface RssItem {
  title: string;
  region: string;
  category: string;
  type: string;
  link: string;
  pubDate: string;
  description: string;
}

/** Extract all <item> blocks and their fields from the RSS XML. */
function extractItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null = itemRegex.exec(xml);
  while (match !== null) {
    const block = match[1];
    items.push({
      title: extractField(block, "title"),
      region: extractField(block, "region"),
      category: extractField(block, "category"),
      type: extractField(block, "type"),
      link: extractField(block, "link"),
      pubDate: extractField(block, "pubDate"),
      description: extractField(block, "description"),
    });
    match = itemRegex.exec(xml);
  }
  return items;
}

/** Extract the text content of a single XML field from a block. */
function extractField(block: string, field: string): string {
  const regex = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, "i");
  const match = regex.exec(block);
  return match ? match[1].trim() : "";
}

/**
 * Split a WWR title "Company Name: Job Title" on the first colon.
 * If no colon is present, the whole string is the title and company is null.
 */
function splitTitle(raw: string): {
  companyName: string | null;
  jobTitle: string;
} {
  const colonIndex = raw.indexOf(":");
  if (colonIndex === -1) {
    return { companyName: null, jobTitle: raw.trim() };
  }
  const company = raw.slice(0, colonIndex).trim();
  const title = raw.slice(colonIndex + 1).trim();
  return { companyName: company || null, jobTitle: title };
}

/** Map a WWR category string to a normalized tag array. */
function mapCategory(category: string): string[] {
  const key = category.toLowerCase().trim();
  return CATEGORY_TAG_MAP[key] ?? [];
}

/**
 * Parse a WWR <description> field. The content is XML-escaped HTML
 * (e.g. "&lt;p&gt;...&lt;/p&gt;"), so we first unescape XML entities, then
 * strip the resulting HTML tags.
 */
function parseDescription(raw: string): string {
  const unescaped = raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  return stripHtmlToText(unescaped);
}

/** Extract the job ID (last URL path segment) from a WWR link. */
function extractJobId(link: string): string {
  if (!link) return "";
  const trimmed = link.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  return segments[segments.length - 1] || link;
}

/**
 * Infer remote scope from the <region> field.
 * "Anywhere"/"World"/"Global" → global; otherwise country_fenced.
 */
function inferRemoteScope(
  region: string | undefined,
): "global" | "country_fenced" {
  if (!region) return "global";
  const lower = region.toLowerCase();
  if (
    lower.includes("anywhere") ||
    lower.includes("world") ||
    lower.includes("global")
  ) {
    return "global";
  }
  return "country_fenced";
}
