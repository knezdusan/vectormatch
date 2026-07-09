// Company Repository — Database operations for the company table
// src/lib/jobs/seeders/company-repository.ts
//
// All seeders (HN Algolia, BigQuery, crt.sh) produce SeedCompanyInput tuples.
// This module handles the database side: deduplication and insertion. The
// seeder domain logic stays pure (no DB imports) — it calls these functions.
//
// ── Deduplication strategy (TDD §4.0) ────────────────────────────────────────
// The company table has a uniqueIndex on (atsSource, atsSlug). Seeders use
// `onConflictDoNothing()` — they only discover NEW companies. They never
// overwrite runtime state (tier, health, pollingEnabled, lastPolledAt) that
// the poller owns. If a company is re-discovered by a different seeder, the
// existing row is left untouched.
//
// See TDD §4.0 (company table) and §4.1 (seeding engines).

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { recordDiscoverySource } from "@/lib/jobs/quality/fusion-score";
import { isAggregator } from "./aggregator-blacklist";
import type { SeedCompanyInput } from "./schemas";
import { seedCompanyInputSchema } from "./schemas";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InsertResult {
  inserted: number;
  skipped: number;
  /** The inputs that were rejected by Zod validation or aggregator blacklist. */
  rejected: SeedCompanyInput[];
  /** The IDs of newly inserted companies (for bootstrap poll events). */
  insertedCompanyIds: string[];
  /** The ATS source + slug of newly inserted companies (for bootstrap poll events). */
  insertedCompanies: { id: string; atsSource: string; atsSlug: string }[];
  /** Count of companies filtered by the aggregator blacklist. */
  aggregatorFiltered: number;
  /** Count of companies filtered by the slug-validation gate (v4 lock §3). */
  slugValidationFiltered?: number;
}

// ── Slug Validation Gate (v4 lock §3) ─────────────────────────────────────────

/**
 * Reject clearly invalid ATS slugs before they enter the company table.
 *
 * The v4 lock investigation found that 54% of companies have never been polled
 * and many have garbage slugs like "190pacificavenuesanfranciscoca94111",
 * "login", "register", "careers", etc. These slugs waste polling budget and
 * pollute the corpus. This gate catches them at insertion time.
 *
 * Validation rules:
 * 1. Length: must be 2-60 chars (real company slugs are 3-40 chars)
 * 2. No pure digits (real slugs have at least some letters)
 * 3. No common navigation paths (login, register, careers, jobs, admin, etc.)
 * 4. No address-like slugs (long strings of concatenated words without hyphens)
 * 5. Must contain at least one vowel (company names have vowels)
 *
 * @param slug  The ATS slug to validate
 * @returns     true if the slug is valid, false if it should be rejected
 */
export function isValidAtsSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;

  const trimmed = slug.trim().toLowerCase();

  // Rule 1: Length check
  if (trimmed.length < 2 || trimmed.length > 60) return false;

  // Rule 2: No pure digits
  if (/^\d+$/.test(trimmed)) return false;

  // Rule 3: No common navigation paths
  const NAV_PATHS = new Set([
    "login",
    "register",
    "signup",
    "sign-up",
    "signin",
    "sign-in",
    "careers",
    "jobs",
    "job",
    "admin",
    "dashboard",
    "settings",
    "profile",
    "account",
    "about",
    "contact",
    "help",
    "support",
    "faq",
    "privacy",
    "terms",
    "api",
    "docs",
    "blog",
    "news",
    "press",
    "team",
    "company",
    "home",
    "index",
    "search",
    "apply",
    "post",
    "new",
    "edit",
    "delete",
    "create",
    "view",
    "list",
    "all",
    "none",
    "null",
    "undefined",
    "test",
    "demo",
    "example",
    "sample",
    "temp",
    "tmp",
    "foo",
    "bar",
    "baz",
  ]);
  if (NAV_PATHS.has(trimmed)) return false;

  // Rule 4: No address-like slugs (long concatenated words without separators)
  // Real company slugs use hyphens or are short. A 30+ char slug with no
  // hyphens/underscores and no spaces is likely an address or garbage.
  if (
    trimmed.length > 25 &&
    !trimmed.includes("-") &&
    !trimmed.includes("_") &&
    !trimmed.includes(".") &&
    !trimmed.includes("/")
  ) {
    return false;
  }

  // Rule 5: 2-char consonant-only slugs are likely garbage (e.g., "js", "nv",
  // "p0"). But 3+ char consonant-only slugs may be real companies (e.g., "tkd",
  // "pgx", "ryvn", "wwdc"). Only reject if the slug is 2 chars AND has no vowels.
  if (trimmed.length <= 2 && !/[aeiou]/.test(trimmed)) return false;

  return true;
}

// ── Insert ───────────────────────────────────────────────────────────────────

/**
 * Insert a batch of discovered companies into the company table. Uses
 * `onConflictDoNothing()` on the (atsSource, atsSlug) unique index — only
 * genuinely new companies are inserted; re-discovered slugs are silently
 * skipped (the existing row's tier/health/polling state is preserved).
 *
 * Each input is validated with `seedCompanyInputSchema.safeParse()` before
 * insertion. Invalid inputs are counted as `rejected` and skipped — they never
 * reach the database.
 *
 * @param inputs  Array of SeedCompanyInput from a seeder's discovery phase.
 * @returns       Counts: how many were inserted, skipped (duplicates), rejected (invalid).
 */
