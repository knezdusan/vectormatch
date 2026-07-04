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
import { revalidatePath } from "next/cache";

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

// User-facing match statuses that can be set from the dashboard job card.
const USER_ACTIONABLE_STATUSES = ["mark_read", "mismatch", "applied"] as const;
type UserActionableStatus = (typeof USER_ACTIONABLE_STATUSES)[number];

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Update a match to a user-facing status.
 *
 * Allowed statuses are "mark_read", "mismatch", and "applied". Setting a match
 * to one of these statuses removes it from the default "approved" listing and
 * makes it available through the corresponding status filter.
 *
 * "mark_read" also sets isRead = true so the unread badge stays consistent.
 *
 * Security: the update is scoped to both matchQueue.id AND applicant_id =
 * session.user.id — a user cannot modify another user's match.
 *
 * @param matchQueueId  The match queue row ID to update
 * @param status        One of the user-actionable statuses
 * @returns             { success: true } or { success: false, error: "..." }
 */
export async function updateMatchStatus(
  matchQueueId: string,
  status: UserActionableStatus,
): Promise<MatchActionState> {
  const session = await getAuthSession();
  if (!session) {
    return { success: false, error: "Not authenticated" };
  }

  if (!USER_ACTIONABLE_STATUSES.includes(status)) {
    return { success: false, error: "Invalid status" };
  }

  const result = await db
    .update(matchQueue)
    .set(status === "mark_read" ? { status, isRead: true } : { status })
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

  // Re-render the dashboard so the sidebar badge and the jobs page header
  // reflect the updated match status immediately.
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");

  return { success: true };
}

/**
 * Mark a single match as read.
 *
 * Convenience wrapper around updateMatchStatus that stores the read state as
 * the "mark_read" status and clears the unread badge.
 *
 * @param matchQueueId  The match queue row ID to mark as read
 * @returns             { success: true } or { success: false, error: "..." }
 */
export async function markMatchRead(
  matchQueueId: string,
): Promise<MatchActionState> {
  return updateMatchStatus(matchQueueId, "mark_read");
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

  // Re-render the dashboard so the sidebar badge and the jobs page header
  // reflect the updated unread count immediately.
  revalidatePath("/dashboard/jobs");
  revalidatePath("/dashboard");

  return { success: true, count: result.length };
}
