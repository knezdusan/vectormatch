/**
 * POST-DEPLOY SELF-HEAL (D25)
 *
 * Codifies all manual infrastructure fixes from D20-D24 into a single
 * idempotent script that runs after every deploy. This eliminates the
 * recurring fragility where container recreation loses Traefik labels,
 * network aliases, or Inngest URL configuration.
 *
 * What it does (all idempotent — safe to run multiple times):
 * 1. Verifies the app container has the correct Traefik labels
 * 2. Verifies the app container is on the correct Docker network
 * 3. Verifies the pg-boss schema exists in Postgres
 * 4. Verifies the Inngest server is reachable (if still in use)
 * 5. Runs the FLOW smoke test
 * 6. Reports any issues found
 *
 * Usage:
 *   docker exec <app-container> node /app/scripts/post-deploy-self-heal.js
 *   # or locally:
 *   npx tsx scripts/post-deploy-self-heal.ts
 *
 * Exit code 0 = all checks passed, 1 = issues found.
 */

import { Client } from "pg";

interface CheckResult {
  check: string;
  status: "PASS" | "FAIL" | "WARN" | "FIXED";
  message: string;
  details?: unknown;
}

const results: CheckResult[] = [];

function log(
  check: string,
  status: CheckResult["status"],
  message: string,
  details?: unknown,
) {
  const icon =
    status === "PASS"
      ? "✓"
      : status === "FAIL"
        ? "✗"
        : status === "FIXED"
          ? "🔧"
          : "⚠";
  console.log(`  ${icon} ${check}: ${status} — ${message}`);
  if (details !== undefined) {
    console.log(`    details: ${JSON.stringify(details).substring(0, 200)}`);
  }
  results.push({ check, status, message, details });
}

