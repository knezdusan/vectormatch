// @ts-nocheck
// One-off script: relabel all match_queue rows with status='mismatch' to
// status='rejected'. Run after the Fix 1 + Fix 2 implementation, since those
// jobs are now caught by Gate 0.5 and would be hard-blocked on re-evaluation.
//
// Run: npx tsx scripts/relabel-mismatches-to-rejected.ts
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";

async function main() {
  // 1. Count rows before update
  const before = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM match_queue WHERE status = 'mismatch'
  `);
  const count = Number(before.rows[0].cnt);
  console.log(`Rows with status='mismatch' before update: ${count}`);

  if (count === 0) {
    console.log("Nothing to update — exiting.");
    process.exit(0);
  }

  // 2. Show the rows that will be updated (for audit trail)
  const rows = await db.execute(sql`
    SELECT id, job_id, applicant_id, status
    FROM match_queue
    WHERE status = 'mismatch'
    ORDER BY created_at DESC
  `);
  console.log(`\nRows to be updated (${rows.rows.length}):`);
  for (const r of rows.rows) {
    console.log(`  ${r.id} | job=${r.job_id} | applicant=${r.applicant_id}`);
  }

  // 3. Update all mismatch → rejected
  const result = await db.execute(sql`
    UPDATE match_queue
    SET status = 'rejected'
    WHERE status = 'mismatch'
    RETURNING id
  `);
  console.log(`\nUpdated ${result.rows.length} rows to status='rejected'`);

  // 4. Verify no mismatch rows remain
  const after = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM match_queue WHERE status = 'mismatch'
  `);
  const remaining = Number(after.rows[0].cnt);
  console.log(`Rows with status='mismatch' after update: ${remaining}`);

  if (remaining > 0) {
    console.error("ERROR: some mismatch rows remain!");
    process.exit(1);
  }

  // 5. Show updated status distribution for context
  const dist = await db.execute(sql`
    SELECT status, COUNT(*) AS cnt
    FROM match_queue
    GROUP BY status
    ORDER BY cnt DESC
  `);
  console.log("\nUpdated match_queue status distribution:");
  for (const row of dist.rows) {
    console.log(`  ${row.status}: ${row.cnt}`);
  }

  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
