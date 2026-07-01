// Stale Job Verification Queries — G4 (TDD §1.6)
// src/lib/jobs/stale-job-queries.ts
//
// Database queries for the staleJobVerifier Inngest function.
//   - getApprovedMatchesForVerification: Get approved matches from last N days
//     with their job's ATS source/slug/externalJobId for re-verification.
//   - markMatchesStale: Update match_queue status to 'stale' for matches where
//     the underlying job no longer exists at the ATS.
//
// See TDD §1.6 for the full specification.

import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";

// ── Types ────────────────────────────────────────────────────────────────────

export interface ApprovedMatchForVerification {
  matchId: string;
  jobId: string;
  atsSource: string;
  atsSlug: string;
  externalJobId: string;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get all approved matches from the last N days, joined with their job's ATS
 * source/slug/externalJobId. This is the input to the staleJobVerifier's
 * verification step.
 *
 * The query joins match_queue → job to get the ATS coordinates needed to
 * re-fetch the job from the ATS API.
 *
 * @param daysBack  How many days of approved matches to verify (default: 30)
 * @returns         Array of matches with their job's ATS coordinates
 */
export async function getApprovedMatchesForVerification(
  daysBack = 30,
): Promise<ApprovedMatchForVerification[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const results = await db
    .select({
      matchId: matchQueue.id,
      jobId: job.id,
      atsSource: job.atsSource,
      atsSlug: job.atsSlug,
      externalJobId: job.externalJobId,
    })
    .from(matchQueue)
    .innerJoin(job, eq(matchQueue.jobId, job.id))
    .where(
      and(
        eq(matchQueue.status, "approved"),
        gt(matchQueue.evaluatedAt, cutoff),
      ),
    );

  return results.map((r) => ({
    matchId: r.matchId,
    jobId: r.jobId,
    atsSource: r.atsSource,
    atsSlug: r.atsSlug,
    externalJobId: r.externalJobId,
  }));
}

/**
 * Mark matches as stale in the match_queue table. Stale matches are excluded
 * from the dashboard query (which filters by status = 'approved').
 *
 * @param matchIds  The match_queue IDs to mark as stale
 * @returns         Number of rows updated
 */
export async function markMatchesStale(matchIds: string[]): Promise<number> {
  if (matchIds.length === 0) return 0;

  const result = await db
    .update(matchQueue)
    .set({ status: "stale" })
    .where(inArray(matchQueue.id, matchIds))
    .returning({ id: matchQueue.id });

  return result.length;
}

/**
 * Count approved matches for verification (for logging/metrics).
 */
export async function countApprovedMatches(daysBack = 30): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);

  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(matchQueue)
    .where(
      and(
        eq(matchQueue.status, "approved"),
        gt(matchQueue.evaluatedAt, cutoff),
      ),
    );

  return result[0]?.count ?? 0;
}
