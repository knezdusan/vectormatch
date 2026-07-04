// Pre-Flight Storage Check (Sprint 4 Task 4) + Sprint 8 Ingestion Guard
// src/lib/jobs/storage-check.ts
//
// Before a batch source refresh cron runs, it checks whether Neon storage is
// near the 512MB free-tier limit. If storage exceeds the warning threshold
// (88% = ~450MB), the refresh is skipped to avoid pushing the database over
// the limit. The circuit breaker handles repeated issues; this is a safety
// valve for the storage dimension specifically.
//
// Sprint 8 addition: an ingestion guard that also pauses new job upserts when
// the unnormalized backlog grows too large (raw_json accumulating faster than
// the normalizer can clear it). This prevents a sudden burst of job discovery
// from filling the Neon Free tier before normalization reclaims the bulk of
// the storage.
//
// Uses the built-in `pg_database_size()` function — no extra tables or
// migrations needed.
//
// Server-only: touches the database. Called from Inngest batch source
// functions, the admin infrastructure dashboard, and job upserts.

import "server-only";

import { count, sql } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";

// ── Constants ────────────────────────────────────────────────────────────────

/**
 * Effective storage limit for `pg_database_size()` based checks.
 *
 * Neon enforces storage against `synthetic_storage_size`, which is ~12% larger
 * than `pg_database_size()` because it includes WAL, history retention, and
 * internal overhead. Using 512 MB with `pg_database_size()` would let the
 * synthetic storage exceed the real limit before the guard fires.
 *
 * 460 MB × 1.12 (overhead ratio) ≈ 515 MB synthetic — so 460 MB is the safe
 * ceiling for `pg_database_size()` to keep synthetic storage under 512 MB.
 *
 * The storage monitor (hourly) uses the Neon API directly with the true 512 MB
 * limit — see NEON_STORAGE_LIMIT_MB below and src/lib/jobs/neon-api.ts.
 */
export const STORAGE_LIMIT_MB = 460;

/**
 * Neon's actual hard storage limit (MB). Used by the storage monitor which
 * fetches `synthetic_storage_size` from the Neon API.
 */
export const NEON_STORAGE_LIMIT_MB = 512;

/** Storage fraction at which batch refreshes are skipped (88%). */
export const STORAGE_WARNING_THRESHOLD = 0.88;

/** Storage fraction at which a critical alert is raised (94%). */
export const STORAGE_CRITICAL_THRESHOLD = 0.94;

/** Storage fraction at which new job ingestion is halted (88% = ~450MB). */
export const STORAGE_INGESTION_HALT_THRESHOLD = 0.88;

/** Storage fraction at which an early-warning alert is sent (80% = ~410MB). */
export const STORAGE_EARLY_WARNING_THRESHOLD = 0.8;

/** Maximum unnormalized jobs allowed before ingestion pauses. */
export const MAX_UNNORMALIZED_BACKLOG = 3000;

/** Backlog level at which a warning alert is sent before the hard limit. */
export const UNNORMALIZED_BACKLOG_ALERT_THRESHOLD = 2500;

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

export interface StorageIngestionStatus {
  /** Whether new job ingestion is currently allowed. */
  allow: boolean;
  /** Human-readable reason when allow is false. */
  reason?: string;
  /** Current database size in MB. */
  currentMb: number;
  /** Storage limit in MB (512 for Neon Free). */
  limitMb: number;
  /** Current usage as a fraction of the limit (0–1+). */
  percentage: number;
  /** Number of jobs waiting for normalization (raw_json not null). */
  unnormalizedCount: number;
  /** Backlog limit that triggers ingestion halt. */
  maxUnnormalized: number;
  /** True when FORCE_INGESTION=1 overrides the guard. */
  forced: boolean;
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
 * Count jobs that are waiting for normalization. These jobs still carry
 * raw_json (~25KB each) and are the leading indicator of storage growth.
 *
 * Includes active jobs that were never normalized and normalization_failed
 * jobs that are retryable. Rejected/stale/gone jobs are excluded because they
 * are either terminal or handled by the aggressive cleanup function.
 */
export async function getIngestionBacklog(): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(job)
    .where(
      sql`${job.status} IN ('active', 'normalization_failed')
          AND ${job.normalizedAt} IS NULL
          AND ${job.rawJson} IS NOT NULL`,
    );
  return result[0]?.count ?? 0;
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

/**
 * Check whether new job ingestion should be allowed.
 *
 * Ingestion is blocked when either:
 *   - storage exceeds the ingestion halt threshold (88% = ~450MB), OR
 *   - the unnormalized backlog exceeds the configured limit (default 3000).
 *
 * Set `FORCE_INGESTION=1` to override both checks in an emergency.
 *
 * @returns  Ingestion status with current storage, backlog, and allow flag
 */
export async function isStorageSafeForIngestion(): Promise<StorageIngestionStatus> {
  const currentMb = await getDatabaseSizeMb();
  const percentage = currentMb / STORAGE_LIMIT_MB;
  const unnormalizedCount = await getIngestionBacklog();
  const forced = process.env.FORCE_INGESTION === "1";

  if (forced) {
    return {
      allow: true,
      reason: "FORCE_INGESTION=1 override is active",
      currentMb,
      limitMb: STORAGE_LIMIT_MB,
      percentage,
      unnormalizedCount,
      maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
      forced: true,
    };
  }

  if (percentage >= STORAGE_INGESTION_HALT_THRESHOLD) {
    return {
      allow: false,
      reason: `storage at ${(percentage * 100).toFixed(1)}% (${currentMb}MB / ${STORAGE_LIMIT_MB}MB) — ingestion halted at ${(STORAGE_INGESTION_HALT_THRESHOLD * 100).toFixed(0)}%`,
      currentMb,
      limitMb: STORAGE_LIMIT_MB,
      percentage,
      unnormalizedCount,
      maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
      forced: false,
    };
  }

  if (unnormalizedCount >= MAX_UNNORMALIZED_BACKLOG) {
    return {
      allow: false,
      reason: `normalization backlog at ${unnormalizedCount} jobs — ingestion halted at ${MAX_UNNORMALIZED_BACKLOG}`,
      currentMb,
      limitMb: STORAGE_LIMIT_MB,
      percentage,
      unnormalizedCount,
      maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
      forced: false,
    };
  }

  return {
    allow: true,
    currentMb,
    limitMb: STORAGE_LIMIT_MB,
    percentage,
    unnormalizedCount,
    maxUnnormalized: MAX_UNNORMALIZED_BACKLOG,
    forced: false,
  };
}
