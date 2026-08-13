// Subscription Health Monitoring
// src/lib/subscriptions/health.ts
//
// Checks the health of all paid/external SaaS services that VectorMatch
// depends on. Designed to be lightweight and cached — the sidebar calls
// the summary on every dashboard navigation, so the full check (which
// includes API pings to OpenAI and Resend) is cached for 5 minutes via
// Next.js 16 Cache Components ("use cache" + cacheLife("minutes")).
//
// The subscriptions page (/dashboard/subscriptions) reads the same cached
// result for instant rendering, and provides a "Re-check now" button that
// busts the cache via revalidateTag("subscription-health").
//
// Services monitored (D30):
//   1. OpenAI    — CRITICAL: embeddings, Gate 3 LLM, CV extraction, normalization
//   2. Resend    — CRITICAL: email verification, password reset, admin alerts
//   3. Brave     — MEDIUM:  company discovery seeders (corpus expansion)
//   4. Google OAuth — MEDIUM: Google sign-in (email/password still works)
//   5. GitHub OAuth — MEDIUM: GitHub sign-in (email/password still works)
//
// The OpenAI credit exhaustion outage (Aug 10-13 2026) motivated this module.
// The key was present but credits were exhausted — env-var-only checks would
// have missed it. The OpenAI check makes a minimal embedding API call to
// detect credit/billing issues, not just key presence.

import "server-only";

import { openai } from "@ai-sdk/openai";
import { embedMany } from "ai";
import { cacheLife, cacheTag } from "next/cache";

// ── Types ───────────────────────────────────────────────────────────────────

export type SubscriptionStatus = "healthy" | "critical";

export interface SubscriptionHealthResult {
  service: string;
  /** Short label for the UI */
  label: string;
  /** CRITICAL = app-halting, MEDIUM = feature degradation */
  impact: "critical" | "medium";
  status: SubscriptionStatus;
  /** Env var / API key is present in the runtime environment */
  keyPresent: boolean;
  /** Key prefix (first 7 chars) for identification — never the full key */
  keyPrefix: string;
  /** Human-readable status message */
  message: string;
  /** Whether a live API ping was performed (vs env-var-only check) */
  pinged: boolean;
  /** ISO timestamp of when this check ran */
  checkedAt: string;
}

// ── Individual service checks ───────────────────────────────────────────────

/**
 * Check OpenAI: key presence + minimal embedding API call.
 * This is the only check that makes a live API call — it's the service most
 * likely to fail on billing/credits (as seen in the Aug 2026 outage) rather
 * than just a missing key. The embedding call costs ~$0.00002 per check.
 */
