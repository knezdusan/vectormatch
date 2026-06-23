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

import type { BigQueryRow } from "./bq-schemas";
import { bigQueryRowsSchema } from "./bq-schemas";
import type { InsertResult } from "./company-repository";
import { insertDiscoveredCompanies } from "./company-repository";
import type { FetchFn, ResolveCnameFn } from "./resolve-custom-url";
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
 * The query:
 *   1. Filters on a specific monthly crawl date (partition pruning)
 *   2. Filters on desktop client + root pages only (cost optimization)
 *   3. Filters on target tech stacks (4 tiers)
 *   4. Filters on ATS script URL presence in the payload
 *   5. Extracts ATS slugs via REGEXP_EXTRACT when possible
 *
 * @param crawlDate  The monthly crawl date (e.g. "2024-06-01")
 * @param limit      Optional row limit (for testing)
 */
export function buildBigQuerySql(crawlDate: string, limit?: number): string {
  const techConditions = ALL_TECHS.map(
    (tech) => `'${tech}' IN UNNEST(technologies.technology)`,
  ).join("\n    OR ");

  const sql = `SELECT
  root_page,
  page,
  REGEXP_EXTRACT(LOWER(payload), r'boards(?:-api)?\\.greenhouse\\.io/(?:v1/boards/)?([a-z0-9_-]+)') AS greenhouse_slug,
  REGEXP_EXTRACT(LOWER(payload), r'(?:api\\.lever\\.co/v0/postings/|jobs\\.lever\\.co/)([a-z0-9_-]+)') AS lever_slug,
  REGEXP_EXTRACT(LOWER(payload), r'(?:api\\.ashbyhq\\.com/posting-api/job-board/|(?:jobs|careers)\\.ashbyhq\\.com/)([a-z0-9_-]+)') AS ashby_slug
FROM \`httparchive.crawl.pages\`
WHERE
  date = '${crawlDate}'
  AND client = 'desktop'
  AND is_root_page
  AND (
    ${techConditions}
  )
  AND (
    REGEXP_CONTAINS(LOWER(payload), 'boards-api\\.greenhouse\\.io')
    OR REGEXP_CONTAINS(LOWER(payload), 'boards\\.greenhouse\\.io')
    OR REGEXP_CONTAINS(LOWER(payload), 'api\\.lever\\.co/v0/postings')
    OR REGEXP_CONTAINS(LOWER(payload), 'jobs\\.lever\\.co')
    OR REGEXP_CONTAINS(LOWER(payload), 'api\\.ashbyhq\\.com/posting-api')
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
 * Process BigQuery rows: extract ATS slugs (directly or via slug probe) and
 * insert discovered companies. This is the core domain logic, separated from
 * the BigQuery client for testability.
 */
export async function processBigQueryRows(
  rows: BigQueryRow[],
  resolveCname?: ResolveCnameFn,
  fetchFn?: FetchFn,
): Promise<BigQuerySeederResult> {
  const directInputs: SeedCompanyInput[] = [];
  const probeCandidates: string[] = [];

  // Phase 1: Extract direct slugs from BigQuery REGEXP_EXTRACT results.
  for (const row of rows) {
    const domain = row.root_page;
    const page = row.page ?? `https://${domain}/`;

    if (row.greenhouse_slug) {
      directInputs.push({
        atsSlug: row.greenhouse_slug,
        atsSource: "greenhouse",
        rootDomain: domain,
        discoverySource: "httparchive",
        discoveryContext: page,
      });
    } else if (row.lever_slug) {
      directInputs.push({
        atsSlug: row.lever_slug,
        atsSource: "lever",
        rootDomain: domain,
        discoverySource: "httparchive",
        discoveryContext: page,
      });
    } else if (row.ashby_slug) {
      directInputs.push({
        atsSlug: row.ashby_slug,
        atsSource: "ashby",
        rootDomain: domain,
        discoverySource: "httparchive",
        discoveryContext: page,
      });
    } else {
      // No direct slug extracted — needs slug probe resolution.
      probeCandidates.push(`https://${domain}`);
    }
  }

  const directSlugsExtracted = directInputs.length;

  // Phase 2: Slug probe for domains where BigQuery couldn't extract a slug.
  const probeInputs: SeedCompanyInput[] = [];
  let slugProbesResolved = 0;
  let unresolved = 0;

  for (const url of probeCandidates) {
    const result = await resolveCustomUrl(url, resolveCname, fetchFn);
    if (result.success) {
      probeInputs.push(result.input);
      slugProbesResolved++;
    } else {
      unresolved++;
    }
  }

  // Insert all discovered companies (direct + probe) in a single batch.
  const allInputs = [...directInputs, ...probeInputs];
  const insertResult = await insertDiscoveredCompanies(allInputs);

  return {
    domainsFound: rows.length,
    directSlugsExtracted,
    slugProbesAttempted: probeCandidates.length,
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
 * Requires GOOGLE_APPLICATION_CREDENTIALS or equivalent auth.
 */
export async function createDefaultBigQueryFn(): Promise<BigQueryFn> {
  const { BigQuery } = await import("@google-cloud/bigquery");
  const bqClient = new BigQuery();

  return async (sql: string) => {
    const [rows] = await bqClient.query({ query: sql });
    return rows as BigQueryRow[];
  };
}
