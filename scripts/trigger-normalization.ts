#!/usr/bin/env npx tsx
// One-time script: Send job/ingested events for unnormalized jobs to trigger
// normalization via the pg-boss scheduler.
//
// This is equivalent to what the normalizationRetrySweep does, but run manually
// to avoid waiting for the next cron tick.

import { config } from "dotenv";

config();

import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { job } from "../src/db/schemas/jobs/job";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  // Get unnormalized jobs that have rawJson (needed for normalization)
  const jobs = await db
    .select({ id: job.id })
    .from(job)
    .where(
      sql`${job.normalizedAt} IS NULL
         AND ${job.status} = 'active'
         AND ${job.rawJson} IS NOT NULL`,
    )
    .orderBy(job.detectedAt)
    .limit(100);

  console.log(`Found ${jobs.length} unnormalized jobs with rawJson`);

  if (jobs.length === 0) {
    console.log("Nothing to do");
    await pool.end();
    return;
  }

  // Insert job/ingested events directly into the pg-boss queue
  // (bypasses the scheduler singleton since this is a standalone script)
  const queueName = "event.job.ingested";
  let sent = 0;
  for (let i = 0; i < jobs.length; i += 50) {
    const batch = jobs.slice(i, i + 50);
    const inserts = batch.map((j) => ({
      name: queueName,
      data: { jobId: j.id },
    }));
    try {
      // Use raw SQL to insert into pg-boss queue
      for (const insert of inserts) {
        await db.execute(sql`
          SELECT pgboss.create_job(
            ${insert.name},
            ${JSON.stringify(insert.data)}::jsonb
          )
        `);
      }
      sent += batch.length;
      console.log(
        `Sent batch ${Math.floor(i / 50) + 1}: ${batch.length} events (total: ${sent})`,
      );
    } catch (err) {
      console.error(`Failed to send batch at offset ${i}:`, err);
      break;
    }
  }

  console.log(`\nDone. Sent ${sent} job/ingested events.`);
  console.log("The scheduler will process these via the job/ingested handler.");
  console.log("Monitor at /dashboard/admin (pipeline tab)");

  await pool.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
