// Shared RSS parsing helpers for direct-ingestion adapters (D26)
// src/lib/jobs/direct-ingestion/rss-helpers.ts
//
// Extracted from weworkremotely.ts and workingnomads.ts to eliminate
// code duplication flagged by fallow. These helpers handle the common
// RSS 2.0 XML parsing pattern used by remote-native job board adapters.

import { stripHtmlToText } from "./types";

/** A parsed RSS <item> with the fields most job boards expose. */
export interface RssItem {
  title: string;
  region: string;
  category: string;
  type: string;
  link: string;
  pubDate: string;
  description: string;
}

/** Extract all <item> blocks and their fields from the RSS XML. */
export function extractRssItems(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null = itemRegex.exec(xml);
  while (match !== null) {
    const block = match[1];
    items.push({
      title: extractRssField(block, "title"),
      region: extractRssField(block, "region"),
      category: extractRssField(block, "category"),
      type: extractRssField(block, "type"),
      link: extractRssField(block, "link"),
      pubDate: extractRssField(block, "pubDate"),
      description: extractRssField(block, "description"),
    });
    match = itemRegex.exec(xml);
  }
  return items;
}

/** Extract the text content of a single XML field from a block. */
export function extractRssField(block: string, field: string): string {
  const regex = new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, "i");
  const match = regex.exec(block);
  return match ? match[1].trim() : "";
}

/**
 * Parse an RSS <description> field. The content is XML-escaped HTML
 * (e.g. "&lt;p&gt;...&lt;/p&gt;"), so we first unescape XML entities, then
 * strip the resulting HTML tags.
 */
export function parseRssDescription(raw: string): string {
  const unescaped = raw
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
  return stripHtmlToText(unescaped);
}

/** Extract the job ID (last URL path segment) from a job board link. */
export function extractJobIdFromLink(link: string): string {
  if (!link) return "";
  const trimmed = link.replace(/\/+$/, "");
  const segments = trimmed.split("/");
  return segments[segments.length - 1] || link;
}
