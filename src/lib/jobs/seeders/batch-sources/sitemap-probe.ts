// B10: Sitemap.xml Probing Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/sitemap-probe.ts
//
// For companies in the slugger_retry queue where the Slugger failed, this
// seeder probes common sitemap paths to discover ATS-powered career pages.
// It rescues 20-30% of failed probes by finding ATS URLs that weren't
// discoverable via CNAME or slug probing.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Query slugger_retry for companies with websites
// 2. For each company, probe these sitemap paths:
//    - {website}/sitemap.xml
//    - {website}/jobs/sitemap.xml
//    - {website}/careers/sitemap.xml
// 3. Parse the XML sitemap for URLs
// 4. Check if any URLs point to known ATS domains
// 5. If found, extract the slug and insert the company directly
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// Rescues 20-30% of failed probes (companies that have ATS pages but their
// careers subdomain doesn't CNAME to an ATS domain).
//
// See TDD §2.1 (B10) for the full specification.

import * as cheerio from "cheerio";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { sluggerRetry } from "@/db/schemas/jobs/sluggerRetry";
import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/** Sitemap paths to probe for each company. */
const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/jobs/sitemap.xml",
  "/careers/sitemap.xml",
];

/** ATS domain detection (same as other seeders). */
const ATS_DOMAIN_MAP: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface RetryCompany {
  companyName: string;
  website: string | null;
}

export interface SitemapProbeResult {
  /** Total companies probed. */
  companiesProbed: number;
  /** Sitemap URLs successfully fetched. */
  sitemapsFound: number;
  /** ATS URLs found in sitemaps. */
  atsUrlsFound: number;
  /** Unique company slugs extracted. */
  uniqueSlugsExtracted: number;
  /** Companies inserted into the company table. */
  companiesInserted: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: normalize website URL ─────────────────────────────────────

/**
 * Normalize a website URL to its base form (protocol + host, no path).
 * Returns null if the URL is invalid.
 */
export function normalizeWebsite(website: string): string | null {
  try {
    const parsed = new URL(website);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    // Try adding https:// prefix
    try {
      const parsed = new URL(`https://${website}`);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return null;
    }
  }
}

// ── Pure function: infer ATS source from URL ─────────────────────────────────

function inferAtsSourceFromUrl(url: string): AtsSource | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    for (const { domain, source } of ATS_DOMAIN_MAP) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return source;
      }
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// ── Pure function: extract slug from ATS URL ─────────────────────────────────

function extractSlugFromAtsUrl(
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

// ── Pure function: extract URLs from sitemap XML ─────────────────────────────

/**
 * Extract URLs from a sitemap XML document.
 * Supports both <urlset> (standard sitemap) and <sitemapindex> (sitemap index).
 *
 * @param xml  The sitemap XML content
 * @returns    Array of URLs found in <loc> tags
 */
export function extractUrlsFromSitemap(xml: string): string[] {
  const $ = cheerio.load(xml, { xml: true });
  const urls: string[] = [];

  $("url > loc, sitemap > loc").each((_, el) => {
    const url = $(el).text().trim();
    if (url) urls.push(url);
  });

  return urls;
}

// ── Pure function: extract ATS company inputs from sitemap URLs ──────────────

/**
 * Extract SeedCompanyInput tuples from sitemap URLs that point to ATS domains.
 * Deduplicates by (atsSource, atsSlug).
 *
 * @param urls            URLs extracted from a sitemap
 * @param companyName     The company name (for provenance)
 * @returns               Array of unique SeedCompanyInput tuples
 */
export function extractAtsCompanyInputs(
  urls: string[],
  companyName: string,
): SeedCompanyInput[] {
  const seen = new Set<string>();
  const inputs: SeedCompanyInput[] = [];

  for (const url of urls) {
    const atsSource = inferAtsSourceFromUrl(url);
    if (!atsSource) continue;

    const slug = extractSlugFromAtsUrl(url, atsSource);
    if (!slug) continue;

    const key = `${atsSource}:${slug}`;
    if (seen.has(key)) continue;
    seen.add(key);

    inputs.push({
      atsSlug: slug,
      atsSource,
      discoverySource: "sitemap_probe",
      discoveryContext: `sitemap:${companyName} url:${url}`,
    });
  }

  return inputs;
}

// ── DB query: get failed companies from slugger_retry ────────────────────────

/**
 * Query the slugger_retry table for companies with websites.
 * These are companies where the Slugger failed but we have a website to probe.
 */
export async function getRetryCompanies(): Promise<RetryCompany[]> {
  const result = await db
    .select({
      companyName: sluggerRetry.companyName,
      website: sluggerRetry.website,
    })
    .from(sluggerRetry)
    .where(sql`${sluggerRetry.website} IS NOT NULL`);

  return result;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the sitemap probe seeder. Queries the slugger_retry queue for companies
 * with websites, probes their sitemap paths, and extracts ATS URLs.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any errors
 */
export async function runSitemapProbeSeeder(
  fetchFn: FetchFn = fetch,
): Promise<SitemapProbeResult> {
  let companiesProbed = 0;
  let sitemapsFound = 0;
  let atsUrlsFound = 0;
  const allInputs: SeedCompanyInput[] = [];
  const seenKeys = new Set<string>();

  try {
    // Step 1: Get failed companies from slugger_retry
    const retryCompanies = await getRetryCompanies();

    for (const company of retryCompanies) {
      if (!company.website) continue;

      const baseUrl = normalizeWebsite(company.website);
      if (!baseUrl) continue;

      companiesProbed++;

      // Step 2: Probe each sitemap path
      for (const path of SITEMAP_PATHS) {
        const sitemapUrl = `${baseUrl}${path}`;

        try {
          const response = await fetchFn(sitemapUrl);
          if (!response.ok) continue;

          const xml = await response.text();
          sitemapsFound++;

          // Step 3: Extract URLs from the sitemap
          const urls = extractUrlsFromSitemap(xml);

          // Step 4: Extract ATS company inputs
          const inputs = extractAtsCompanyInputs(urls, company.companyName);

          for (const input of inputs) {
            const key = `${input.atsSource}:${input.atsSlug}`;
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              allInputs.push(input);
              atsUrlsFound++;
            }
          }
        } catch {
          // Individual sitemap fetch failure — continue to next path
        }
      }
    }

    // Step 5: Insert all discovered companies
    let companiesInserted = 0;
    if (allInputs.length > 0) {
      const insertResult = await insertDiscoveredCompanies(allInputs);
      companiesInserted = insertResult.inserted;
    }

    return {
      companiesProbed,
      sitemapsFound,
      atsUrlsFound,
      uniqueSlugsExtracted: allInputs.length,
      companiesInserted,
    };
  } catch (error) {
    return {
      companiesProbed,
      sitemapsFound,
      atsUrlsFound,
      uniqueSlugsExtracted: allInputs.length,
      companiesInserted: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
