// The Slugger — Company Name → ATS Slug Resolution (F1 + F3)
// src/lib/jobs/seeders/slugger.ts
//
// The Slugger resolves company names (not just URLs) to ATS slugs. It's the
// foundation for all name-based discovery sources (YC, VC portfolios, Remote
// OK, Product Hunt, etc.).
//
// Resolution pipeline (3 stages):
//   Stage 0: DB cache — check if we already have this company by canonicalName
//   Stage 1: CNAME check — if a website URL is provided, DNS CNAME lookup
//   Stage 2: Slug probe — try each name variant against each ATS API
//
// Companies that fail all 3 stages are stored in slugger_retry for later
// retry (30/60/90 days — companies may configure ATS later, post-funding).
//
// See TDD §1.4 for the full specification.

import { and, eq } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { sluggerRetry } from "@/db/schemas/jobs/sluggerRetry";
import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import { recordDiscoverySource } from "@/lib/jobs/quality/fusion-score";
import type { FetchFn } from "@/lib/jobs/types";
import { isAggregator } from "./aggregator-blacklist";
import {
  type CompanyTier,
  countGateZeroJobs,
  type QualityProbeResult,
} from "./quality-probe";
import {
  CNAME_ATS_MAP,
  defaultResolveCname,
  inferSlugFromHostname,
  looksLikeValidAtsResponse,
  type ResolveCnameFn,
} from "./resolve-custom-url";
import type { DiscoverySource } from "./schemas";

// ── All ATS sources (for probing when no atsHint is provided) ────────────────

const ATS_SOURCES: AtsSource[] = [
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "workable",
  "recruitee",
];

// ── Types ────────────────────────────────────────────────────────────────────

export interface SluggerInput {
  companyName: string;
  website?: string; // optional — if available, extract domain for CNAME check
  atsHint?: AtsSource; // optional — if from BigQuery, probe only this ATS
  discoverySource?: DiscoverySource; // for retry queue provenance
  discoveryContext?: string; // for retry queue provenance
  // v2 Corpus Expansion: scoring-signal fields (optional — legacy seeders omit).
  // Passed through to the company row on insert. See governing doc Criterion 3.
  employeeCount?: number; // estimated from funding-signal metadata
  isPublic?: boolean; // true for publicly-listed companies
  isAgency?: boolean; // pre-flagged agencies (usually set by blacklist at insert)
}

export type SluggerResult =
  | {
      success: true;
      atsSource: AtsSource;
      atsSlug: string;
      resolvedBy: "db_cache" | "cname" | "slug_probe";
      canonicalName: string;
      /** Q1: Quality probe result (only present when insertCompany=true). */
      qualityProbe?: QualityProbeResult;
      /** Q1: Company UUID if inserted into the company table. */
      companyId?: string | null;
    }
  | {
      success: false;
      canonicalName: string;
    };

// ── Pure functions: name normalization (F3) ──────────────────────────────────

/**
 * Canonicalize a company name for deduplication.
 * Handles: "Stripe Inc" → "stripe", "Klarna Bank AB" → "klarna",
 * "23andMe" → "23andme", "Docker Inc." → "docker"
 */
export function canonicalizeCompanyName(input: string): string {
  let name = input.trim().toLowerCase();
  // Strip common corporate suffixes
  const suffixes = [
    /\s+(inc|llc|ltd|corp|corporation|gmbh|ab|oy|as|sa|sas|sarl|bv|nv|plc|limited|co)\.?\s*$/i,
    /\s+(holdings|holding|group|ventures|labs|technologies|technology|systems|solutions|software|platforms)\s*$/i,
  ];
  for (const re of suffixes) name = name.replace(re, "");
  // Remove punctuation except hyphens and dots within names
  name = name.replace(/[,.]/g, "").replace(/\s+/g, "");
  return name;
}

/**
 * Generate candidate slug variants from a company name.
 * "Buffalo Wild Wings" → ["buffalowildwings", "buffalo", "bww"]
 * "23andMe" → ["23andme"]
 */
export function generateSlugVariants(companyName: string): string[] {
  const canonical = canonicalizeCompanyName(companyName);
  const variants = new Set<string>([canonical]);
  // First word as slug (common for long names)
  const words = companyName.trim().toLowerCase().split(/\s+/);
  if (words.length > 1) variants.add(words[0]);
  // Acronym (first letters of each word)
  if (words.length >= 2) {
    const acronym = words
      .map((w) => w[0])
      .filter((c) => c && /[a-z0-9]/i.test(c))
      .join("");
    if (acronym.length >= 2) variants.add(acronym);
  }
  return [...variants];
}

// ── DB cache check ───────────────────────────────────────────────────────────

interface DbCacheResult {
  atsSource: AtsSource;
  atsSlug: string;
}

/**
 * Check if a company with the given canonicalName already exists in the
 * company table. Returns the ATS source + slug if found, null otherwise.
 *
 * This is Stage 0 of the resolution pipeline — a DB cache hit means we
 * already know this company and don't need to probe ATS APIs.
 */
