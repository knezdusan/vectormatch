// D12: NPM Registry New Packages Seeder (TDD §2.12)
// src/lib/jobs/seeders/daily-sources/npm-registry.ts
//
// Daily sweep of the NPM registry for newly published org-scoped packages
// (e.g. @acme/ui-kit). The NPM registry exposes a search API that returns
// recently indexed packages. We filter for org-scoped package names (those
// starting with "@"), extract the org name from the scope, and run it through
// the Slugger to find the publishing organization's ATS.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch https://registry.npmjs.org/-/v1/search?text=not:unstable&size=250&from=0
// 2. Parse the JSON response (objects[].package.name)
// 3. Filter for org-scoped packages (names starting with "@")
// 4. Extract the org name from the scope (@acme/ui-kit → "acme")
// 5. Skip common non-company scopes (@types, @babel, @eslint, etc.)
// 6. Deduplicate org names (case-insensitive)
// 7. Run each org name through resolveSlugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 0-3 companies/day. Most org-scoped packages are published by open-source
// collectives or framework maintainers (excluded scopes), but the occasional
// devtools company publishing under their own scope makes this worthwhile.
//
// See TDD §2.12 (D12) for the full specification.

import { deduplicateOrgNames } from "@/lib/jobs/seeders/seeder-utils";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const NPM_SEARCH_URL =
  "https://registry.npmjs.org/-/v1/search?text=not:unstable&size=250&from=0";

/**
 * Non-company scopes that are maintained by open-source collectives,
 * framework teams, or tooling maintainers. These never correspond to a
 * single hiring company, so we skip them to avoid noise in the Slugger.
 */
const EXCLUDED_SCOPES: Set<string> = new Set([
  "types",
  "babel",
  "eslint",
  "vue",
  "angular",
  "react",
  "svelte",
  "nestjs",
  "typescript-eslint",
  "testing-library",
  "storybook",
  "fortawesome",
  "tailwindcss",
  "dnd-kit",
  "radix-ui",
  "hookform",
  "tanstack",
  "next",
  "vercel",
  "cloudflare",
  "aws-sdk",
  "azure",
  "google",
  "microsoft",
  "mui",
  "emotion",
  "popperjs",
  "jridwell",
  "bufbuild",
  "modelcontextprotocol",
  "playwright",
  "vitest",
  "vitejs",
  "biomejs",
  "drizzle",
  "inngest",
  "ai-sdk",
]);

// ── Types ────────────────────────────────────────────────────────────────────

/** A single package object as returned by the NPM search API. */
interface NpmSearchObject {
  package: {
    name: string;
    version?: string;
  };
}

/** The full NPM search API response shape. */
interface NpmSearchResponse {
  objects?: NpmSearchObject[];
  total?: number;
}

export interface NpmRegistryResult {
  /** Total packages returned by the search API. */
  totalPackages: number;
  /** Packages that were org-scoped (started with "@"). */
  scopedPackages: number;
  /** Unique org names after dedup + excluded-scope filtering. */
  uniqueOrgs: number;
  /** Orgs that resolved to an ATS slug. */
  resolved: number;
  /** Orgs that did not resolve (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: extract org names from scoped packages ────────────────────

/**
 * Extract org names from a list of NPM package objects.
 *
 * Only org-scoped packages (names starting with "@") are considered. The org
 * name is the scope portion before the "/" (e.g. "@acme/ui-kit" → "acme").
 * Common non-company scopes (see {@link EXCLUDED_SCOPES}) are filtered out.
 *
 * @param packages  Array of NPM search objects (each with a `package.name`)
 * @returns         Array of org names (may contain duplicates)
 */
export function extractOrgNamesFromPackages(
  packages: NpmSearchObject[],
): string[] {
  const orgNames: string[] = [];

  for (const obj of packages) {
    const name = obj?.package?.name;
    if (!name || !name.startsWith("@")) continue;

    // "@acme/ui-kit" → ["acme", "ui-kit"]
    const withoutAt = name.slice(1);
    const slashIndex = withoutAt.indexOf("/");
    if (slashIndex <= 0) continue;

    const scope = withoutAt.slice(0, slashIndex);
    if (!scope) continue;

    if (EXCLUDED_SCOPES.has(scope.toLowerCase())) continue;

    orgNames.push(scope);
  }

  return orgNames;
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the NPM Registry seeder. Fetches recent packages from the NPM search
 * API, extracts org names from org-scoped packages, filters out excluded
 * scopes, deduplicates, and runs each org through the Slugger with
 * insertCompany: true.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any critical error
 */
export async function runNpmRegistrySeeder(
  fetchFn: FetchFn = fetch,
): Promise<NpmRegistryResult> {
  // 1. Fetch recent packages from the NPM search API
  let body: NpmSearchResponse;
  try {
    const response = await fetchFn(NPM_SEARCH_URL);
    if (!response.ok) {
      return {
        totalPackages: 0,
        scopedPackages: 0,
        uniqueOrgs: 0,
        resolved: 0,
        unresolved: 0,
        error: `NPM search API returned HTTP ${response.status}`,
      };
    }
    body = (await response.json()) as NpmSearchResponse;
  } catch (err) {
    return {
      totalPackages: 0,
      scopedPackages: 0,
      uniqueOrgs: 0,
      resolved: 0,
      unresolved: 0,
      error: `Failed to fetch NPM search API: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Parse the response
  const objects = body.objects ?? [];
  const totalPackages = objects.length;

  // 3. Extract org names from scoped packages (filters excluded scopes)
  const rawOrgNames = extractOrgNamesFromPackages(objects);
  const scopedPackages = rawOrgNames.length;

  // 4. Deduplicate
  const orgNames = deduplicateOrgNames(rawOrgNames);
  const uniqueOrgs = orgNames.length;

  if (uniqueOrgs === 0) {
    return {
      totalPackages,
      scopedPackages,
      uniqueOrgs: 0,
      resolved: 0,
      unresolved: 0,
    };
  }

  // 5. Run each org through the Slugger
  let resolved = 0;
  let unresolved = 0;

  for (const orgName of orgNames) {
    try {
      const result: SluggerResult = await resolveSlugger(
        {
          companyName: orgName,
          discoverySource: "hn_algolia",
          discoveryContext: `npm-registry:${orgName}`,
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
      // A single org failure should not abort the whole seeder.
      unresolved++;
    }
  }

  return {
    totalPackages,
    scopedPackages,
    uniqueOrgs,
    resolved,
    unresolved,
  };
}
