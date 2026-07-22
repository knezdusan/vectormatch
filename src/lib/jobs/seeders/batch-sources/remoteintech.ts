// S1: remoteintech/remote-jobs Company-Discovery Seeder
// src/lib/jobs/seeders/batch-sources/remoteintech.ts
//
// Parses the community-maintained remoteintech/remote-jobs GitHub repository
// (881 companies, 40k+ stars) for remote-friendly tech companies with web-dev
// stacks and genuinely-global hiring regions.
//
// ── Source structure ─────────────────────────────────────────────────────────
// Each company is a Markdown file in src/companies/*.md with YAML frontmatter:
//   title, slug, website, careers_url, region, remote_policy, company_size,
//   technologies[], addedAt, updatedAt
//
// Valid regions: worldwide, americas, europe, asia-pacific, americas-europe, other
// Valid tech tags: javascript, typescript, react, nodejs, php, python, ruby, go,
//   java, rust, dotnet, elixir, scala, swift, cloud, devops, docker, kubernetes,
//   mobile, data, ml, sql, postgres, nosql, search
//
// ── Pre-filter (compute-free, pre-Slugger) ──────────────────────────────────
// 1. Region ∈ {worldwide, americas-europe} — genuinely global hiring
// 2. Technologies ∩ {javascript, typescript, react, nodejs, php} ≠ ∅ — web-dev stack
// 3. careers_url present — we need a URL for ATS resolution
//
// ── Pipeline ─────────────────────────────────────────────────────────────────
// clone → parse frontmatter → pre-filter → extract (name, website, careers_url)
// → Slugger ATS resolution → Fingerprint v2 stack gate → probation queue
//
// Discovery runs on the Mac Mini (cade) — zero server compute. The Slugger's
// DB cache check is a single indexed SELECT (negligible). DNS CNAME lookups
// and HTTP slug probes are free.
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 881 total companies → ~235 pass pre-filter → ~30-60% resolve to ATS
// → ~70-140 ATS-resolved companies → Fingerprint v2 gates further.
//
// See Advisor Directive 02 §S1 for the full specification.

import { z } from "zod";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const REPO_RAW_BASE =
  "https://raw.githubusercontent.com/remoteintech/remote-jobs/main/src/companies";
const REPO_TREE_API =
  "https://api.github.com/repos/remoteintech/remote-jobs/contents/src/companies";

// NOTE: GLOBAL_REGIONS and WEBDEV_TECH_TAGS were removed (Directive 04 + 05).
// The region pre-filter (65% FN) and tech pre-filter (25% FN) were both
// dropped — Fingerprint v3 reads the real job feed and strictly dominates
// frontmatter tags. Probing is free.

// ── Types ────────────────────────────────────────────────────────────────────

export interface RemoteInTechCompany {
  /** Company name (from frontmatter title). */
  name: string;
  /** remoteintech slug (matches filename, not ATS slug). */
  slug: string;
  /** Company website URL. */
  website: string;
  /** Careers page URL (optional — may fall back to website). */
  careersUrl: string | null;
  /** Region from frontmatter. */
  region: string;
  /** Remote policy from frontmatter. */
  remotePolicy: string;
  /** Company size from frontmatter. */
  companySize: string;
  /** Technology tags from frontmatter. */
  technologies: string[];
  /** Date first added to remoteintech. */
  addedAt: string | null;
  /** Date of last content update. */
  updatedAt: string | null;
}

export interface RemoteInTechParseResult {
  /** Total company files found. */
  totalFiles: number;
  /** Companies that passed the pre-filter. */
  passedPreFilter: number;
  /** Companies filtered out by region. */
  filteredByRegion: number;
  /** Companies filtered out by tech (no web-dev tags). */
  filteredByTech: number;
  /** Companies filtered out (no careers_url). */
  filteredByNoCareers: number;
  /** Parsed companies that passed pre-filter. */
  companies: RemoteInTechCompany[];
  /** Error message if parsing failed. */
  error?: string;
}

