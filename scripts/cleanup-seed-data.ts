// Cleanup Script — Remove synthetic seed data from the database
// scripts/cleanup-seed-data.ts
//
// Deletes all synthetic data created by the seed-routing-engine script:
//   - match_queue rows belonging to seed-user-* applicants
//   - personas belonging to seed-user-* applicants
//   - jobs with ats_slug LIKE 'seed-%'
//   - applicant rows with user_id LIKE 'seed-user-%'
//
// Preserves all real user data (your account, personas, CV, working history,
// tags experience).
//
// Deletion order respects FK constraints:
//   1. match_queue (references job + persona)
//   2. persona (references applicant)
//   3. job (no FK references from remaining tables)
//   4. applicant (referenced by persona, already cleaned)
//
// Usage:
//   node --env-file=.env --import tsx scripts/cleanup-seed-data.ts
//   node --env-file=.env --import tsx scripts/cleanup-seed-data.ts --dry-run

import { sql } from "drizzle-orm";
import { db } from "@/db/db";

const isDryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(
    isDryRun
      ? "=== DRY RUN — no data will be deleted ===\n"
      : "=== CLEANUP — deleting synthetic seed data ===\n",
  );

  // ── Pre-cleanup verification ──────────────────────────────────────────────
  const before = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM applicant WHERE user_id LIKE 'seed-user-%') as seed_applicants,
      (SELECT count(*) FROM applicant WHERE user_id NOT LIKE 'seed-user-%') as real_applicants,
      (SELECT count(*) FROM persona WHERE applicant_id LIKE 'seed-user-%') as seed_personas,
      (SELECT count(*) FROM persona WHERE applicant_id NOT LIKE 'seed-user-%') as real_personas,
      (SELECT count(*) FROM job WHERE ats_slug LIKE 'seed-%') as seed_jobs,
      (SELECT count(*) FROM job WHERE ats_slug NOT LIKE 'seed-%') as real_jobs,
      (SELECT count(*) FROM match_queue WHERE applicant_id LIKE 'seed-user-%') as seed_matches,
      (SELECT count(*) FROM match_queue WHERE applicant_id NOT LIKE 'seed-user-%') as real_matches
  `);

  const b = before.rows[0] as Record<string, string>;
  console.log("Before cleanup:");
  console.log(
    `  Seed applicants:  ${b.seed_applicants}  | Real: ${b.real_applicants}`,
  );
  console.log(
    `  Seed personas:    ${b.seed_personas}    | Real: ${b.real_personas}`,
  );
  console.log(
    `  Seed jobs:        ${b.seed_jobs}        | Real: ${b.real_jobs}`,
  );
  console.log(
    `  Seed matches:     ${b.seed_matches}     | Real: ${b.real_matches}`,
  );

  // Safety check: abort if real data would be affected
  if (b.real_applicants !== "1" || b.real_personas !== "1") {
    console.error(
      "\nABORT: Expected exactly 1 real applicant and 1 real persona. Got",
      b.real_applicants,
      "applicants,",
      b.real_personas,
      "personas. Manual review required.",
    );
    process.exit(1);
  }

  if (isDryRun) {
    console.log("\nDry run complete — no data deleted.");
    process.exit(0);
  }

  // ── Delete in FK-safe order within a transaction ─────────────────────────
  console.log("\nDeleting...");

  await db.transaction(async (tx) => {
    // 1. Delete seed matches
    const r1 = await tx.execute(sql`
      DELETE FROM match_queue WHERE applicant_id LIKE 'seed-user-%'
    `);
    console.log(`  match_queue: deleted (seed-user-* rows)`);

    // 2. Delete seed personas
    const r2 = await tx.execute(sql`
      DELETE FROM persona WHERE applicant_id LIKE 'seed-user-%'
    `);
    console.log(`  persona: deleted (seed-user-* rows)`);

    // 3. Delete seed jobs
    const r3 = await tx.execute(sql`
      DELETE FROM job WHERE ats_slug LIKE 'seed-%'
    `);
    console.log(`  job: deleted (seed-* rows)`);

    // 4. Delete seed applicants
    const r4 = await tx.execute(sql`
      DELETE FROM applicant WHERE user_id LIKE 'seed-user-%'
    `);
    console.log(`  applicant: deleted (seed-user-* rows)`);

    // 5. Delete seed users from Better Auth user table
    //    (sessions and accounts already checked — 0 rows for seed users)
    const r5 = await tx.execute(sql`
      DELETE FROM "user" WHERE id LIKE 'seed-user-%'
    `);
    console.log(`  user: deleted (seed-user-* rows)`);

    return { r1, r2, r3, r4, r5 };
  });

  // ── Post-cleanup verification ────────────────────────────────────────────
  const after = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM applicant) as applicants,
      (SELECT count(*) FROM persona) as personas,
      (SELECT count(*) FROM job) as jobs,
      (SELECT count(*) FROM match_queue) as matches,
      (SELECT count(*) FROM working_history) as wh,
      (SELECT count(*) FROM tags_experience) as te,
      (SELECT count(*) FROM cv_upload) as cv,
      (SELECT count(*) FROM "user") as users,
      (SELECT count(*) FROM session) as sessions,
      (SELECT count(*) FROM account) as accounts
  `);

  const a = after.rows[0] as Record<string, string>;
  console.log("\nAfter cleanup:");
  console.log(`  Users:          ${a.users}`);
  console.log(`  Applicants:     ${a.applicants}`);
  console.log(`  Personas:       ${a.personas}`);
  console.log(`  Jobs:           ${a.jobs}`);
  console.log(`  Matches:        ${a.matches}`);
  console.log(`  Sessions:       ${a.sessions}`);
  console.log(`  Accounts:       ${a.accounts}`);
  console.log(`  Working history:${a.wh}`);
  console.log(`  Tags experience:${a.te}`);
  console.log(`  CV uploads:     ${a.cv}`);

  console.log("\nCleanup complete. Only real user data remains.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exit(1);
});
