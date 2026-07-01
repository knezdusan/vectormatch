// D10: GitHub Trending + CONTRIBUTING.md Seeder (TDD §2.10)
// src/lib/jobs/seeders/daily-sources/github-trending.ts
//
// Daily sweep of GitHub Trending repos. GitHub Trending has no official API,
// so we scrape the HTML from https://github.com/trending?since=daily, extract
// repo URLs from <article class="Box-row"> elements, and parse the org name
// from each repo path (/orgname/reponame → orgname).
//
// We also check for CONTRIBUTING.md files which sometimes mention hiring or
// careers pages — those are a secondary signal but the primary discovery
// vector here is the org name itself, which we run through the Slugger.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Fetch https://github.com/trending?since=daily
// 2. Parse HTML with cheerio
// 3. Extract repo paths from <article class="Box-row"> → <h2> → <a href>
// 4. Parse org name from repo path (/orgname/reponame)
// 5. (Secondary) Fetch CONTRIBUTING.md for each repo to look for careers hints
// 6. Deduplicate org names (case-insensitive)
// 7. Run each org name through resolveSlugger with insertCompany: true
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 1-5 companies/day. Most trending repos are owned by individuals or small
// projects that won't have an ATS, but the occasional org (e.g. a well-funded
// devtools company trending on a launch day) makes this worthwhile.
//
// See TDD §2.10 (D10) for the full specification.

import * as cheerio from "cheerio";
import { deduplicateOrgNames } from "@/lib/jobs/seeders/seeder-utils";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

const GITHUB_TRENDING_URL = "https://github.com/trending?since=daily";

/** Raw URL for fetching a repo's CONTRIBUTING.md (default branch fallback). */
const CONTRIBUTING_URL_TEMPLATE =
  "https://raw.githubusercontent.com/{org}/{repo}/main/CONTRIBUTING.md";

/** GitHub-internal path prefixes that aren't real orgs. */
const NON_ORG_PREFIXES = new Set(["orgs", "topics", "trending"]);

// ── Types ────────────────────────────────────────────────────────────────────

export interface GithubTrendingResult {
  /** Total repos found on the trending page. */
  totalRepos: number;
  /** Unique org names extracted (after dedup). */
  uniqueOrgs: number;
  /** Orgs that resolved to an ATS slug. */
  resolved: number;
  /** Orgs that did not resolve (added to retry queue). */
  unresolved: number;
  /**
   * Secondary signal: number of repos whose CONTRIBUTING.md mentioned hiring
   * or careers pages. Best-effort — fetch failures count as zero.
   */
  contributingHits: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

interface RepoPath {
  org: string;
  repo: string;
}

// ── Pure function: extract repo paths from GitHub Trending HTML ──────────────

/**
 * Parse GitHub Trending HTML and extract (org, repo) pairs from repo URLs.
 *
 * GitHub Trending renders each repo as an <article class="Box-row"> containing
 * an <h2> with an <a href="/orgname/reponame">. We split the path into org and
 * repo segments.
 *
 * Repos without a clear org prefix (e.g. user repos where we can't infer a
 * company) are skipped — only two-segment paths are kept.
 *
 * @param html  The raw HTML from the GitHub Trending page
 * @returns     Array of { org, repo } pairs (may contain duplicate orgs)
 */
function extractRepoPathsFromHtml(html: string): RepoPath[] {
  const $ = cheerio.load(html);
  const paths: RepoPath[] = [];

  $("article.Box-row h2 a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    // Normalize: strip leading/trailing slashes, ignore query/hash
    const cleanHref = href.split("?")[0]?.split("#")[0] ?? href;
    const segments = cleanHref.split("/").filter((s) => s.length > 0);
    if (segments.length < 2) return;

    const org = segments[0];
    const repo = segments[1];
    if (!org || !repo) return;

    // Skip GitHub-internal paths that aren't real orgs
    if (NON_ORG_PREFIXES.has(org)) return;

    paths.push({ org, repo });
  });

  return paths;
}

// ── Pure function: extract org names from GitHub Trending HTML ───────────────

