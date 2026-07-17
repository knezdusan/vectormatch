#!/usr/bin/env npx tsx
/**
 * Gate 4 Census — GitHub Org Resolver Backfill
 *
 * Populates company.github_org for companies where it is currently NULL.
 * The org handle is the value the GitHub API accepts at /orgs/{login}.
 *
 * Resolution strategy (first match wins):
 *   1. Known mapping: a small, manually-curated map of high-confidence
 *      ATS-slug / canonical-name → GitHub org pairs (e.g. "vercel" → "vercel").
 *   2. Heuristic apex: derive a candidate from company.root_domain
 *      (e.g. "vercel.com" → "vercel") and verify it via the GitHub API.
 *   3. Search fallback: query the GitHub Search API for the company name
 *      and verify the top result's org handle. Disabled by default because
 *      it consumes the authenticated rate-limit budget quickly.
 *
 * Usage:
 *   # Dry-run (default): prints proposed updates, writes NOTHING
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-github-org.ts
 *
 *   # Apply: persists company.github_org
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-github-org.ts --apply
 *
 *   # Limit the number of candidate companies to resolve
 *   NODE_OPTIONS='--conditions react-server' npx tsx scripts/backfill-github-org.ts --apply --limit 100
 *
 * Environment:
 *   GITHUB_TOKEN — required for any API verification. Unauthenticated calls
 *                  are limited to 60 req/hr; the corpus is 10,114 companies.
 */

import { config } from "dotenv";

config({ path: ".env" });

import { isNull, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let dryRun = true;
let apply = false;
let limit = 0;
let useSearchFallback = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--dry-run") {
    dryRun = true;
    apply = false;
  } else if (a === "--apply") {
    dryRun = false;
    apply = true;
  } else if (a === "--limit" && args[i + 1]) {
    limit = Number.parseInt(args[i + 1], 10);
    i++;
  } else if (a === "--search-fallback") {
    useSearchFallback = true;
  } else {
    console.error(`Unknown argument: ${a}`);
    console.error(
      "Usage: npx tsx scripts/backfill-github-org.ts [--dry-run|--apply] [--limit N] [--search-fallback]",
    );
    process.exit(1);
  }
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
  console.error(
    "GITHUB_TOKEN is required. Unauthenticated rate limits are too low for the corpus.",
  );
  process.exit(1);
}

const SEP = "=".repeat(70);
console.log(`\n${SEP}`);
console.log("Gate 4 Census — GitHub Org Resolver Backfill");
console.log(SEP);
console.log(
  `Mode: ${dryRun ? "DRY-RUN (no writes)" : "APPLY (persisting github_org)"}`,
);
console.log(`Limit: ${limit === 0 ? "ALL" : limit} candidates`);
console.log(`Search fallback: ${useSearchFallback ? "enabled" : "disabled"}`);
console.log();

// ── Known high-confidence mappings ───────────────────────────────────────────
// Keyed by lowercase ATS slug. These are verified upfront; no API call needed.
const KNOWN_ORG_BY_ATS_SLUG: Readonly<Record<string, string>> = {
  vercel: "vercel",
  supabase: "supabase",
  render: "renderinc",
  cal: "calcom",
  dub: "dubinc",
  unkey: "unkeydev",
  momentohq: "momentohq",
  fermyon: "fermyontech",
  snaplet: "snaplet",
  wundergraph: "wundergraph",
  resend: "resend",
  trigger: "triggerdotdev",
  inngest: "inngest",
  clerk: "clerkinc",
  posthog: "posthog",
  mintlify: "mintlify",
  scalar: "scalar",
  shadcn: "shadcn-ui",
  conform: "conform-to",
  zenstack: "zenstackio",
  react: "facebook",
  vue: "vuejs",
  angular: "angular",
  svelte: "sveltejs",
  astro: "withastro",
  tanstack: "tanstack",
  storybook: "storybookjs",
  tailwindcss: "tailwindlabs",
  vite: "vitejs",
  biome: "biomejs",
  rollup: "rollup",
  webpack: "webpack",
  esbuild: "evanw",
  swc: "swc-project",
  deno: "denoland",
  pnpm: "pnpm",
  d3: "d3",
  threejs: "threejs",
  vitest: "vitest-dev",
  playwright: "microsoft",
  cypress: "cypress-io",
  jest: "jestjs",
};

// ── GitHub API helpers ───────────────────────────────────────────────────────

interface GitHubOrg {
  login: string;
  id: number;
}

async function githubFetch<T>(url: string): Promise<T | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "VectorMatch",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (resp.status === 404) return null;
    if (resp.status === 403) {
      const remaining = resp.headers.get("x-ratelimit-remaining");
      if (remaining === "0") {
        throw new Error("GitHub API rate limit exhausted");
      }
      return null;
    }
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return null;
    throw err;
  }
}

