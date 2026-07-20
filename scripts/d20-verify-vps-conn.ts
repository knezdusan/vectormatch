/**
 * D20 JOB 0: Verify VPS Postgres connectivity + D19 schema parity.
 * Run with: npx tsx scripts/d20-verify-vps-conn.ts
 * Reads DATABASE_URL from .env (now pointing at VPS).
 */
import { db } from "../src/db/db";
import { job } from "../src/db/schemas/jobs/job";
import { count, sql } from "drizzle-orm";

async function main() {
  const total = await db.select({ c: count() }).from(job);
  console.log("DRIZZLE OK — total jobs:", total[0].c);

  const fenceDist = await db
    .select({ flag: job.isFenced, c: count() })
    .from(job)
    .groupBy(job.isFenced);
  console.log(
    "is_fenced:",
    fenceDist.map((r) => `${r.flag}=${r.c}`).join(" | "),
  );

  const nullFenced = await db
    .select({
      id: job.id,
      title: job.title,
      source: job.atsSource,
      status: job.status,
      normalizedAt: job.normalizedAt,
    })
    .from(job)
    .where(sql`${job.isFenced} IS NULL`);
  console.log(`NULL is_fenced rows (${nullFenced.length}):`);
  for (const r of nullFenced) {
    console.log(
      `  ${r.id} | ${r.title?.slice(0, 50)} | ${r.source} | ${r.status} | norm=${r.normalizedAt?.toISOString() ?? "null"}`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
