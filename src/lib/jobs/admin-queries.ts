// Admin Query Layer — Infrastructure & Funnel Analytics (Sprint 4 Tasks 5–6)
// src/lib/jobs/admin-queries.ts
//
// Read-side queries for the admin dashboard. These are NOT applicant-scoped —
// they aggregate across all users, companies, jobs, and matches for
// observability. All queries are admin-only (the pages that call them enforce
// `requireRole("admin")`).
//
// Server-only: touches the database. Called from Server Components and
// Server Actions in the admin dashboard.

import "server-only";

import { count, desc, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { companyQualityScore } from "@/db/schemas/jobs/companyQualityScore";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { sourceHealth } from "@/db/schemas/jobs/sourceHealth";
import { GATE2_MAX_COSINE_DISTANCE } from "@/lib/jobs/matching-config";
import { getDatabaseSizeMb, STORAGE_LIMIT_MB } from "@/lib/jobs/storage-check";

// =============================================================================
// TYPES
// =============================================================================

export interface InfraStats {
  storageMb: number;
  storageLimitMb: number;
  storagePercentage: number;
  gate2Threshold: number;
}

export interface SourceHealthStats {
  sourceName: string;
  status: string;
  consecutiveFailures: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
  totalRuns: number;
  totalFailures: number;
  disabledAt: Date | null;
  disabledReason: string | null;
}

export interface FunnelStats {
  totalJobs: number;
  gate0Passed: number;
  gate12Candidates: number;
  gate3Approved: number;
  gate3Rejected: number;
  approvalRate: number;
}

export interface TierDistribution {
  tier: string;
  count: number;
}

export interface QualityScoreBucket {
  bucket: string;
  count: number;
}

export interface FusionScoreRow {
  fusionScore: number;
  count: number;
}

export interface CompanyQualityRow {
  companyId: string;
  atsSlug: string;
  atsSource: string;
  companyName: string | null;
  score: number;
  approvedMatches: number;
  fusionScore: number;
  tier: string;
}

// =============================================================================
// INFRASTRUCTURE QUERIES (Task 5)
// =============================================================================

/**
 * Get all source health rows for the admin infrastructure dashboard.
 * Ordered by status (disabled first, then degraded, then active) so the most
 * urgent issues appear at the top.
 */
export async function getAllSourceHealth(): Promise<SourceHealthStats[]> {
  const rows = await db
    .select()
    .from(sourceHealth)
    .orderBy(
      // disabled first, then degraded, then active — most urgent on top
      sql`CASE ${sourceHealth.status}
            WHEN 'disabled' THEN 0
            WHEN 'degraded' THEN 1
            ELSE 2
          END`,
      sourceHealth.sourceName,
    );

  return rows as SourceHealthStats[];
}

/**
 * Get infrastructure stats for the admin dashboard: Neon storage size,
 * storage limit, usage percentage, and the current Gate 2 threshold.
 */
export async function getInfraStats(): Promise<InfraStats> {
  const storageMb = await getDatabaseSizeMb();
  return {
    storageMb,
    storageLimitMb: STORAGE_LIMIT_MB,
    storagePercentage: storageMb / STORAGE_LIMIT_MB,
    gate2Threshold: GATE2_MAX_COSINE_DISTANCE,
  };
}

// =============================================================================
// FUNNEL & QUALITY QUERIES (Task 6)
// =============================================================================

/**
 * Get matching funnel stats for the last N days.
 *
 * Funnel: total jobs ingested → Gate 0 passed (normalized, not rejected) →
 * Gate 1+2 candidates (rows in match_queue) → Gate 3 approved.
 *
 * @param daysBack  Number of days to look back (default: 7)
 */
export async function getFunnelStats(daysBack = 7): Promise<FunnelStats> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  // Total jobs ingested in the window
  const totalJobsRows = await db
    .select({ cnt: count() })
    .from(job)
    .where(gte(job.detectedAt, cutoff));
  const totalJobs = totalJobsRows[0]?.cnt ?? 0;

  // Jobs passing Gate 0 (normalized — status is 'normalized' or later, not
  // 'rejected' or 'normalization_failed'). We count jobs with normalizedAt set.
  const gate0Rows = await db
    .select({ cnt: count() })
    .from(job)
    .where(
      sql`${job.normalizedAt} IS NOT NULL AND ${job.detectedAt} >= ${cutoff}`,
    );
  const gate0Passed = gate0Rows[0]?.cnt ?? 0;

  // Gate 1+2 candidates: rows in match_queue created in the window
  const gate12Rows = await db
    .select({ cnt: count() })
    .from(matchQueue)
    .where(gte(matchQueue.createdAt, cutoff));
  const gate12Candidates = gate12Rows[0]?.cnt ?? 0;

  // Gate 3 approved: match_queue rows with status='approved' in the window
  const approvedRows = await db
    .select({ cnt: count() })
    .from(matchQueue)
    .where(
      sql`${matchQueue.status} = 'approved' AND ${matchQueue.createdAt} >= ${cutoff}`,
    );
  const gate3Approved = approvedRows[0]?.cnt ?? 0;

  // Gate 3 rejected: match_queue rows with status='rejected' in the window
  const rejectedRows = await db
    .select({ cnt: count() })
    .from(matchQueue)
    .where(
      sql`${matchQueue.status} = 'rejected' AND ${matchQueue.createdAt} >= ${cutoff}`,
    );
  const gate3Rejected = rejectedRows[0]?.cnt ?? 0;

  const approvalRate =
    gate12Candidates > 0 ? gate3Approved / gate12Candidates : 0;

  return {
    totalJobs,
    gate0Passed,
    gate12Candidates,
    gate3Approved,
    gate3Rejected,
    approvalRate,
  };
}

