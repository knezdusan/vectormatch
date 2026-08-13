// Subscription admin actions
// src/actions/subscriptions.ts
//
// Server Actions for the subscriptions health monitor page.

"use server";

import { revalidateTag } from "next/cache";
import { getAuthSession } from "@/lib/auth";

/**
 * Bust the subscription health cache so the next read re-runs all checks.
 * Called by the "Re-check now" button on /dashboard/subscriptions.
 */
export async function recheckSubscriptions(): Promise<{
  success: boolean;
}> {
  const session = await getAuthSession();
  if (!session || session.user.role !== "admin") {
    return { success: false };
  }

  // Invalidate the cached health check — the next read will re-run all
  // checks (OpenAI embedding ping, Resend API ping, env-var checks).
  // Next.js 16 requires a profile argument: "max" uses stale-while-revalidate
  // semantics (serves stale data while fresh data loads in background).
  revalidateTag("subscription-health", "max");

  return { success: true };
}
