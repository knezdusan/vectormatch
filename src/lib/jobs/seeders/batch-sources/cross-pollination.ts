// B9: Cross-Pollination from Job Descriptions Seeder (TDD §2.1)
// src/lib/jobs/seeders/batch-sources/cross-pollination.ts
//
// Mines existing job descriptions for company names that haven't been added to
// the company table yet. This is the simplest seeder — it queries the job
// table for DISTINCT company names and runs each through the Slugger.
//
// ── Approach ─────────────────────────────────────────────────────────────────
// 1. Query: SELECT DISTINCT companyName FROM job WHERE companyName IS NOT NULL
// 2. Filter out company names that already exist in the company table
// 3. Run each remaining name through the Slugger (no website — pure name probe)
// 4. The Slugger will attempt DB cache → CNAME check (skipped, no website) →
//    slug probe against all ATS platforms
//
// ── Est. yield ───────────────────────────────────────────────────────────────
// 50-150 companies (many job descriptions mention companies not yet in our
// company table, especially from HN and BigQuery seeders).
//
// See TDD §2.1 (B9) for the full specification.

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import type { SluggerResult } from "@/lib/jobs/seeders/slugger";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CrossPollinationResult {
  /** Total distinct company names found in the job table. */
  totalCompanyNames: number;
  /** Company names already in the company table (skipped). */
  alreadyExists: number;
  /** Company names run through the Slugger. */
  sluggerAttempts: number;
  /** Companies successfully resolved by the Slugger. */
  resolved: number;
  /** Companies that failed Slugger resolution. */
  unresolved: number;
  /** Error message if a critical error occurred. */
  error?: string;
}

// ── Pure function: filter out already-known company names ────────────────────

/**
 * Filter out company names that already exist in the company table.
 * Comparison is case-insensitive.
 *
 * @param names          Distinct company names from the job table
 * @param existingNames  Company names already in the company table (lowercase)
 * @returns              Names not yet in the company table
 */
export function filterNewCompanyNames(
  names: string[],
  existingNames: Set<string>,
): string[] {
  return names.filter((name) => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return false;
    return !existingNames.has(normalized);
  });
}

// ── DB query: get distinct company names from job table ──────────────────────

/**
 * Query the job table for distinct company names.
 * Returns an array of company name strings.
 */
export async function getDistinctCompanyNames(): Promise<string[]> {
  const result = await db.execute(
    sql`SELECT DISTINCT company_name FROM job WHERE company_name IS NOT NULL AND company_name != ''`,
  );
  return result.rows.map(
    (row) => (row as { company_name: string }).company_name,
  );
}

// ── DB query: get existing company names from company table ──────────────────

/**
 * Query the company table for all existing canonical names.
 * Returns a Set of lowercase names for fast lookup.
 */
export async function getExistingCompanyNames(): Promise<Set<string>> {
  const result = await db.select({ name: company.canonicalName }).from(company);

  return new Set(
    result
      .map((r) => r.name?.toLowerCase().trim())
      .filter((n): n is string => !!n),
  );
}

// ── Main seeder function ─────────────────────────────────────────────────────

/**
 * Run the cross-pollination seeder. Mines the job table for distinct company
 * names, filters out those already in the company table, and runs the rest
 * through the Slugger.
 *
 * @param fetchFn  Injectable fetch (for Slugger slug probing)
 * @returns        Result with counts and any errors
 */
export async function runCrossPollinationSeeder(
  fetchFn: FetchFn = fetch,
): Promise<CrossPollinationResult> {
  let totalCompanyNames = 0;
  let alreadyExists = 0;
  let sluggerAttempts = 0;
  let resolved = 0;
  let unresolved = 0;

  try {
    // Step 1: Get distinct company names from the job table
    const jobCompanyNames = await getDistinctCompanyNames();
    totalCompanyNames = jobCompanyNames.length;

    // Step 2: Get existing company names from the company table
    const existingNames = await getExistingCompanyNames();

    // Step 3: Filter out already-known companies
    const newNames = filterNewCompanyNames(jobCompanyNames, existingNames);
    alreadyExists = totalCompanyNames - newNames.length;
    sluggerAttempts = newNames.length;

    // Step 4: Run each new name through the Slugger
    for (const name of newNames) {
      const result: SluggerResult = await resolveSlugger(
        {
          companyName: name,
          discoverySource: "cross_pollination",
          discoveryContext: `job_table:${name}`,
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
    }

    return {
      totalCompanyNames,
      alreadyExists,
      sluggerAttempts,
      resolved,
      unresolved,
    };
  } catch (error) {
    return {
      totalCompanyNames,
      alreadyExists,
      sluggerAttempts,
      resolved,
      unresolved,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
