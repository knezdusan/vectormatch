/**
 * D20 JOB 1.3 (diagnosis): Investigate the direct-ingestion supply gaps.
 *
 * Three questions:
 *  1. Why are Himalayas/Arbeitnow/Wellfound/Remote.com absent from the corpus?
 *     (Check if they ever had jobs, or if jobs were cleaned up)
 *  2. Why are so many active direct-ingestion jobs missing embeddings?
 *     (WWR: 49 active / 34 embedded = 15 missing. RemoteOK: 47/20 = 27 missing.
 *      Remotive: 25/1 = 24 missing.)
 *  3. What's the remote_scope distribution for the stranded jobs?
 *
 * Run with: npx tsx scripts/d20-diagnose-direct-supply.ts
 */
import "dotenv/config";
import { db } from "../src/db/db";
import { job } from "../src/db/schemas/jobs/job";
import { sql, inArray } from "drizzle-orm";

const ALL_DIRECT_SOURCES = [
  "himalayas_direct",
  "himalayas",
  "remoteok_direct",
  "remoteok",
  "arbeitnow",
  "remotive",
  "weworkremotely",
  "wellfound",
  "remotecom",
  "larajobs",
];

async function main() {
  // Q1: Check ALL ats_source values that look direct-ingestion-related
  const allSources = await db.execute(sql`
    SELECT ats_source, count(*)::int AS c
    FROM job
    WHERE ats_source LIKE '%himalaya%'
       OR ats_source LIKE '%remoteok%'
       OR ats_source LIKE '%arbeitnow%'
       OR ats_source LIKE '%remotive%'
       OR ats_source LIKE '%weworkremotely%'
       OR ats_source LIKE '%wellfound%'
       OR ats_source LIKE '%remotecom%'
       OR ats_source LIKE '%larajobs%'
    GROUP BY ats_source
    ORDER BY c DESC
  `);
  console.log("\n=== Q1: All direct-ingestion-related ats_source values in corpus ===");
  for (const row of allSources.rows as Array<{ ats_source: string; c: number }>) {
    console.log(`  ${row.ats_source.padEnd(25)} ${row.c}`);
  }

  // Q2: Embedding gap for active direct-ingestion jobs
  const embedGap = await db.execute(sql`
    SELECT
      ats_source,
      count(*)::int AS active_total,
      count(*) filter (where job_embedding is not null)::int AS embedded,
      count(*) filter (where job_embedding is null)::int AS missing_embedding,
      count(*) filter (where extracted_tags is null)::int AS missing_tags,
      count(*) filter (where normalized_at is null)::int AS not_normalized
    FROM job
    WHERE ats_source IN ('weworkremotely', 'remoteok_direct', 'remotive', 'larajobs')
      AND status = 'active'
    GROUP BY ats_source
    ORDER BY active_total DESC
  `);
  console.log("\n=== Q2: Embedding + tags + normalization gap for active direct jobs ===");
  console.log(
    "source".padEnd(22) +
      "active".padStart(7) +
      "embed".padStart(7) +
      "miss_e".padStart(7) +
      "miss_t".padStart(7) +
      "not_n".padStart(7),
  );
  for (const row of embedGap.rows as Array<{
    ats_source: string;
    active_total: number;
    embedded: number;
    missing_embedding: number;
    missing_tags: number;
    not_normalized: number;
  }>) {
    console.log(
      row.ats_source.padEnd(22) +
        String(row.active_total).padStart(7) +
        String(row.embedded).padStart(7) +
        String(row.missing_embedding).padStart(7) +
        String(row.missing_tags).padStart(7) +
        String(row.not_normalized).padStart(7),
    );
  }

  // Q3: remote_scope + fence distribution for the 21 stranded jobs
  const stranded = await db.execute(sql`
    SELECT
      j.ats_source,
      j.remote_scope,
      count(*)::int AS c
    FROM job j
    LEFT JOIN match_queue mq ON mq.job_id = j.id
    WHERE j.ats_source IN ('weworkremotely', 'remoteok_direct', 'remotive', 'larajobs')
      AND j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.remote_scope IN ('global', 'country_fenced')
      AND COALESCE(j.is_fenced, false) = false
      AND mq.id IS NULL
    GROUP BY j.ats_source, j.remote_scope
    ORDER BY j.ats_source, j.remote_scope
  `);
  console.log("\n=== Q3: Stranded jobs by source + remote_scope ===");
  for (const row of stranded.rows as Array<{
    ats_source: string;
    remote_scope: string;
    c: number;
  }>) {
    console.log(`  ${row.ats_source.padEnd(22)} ${row.remote_scope.padEnd(18)} ${row.c}`);
  }

  // Q4: Sample 5 stranded jobs to see what they look like
  const sample = await db.execute(sql`
    SELECT j.id, j.title, j.ats_source, j.remote_scope, j.location_name,
           j.normalized_at, j.is_fenced, j.is_natsec
    FROM job j
    LEFT JOIN match_queue mq ON mq.job_id = j.id
    WHERE j.ats_source IN ('weworkremotely', 'remoteok_direct', 'remotive', 'larajobs')
      AND j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.remote_scope IN ('global', 'country_fenced')
      AND COALESCE(j.is_fenced, false) = false
      AND mq.id IS NULL
    LIMIT 5
  `);
  console.log("\n=== Q4: Sample 5 stranded jobs ===");
  for (const row of sample.rows as Array<{
    id: string;
    title: string;
    ats_source: string;
    remote_scope: string;
    location_name: string | null;
    normalized_at: string;
    is_fenced: boolean | null;
    is_natsec: boolean | null;
  }>) {
    console.log(
      `  ${row.id.slice(0, 8)} | ${row.title?.slice(0, 45).padEnd(45)} | ${row.ats_source.padEnd(18)} | ${row.remote_scope.padEnd(15)} | loc=${row.location_name?.slice(0, 20) ?? "null"} | natsec=${row.is_natsec}`,
    );
  }

  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
