"use server";

// Inngest Control Server Actions — status, pause, resume, restart
// src/actions/inngest-control.ts
//
// Server Actions for the admin dashboard's Inngest control panel.
// These allow admins to:
//   - Check the Inngest server status (Coolify + HTTP health check)
//   - Pause (stop) the Inngest server
//   - Resume (start) the Inngest server
//   - Restart the Inngest server
//
// Security: every action calls requireRole("admin") — non-admins get
// redirected to /dashboard. The actions are scoped to the admin role only.

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import type { InngestStatusResult } from "@/lib/coolify/client";
import {
  getInngestStatus,
  restartInngest,
  startInngest,
  stopInngest,
} from "@/lib/coolify/client";
import { checkInngestHealth } from "@/lib/coolify/inngest-health";
import { createAlert, hasActiveAlert } from "@/lib/jobs/alerting";

// ── Types ────────────────────────────────────────────────────────────────────

export type InngestControlState = {
  success: boolean;
  error?: string;
  status?: InngestStatusResult;
  healthCheck?: {
    reachable: boolean;
    statusCode: number | null;
    responseTimeMs: number | null;
  };
};

// ── Actions ──────────────────────────────────────────────────────────────────

/**
 * Get the current Inngest server status — both Coolify container status
 * and HTTP health check. Used by the dashboard's status indicator.
 */
export async function getInngestStatusAction(): Promise<InngestControlState> {
  await requireRole("admin");

  try {
    const [status, healthCheck] = await Promise.all([
      getInngestStatus(),
      checkInngestHealth(),
    ]);

    return {
      success: true,
      status,
      healthCheck: {
        reachable: healthCheck.reachable,
        statusCode: healthCheck.statusCode,
        responseTimeMs: healthCheck.responseTimeMs,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Pause (stop) the Inngest server via Coolify.
 * Creates a critical alert so the pause is visible in the dashboard.
 */
export async function pauseInngestAction(): Promise<InngestControlState> {
  await requireRole("admin");

  try {
    const result = await stopInngest();
    if (!result.success) {
      return { success: false, error: result.message };
    }

    // Create a critical alert for the manual pause
    if (!(await hasActiveAlert("inngest_server_down"))) {
      await createAlert({
        type: "inngest_server_down",
        severity: "critical",
        message: "Inngest server paused manually from admin dashboard",
        details: JSON.stringify({
          triggeredBy: "admin",
          timestamp: new Date().toISOString(),
          ...result,
          action: "manual_pause",
        }),
      });
    }

    revalidatePath("/dashboard/admin");
    return {
      success: true,
      status: await getInngestStatus(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Resume (start) the Inngest server via Coolify.
 * Resolves any active inngest_server_down alerts.
 */
export async function resumeInngestAction(): Promise<InngestControlState> {
  await requireRole("admin");

  try {
    const result = await startInngest();
    if (!result.success) {
      return { success: false, error: result.message };
    }

    // Resolve the alert — the server is being started
    const { resolveAlertsByType } = await import("@/lib/jobs/alerting");
    await resolveAlertsByType("inngest_server_down", "admin");

    revalidatePath("/dashboard/admin");
    return {
      success: true,
      status: await getInngestStatus(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Restart the Inngest server via Coolify.
 * Useful for recovering from an unhealthy state without a full stop/start cycle.
 */
export async function restartInngestAction(): Promise<InngestControlState> {
  await requireRole("admin");

  try {
    const result = await restartInngest();
    if (!result.success) {
      return { success: false, error: result.message };
    }

    revalidatePath("/dashboard/admin");
    return {
      success: true,
      status: await getInngestStatus(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
