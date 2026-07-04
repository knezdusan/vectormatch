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
import { user } from "@/db/schemas/auth/user";
import { applicant } from "@/db/schemas/jobs/applicant";
import { company } from "@/db/schemas/jobs/company";
import { companyQualityScore } from "@/db/schemas/jobs/companyQualityScore";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { sourceHealth } from "@/db/schemas/jobs/sourceHealth";
import { GATE2_MAX_COSINE_DISTANCE } from "@/lib/jobs/matching-config";
import {
  getDatabaseSizeMb,
  getIngestionBacklog,
  MAX_UNNORMALIZED_BACKLOG,
  STORAGE_LIMIT_MB,
} from "@/lib/jobs/storage-check";

// =============================================================================
// TYPES
// =============================================================================

export interface InfraStats {
  storageMb: number;
  storageLimitMb: number;
  storagePercentage: number;
  gate2Threshold: number;
  unnormalizedCount: number;
  maxUnnormalized: number;
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

export interface SystemOverviewStats {
  totalUsers: number;
  onboardedUsers: number;
  totalCompanies: number;
  totalJobs: number;
  activeJobs: number;
  totalMatches: number;
  approvedMatches: number;
  staleMatches24h: number;
}

export interface StatusDistribution {
  status: string;
  count: number;
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
  const [storageMb, unnormalizedCount] = await Promise.all([
    getDatabaseSizeMb(),
    getIngestionBacklog(),
  ]);
  return {
    storageMb,
    storageLimitMb: STORAGE_LIMIT_MB,
    storagePercentage: storageMb / STORAGE_LIMIT_MB,
    gate2Threshold: GATE2_MAX_COSINE_DISTANCE,
    unnormalizedCount,
    maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
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

// =============================================================================
// SYSTEM OVERVIEW QUERIES
// =============================================================================

/**
 * Get high-level system overview stats for the admin dashboard.
 *
 * Aggregates across users, applicants, companies, jobs, and match queue rows.
 * All counts are simple index-backed COUNT(*) queries.
 */
export async function getSystemOverviewStats(): Promise<SystemOverviewStats> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 1);

  const [
    totalUsersRows,
    onboardedRows,
    companyRows,
    jobRows,
    activeJobRows,
    matchRows,
    approvedMatchRows,
    staleMatchRows,
  ] = await Promise.all([
    db.select({ cnt: count() }).from(user),
    db
      .select({ cnt: count() })
      .from(applicant)
      .where(sql`${applicant.isOnboarded} = true`),
    db.select({ cnt: count() }).from(company),
    db.select({ cnt: count() }).from(job),
    db.select({ cnt: count() }).from(job).where(eq(job.status, "active")),
    db.select({ cnt: count() }).from(matchQueue),
    db
      .select({ cnt: count() })
      .from(matchQueue)
      .where(eq(matchQueue.status, "approved")),
    db
      .select({ cnt: count() })
      .from(matchQueue)
      .where(
        sql`${matchQueue.status} = 'stale' AND ${matchQueue.staleAt} >= ${cutoff}`,
      ),
  ]);

