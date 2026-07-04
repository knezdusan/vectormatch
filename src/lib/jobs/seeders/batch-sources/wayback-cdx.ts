// B7: Wayback Machine CDX Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/wayback-cdx.ts
//
// Queries the Wayback Machine CDX API for archived ATS-hosted job board pages.
// The CDX API indexes all URLs the Wayback Machine has crawled, making it a
// powerful discovery source for companies that may have been removed from
// Google's index but still have historical ATS pages.
//
// ── API ──────────────────────────────────────────────────────────────────────
// GET https://web.archive.org/cdx/search/cdx?
//   url=boards.greenhouse.io/*
//   &output=json
//   &filter=statuscode:200
//   &fl=original,timestamp
//   &from=YYYYMMDD         (date filter — last 18 months)
//   &limit=100000
//
// Response: JSON array where first row is the header ["original","timestamp"]
// and subsequent rows are data.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Query CDX for each ATS domain (boards.greenhouse.io/*, jobs.lever.co/*, etc.)
// 2. Filter to last 18 months (avoid graveyard companies)
// 3. Extract slugs from the archived URL paths
// 4. Insert directly into company table (no Slugger needed)
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 200-500 companies (catches companies not indexed by Google).
//
// See TDD §2.1 (B7) for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const CDX_API_URL = "https://web.archive.org/cdx/search/cdx";

/** Date filter window — only consider archives from the last 18 months. */
const DATE_FILTER_MONTHS = 18;

/** Maximum results per CDX query (safety limit). */
const CDX_LIMIT = 100000;

/**
 * ATS domains to query via CDX, mapped to their ATS source.
 * The `url` parameter uses wildcards (e.g. `boards.greenhouse.io/*`).
 */
const ATS_CDX_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface WaybackCdxResult {
  /** Total CDX rows found across all ATS domains. */
  totalRows: number;
  /** Unique company slugs extracted. */
  uniqueCompanySlugs: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if the API call failed. */
  error?: string;
}

// ── Pure function: compute date filter string ────────────────────────────────

/**
 * Compute the `from` date for the CDX query — N months ago, formatted as
 * YYYYMMDD (the CDX API's expected date format).
 *
 * @param months  Number of months to look back (default: 18)
 * @returns       Date string in YYYYMMDD format
 */
export function computeDateFilter(months: number = DATE_FILTER_MONTHS): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const totalMonths = month - months;
  const targetYear = year + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12;

  const monthStr = String(targetMonth + 1).padStart(2, "0");
  return `${targetYear}${monthStr}01`;
}

// ── Pure function: extract slug from archived URL ────────────────────────────

/**
 * Extract the ATS slug from an archived URL.
 *
 * For most ATS platforms, the slug is the first path segment:
 *   boards.greenhouse.io/acme/jobs/123 → "acme"
 *
 * For Recruitee, the slug is the subdomain:
 *   acme.recruitee.com/o/devops → "acme"
 *
 * @returns  The slug string, or null if it can't be extracted.
 */
export function extractSlugFromArchivedUrl(
  url: string,
  atsSource: AtsSource,
): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (atsSource === "recruitee") {
      const labels = hostname.split(".");
      if (
        labels.length >= 3 &&
        labels[labels.length - 2] === "recruitee" &&
        labels[labels.length - 1] === "com"
      ) {
        const slug = labels[0];
        if (["www", "api", "blog"].includes(slug)) return null;
        return slug;
      }
      return null;
    }

    const pathParts = parsed.pathname.split("/").filter((p) => p.length > 0);
    if (pathParts.length === 0) return null;
    const slug = pathParts[0];
    if (["jobs", "api", "embed", "board"].includes(slug)) return null;
    return slug;
  } catch {
    return null;
  }
}

// ── Pure function: extract company inputs from CDX rows ──────────────────────

/**
 * Extract unique SeedCompanyInput tuples from CDX API rows.
 * Each row is [originalUrl, timestamp]. Deduplicates by (atsSource, atsSlug).
 *
 * @param rows        CDX rows (excluding the header row)
 * @param atsSource   The ATS source for this query
 * @returns           Array of unique SeedCompanyInput tuples
 */
export function extractCompaniesFromCdxRows(
  rows: string[][],
  atsSource: AtsSource,
): SeedCompanyInput[] {
  const seen = new Set<string>();
  const inputs: SeedCompanyInput[] = [];

  for (const row of rows) {
    const url = row[0];
    if (!url) continue;

    const slug = extractSlugFromArchivedUrl(url, atsSource);
    if (!slug) continue;

    const key = `${atsSource}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    inputs.push({
      atsSlug: slug,
      atsSource,
      discoverySource: "wayback_cdx",
      discoveryContext: `wayback:${url}`,
    });
  }

  return inputs;
}

// ── API client: query CDX for a single ATS domain ────────────────────────────

/**
 * Query the Wayback Machine CDX API for archived URLs of a single ATS domain.
 *
 * @param domain    The ATS domain to query (e.g. "boards.greenhouse.io")
 * @param from      Date filter in YYYYMMDD format
 * @param fetchFn   Injectable fetch function
 * @returns         Array of CDX rows (excluding the header row)
 */
async function queryCdx(
  domain: string,
  from: string,
  fetchFn: FetchFn,
): Promise<string[][]> {
  const url = new URL(CDX_API_URL);
  url.searchParams.set("url", `${domain}/*`);
  url.searchParams.set("output", "json");
  url.searchParams.set("filter", "statuscode:200");
  url.searchParams.set("fl", "original,timestamp");
  url.searchParams.set("from", from);
  url.searchParams.set("limit", String(CDX_LIMIT));

  const response = await fetchFn(url.toString());
  if (!response.ok) {
    throw new Error(`CDX API returned HTTP ${response.status} for ${domain}`);
  }

  const json: unknown = await response.json();
  if (!Array.isArray(json)) {
    throw new Error("CDX API response is not an array");
  }

  // First row is the header ["original","timestamp"] — skip it
  return json.slice(1) as string[][];
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Wayback Machine CDX seeder. Queries the CDX API for each ATS domain,
 * extracts slugs from archived URLs, and inserts them into the company table.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and insert metrics
 */
export async function runWaybackCdxSeeder(
  fetchFn: FetchFn = fetch,
): Promise<WaybackCdxResult> {
  const from = computeDateFilter();
  let totalRows = 0;
  const allInputs: SeedCompanyInput[] = [];
  const seenKeys = new Set<string>();

  try {
    for (const { domain, source } of ATS_CDX_DOMAINS) {
      try {
        const rows = await queryCdx(domain, from, fetchFn);
        totalRows += rows.length;

        const inputs = extractCompaniesFromCdxRows(rows, source);
        for (const input of inputs) {
          const key = `${input.atsSource}:${input.atsSlug}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            allInputs.push(input);
          }
        }
      } catch {
        // Individual domain failure — continue to next domain
      }
    }

    const insertResult = await insertDiscoveredCompanies(allInputs);

    return {
      totalRows,
      uniqueCompanySlugs: allInputs.length,
      insertResult,
    };
  } catch (error) {
    return {
      totalRows,
      uniqueCompanySlugs: allInputs.length,
      insertResult: {
        inserted: 0,
        skipped: 0,
        rejected: [],
        insertedCompanyIds: [],
        insertedCompanies: [],
        aggregatorFiltered: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
