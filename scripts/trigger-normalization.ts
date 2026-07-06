#!/usr/bin/env npx tsx
// One-time script: Send job/ingested events for unnormalized jobs to trigger
// normalization via the jobIngestedHandler Inngest function.
//
// This is equivalent to what the normalizationRetrySweep does, but run manually
// to avoid waiting for the next 4h cron tick.

import { config } from "dotenv";
config();

import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { job } from "../src/db/schemas/jobs/job.ts";
import { Inngest } from "inngest";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

// Inngest client — uses the production event key from env
const inngest = new Inngest({ id: "vectormatch" });

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
    .limit(100); // Send in batches of 100 to avoid overwhelming the queue

  console.log(`Found ${jobs.length} unnormalized jobs with rawJson`);

  if (jobs.length === 0) {
    console.log("Nothing to do");
    await pool.end();
    return;
  }

  // Send job/ingested events in batches of 50 (Inngest send limit)
  let sent = 0;
  for (let i = 0; i < jobs.length; i += 50) {
    const batch = jobs.slice(i, i + 50);
    const events = batch.map((j) => ({
      name: "job/ingested",
      data: { jobId: j.id },
    }));
    try {
      const result = await inngest.send(events);
      sent += batch.length;
      console.log(`Sent batch ${Math.floor(i / 50) + 1}: ${batch.length} events (total: ${sent})`);
    } catch (err) {
      console.error(`Failed to send batch at offset ${i}:`, err);
      break;
    }
  }

  console.log(`\nDone. Sent ${sent} job/ingested events.`);
  console.log("The jobIngestedHandler will process these (concurrency: 10).");
  console.log("Monitor at https://inngest.vectormatch.dev/runs");

  await pool.end();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
