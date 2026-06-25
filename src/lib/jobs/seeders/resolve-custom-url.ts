// Custom URL Resolver — CNAME + Slug Probe (TDD §4.1.2)
// src/lib/jobs/seeders/resolve-custom-url.ts
//
// Resolves non-ATS URLs (e.g. mystartup.com/careers) to an (atsSource, atsSlug)
// tuple via a two-stage autonomous process:
//
//   Stage 1 — DNS CNAME check: For careers.mystartup.com, do a DNS CNAME lookup.
//     If it resolves to boards.greenhouse.io or lever.co, the ATS is found.
//
//   Stage 2 — Slug probe: If CNAME fails, extract the company name from the URL
//     and try the slug against all three ATS APIs. If any returns valid JSON
//     with jobs, the ATS slug is found.
//
//   If both fail: discard the URL. The system is fully autonomous — no manual
//     review queue. Unresolvable URLs are logged for observability but not
//     acted upon.
//
// ── Injectable dependencies ──────────────────────────────────────────────────
// DNS resolution and HTTP fetching are injectable for testing. In production,
// the real `node:dns/promises` resolveCname and global fetch are used.
//
// ── Inngest integration (deferred) ───────────────────────────────────────────
// This runs as a separate Inngest function (`seeder/resolve-custom-url`),
// triggered by events from the HN seeder. The Inngest wrapper will be added
// in step 8. This module is the domain logic only.
//
// See TDD §4.1.2 for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import { getAtsEndpoint } from "@/lib/jobs/ats-endpoints";
import type { FetchFn } from "@/lib/jobs/types";
import type { SeedCompanyInput } from "./schemas";
import { extractRootDomain } from "./url-parser";

// ── Types ────────────────────────────────────────────────────────────────────

/** Injectable DNS CNAME resolver (matches node:dns/promises.resolveCname). */
export type ResolveCnameFn = (hostname: string) => Promise<string[]>;

/** The result of resolving a custom URL. */
export type ResolutionResult =
  | {
      success: true;
      input: SeedCompanyInput;
      /** Which stage succeeded: "cname" or "slug_probe". */
      resolvedBy: "cname" | "slug_probe";
    }
  | {
      success: false;
      url: string;
      /** Why resolution failed: "cname_failed", "slug_probe_failed", "invalid_url". */
      reason: string;
    };

// ── CNAME target → ATS source mapping ────────────────────────────────────────

const CNAME_ATS_MAP: Record<string, AtsSource> = {
  "boards.greenhouse.io": "greenhouse",
  "boards-api.greenhouse.io": "greenhouse",
  "jobs.lever.co": "lever",
  "api.lever.co": "lever",
  "api.ashbyhq.com": "ashby",
  "careers.ashbyhq.com": "ashby",
  "jobs.ashbyhq.com": "ashby",
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve a single custom URL to an (atsSource, atsSlug) tuple via CNAME check
 * and slug probe. Returns a ResolutionResult — never throws.
 *
 * @param url           The custom URL to resolve (e.g. "https://careers.acme.com")
 * @param resolveCname  Injectable DNS CNAME resolver (defaults to node:dns/promises)
 * @param fetchFn       Injectable fetch (defaults to global fetch)
 * @param atsHint       Optional ATS source hint ("greenhouse", "lever", "ashby").
 *                      When provided, the slug probe only tries the hinted ATS
 *                      instead of all three — 3x fewer API calls. Used by the
 *                      BigQuery seeder where Wappalyzer detects the ATS.
 */
export async function resolveCustomUrl(
  url: string,
  resolveCname: ResolveCnameFn = defaultResolveCname,
  fetchFn: FetchFn = fetch,
  atsHint?: AtsSource,
): Promise<ResolutionResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, url, reason: "invalid_url" };
  }

  const hostname = parsed.hostname.toLowerCase();
  const rootDomain = extractRootDomain(url);

  // ── Stage 1: CNAME check ─────────────────────────────────────────────────
  const cnameResult = await tryCnameResolution(hostname, resolveCname);
  if (cnameResult) {
    return {
      success: true,
      input: {
        atsSlug: cnameResult.slug,
        atsSource: cnameResult.source,
        discoverySource: "hn_custom_url",
        rootDomain: rootDomain ?? undefined,
        discoveryContext: url,
      },
      resolvedBy: "cname",
    };
  }

  // ── Stage 2: Slug probe ──────────────────────────────────────────────────
  const slugResult = await trySlugProbe(hostname, rootDomain, fetchFn, atsHint);
  if (slugResult) {
    return {
      success: true,
      input: {
        atsSlug: slugResult.slug,
        atsSource: slugResult.source,
        discoverySource: "hn_custom_url",
        rootDomain: rootDomain ?? undefined,
        discoveryContext: url,
      },
      resolvedBy: "slug_probe",
    };
  }

  // Both stages failed — discard the URL (no manual review).
  return {
    success: false,
    url,
    reason: "cname_and_slug_probe_failed",
  };
}

