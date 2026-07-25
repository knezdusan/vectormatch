/**
 * GATE-1 PASS RATE REPORT (D25)
 *
 * Reports the Gate 1+2 pass rate — the percentage of ingested jobs that
 * produce at least one match_queue candidate. This is the key funnel
 * metric for the pipeline.
 *
 * The report breaks down the pass rate by:
 *   - Time window (24h, 7d, 30d)
 *   - ATS source
 *   - Remote scope
 *
 * Usage:
 *   npx tsx scripts/gate1-pass-rate.ts
 *   docker exec <app-container> node /app/scripts/gate1-pass-rate.js
 */

import { Client } from "pg";

async function main() {
  console.log("GATE-1 PASS RATE REPORT (D25)");
  console.log("==============================");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log("");

  if (!process.env.DATABASE_URL) {
    console.error("FATAL: DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // ── Overall funnel ──────────────────────────────────────────────────────
  console.log("── Overall Funnel ──");
  const funnel = await client.query(`
    SELECT
      count(*)::int AS total_jobs,
      count(*) FILTER (WHERE normalized_at IS NOT NULL)::int AS normalized,
      count(*) FILTER (WHERE job_embedding IS NOT NULL)::int AS embedded,
      count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      (SELECT count(DISTINCT job_id)::int FROM match_queue)::int AS with_candidates,
      (SELECT count(*)::int FROM match_queue)::int AS total_candidates,
      (SELECT count(*)::int FROM match_queue WHERE status = 'approved')::int AS approved
    FROM job
  `);
  const f = funnel.rows[0];
  const normalizationRate =
    f.total_jobs > 0 ? ((f.normalized / f.total_jobs) * 100).toFixed(1) : "0";
  const embeddingRate =
    f.normalized > 0 ? ((f.embedded / f.normalized) * 100).toFixed(1) : "0";
  const gate1PassRate =
    f.normalized > 0
      ? ((f.with_candidates / f.normalized) * 100).toFixed(1)
      : "0";
  const gate3ApprovalRate =
    f.total_candidates > 0
      ? ((f.approved / f.total_candidates) * 100).toFixed(1)
      : "0";

  console.log(`  Total jobs:          ${f.total_jobs}`);
  console.log(`  Normalized:          ${f.normalized} (${normalizationRate}%)`);
  console.log(
    `  Embedded:            ${f.embedded} (${embeddingRate}% of normalized)`,
  );
  console.log(`  Rejected:            ${f.rejected}`);
  console.log(
    `  Jobs with candidates:${f.with_candidates} (${gate1PassRate}% of normalized)`,
  );
  console.log(`  Total candidates:    ${f.total_candidates}`);
  console.log(
    `  Approved:            ${f.approved} (${gate3ApprovalRate}% of candidates)`,
  );
  console.log("");

  // ── 24h funnel ──────────────────────────────────────────────────────────
  console.log("── 24-Hour Funnel ──");
  const funnel24h = await client.query(`
    SELECT
      count(*)::int AS total_jobs,
      count(*) FILTER (WHERE normalized_at IS NOT NULL)::int AS normalized,
      count(*) FILTER (WHERE job_embedding IS NOT NULL)::int AS embedded,
      count(*) FILTER (WHERE status = 'rejected')::int AS rejected,
      (SELECT count(DISTINCT job_id)::int FROM match_queue WHERE created_at > now() - interval '24 hours')::int AS with_candidates,
      (SELECT count(*)::int FROM match_queue WHERE created_at > now() - interval '24 hours')::int AS total_candidates,
      (SELECT count(*)::int FROM match_queue WHERE status = 'approved' AND evaluated_at > now() - interval '24 hours')::int AS approved
    FROM job
    WHERE detected_at > now() - interval '24 hours'
  `);
  const f24 = funnel24h.rows[0];
  const normRate24 =
    f24.total_jobs > 0
      ? ((f24.normalized / f24.total_jobs) * 100).toFixed(1)
      : "0";
  const gate1Rate24 =
    f24.normalized > 0
      ? ((f24.with_candidates / f24.normalized) * 100).toFixed(1)
      : "0";

  console.log(`  Jobs ingested:       ${f24.total_jobs}`);
  console.log(`  Normalized:          ${f24.normalized} (${normRate24}%)`);
  console.log(`  Embedded:            ${f24.embedded}`);
  console.log(`  Rejected:            ${f24.rejected}`);
  console.log(
    `  Jobs with candidates:${f24.with_candidates} (${gate1Rate24}% of normalized)`,
  );
  console.log(`  Total candidates:    ${f24.total_candidates}`);
  console.log(`  Approved:            ${f24.approved}`);
  console.log("");

  // ── Gate-1 pass rate by ATS source ──────────────────────────────────────
  console.log("── Gate-1 Pass Rate by ATS Source (30d) ──");
  const bySource = await client.query(`
    SELECT
      j.ats_source,
      count(*)::int AS total,
      count(*) FILTER (WHERE j.normalized_at IS NOT NULL)::int AS normalized,
      count(DISTINCT mq.job_id)::int AS with_candidates
    FROM job j
    LEFT JOIN match_queue mq ON mq.job_id = j.id
    WHERE j.detected_at > now() - interval '30 days'
    GROUP BY j.ats_source
    ORDER BY total DESC
    LIMIT 20
  `);

  console.log("  Source                    Total   Norm   Gate1   Pass%");
  console.log("  ─────────────────────────────────────────────────────────");
  for (const r of bySource.rows) {
    const passRate =
      r.normalized > 0
        ? ((r.with_candidates / r.normalized) * 100).toFixed(1)
        : "0.0";
    console.log(
      `  ${r.ats_source.padEnd(25)} ${String(r.total).padStart(5)}   ${String(r.normalized).padStart(5)}   ${String(r.with_candidates).padStart(5)}   ${passRate.padStart(5)}%`,
    );
  }
  console.log("");

  // ── Gate-1 pass rate by remote scope ────────────────────────────────────
  console.log("── Gate-1 Pass Rate by Remote Scope (30d) ──");
  const byScope = await client.query(`
    SELECT
      COALESCE(j.remote_scope, 'unknown') AS scope,
      count(*)::int AS total,
      count(*) FILTER (WHERE j.normalized_at IS NOT NULL)::int AS normalized,
      count(DISTINCT mq.job_id)::int AS with_candidates
    FROM job j
    LEFT JOIN match_queue mq ON mq.job_id = j.id
    WHERE j.detected_at > now() - interval '30 days'
    GROUP BY j.remote_scope
    ORDER BY total DESC
  `);

  console.log("  Scope              Total   Norm   Gate1   Pass%");
  console.log("  ───────────────────────────────────────────────────");
  for (const r of byScope.rows) {
    const passRate =
      r.normalized > 0
        ? ((r.with_candidates / r.normalized) * 100).toFixed(1)
        : "0.0";
    console.log(
      `  ${r.scope.padEnd(18)} ${String(r.total).padStart(5)}   ${String(r.normalized).padStart(5)}   ${String(r.with_candidates).padStart(5)}   ${passRate.padStart(5)}%`,
    );
  }
  console.log("");

  // ── Gate-0.5 rejection patterns ─────────────────────────────────────────
  console.log("── Gate-0.5 Rejection Patterns (30d) ──");
  const patterns = await client.query(`
    SELECT
      rejection_pattern,
      count(*)::int AS cnt
    FROM job
    WHERE status = 'rejected'
      AND rejection_pattern IS NOT NULL
      AND normalized_at > now() - interval '30 days'
    GROUP BY rejection_pattern
    ORDER BY cnt DESC
    LIMIT 10
  `);

  if (patterns.rows.length === 0) {
    console.log("  No Gate-0.5 rejections in the last 30 days");
  } else {
    for (const r of patterns.rows) {
      console.log(`  ${r.rejection_pattern}: ${r.cnt}`);
    }
  }
  console.log("");

  await client.end();
  console.log("Done.");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
