// D6: CertStream processor (TDD §2.2 D6)
// src/lib/jobs/seeders/daily-sources/certstream-processor.ts
//
// Daily batch processor that monitors Certificate Transparency (CT) logs via the
// CertStream WebSocket API. When a company sets up a careers page on an ATS
// (e.g. boards.greenhouse.io), they often create a subdomain (e.g.
// careers.acme.com) that CNAMEs to the ATS host. The TLS certificate for that
// subdomain appears in CT logs, allowing us to discover the company.
//
// ── API ──────────────────────────────────────────────────────────────────────
// wss://certstream.calidog.io/
//   Streams JSON messages with certificate updates. Each message contains:
//   {
//     "message_type": "certificate_update",
//     "data": {
//       "leaf_cert": {
//         "all_domains": ["careers.acme.com", "www.acme.com"]
//       }
//     }
//   }
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Connect to the CertStream WebSocket for a fixed duration (default 60s)
// 2. Collect certificate_update messages
// 3. Extract domains from each certificate's all_domains field
// 4. Filter for career-page-like domains (careers.*, jobs.*, boards.*, etc.)
// 5. For each unique domain, do a DNS CNAME lookup
// 6. If the CNAME points to an ATS host, extract the company name
// 7. Run through the Slugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 5-20 companies/day. CT logs process thousands of certs/second, but
// career-page subdomains that CNAME to ATS hosts are rare. The 60s collection
// window captures ~60K certificates, of which ~5-20 match our filters.
//
// See TDD §2.2 (D6) for the full specification.

import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import {
  inferCompanyNameFromDomain,
  matchAtsCname,
} from "@/lib/jobs/seeders/batch-sources/rapid7-cname";
import type { ResolveCnameFn } from "@/lib/jobs/seeders/resolve-custom-url";
import { defaultResolveCname } from "@/lib/jobs/seeders/resolve-custom-url";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const CERTSTREAM_URL = "wss://certstream.calidog.io/";
const DEFAULT_COLLECTION_DURATION_MS = 60_000; // 60 seconds

/**
 * Subdomain labels that indicate a career/hiring page. When a certificate's
 * domain has one of these as the first label, it's likely a career page that
 * might CNAME to an ATS host.
 */
const CAREER_PAGE_LABELS = new Set([
  "careers",
  "jobs",
  "boards",
  "apply",
  "hiring",
  "openings",
  "career",
  "job",
  "recruiting",
  "talent",
]);

// ── Types ────────────────────────────────────────────────────────────────────

/** The leaf certificate structure inside a CertStream message. */
export interface CertStreamLeafCert {
  all_domains?: string[];
}

/** The data payload of a CertStream certificate_update message. */
export interface CertStreamData {
  leaf_cert: CertStreamLeafCert;
}

/** A single CertStream WebSocket message. */
export interface CertStreamMessage {
  message_type: string;
  data: CertStreamData;
}

/** Result of running the CertStream processor. */
export interface CertStreamResult {
  /** Total certificate_update messages received. */
  totalCertificates: number;
  /** Domains extracted that matched career-page patterns. */
  careerPageDomains: number;
  /** Unique career-page domains after deduplication. */
  uniqueCareerDomains: number;
  /** Domains where the CNAME pointed to an ATS host. */
  atsCnameMatches: number;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution. */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

/**
 * Function that connects to CertStream and collects messages for a duration.
 * Injectable for testing.
 */
export type CollectFn = (durationMs: number) => Promise<CertStreamMessage[]>;

// ── Pure function: extract domains from a CertStream message ─────────────────

/**
 * Extract all domains from a CertStream certificate_update message.
 *
 * @param msg  The CertStream message
 * @returns    Array of domains (lowercased, deduplicated within the message)
 */
export function extractDomainsFromMessage(msg: CertStreamMessage): string[] {
  if (msg.message_type !== "certificate_update") return [];
  const domains = msg.data?.leaf_cert?.all_domains;
  if (!Array.isArray(domains)) return [];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const d of domains) {
    const lower = d.toLowerCase().trim();
    if (lower.length > 0 && !seen.has(lower)) {
      seen.add(lower);
      result.push(lower);
    }
  }
  return result;
}

// ── Pure function: filter for career-page-like domains ───────────────────────

/**
 * Filter a list of domains to those that look like career/hiring pages.
 * A domain matches if its first subdomain label is one of CAREER_PAGE_LABELS.
 * e.g. "careers.acme.com" → match, "www.acme.com" → no match
 *
 * @param domains  Array of domain names (lowercase)
 * @returns        Domains that match career-page patterns
 */
export function filterCareerPageDomains(domains: string[]): string[] {
  return domains.filter((domain) => {
    const labels = domain.split(".");
    if (labels.length < 3) return false; // need at least subdomain.root.tld
    return CAREER_PAGE_LABELS.has(labels[0]);
  });
}

// ── Pure function: deduplicate domains ───────────────────────────────────────