/**
 * Resolve a batch of custom URLs. Returns successful resolutions and failures
 * separately for ingestionLog metrics.
 *
 * @param atsHint  Optional ATS source hint applied to all URLs in the batch.
 */
export async function resolveCustomUrls(
  urls: string[],
  resolveCname: ResolveCnameFn = defaultResolveCname,
  fetchFn: FetchFn = fetch,
  atsHint?: AtsSource,
): Promise<{
  resolved: SeedCompanyInput[];
  failed: { url: string; reason: string }[];
}> {
  const resolved: SeedCompanyInput[] = [];
  const failed: { url: string; reason: string }[] = [];

  // Process sequentially to avoid hammering DNS/ATS APIs. The resolver runs as
  // a background Inngest function — throughput is not critical here.
  for (const url of urls) {
    const result = await resolveCustomUrl(url, resolveCname, fetchFn, atsHint);
    if (result.success) {
      resolved.push(result.input);
    } else {
      failed.push({ url: result.url, reason: result.reason });
    }
  }

  return { resolved, failed };
}

// ── Stage 1: CNAME resolution ────────────────────────────────────────────────

interface CnameResolution {
  source: AtsSource;
  slug: string;
}

async function tryCnameResolution(
  hostname: string,
  resolveCname: ResolveCnameFn,
): Promise<CnameResolution | null> {
  try {
    const cnames = await resolveCname(hostname);

    for (const cname of cnames) {
      const normalized = cname.toLowerCase().trim();

      // Check if the CNAME points to a known ATS host.
      for (const [atsHost, source] of Object.entries(CNAME_ATS_MAP)) {
        if (normalized === atsHost || normalized.endsWith(`.${atsHost}`)) {
          // The slug is inferred from the hostname. For greenhouse, the
          // careers subdomain IS the slug (e.g. acme.boards.greenhouse.io →
          // slug "acme"). For lever, it's the first label of the hostname
          // (e.g. acme.jobs.lever.co → slug "acme"). For ashby, similar.
          const slug = inferSlugFromHostname(hostname);
          if (slug) {
            return { source, slug };
          }
        }
      }
    }
  } catch {
    // DNS lookup failed — not an error, just means CNAME resolution didn't work.
    // Fall through to slug probe.
  }

  return null;
}

/**
 * Infer the ATS slug from the hostname. For example:
 *   careers.acme.com → CNAME → boards.greenhouse.io → slug "acme"
 *
 * When a company uses a custom domain (e.g. careers.acme.com), the CNAME
 * points to the ATS host, but the slug is the company's root domain (without
 * TLD), NOT the first subdomain label (which is often "careers" or "jobs").
 */
