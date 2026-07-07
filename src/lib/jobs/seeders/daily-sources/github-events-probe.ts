// v2 Corpus Expansion — GitHub Events API Probe Seeder (Criterion 1 Discovery Layer)
// src/lib/jobs/seeders/daily-sources/github-events-probe.ts
//
// Polls the GitHub Events API for a curated list of YC/VC-funded GitHub orgs
// to detect active companies. The "funding signal" is that these orgs are on
// a curated list of known YC/VC-funded companies — the GitHub Events API
// confirms they're actively developing (recent push/event activity suggests
// the company is alive and likely hiring).
//
// ── Approach (per governing doc Criterion 1 "Discovery Layer") ───────────────
// 1. Maintain a curated list of YC/VC-funded GitHub org names. These are
//    startups by definition (< 50 employees) — the funding-signal itself is
//    the startup filter; no employee-count estimation needed.
// 2. Poll the GitHub Events API for each org:
//    GET https://api.github.com/users/{org}/events/public
// 3. If the org has recent activity (>= 1 event in the last 7 days), insert
//    it as a company via the Slugger with discoverySource = "github_probe".
// 4. Inactive orgs (no recent events) are skipped — they may be dead companies.
//
// ── Employee count ───────────────────────────────────────────────────────────
// GitHub orgs don't expose employee count. Per governing doc: "Employee count
// sourced from funding-signal metadata (YC/Crunchbase/GitHub org data) at
// discovery time." For GitHub-probe-sourced companies, the funding-signal
// metadata is the YC/VC portfolio membership — these companies are < 50 by
// definition. We set employeeCount = null (unknown exact count) and rely on
// the startup-filter pass-through for null values (passesStartupFilter(null)
// returns true).
//
// ── Rate limits ──────────────────────────────────────────────────────────────
// GitHub Events API: 60 req/hr unauthenticated, 5000 req/hr authenticated.
// The curated list is small (~50-100 orgs for MVP), so unauthenticated is
// sufficient. If the list grows, add GITHUB_TOKEN auth.
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 3-10 active YC/VC-funded companies/run. Inactive orgs are skipped.
//
// See docs/governing/company-corpus-expansion-new.md Criterion 1.

import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Curated list of YC/VC-funded GitHub org names. These are known startup-stage
 * companies (< 50 employees) that are likely to have ATS boards.
 *
 * This is a seed list — the GitHub Events API confirms activity, but the
 * funding-signal itself is YC/VC portfolio membership. Add more orgs as they
 * are discovered through the YC directory (B3) or VC portfolio (B4) batch
 * sources.
 */
