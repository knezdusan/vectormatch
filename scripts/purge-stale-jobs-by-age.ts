// One-time backfill: mark active jobs older than MAX_JOB_AGE_DAYS as stale.
//
// Run with: npx tsx scripts/purge-stale-jobs-by-age.ts
//
// This script addresses the existing corpus of obsolete jobs that entered the
// database before the ingestion-time freshness gate was added. It does NOT delete
// rows; it transitions status from 'active' to 'stale', which excludes them
// from public listings and match pipelines. The daily stale cleanup will later
// move stale rows to 'gone', and the aggressive cleanup will reclaim them.
//
// IMPORTANT: review the threshold before running. Default = 90 days.

import { config } from "dotenv";

config();

import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { job } from "../src/db/schemas/jobs/job";

const DEFAULT_MAX_AGE_DAYS = 90;

function getMaxAgeDays(): number {
  const envValue = process.env.MAX_JOB_AGE_DAYS;
  if (!envValue) return DEFAULT_MAX_AGE_DAYS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_MAX_AGE_DAYS : parsed;
}

async function main() {
  const maxAgeDays = getMaxAgeDays();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

  console.log(
    `Marking active jobs with publishedAt < ${cutoffDate.toISOString()} (${maxAgeDays} days old) as stale...`,
  );

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const result = await db
    .update(job)
    .set({ status: "stale" })
    .where(
      sql`${job.status} = 'active'
          AND ${job.publishedAt} IS NOT NULL
          AND ${job.publishedAt} < ${cutoffDate}`,
    )
    .returning({ id: job.id, publishedAt: job.publishedAt, title: job.title });

  console.log(`Marked ${result.length} jobs as stale.`);

  if (result.length > 0) {
    const bySource = result.reduce(
      (acc, row) => {
        acc[row.id] = row;
        return acc;
      },
      {} as Record<string, (typeof result)[number]>,
    );
    console.log("Sample affected IDs:", Object.keys(bySource).slice(0, 10));
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