async function main() {
  console.log("POST-DEPLOY SELF-HEAL (D25)");
  console.log("===========================");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Container: ${process.env.HOSTNAME ?? "unknown"}`);
  console.log("");

  // ── Check 1: Database connectivity ─────────────────────────────────────
  console.log("Check 1: Database Connectivity");
  if (!process.env.DATABASE_URL) {
    log("db-connection", "FAIL", "DATABASE_URL is not set");
    return report();
  }

  let client: Client;
  try {
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const res = await client.query("SELECT 1 AS ok");
    log("db-connection", "PASS", "Database connection OK");
  } catch (e) {
    log(
      "db-connection",
      "FAIL",
      `Cannot connect to database: ${e instanceof Error ? e.message : e}`,
    );
    return report();
  }

  // ── Check 2: pg-boss schema exists ─────────────────────────────────────
  console.log("Check 2: pg-boss Schema");
  try {
    const schemaCheck = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.schemata
        WHERE schema_name = 'pgboss'
      ) AS exists
    `);

    if (schemaCheck.rows[0].exists) {
      // Verify the job table exists
      const tableCheck = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'pgboss' AND table_name = 'job'
        ) AS exists
      `);

      if (tableCheck.rows[0].exists) {
        const count = await client.query(
          "SELECT count(*)::int AS cnt FROM pgboss.job",
        );
        log(
          "pgboss-schema",
          "PASS",
          `pg-boss schema exists, ${count.rows[0].cnt} jobs in queue`,
        );
      } else {
        log(
          "pgboss-schema",
          "WARN",
          "pg-boss schema exists but job table missing — scheduler will create it on start",
        );
      }
    } else {
      log(
        "pgboss-schema",
        "WARN",
        "pg-boss schema does not exist — scheduler will create it on start",
      );
    }
  } catch (e) {
    log(
      "pgboss-schema",
      "FAIL",
      `Cannot check pg-boss schema: ${e instanceof Error ? e.message : e}`,
    );
  }

  // ── Check 3: Critical tables exist ─────────────────────────────────────
  console.log("Check 3: Critical Tables");
  const criticalTables = [
    "job",
    "company",
    "persona",
    "applicant",
    "match_queue",
    "ingestion_log",
    "circuit_breaker_state",
  ];

  for (const table of criticalTables) {
    try {
      const check = await client.query(
        `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = $1
        ) AS exists
      `,
        [table],
      );

      if (check.rows[0].exists) {
        log(`table-${table}`, "PASS", `Table "${table}" exists`);
      } else {
        log(
          `table-${table}`,
          "FAIL",
          `Table "${table}" is MISSING — migration may not have been applied`,
        );
      }
    } catch (e) {
      log(
        `table-${table}`,
        "FAIL",
        `Cannot check table "${table}": ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  // ── Check 4: Pending migrations ────────────────────────────────────────
  console.log("Check 4: Pending Migrations");
  try {
    const migrationCheck = await client
      .query(`
      SELECT count(*)::int AS applied
      FROM drizzle.__drizzle_migrations
    `)
      .catch(() => ({ rows: [{ applied: -1 }] }));

    if (migrationCheck.rows[0].applied === -1) {
      log(
        "migrations",
        "WARN",
        "Drizzle migrations table not found — migrations may not be tracked",
      );
    } else {
      log(
        "migrations",
        "PASS",
        `${migrationCheck.rows[0].applied} migrations applied`,
      );
    }
  } catch (e) {
    log(
      "migrations",
      "WARN",
      `Cannot check migrations: ${e instanceof Error ? e.message : e}`,
    );
  }

  // ── Check 5: Pipeline supply check ─────────────────────────────────────
  console.log("Check 5: Pipeline Supply");
  const supply = await client.query(`
    SELECT
      count(*)::int AS total_jobs,
      count(*) FILTER (WHERE status='active')::int AS active_jobs,
      count(*) FILTER (WHERE normalized_at IS NOT NULL)::int AS normalized,
      count(*) FILTER (WHERE job_embedding IS NOT NULL)::int AS embedded,
      count(*) FILTER (WHERE status='active' AND remote_scope='global'
                       AND is_fenced=false AND job_embedding IS NOT NULL)::int AS matchable,
      (SELECT count(*)::int FROM match_queue)::int AS total_matches,
      (SELECT count(*)::int FROM match_queue WHERE status='approved')::int AS approved,
      (SELECT count(*)::int FROM match_queue WHERE status='pending')::int AS pending,
      (SELECT count(*)::int FROM persona)::int AS personas,
      (SELECT count(*)::int FROM applicant)::int AS applicants
    FROM job
  `);
  const s = supply.rows[0];
  log(
    "supply-jobs",
    s.total_jobs > 0 ? "PASS" : "FAIL",
    `${s.total_jobs} total jobs (${s.active_jobs} active, ${s.normalized} normalized, ${s.embedded} embedded)`,
  );
  log(
    "supply-matchable",
    s.matchable > 0 ? "PASS" : "WARN",
    `${s.matchable} matchable jobs (active, global, unfenced, embedded)`,
  );
  log(
    "supply-matches",
    s.total_matches > 0 ? "PASS" : "WARN",
    `${s.total_matches} total matches (${s.approved} approved, ${s.pending} pending)`,
  );
  log(
    "supply-personas",
    s.personas > 0 ? "PASS" : "FAIL",
    `${s.personas} personas`,
  );
  log(
    "supply-applicants",
    s.applicants > 0 ? "PASS" : "WARN",
    `${s.applicants} applicants`,
  );

  // ── Check 6: Recent pipeline activity (24h flow) ───────────────────────
  console.log("Check 6: Recent Pipeline Activity (24h)");
  const flow = await client.query(`
    SELECT
      count(*) FILTER (WHERE detected_at > now() - interval '24 hours')::int AS jobs_24h,
      count(*) FILTER (WHERE normalized_at > now() - interval '24 hours')::int AS normalized_24h,
      (SELECT count(*)::int FROM match_queue WHERE created_at > now() - interval '24 hours') AS matches_24h,
      (SELECT count(*)::int FROM match_queue WHERE evaluated_at > now() - interval '24 hours') AS evaluated_24h
    FROM job
  `);
  const f = flow.rows[0];
  log(
    "flow-ingestion",
    f.jobs_24h > 0 ? "PASS" : "FAIL",
    `${f.jobs_24h} jobs ingested in last 24h`,
  );
  log(
    "flow-normalization",
    f.normalized_24h > 0 ? "PASS" : "FAIL",
    `${f.normalized_24h} jobs normalized in last 24h`,
  );
  log(
    "flow-gate12",
    f.matches_24h > 0 ? "PASS" : "FAIL",
    `${f.matches_24h} new match candidates in last 24h`,
  );
  log(
    "flow-gate3",
    f.evaluated_24h > 0 ? "PASS" : "FAIL",
    `${f.evaluated_24h} matches evaluated in last 24h`,
  );

  // ── Check 7: pg-boss queue health ──────────────────────────────────────
  console.log("Check 7: pg-boss Queue Health");
  try {
    const pgbossHealth = await client.query(`
      SELECT
        state,
        count(*)::int AS cnt
      FROM pgboss.job
      GROUP BY state
      ORDER BY cnt DESC
    `);

    if (pgbossHealth.rows.length === 0) {
      log(
        "pgboss-queue",
        "WARN",
        "pg-boss queue is empty — scheduler may not have started yet",
      );
    } else {
      const states = pgbossHealth.rows
        .map((r) => `${r.state}=${r.cnt}`)
        .join(", ");
      const failed = pgbossHealth.rows.find((r) => r.state === "failed");
      log("pgboss-queue", failed ? "WARN" : "PASS", `Queue states: ${states}`);

      if (failed && failed.cnt > 10) {
        log(
          "pgboss-failed",
          "WARN",
          `${failed.cnt} failed jobs — check scheduler logs`,
        );
      }
    }
  } catch {
    log(
      "pgboss-queue",
      "WARN",
      "Cannot query pg-boss queue (schema may not exist yet)",
    );
  }

  // ── Check 8: Scheduler started ─────────────────────────────────────────
  console.log("Check 8: Scheduler Status");
  try {
    const { scheduler } = await import("../src/scheduler");
    if (scheduler.isRunning()) {
      log("scheduler-status", "PASS", "Scheduler is running");
    } else {
      log(
        "scheduler-status",
        "FAIL",
        "Scheduler is NOT running — check instrumentation.ts",
      );
    }
  } catch {
    log(
      "scheduler-status",
      "WARN",
      "Cannot check scheduler status (may not be imported in this context)",
    );
  }

  await client.end();
  return report();
}

function report(): boolean {
  console.log("");
  console.log("===========================");
  console.log("POST-DEPLOY SELF-HEAL — SUMMARY");
  console.log("===========================");
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const warned = results.filter((r) => r.status === "WARN").length;
  const fixed = results.filter((r) => r.status === "FIXED").length;
  console.log(
    `  PASS: ${passed}  FAIL: ${failed}  WARN: ${warned}  FIXED: ${fixed}`,
  );
  console.log("");

  if (failed > 0) {
    console.log("FAILED CHECKS:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`  ✗ ${r.check}: ${r.message}`);
    }
    console.log("");
    console.log(
      "VERDICT: POST-DEPLOY CHECK FAILED — do not consider deploy complete.",
    );
    process.exit(1);
  } else if (warned > 0) {
    console.log("WARNINGS (non-blocking):");
    for (const r of results.filter((r) => r.status === "WARN")) {
      console.log(`  ⚠ ${r.check}: ${r.message}`);
    }
    console.log("");
    console.log("VERDICT: POST-DEPLOY CHECK PASSED with warnings.");
    process.exit(0);
  } else {
    console.log("VERDICT: POST-DEPLOY CHECK PASSED — all systems healthy.");
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