/**
 * Parse GitHub Trending HTML and extract org names from repo URLs.
 *
 * Thin wrapper over {@link extractRepoPathsFromHtml} that discards the repo
 * name. Duplicates are preserved — use {@link deduplicateOrgNames} to remove
 * them.
 *
 * @param html  The raw HTML from the GitHub Trending page
 * @returns     Array of org names (may contain duplicates)
 */
export function extractOrgNamesFromHtml(html: string): string[] {
  return extractRepoPathsFromHtml(html).map((p) => p.org);
}

// ── Helper: fetch CONTRIBUTING.md for a repo (secondary signal) ──────────────

/**
 * Fetch a repo's CONTRIBUTING.md and check whether it mentions hiring or
 * careers pages. This is a secondary signal — the primary discovery vector is
 * the org name itself. Failures are non-fatal and silently ignored.
 *
 * @param org       The org name
 * @param repo      The repo name
 * @param fetchFn   Injectable fetch function
 * @returns         True if CONTRIBUTING.md mentions hiring/careers, false otherwise
 */
async function contributingMentionsHiring(
  org: string,
  repo: string,
  fetchFn: FetchFn,
): Promise<boolean> {
  const url = CONTRIBUTING_URL_TEMPLATE.replace("{org}", org).replace(
    "{repo}",
    repo,
  );

  try {
    const response = await fetchFn(url);
    if (!response.ok) return false;

    const text = await response.text();
    const lower = text.toLowerCase();
    return (
      lower.includes("careers") ||
      lower.includes("hiring") ||
      lower.includes("jobs@") ||
      lower.includes("we're hiring") ||
      lower.includes("we are hiring")
    );
  } catch {
    return false;
  }
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the GitHub Trending seeder. Scrapes the trending page, extracts org
 * names, deduplicates them, and runs each through the Slugger with
 * insertCompany: true. As a secondary signal, each repo's CONTRIBUTING.md is
 * fetched best-effort to detect hiring/careers mentions.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @returns        Result with counts and any critical error
 */
export async function runGithubTrendingSeeder(
  fetchFn: FetchFn = fetch,
): Promise<GithubTrendingResult> {
  // 1. Fetch the trending page
  let html: string;
  try {
    const response = await fetchFn(GITHUB_TRENDING_URL);
    if (!response.ok) {
      return {
        totalRepos: 0,
        uniqueOrgs: 0,
        resolved: 0,
        unresolved: 0,
        contributingHits: 0,
        error: `GitHub Trending returned HTTP ${response.status}`,
      };
    }
    html = await response.text();
  } catch (err) {
    return {
      totalRepos: 0,
      uniqueOrgs: 0,
      resolved: 0,
      unresolved: 0,
      contributingHits: 0,
      error: `Failed to fetch GitHub Trending: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 2. Extract repo paths from HTML
  const repoPaths = extractRepoPathsFromHtml(html);
  const totalRepos = repoPaths.length;

  // 3. Deduplicate org names (case-insensitive, first-seen wins)
  const orgNames = deduplicateOrgNames(repoPaths.map((p) => p.org));
  const uniqueOrgs = orgNames.length;

  if (uniqueOrgs === 0) {
    return {
      totalRepos: 0,
      uniqueOrgs: 0,
      resolved: 0,
      unresolved: 0,
      contributingHits: 0,
    };
  }

  // 4. Secondary signal: check CONTRIBUTING.md for hiring/careers mentions.
  //    We check the first repo for each unique org (best-effort, non-fatal).
  const firstRepoByOrg = new Map<string, string>();
  for (const { org, repo } of repoPaths) {
    const key = org.toLowerCase();
    if (!firstRepoByOrg.has(key)) firstRepoByOrg.set(key, repo);
  }

  let contributingHits = 0;
  for (const orgName of orgNames) {
    const repo = firstRepoByOrg.get(orgName.toLowerCase());
    if (!repo) continue;
    const mentionsHiring = await contributingMentionsHiring(
      orgName,
      repo,
      fetchFn,
    );
    if (mentionsHiring) contributingHits++;
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
          discoveryContext: `github-trending:${orgName}`,
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
    totalRepos,
    uniqueOrgs,
    resolved,
    unresolved,
    contributingHits,
  };
}
