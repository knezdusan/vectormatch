// B11: Getro Network Company-Discovery Seeder
// src/lib/jobs/seeders/batch-sources/getro.ts
//
// Queries Getro-powered VC portfolio job board networks for their portfolio
// companies, then resolves each company to an ATS slug via the Slugger.
//
// Getro (getro.com) powers job boards for 850+ VCs, SaaS companies, and
// recruitment firms. Each network has a public-facing job board at
// {network}.getro.com and a private API at api.getro.com/v2/networks/:id/.
//
// ── API ──────────────────────────────────────────────────────────────────────
// GET https://api.getro.com/v2/networks/:networkId/companies
//   Headers:
//     Authorization: Bearer <API_KEY>
//     Accept: application/json
//   Query params:
//     page (1-indexed), per_page (max 100)
//     job_functions (pipe-separated, e.g. "Software Engineering")
//     locations (pipe-separated, e.g. "remote|earth")
//
// Response: { companies: [...], meta: { total_pages, current_page } }
// Each company: { id, name, website, description, job_count, ... }
//
// ── Rate limit ───────────────────────────────────────────────────────────────
// 30 requests/minute. Paginate evenly. Per_page max 100.
//
// ── Discovery source ─────────────────────────────────────────────────────────
// Uses "vc_portfolio" (Getro networks ARE VC portfolios). The discoveryContext
// field carries "getro:{networkId}" for provenance. A dedicated "getro" enum
// value can be added in a future migration if volume warrants.
//
// ── Network selection ────────────────────────────────────────────────────────
// Tech-dense VC-portfolio Getro networks (S32, Jobs-in-VC, HV Capital) resolve
// to ATSs far better than non-profit/consulting ones. The NETWORK_IDS env var
// is a pipe-separated list of Getro network IDs to query.
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 50-200 companies per tech-dense network (varies by network size).
// Resolution rate to ATS: 30-60% (VC-backed startups predominantly use
// Greenhouse/Lever/Ashby).
//
// ── Auth ─────────────────────────────────────────────────────────────────────
// GETRO_API_KEY env var (Bearer token). Dux must obtain this from the Getro
// Admin Portal (getro.com/app → API Keys). Without it, the adapter returns
// an auth error — no companies are discovered.

import { z } from "zod";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const GETRO_API_BASE = "https://api.getro.com/v2";
const PER_PAGE = 100;
/** Max pages per network (safety cap — 100 pages × 100 = 10,000 companies). */
const MAX_PAGES = 100;
/** Delay between API pages (ms) — respect 30 req/min rate limit. */
const PAGE_DELAY_MS = 2100; // ~28 req/min, just under the 30/min cap

// ── Types ────────────────────────────────────────────────────────────────────

/** A company discovered from a Getro network. */
export interface GetroCompany {
  id: number | string;
  name: string;
  website: string | null;
  jobCount: number;
  /** Getro network ID this company was discovered from. */
  networkId: string;
}

/** Result of a Getro discovery run for a single network. */
export interface GetroNetworkResult {
  networkId: string;
  totalCompanies: number;
  companiesWithWebsite: number;
  resolved: number;
  unresolved: number;
  pagesFetched: number;
  error?: string;
}

/** Aggregate result across all configured networks. */
export interface GetroDiscoveryResult {
  networks: GetroNetworkResult[];
  totalCompanies: number;
  totalResolved: number;
  totalUnresolved: number;
  error?: string;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const getroCompanySchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string(),
    website: z.string().nullable().optional(),
    description: z.string().optional(),
    job_count: z.number().optional(),
    // Getro returns additional fields (industry, locations, etc.) we don't use.
  })
  .passthrough();

const getroCompaniesResponseSchema = z
  .object({
    companies: z.array(getroCompanySchema).default([]),
    meta: z
      .object({
        total_pages: z.number().optional(),
        current_page: z.number().optional(),
      })
      .optional(),
  })
  .passthrough();

// ── Pure functions ───────────────────────────────────────────────────────────

/**
 * Filter Getro companies for those with a non-empty website.
 * Companies without a website can't be CNAME-resolved or slug-probed.
 */
export function filterCompaniesWithWebsite(
  companies: GetroCompany[],
): GetroCompany[] {
  return companies.filter((c) => c.website && c.website.length > 0);
}

/**
 * Extract a clean domain from a website URL for the Slugger.
 * Handles "https://example.com", "http://www.example.com/", "example.com".
 */
export function extractDomain(website: string): string {
  try {
    const url = new URL(
      website.startsWith("http") ? website : `https://${website}`,
    );
    return url.hostname.replace(/^www\./, "");
  } catch {
    // Not a valid URL — return as-is and let the Slugger handle it.
    return website
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .split("/")[0];
  }
}

// ── API client ───────────────────────────────────────────────────────────────

/**
 * Fetch a single page of companies from a Getro network.
 *
 * @param networkId   Getro network ID (from the admin portal URL)
 * @param apiKey      Getro API key (Bearer token)
 * @param fetchFn     Injectable fetch function
 * @param page        Page number (1-indexed per Getro API convention)
 * @returns           Parsed companies + pagination metadata
 */
