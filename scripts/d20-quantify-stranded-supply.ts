/**
 * D20 JOB 1.3 (analysis): Quantify the stranded direct-ingestion supply.
 *
 * Counts direct-ingestion jobs that are:
 *  - active
 *  - global (remote_scope = 'global' or 'country_fenced' — both pass Gate 1)
 *  - embedded (job_embedding IS NOT NULL — Gate 2 can find them)
 *  - have NO match_queue entries (the gate router never ran)
 *
 * Per-source breakdown so we know which boards have the most stranded supply.
 *
 * Run with: npx tsx scripts/d20-quantify-stranded-supply.ts
 */
import "dotenv/config";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../src/db/db";
import { job } from "../src/db/schemas/jobs/job";
import { matchQueue } from "../src/db/schemas/match-queue";

const DIRECT_SOURCES = [
  "himalayas_direct",
  "remoteok_direct",
  "arbeitnow",
  "remotive",
  "weworkremotely",
  "wellfound",
  "remotecom",
  "larajobs",
];

async function main() {
  // Total direct-ingestion jobs by source
  const bySource = await db
    .select({
      source: job.atsSource,
      total: sql<number>`count(*)::int`,
      active: sql<number>`count(*) filter (where ${job.status} = 'active')::int`,
      embedded: sql<number>`count(*) filter (where ${job.jobEmbedding} is not null)::int`,
      global: sql<number>`count(*) filter (where ${job.remoteScope} in ('global', 'country_fenced'))::int`,
      fenced: sql<number>`count(*) filter (where ${job.isFenced} = true)::int`,
    })
    .from(job)
    .where(inArray(job.atsSource, DIRECT_SOURCES))
    .groupBy(job.atsSource)
    .orderBy(sql`count(*) desc`);

  console.log("\n=== Direct-ingestion jobs by source ===");
  console.log(
    "source".padEnd(22) +
      "total".padStart(7) +
      "active".padStart(7) +
      "embed".padStart(7) +
      "global".padStart(7) +
      "fenced".padStart(7),
  );
  for (const r of bySource) {
    console.log(
      (r.source ?? "?").padEnd(22) +
        String(r.total).padStart(7) +
        String(r.active).padStart(7) +
        String(r.embedded).padStart(7) +
        String(r.global).padStart(7) +
        String(r.fenced).padStart(7),
    );
  }

  // Stranded supply: active + embedded + (global or country_fenced) + NOT fenced + NO match_queue
  // Use a NOT EXISTS subquery against match_queue.
  const sourceList = DIRECT_SOURCES.map((s) => `'${s}'`).join(", ");
  const stranded = await db.execute(sql`
    SELECT
      j.ats_source,
      count(*)::int AS stranded_count
    FROM job j
    LEFT JOIN match_queue mq ON mq.job_id = j.id
    WHERE j.ats_source IN (${sql.raw(sourceList)})
      AND j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.remote_scope IN ('global', 'country_fenced')
      AND COALESCE(j.is_fenced, false) = false
      AND mq.id IS NULL
    GROUP BY j.ats_source
    ORDER BY stranded_count DESC
  `);

  console.log(
    "\n=== Stranded supply (active + embedded + global + unfenced + NO match_queue) ===",
  );
  let totalStranded = 0;
  for (const row of stranded.rows as Array<{
    ats_source: string;
    stranded_count: number;
  }>) {
    console.log(`  ${row.ats_source.padEnd(22)} ${row.stranded_count}`);
    totalStranded += row.stranded_count;
  }
  console.log(`  ${"TOTAL".padEnd(22)} ${totalStranded}`);

  // Also check: how many direct-ingestion jobs have match_queue entries at all?
  const withMq = await db.execute(sql`
    SELECT
      j.ats_source,
      count(distinct j.id)::int AS jobs_with_mq
    FROM job j
    JOIN match_queue mq ON mq.job_id = j.id
    WHERE j.ats_source IN (${sql.raw(sourceList)})
    GROUP BY j.ats_source
    ORDER BY jobs_with_mq DESC
  `);
  console.log(
    "\n=== Direct-ingestion jobs WITH match_queue entries (for contrast) ===",
  );
  for (const row of withMq.rows as Array<{
    ats_source: string;
    jobs_with_mq: number;
  }>) {
    console.log(`  ${row.ats_source.padEnd(22)} ${row.jobs_with_mq}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