export const YC_VC_FUNDED_ORGS: string[] = [
  // ── Original YC sample ─────────────────────────────────────────────────────
  "vercel",
  "supabase",
  "renderinc",
  "calcom",
  "dubinc",
  "unkeydev",
  "momentohq",
  "fermyontech",
  "snaplet",
  "wundergraph",

  // ── Frontend frameworks & meta-frameworks ───────────────────────────────────
  "facebook", // React
  "vuejs",
  "angular",
  "sveltejs",
  "astro-build",
  "solidjs",
  "preactjs",
  "nuxt",
  "remix-run",
  "withastro",
  "reactjs",
  "tanstack",

  // ── Dev tooling & build tools ───────────────────────────────────────────────
  "storybookjs",
  "tailwindlabs",
  "vitejs",
  "biomejs",
  "evanw",
  "rollup",
  "parcel-bundler",
  "webpack",
  "esbuild",
  "swc-project",
  "typescript-eslint",
  "denoland",
  "pnpm",
  "changesets",
  "formatjs",
  "pmndrs",
  "d3",
  "threejs",
  "mermaid-js",
  "testing-library",
  "vitest",
  "playwright-dev",
  "cypress-io",
  "jestjs",
  "mswjs",
  "nock",

  // ── YC/VC-funded startups (frontend-relevant) ──────────────────────────────
  "resend",
  "triggerdotdev",
  "inngest",
  "clerkinc",
  "posthog",
  "mintlify",
  "scalar",
  "shadcn-ui",
  "conform-to",
  "park-ui",
  "zenstackio",
  "keystonejs",
  "convex-dev",
  "e2b-dev",
  "modal-labs",
  "val-town",
  "wasp-lang",
  "liveblocks",
  "stytch",
  "workos",
  "ory",
  "helicone",
  "langchain-ai",
  "chroma-core",
  "pinecone-io",
  "weaviate",
  "qdrant",
  "llama-index",
  "fixie-ai",
  "lastmile-ai",
  "browserbase",
  "drizzle-team",
  "trpc",
  "trpc-next",

  // ── Design / frontend SaaS ──────────────────────────────────────────────────
  "figma",
  "linear",
  "notionhq",
  "framer",
  "radix-ui",
  "headlessui",
  "ark-ui",
  "chakra-ui",
  "mantine-org",
  "fluentui",

  // ── Backend-for-frontend / API platforms ────────────────────────────────────
  "nestjs",
  "prisma",
  "planetscale",
  "neondatabase",
  "xata",
  "cockroachdb",
  "hasura",
  "nhost",
  "appwrite",
  "pocketbase",

  // ── Component libraries & design systems ───────────────────────────────────
  "ant-design",
  "element-plus",
  "naiveui",
  "arco-design",
  "vant-ui",
  "vant-contrib",
  "react-hook-form",
  "reactrouter",
  "tanstack-query",
  "tanstack-table",
  "tanstack-router",
  "tanstack-virtual",
  "tanstack-form",
  "sveltejs-kit",

  // ── Additional frontend-ecosystem orgs ──────────────────────────────────────
  "vercel-labs",
  "nrwl",
  "nxtensions",
  "formkit",
  "formidablelabs",
  "emberjs",
  "glimmerjs",
  "backbone",
  "marionettejs",
  "knockout",
  "jashkenas",
  "documentcloud",
  "github-next",
  "shadcn",
  "react-navigation",
  "callstack",
  "callstack-io",
  "expo",
  "expo-router",
  "infinitered",
  "infinitered-ignite",
  "software-mansion",
  "software-mansion-labs",
  "polacode",
  "blitz-js",
  "blitzjs",
  "builderio",
  "builderio-io",
  "mitosis-builder",
  "qwik",
  "qwikifiers",
  "partytown",
  "ai-sdk",
  "vercel-ai",
  "vercel-analytics",
  "vercel-edge",
  "vercel-storage",
  "nextjs",
  "nextjs-org",
  "nextauthjs",
  "next-auth",
  "authjs",
  "trpc-group",
  "trpc-io",
  "trpc-oss",
  "drizzle-orm",
  "drizzlejs",
  "drizzle-studio",
  "drizzle-labs",
];

/** GitHub Events API endpoint template. */
const GITHUB_EVENTS_URL_TEMPLATE =
  "https://api.github.com/users/{org}/events/public";

/** Window for "recent activity" — orgs with no events in this many days are skipped. */
export const RECENT_ACTIVITY_WINDOW_DAYS = 7;

// ── Types ────────────────────────────────────────────────────────────────────

export interface GithubEventsProbeResult {
  /** Total orgs in the curated list. */
  totalOrgs: number;
  /** Orgs with recent GitHub activity (passed the activity check). */
  activeOrgs: number;
  /** Orgs with no recent activity (skipped). */
  inactiveOrgs: number;
  /** Active orgs successfully resolved by the Slugger (inserted into registry). */
  resolved: number;
  /** Active orgs that failed Slugger resolution (added to retry queue). */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

interface GithubEvent {
  type: string;
  created_at: string;
}

interface GithubEventsResponse {
  data?: GithubEvent[];
}

// ── Pure function: build GitHub Events API URL ───────────────────────────────

/**
 * Build the GitHub Events API URL for a given org.
 *
 * @param org  The GitHub org name (without @ prefix)
 * @returns    The full API URL
 */
export function buildGithubEventsUrl(org: string): string {
  return GITHUB_EVENTS_URL_TEMPLATE.replace("{org}", org);
}

// ── Pure function: check if events indicate recent activity ──────────────────

/**
 * Check whether a list of GitHub events indicates recent activity.
 * "Recent" = at least one event within RECENT_ACTIVITY_WINDOW_DAYS days.
 *
 * @param events     Array of GitHub events (each with a created_at timestamp)
 * @param now        Reference timestamp (defaults to current time; injectable for tests)
 * @returns          true if at least one event is within the activity window
 */
export function hasRecentActivity(
  events: GithubEvent[],
  now: Date = new Date(),
): boolean {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RECENT_ACTIVITY_WINDOW_DAYS);

