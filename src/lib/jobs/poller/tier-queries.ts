// Tier Queries — Get Companies by Tier for Fan-Out Polling
// src/lib/jobs/poller/tier-queries.ts
//
// The Phalanx Poller uses a fan-out pattern (TDD §4.4.1):
//   1. Two scheduled Inngest functions query companies by tier
//   2. Each emits `poller/poll-company` events for the matching companies
//   3. Each event triggers a separate per-company poll function instance
//
// This module provides the queries that the scheduled functions use to find
// which companies need polling.
//
// See TDD §4.4.1 (Three Optimizations) and §4.4 (Decay Polling).

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";

// ── Types ────────────────────────────────────────────────────────────────────

export interface CompanyToPoll {
  id: string;
  atsSource: string;
  atsSlug: string;
  companyName: string | null;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get all Tier A (active) companies that are due for polling.
 * Tier A companies are polled every 12 hours.
 *
 * A company is "due" if:
 *   - tier = "active"
 *   - pollingEnabled = true
 *   - lastPolledAt is null OR lastPolledAt < 12 hours ago
 */
export async function getActiveTierCompanies(): Promise<CompanyToPoll[]> {
  const rows = await db
    .select({
      id: company.id,
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
    })
    .from(company)
    .where(
      sql`${company.tier} = 'active' AND ${company.pollingEnabled} = true AND (${company.lastPolledAt} IS NULL OR ${company.lastPolledAt} < NOW() - INTERVAL '12 hours')`,
    );
  return rows;
}

/**
 * Get all Tier B (dormant) companies that are due for polling.
 * Tier B companies are polled weekly.
 *
 * A company is "due" if:
 *   - tier = "dormant"
 *   - pollingEnabled = true
 *   - lastPolledAt is null OR lastPolledAt < 7 days ago
 */
export async function getDormantTierCompanies(): Promise<CompanyToPoll[]> {
  const rows = await db
    .select({
      id: company.id,
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
    })
    .from(company)
    .where(
      sql`${company.tier} = 'dormant' AND ${company.pollingEnabled} = true AND (${company.lastPolledAt} IS NULL OR ${company.lastPolledAt} < NOW() - INTERVAL '7 days')`,
    );
  return rows;
}

/**
 * Get a single company by ID (for manual single-company polls).
 */
export async function getCompanyById(
  companyId: string,
): Promise<CompanyToPoll | null> {
  const rows = await db
    .select({
      id: company.id,
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
    })
    .from(company)
    .where(sql`${company.id} = ${companyId}`)
    .limit(1);
  return rows[0] ?? null;
}

// ── Tier recalculation ───────────────────────────────────────────────────────

/**
 * Recalculate all company tiers based on activity. Run as a daily Inngest
 * scheduled function (TDD §4.4.1).
 *
 * Tier transitions:
 *   - health = "dead" OR consecutiveFailures >= 3 → tier = "dead"
 *   - lastJobPostedAt within 14 days → tier = "active"
 *   - otherwise → tier = "dormant"
 */
export async function recalculateTiers(): Promise<number> {
  // The tier column is a custom enum type (company_tier). PostgreSQL requires
  // explicit casts from text to enum — the CASE expression returns text, so we
  // cast each branch to company_tier. Discovered via live testing 2026-06-23.
  const result = await db.execute(
    sql`UPDATE company SET
  tier = CASE
    WHEN health = 'dead' OR consecutive_failures >= 3 THEN 'dead'::company_tier
    WHEN last_job_posted_at > NOW() - INTERVAL '14 days' THEN 'active'::company_tier
    ELSE 'dormant'::company_tier
  END
WHERE polling_enabled = true`,
  );
  // Return the row count (approximate — Drizzle doesn't always return this)
  return result.rowCount ?? 0;
}
