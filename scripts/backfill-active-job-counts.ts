// Backfill company.activeJobCount from the current active job table.
//
// Run after bulk purges or stale-marker runs to keep company counts accurate.
//
//   npx tsx scripts/backfill-active-job-counts.ts

import { config } from "dotenv";

config();

import { Pool } from "@neondatabase/serverless";
import { backfillCompanyActiveJobCounts } from "../src/lib/jobs/poller/company-state";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // backfillCompanyActiveJobCounts uses the singleton db, so we just call it.
  const { updated } = await backfillCompanyActiveJobCounts();
  console.log(`Updated activeJobCount for ${updated} companies.`);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