function inferSlugFromHostname(hostname: string): string | null {
  const labels = hostname.split(".");

  // We need at least 2 labels (e.g. "acme.com") to extract a slug.
  if (labels.length < 2) return null;

  // The slug is the root domain label (without TLD). For "careers.acme.com",
  // labels = ["careers", "acme", "com"], so the slug is "acme".
  // For "acme.com", labels = ["acme", "com"], slug is "acme".
  const rootLabel = labels[labels.length - 2];

  // Reject common non-slug labels.
  if (
    !rootLabel ||
    [
      "www",
      "careers",
      "jobs",
      "hiring",
      "join",
      "work",
      "com",
      "co",
      "io",
    ].includes(rootLabel)
  ) {
    return null;
  }
  return rootLabel;
}

// ── Stage 2: Slug probe ──────────────────────────────────────────────────────

interface SlugProbeResult {
  source: AtsSource;
  slug: string;
}

async function trySlugProbe(
  hostname: string,
  rootDomain: string | null,
  fetchFn: FetchFn,
  atsHint?: AtsSource,
): Promise<SlugProbeResult | null> {
  // Extract candidate slug from the hostname. Try the first label, then the
  // root domain (without TLD).
  const candidates = extractSlugCandidates(hostname, rootDomain);

  // If an ATS hint is provided, only probe that ATS. Otherwise try all three.
  const sourcesToProbe: AtsSource[] = atsHint
    ? [atsHint]
    : (["greenhouse", "lever", "ashby"] as AtsSource[]);

  for (const slug of candidates) {
    for (const source of sourcesToProbe) {
      const endpoint = getAtsEndpoint(source);
      const url = endpoint.jobsList(slug);

      try {
        const response = await fetchFn(url);
        if (!response.ok) continue;

        const text = await response.text();
        // A valid ATS response is non-empty JSON. We don't need to fully parse
        // it here — the poller's Zod validation handles that. We just need to
        // confirm the slug exists (non-404, returns JSON-like content).
        if (looksLikeValidAtsResponse(text, source)) {
          return { source, slug };
        }
      } catch {}
    }
  }

  return null;
}

/**
 * Extract candidate slugs from a hostname. For "careers.acme.com":
 *   1. "careers" (first label — often not the slug, but worth trying)
 *   2. "acme" (root domain without TLD — the most likely slug)
 */
function extractSlugCandidates(
  hostname: string,
  rootDomain: string | null,
): string[] {
  const candidates: string[] = [];

  // Try root domain without TLD (e.g. "acme.com" → "acme")
  if (rootDomain) {
    const domainLabel = rootDomain.split(".")[0];
    if (domainLabel && domainLabel.length > 0) {
      candidates.push(domainLabel);
    }
  }

  // Try first label of hostname (e.g. "careers.acme.com" → "careers")
  // This is less likely to be the slug but worth a shot.
  const firstLabel = hostname.split(".")[0];
  if (
    firstLabel &&
    firstLabel.length > 0 &&
    !candidates.includes(firstLabel) &&
    !["www", "careers", "jobs", "hiring", "join", "work"].includes(firstLabel)
  ) {
    candidates.push(firstLabel);
  }

  return candidates;
}

/**
 * Quick check if the response text looks like a valid ATS response (not an
 * error page or empty response). We don't fully parse with Zod here — the
 * poller does that. This is just a slug existence check.
 */
function looksLikeValidAtsResponse(text: string, source: AtsSource): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;

  try {
    const json: unknown = JSON.parse(trimmed);
    // Greenhouse: { "jobs": [...] }
    // Lever: [...]
    // Ashby: { "jobs": [...] }
    if (source === "lever") {
      return Array.isArray(json);
    }
    if (typeof json === "object" && json !== null) {
      // Greenhouse and Ashby both return { jobs: [...] }
      return "jobs" in json;
    }
  } catch {
    // Not valid JSON — not a valid ATS response.
  }
  return false;
}

// ── Default DNS resolver (lazy import of node:dns/promises) ──────────────────

async function defaultResolveCname(hostname: string): Promise<string[]> {
  // Dynamic import — node:dns/promises is Node-only, not available in edge
  // runtime. The import is deferred so the module can be loaded in non-Node
  // environments (e.g. vitest with happy-dom) without crashing.
  const dns = await import("node:dns/promises");
  return dns.resolveCname(hostname);
}