async function verifyOrg(login: string): Promise<string | null> {
  const org = await githubFetch<GitHubOrg>(
    `https://api.github.com/orgs/${encodeURIComponent(login)}`,
  );
  return org?.login ?? null;
}

async function searchOrg(name: string): Promise<string | null> {
  if (!useSearchFallback) return null;
  const data = await githubFetch<{
    items?: { login: string; type: string }[];
  }>(
    `https://api.github.com/search/users?q=${encodeURIComponent(name)}+type:org&per_page=1`,
  );
  const first = data?.items?.[0];
  if (!first) return null;
  // Verify the search result is actually resolvable
  return verifyOrg(first.login);
}

// ── Candidate derivation ────────────────────────────────────────────────────

function apexFromDomain(domain: string | null): string | null {
  if (!domain) return null;
  const clean = domain
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  const parts = clean.split(".");
  if (parts.length < 2) return null;
  return parts[0];
}

function candidateOrgForCompany(row: {
  atsSlug: string;
  companyName: string | null;
  rootDomain: string | null;
  canonicalName: string | null;
}): { candidate: string; source: string } | null {
  const slug = row.atsSlug.toLowerCase().trim();

  // 1. Known mapping
  const known = KNOWN_ORG_BY_ATS_SLUG[slug];
  if (known) return { candidate: known, source: "known_map" };

  // 2. Heuristic: slug itself is often the org login
  if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
    return { candidate: slug, source: "slug_heuristic" };
  }

  // 3. Apex heuristic
  const apex = apexFromDomain(row.rootDomain);
  if (apex && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(apex)) {
    return { candidate: apex, source: "apex_heuristic" };
  }

  // 4. Canonical-name heuristic (strip corporate suffixes)
  const canonical = row.canonicalName ?? row.companyName;
  if (canonical) {
    const normalized = canonical
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/^-+|-+$/g, "");
    if (/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
      return { candidate: normalized, source: "name_heuristic" };
    }
  }

  return null;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const candidates = await db
    .select({
      id: company.id,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
      rootDomain: company.rootDomain,
      canonicalName: company.canonicalName,
      tier: company.tier,
    })
    .from(company)
    .where(isNull(company.githubOrg))
    .orderBy(sql`RANDOM()`)
    .limit(limit === 0 ? Number.MAX_SAFE_INTEGER : limit);

  console.log(`Candidates without github_org: ${candidates.length}`);
  console.log();

  let resolved = 0;
  let failed = 0;
  let skipped = 0;
  const samples: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const row = candidates[i];
    process.stdout.write(
      `  [${i + 1}/${candidates.length}] ${row.atsSlug.slice(0, 30).padEnd(32)}`,
    );

    const candidate = candidateOrgForCompany(row);
    if (!candidate) {
      skipped++;
      console.log(" SKIP: no derivable candidate");
      continue;
    }

    try {
      const verified = await verifyOrg(candidate.candidate);
      if (verified) {
        if (apply) {
          await db
            .update(company)
            .set({ githubOrg: verified })
            .where(sql`${company.id} = ${row.id}`);
        }
        resolved++;
        console.log(` OK  → ${verified} (${candidate.source})`);
        if (samples.length < 20) {
          samples.push(
            `  ${row.atsSlug.padEnd(28)} ${verified.padEnd(24)} ${candidate.source}`,
          );
        }
      } else {
        // Try search fallback if enabled
        const searched = await searchOrg(row.companyName ?? row.atsSlug);
        if (searched) {
          if (apply) {
            await db
              .update(company)
              .set({ githubOrg: searched })
              .where(sql`${company.id} = ${row.id}`);
          }
          resolved++;
          console.log(` OK  → ${searched} (search_fallback)`);
        } else {
          failed++;
          console.log(` FAIL: ${candidate.candidate} not resolvable`);
        }
      }
    } catch (err) {
      console.error(
        `\nError resolving ${row.atsSlug}: ${err instanceof Error ? err.message : String(err)}`,
      );
      process.exit(1);
    }
  }

  console.log();
  console.log(SEP);
  console.log("Results");
  console.log(SEP);
  console.log(`  Candidates processed: ${candidates.length}`);
  console.log(`  Resolved:             ${resolved}`);
  console.log(`  Failed:               ${failed}`);
  console.log(`  Skipped (no candidate): ${skipped}`);
  console.log(
    `  Mode:                 ${dryRun ? "DRY-RUN (no writes)" : "APPLIED"}`,
  );
  if (samples.length > 0) {
    console.log();
    console.log("  Sample resolutions:");
    for (const s of samples) console.log(s);
  }
  console.log();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