async function fetchGetroPage(
  networkId: string,
  apiKey: string,
  fetchFn: FetchFn,
  page: number,
): Promise<{ companies: GetroCompany[]; totalPages?: number }> {
  const url = new URL(`${GETRO_API_BASE}/networks/${networkId}/companies`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(PER_PAGE));

  const response = await fetchFn(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `Getro API HTTP ${response.status} ${response.statusText} for network ${networkId} page ${page}`,
    );
  }

  const raw = await response.json();
  const parsed = getroCompaniesResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Getro API returned unexpected response shape for network ${networkId}: ${parsed.error.message}`,
    );
  }

  const companies: GetroCompany[] = parsed.data.companies.map((c) => ({
    id: c.id,
    name: c.name,
    website: c.website ?? null,
    jobCount: c.job_count ?? 0,
    networkId,
  }));

  return {
    companies,
    totalPages: parsed.data.meta?.total_pages,
  };
}

// ── Main discovery function ──────────────────────────────────────────────────

/**
 * Discover companies from a single Getro network and resolve them to ATS slugs.
 *
 * This is the primary L2 company-discovery mechanism: Getro networks aggregate
 * jobs from their portfolio companies, and those companies predominantly use
 * ATSs (Greenhouse/Lever/Ashby). The Slugger resolves each company name +
 * website to an ATS slug, ready for probation-poll enrollment.
 *
 * @param networkId   Getro network ID
 * @param apiKey      Getro API key
 * @param fetchFn     Injectable fetch function (defaults to global fetch)
 * @param dryRun      If true, discover + log but do NOT resolve via Slugger
 *                    (avoids DB writes — for census/dry-run mode)
 * @returns           Discovery + resolution results
 */
export async function discoverGetroNetwork(
  networkId: string,
  apiKey: string,
  fetchFn: FetchFn = fetch,
  dryRun = false,
): Promise<GetroNetworkResult> {
  const allCompanies: GetroCompany[] = [];
  let totalPages: number | undefined;
  let pagesFetched = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    try {
      const { companies, totalPages: tp } = await fetchGetroPage(
        networkId,
        apiKey,
        fetchFn,
        page,
      );
      allCompanies.push(...companies);
      pagesFetched++;
      if (tp !== undefined) totalPages = tp;

      // Stop if we've fetched all pages or got an empty page.
      if (companies.length === 0) break;
      if (totalPages !== undefined && page >= totalPages) break;

      // Rate limit: ~28 req/min.
      if (page < (totalPages ?? MAX_PAGES)) {
        await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
      }
    } catch (err) {
      return {
        networkId,
        totalCompanies: allCompanies.length,
        companiesWithWebsite: filterCompaniesWithWebsite(allCompanies).length,
        resolved: 0,
        unresolved: 0,
        pagesFetched,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const withWebsite = filterCompaniesWithWebsite(allCompanies);

  // Dry-run mode: discover only, no Slugger resolution (no DB writes).
  if (dryRun) {
    return {
      networkId,
      totalCompanies: allCompanies.length,
      companiesWithWebsite: withWebsite.length,
      resolved: 0,
      unresolved: withWebsite.length,
      pagesFetched,
    };
  }

  // Resolve each company via the Slugger (3-stage: DB cache → CNAME → slug probe).
  let resolved = 0;
  let unresolved = 0;

  for (const company of withWebsite) {
    try {
      const result: SluggerResult = await resolveSlugger({
        companyName: company.name,
        website: extractDomain(company.website ?? ""),
        discoverySource: "vc_portfolio",
        discoveryContext: `getro:${networkId}`,
      });

      if (result.success) {
        resolved++;
      } else {
        unresolved++;
      }
    } catch {
      // Slugger errors are non-fatal — count as unresolved.
      unresolved++;
    }
  }

  return {
    networkId,
    totalCompanies: allCompanies.length,
    companiesWithWebsite: withWebsite.length,
    resolved,
    unresolved,
    pagesFetched,
  };
}

/**
 * Discover companies from all configured Getro networks.
 *
 * Reads network IDs from the GETRO_NETWORK_IDS env var (pipe-separated).
 * Reads the API key from GETRO_API_KEY.
 *
 * @param fetchFn     Injectable fetch function
 * @param dryRun      If true, discover only without Slugger resolution
 * @returns           Aggregate results across all networks
 */
export async function runGetroDiscovery(
  fetchFn: FetchFn = fetch,
  dryRun = false,
): Promise<GetroDiscoveryResult> {
  const apiKey = process.env.GETRO_API_KEY;
  const networkIdsRaw = process.env.GETRO_NETWORK_IDS;

  if (!apiKey) {
    return {
      networks: [],
      totalCompanies: 0,
      totalResolved: 0,
      totalUnresolved: 0,
      error:
        "GETRO_API_KEY env var not set — Dux must obtain a key from getro.com/app",
    };
  }

  if (!networkIdsRaw) {
    return {
      networks: [],
      totalCompanies: 0,
      totalResolved: 0,
      totalUnresolved: 0,
      error:
        "GETRO_NETWORK_IDS env var not set — pipe-separated list of Getro network IDs",
    };
  }

  const networkIds = networkIdsRaw
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
  const results: GetroNetworkResult[] = [];

  for (const networkId of networkIds) {
    const result = await discoverGetroNetwork(
      networkId,
      apiKey,
      fetchFn,
      dryRun,
    );
    results.push(result);

    // Rate limit between networks.
    if (networkId !== networkIds[networkIds.length - 1]) {
      await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
    }
  }

  return {
    networks: results,
    totalCompanies: results.reduce((s, r) => s + r.totalCompanies, 0),
    totalResolved: results.reduce((s, r) => s + r.resolved, 0),
    totalUnresolved: results.reduce((s, r) => s + r.unresolved, 0),
  };
}
