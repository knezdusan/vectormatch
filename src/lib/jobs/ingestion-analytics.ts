// Ingestion Analytics Query Layer — Admin Dashboard Ingestion tab
// src/lib/jobs/ingestion-analytics.ts
//
// Read-side aggregations over the ingestion_log table for the admin
// "Ingestion" tab. All queries are read-only, time-windowed, and indexed by
// ingestion_log.created_at.

import "server-only";

import { and, count, desc, eq, gte, isNotNull, ne, sql } from "drizzle-orm";

import { db } from "@/db/db";
import { ingestionLog } from "@/db/schemas/jobs/ingestionLog";
import { job } from "@/db/schemas/jobs/job";
import { sourceHealth } from "@/db/schemas/jobs/sourceHealth";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface IngestionSummary {
  totalRuns: number;
  successfulRuns: number;
  partialRuns: number;
  failedRuns: number;
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsSkipped: number;
  successRate: number;
  yieldRate: number;
  rejectionRate: number;
  skipRate: number;
  avgDurationMs: number;
}

export interface SourcePerformanceRow {
  source: string;
  runs: number;
  successfulRuns: number;
  partialRuns: number;
  failedRuns: number;
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsSkipped: number;
  yieldRate: number;
  rejectionRate: number;
  skipRate: number;
  successRate: number;
  avgDurationMs: number;
  lastRunAt: Date | null;
  sourceHealthStatus: string | null;
}

export interface IngestionTrendPoint {
  date: string;
  source: string;
  itemsProcessed: number;
  itemsInserted: number;
  itemsRejected: number;
  itemsSkipped: number;
  runs: number;
}

