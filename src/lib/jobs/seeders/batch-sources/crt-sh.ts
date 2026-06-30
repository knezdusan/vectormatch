// B8: crt.sh Certificate Transparency Seeder (Sprint 4 Task 2)
// src/lib/jobs/seeders/batch-sources/crt-sh.ts
//
// Queries crt.sh — a free, public Certificate Transparency log search engine —
// for historical TLS certificates issued for ATS domains. This restores the
// coverage lost when Rapid7 FDNS (B8) was disabled (commercial licensing).
//
// crt.sh supports wildcard queries via the `%` character (URL-encoded as `%25`):
//   https://crt.sh/?q=%25.boards.greenhouse.io&output=json
// Returns a JSON array of certificate objects. The `name_value` field contains
// the domain (may have multiple domains separated by `\n`).
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Query crt.sh for each ATS domain (boards.greenhouse.io, jobs.lever.co, etc.)
// 2. Parse the JSON response, extract `name_value` domains
// 3. Extract the company slug from each certificate domain
// 4. Insert directly into the company table (no Slugger needed — the slugs are
//    ATS-native, same as Wayback CDX)
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 300-1,000 companies (historical CT log coverage of ATS-hosted job boards).
//
// See CORPUS_EXPANSION_HANDOFF.md Sprint 4 Task 2 for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import type { InsertResult } from "@/lib/jobs/seeders/company-repository";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const CRT_SH_API_URL = "https://crt.sh/";

/** Delay between crt.sh queries (ms) — be respectful to the free service. */
const QUERY_DELAY_MS = 500;

/**
 * ATS domains to query via crt.sh, mapped to their ATS source. Same set as
 * D6 CertStream + the (disabled) Rapid7 FDNS B8 source.
 */
const ATS_CRT_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

/** Subdomain labels that are not company slugs. */
const NON_SLUG_LABELS = ["www", "mail", "api", "blog", "cdn", "static"];

// ── Types ────────────────────────────────────────────────────────────────────

export interface CrtShResult {
  /** Total certificate rows found across all ATS domains. */
  totalRows: number;
  /** Unique company slugs extracted. */
  uniqueCompanySlugs: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if the API call failed. */
  error?: string;
}

// ── Pure function: extract slug from a certificate domain ────────────────────

/**
 * Extract the company slug from a certificate domain.
 *
 * For most ATS platforms, the slug is the first subdomain label:
 *   acme.boards.greenhouse.io → "acme"
 *
 * For Recruitee, the slug is the first subdomain label:
 *   acme.recruitee.com → "acme"
 *
 * Filters out:
 *   - Wildcard certs (`*.boards.greenhouse.io`)
 *   - Bare domains (no subdomain, e.g. `boards.greenhouse.io` itself)
 *   - Common non-slug subdomains (`www`, `mail`, `api`)
 *
 * @param domain     The certificate domain (e.g. "acme.boards.greenhouse.io")
 * @param atsDomain  The ATS domain being queried (e.g. "boards.greenhouse.io")
 * @param atsSource  The ATS source for this query
 * @returns          { slug, source } or null if it can't be extracted
 */
export function extractSlugFromCertDomain(
  domain: string,
  atsDomain: string,
  atsSource: AtsSource,
): { slug: string; source: AtsSource } | null {
  const hostname = domain.toLowerCase().trim();

  // Reject wildcard certs — they don't identify a single company.
  if (hostname.startsWith("*.")) return null;

  // Must be a subdomain of the ATS domain.
  if (hostname !== atsDomain && !hostname.endsWith(`.${atsDomain}`)) {
    return null;
  }

  // Strip the ATS domain suffix to get the leading labels.
  const prefix =
    hostname === atsDomain ? "" : hostname.slice(0, -atsDomain.length - 1);
  if (prefix.length === 0) return null; // bare domain — no slug

  // The slug is the first (leftmost) label. Multi-level subdomains
  // (e.g. "careers.acme.boards.greenhouse.io") are rare for ATS boards; we
  // take the leftmost non-slug label. If the leftmost is a known non-slug
  // label, skip — it's infrastructure, not a company.
  const labels = prefix.split(".");
  const slug = labels[0];
  if (!slug || NON_SLUG_LABELS.includes(slug)) return null;

  return { slug, source: atsSource };
}

