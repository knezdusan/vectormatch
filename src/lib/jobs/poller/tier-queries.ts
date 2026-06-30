// Tier Queries — Get Companies by Tier for Batch Polling
// src/lib/jobs/poller/tier-queries.ts
//
// The Phalanx Poller uses a batch polling pattern (G5 — CORPUS_EXPANSION_TDD §1.2):
//   1. A single scheduled Inngest function (batchPollTier) queries companies by tier
//   2. It polls up to 100 companies per run, sequentially within the batch
//
// This module provides the queries that the batch poller uses to find which
// companies need polling.
//
// See CORPUS_EXPANSION_TDD §1.2 (Batch Polling) and §3.1 (G1 Adaptive Cadence).

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

/**
 * Get a batch of companies for a specific tier, due for polling.
 * (G5 — CORPUS_EXPANSION_TDD §1.2: Batch Polling Architecture)
 *
 * Returns up to `limit` companies ordered by lastPolledAt ASC NULLS FIRST —
 * companies that haven't been polled recently (or ever) get priority. This
 * replaces the old fan-out pattern (getActiveTierCompanies → emit per-company
 * events) with a single batch query consumed by the batchPollTier function.
 *
 * @param tier   The company tier ("active_hot" | "active" | "dormant")
 * @param limit  Max companies to return (default 100 — the G5 batch size)
 */
export async function getBatchForTier(
  tier: "active_hot" | "active" | "dormant",
  limit = 100,
): Promise<CompanyToPoll[]> {
  const rows = await db
    .select({
      id: company.id,
      atsSource: company.atsSource,
      atsSlug: company.atsSlug,
      companyName: company.companyName,
    })
    .from(company)
    .where(
      sql`${company.tier} = ${tier}::company_tier AND ${company.pollingEnabled} = true`,
    )
    .orderBy(sql`${company.lastPolledAt} ASC NULLS FIRST`)
    .limit(limit);
  return rows;
}

// ── Tier recalculation ───────────────────────────────────────────────────────

/**
 * Recalculate all company tiers based on activity and match quality.
 * Run as a daily Inngest scheduled function (TDD §4.4.1).
 *
 * G1 — Adaptive Polling Cadence (CORPUS_EXPANSION_TDD §3.1):
 *
 * Tier transitions (evaluated in order — first match wins):
 *   - health = "dead" OR consecutiveFailures >= 3 → tier = "dead"
 *   - approved match_queue entry in last 30 days → tier = "active_hot"
 *   - discovered within last 48 hours (Q4 bootstrap) → tier = "active_hot"
 *   - lastJobPostedAt within 14 days → tier = "active"
 *   - otherwise → tier = "dormant"
 *
 * The `active_hot` tier (G1) polls every 3h — companies that recently produced
 * an approved match are checked more frequently for new job postings.
 *
 * Q4 — Bootstrap Polling: New companies default to `active_hot` at insertion
 * (schema default). This check preserves that tier for the first 48h after
 * discovery, giving new companies a chance to be polled before being demoted
 * to `active` or `dormant` by the job-count-based logic.
 */
export async function recalculateTiers(): Promise<number> {
  // The tier column is a custom enum type (company_tier). PostgreSQL requires
  // explicit casts from text to enum — the CASE expression returns text, so we
  // cast each branch to company_tier. Discovered via live testing 2026-06-23.
  //
  // G1: The active_hot check uses an EXISTS subquery against match_queue joined
  // to job on (ats_source, ats_slug). This is the logical relationship — there
  // is no FK from company to job (by design, see TDD §4.0 key design decisions).
  // The subquery is correlated on company.ats_source + company.ats_slug.
  //
  // Q4: The bootstrap check uses discovered_at > NOW() - INTERVAL '48 hours'
  // to preserve active_hot for newly discovered companies.
  const result = await db.execute(
    sql`UPDATE company SET
  tier = CASE
    WHEN health = 'dead' OR consecutive_failures >= 3 THEN 'dead'::company_tier
    WHEN EXISTS (
      SELECT 1 FROM match_queue mq
      JOIN job j ON j.id = mq.job_id
      WHERE j.ats_source = company.ats_source
        AND j.ats_slug = company.ats_slug
        AND mq.status = 'approved'
        AND mq.evaluated_at > NOW() - INTERVAL '30 days'
    ) THEN 'active_hot'::company_tier
    WHEN discovered_at > NOW() - INTERVAL '48 hours' THEN 'active_hot'::company_tier
    WHEN last_job_posted_at > NOW() - INTERVAL '14 days' THEN 'active'::company_tier
    ELSE 'dormant'::company_tier
  END
WHERE polling_enabled = true`,
  );
  // Return the row count (approximate — Drizzle doesn't always return this)
  return result.rowCount ?? 0;
}