async function checkOpenAI(): Promise<SubscriptionHealthResult> {
  const key = process.env.OPENAI_API_KEY ?? "";
  const keyPresent = key.length > 0;
  const keyPrefix = key.slice(0, 7);

  if (!keyPresent) {
    return {
      service: "openai",
      label: "OpenAI API",
      impact: "critical",
      status: "critical",
      keyPresent: false,
      keyPrefix: "",
      message:
        "OPENAI_API_KEY is not set. The entire matching pipeline is halted.",
      pinged: false,
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const { embeddings } = await embedMany({
      model: openai.embedding("text-embedding-3-small"),
      values: ["health check"],
    });
    const success = embeddings.length === 1 && embeddings[0].length > 0;
    return {
      service: "openai",
      label: "OpenAI API",
      impact: "critical",
      status: success ? "healthy" : "critical",
      keyPresent: true,
      keyPrefix,
      message: success
        ? "API key valid and credits available."
        : "Embedding call returned empty result — possible API issue.",
      pinged: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Detect common billing/credit errors
    const isBillingIssue =
      msg.toLowerCase().includes("no credits") ||
      msg.toLowerCase().includes("billing") ||
      msg.toLowerCase().includes("quota") ||
      msg.toLowerCase().includes("insufficient");
    return {
      service: "openai",
      label: "OpenAI API",
      impact: "critical",
      status: "critical",
      keyPresent: true,
      keyPrefix,
      message: isBillingIssue
        ? `Billing/credits issue: ${msg}`
        : `API call failed: ${msg}`,
      pinged: true,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check Resend: key presence + lightweight GET to the Resend API
 * (GET /domains — returns domain list, minimal cost, no email sent).
 */
async function checkResend(): Promise<SubscriptionHealthResult> {
  const key = process.env.RESEND_API_KEY ?? "";
  const keyPresent = key.length > 0;
  const keyPrefix = key.slice(0, 7);

  if (!keyPresent) {
    return {
      service: "resend",
      label: "Resend Email",
      impact: "critical",
      status: "critical",
      keyPresent: false,
      keyPrefix: "",
      message:
        "RESEND_API_KEY is not set. Email verification, password reset, and admin alerts are halted.",
      pinged: false,
      checkedAt: new Date().toISOString(),
    };
  }

  try {
    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10000),
    });
    const success = response.ok;
    let message: string;
    if (success) {
      message = "API key valid and accessible.";
    } else if (response.status === 401) {
      message = "API key is invalid or revoked.";
    } else if (response.status === 429) {
      message = "Rate limited — API key valid but quota may be exhausted.";
    } else {
      message = `API returned HTTP ${response.status}.`;
    }
    return {
      service: "resend",
      label: "Resend Email",
      impact: "critical",
      status: success ? "healthy" : "critical",
      keyPresent: true,
      keyPrefix,
      message,
      pinged: true,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      service: "resend",
      label: "Resend Email",
      impact: "critical",
      status: "critical",
      keyPresent: true,
      keyPrefix,
      message: `API unreachable: ${msg}`,
      pinged: true,
      checkedAt: new Date().toISOString(),
    };
  }
}

/**
 * Check Brave Search: key presence only (no API call — this is a MEDIUM
 * impact service and the free tier is generous enough that credit
 * exhaustion is unlikely).
 */
function checkBraveSearch(): SubscriptionHealthResult {
  const key = process.env.BRAVE_SEARCH_API_KEY ?? "";
  const keyPresent = key.length > 0;
  return {
    service: "brave-search",
    label: "Brave Search API",
    impact: "medium",
    status: keyPresent ? "healthy" : "critical",
    keyPresent,
    keyPrefix: keyPresent ? key.slice(0, 7) : "",
    message: keyPresent
      ? "API key present."
      : "BRAVE_SEARCH_API_KEY is not set. Company discovery seeders will fail.",
    pinged: false,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Check Google OAuth: client ID + secret presence.
 */
function checkGoogleOAuth(): SubscriptionHealthResult {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const keyPresent = clientId.length > 0 && clientSecret.length > 0;
  return {
    service: "google-oauth",
    label: "Google OAuth",
    impact: "medium",
    status: keyPresent ? "healthy" : "critical",
    keyPresent,
    keyPrefix: keyPresent ? clientId.slice(0, 10) : "",
    message: keyPresent
      ? "Client ID and secret present."
      : "Google OAuth credentials are not set. Google sign-in will fail (email/password still works).",
    pinged: false,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Check GitHub OAuth: client ID + secret presence.
 */
function checkGitHubOAuth(): SubscriptionHealthResult {
  const clientId = process.env.GITHUB_CLIENT_ID ?? "";
  const clientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
  const keyPresent = clientId.length > 0 && clientSecret.length > 0;
  return {
    service: "github-oauth",
    label: "GitHub OAuth",
    impact: "medium",
    status: keyPresent ? "healthy" : "critical",
    keyPresent,
    keyPrefix: keyPresent ? clientId.slice(0, 7) : "",
    message: keyPresent
      ? "Client ID and secret present."
      : "GitHub OAuth credentials are not set. GitHub sign-in will fail (email/password still works).",
    pinged: false,
    checkedAt: new Date().toISOString(),
  };
}

// ── Cached aggregate check ──────────────────────────────────────────────────

/**
 * Run all subscription health checks and return the results.
 *
 * Cached for 5 minutes via Cache Components. The sidebar calls
 * getSubscriptionHealthSummary() which reads this cache — on cache hit,
 * zero API calls are made. On cache miss (every 5 min), OpenAI and Resend
 * API pings are made (~$0.00002 total cost).
 *
 * Cache invalidation: revalidateTag("subscription-health") busts the cache
 * for the "Re-check now" button on the subscriptions page.
 */
export async function getSubscriptionHealth(): Promise<
  SubscriptionHealthResult[]
> {
  "use cache";
  cacheLife("minutes");
  cacheTag("subscription-health");

  const [openaiResult, resendResult] = await Promise.all([
    checkOpenAI(),
    checkResend(),
  ]);

  return [
    openaiResult,
    resendResult,
    checkBraveSearch(),
    checkGoogleOAuth(),
    checkGitHubOAuth(),
  ];
}

/**
 * Lightweight summary for the sidebar indicator.
 * Returns true if ANY critical-impact service is unhealthy.
 * Reads from the same cache as getSubscriptionHealth() — zero additional
 * API calls.
 */
export async function hasUnhealthySubscription(): Promise<boolean> {
  const results = await getSubscriptionHealth();
  return results.some(
    (r) => r.impact === "critical" && r.status === "critical",
  );
}