// ── Pure function: extract company inputs from crt.sh JSON response ──────────

/**
 * Parse the crt.sh JSON response and extract unique (slug, source) pairs.
 *
 * The crt.sh response is a JSON array of certificate objects. Each object has
 * a `name_value` field that may contain multiple domains separated by `\n`.
 *
 * @param json       The parsed crt.sh JSON response (array of objects)
 * @param atsDomain  The ATS domain being queried
 * @param atsSource  The ATS source for this query
 * @returns          Array of unique SeedCompanyInput tuples
 */
export function extractCompaniesFromCrtResponse(
  json: unknown,
  atsDomain: string,
  atsSource: AtsSource,
): SeedCompanyInput[] {
  if (!Array.isArray(json)) return [];

  const seen = new Set<string>();
  const inputs: SeedCompanyInput[] = [];

  for (const entry of json) {
    if (typeof entry !== "object" || entry === null) continue;
    const nameValue = (entry as Record<string, unknown>).name_value;
    if (typeof nameValue !== "string") continue;

    // name_value may contain multiple domains separated by \n
    for (const rawDomain of nameValue.split("\n")) {
      const domain = rawDomain.trim();
      if (domain.length === 0) continue;

      const extracted = extractSlugFromCertDomain(domain, atsDomain, atsSource);
      if (!extracted) continue;

      const key = `${extracted.source}:${extracted.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      inputs.push({
        atsSlug: extracted.slug,
        atsSource: extracted.source,
        discoverySource: "crt_sh",
        discoveryContext: `crt_sh:${domain}`,
      });
    }
  }

  return inputs;
}

// ── API client: query crt.sh for a single ATS domain ─────────────────────────

/**
 * Query crt.sh for certificates matching a single ATS domain (wildcard query).
 *
 * @param domain    The ATS domain to query (e.g. "boards.greenhouse.io")
 * @param fetchFn   Injectable fetch function
 * @returns         Parsed JSON array of certificate objects
 */
async function queryCrtSh(
  domain: string,
  fetchFn: FetchFn,
): Promise<unknown[]> {
  // %25 is URL-encoded % (wildcard). Query: %.{domain} matches any subdomain.
  const url = `${CRT_SH_API_URL}?q=%25.${domain}&output=json`;

  const response = await fetchFn(url);
  if (!response.ok) {
    throw new Error(`crt.sh returned HTTP ${response.status} for ${domain}`);
  }

  const json: unknown = await response.json();
  if (!Array.isArray(json)) {
    throw new Error(`crt.sh response for ${domain} is not an array`);
  }

  return json;
}

/** Promise-based delay helper. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the crt.sh Certificate Transparency seeder. Queries crt.sh for each ATS
 * domain, extracts company slugs from certificate domains, and inserts them
 * into the company table.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and insert metrics
 */
export async function runCrtShBatch(
  fetchFn: FetchFn = fetch,
): Promise<CrtShResult> {
  let totalRows = 0;
  const allInputs: SeedCompanyInput[] = [];
  const seenKeys = new Set<string>();

  try {
    for (let i = 0; i < ATS_CRT_DOMAINS.length; i++) {
      const { domain, source } = ATS_CRT_DOMAINS[i];

      // Be respectful to the free crt.sh service — delay between queries.
      if (i > 0) {
        await delay(QUERY_DELAY_MS);
      }

      try {
        const json = await queryCrtSh(domain, fetchFn);
        totalRows += json.length;

        const inputs = extractCompaniesFromCrtResponse(json, domain, source);
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
      },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