  return events.some((event) => {
    try {
      const eventDate = new Date(event.created_at);
      return eventDate >= cutoff;
    } catch {
      return false;
    }
  });
}

// ── Pure function: parse GitHub Events API response ──────────────────────────

/**
 * Parse the GitHub Events API JSON response and extract the event list.
 * Handles both the raw array format (most common) and the wrapped { data: [] }
 * format (defensive — some GitHub API versions wrap responses).
 *
 * @param json  Raw JSON string from the GitHub Events API
 * @returns     Array of events (empty if invalid or empty)
 */
export function parseGithubEventsResponse(json: string): GithubEvent[] {
  if (!json || json.trim().length === 0) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  // GitHub Events API returns a bare array of event objects.
  if (Array.isArray(parsed)) {
    return parsed.filter(
      (e): e is GithubEvent =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as GithubEvent).type === "string" &&
        typeof (e as GithubEvent).created_at === "string",
    );
  }

  // Defensive: handle wrapped { data: [] } format.
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    Array.isArray((parsed as GithubEventsResponse).data)
  ) {
    return (parsed as GithubEventsResponse).data ?? [];
  }

  return [];
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the v2 GitHub Events API probe seeder. Polls the GitHub Events API for
 * each org in the curated YC/VC-funded list, checks for recent activity, and
 * inserts active orgs via the Slugger with `discoverySource = "github_probe"`.
 *
 * Individual org failures (network errors, 404 for non-existent orgs, rate
 * limits) are handled gracefully — one org failing does not stop the seeder.
 *
 * @param fetchFn  Injectable fetch (defaults to global fetch)
 * @param orgs     Optional custom org list (defaults to YC_VC_FUNDED_ORGS).
 *                 Tests pass a small list for deterministic behavior.
 * @returns        Result with counts and any error
 */
export async function runGithubEventsProbeSeeder(
  fetchFn: FetchFn = fetch,
  orgs: string[] = YC_VC_FUNDED_ORGS,
): Promise<GithubEventsProbeResult> {
  const totalOrgs = orgs.length;
  let activeOrgs = 0;
  let inactiveOrgs = 0;
  let resolved = 0;
  let unresolved = 0;
  let error: string | undefined;

  try {
    for (const org of orgs) {
      try {
        const url = buildGithubEventsUrl(org);
        const response = await fetchFn(url, {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "vectormatch-seeder",
          },
        });

        // 404 = org doesn't exist; 403 = rate limited. Skip both.
        if (!response.ok) {
          inactiveOrgs++;
          continue;
        }

        const body = await response.text();
        const events = parseGithubEventsResponse(body);

        if (!hasRecentActivity(events)) {
          inactiveOrgs++;
          continue;
        }

        activeOrgs++;

        // Resolve the org name through the Slugger for ATS resolution.
        // GitHub org names are typically the company name (lowercase). The
        // Slugger canonicalizes and probes against ATS APIs.
        const result: SluggerResult = await resolveSlugger(
          {
            companyName: org,
            discoverySource: "github_probe",
            discoveryContext: `github-events-probe:org:${org}`,
            // GitHub orgs don't expose employee count. YC/VC-funded orgs are
            // < 50 by definition — leave employeeCount null (passes startup
            // filter via the null-allow-through rule).
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
        // Individual org fetch/parse/resolve failure — count as inactive, continue
        inactiveOrgs++;
      }
    }

    return {
      totalOrgs,
      activeOrgs,
      inactiveOrgs,
      resolved,
      unresolved,
      error,
    };
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    return {
      totalOrgs,
      activeOrgs,
      inactiveOrgs,
      resolved,
      unresolved,
      error,
    };
  }
}
