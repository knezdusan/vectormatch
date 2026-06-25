// BigQuery HTTPArchive Seeder — The Volume Seeder (TDD §4.1.1)
// src/lib/jobs/seeders/bigquery-seeder.ts
//
// The breadth seeder. Queries the public HTTPArchive BigQuery dataset for
// domains running target tech stacks (Next.js, React, Vue, etc.) that also
// contain ATS script URLs in their homepage payload. This finds thousands of
// companies — the HN seeder then catches the long tail of small startups.
//
// ── Two-phase approach (TDD §4.1.1) ──────────────────────────────────────────
// Phase 1 (BigQuery): Query for candidate domains with ATS script URLs.
//   The query uses REGEXP_EXTRACT to pull ATS slugs directly from the payload
//   when possible. Domains where the slug couldn't be extracted are still
//   returned — the slug probe resolver handles those.
//
// Phase 2 (Slug probe): For domains where BigQuery couldn't extract a slug,
//   use the resolve-custom-url module's slug probe to try the inferred slug
//   against all three ATS APIs.
//
// ── Injectable BigQuery client ───────────────────────────────────────────────
// The BigQuery client is injectable for testing. In production, the real
// `@google-cloud/bigquery` client is used. In tests, a mock client returns
// fixture data.
//
// ── Manual script vs Inngest ─────────────────────────────────────────────────
// Per TDD §4.1, this runs as a monthly manual script (`scripts/seed-bigquery.ts`
// via `npm run seed:bigquery`). The Inngest function placeholder
// (`bigQuerySeeder` in src/inngest/functions.ts) provides scheduled execution
// for when we want to automate it. Both call the same domain logic.
//
// See TDD §4.1.1 for the full specification.

import type { FetchFn } from "@/lib/jobs/types";
import type { BigQueryRow } from "./bq-schemas";
import { bigQueryRowsSchema } from "./bq-schemas";
import type { InsertResult } from "./company-repository";
import { insertDiscoveredCompanies } from "./company-repository";
import type { ResolveCnameFn } from "./resolve-custom-url";
import { resolveCustomUrl } from "./resolve-custom-url";
import type { SeedCompanyInput } from "./schemas";

// ── Types ────────────────────────────────────────────────────────────────────

/** Injectable BigQuery query function. Returns rows from a SQL query. */
export type BigQueryFn = (sql: string) => Promise<BigQueryRow[]>;

/** Result of the BigQuery seeder run — for ingestionLog metrics. */
export interface BigQuerySeederResult {
  /** Total candidate domains from BigQuery. */
  domainsFound: number;
  /** Domains where the ATS slug was extracted directly from the payload. */
  directSlugsExtracted: number;
  /** Domains that required slug probe resolution. */
  slugProbesAttempted: number;
  /** Domains successfully resolved via slug probe. */
  slugProbesResolved: number;
  /** Domains that couldn't be resolved (discarded). */
  unresolved: number;
  /** Company table insert result. */
  insertResult: InsertResult;
  /** Error message if the BigQuery query failed. */
  error?: string;
}

// ── SQL query ────────────────────────────────────────────────────────────────

// The technology tiers from TDD §4.1.1. These are the web frameworks and
// build tools that indicate a company is a tech company hiring developers.
const TECH_TIER_1 = [
  "Next.js",
  "React",
  "Vue.js",
  "Nuxt.js",
  "Svelte",
  "SvelteKit",
  "Angular",
  "Astro",
  "Remix",
  "Gatsby",
  "Solid.js",
];

const TECH_TIER_2 = ["Node.js", "Express", "NestJS", "Fastify", "Deno", "Bun"];

const TECH_TIER_3 = [
  "Tailwind CSS",
  "Vite",
  "esbuild",
  "TypeScript",
  "Playwright",
  "Vitest",
];

const TECH_TIER_4 = [
  "PHP",
  "WordPress",
  "Laravel",
  "Drupal",
  "Symfony",
  "Ruby on Rails",
];

const ALL_TECHS = [
  ...TECH_TIER_1,
  ...TECH_TIER_2,
  ...TECH_TIER_3,
  ...TECH_TIER_4,
];

/**
 * Build the BigQuery SQL query for the HTTPArchive dataset.
 *
 * Optimized query (June 2026): Uses the `technologies` column (Wappalyzer
 * detection) instead of scanning the `payload` column. This reduces bytes
 * scanned from ~4 TB to ~15 GB — a 270x cost reduction that fits within
 * BigQuery's 1 TB/month free tier.
 *
 * Wappalyzer detects Greenhouse and Lever as technologies with category
 * "Recruitment & staffing". Ashby is NOT detected by Wappalyzer (too niche),
 * so BigQuery-discovered companies are Greenhouse or Lever only. HN seeder
 * catches Ashby companies.
 *
 * The query:
 *   1. Filters on a specific monthly crawl date (partition pruning)
 *   2. Filters on desktop client + root pages only (cost optimization)
 *   3. Filters on target tech stacks (4 tiers) via technologies column
 *   4. Filters on ATS detection via technologies column (Greenhouse/Lever)
 *   5. Returns root_page + which ATS was detected (for targeted slug probe)
 *
 * No `payload` column reference — that column is JSON and scanning it costs
 * ~4 TB per monthly partition. The `technologies` column is a small array of
 * structs that costs ~15 GB per partition.
 *
 * @param crawlDate  The monthly crawl date (e.g. "2026-06-01")
 * @param limit      Optional row limit (for testing)
 */
