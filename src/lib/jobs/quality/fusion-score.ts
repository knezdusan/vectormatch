// Multi-Intent Fusion Scoring — Q5 (TDD §3.4)
// src/lib/jobs/quality/fusion-score.ts
//
// When a company is discovered by multiple sources (e.g., HN + GitHub +
// Product Hunt), the fusion score increases. High-fusion companies get
// priority for polling.
//
// The Slugger calls `recordDiscoverySource()` after resolving a company.
// If the source is new (not already recorded for this company), the fusion
// score is incremented. The first discovery (at company insertion time)
// sets fusionScore = 1 and records the initial source.
//
// See CORPUS_EXPANSION_TDD §3.4 for the full specification.

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { companyDiscoverySources } from "@/db/schemas/jobs/companyDiscoverySources";
import type { discoverySourceEnum } from "@/db/schemas/jobs/enums";

// Type of a discovery source — inferred from the Drizzle enum
type DiscoverySource = (typeof discoverySourceEnum.enumValues)[number];

// ── Types ────────────────────────────────────────────────────────────────────

export interface FusionScoreResult {
  /** The company ID. */
  companyId: string;
  /** The updated fusion score. */
  fusionScore: number;
  /** Whether this source was new (true) or already recorded (false). */
  isNewSource: boolean;
}

// ── Database operations ──────────────────────────────────────────────────────

/**
 * Record a discovery source for a company and increment the fusion score
 * if the source is new.
 *
 * This is called by the Slugger after resolving a company. The first call
 * (at company insertion time) records the initial source. Subsequent calls
 * (when a different seeder re-discovers the same company) increment the
 * fusion score.
 *
 * @param companyId        The company UUID
 * @param discoverySource  The source that discovered the company
 * @returns                FusionScoreResult with updated score and isNewSource flag
 */
export async function recordDiscoverySource(
  companyId: string,
  discoverySource: DiscoverySource,
): Promise<FusionScoreResult> {
  // Try to insert a new (companyId, discoverySource) row.
  // If it already exists (unique constraint violation), the source is not new.
  let isNewSource = false;
  try {
    const inserted = await db
      .insert(companyDiscoverySources)
      .values({
        companyId,
        discoverySource,
      })
      .onConflictDoNothing({
        target: [
          companyDiscoverySources.companyId,
          companyDiscoverySources.discoverySource,
        ],
      })
      .returning({ id: companyDiscoverySources.id });

    isNewSource = inserted.length > 0;
  } catch {
    // On conflict, isNewSource stays false
    isNewSource = false;
  }

  // If this is a new source, increment the fusion score
  if (isNewSource) {
    const updated = await db
      .update(company)
      .set({
        fusionScore: sql`${company.fusionScore} + 1`,
      })
      .where(eq(company.id, companyId))
      .returning({ fusionScore: company.fusionScore });

    return {
      companyId,
      fusionScore: updated[0]?.fusionScore ?? 1,
      isNewSource: true,
    };
  }

  // Source already recorded — return current fusion score without incrementing
  const current = await db
    .select({ fusionScore: company.fusionScore })
    .from(company)
    .where(eq(company.id, companyId))
    .limit(1);

  return {
    companyId,
    fusionScore: current[0]?.fusionScore ?? 1,
    isNewSource: false,
  };
}

/**
 * Get all discovery sources recorded for a company.
 */
export async function getDiscoverySources(
  companyId: string,
): Promise<DiscoverySource[]> {
  const rows = await db
    .select({ discoverySource: companyDiscoverySources.discoverySource })
    .from(companyDiscoverySources)
    .where(eq(companyDiscoverySources.companyId, companyId));
  return rows.map((r) => r.discoverySource);
}

/**
 * Check if a company has been discovered by a specific source.
 */
export async function hasBeenDiscoveredBy(
  companyId: string,
  discoverySource: DiscoverySource,
): Promise<boolean> {
  const rows = await db
    .select({ id: companyDiscoverySources.id })
    .from(companyDiscoverySources)
    .where(
      and(
        eq(companyDiscoverySources.companyId, companyId),
        eq(companyDiscoverySources.discoverySource, discoverySource),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