/**
 * Deduplicate an array of domains (case-insensitive, already lowercased).
 *
 * @param domains  Array of domains
 * @returns        Deduplicated array preserving first-occurrence order
 */
export function deduplicateDomains(domains: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const d of domains) {
    const trimmed = d.trim();
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

// ── Default collect function: connect to CertStream WebSocket ────────────────

/**
 * Default implementation: connect to the CertStream WebSocket API and collect
 * certificate_update messages for the specified duration.
 *
 * Uses the native WebSocket (available in Node.js 22+). The connection is
 * closed after the duration expires or if an error occurs.
 *
 * @param durationMs  How long to listen (milliseconds)
 * @returns           Array of collected CertStream messages
 */
async function defaultCollectFromCertStream(
  durationMs: number,
): Promise<CertStreamMessage[]> {
  const messages: CertStreamMessage[] = [];

  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      ws = new WebSocket(CERTSTREAM_URL);
    } catch (error) {
      reject(
        new Error(
          `Failed to connect to CertStream: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      return;
    }

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        ws.close();
      } catch {
        // Ignore close errors
      }
    };

    ws.onopen = () => {
      timeoutId = setTimeout(() => {
        cleanup();
        resolve(messages);
      }, durationMs);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as CertStreamMessage;
        if (msg.message_type === "certificate_update") {
          messages.push(msg);
        }
      } catch {
        // Skip non-JSON or malformed messages
      }
    };

    ws.onerror = () => {
      cleanup();
      reject(new Error("CertStream WebSocket error"));
    };

    ws.onclose = () => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve(messages);
    };
  });
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the CertStream processor. Connects to the CertStream WebSocket, collects
 * certificate updates for a fixed duration, filters for career-page domains,
 * checks CNAME records against ATS hosts, and runs matches through the Slugger.
 *
 * @param fetchFn  Injectable fetch (for Slugger slug probing)
 * @param opts     Optional configuration (duration, collectFn, resolveCname)
 * @returns        Result with counts and any error
 */
export async function runCertStreamProcessor(
  fetchFn: FetchFn = fetch,
  opts: {
    durationMs?: number;
    collectFn?: CollectFn;
    resolveCname?: ResolveCnameFn;
  } = {},
): Promise<CertStreamResult> {
  const durationMs = opts.durationMs ?? DEFAULT_COLLECTION_DURATION_MS;
  const collectFn = opts.collectFn ?? defaultCollectFromCertStream;
  const resolveCname = opts.resolveCname ?? defaultResolveCname;

  let totalCertificates = 0;
  let careerPageDomains = 0;
  let atsCnameMatches = 0;
  let resolved = 0;
  let unresolved = 0;

  const seenDomains = new Set<string>();

  try {
    // 1. Collect certificate updates from CertStream
    const messages = await collectFn(durationMs);
    totalCertificates = messages.length;

    // 2. Extract and filter domains
    const allDomains: string[] = [];
    for (const msg of messages) {
      allDomains.push(...extractDomainsFromMessage(msg));
    }

    const careerDomains = filterCareerPageDomains(allDomains);
    careerPageDomains = careerDomains.length;

    // 3. Deduplicate
    const uniqueDomains = deduplicateDomains(careerDomains);

    // 4. For each unique domain, check CNAME → ATS
    for (const domain of uniqueDomains) {
      if (seenDomains.has(domain)) continue;
      seenDomains.add(domain);

      let cnameTargets: string[];
      try {
        cnameTargets = await resolveCname(domain);
      } catch {
        // DNS resolution failure — skip this domain
        continue;
      }

      // Check if any CNAME target points to an ATS host
      let matchedSource: AtsSource | null = null;
      let matchedCnameTarget = "";
      for (const cname of cnameTargets) {
        const match = matchAtsCname(cname);
        if (match) {
          matchedSource = match.source;
          matchedCnameTarget = match.domain;
          break;
        }
      }

      if (!matchedSource) continue;

      atsCnameMatches++;

      // 5. Infer company name and run through Slugger
      const companyName = inferCompanyNameFromDomain(domain);

      try {
        const sluggerResult: SluggerResult = await resolveSlugger(
          {
            companyName,
            website: `https://${domain}`,
            atsHint: matchedSource,
            discoverySource: "hn_algolia",
            discoveryContext: `certstream:${domain}→${matchedCnameTarget}`,
          },
          {
            fetchFn,
            insertCompany: true,
          },
        );

        if (sluggerResult.success) {
          resolved++;
        } else {
          unresolved++;
        }
      } catch {
        // Individual Slugger failure — count as unresolved, continue
        unresolved++;
      }
    }

    return {
      totalCertificates,
      careerPageDomains,
      uniqueCareerDomains: seenDomains.size,
      atsCnameMatches,
      resolved,
      unresolved,
    };
  } catch (error) {
    return {
      totalCertificates,
      careerPageDomains,
      uniqueCareerDomains: seenDomains.size,
      atsCnameMatches,
      resolved,
      unresolved,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
