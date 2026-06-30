// Quality Flywheel — Q2 (TDD §3.2)
// src/lib/jobs/quality/quality-flywheel.ts
//
// Daily recalculation of per-company quality scores based on match_queue
// approval rates. Companies with high approval rates are promoted to
// active_hot (polled every 3h). Companies with low approval rates are
// demoted to dormant (polled weekly).
//
// Promotion/demotion rules (TDD §3.2):
//   - score > 50 AND approvedMatches > 3 → promote to active_hot
//   - score < 10 AND totalJobsProcessed > 20 → demote to dormant
//   - 0 approved matches in 90 days → mark for purge review (logged, not auto-deleted)
//
// See CORPUS_EXPANSION_TDD §3.2 for the full specification.

import { sql } from "drizzle-orm";
import { db } from "@/db/db";

// ── Types ────────────────────────────────────────────────────────────────────

export interface QualityFlywheelResult {
  /** Number of company score rows updated/inserted. */
  companiesScored: number;
  /** Number of companies promoted to active_hot. */
  promoted: number;
  /** Number of companies demoted to dormant. */
  demoted: number;
  /** Number of companies flagged for purge review (0 approved in 90d). */
  purgeCandidates: number;
}

// ── Pure function: score calculation ─────────────────────────────────────────

/**
 * Calculate the quality score for a company based on match metrics.
 *
 * Score = (approvedMatches / totalJobsProcessed) * 100
 *
 * Returns 0 if totalJobsProcessed is 0 (avoid division by zero).
 *
 * @param approvedMatches      Number of approved matches for this company
 * @param totalJobsProcessed   Total jobs processed through the funnel
 * @returns                    Quality score 0-100
 */
export function calculateQualityScore(
  approvedMatches: number,
  totalJobsProcessed: number,
): number {
  if (totalJobsProcessed === 0) return 0;
  return Math.round((approvedMatches / totalJobsProcessed) * 100);
}

// ── Pure function: tier action determination ─────────────────────────────────

export type TierAction = "promote" | "demote" | "none";

/**
 * Determine the tier action for a company based on its quality metrics.
 *
 * Rules (TDD §3.2):
 *   - score > 50 AND approvedMatches > 3 → "promote" (→ active_hot)
 *   - score < 10 AND totalJobsProcessed > 20 → "demote" (→ dormant)
 *   - otherwise → "none"
 *
 * @param score                Quality score 0-100
 * @param approvedMatches      Number of approved matches
 * @param totalJobsProcessed   Total jobs processed
 * @returns                    "promote" | "demote" | "none"
 */
export function determineTierAction(
  score: number,
  approvedMatches: number,
  totalJobsProcessed: number,
): TierAction {
  if (score > 50 && approvedMatches > 3) return "promote";
  if (score < 10 && totalJobsProcessed > 20) return "demote";
  return "none";
}

// ── Database operations ──────────────────────────────────────────────────────

/**
 * Recalculate quality scores for all companies and apply tier promotions/demotions.
 *
 * This function:
 * 1. Aggregates match_queue data per company (approved/rejected/total counts)
 * 2. Upserts into company_quality_score
 * 3. Promotes high-quality companies to active_hot
 * 4. Demotes low-quality companies to dormant
 * 5. Identifies purge candidates (0 approved in 90 days)
 *
 * Runs as a daily Inngest scheduled function.
 */
export async function recalculateQualityScores(): Promise<QualityFlywheelResult> {
  // Step 1: Upsert quality scores from match_queue aggregation
  // The aggregation joins match_queue → job → company to count matches per company
  const upsertResult = await db.execute(sql`
    INSERT INTO company_quality_score (
      company_id, score, approved_matches, rejected_matches,
      total_jobs_processed, last_approved_at, calculated_at
    )
    SELECT
      c.id,
      CASE
        WHEN COUNT(mq.id) = 0 THEN 0
        ELSE ROUND(
          COUNT(*) FILTER (WHERE mq.status = 'approved')::numeric /
          COUNT(mq.id) * 100
        )
      END AS score,
      COUNT(*) FILTER (WHERE mq.status = 'approved') AS approved_matches,
      COUNT(*) FILTER (WHERE mq.status = 'rejected') AS rejected_matches,
      COUNT(mq.id) AS total_jobs_processed,
      MAX(mq.evaluated_at) FILTER (WHERE mq.status = 'approved') AS last_approved_at,
      NOW()
    FROM company c
    LEFT JOIN job j ON j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
    LEFT JOIN match_queue mq ON mq.job_id = j.id
    WHERE c.polling_enabled = true
    GROUP BY c.id
    ON CONFLICT (company_id) DO UPDATE SET
      score = EXCLUDED.score,
      approved_matches = EXCLUDED.approved_matches,
      rejected_matches = EXCLUDED.rejected_matches,
      total_jobs_processed = EXCLUDED.total_jobs_processed,
      last_approved_at = EXCLUDED.last_approved_at,
      calculated_at = NOW()
  `);

  const companiesScored = upsertResult.rowCount ?? 0;

  // Step 2: Promote high-quality companies to active_hot
  // score > 50 AND approvedMatches > 3
  const promoteResult = await db.execute(sql`
    UPDATE company SET tier = 'active_hot'::company_tier
    WHERE id IN (
      SELECT company_id FROM company_quality_score
      WHERE score > 50 AND approved_matches > 3
    )
    AND polling_enabled = true
    AND tier != 'active_hot'::company_tier
  `);
  const promoted = promoteResult.rowCount ?? 0;

  // Step 3: Demote low-quality companies to dormant
  // score < 10 AND totalJobsProcessed > 20
  // Don't demote companies discovered within 48h (Q4 bootstrap protection)
  const demoteResult = await db.execute(sql`
    UPDATE company SET tier = 'dormant'::company_tier
    WHERE id IN (
      SELECT company_id FROM company_quality_score
      WHERE score < 10 AND total_jobs_processed > 20
    )
    AND polling_enabled = true
    AND tier NOT IN ('dead'::company_tier, 'dormant'::company_tier)
    AND discovered_at < NOW() - INTERVAL '48 hours'
  `);
  const demoted = demoteResult.rowCount ?? 0;

  // Step 4: Count purge candidates (0 approved in 90 days, but had jobs processed)
  // These are logged but NOT auto-deleted — manual review required
  const purgeResult = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM company_quality_score
    WHERE approved_matches = 0
    AND total_jobs_processed > 0
    AND (last_approved_at IS NULL OR last_approved_at < NOW() - INTERVAL '90 days')
  `);
  const purgeCandidates = (purgeResult.rows?.[0] as { cnt?: number })?.cnt ?? 0;

  return { companiesScored, promoted, demoted, purgeCandidates };
}
