// B8: Rapid7 FDNS v2 CNAME Reversal Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/rapid7-cname.ts
//
// Downloads (or reads a local copy of) the Rapid7 Forward DNS v2 CNAME dataset,
// filters for CNAME records pointing at ATS domains (boards.greenhouse.io,
// jobs.lever.co, etc.), extracts the company domain from the DNS name, and
// runs each through the Slugger for ATS resolution.
//
// ── Dataset ──────────────────────────────────────────────────────────────────
// The Rapid7 FDNS v2 dataset is a GZIP-compressed JSON file where each line is
// a JSON document:
//   {"timestamp":"1492468299","name":"careers.acme.com","type":"cname","value":"boards.greenhouse.io"}
//
// The CNAME-specific file is ~2.3 GB compressed. It's downloaded manually from
// https://opendata.rapid7.com/sonar.fdns_v2/ (requires free account).
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Stream-parse the gzipped JSON file line by line (memory-efficient)
// 2. Filter for type="cname" where value ends with an ATS domain
// 3. Extract the company domain from the "name" field
// 4. Infer the company name from the domain (root label)
// 5. Run through the Slugger with the website for CNAME check
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 300-1,000 companies (many companies CNAME their careers subdomain to an ATS).
//
// See TDD §2.1 (B8) for the full specification.