export interface RemoteInTechDiscoveryResult {
  /** Parse result. */
  parse: RemoteInTechParseResult;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution. */
  unresolved: number;
  /** Error message if discovery failed. */
  error?: string;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

const frontmatterSchema = z.object({
  title: z.string(),
  slug: z.string(),
  website: z.string(),
  careers_url: z.string().optional().nullable(),
  region: z.string(),
  remote_policy: z.string().optional().default("unknown"),
  company_size: z.string().optional().default("unknown"),
  technologies: z.array(z.string()).optional().default([]),
  addedAt: z.string().optional().nullable(),
  updatedAt: z.string().optional().nullable(),
});

// ── Pure functions ───────────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a Markdown file.
 * Extracts the content between the first pair of `---` delimiters.
 */
export function parseFrontmatter(
  markdown: string,
): Record<string, unknown> | null {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yamlText = match[1];
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentArray: string[] | null = null;

  for (const line of yamlText.split("\n")) {
    // Array item under a list key
    if (line.match(/^\s+-\s+/)) {
      const value = line.replace(/^\s+-\s+/, "").trim();
      if (currentArray !== null) {
        currentArray.push(value);
      }
      continue;
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      // Flush previous array
      if (currentKey && currentArray !== null) {
        result[currentKey] = currentArray;
        currentArray = null;
      }

      const key = kvMatch[1];
      let value: string = kvMatch[2].trim();

      // Strip quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (value === "") {
        // Could be start of a YAML list on next lines
        currentKey = key;
        currentArray = [];
      } else {
        result[key] = value;
        currentKey = null;
        currentArray = null;
      }
    }
  }

  // Flush last array
  if (currentKey && currentArray !== null) {
    result[currentKey] = currentArray;
  }

  return result;
}

/**
 * Check if a company passes the pre-filter:
 * 1. Technologies ∩ WEBDEV_TECH_TAGS ≠ ∅
 * 2. Has a careers_url (or at least a website for fallback)
 *
 * NOTE: The region pre-filter was REMOVED (Directive 04 Fix 3). The
 * remoteintech "region" frontmatter field is noisy — 65% false-negative
 * rate in the recall audit. Companies tagged "americas" or "europe" are
 * often genuinely global (10up, Envato, Bitnami, WebDevStudios). The
 * downstream per-job genuine-global classifier is the correct, more
 * accurate gate — it runs per posting where region ambiguity resolves
 * against actual job location text.
 */
export function passesPreFilter(company: RemoteInTechCompany): {
  passed: boolean;
  reason: string | null;
} {
  // NOTE: The tech pre-filter was REMOVED (Directive 05 Catch 4). Same logic
  // that retired the region filter: Fingerprint v3 reads the real job feed
  // and strictly dominates frontmatter tags. The tech filter was 25% FN
  // over ~226 companies (~4–6 lost passing companies). Probing is free.
  // Drop it; let the feed decide.

  if (!company.careersUrl && !company.website) {
    return { passed: false, reason: "no_url" };
  }

  return { passed: true, reason: null };
}

/**
 * Convert a parsed frontmatter record to a RemoteInTechCompany.
 */
export function toRemoteInTechCompany(
  fm: Record<string, unknown>,
): RemoteInTechCompany {
  return {
    name: String(fm.title ?? ""),
    slug: String(fm.slug ?? ""),
    website: String(fm.website ?? ""),
    careersUrl: fm.careers_url ? String(fm.careers_url) : null,
    region: String(fm.region ?? "other"),
    remotePolicy: String(fm.remote_policy ?? "unknown"),
    companySize: String(fm.company_size ?? "unknown"),
    technologies: Array.isArray(fm.technologies)
      ? fm.technologies.map(String)
      : [],
    addedAt: fm.addedAt ? String(fm.addedAt) : null,
    updatedAt: fm.updatedAt ? String(fm.updatedAt) : null,
  };
}

// ── API client: fetch company file list ──────────────────────────────────────

/**
 * Fetch the list of company Markdown files from the GitHub API.
 * Returns an array of filenames (e.g. ["10up.md", "15five.md", ...]).
 *
 * @param fetchFn  Injectable fetch function
 * @returns        Array of .md filenames
 */
