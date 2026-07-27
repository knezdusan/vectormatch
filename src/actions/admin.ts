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

import { eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/db/db";
import { excludedCountries } from "@/db/schemas/jobs/excludedCountries";
import { requireRole } from "@/lib/auth";
import { resolveAlert, resolveAllAlerts } from "@/lib/jobs/alerting";
import { COUNTRY_NAMES } from "@/lib/jobs/location-utils";
import { disableSource, enableSource } from "@/lib/jobs/source-health";
import { scheduler } from "@/scheduler/scheduler";

// ── Types ────────────────────────────────────────────────────────────────────

export type AdminActionState = {
  success: boolean;
  error?: string;
};

// ── Schemas ──────────────────────────────────────────────────────────────────

const sourceNameSchema = z.string().min(1).max(100);
const alertIdSchema = z.string().uuid();

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

// ── Sprint 8: Match Pipeline Controls ────────────────────────────────────────

const personaIdSchema = z.string().uuid().nullable();

/**
 * Trigger a bulk reprocess of the matching pipeline. Re-evaluates all
 * active+embedded jobs against all personas (or a specific persona if
 * provided). This is the primary mechanism for retroactively matching
 * existing jobs after filter/prompt changes or persona updates.
 */
export async function triggerBulkReprocessAction(
  personaId: string | null,
): Promise<AdminActionState> {
  await requireRole("admin");
  const parsed = personaIdSchema.safeParse(personaId);
  if (!parsed.success) {
    return { success: false, error: "Invalid persona ID" };
  }
  try {
    await scheduler.send(
      "match/bulk-reprocess",
      {
        personaId: parsed.data,
        includeRejected: false,
      },
      `match-bulk-reprocess-admin-${Date.now()}`,
    );
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ── Normalization Retry Trigger ──────────────────────────────────────────────

/**
 * Manually trigger a normalization retry sweep. Sends `job/ingested` events
 * for up to 500 unnormalized jobs (same as the cron-based
 * normalizationRetrySweep, but triggered on demand from the admin dashboard).
 *
 * Useful after an Inngest restart or pipeline stall to immediately re-queue
 * stuck jobs without waiting for the next 2h cron tick.
 * Limit reduced from 2000 to 500 to avoid Inngest queue wedge (bug #3549).
 */
export async function triggerNormalizationRetryAction(): Promise<
  AdminActionState & { eventsSent?: number }
> {
  await requireRole("admin");
  try {
    const { db } = await import("@/db/db");
    const { job } = await import("@/db/schemas/jobs/job");
    const { sql } = await import("drizzle-orm");

    // Select up to 500 unnormalized jobs with rawJson (needed for normalization)
    // Limit reduced from 2000 to 500 to avoid Inngest queue wedge (bug #3549)
    const jobs = await db
      .select({ id: job.id })
      .from(job)
      .where(
        sql`${job.normalizedAt} IS NULL
           AND ${job.status} = 'active'
           AND ${job.rawJson} IS NOT NULL`,
      )
      .orderBy(job.detectedAt)
      .limit(500);

    if (jobs.length === 0) {
      revalidatePath("/dashboard/admin");
      return { success: true, eventsSent: 0 };
    }

    // D27: Send job/ingested events via pg-boss (not Inngest).
    // The handler lives on pg-boss now (scheduler.registerEvent "job/ingested").
    let sent = 0;
    for (let i = 0; i < jobs.length; i += 50) {
      const batch = jobs.slice(i, i + 50);
      const events = batch.map((j) => ({
        name: "job/ingested" as const,
        data: { jobId: j.id },
      }));
      await scheduler.sendBatch(events);
      sent += batch.length;
    }

    revalidatePath("/dashboard/admin");
    return { success: true, eventsSent: sent };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed",
    };
  }
}

// ── Sprint 8: Emergency Storage Purge ────────────────────────────────────────

/**
 * Manually trigger the emergency storage purge from the admin dashboard.
 * Sends a `purge/emergency-storage` event to Inngest, which runs the tiered
 * purge (normalization_failed → rejected → gone → stale → active FIFO) until
 * storage drops below 75%.
 *
 * This bypasses the auto-trigger check — the purge runs unconditionally.
 */
export async function triggerEmergencyPurgeAction(): Promise<AdminActionState> {
  await requireRole("admin");
  try {
    await scheduler.send(
      "purge/emergency-storage",
      { triggeredBy: "admin-dashboard" },
      `purge-emergency-storage-admin-${Date.now()}`,
    );
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

// ── Excluded Countries Management ───────────────────────────────────────────

const countryCodeSchema = z
  .string()
  .length(2)
  .regex(/^[A-Za-z]{2}$/, "Must be a 2-letter ISO country code");

/**
 * Add a country to the exclusion list. Jobs located in or mentioning this
 * country will be hard-blocked at ingestion (direct boards) and Gate 0.5 (ATS).
 */
export async function addExcludedCountryAction(
  countryCode: string,
): Promise<AdminActionState> {
  await requireRole("admin");
  const parsed = countryCodeSchema.safeParse(countryCode);
  if (!parsed.success) {
    return { success: false, error: "Invalid country code" };
  }
  const code = parsed.data.toUpperCase();
  const names = COUNTRY_NAMES[code];
  const countryName = names?.[0] ?? code;
  try {
    await db
      .insert(excludedCountries)
      .values({ countryCode: code, countryName })
      .onConflictDoNothing();
    updateTag("excluded-countries");
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}

/**
 * Remove a country from the exclusion list.
 */
export async function removeExcludedCountryAction(
  countryCode: string,
): Promise<AdminActionState> {
  await requireRole("admin");
  const parsed = countryCodeSchema.safeParse(countryCode);
  if (!parsed.success) {
    return { success: false, error: "Invalid country code" };
  }
  try {
    await db
      .delete(excludedCountries)
      .where(eq(excludedCountries.countryCode, parsed.data.toUpperCase()));
    updateTag("excluded-countries");
    revalidatePath("/dashboard/admin");
    return { success: true };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed" };
  }
}
