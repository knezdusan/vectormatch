// One-time hard delete: remove jobs older than the retention window.
//
// Run with: npx tsx scripts/hard-delete-ancient-jobs.ts
//
// Default retention: 90 days. Override with RETENTION_DAYS env var.
//
// IMPORTANT: this permanently deletes rows from the job table. match_queue
// rows cascade automatically. Review the dry-run output before confirming.

import { config } from "dotenv";

config();

import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { job } from "../src/db/schemas/jobs/job";

const DEFAULT_RETENTION_DAYS = 90;

function getRetentionDays(): number {
  const envValue = process.env.RETENTION_DAYS;
  if (!envValue) return DEFAULT_RETENTION_DAYS;
  const parsed = Number.parseInt(envValue, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? DEFAULT_RETENTION_DAYS : parsed;
}

async function main() {
  const retentionDays = getRetentionDays();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  const preview = await db
    .select({
      count: sql<number>`count(*)::int`,
      sources: sql<string>`string_agg(DISTINCT ${job.atsSource}, ', ' ORDER BY ${job.atsSource})`,
    })
    .from(job)
    .where(sql`${job.publishedAt} < ${cutoffDate}`);

  const affectedCount = Number(preview[0]?.count ?? 0);
  const affectedSources = preview[0]?.sources ?? "";

  console.log(
    `Retention window: ${retentionDays} days (cutoff ${cutoffDate.toISOString()})`,
  );
  console.log(`Jobs to delete: ${affectedCount}`);
  console.log(`Affected sources: ${affectedSources || "none"}`);

  if (affectedCount === 0) {
    console.log("Nothing to delete.");
    await pool.end();
    return;
  }

  if (process.env.DRY_RUN !== "false") {
    console.log("\nDry run mode. Set DRY_RUN=false to actually delete.");
    await pool.end();
    return;
  }

  const result = await db.execute(
    sql`DELETE FROM job WHERE published_at < ${cutoffDate}`,
  );

  const deletedCount =
    result && typeof result === "object" && "rowCount" in result
      ? Number((result as { rowCount?: number | null }).rowCount ?? 0)
      : 0;

  console.log(`Deleted ${deletedCount} jobs older than ${retentionDays} days.`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