// fallow-ignore-next-line unused-export
export function buildBigQuerySql(crawlDate: string, limit?: number): string {
  const techConditions = ALL_TECHS.map(
    (tech) => `t.technology = '${tech}'`,
  ).join("\n    OR ");

  const sql = `SELECT DISTINCT
  root_page,
  page,
  CASE
    WHEN EXISTS (SELECT 1 FROM UNNEST(technologies) t WHERE t.technology = 'Greenhouse') THEN 'greenhouse'
    WHEN EXISTS (SELECT 1 FROM UNNEST(technologies) t WHERE t.technology = 'Lever') THEN 'lever'
  END AS ats_source
FROM \`httparchive.crawl.pages\`
WHERE
  date = '${crawlDate}'
  AND client = 'desktop'
  AND is_root_page
  AND EXISTS (
    SELECT 1 FROM UNNEST(technologies) t WHERE
    ${techConditions}
  )
  AND EXISTS (
    SELECT 1 FROM UNNEST(technologies) t
    WHERE t.technology IN ('Greenhouse', 'Lever')
  )`;

  if (limit) {
    return `${sql}\nLIMIT ${limit};`;
  }
  return `${sql};`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the BigQuery HTTPArchive seeder. Queries for candidate domains, extracts
 * ATS slugs (directly from payload or via slug probe), and inserts new
 * companies into the company table.
 *
 * @param crawlDate     The monthly crawl date (e.g. "2024-06-01")
 * @param queryFn       Injectable BigQuery query function
 * @param resolveCname  Injectable DNS CNAME resolver (for slug probe)
 * @param fetchFn       Injectable fetch (for slug probe)
 * @param limit         Optional row limit (for testing)
 */
export async function runBigQuerySeeder(
  crawlDate: string,
  queryFn: BigQueryFn,
  resolveCname?: ResolveCnameFn,
  fetchFn?: FetchFn,
  limit?: number,
): Promise<BigQuerySeederResult> {
  try {
    const sql = buildBigQuerySql(crawlDate, limit);
    const rawRows = await queryFn(sql);

    // Validate the query results with Zod.
    const parsed = bigQueryRowsSchema.safeParse(rawRows);
    if (!parsed.success) {
      throw new Error(
        `BigQuery response failed Zod validation: ${parsed.error.message}`,
      );
    }

    return processBigQueryRows(parsed.data, resolveCname, fetchFn);
  } catch (error) {
    return {
      domainsFound: 0,
      directSlugsExtracted: 0,
      slugProbesAttempted: 0,
      slugProbesResolved: 0,
      unresolved: 0,
      insertResult: { inserted: 0, skipped: 0, rejected: [] },
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ── Row processing (pure, testable without BigQuery) ─────────────────────────

/**
 * Process BigQuery rows: resolve ATS slugs via slug probe and insert discovered
 * companies. This is the core domain logic, separated from the BigQuery client
 * for testability.
 *
 * The optimized query (June 2026) returns root_page + ats_source (detected by
 * Wappalyzer). No direct slugs are extracted from the query — all domains go
 * through the slug probe resolver. The ats_source is passed as a hint to the
 * resolver so it only probes the detected ATS (3x fewer API calls).
 */
// fallow-ignore-next-line unused-export
export async function processBigQueryRows(
  rows: BigQueryRow[],
  resolveCname?: ResolveCnameFn,
  fetchFn?: FetchFn,
): Promise<BigQuerySeederResult> {
  const probeInputs: SeedCompanyInput[] = [];
  let slugProbesResolved = 0;
  let unresolved = 0;

  // All rows go through slug probe resolution with the detected ats_source
  // as a hint. The resolver tries CNAME check first, then targeted slug probe.
  for (const row of rows) {
    // root_page from BigQuery may include the protocol (e.g. "https://acme.com/")
    // or just the domain (e.g. "acme.com"). Normalize to a full URL.
    const rawDomain = row.root_page;
    const url = rawDomain.startsWith("http")
      ? rawDomain
      : `https://${rawDomain}`;
    const result = await resolveCustomUrl(
      url,
      resolveCname,
      fetchFn,
      row.ats_source,
    );
    if (result.success) {
      // Override discoverySource to httparchive (resolver sets hn_custom_url)
      probeInputs.push({
        ...result.input,
        discoverySource: "httparchive",
      });
      slugProbesResolved++;
    } else {
      unresolved++;
    }
  }

  const insertResult = await insertDiscoveredCompanies(probeInputs);

  return {
    domainsFound: rows.length,
    directSlugsExtracted: 0,
    slugProbesAttempted: rows.length,
    slugProbesResolved,
    unresolved,
    insertResult,
  };
}

// ── Default BigQuery client factory ──────────────────────────────────────────

/**
 * Create a default BigQuery query function using the official @google-cloud/bigquery
 * client. This is used in production (manual script + Inngest function).
 *
 * Credentials are resolved in this order:
 *   1. GOOGLE_APPLICATION_CREDENTIALS_JSON — inline JSON string (container-friendly,
 *      used by Coolify). The JSON is the full service account key file contents.
 *   2. GOOGLE_APPLICATION_CREDENTIALS — file path to a JSON key file (local dev,
 *      Google's default ADC flow).
 *   3. Application Default Credentials (gcloud auth application-default login).
 *
 * Optional: GOOGLE_CLOUD_PROJECT — overrides the project ID from the credentials.
 */
export async function createDefaultBigQueryFn(): Promise<BigQueryFn> {
  const { BigQuery } = await import("@google-cloud/bigquery");

  const inlineCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;

  const bqClient = inlineCreds
    ? new BigQuery({
        projectId: projectId ?? undefined,
        credentials: JSON.parse(inlineCreds),
      })
    : new BigQuery({ projectId: projectId ?? undefined });

  return async (sql: string) => {
    const [rows] = await bqClient.query({ query: sql });
    return rows as BigQueryRow[];
  };
}
