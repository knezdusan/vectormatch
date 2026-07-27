"use server";

// Scheduler Control Server Actions — status and manual triggers
// src/actions/scheduler-control.ts
//
// D27: Replaces src/actions/inngest-control.ts after Inngest removal.
// Provides the admin dashboard with pg-boss scheduler status info.

import { requireRole } from "@/lib/auth";
import { scheduler } from "@/scheduler/scheduler";
import type { SchedulerStatus } from "@/scheduler/scheduler";

// ── Types ────────────────────────────────────────────────────────────────────

export type SchedulerControlState = {
  success: boolean;
  error?: string;
  status?: SchedulerStatus;
};

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Get the current pg-boss scheduler status — running state, active
 * schedules, registered events, and queue counts. Used by the dashboard's
 * SchedulerStatusControl component.
 */
export async function getSchedulerStatusAction(): Promise<SchedulerControlState> {
  await requireRole("admin");

  try {
    const status = await scheduler.getStatus();
    return { success: true, status };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
