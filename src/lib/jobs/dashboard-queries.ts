// Module C — Dashboard Query Layer
// src/lib/jobs/dashboard-queries.ts
//
// Read-side queries for the /dashboard/jobs page and sidebar badge. All
// queries are applicant-scoped (WHERE applicant_id = $userId) and use the
// C0 indexes:
//   - match_queue_applicant_status_idx (applicantId, status, createdAt DESC)
//     → supports the approved matches list query
//   - match_queue_unread_badge_idx (applicantId) WHERE is_read=false AND status='approved'
//     → supports the sidebar unread badge count query
//
// Server-only: touches the database. Called from Server Components and
// Server Actions (AGENTS.md rule 2 — lazy imports not needed here since
// these are only called from server contexts).
//
// (MODULE_C_DECISIONS.md §8)

import "server-only";

import { and, count, desc, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { persona } from "@/db/schemas/jobs/persona";

// =============================================================================
// TYPES
// =============================================================================

/** A match row joined with job + persona data for the dashboard list. */
export type ApprovedMatchRow = {
  matchQueueId: string;
  jobId: string;
  jobTitle: string;
  jobAtsSource: string;
  jobAtsSlug: string;
  personaId: string;
  personaLabel: string;
  overlapScore: number;
  cosineDistance: number | null;
  llmReasoning: string | null;
  llmConfidence: number | null;
  isRead: boolean;
  createdAt: Date | null;
};

/** A single match detail with full job + persona context. */
export type MatchDetail = {
  matchQueueId: string;
  status: string;
  llmVerdict: string | null;
  llmReasoning: string | null;
  llmModel: string | null;
  evaluatedAt: Date | null;
  isRead: boolean;
  createdAt: Date | null;
  overlapScore: number;
  cosineDistance: number | null;
  job: {
    id: string;
    title: string;
    atsSource: string;
    atsSlug: string;
    extractedTags: string[] | null;
  };
  persona: {
    id: string;
    personaLabel: string;
    embeddingSummary: string;
    mustHaveTags: string[];
  };
};

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get approved matches for the dashboard list (paginated, applicant-scoped).
 *
 * Uses match_queue_applicant_status_idx (applicantId, status, createdAt DESC)
 * — the index returns rows in sorted order without an in-memory sort.
 *
 * @param userId   The authenticated user's ID (applicant.userId)
 * @param limit    Page size (default 20)
 * @param offset   Pagination offset (default 0)
 * @returns        Array of approved match rows with job + persona data
 */
export async function getApprovedMatches(
  userId: string,
  limit = 20,
  offset = 0,
): Promise<ApprovedMatchRow[]> {
  const rows = await db
    .select({
      matchQueueId: matchQueue.id,
      jobId: matchQueue.jobId,
      jobTitle: job.title,
      jobAtsSource: job.atsSource,
      jobAtsSlug: job.atsSlug,
      personaId: matchQueue.personaId,
      personaLabel: persona.personaLabel,
      overlapScore: matchQueue.overlapScore,
      cosineDistance: matchQueue.cosineDistance,
      llmReasoning: matchQueue.llmReasoning,
      // Note: matchConfidence is not stored in matchQueue — it's in the LLM
      // output but we only persist llmReasoning. If needed post-MVP, add a
      // column. For now, null.
      llmConfidence: matchQueue.cosineDistance, // placeholder: use distance as proxy
      isRead: matchQueue.isRead,
      createdAt: matchQueue.createdAt,
    })
    .from(matchQueue)
    .innerJoin(job, eq(matchQueue.jobId, job.id))
    .innerJoin(persona, eq(matchQueue.personaId, persona.id))
    .where(
      and(
        eq(matchQueue.applicantId, userId),
        eq(matchQueue.status, "approved"),
      ),
    )
    .orderBy(desc(matchQueue.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...row,
    // cosineDistance is a "lower is better" metric — invert for display
    // so higher numbers look better. Post-MVP: store matchConfidence directly.
    llmConfidence: row.cosineDistance
      ? Math.max(0, 1 - row.cosineDistance)
      : null,
  }));
}

/**
 * Get the unread approved match count for the sidebar badge.
 *
 * Uses match_queue_unread_badge_idx — a partial index that only indexes
 * rows WHERE is_read = false AND status = 'approved'. This is a tiny fraction
 * of total matches, so the index is very small and fast.
 *
 * @param userId  The authenticated user's ID
 * @returns       Count of unread approved matches (0 if none)
 */
export async function getUnreadBadgeCount(userId: string): Promise<number> {
  const rows = await db
    .select({ cnt: count() })
    .from(matchQueue)
    .where(
      and(
        eq(matchQueue.applicantId, userId),
        eq(matchQueue.isRead, false),
        eq(matchQueue.status, "approved"),
      ),
    );

  return rows[0]?.cnt ?? 0;
}

/**
 * Get a single match detail with full job + persona context.
 *
 * Used on the match detail view (clicking a match in the list).
 * Applicant-scoped — a user can only view their own matches.
 *
 * @param userId       The authenticated user's ID
 * @param matchQueueId The match queue row ID
 * @returns            The match detail, or null if not found / not owned
 */
export async function getMatchDetail(
  userId: string,
  matchQueueId: string,
): Promise<MatchDetail | null> {
  const rows = await db
    .select({
      matchQueueId: matchQueue.id,
      status: matchQueue.status,
      llmVerdict: matchQueue.llmVerdict,
      llmReasoning: matchQueue.llmReasoning,
      llmModel: matchQueue.llmModel,
      evaluatedAt: matchQueue.evaluatedAt,
      isRead: matchQueue.isRead,
      createdAt: matchQueue.createdAt,
      overlapScore: matchQueue.overlapScore,
      cosineDistance: matchQueue.cosineDistance,
      jobId: job.id,
      jobTitle: job.title,
      jobAtsSource: job.atsSource,
      jobAtsSlug: job.atsSlug,
      jobExtractedTags: job.extractedTags,
      personaId: persona.id,
      personaLabel: persona.personaLabel,
      personaEmbeddingSummary: persona.embeddingSummary,
      personaMustHaveTags: persona.mustHaveTags,
    })
    .from(matchQueue)
    .innerJoin(job, eq(matchQueue.jobId, job.id))
    .innerJoin(persona, eq(matchQueue.personaId, persona.id))
    .where(
      and(eq(matchQueue.id, matchQueueId), eq(matchQueue.applicantId, userId)),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    matchQueueId: r.matchQueueId,
    status: r.status,
    llmVerdict: r.llmVerdict,
    llmReasoning: r.llmReasoning,
    llmModel: r.llmModel,
    evaluatedAt: r.evaluatedAt,
    isRead: r.isRead,
    createdAt: r.createdAt,
    overlapScore: r.overlapScore,
    cosineDistance: r.cosineDistance,
    job: {
      id: r.jobId,
      title: r.jobTitle,
      atsSource: r.jobAtsSource,
      atsSlug: r.jobAtsSlug,
      extractedTags: r.jobExtractedTags,
    },
    persona: {
      id: r.personaId,
      personaLabel: r.personaLabel,
      embeddingSummary: r.personaEmbeddingSummary,
      mustHaveTags: r.personaMustHaveTags,
    },
  };
}
