"use server";

// Admin Server Actions — source toggle + alert resolution
// src/actions/admin.ts
//
// Server Actions for the admin dashboard. These allow admins to:
//   - Enable/disable sources (circuit breaker manual override)
//   - Resolve alerts (mark as resolved)
//
// Security: every action calls requireRole("admin") — non-admins get
// redirected to /dashboard. The actions are scoped to the admin role only.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import {
  resolveAlert,
  resolveAlertsByType,
  resolveAllAlerts,
} from "@/lib/jobs/alerting";
import { disableSource, enableSource } from "@/lib/jobs/source-health";

// ── Types ────────────────────────────────────────────────────────────────────

export type AdminActionState = {
  success: boolean;
  error?: string;
};

// ── Schemas ──────────────────────────────────────────────────────────────────

const sourceNameSchema = z.string().min(1).max(100);
const alertIdSchema = z.string().uuid();
const alertTypeSchema = z.enum([
  "storage_near_limit",
  "storage_critical",
  "schema_validation_spike",
  "circuit_breaker_trip",
]);

// ── Actions ──────────────────────────────────────────────────────────────────

/** Disable a source (manual circuit breaker trip). */
export async function disableSourceAction(
  sourceName: string,
): Promise<AdminActionState> {
  await requireRole("admin");
  const parsed = sourceNameSchema.safeParse(sourceName);
  if (!parsed.success) {
    return { success: false, error: "Invalid source name" };
  }
  try {
    await disableSource(parsed.data, "Manual disable via admin dashboard");
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Enable a source (reset circuit breaker). */
export async function enableSourceAction(
  sourceName: string,
): Promise<AdminActionState> {
  await requireRole("admin");
  const parsed = sourceNameSchema.safeParse(sourceName);
  if (!parsed.success) {
    return { success: false, error: "Invalid source name" };
  }
  try {
    await enableSource(parsed.data);
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Resolve a single alert by ID. */
export async function resolveAlertAction(
  alertId: string,
): Promise<AdminActionState> {
  const session = await requireRole("admin");
  const parsed = alertIdSchema.safeParse(alertId);
  if (!parsed.success) {
    return { success: false, error: "Invalid alert ID" };
  }
  try {
    await resolveAlert(parsed.data, `admin:${session.user.email}`);
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Resolve all active alerts of a given type. */
export async function resolveAlertsByTypeAction(
  alertType: string,
): Promise<AdminActionState> {
  const session = await requireRole("admin");
  const parsed = alertTypeSchema.safeParse(alertType);
  if (!parsed.success) {
    return { success: false, error: "Invalid alert type" };
  }
  try {
    await resolveAlertsByType(parsed.data, `admin:${session.user.email}`);
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/** Resolve every active alert in one bulk action. */
export async function resolveAllAlertsAction(): Promise<AdminActionState> {
  const session = await requireRole("admin");
  try {
    await resolveAllAlerts(`admin:${session.user.email}`);
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
