// D8: Product Hunt Daily Launches (TDD §2.8)
// src/lib/jobs/seeders/daily-sources/producthunt-daily.ts
//
// Daily sweep of Product Hunt launches. Product Hunt publishes an RSS feed of
// the latest products/companies. We parse the feed, extract product names, and
// run each through the Slugger for ATS resolution.
//
// ── API ──────────────────────────────────────────────────────────────────────
// GET https://www.producthunt.com/feed
//   Returns RSS XML with <item> elements containing <title> (product name).
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch the Product Hunt RSS feed
// 2. Parse XML using cheerio
// 3. Extract product names from <item><title> elements
// 4. Deduplicate names (case-insensitive)
// 5. Run each through the Slugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 10-30 products/day. Many are small startups, so ATS resolution rate is lower
// than HN/BigQuery, but it surfaces early-stage companies not yet in other
// sources.
//
// See TDD §2.8 (D8) for the full specification.

import * as cheerio from "cheerio";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const PRODUCTHUNT_RSS_URL = "https://www.producthunt.com/feed";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProductHuntDailyResult {
  /** Total products found in the RSS feed (before dedup). */
  totalProducts: number;
  /** Unique company names after deduplication. */
  uniqueCompanies: number;
  /** Companies successfully resolved to an ATS slug. */
  resolved: number;
  /** Companies that could not be resolved (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: extract product names from RSS XML ────────────────────────

/**
 * Parse RSS XML using cheerio and extract product names from <item><title>
 * elements.
 *
 * @param xml  The raw RSS XML string
 * @returns    Array of product names (in document order, not deduplicated)
 */
export function extractProductNamesFromRss(xml: string): string[] {
  if (!xml || xml.trim().length === 0) return [];

  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    const names: string[] = [];

    $("item").each((_index, element) => {
      const title = $(element).find("title").first().text().trim();
      if (title.length > 0) {
        names.push(title);
      }
    });

    return names;
  } catch {
    // Invalid XML or parse error — return empty
    return [];
  }
}

// ── Pure function: deduplicate names ─────────────────────────────────────────

/**
 * Deduplicate an array of product/company names (case-insensitive).
 * Preserves the first occurrence of each name (in original casing).
 *
 * @param names  Array of product names (possibly with duplicates)
 * @returns      Deduplicated array preserving first-occurrence order
 */
export function deduplicateNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }

  return result;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Product Hunt daily launches seeder. Fetches the RSS feed, extracts
 * product names, deduplicates them, and runs each through the Slugger for ATS
 * resolution with company insertion enabled.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any error
 */
export async function runProductHuntDailySeeder(
  fetchFn: FetchFn = fetch,
): Promise<ProductHuntDailyResult> {
  let totalProducts = 0;
  let uniqueCompanies = 0;

  try {
    // 1. Fetch the RSS feed
    const response = await fetchFn(PRODUCTHUNT_RSS_URL);
    if (!response.ok) {
      throw new Error(
        `Product Hunt RSS returned ${response.status} ${response.statusText}`,
      );
    }

    const xml = await response.text();

    // 2. Extract product names
    const productNames = extractProductNamesFromRss(xml);
    totalProducts = productNames.length;

    // 3. Deduplicate
    const uniqueNames = deduplicateNames(productNames);
    uniqueCompanies = uniqueNames.length;

    // 4. Run each through the Slugger
    let resolved = 0;
    let unresolved = 0;

    for (const name of uniqueNames) {
      try {
        const result: SluggerResult = await resolveSlugger(
          {
            companyName: name,
            discoverySource: "hn_algolia",
            discoveryContext: `producthunt:${name}`,
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
        // Individual resolution failure — count as unresolved, continue
        unresolved++;
      }
    }

    return {
      totalProducts,
      uniqueCompanies,
      resolved,
      unresolved,
    };
  } catch (error) {
    return {
      totalProducts,
      uniqueCompanies,
      resolved: 0,
      unresolved: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
