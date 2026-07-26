/**
 * PER-SOURCE FENCE RATE REPORT (D26)
 *
 * The key metric for the strategic inversion: what percentage of jobs
 * from each source are country-fenced (guaranteed-discard) vs global
 * (matchable)?
 *
 * The directive's thesis: remote-native boards (WWR, Remotive, RemoteOK,
 * Himalayas) should have a structurally lower fence rate than ATS-polled
 * companies (Greenhouse, Lever, Ashby) because they're remote-first by
 * construction.
 *
 * This report measures the fence rate:
 *   - Per source (all-time and last 7 days)
 *   - Before the inversion (historical baseline)
 *   - After the inversion (newly ingested jobs)
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/fence-rate-report.ts
 */

import { Client } from "pg";

async function main() {
  console.log("PER-SOURCE FENCE RATE REPORT (D26)");
  console.log("===================================");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("");

  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── All-time fence rate by source ──────────────────────────────────────
  console.log("── All-Time Fence Rate by Source ──");
  const allTime = await client.query(`
    SELECT
      ats_source,
      count(*)::int AS total,
      count(*) FILTER (WHERE remote_scope = 'global')::int AS global,
      count(*) FILTER (WHERE remote_scope = 'country_fenced')::int AS fenced,
      count(*) FILTER (WHERE remote_scope = 'region_fenced')::int AS region_fenced,
      count(*) FILTER (WHERE remote_scope = 'onsite')::int AS onsite,
      count(*) FILTER (WHERE remote_scope = 'global' AND is_fenced = false AND status = 'active' AND job_embedding IS NOT NULL)::int AS matchable,
      ROUND(100.0 * count(*) FILTER (WHERE remote_scope = 'country_fenced') / count(*), 1) AS fence_pct,
      ROUND(100.0 * count(*) FILTER (WHERE remote_scope = 'global') / count(*), 1) AS global_pct
    FROM job
    GROUP BY ats_source
    ORDER BY total DESC
  `);

  console.log("  Source               Total   Global  Fenced  Fence%  Global%  Matchable");
  console.log("  ───────────────────────────────────────────────────────────────────────────");
  for (const r of allTime.rows) {
    console.log(
      `  ${r.ats_source.padEnd(20)} ${String(r.total).padStart(6)}   ${String(r.global).padStart(6)}   ${String(r.fenced).padStart(6)}   ${String(r.fence_pct).padStart(5)}%   ${String(r.global_pct).padStart(5)}%   ${String(r.matchable).padStart(9)}`,
    );
  }
  console.log("");

  // ── 7-day fence rate by source (the "after" measurement) ──────────────
  console.log("── 7-Day Fence Rate by Source (Recent Intake) ──");
  const recent = await client.query(`
    SELECT
      ats_source,
      count(*)::int AS total,
      count(*) FILTER (WHERE remote_scope = 'global')::int AS global,
      count(*) FILTER (WHERE remote_scope = 'country_fenced')::int AS fenced,
      count(*) FILTER (WHERE remote_scope = 'global' AND is_fenced = false AND status = 'active' AND job_embedding IS NOT NULL)::int AS matchable,
      ROUND(100.0 * count(*) FILTER (WHERE remote_scope = 'country_fenced') / NULLIF(count(*), 0), 1) AS fence_pct,
      ROUND(100.0 * count(*) FILTER (WHERE remote_scope = 'global') / NULLIF(count(*), 0), 1) AS global_pct
    FROM job
    WHERE detected_at > NOW() - INTERVAL '7 days'
    GROUP BY ats_source
    ORDER BY total DESC
  `);

  if (recent.rows.length === 0) {
    console.log("  No jobs ingested in the last 7 days");
  } else {
    console.log("  Source               Total   Global  Fenced  Fence%  Global%  Matchable");
    console.log("  ───────────────────────────────────────────────────────────────────────────");
    for (const r of recent.rows) {
      console.log(
        `  ${r.ats_source.padEnd(20)} ${String(r.total).padStart(6)}   ${String(r.global).padStart(6)}   ${String(r.fenced).padStart(6)}   ${String(r.fence_pct ?? 0).padStart(5)}%   ${String(r.global_pct ?? 0).padStart(5)}%   ${String(r.matchable).padStart(9)}`,
      );
    }
  }
  console.log("");

  // ── Overall corpus fence rate ──────────────────────────────────────────
  console.log("── Overall Corpus Fence Rate ──");
  const overall = await client.query(`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE remote_scope = 'global')::int AS global,
      count(*) FILTER (WHERE remote_scope = 'country_fenced')::int AS fenced,
      count(*) FILTER (WHERE remote_scope = 'global' AND is_fenced = false AND status = 'active' AND job_embedding IS NOT NULL)::int AS matchable,
      ROUND(100.0 * count(*) FILTER (WHERE remote_scope = 'country_fenced') / count(*), 1) AS fence_pct
    FROM job
  `);
  const o = overall.rows[0];
  console.log(`  Total jobs:     ${o.total}`);
  console.log(`  Global:         ${o.global} (${(100 * o.global / o.total).toFixed(1)}%)`);
  console.log(`  Country-fenced: ${o.fenced} (${o.fence_pct}%)`);
  console.log(`  Matchable:      ${o.matchable}`);
  console.log("");

  // ── Remote-native vs ATS-polled comparison ─────────────────────────────
  console.log("── Remote-Native vs ATS-Polled Comparison ──");
  const comparison = await client.query(`
    SELECT
      CASE
        WHEN ats_source IN ('remoteok_direct','weworkremotely','remotive','himalayas_direct','arbeitnow','wellfound','remotecom','larajobs')
        THEN 'remote-native'
        ELSE 'ats-polled'
      END AS source_type,
      count(*)::int AS total,
      count(*) FILTER (WHERE remote_scope = 'global')::int AS global,
      count(*) FILTER (WHERE remote_scope = 'country_fenced')::int AS fenced,
      count(*) FILTER (WHERE remote_scope = 'global' AND is_fenced = false AND status = 'active' AND job_embedding IS NOT NULL)::int AS matchable,
      ROUND(100.0 * count(*) FILTER (WHERE remote_scope = 'country_fenced') / count(*), 1) AS fence_pct,
      ROUND(100.0 * count(*) FILTER (WHERE remote_scope = 'global') / count(*), 1) AS global_pct
    FROM job
    GROUP BY source_type
    ORDER BY source_type
  `);

  console.log("  Source Type       Total   Global  Fenced  Fence%  Global%  Matchable");
  console.log("  ───────────────────────────────────────────────────────────────────────");
  for (const r of comparison.rows) {
    console.log(
      `  ${r.source_type.padEnd(18)} ${String(r.total).padStart(6)}   ${String(r.global).padStart(6)}   ${String(r.fenced).padStart(6)}   ${String(r.fence_pct).padStart(5)}%   ${String(r.global_pct).padStart(5)}%   ${String(r.matchable).padStart(9)}`,
    );
  }
  console.log("");

  // ── D26 target tracking ────────────────────────────────────────────────
  console.log("── D26 Target Tracking ──");
  console.log(`  Target: Fence rate of newly-ingested jobs: 71% → <20%`);
  console.log(`  Target: Global matchable pool: 680 → 2,000+`);
  console.log(`  Target: Gate-1 candidate-producing jobs: 50 → 200+`);
  console.log(`  Current matchable pool: ${o.matchable}`);
  console.log("");

  await client.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
