// Neon API Client — Synthetic Storage Check
// src/lib/jobs/neon-api.ts
//
// Neon enforces storage limits against `synthetic_storage_size`, which includes
// logical data + WAL + history retention + internal overhead. This is typically
// ~12% larger than `pg_database_size()`, which only counts on-disk pages.
//
// The storage monitor (hourly) uses this module for accurate storage tracking.
// The ingestion guard (hot path, every poll) continues to use `pg_database_size()`
// with a lowered `STORAGE_LIMIT_MB` safety margin — see storage-check.ts.
//
// Environment:
//   NEON_API_KEY    — Neon API key (https://console.neon.tech/app/settings/api-keys)
//   NEON_PROJECT_ID — Neon project ID (e.g., "cool-grass-94401149")
//
// Server-only: makes external HTTP calls.

import "server-only";

const NEON_API_BASE = "https://console.neon.tech/api/v2";

export interface NeonStorageInfo {
  /** Synthetic storage size in MB (what Neon enforces against the limit). */
  syntheticStorageMb: number;
  /** Branch logical size in MB (closer to pg_database_size but with overhead). */
  logicalSizeMb: number;
  /** Neon's hard storage limit in MB (512 for Free tier). */
  limitMb: number;
  /** Synthetic storage as a fraction of the limit (0–1+). */
  percentage: number;
  /** Source of the data — "neon-api" or "fallback" if the API call failed. */
  source: "neon-api" | "fallback";
}

/**
 * Fetch the synthetic storage size from the Neon API.
 *
 * The Neon API returns `synthetic_storage_size` in bytes. We convert to MB and
 * compute the percentage against the branch's `branch_logical_size_limit_bytes`.
 *
 * If the API call fails (missing key, network error, non-200 response), this
 * function returns null. The caller should fall back to `pg_database_size()`.
 */
export async function getNeonStorageInfo(): Promise<NeonStorageInfo | null> {
  const apiKey = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;

  if (!apiKey || !projectId) {
    return null;
  }

  try {
    const response = await fetch(`${NEON_API_BASE}/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      // Cache for 60 seconds — the storage monitor runs hourly, but other
      // callers (admin dashboard) may hit this more frequently.
      next: { revalidate: 60 },
    });

    if (!response.ok) {
      console.warn(
        `[neon-api] Neon API returned ${response.status}: ${await response.text()}`,
      );
      return null;
    }

    const data = (await response.json()) as {
      synthetic_storage_size?: number;
      branch_logical_size_limit_bytes?: number;
      branches?: Array<{ logical_size?: number }>;
    };

    const syntheticBytes = data.synthetic_storage_size;
    const limitBytes = data.branch_logical_size_limit_bytes;
    const logicalBytes = data.branches?.[0]?.logical_size;

    if (syntheticBytes === undefined || limitBytes === undefined) {
      console.warn("[neon-api] Neon API response missing required fields");
      return null;
    }

    return {
      syntheticStorageMb: syntheticBytes / 1024 / 1024,
      logicalSizeMb:
        logicalBytes !== undefined ? logicalBytes / 1024 / 1024 : 0,
      limitMb: limitBytes / 1024 / 1024,
      percentage: syntheticBytes / limitBytes,
      source: "neon-api",
    };
  } catch (error) {
    console.warn(
      "[neon-api] Failed to fetch Neon storage info:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}
