"use server";

// Match Server Actions — markMatchRead
// src/actions/matches.ts
//
// Server Actions for the /dashboard/jobs page. The user can mark matches as
// read (clearing the sidebar badge) by clicking on them or via a "mark all
// read" button.
//
// Security: every action re-checks the auth session and scopes the update to
// applicant_id = session.user.id. A user can only modify their own matches.
//
// (MODULE_C_DECISIONS.md §8.2)

import { and, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { getAuthSession } from "@/lib/auth";

// =============================================================================
// TYPES
// =============================================================================

export type MatchActionState = {
  success: boolean;
  error?: string;
};

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Mark a single match as read (isRead = true).
 *
 * Called when the user clicks on a match in the dashboard list. Clears the
 * unread badge for that specific match.
 *
 * Security: the update is scoped to both matchQueue.id AND applicant_id =
 * session.user.id — a user cannot mark another user's match as read.
 *
 * @param matchQueueId  The match queue row ID to mark as read
 * @returns             { success: true } or { success: false, error: "..." }
 */
export async function markMatchRead(
  matchQueueId: string,
): Promise<MatchActionState> {
  const session = await getAuthSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  const result = await db
    .update(matchQueue)
    .set({ isRead: true })
    .where(
      and(
        eq(matchQueue.id, matchQueueId),
        eq(matchQueue.applicantId, session.user.id),
      ),
    )
    .returning({ id: matchQueue.id });

  if (result.length === 0) {
    return { success: false, error: "Match not found or not owned by user" };
  }

  return { success: true };
}

/**
 * Mark all approved unread matches as read for the current user.
 *
 * Called by a "Mark all read" button on the dashboard. Clears the entire
 * unread badge.
 *
 * @returns  { success: true, count: N } or { success: false, error: "..." }
 */
export async function markAllMatchesRead(): Promise<
  MatchActionState & { count?: number }
> {
  const session = await getAuthSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  const result = await db
    .update(matchQueue)
    .set({ isRead: true })
    .where(
      and(
        eq(matchQueue.applicantId, session.user.id),
        eq(matchQueue.isRead, false),
        eq(matchQueue.status, "approved"),
      ),
    )
    .returning({ id: matchQueue.id });

  return { success: true, count: result.length };
}