/**
 * Get company tier distribution (active_hot, active, dormant, dead).
 */
export async function getTierDistribution(): Promise<TierDistribution[]> {
  const rows = await db
    .select({
      tier: company.tier,
      count: count(),
    })
    .from(company)
    .groupBy(company.tier);
  return rows.map((r) => ({ tier: r.tier, count: r.count }));
}

/**
 * Get quality score distribution in buckets (0-10, 10-30, 30-50, 50-100).
 */
export async function getQualityScoreDistribution(): Promise<
  QualityScoreBucket[]
> {
  const rows = await db.execute(sql`
    SELECT
      CASE
        WHEN score < 10 THEN '0-10'
        WHEN score < 30 THEN '10-30'
        WHEN score < 50 THEN '30-50'
        ELSE '50-100'
      END AS bucket,
      COUNT(*)::int AS count
    FROM company_quality_score
    GROUP BY bucket
    ORDER BY bucket
  `);
  return (rows.rows as { bucket: string; count: number }[]).map((r) => ({
    bucket: r.bucket,
    count: r.count,
  }));
}

/**
 * Get fusion score distribution (how many companies have fusion score 1, 2, 3, 4, 5+).
 */
export async function getFusionScoreDistribution(): Promise<FusionScoreRow[]> {
  const rows = await db.execute(sql`
    SELECT
      CASE
        WHEN fusion_score >= 5 THEN 5
        ELSE fusion_score
      END AS score,
      COUNT(*)::int AS count
    FROM company
    GROUP BY score
    ORDER BY score
  `);
  return (rows.rows as { score: number; count: number }[]).map((r) => ({
    fusionScore: r.score,
    count: r.count,
  }));
}

/**
 * Get the top N companies by quality score (highest first).
 */
export async function getTopCompaniesByQuality(
  limit = 10,
): Promise<CompanyQualityRow[]> {
  const rows = await db
    .select({
      companyId: companyQualityScore.companyId,
      atsSlug: company.atsSlug,
      atsSource: company.atsSource,
      companyName: company.companyName,
      score: companyQualityScore.score,
      approvedMatches: companyQualityScore.approvedMatches,
      fusionScore: company.fusionScore,
      tier: company.tier,
    })
    .from(companyQualityScore)
    .innerJoin(company, eq(companyQualityScore.companyId, company.id))
    .orderBy(desc(companyQualityScore.score))
    .limit(limit);
  return rows as CompanyQualityRow[];
}

/**
 * Get purge candidates: companies in 'active' tier with quality score < 10.
 * These are low-quality companies that were demoted and are candidates for
 * removal or further demotion to 'dead'.
 */
export async function getPurgeCandidates(
  limit = 10,
): Promise<CompanyQualityRow[]> {
  const rows = await db
    .select({
      companyId: companyQualityScore.companyId,
      atsSlug: company.atsSlug,
      atsSource: company.atsSource,
      companyName: company.companyName,
      score: companyQualityScore.score,
      approvedMatches: companyQualityScore.approvedMatches,
      fusionScore: company.fusionScore,
      tier: company.tier,
    })
    .from(companyQualityScore)
    .innerJoin(company, eq(companyQualityScore.companyId, company.id))
    .where(
      sql`${company.tier} = 'active' AND ${companyQualityScore.score} < 10`,
    )
    .orderBy(companyQualityScore.score)
    .limit(limit);
  return rows as CompanyQualityRow[];
}