  return {
    totalUsers: totalUsersRows[0]?.cnt ?? 0,
    onboardedUsers: onboardedRows[0]?.cnt ?? 0,
    totalCompanies: companyRows[0]?.cnt ?? 0,
    totalJobs: jobRows[0]?.cnt ?? 0,
    activeJobs: activeJobRows[0]?.cnt ?? 0,
    totalMatches: matchRows[0]?.cnt ?? 0,
    approvedMatches: approvedMatchRows[0]?.cnt ?? 0,
    staleMatches24h: staleMatchRows[0]?.cnt ?? 0,
  };
}

/**
 * Get job status distribution for the pipeline dashboard.
 */
export async function getJobStatusDistribution(): Promise<
  StatusDistribution[]
> {
  const rows = await db
    .select({
      status: job.status,
      count: count(),
    })
    .from(job)
    .groupBy(job.status)
    .orderBy(job.status);
  return rows.map((r) => ({ status: r.status, count: r.count }));
}

/**
 * Get match queue status distribution for the pipeline dashboard.
 */
export async function getMatchQueueStatusDistribution(): Promise<
  StatusDistribution[]
> {
  const rows = await db
    .select({
      status: matchQueue.status,
      count: count(),
    })
    .from(matchQueue)
    .groupBy(matchQueue.status)
    .orderBy(matchQueue.status);
  return rows.map((r) => ({ status: r.status, count: r.count }));
}

// =============================================================================
// Sprint 8: Gate 3 Rejection Pattern Analysis
// =============================================================================

export interface RejectionCategoryRow {
  category: string;
  count: number;
}

export interface PromptVariantRow {
  variant: string;
  total: number;
  approved: number;
  approvalRate: number;
}

export interface PersonaApprovalRow {
  personaId: string;
  personaLabel: string;
  total: number;
  approved: number;
  approvalRate: number;
}

export interface AtsSourceApprovalRow {
  atsSource: string;
  total: number;
  approved: number;
  approvalRate: number;
}

/**
 * Get Gate 3 rejection reasons grouped by category. The llm_blockers array
 * is unnested and categorized by keyword matching. Categories:
 *   - geographic: "remote restricted", "US only", "must be located"
 *   - workplace: "on-site", "hybrid", "requires on-site"
 *   - skills: "not mentioned", "missing", "requires"
 *   - domain: "Angular", "jQuery", "web3", "React Native"
 *   - travel: "travel"
 *   - other: everything else
 */
export async function getRejectionCategories(
  daysBack = 30,
): Promise<RejectionCategoryRow[]> {
  const result = await db.execute(sql`
    WITH blockers AS (
      SELECT unnest(llm_blockers) AS blocker
      FROM match_queue
      WHERE status = 'rejected'
        AND llm_blockers IS NOT NULL
        AND evaluated_at > NOW() - ${daysBack} * INTERVAL '1 day'
    )
    SELECT
      CASE
        WHEN blocker ~* 'remote.*(restrict|US only|must be located|must reside|region|country)' THEN 'geographic'
        WHEN blocker ~* '(on-site|onsite|hybrid|workplace)' THEN 'workplace'
        WHEN blocker ~* '(not mentioned|missing|requires.*skill|skill)' THEN 'skills'
        WHEN blocker ~* '(travel|relocation)' THEN 'travel'
        WHEN blocker ~* '(Angular|jQuery|web3|React Native|Vue|Ember|Backbone)' THEN 'domain'
        ELSE 'other'
      END AS category,
      count(*) AS cnt
    FROM blockers
    GROUP BY category
    ORDER BY cnt DESC
  `);
  return result.rows.map((r) => ({
    category: r.category as string,
    count: Number(r.cnt),
  }));
}

/**
 * Get Gate 3 approval rate by prompt variant (A/B test analysis).
 */
export async function getApprovalByPromptVariant(
  daysBack = 30,
): Promise<PromptVariantRow[]> {
  const result = await db.execute(sql`
    SELECT
      COALESCE(prompt_variant, 'unknown') AS variant,
      count(*) AS total,
      count(*) FILTER (WHERE status = 'approved') AS approved,
      ROUND(
        count(*) FILTER (WHERE status = 'approved')::numeric
        / NULLIF(count(*), 0) * 100, 1
      ) AS approval_rate
    FROM match_queue
    WHERE evaluated_at > NOW() - ${daysBack} * INTERVAL '1 day'
      AND status IN ('approved', 'rejected')
    GROUP BY prompt_variant
    ORDER BY approval_rate DESC
  `);
  return result.rows.map((r) => ({
    variant: r.variant as string,
    total: Number(r.total),
    approved: Number(r.approved),
    approvalRate: Number(r.approval_rate ?? 0),
  }));
}

/**
 * Get Gate 3 approval rate by persona. Helps identify if one persona has
 * 0% approval (its tags may need adjustment).
 */
export async function getApprovalByPersona(
  daysBack = 30,
): Promise<PersonaApprovalRow[]> {
  const result = await db.execute(sql`
    SELECT
      mq.persona_id,
      p.persona_label,
      count(*) AS total,
      count(*) FILTER (WHERE mq.status = 'approved') AS approved,
      ROUND(
        count(*) FILTER (WHERE mq.status = 'approved')::numeric
        / NULLIF(count(*), 0) * 100, 1
      ) AS approval_rate
    FROM match_queue mq
    JOIN persona p ON mq.persona_id = p.id
    WHERE mq.evaluated_at > NOW() - ${daysBack} * INTERVAL '1 day'
      AND mq.status IN ('approved', 'rejected')
    GROUP BY mq.persona_id, p.persona_label
    ORDER BY approval_rate DESC
  `);
  return result.rows.map((r) => ({
    personaId: r.persona_id as string,
    personaLabel: r.persona_label as string,
    total: Number(r.total),
    approved: Number(r.approved),
    approvalRate: Number(r.approval_rate ?? 0),
  }));
}

/**
 * Get Gate 3 approval rate by ATS source. Helps identify if one ATS has
 * systematically lower approval rates (e.g., different job description format).
 */
export async function getApprovalByAtsSource(
  daysBack = 30,
): Promise<AtsSourceApprovalRow[]> {
  const result = await db.execute(sql`
    SELECT
      j.ats_source,
      count(*) AS total,
      count(*) FILTER (WHERE mq.status = 'approved') AS approved,
      ROUND(
        count(*) FILTER (WHERE mq.status = 'approved')::numeric
        / NULLIF(count(*), 0) * 100, 1
      ) AS approval_rate
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    WHERE mq.evaluated_at > NOW() - ${daysBack} * INTERVAL '1 day'
      AND mq.status IN ('approved', 'rejected')
    GROUP BY j.ats_source
    ORDER BY approval_rate DESC
  `);
  return result.rows.map((r) => ({
    atsSource: r.ats_source as string,
    total: Number(r.total),
    approved: Number(r.approved),
    approvalRate: Number(r.approval_rate ?? 0),
  }));
}
