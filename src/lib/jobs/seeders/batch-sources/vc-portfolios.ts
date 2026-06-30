// B4: VC Portfolio Mining Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/vc-portfolios.ts
//
// Fetches VC portfolio pages, extracts company names + website links via
// HTML DOM parsing (cheerio), and runs each through the Slugger for ATS
// resolution.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// VC portfolio pages have wildly different HTML structures. Rather than
// writing a custom parser for each VC, we use a generic extraction strategy:
//   1. Find all <a> tags with an href pointing to an external website
//   2. Filter out navigation, social media, and VC's own links
//   3. Use the link text as the company name
//   4. Use the href as the company website
//
// For VCs with known CSS selectors, we can override the default extraction
// with a targeted selector for more precision.
//
// ── VC list ──────────────────────────────────────────────────────────────────
// We maintain a curated list of 50+ VC portfolio URLs. Each entry can
// optionally specify a CSS selector for targeted extraction.
//
// ── Slugger integration ──────────────────────────────────────────────────────
// Like B3, extracted company names + websites are run through the Slugger
// (3-stage resolution: DB cache → CNAME check → slug probe).
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 500-2,000 companies (VCs fund many tech companies).
//
// See TDD §2.1 (B4) for the full specification.

import * as cheerio from "cheerio";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Types ────────────────────────────────────────────────────────────────────

/** A VC portfolio page configuration. */
export interface VcPortfolioSource {
  /** VC name (for provenance). */
  name: string;
  /** Portfolio page URL. */
  url: string;
  /** Optional CSS selector for targeted company link extraction.
   * If not provided, uses the default generic extraction. */
  companySelector?: string;
}

/** An extracted company from a VC portfolio page. */
export interface ExtractedCompany {
  name: string;
  website: string;
  vcName: string;
}

