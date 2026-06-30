// Layoff Signal Checker — Q3 (TDD §3.3)
// src/lib/jobs/quality/layoff-signals.ts
//
// Daily check of Layoffs.fyi RSS feed for companies that recently announced
// layoffs. Affected companies are demoted from active_hot to active (not
// dormant — they may still have open roles, but we reduce polling frequency).
//
// The RSS feed is fetched from https://layoffs.fyi/rss-feed/
// Each item contains a company name in the title. We match against the
// company table's canonical_name and company_name fields.
//
// See CORPUS_EXPANSION_TDD §3.3 for the full specification.

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import type { FetchFn } from "@/lib/jobs/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface LayoffSignalResult {
  /** Number of layoff entries parsed from the RSS feed. */
  layoffsParsed: number;
  /** Number of companies matched in the corpus. */
  companiesMatched: number;
  /** Number of companies demoted from active_hot to active. */
  companiesDemoted: number;
  /** List of matched company names (for logging). */
  matchedNames: string[];
}

// ── Pure function: RSS parsing ───────────────────────────────────────────────

/**
 * Extract company names from a Layoffs.fyi RSS feed XML string.
 *
 * The RSS feed items have titles like "Company Name - 500 layoffs" or
 * "Company Name lays off 500 employees". We extract the company name
 * from the <title> element.
 *
 * @param xml  The RSS feed XML as a string
 * @returns    Array of company names (deduplicated)
 */
export function parseLayoffRss(xml: string): string[] {
  const names: string[] = [];
  // Match <title>...</title> within <item> blocks
  const itemRegex = /<item>[\s\S]*?<\/item>/gi;
  const titleRegex = /<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i;

  const items = xml.match(itemRegex) ?? [];
  for (const item of items) {
    const titleMatch = item.match(titleRegex);
    if (!titleMatch?.[1]) continue;

    const title = titleMatch[1].trim();
    // Layoffs.fyi titles are typically "Company Name" or "Company Name - X layoffs"
    // Extract the company name (everything before " - " or " lays off ")
    const name = title
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .split(/\s+[-–]\s+/)[0]
      .replace(/\s+lays\s+off.*$/i, "")
      .replace(/\s+layoffs?$/i, "")
      .trim();

    if (name.length > 1) {
      names.push(name);
    }
  }

  // Deduplicate
  return [...new Set(names)];
}

// ── Pure function: name matching ─────────────────────────────────────────────

/**
 * Normalize a company name for fuzzy matching.
 * Lowercases, strips suffixes (Inc., LLC, Ltd, Corp, etc.), removes punctuation.
 */
export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|the)\b\.?/g, "")
    .replace(/[.,'/]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Check if a layoff company name matches a corpus company name.
 * Uses normalized comparison (case-insensitive, suffix-stripped).
 */
export function namesMatch(layoffName: string, corpusName: string): boolean {
  const a = normalizeCompanyName(layoffName);
  const b = normalizeCompanyName(corpusName);
  if (a.length < 2 || b.length < 2) return false;
  // Exact match after normalization
  if (a === b) return true;
  // One is a substring of the other (e.g., "Meta" matches "Meta Platforms")
  if (a.includes(b) || b.includes(a)) return true;
  return false;
}

// ── Database operation: demote matched companies ─────────────────────────────

/**
 * Fetch the Layoffs.fyi RSS feed, parse company names, match against the
 * corpus, and demote matched companies from active_hot to active.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        LayoffSignalResult with counts and matched names
 */
export async function checkLayoffSignals(
  fetchFn: FetchFn = fetch,
): Promise<LayoffSignalResult> {
  const LAYOFFS_RSS_URL = "https://layoffs.fyi/rss-feed/";

  let xml: string;
  try {
    const response = await fetchFn(LAYOFFS_RSS_URL);
    if (!response.ok) {
      return {
        layoffsParsed: 0,
        companiesMatched: 0,
        companiesDemoted: 0,
        matchedNames: [],
      };
    }
    xml = await response.text();
  } catch {
    return {
      layoffsParsed: 0,
      companiesMatched: 0,
      companiesDemoted: 0,
      matchedNames: [],
    };
  }

  const layoffNames = parseLayoffRss(xml);

  // Match against corpus and demote from active_hot to active
  // We use a case-insensitive ILIKE match against company_name and canonical_name
  // For each layoff name, find companies that match and demote them
  let companiesDemoted = 0;
  const matchedNames: string[] = [];

  for (const layoffName of layoffNames) {
    const normalized = normalizeCompanyName(layoffName);
    if (normalized.length < 2) continue;

    // Demote matched companies from active_hot to active (not dormant —
    // they may still have open roles, just reduce polling frequency)
    const result = await db.execute(sql`
      UPDATE company SET tier = 'active'::company_tier
      WHERE tier = 'active_hot'::company_tier
      AND polling_enabled = true
      AND (
        LOWER(company_name) ILIKE ${`%${normalized}%`}
        OR LOWER(canonical_name) ILIKE ${`%${normalized}%`}
      )
      RETURNING company_name
    `);

    const rows = result.rows ?? [];
    companiesDemoted += rows.length;
    for (const row of rows) {
      const name = (row as { company_name?: string }).company_name;
      if (name) matchedNames.push(name);
    }
  }

  return {
    layoffsParsed: layoffNames.length,
    companiesMatched: matchedNames.length,
    companiesDemoted,
    matchedNames,
  };
}