export interface RecentRunRow {
  id: string;
  source: string;
  status: string;
  type: string;
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsSkipped: number;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface TopErrorRow {
  source: string | null;
  errorMessage: string;
  count: number;
  lastAt: Date;
}

export type StalenessBucket = "<1d" | "2-7d" | "8-30d" | "30-60d" | ">60d";

export interface StalenessDistributionRow {
  bucket: StalenessBucket;
  count: number;
  percentage: number;
}

export interface StalenessBySourceRow {
  source: string;
  total: number;
  buckets: Record<StalenessBucket, number>;
}

export interface JobStalenessDistribution {
  overall: StalenessDistributionRow[];
  bySource: StalenessBySourceRow[];
  total: number;
  refreshedAt: Date;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCutoff(daysBack: number): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function buildSummaryRow(row: {
  totalRuns: number;
  successfulRuns: number;
  partialRuns: number;
  failedRuns: number;
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsSkipped: number;
  avgDurationMs: number;
}): IngestionSummary {
  const totalRuns = row.totalRuns;
  const itemsProcessed = row.itemsProcessed;

  return {
    ...row,
    successRate: safeRate(row.successfulRuns, totalRuns),
    yieldRate: safeRate(row.itemsInserted, itemsProcessed),
    rejectionRate: safeRate(row.itemsRejected, itemsProcessed),
    skipRate: safeRate(row.itemsSkipped, itemsProcessed),
  };
}

function buildSourceRow(row: {
  source: string | null;
  runs: number;
  successfulRuns: number;
  partialRuns: number;
  failedRuns: number;
  itemsProcessed: number;
  itemsInserted: number;
  itemsUpdated: number;
  itemsRejected: number;
  itemsSkipped: number;
  avgDurationMs: number;
  lastRunAt: Date | null;
  sourceHealthStatus: string | null;
}): SourcePerformanceRow {
  const runs = row.runs;
  const itemsProcessed = row.itemsProcessed;

  return {
    source: row.source ?? "unknown",
    runs,
    successfulRuns: row.successfulRuns,
    partialRuns: row.partialRuns,
    failedRuns: row.failedRuns,
    itemsProcessed,
    itemsInserted: row.itemsInserted,
    itemsUpdated: row.itemsUpdated,
    itemsRejected: row.itemsRejected,
    itemsSkipped: row.itemsSkipped,
    yieldRate: safeRate(row.itemsInserted, itemsProcessed),
    rejectionRate: safeRate(row.itemsRejected, itemsProcessed),
    skipRate: safeRate(row.itemsSkipped, itemsProcessed),
    successRate: safeRate(row.successfulRuns, runs),
    avgDurationMs: row.avgDurationMs,
    lastRunAt: row.lastRunAt,
    sourceHealthStatus: row.sourceHealthStatus ?? "unknown",
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * High-level ingestion summary for the selected time window.
 */
export async function getIngestionSummary(
  daysBack = 7,
): Promise<IngestionSummary> {
  const cutoff = getCutoff(daysBack);

  const rows = await db
    .select({
      totalRuns: count(),
      successfulRuns: count(
        sql`CASE WHEN ${ingestionLog.status} = 'success' THEN 1 END`,
      ),
      partialRuns: count(
        sql`CASE WHEN ${ingestionLog.status} = 'partial' THEN 1 END`,
      ),
      failedRuns: count(
        sql`CASE WHEN ${ingestionLog.status} = 'failed' THEN 1 END`,
      ),
      itemsProcessed: sql<number>`COALESCE(SUM(${ingestionLog.itemsProcessed}), 0)`,
      itemsInserted: sql<number>`COALESCE(SUM(${ingestionLog.itemsInserted}), 0)`,
      itemsUpdated: sql<number>`COALESCE(SUM(${ingestionLog.itemsUpdated}), 0)`,
      itemsRejected: sql<number>`COALESCE(SUM(${ingestionLog.itemsRejected}), 0)`,
      itemsSkipped: sql<number>`COALESCE(SUM(${ingestionLog.itemsSkipped}), 0)`,
      avgDurationMs: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${ingestionLog.finishedAt} - ${ingestionLog.startedAt})) * 1000), 0)`,
    })
    .from(ingestionLog)
    .where(gte(ingestionLog.createdAt, cutoff));

  const row = rows[0];
  return buildSummaryRow({
    totalRuns: Number(row?.totalRuns ?? 0),
    successfulRuns: Number(row?.successfulRuns ?? 0),
    partialRuns: Number(row?.partialRuns ?? 0),
    failedRuns: Number(row?.failedRuns ?? 0),
    itemsProcessed: row?.itemsProcessed ?? 0,
    itemsInserted: row?.itemsInserted ?? 0,
    itemsUpdated: row?.itemsUpdated ?? 0,
    itemsRejected: row?.itemsRejected ?? 0,
    itemsSkipped: row?.itemsSkipped ?? 0,
    avgDurationMs: row?.avgDurationMs ?? 0,
  });
}

/**
 * Per-source performance table for the selected time window.
 * Joins with source_health so circuit-breaker status is visible inline.
 */
export async function getSourcePerformance(
  daysBack = 7,
): Promise<SourcePerformanceRow[]> {
  const cutoff = getCutoff(daysBack);

  const rows = await db
    .select({
      source: ingestionLog.source,
      runs: count(),
      successfulRuns: count(
        sql`CASE WHEN ${ingestionLog.status} = 'success' THEN 1 END`,
      ),
      partialRuns: count(
        sql`CASE WHEN ${ingestionLog.status} = 'partial' THEN 1 END`,
      ),
      failedRuns: count(
        sql`CASE WHEN ${ingestionLog.status} = 'failed' THEN 1 END`,
      ),
      itemsProcessed: sql<number>`COALESCE(SUM(${ingestionLog.itemsProcessed}), 0)`,
      itemsInserted: sql<number>`COALESCE(SUM(${ingestionLog.itemsInserted}), 0)`,
      itemsUpdated: sql<number>`COALESCE(SUM(${ingestionLog.itemsUpdated}), 0)`,
      itemsRejected: sql<number>`COALESCE(SUM(${ingestionLog.itemsRejected}), 0)`,
      itemsSkipped: sql<number>`COALESCE(SUM(${ingestionLog.itemsSkipped}), 0)`,
      avgDurationMs: sql<number>`COALESCE(AVG(EXTRACT(EPOCH FROM (${ingestionLog.finishedAt} - ${ingestionLog.startedAt})) * 1000), 0)`,
      lastRunAt: sql<Date | null>`MAX(${ingestionLog.createdAt})`,
      sourceHealthStatus: sourceHealth.status,
    })
    .from(ingestionLog)
    .leftJoin(sourceHealth, eq(sourceHealth.sourceName, ingestionLog.source))
    .where(
      and(gte(ingestionLog.createdAt, cutoff), isNotNull(ingestionLog.source)),
    )
    .groupBy(ingestionLog.source, sourceHealth.status)
    .orderBy(desc(sql`SUM(${ingestionLog.itemsProcessed})`));

  return rows.map((row) => buildSourceRow(row));
}

/**
 * Daily ingestion trend by source for stacked charts.
 */
export async function getIngestionTrends(
  daysBack = 7,
): Promise<IngestionTrendPoint[]> {
  const cutoff = getCutoff(daysBack);

  const rows = await db
    .select({
      date: sql<string>`DATE(${ingestionLog.createdAt})::text`,
      source: ingestionLog.source,
      itemsProcessed: sql<number>`COALESCE(SUM(${ingestionLog.itemsProcessed}), 0)`,
      itemsInserted: sql<number>`COALESCE(SUM(${ingestionLog.itemsInserted}), 0)`,
      itemsRejected: sql<number>`COALESCE(SUM(${ingestionLog.itemsRejected}), 0)`,
      itemsSkipped: sql<number>`COALESCE(SUM(${ingestionLog.itemsSkipped}), 0)`,
      runs: count(),
    })
    .from(ingestionLog)
    .where(
      and(gte(ingestionLog.createdAt, cutoff), isNotNull(ingestionLog.source)),
    )
    .groupBy(sql`DATE(${ingestionLog.createdAt})`, ingestionLog.source)
    .orderBy(sql`DATE(${ingestionLog.createdAt})`, ingestionLog.source);

  return rows.map((row) => ({
    date: row.date ?? "",
    source: row.source ?? "unknown",
    itemsProcessed: row.itemsProcessed ?? 0,
    itemsInserted: row.itemsInserted ?? 0,
    itemsRejected: row.itemsRejected ?? 0,
    itemsSkipped: row.itemsSkipped ?? 0,
    runs: Number(row.runs ?? 0),
  }));
}

/**
 * Recent ingestion runs for the run-history table.
 */
export async function getRecentIngestionRuns(
  daysBack = 7,
  limit = 50,
): Promise<RecentRunRow[]> {
  const cutoff = getCutoff(daysBack);

  const rows = await db
    .select({
      id: ingestionLog.id,
      source: ingestionLog.source,
      status: ingestionLog.status,
      type: ingestionLog.type,
      itemsProcessed: ingestionLog.itemsProcessed,
      itemsInserted: ingestionLog.itemsInserted,
      itemsUpdated: ingestionLog.itemsUpdated,
      itemsRejected: ingestionLog.itemsRejected,
      itemsSkipped: ingestionLog.itemsSkipped,
      durationMs: sql<
        number | null
      >`CASE WHEN ${ingestionLog.finishedAt} IS NOT NULL THEN EXTRACT(EPOCH FROM (${ingestionLog.finishedAt} - ${ingestionLog.startedAt})) * 1000 END`,
      errorMessage: ingestionLog.errorMessage,
      createdAt: ingestionLog.createdAt,
    })
    .from(ingestionLog)
    .where(
      and(gte(ingestionLog.createdAt, cutoff), isNotNull(ingestionLog.source)),
    )
    .orderBy(desc(ingestionLog.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    source: row.source ?? "unknown",
    durationMs: row.durationMs ?? null,
  }));
}

/**
 * Top non-success errors grouped by source + message.
 */
export async function getTopIngestionErrors(
  daysBack = 7,
  limit = 10,
): Promise<TopErrorRow[]> {
  const cutoff = getCutoff(daysBack);

  const rows = await db
    .select({
      source: ingestionLog.source,
      errorMessage: ingestionLog.errorMessage,
      count: count(),
      lastAt: sql<Date>`MAX(${ingestionLog.createdAt})`,
    })
    .from(ingestionLog)
    .where(
      and(
        gte(ingestionLog.createdAt, cutoff),
        isNotNull(ingestionLog.errorMessage),
        ne(ingestionLog.status, "success"),
      ),
    )
    .groupBy(ingestionLog.errorMessage, ingestionLog.source)
    .orderBy(desc(count()))
    .limit(limit);

  return rows.map((row) => ({
    source: row.source ?? "unknown",
    errorMessage: row.errorMessage ?? "",
    count: Number(row.count ?? 0),
    lastAt: row.lastAt ?? new Date(),
  }));
}

// ── Active Job Staleness Distribution ───────────────────────────────────────────

const BUCKET_ORDER: StalenessBucket[] = [
  "<1d",
  "2-7d",
  "8-30d",
  "30-60d",
  ">60d",
];

function parseBucket(days: number): StalenessBucket {
  if (days < 1) return "<1d";
  if (days <= 7) return "2-7d";
  if (days <= 30) return "8-30d";
  if (days <= 60) return "30-60d";
  return ">60d";
}

/**
 * Distribution of currently active jobs by age (based on publishedAt).
 * Returns an overall table and a per-source breakdown. Age buckets:
 *   <1d, 2-7d, 8-30d, 30-60d, >60d.
 */
export async function getJobStalenessDistribution(): Promise<JobStalenessDistribution> {
  const rows = await db
    .select({
      source: job.atsSource,
      ageDays: sql<number>`EXTRACT(DAY FROM (NOW() - ${job.publishedAt}))::int`,
    })
    .from(job)
    .where(sql`${job.status} = 'active' AND ${job.publishedAt} IS NOT NULL`);

  // Ensure every source that has ever been ingested appears in the table,
  // even if it currently has zero active jobs.
  const allSources = await db
    .selectDistinct({ source: job.atsSource })
    .from(job)
    .where(isNotNull(job.atsSource));

  const total = rows.length;
  const overallMap = new Map<StalenessBucket, number>();
  const sourceMap = new Map<string, Map<StalenessBucket, number>>();

  for (const { source } of allSources) {
    if (source) {
      sourceMap.set(source, new Map<StalenessBucket, number>());
    }
  }

  for (const row of rows) {
    const bucket = parseBucket(row.ageDays);
    overallMap.set(bucket, (overallMap.get(bucket) ?? 0) + 1);

    const source = row.source ?? "unknown";
    let sourceBuckets = sourceMap.get(source);
    if (!sourceBuckets) {
      sourceBuckets = new Map<StalenessBucket, number>();
      sourceMap.set(source, sourceBuckets);
    }
    sourceBuckets.set(bucket, (sourceBuckets.get(bucket) ?? 0) + 1);
  }

  const overall: StalenessDistributionRow[] = BUCKET_ORDER.map((bucket) => {
    const count = overallMap.get(bucket) ?? 0;
    return {
      bucket,
      count,
      percentage: total > 0 ? count / total : 0,
    };
  });

  const bySource: StalenessBySourceRow[] = Array.from(sourceMap.entries())
    .map(([source, buckets]) => {
      const sourceTotal = Array.from(buckets.values()).reduce(
        (sum, c) => sum + c,
        0,
      );
      return {
        source,
        total: sourceTotal,
        buckets: Object.fromEntries(
          BUCKET_ORDER.map((bucket) => [bucket, buckets.get(bucket) ?? 0]),
        ) as Record<StalenessBucket, number>,
      };
    })
    .sort((a, b) => b.total - a.total);

  return {
    overall,
    bySource,
    total,
    refreshedAt: new Date(),
  };
}