export interface VcPortfolioResult {
  /** Total companies extracted across all VC pages. */
  totalCompaniesExtracted: number;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution (added to retry queue). */
  unresolved: number;
  /** VC pages fetched. */
  pagesFetched: number;
  /** VC pages that failed to fetch. */
  pagesFailed: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── VC portfolio URLs ────────────────────────────────────────────────────────

/**
 * Curated list of VC portfolio pages. Each VC has a different page structure.
 * For VCs with known selectors, we specify them for precise extraction.
 * For others, we use the default generic extraction strategy.
 */
export const VC_PORTFOLIO_SOURCES: VcPortfolioSource[] = [
  // Tier 1: Major tech VCs with large portfolios
  { name: "a16z", url: "https://a16z.com/portfolio/" },
  { name: "Sequoia", url: "https://www.sequoiacap.com/companies/" },
  { name: "Accel", url: "https://www.accel.com/companies" },
  { name: "Benchmark", url: "https://www.benchmark.com/companies" },
  { name: "Greylock", url: "https://greylock.com/portfolio/" },
  { name: "Lightspeed", url: "https://www.lsvp.com/portfolio/" },
  { name: "Founders Fund", url: "https://foundersfund.com/portfolio/" },
  { name: "Index Ventures", url: "https://www.indexventures.com/portfolio" },
  { name: "Bessemer", url: "https://www.bvp.com/portfolio" },
  { name: "GGV Capital", url: "https://www.ggvc.com/portfolio/" },
  // Tier 2: Tech-focused VCs
  { name: "Y Combinator", url: "https://www.ycombinator.com/companies" },
  { name: "Techstars", url: "https://www.techstars.com/portfolio" },
  { name: "500 Global", url: "https://500global.com/portfolio/" },
  { name: "SOSV", url: "https://sosv.com/portfolio/" },
  { name: "Lerer Hippeau", url: "https://www.lererhippeau.com/portfolio" },
  {
    name: "General Catalyst",
    url: "https://www.generalcatalyst.com/companies",
  },
  { name: "Kleiner Perkins", url: "https://www.kleinerperkins.com/portfolio/" },
  { name: "NEA", url: "https://www.nea.com/portfolio/" },
  { name: "IVP", url: "https://ivp.com/portfolio/" },
  { name: "Battery Ventures", url: "https://www.battery.com/portfolio/" },
  { name: "Shasta Ventures", url: "https://www.shastaventures.com/portfolio" },
  { name: "Felicis", url: "https://www.felicis.com/portfolio" },
  { name: "Thrive Capital", url: "https://thrivectrl.com/portfolio" },
  { name: "Coatue", url: "https://www.coatue.com/portfolio" },
  { name: "Tiger Global", url: "https://www.tigerglobal.com/portfolio" },
  // Tier 3: Seed/early-stage focused
  { name: "First Round", url: "https://firstround.com/portfolio/" },
  { name: "CRV", url: "https://www.cr.vc/portfolio" },
  {
    name: "Foundation Capital",
    url: "https://www.foundationcapital.com/portfolio",
  },
  { name: "Forerunner", url: "https://www.forerunnerventures.com/portfolio" },
  { name: "Homebrew", url: "https://homebrew.co/portfolio" },
  { name: "Maveron", url: "https://www.maveron.com/portfolio" },
  { name: "Precursor", url: "https://www.precursorvc.com/portfolio" },
  { name: "Boldstart", url: "https://boldstart.vc/portfolio" },
  { name: "Ludlow", url: "https://www.ludlowventures.com/portfolio" },
  { name: "Eniac", url: "https://eniac.vc/portfolio" },
  { name: "Correlation", url: "https://www.correlationvc.com/portfolio" },
  {
    name: "Founders Collective",
    url: "https://www.founderscollective.com/portfolio",
  },
  { name: "Next View", url: "https://nextview.vc/portfolio" },
  { name: "Point Nine", url: "https://pointnine.vc/portfolio" },
  // Tier 4: International / specialist
  { name: "Northzone", url: "https://www.northzone.com/portfolio" },
  { name: "Atomico", url: "https://www.atomico.com/portfolio" },
  { name: "Balderton", url: "https://www.balderton.com/portfolio" },
  { name: "Octopus", url: "https://octopusventures.vc/portfolio" },
  { name: "Hoxton", url: "https://hoxtonventures.com/portfolio" },
  { name: "Seedcamp", url: "https://seedcamp.com/portfolio" },
  { name: "M13", url: "https://m13.vc/portfolio" },
  { name: "Gradient", url: "https://www.gradient.vc/portfolio" },
  { name: "K9", url: "https://www.k9.vc/portfolio" },
  {
    name: "South Park Commons",
    url: "https://www.southparkcommons.com/portfolio",
  },
  { name: "Long Journey", url: "https://www.longjourney.vc/portfolio" },
  { name: "Peak State", url: "https://www.peakstate.vc/portfolio" },
  // Tier 5: Sprint 4 Task 3 expansion — European, APAC, niche/vertical VCs.
  // Each URL was verified to resolve to a portfolio page before adding.
  // European VCs
  { name: "Cherry Ventures", url: "https://www.cherry.vc/portfolio/" },
  { name: "Earlybird", url: "https://earlybird.com/companies" },
  { name: "Speedinvest", url: "https://speedinvest.com/portfolio" },
  { name: "Project A", url: "https://www.project-a.com/portfolio" },
  { name: "La Famiglia", url: "https://www.lafamiglia.vc/portfolio" },
  { name: "b2venture", url: "https://b2venture.vc/portfolio" },
  // APAC VCs
  {
    name: "Peak XV (Sequoia India/SEA)",
    url: "https://www.peakxv.com/our-companies",
  },
  { name: "Jungle Ventures", url: "https://www.jungle.vc/portfolio" },
  { name: "Monk's Hill Ventures", url: "https://www.monkshill.com/portfolio" },
  { name: "Beenext", url: "https://www.beenext.com/portfolio/" },
  { name: "Qualgro", url: "https://qualgro.com/portfolio" },
  // Niche / vertical VCs (deep tech, climate, sustainability, B2B SaaS)
  { name: "Lux Capital", url: "https://www.luxcapital.com/companies" },
  { name: "Obvious Ventures", url: "https://obvious.com/portfolio/" },
  { name: "Congruent Ventures", url: "https://www.congruentvc.com/portfolio" },
  {
    name: "Energy Impact Partners",
    url: "https://www.energyimpactpartners.com/_portfolio/",
  },
  {
    name: "Engine Ventures (MIT)",
    url: "https://engineventures.com/companies",
  },
  { name: "E14 Fund (MIT)", url: "https://www.e14.vc/companies" },
  { name: "Ridge Ventures", url: "https://ridge.vc/entire-portfolio/" },
  { name: "Bowery Capital", url: "https://bowerycap.com/portfolio" },
  // Tier 6: Sprint 4 validation expansion — additional European, APAC, and
  // vertical-focused VCs to reach the 73+ target from the handoff spec.
  // European VCs (continued)
  { name: "Heartfelt", url: "https://heartfelt.vc/portfolio" },
  { name: "btov Partners", url: "https://btov.vc/portfolio" },
  { name: "Connexa Capital", url: "https://connexa.capital/portfolio" },
  { name: "InReach Ventures", url: "https://inreachventures.com/portfolio" },
  { name: "Kizoo Capital", url: "https://kizoo.com/portfolio" },
  { name: "Molten Ventures", url: "https://www.moltenvc.com/portfolio" },
  // APAC VCs (continued)
  { name: "Ananta Ventures", url: "https://anantaventures.com/portfolio" },
  { name: "Gateway Partners", url: "https://gatewaypartners.com/portfolio" },
  { name: "Helion Ventures", url: "https://helionvc.com/portfolio" },
  // Vertical / deep tech / climate / B2B
  { name: "Social Capital", url: "https://socialcapital.com/portfolio" },
  { name: "G2 Venture Partners", url: "https://g2vp.com/portfolio" },
  { name: "Powerhouse Ventures", url: "https://powerhouse.fund/portfolio" },
  { name: "Amity Ventures", url: "https://amityventures.com/portfolio" },
];

// ── Domains to exclude (not company websites) ────────────────────────────────

const EXCLUDED_DOMAINS = [
  "twitter.com",
  "x.com",
  "linkedin.com",
  "facebook.com",
  "crunchbase.com",
  "github.com",
  "angel.co",
  "wellfound.com",
  "youtube.com",
  "instagram.com",
  "medium.com",
  "substack.com",
  "wikipedia.org",
];

// ── Pure function: extract companies from HTML ───────────────────────────────

/**
 * Extract company names + website links from a VC portfolio page's HTML.
 *
 * Uses cheerio for DOM parsing. The extraction strategy:
 *   1. If a CSS selector is provided, find all <a> tags within that selector
 *   2. Otherwise, find all <a> tags with an href containing "http"
 *   3. Filter out links to social media, navigation, and the VC's own domain
 *   4. Use the link text as the company name
 *   5. Use the href as the company website
 *
 * @param html          The HTML content of the portfolio page
 * @param vcName        The VC name (for provenance)
 * @param selector      Optional CSS selector for targeted extraction
 * @param portfolioUrl  The portfolio page URL (to exclude self-links)
 * @returns             Array of extracted companies
 */
export function extractCompaniesFromHtml(
  html: string,
  vcName: string,
  selector?: string,
  portfolioUrl?: string,
): ExtractedCompany[] {
  const $ = cheerio.load(html);
  const companies: ExtractedCompany[] = [];
  const seen = new Set<string>();

  // Determine the VC's own domain to exclude self-links
  let vcDomain = "";
  if (portfolioUrl) {
    try {
      vcDomain = new URL(portfolioUrl).hostname.toLowerCase();
    } catch {
      // Invalid URL — skip
    }
  }

  // Find all <a> tags
  const links = selector ? $(selector).find("a") : $("a");

  $(links).each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim();

    // Must have both href and text
    if (!href || !text) return;

    // Must be an external HTTP/HTTPS link
    if (!href.startsWith("http://") && !href.startsWith("https://")) return;

    // Parse the URL to get the hostname
    let hostname: string;
    try {
      hostname = new URL(href).hostname.toLowerCase();
    } catch {
      return;
    }

    // Exclude the VC's own domain
    if (
      vcDomain &&
      (hostname === vcDomain || hostname.endsWith(`.${vcDomain}`))
    ) {
      return;
    }

    // Exclude social media and known non-company domains
    for (const excluded of EXCLUDED_DOMAINS) {
      if (hostname === excluded || hostname.endsWith(`.${excluded}`)) {
        return;
      }
    }

    // Skip if the text is too short (likely not a company name) or too long
    // (likely a description, not a name)
    if (text.length < 2 || text.length > 100) return;

    // Skip common non-company link texts
    const lowerText = text.toLowerCase();
    if (
      [
        "learn more",
        "read more",
        "view more",
        "visit",
        "website",
        "apply",
        "contact",
        "about",
        "team",
        "blog",
      ].some((phrase) => lowerText === phrase)
    ) {
      return;
    }

    // Deduplicate by hostname
    if (seen.has(hostname)) return;
    seen.add(hostname);

    companies.push({
      name: text,
      website: href,
      vcName,
    });
  });

  return companies;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the VC portfolio mining seeder. Fetches each VC's portfolio page,
 * extracts company names + websites, and runs them through the Slugger.
 *
 * @param fetchFn   Injectable fetch (defaults to global fetch)
 * @param sources   VC portfolio sources (defaults to the curated list)
 * @returns         Result with counts and any errors
 */
