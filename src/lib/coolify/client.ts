// Coolify API Client — Control Docker services via Coolify REST API
// src/lib/coolify/client.ts
//
// Provides functions to check service status, start, stop, and restart
// Docker services managed by Coolify. Used by the Inngest health monitor
// and the admin dashboard's Inngest control panel.
//
// Environment:
//   COOLIFY_API_TOKEN  — Coolify API token (Settings → API Tokens)
//   COOLIFY_BASE_URL   — Coolify dashboard URL (e.g., https://coolify.example.com)
//
// Server-only: makes HTTP requests to the Coolify API.

import "server-only";

// ── Configuration ────────────────────────────────────────────────────────────

function getCoolifyToken(): string | undefined {
  return process.env.COOLIFY_API_TOKEN;
}

function getCoolifyBaseUrl(): string | undefined {
  return process.env.COOLIFY_BASE_URL;
}

// The Inngest service UUID on Coolify. Hardcoded because there's only one
// Inngest service in this deployment. If the service is recreated, update
// this UUID (find it via the Coolify dashboard URL or the Coolify API).
function getInngestServiceUuid(): string {
  return process.env.COOLIFY_INNGEST_SERVICE_UUID ?? "otrzmmwzdh8z6hcg5at9yi03";
}

// ── Types ────────────────────────────────────────────────────────────────────

export type ServiceStatus =
  | "running:healthy"
  | "running:unhealthy"
  | "exited"
  | "paused"
  | "restarting"
  | "starting"
  | string; // Coolify may return other statuses

export interface CoolifyServiceInfo {
  uuid: string;
  name: string;
  status: ServiceStatus;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InngestStatusResult {
  /** The raw Coolify service status string. */
  coolifyStatus: ServiceStatus;
  /** Whether the Inngest server is running and healthy. */
  isRunning: boolean;
  /** Whether the Inngest server is paused (stopped/exited). */
  isPaused: boolean;
  /** Human-readable status label for the dashboard. */
  label: "Running" | "Paused" | "Unhealthy" | "Restarting" | "Unknown";
  /** Timestamp of the status check. */
  checkedAt: string;
  /** Error message if the Coolify API call failed. */
  error?: string;
}

export interface InngestControlResult {
  success: boolean;
  action: "start" | "stop" | "restart";
  message: string;
  newStatus?: ServiceStatus;
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

function isConfigured(): boolean {
  return Boolean(getCoolifyToken() && getCoolifyBaseUrl());
}

async function coolifyFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (!isConfigured()) {
    throw new Error(
      "Coolify API not configured — set COOLIFY_API_TOKEN and COOLIFY_BASE_URL",
    );
  }

  const url = `${getCoolifyBaseUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${getCoolifyToken()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Coolify API ${response.status}: ${body || response.statusText}`,
    );
  }

  // Some endpoints return 200 with empty body (e.g., control actions)
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function parseStatus(status: string): {
  isRunning: boolean;
  isPaused: boolean;
  label: InngestStatusResult["label"];
} {
  if (status.startsWith("running:healthy")) {
    return { isRunning: true, isPaused: false, label: "Running" };
  }
  if (status.startsWith("running:unhealthy")) {
    return { isRunning: false, isPaused: false, label: "Unhealthy" };
  }
  if (status === "exited" || status === "paused") {
    return { isRunning: false, isPaused: true, label: "Paused" };
  }
  if (status === "restarting" || status === "starting") {
    return { isRunning: false, isPaused: false, label: "Restarting" };
  }
  return { isRunning: false, isPaused: false, label: "Unknown" };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the current status of the Inngest service from Coolify.
 * Returns a structured result with running/paused flags and a label.
 */
export async function getInngestStatus(): Promise<InngestStatusResult> {
  if (!isConfigured()) {
    return {
      coolifyStatus: "unknown",
      isRunning: false,
      isPaused: false,
      label: "Unknown",
      checkedAt: new Date().toISOString(),
      error:
        "Coolify API not configured — set COOLIFY_API_TOKEN and COOLIFY_BASE_URL",
    };
  }

  try {
    // The Coolify API returns the service object directly, not wrapped in a
    // `data` property. The SDK/MCP wrappers add that wrapping, but the raw
    // REST endpoint returns: { uuid, name, status, ... }.
    const service = await coolifyFetch<CoolifyServiceInfo>(
      `/api/v1/services/${getInngestServiceUuid()}`,
    );

    if (!service || typeof service.status !== "string") {
      return {
        coolifyStatus: "unknown",
        isRunning: false,
        isPaused: false,
        label: "Unknown",
        checkedAt: new Date().toISOString(),
        error: "Service not found in Coolify or missing status field",
      };
    }

    const parsed = parseStatus(service.status);
    return {
      coolifyStatus: service.status,
      isRunning: parsed.isRunning,
      isPaused: parsed.isPaused,
      label: parsed.label,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      coolifyStatus: "unknown",
      isRunning: false,
      isPaused: false,
      label: "Unknown",
      checkedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Start the Inngest service via Coolify.
 */
export async function startInngest(): Promise<InngestControlResult> {
  try {
    await coolifyFetch(`/api/v1/services/${getInngestServiceUuid()}/start`, {
      method: "POST",
    });
    return {
      success: true,
      action: "start",
      message: "Inngest service start command sent to Coolify",
    };
  } catch (error) {
    return {
      success: false,
      action: "start",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Stop (pause) the Inngest service via Coolify.
 */
export async function stopInngest(): Promise<InngestControlResult> {
  try {
    await coolifyFetch(`/api/v1/services/${getInngestServiceUuid()}/stop`, {
      method: "POST",
    });
    return {
      success: true,
      action: "stop",
      message: "Inngest service stop command sent to Coolify",
    };
  } catch (error) {
    return {
      success: false,
      action: "stop",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Restart the Inngest service via Coolify.
 */
export async function restartInngest(): Promise<InngestControlResult> {
  try {
    await coolifyFetch(`/api/v1/services/${getInngestServiceUuid()}/restart`, {
      method: "POST",
    });
    return {
      success: true,
      action: "restart",
      message: "Inngest service restart command sent to Coolify",
    };
  } catch (error) {
    return {
      success: false,
      action: "restart",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if the Coolify API is configured.
 */
export function isCoolifyConfigured(): boolean {
  return isConfigured();
}