async function fetchCompanyFileList(fetchFn: FetchFn): Promise<string[]> {
  const response = await fetchFn(REPO_TREE_API, {
    headers: {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "VectorMatch-Discovery/1.0",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(
      `GitHub API returned HTTP ${response.status} for repo contents`,
    );
  }

  const data = (await response.json()) as Array<{
    name: string;
    type: string;
  }>;
  return data
    .filter((item) => item.type === "file" && item.name.endsWith(".md"))
    .map((item) => item.name);
}

/**
 * Fetch a single company Markdown file from GitHub raw content.
 *
 * @param filename  The .md filename (e.g. "10up.md")
 * @param fetchFn   Injectable fetch function
 * @returns         The raw Markdown content
 */
async function fetchCompanyFile(
  filename: string,
  fetchFn: FetchFn,
): Promise<string> {
  const response = await fetchFn(`${REPO_RAW_BASE}/${filename}`, {
    headers: {
      "User-Agent": "VectorMatch-Discovery/1.0",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${filename}: HTTP ${response.status}`);
  }

  return response.text();
}

// ── Main parse function ──────────────────────────────────────────────────────

/**
 * Parse all company files from the remoteintech/remote-jobs repository.
 * Fetches the file list, downloads each .md file, parses frontmatter,
 * and applies the pre-filter.
 *
 * @param fetchFn  Injectable fetch function
 * @returns        Parse result with pre-filtered companies
 */
export async function parseRemoteInTechRepo(
  fetchFn: FetchFn = fetch,
): Promise<RemoteInTechParseResult> {
  const companies: RemoteInTechCompany[] = [];
  const filteredByRegion = 0;
  const filteredByTech = 0;
  let filteredByNoCareers = 0;

  try {
    // Step 1: Fetch file list
    const files = await fetchCompanyFileList(fetchFn);
    const totalFiles = files.length;

    // Step 2: Fetch + parse each file
    // Process in small batches to avoid rate limiting
    const BATCH_SIZE = 10;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      const markdowns = await Promise.all(
        batch.map((f) => fetchCompanyFile(f, fetchFn).catch(() => null)),
      );

      for (const md of markdowns) {
        if (!md) continue;

        const fm = parseFrontmatter(md);
        if (!fm) continue;

        const parsed = frontmatterSchema.safeParse(fm);
        if (!parsed.success) continue;

        const company = toRemoteInTechCompany(parsed.data);
        const filter = passesPreFilter(company);

        if (filter.passed) {
          companies.push(company);
        } else if (filter.reason === "no_url") {
          filteredByNoCareers++;
        }
        // region/tech reasons no longer fire — filters removed (Directive 04+05)
      }

      // Small delay between batches to be respectful to GitHub
      if (i + BATCH_SIZE < files.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    return {
      totalFiles,
      passedPreFilter: companies.length,
      filteredByRegion,
      filteredByTech,
      filteredByNoCareers,
      companies,
    };
  } catch (error) {
    return {
      totalFiles: 0,
      passedPreFilter: 0,
      filteredByRegion: 0,
      filteredByTech: 0,
      filteredByNoCareers: 0,
      companies: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Main discovery function ──────────────────────────────────────────────────

/**
 * Run the full S1 discovery pipeline:
 * 1. Parse the remoteintech/remote-jobs repository
 * 2. Pre-filter for global regions + web-dev tech + careers URL
 * 3. Run each company through the Slugger for ATS resolution
 *
 * @param fetchFn  Injectable fetch function
 * @param dryRun   If true, parse + filter only (no Slugger resolution)
 * @returns        Discovery result with counts
 */
export async function runRemoteInTechDiscovery(
  fetchFn: FetchFn = fetch,
  dryRun = false,
): Promise<RemoteInTechDiscoveryResult> {
  const parseResult = await parseRemoteInTechRepo(fetchFn);

  if (parseResult.error) {
    return {
      parse: parseResult,
      resolved: 0,
      unresolved: 0,
      error: parseResult.error,
    };
  }

  if (dryRun) {
    return {
      parse: parseResult,
      resolved: 0,
      unresolved: parseResult.passedPreFilter,
    };
  }

  // Run each pre-filtered company through the Slugger
  let resolved = 0;
  let unresolved = 0;

  for (const company of parseResult.companies) {
    try {
      const result: SluggerResult = await resolveSlugger(
        {
          companyName: company.name,
          website: company.website,
          discoverySource: "vc_portfolio",
          discoveryContext: `remoteintech:${company.slug}`,
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
      unresolved++;
    }
  }

  return {
    parse: parseResult,
    resolved,
    unresolved,
  };
}
