// Pre-Flight Storage Check (Sprint 4 Task 4)
// src/lib/jobs/storage-check.ts
//
// Before a batch source refresh cron runs, it checks whether Neon storage is
// near the 512MB free-tier limit. If storage exceeds the warning threshold
// (88% = ~450MB), the refresh is skipped to avoid pushing the database over
// the limit. The circuit breaker handles repeated issues; this is a safety
// valve for the storage dimension specifically.
//
// Uses the built-in `pg_database_size()` function — no extra tables or
// migrations needed.
//
// Server-only: touches the database. Called from Inngest batch source
// functions and the admin infrastructure dashboard.

import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/db/db";

// ── Constants ────────────────────────────────────────────────────────────────

/** Neon Free tier storage limit (MB). */
export const STORAGE_LIMIT_MB = 512;

/** Storage fraction at which batch refreshes are skipped (88% = ~450MB). */
export const STORAGE_WARNING_THRESHOLD = 0.88;

/** Storage fraction at which a critical alert is raised (94% = ~480MB). */
export const STORAGE_CRITICAL_THRESHOLD = 0.94;

// ── Types ────────────────────────────────────────────────────────────────────

export interface StorageStatus {
  /** Whether it is safe to run a batch refresh. */
  safe: boolean;
  /** Current database size in MB. */
  currentMb: number;
  /** Storage limit in MB (512 for Neon Free). */
  limitMb: number;
  /** Current usage as a fraction of the limit (0–1+). */
  percentage: number;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Get the current database size in megabytes.
 *
 * Uses `pg_database_size(current_database())` — a built-in PostgreSQL function
 * that returns the total on-disk size of the current database in bytes. Divided
 * by 1024² to convert to MB.
 *
 * @returns  Database size in MB (0 if the query fails or returns no rows)
 */
export async function getDatabaseSizeMb(): Promise<number> {
  const result = await db.execute(sql`
    SELECT pg_database_size(current_database()) / 1024 / 1024 AS size_mb
  `);
  const row = result.rows[0] as { size_mb?: number } | undefined;
  return Number(row?.size_mb ?? 0);
}

/**
 * Check whether the database storage is safe for a batch refresh.
 *
 * Returns `safe: false` when storage usage exceeds the warning threshold
 * (88% of the 512MB limit = ~450MB). The caller should skip the refresh and
 * log a warning — the circuit breaker will handle repeated issues.
 *
 * @returns  Storage status with current size, limit, percentage, and safety flag
 */
export async function isStorageSafeForRefresh(): Promise<StorageStatus> {
  const currentMb = await getDatabaseSizeMb();
  const percentage = currentMb / STORAGE_LIMIT_MB;
  return {
    safe: percentage < STORAGE_WARNING_THRESHOLD,
    currentMb,
    limitMb: STORAGE_LIMIT_MB,
    percentage,
  };
}