export async function checkDbCache(
  canonicalName: string,
): Promise<DbCacheResult | null> {
  const result = await db
    .select({
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
    })
    .from(company)
    .where(eq(company.canonicalName, canonicalName))
    .limit(1);

  if (result.length === 0) return null;
  return {
    atsSource: result[0].atsSource as AtsSource,
    atsSlug: result[0].atsSlug,
  };
}

// ── CNAME resolution (Stage 1) ───────────────────────────────────────────────

/**
 * Extract the hostname from a URL string.
 * "https://careers.acme.com" → "careers.acme.com"
 */
function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Try to resolve a company's ATS via DNS CNAME lookup on their website.
 * If the website's CNAME points to a known ATS host (e.g. boards.greenhouse.io),
 * we can infer the ATS source and slug.
 */
async function tryCname(
  website: string,
  resolveCname: ResolveCnameFn,
): Promise<DbCacheResult | null> {
  const hostname = extractHostname(website);
  if (!hostname) return null;

  try {
    const cnames = await resolveCname(hostname);

    for (const cname of cnames) {
      const normalized = cname.toLowerCase().trim();

      for (const [atsHost, source] of Object.entries(CNAME_ATS_MAP)) {
        if (normalized === atsHost || normalized.endsWith(`.${atsHost}`)) {
          const slug = inferSlugFromHostname(hostname);
          if (slug) {
            return { atsSource: source, atsSlug: slug };
          }
        }
      }
    }
  } catch {
    // DNS lookup failed — fall through to slug probe.
  }

  return null;
}

// ── Slug probe (Stage 2) ─────────────────────────────────────────────────────

/**
 * Probe a single ATS API with a candidate slug. Returns true if the ATS
 * responds with valid JSON (the slug exists), false otherwise.
 *
 * Uses the rate limiter to respect per-ATS rate limits (2 req/s).
 */
async function probeSlug(
  atsSource: AtsSource,
  slug: string,
  fetchFn: FetchFn,
): Promise<boolean> {
  const endpoint = getAtsEndpoint(atsSource);
  const url = endpoint.jobsList(slug);

  try {
    const response = await fetchFn(url);
    if (!response.ok) return false;

    const text = await response.text();
    return looksLikeValidAtsResponse(text, atsSource);
  } catch {
    return false;
  }
}

// ── Retry queue ──────────────────────────────────────────────────────────────

/**
 * Validate a company name before adding to the retry queue.
 * (Directive 12, Step 4.2): Rejects garbage entries — URLs, code snippets,
 * emoji, non-alpha strings, and strings too short to be a company name.
 */