export async function runVcPortfolioSeeder(
  fetchFn: FetchFn = fetch,
  sources: VcPortfolioSource[] = VC_PORTFOLIO_SOURCES,
): Promise<VcPortfolioResult> {
  let totalCompaniesExtracted = 0;
  let pagesFetched = 0;
  let pagesFailed = 0;
  let resolved = 0;
  let unresolved = 0;

  try {
    for (const source of sources) {
      try {
        const response = await fetchFn(source.url);
        if (!response.ok) {
          pagesFailed++;
          continue;
        }

        const html = await response.text();
        pagesFetched++;

        const companies = extractCompaniesFromHtml(
          html,
          source.name,
          source.companySelector,
          source.url,
        );

        totalCompaniesExtracted += companies.length;

        // Run each company through the Slugger
        for (const company of companies) {
          const result: SluggerResult = await resolveSlugger(
            {
              companyName: company.name,
              website: company.website,
              discoverySource: "vc_portfolio",
              discoveryContext: `vc:${source.name} company:${company.name}`,
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
        }
      } catch {
        // Individual VC page failure — continue to next VC
        pagesFailed++;
      }
    }

    return {
      totalCompaniesExtracted,
      resolved,
      unresolved,
      pagesFetched,
      pagesFailed,
    };
  } catch (error) {
    return {
      totalCompaniesExtracted,
      resolved,
      unresolved,
      pagesFetched,
      pagesFailed,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