export async function insertDiscoveredCompanies(
  inputs: SeedCompanyInput[],
): Promise<InsertResult> {
  if (inputs.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      rejected: [],
      insertedCompanyIds: [],
      insertedCompanies: [],
      aggregatorFiltered: 0,
      slugValidationFiltered: 0,
    };
  }

  // Validate all inputs. Collect valid ones; track rejected ones.
  // Also filter out known job aggregators (Hirehangar, Ketryx, etc.) — they
  // re-host listings from other companies' ATSs and conflict with the core
  // mission of discovering untapped opportunities.
  //
  // v4 lock §3: Also filter out garbage slugs via isValidAtsSlug — catches
  // the "190pacificavenuesanfranciscoca94111", "login", etc. slugs that
  // polluted the corpus and wasted 54% of polling budget.
  const valid: SeedCompanyInput[] = [];
  const rejected: SeedCompanyInput[] = [];
  let aggregatorFiltered = 0;
  let slugValidationFiltered = 0;

  for (const input of inputs) {
    // Aggregator blacklist check (before Zod validation — cheaper)
    if (isAggregator(input.atsSlug, input.companyName)) {
      aggregatorFiltered++;
      continue;
    }
    // v4 lock §3: Slug validation gate — reject garbage slugs before insertion
    if (!isValidAtsSlug(input.atsSlug)) {
      slugValidationFiltered++;
      continue;
    }
    const result = seedCompanyInputSchema.safeParse(input);
    if (result.success) {
      valid.push(result.data);
    } else {
      rejected.push(input);
    }
  }

  if (valid.length === 0) {
    return {
      inserted: 0,
      skipped: 0,
      rejected,
      insertedCompanyIds: [],
      insertedCompanies: [],
      aggregatorFiltered,
      slugValidationFiltered,
    };
  }

  // Dedup within the batch itself (a seeder might extract the same slug twice
  // from different comments). We dedup on (atsSource, atsSlug).
  const seen = new Set<string>();
  const unique: SeedCompanyInput[] = [];
  for (const item of valid) {
    const key = `${item.atsSource}:${item.atsSlug}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // Insert with onConflictDoNothing — the DB unique index handles cross-batch
  // dedup. We count inserted vs skipped using the returning() clause.
  //
  // v2: pass through the scoring-signal fields (employeeCount, isPublic,
  // isAgency) when provided by funding-signal seeders. Legacy seeders omit
  // these fields — they default to null/false at the DB level.
  const insertedRows = await db
    .insert(company)
    .values(
      unique.map((item) => ({
        atsSlug: item.atsSlug,
        atsSource: item.atsSource,
        companyName: item.companyName,
        rootDomain: item.rootDomain,
        discoverySource: item.discoverySource,
        discoveryContext: item.discoveryContext,
        // v2 scoring signals — only set when the seeder provides them.
        ...(item.employeeCount !== undefined
          ? { employeeCount: item.employeeCount }
          : {}),
        ...(item.isPublic !== undefined ? { isPublic: item.isPublic } : {}),
        ...(item.isAgency !== undefined ? { isAgency: item.isAgency } : {}),
      })),
    )
    .onConflictDoNothing({
      target: [company.atsSource, company.atsSlug],
    })
    .returning({
      id: company.id,
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
    });

  const inserted = insertedRows.length;
  const skipped = unique.length - inserted;

  // ── Q5: Record discovery sources for fusion scoring ───────────────────────
  // Companies inserted directly (not via the Slugger) still need their
  // discovery source recorded so fusion_score is tracked. We map each inserted
  // row back to its original input by (atsSource, atsSlug) to find the
  // discoverySource, then call recordDiscoverySource for each.
  //
  // Errors are caught and logged — a fusion-score failure must not cause the
  // entire insert to fail. The company row is already persisted.
  const sourceByKey = new Map<string, SeedCompanyInput["discoverySource"]>();
  for (const item of unique) {
    sourceByKey.set(`${item.atsSource}:${item.atsSlug}`, item.discoverySource);
  }

  for (const row of insertedRows) {
    const key = `${row.atsSource}:${row.atsSlug}`;
    const discoverySource = sourceByKey.get(key);
    if (discoverySource) {
      try {
        await recordDiscoverySource(row.id, discoverySource);
      } catch (e) {
        console.error(
          `[insertDiscoveredCompanies] Failed to record discovery source for company ${row.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  return {
    inserted,
    skipped,
    rejected,
    insertedCompanyIds: insertedRows.map((r) => r.id),
    insertedCompanies: insertedRows.map((r) => ({
      id: r.id,
      atsSource: r.atsSource,
      atsSlug: r.atsSlug,
    })),
    aggregatorFiltered,
    slugValidationFiltered,
  };
}

/**
 * Check if a company already exists in the registry by (atsSource, atsSlug).
 * Used by seeders to avoid emitting Inngest events for already-known companies.
 */
export async function companyExists(
  atsSource: string,
  atsSlug: string,
): Promise<boolean> {
  const result = await db
    .select({ id: company.id })
    .from(company)
    .where(
      sql`${company.atsSource} = ${atsSource} AND ${company.atsSlug} = ${atsSlug}`,
    )
    .limit(1);
  return result.length > 0;
}