function isValidCompanyName(name: string): boolean {
  if (!name || name.length < 3) return false;
  // Must contain at least 2 alphabetic characters
  const alphaCount = (name.match(/[A-Za-z]/g) || []).length;
  if (alphaCount < 2) return false;
  // Reject URLs
  if (/^(https?:\/\/|www\.)/i.test(name)) return false;
  if (/\.com\//i.test(name)) return false;
  // Reject code syntax
  if (/async|await|=>|function\s*\(/i.test(name)) return false;
  // Reject version strings
  if (/^v\d+\.\d+/i.test(name)) return false;
  return true;
}

/**
 * Add a company to the slugger retry queue. The company will be retried
 * after 7 days (then 14, then 30 — companies may configure ATS later,
 * especially post-funding).
 *
 * (Directive 12, Step 4.2): Validation gate added — garbage entries (URLs,
 * code snippets, emoji) are rejected before insertion. Backoff shortened
 * from 30/60/90 to 7/14/30 days.
 */
export async function addToRetryQueue(input: SluggerInput): Promise<void> {
  // Validation gate — reject garbage before insertion
  if (!isValidCompanyName(input.companyName)) {
    return; // Silently skip — garbage entries don't belong in the retry queue
  }

  const retryDelayDays = 7; // shortened from 30 (Directive 12)
  const nextRetryAt = new Date();
  nextRetryAt.setDate(nextRetryAt.getDate() + retryDelayDays);

  await db.insert(sluggerRetry).values({
    companyName: input.companyName,
    website: input.website,
    discoverySource: (input.discoverySource ?? "manual") as DiscoverySource,
    discoveryContext: input.discoveryContext,
    retryCount: 0,
    nextRetryAt,
  });
}

// ── Company insertion (Q1: Quality Probe at Insertion) ───────────────────────

/**
 * Insert a resolved company into the company table with the initial tier
 * determined by the quality probe. Uses `onConflictDoNothing()` — if the
 * company already exists (re-discovered by a different seeder), the existing
 * row's tier/health/polling state is preserved.
 *
 * @returns  The company UUID if inserted, or null if it was a duplicate.
 */
async function insertResolvedCompany(
  input: SluggerInput,
  result: { atsSource: AtsSource; atsSlug: string; canonicalName: string },
  initialTier: CompanyTier,
): Promise<string | null> {
  // Aggregator blacklist — reject known job aggregators (Hirehangar, Ketryx,
  // etc.) that re-host listings from other companies' ATSs.
  if (isAggregator(result.atsSlug, result.canonicalName)) {
    console.warn(
      `[insertResolvedCompany] Rejected aggregator: atsSlug=${result.atsSlug}, name=${result.canonicalName}`,
    );
    return null;
  }

  const inserted = await db
    .insert(company)
    .values({
      atsSlug: result.atsSlug,
      atsSource: result.atsSource,
      canonicalName: result.canonicalName,
      companyName: input.companyName,
      discoverySource: (input.discoverySource ?? "manual") as DiscoverySource,
      discoveryContext: input.discoveryContext,
      tier: initialTier,
      // v2: pass through scoring-signal fields when the seeder provides them.
      ...(input.employeeCount !== undefined
        ? { employeeCount: input.employeeCount }
        : {}),
      ...(input.isPublic !== undefined ? { isPublic: input.isPublic } : {}),
      ...(input.isAgency !== undefined ? { isAgency: input.isAgency } : {}),
    })
    .onConflictDoNothing({
      target: [company.atsSource, company.atsSlug],
    })
    .returning({ id: company.id });

  return inserted.length > 0 ? inserted[0].id : null;
}

// ── Main resolution function ─────────────────────────────────────────────────

/**
 * Resolve a company name to an (atsSource, atsSlug) tuple via a 3-stage
 * pipeline: DB cache → CNAME check → slug probe.
 *
 * If all stages fail, the company is added to the slugger retry queue
 * (unless `addToRetryOnFailure` is false).
 *
 * @param input  The company name (required), website (optional), and ATS hint (optional)
 * @param opts   Injectable fetch and DNS resolver functions (for testing)
 */
export async function resolveSlugger(
  input: SluggerInput,
  opts: {
    fetchFn?: FetchFn;
    resolveCname?: ResolveCnameFn;
    checkDbCache?: (canonicalName: string) => Promise<DbCacheResult | null>;
    addToRetryOnFailure?: boolean;
    /** Q1: If true, insert the company into the company table after successful
     * resolution, with the initial tier determined by a quality probe. */
    insertCompany?: boolean;
  } = {},
): Promise<SluggerResult> {
  const canonical = canonicalizeCompanyName(input.companyName);
  const addToRetryOnFailure = opts.addToRetryOnFailure ?? true;
  const insertCompany = opts.insertCompany ?? false;
  const fetchFn = opts.fetchFn ?? fetch;

  // Helper: run quality probe + insert company after successful resolution
  async function finalizeResolution(
    atsSource: AtsSource,
    atsSlug: string,
    resolvedBy: "db_cache" | "cname" | "slug_probe",
  ): Promise<SluggerResult> {
    if (!insertCompany) {
      return {
        success: true,
        atsSource,
        atsSlug,
        resolvedBy,
        canonicalName: canonical,
      };
    }

    // Q1: Quality probe — count Gate 0 jobs and determine initial tier
    const probe = await countGateZeroJobs(atsSource, atsSlug, fetchFn);

    // Insert company with initial tier
    const companyId = await insertResolvedCompany(
      input,
      { atsSource, atsSlug, canonicalName: canonical },
      probe.initialTier,
    );

    // Q5: Multi-Intent Fusion Scoring — record the discovery source.
    // If this is a new company, recordDiscoverySource records the initial source
    // (fusionScore stays at 1). If it's a duplicate (companyId is null), we look
    // up the existing company and record the source — if it's a new source, the
    // fusion score is incremented.
    if (input.discoverySource) {
      const existingId =
        companyId ??
        (await db
          .select({ id: company.id })
          .from(company)
          .where(
            and(eq(company.atsSource, atsSource), eq(company.atsSlug, atsSlug)),
          )
          .limit(1)
          .then((rows) => rows[0]?.id ?? null));

      if (existingId) {
        await recordDiscoverySource(existingId, input.discoverySource);
      }
    }

    return {
      success: true,
      atsSource,
      atsSlug,
      resolvedBy,
      canonicalName: canonical,
      qualityProbe: probe,
      companyId,
    };
  }

  // Stage 0: DB cache — check if we already have this company
  const dbCacheFn = opts.checkDbCache ?? checkDbCache;
  const cached = await dbCacheFn(canonical);
  if (cached) {
    return finalizeResolution(cached.atsSource, cached.atsSlug, "db_cache");
  }

  // Stage 1: If website provided, try CNAME check
  if (input.website) {
    const resolveCname = opts.resolveCname ?? defaultResolveCname;
    const cnameResult = await tryCname(input.website, resolveCname);
    if (cnameResult) {
      return finalizeResolution(
        cnameResult.atsSource,
        cnameResult.atsSlug,
        "cname",
      );
    }
  }

  // Stage 2: Slug probe — try each variant against each ATS
  const variants = generateSlugVariants(input.companyName);
  const atsSources = input.atsHint ? [input.atsHint] : ATS_SOURCES;

  for (const slug of variants) {
    for (const ats of atsSources) {
      const found = await probeSlug(ats, slug, fetchFn);
      if (found) {
        return finalizeResolution(ats, slug, "slug_probe");
      }
    }
  }

  // All stages failed — add to retry queue
  if (addToRetryOnFailure) {
    await addToRetryQueue(input);
  }

  return { success: false, canonicalName: canonical };
}