import { accessSync, constants, createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import type { AtsSource } from "@/lib/jobs/ats-endpoints";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * ATS CNAME target domains. When a DNS CNAME record's value points to one of
 * these domains, the source domain belongs to a company using that ATS.
 */
const ATS_CNAME_TARGETS: { domain: string; source: AtsSource }[] = [
  { domain: "boards.greenhouse.io", source: "greenhouse" },
  { domain: "boards-api.greenhouse.io", source: "greenhouse" },
  { domain: "jobs.lever.co", source: "lever" },
  { domain: "api.lever.co", source: "lever" },
  { domain: "jobs.ashbyhq.com", source: "ashby" },
  { domain: "api.ashbyhq.com", source: "ashby" },
  { domain: "jobs.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "api.smartrecruiters.com", source: "smartrecruiters" },
  { domain: "apply.workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

// ── Types ────────────────────────────────────────────────────────────────────

/** A single FDNS v2 CNAME record. */
export interface FdnsRecord {
  timestamp: string;
  name: string;
  type: string;
  value: string;
}

/** A company domain extracted from FDNS CNAME records. */
export interface ExtractedCompanyDomain {
  /** The company's domain (e.g. "careers.acme.com" or "acme.com"). */
  domain: string;
  /** The ATS source inferred from the CNAME target. */
  atsSource: AtsSource;
  /** The ATS CNAME target domain. */
  cnameTarget: string;
}

export interface Rapid7CnameResult {
  /** Total CNAME records parsed. */
  totalRecords: number;
  /** CNAME records matching ATS domains. */
  atsCnameMatches: number;
  /** Unique company domains extracted. */
  uniqueCompanyDomains: number;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution. */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: check if a CNAME value points to an ATS domain ────────────

/**
 * Check if a CNAME value points to a known ATS domain.
 *
 * @param cnameValue  The CNAME target (e.g. "boards.greenhouse.io")
 * @returns           The ATS source, or null if not an ATS domain
 */
export function matchAtsCname(cnameValue: string): {
  source: AtsSource;
  domain: string;
} | null {
  const normalized = cnameValue.toLowerCase().trim();
  for (const { domain, source } of ATS_CNAME_TARGETS) {
    if (normalized === domain || normalized.endsWith(`.${domain}`)) {
      return { source, domain };
    }
  }
  return null;
}

// ── Pure function: extract company domain from FDNS record ──────────────────

/**
 * Extract the company domain from an FDNS CNAME record.
 * The "name" field is the source domain (e.g. "careers.acme.com").
 * We return the full hostname — the Slugger will use it for CNAME verification
 * and infer the company name from the root label.
 *
 * @param record  The FDNS record
 * @returns       The extracted company domain, or null if not an ATS CNAME
 */
export function extractCompanyDomain(
  record: FdnsRecord,
): ExtractedCompanyDomain | null {
  if (record.type !== "cname") return null;

  const match = matchAtsCname(record.value);
  if (!match) return null;

  const domain = record.name.toLowerCase().trim();
  if (!domain) return null;

  return {
    domain,
    atsSource: match.source,
    cnameTarget: match.domain,
  };
}

// ── Pure function: infer company name from domain ───────────────────────────

/**
 * Infer a company name from a domain by extracting the root label.
 * e.g. "careers.acme.com" → "acme", "acme.io" → "acme"
 */
export function inferCompanyNameFromDomain(domain: string): string {
  const labels = domain.split(".");
  if (labels.length < 2) return domain;
  // Root label is second from the end (before TLD)
  const rootLabel = labels[labels.length - 2];
  return rootLabel || domain;
}

// ── Pure function: parse a single FDNS JSON line ────────────────────────────

/**
 * Parse a single line of the FDNS v2 JSON file.
 * Each line is a JSON object: {"timestamp":"...","name":"...","type":"...","value":"..."}
 *
 * @param line  A single line from the FDNS file
 * @returns     Parsed record, or null if invalid JSON
 */
export function parseFdnsLine(line: string): FdnsRecord | null {
  try {
    const json = JSON.parse(line) as FdnsRecord;
    if (!json.name || !json.type || !json.value) return null;
    return json;
  } catch {
    return null;
  }
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the Rapid7 FDNS v2 CNAME reversal seeder. Stream-parses a local gzipped
 * FDNS CNAME file, filters for ATS CNAME records, extracts company domains,
 * and runs each through the Slugger.
 *
 * @param filePath  Path to the local gzipped FDNS CNAME file
 * @param fetchFn   Injectable fetch (for Slugger slug probing)
 * @returns         Result with counts and any errors
 */
export async function runRapid7CnameSeeder(
  filePath: string,
  fetchFn: FetchFn = fetch,
): Promise<Rapid7CnameResult> {
  let totalRecords = 0;
  let atsCnameMatches = 0;
  let resolved = 0;
  let unresolved = 0;

  const seenDomains = new Set<string>();

  try {
    // Verify the file exists before streaming
    accessSync(filePath, constants.R_OK);

    // Stream-parse the gzipped file
    const stream = createReadStream(filePath).pipe(createGunzip());
    const rl = createInterface({ input: stream });

    // Handle stream errors (invalid gzip, etc.)
    const streamError = new Promise<never>((_, reject) => {
      stream.on("error", reject);
    });

    // Race between reading lines and a stream error
    const lineIterator = rl[Symbol.asyncIterator]();

    for (;;) {
      const iterResult = await Promise.race([lineIterator.next(), streamError]);

      if (iterResult.done) break;
      const line = iterResult.value as string;
      const record = parseFdnsLine(line);
      if (!record) continue;

      totalRecords++;

      const extracted = extractCompanyDomain(record);
      if (!extracted) continue;

      atsCnameMatches++;

      // Deduplicate by domain
      if (seenDomains.has(extracted.domain)) continue;
      seenDomains.add(extracted.domain);

      // Infer company name from domain root label
      const companyName = inferCompanyNameFromDomain(extracted.domain);

      // Run through the Slugger
      const sluggerResult: SluggerResult = await resolveSlugger(
        {
          companyName,
          website: `https://${extracted.domain}`,
          atsHint: extracted.atsSource,
          discoverySource: "rapid7_fdns",
          discoveryContext: `cname:${extracted.domain}→${extracted.cnameTarget}`,
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
    }

    return {
      totalRecords,
      atsCnameMatches,
      uniqueCompanyDomains: seenDomains.size,
      resolved,
      unresolved,
    };
  } catch (error) {
    return {
      totalRecords,
      atsCnameMatches,
      uniqueCompanyDomains: seenDomains.size,
      resolved,
      unresolved,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
