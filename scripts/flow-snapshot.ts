/**
 * Flow Measurement Snapshot — captures daily pipeline metrics.
 *
 * Run once per day to build a time-series of pipeline health.
 * Output is appended to scripts/flow-snapshots.jsonl for trend analysis.
 *
 * Usage: npx tsx --require ./scripts/stubs/stub-server-only.cjs scripts/flow-snapshot.ts
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);
const SNAPSHOT_FILE = join(import.meta.dirname, "flow-snapshots.jsonl");

async function main() {
  const now = new Date();

  // ── Job corpus metrics ────────────────────────────────────────────────────
  const jobMetrics = await sql`
    SELECT
      count(*) as total_jobs,
      count(*) FILTER (WHERE status = 'active') as active_jobs,
      count(*) FILTER (WHERE job_embedding IS NOT NULL AND status = 'active') as embedded_jobs,
      count(*) FILTER (WHERE remote_scope = 'global' AND status = 'active') as global_active,
      count(*) FILTER (WHERE remote_scope = 'country_fenced' AND status = 'active') as country_fenced_active,
      count(*) FILTER (WHERE remote_scope = 'region_fenced' AND status = 'active') as region_fenced_active,
      count(*) FILTER (WHERE remote_scope = 'onsite' AND status = 'active') as onsite_active,
      count(*) FILTER (WHERE remote_scope IN ('unknown', 'undetermined') AND status = 'active') as unknown_active
    FROM job
  `;

  // ── Direct ingestion metrics ──────────────────────────────────────────────
  const directMetrics = await sql`
    SELECT
      count(*) FILTER (WHERE ats_slug = 'remoteok_direct') as remoteok,
      count(*) FILTER (WHERE ats_slug = 'remotive_direct') as remotive,
      count(*) FILTER (WHERE ats_slug = 'himalayas_direct') as himalayas,
      count(*) FILTER (WHERE ats_slug = 'arbeitnow') as arbeitnow,
      count(*) FILTER (WHERE ats_slug = 'weworkremotely_direct') as wwr,
      count(*) FILTER (WHERE ats_slug LIKE '%_direct') as all_direct,
      count(*) FILTER (WHERE ats_slug NOT LIKE '%_direct') as all_ats
    FROM job WHERE status = 'active'
  `;

  // ── Match queue metrics ───────────────────────────────────────────────────
  const mqMetrics = await sql`
    SELECT
      count(*) as total,
      count(*) FILTER (WHERE status = 'pending') as pending,
      count(*) FILTER (WHERE status = 'approved') as approved,
      count(*) FILTER (WHERE status = 'rejected') as rejected,
      count(*) FILTER (WHERE evaluated_at IS NOT NULL) as evaluated,
      count(*) FILTER (WHERE evaluated_at > NOW() - INTERVAL '24 hours') as evaluated_24h
    FROM match_queue
  `;

  // ── Today's ingestion ─────────────────────────────────────────────────────
  const todayFlow = await sql`
    SELECT
      count(*) as jobs_today,
      count(*) FILTER (WHERE status = 'active') as active_today,
      count(*) FILTER (WHERE job_embedding IS NOT NULL AND status = 'active') as embedded_today
    FROM job
    WHERE updated_at > CURRENT_DATE
  `;

  // ── Persona metrics ───────────────────────────────────────────────────────
  const personaMetrics = await sql`
    SELECT
      count(*) as total_personas,
      count(*) FILTER (WHERE persona_embedding IS NOT NULL) as embedded_personas
    FROM persona
  `;

  const snapshot = {
    timestamp: now.toISOString(),
    date: now.toISOString().slice(0, 10),
    jobs: {
      total: Number(jobMetrics[0].total_jobs),
      active: Number(jobMetrics[0].active_jobs),
      embedded: Number(jobMetrics[0].embedded_jobs),
      scope: {
        global: Number(jobMetrics[0].global_active),
        country_fenced: Number(jobMetrics[0].country_fenced_active),
        region_fenced: Number(jobMetrics[0].region_fenced_active),
        onsite: Number(jobMetrics[0].onsite_active),
        unknown: Number(jobMetrics[0].unknown_active),
      },
    },
    directIngestion: {
      remoteok: Number(directMetrics[0].remoteok),
      remotive: Number(directMetrics[0].remotive),
      himalayas: Number(directMetrics[0].himalayas),
      arbeitnow: Number(directMetrics[0].arbeitnow),
      weworkremotely: Number(directMetrics[0].wwr),
      all_direct: Number(directMetrics[0].all_direct),
      all_ats: Number(directMetrics[0].all_ats),
    },
    matchQueue: {
      total: Number(mqMetrics[0].total),
      pending: Number(mqMetrics[0].pending),
      approved: Number(mqMetrics[0].approved),
      rejected: Number(mqMetrics[0].rejected),
      evaluated: Number(mqMetrics[0].evaluated),
      evaluated_24h: Number(mqMetrics[0].evaluated_24h),
    },
    todayFlow: {
      jobs: Number(todayFlow[0].jobs_today),
      active: Number(todayFlow[0].active_today),
      embedded: Number(todayFlow[0].embedded_today),
    },
    personas: {
      total: Number(personaMetrics[0].total_personas),
      embedded: Number(personaMetrics[0].embedded_personas),
    },
  };

  // Append to JSONL file
  const line = JSON.stringify(snapshot) + "\n";
  if (existsSync(SNAPSHOT_FILE)) {
    const existing = readFileSync(SNAPSHOT_FILE, "utf-8");
    writeFileSync(SNAPSHOT_FILE, existing + line);
  } else {
    writeFileSync(SNAPSHOT_FILE, line);
  }

  // Print summary
  console.log(`Flow Snapshot — ${snapshot.date}`);
  console.log("═".repeat(60));
  console.log(`Jobs:     ${snapshot.jobs.total} total, ${snapshot.jobs.active} active, ${snapshot.jobs.embedded} embedded`);
  console.log(`Scope:    global=${snapshot.jobs.scope.global} country_fenced=${snapshot.jobs.scope.country_fenced} region_fenced=${snapshot.jobs.scope.region_fenced} onsite=${snapshot.jobs.scope.onsite} unknown=${snapshot.jobs.scope.unknown}`);
  console.log(`Direct:   remoteok=${snapshot.directIngestion.remoteok} remotive=${snapshot.directIngestion.remotive} himalayas=${snapshot.directIngestion.himalayas} arbeitnow=${snapshot.directIngestion.arbeitnow} wwr=${snapshot.directIngestion.weworkremotely}`);
  console.log(`ATS:      ${snapshot.directIngestion.all_ats} active jobs from ATS poller`);
  console.log(`Queue:    ${snapshot.matchQueue.total} total, ${snapshot.matchQueue.pending} pending, ${snapshot.matchQueue.approved} approved, ${snapshot.matchQueue.rejected} rejected`);
  console.log(`Evaluated: ${snapshot.matchQueue.evaluated_24h} in last 24h`);
  console.log(`Today:    ${snapshot.todayFlow.jobs} jobs ingested, ${snapshot.todayFlow.active} active, ${snapshot.todayFlow.embedded} embedded`);
  console.log(`Personas: ${snapshot.personas.total} total, ${snapshot.personas.embedded} embedded`);
  console.log();
  console.log(`Snapshot appended to ${SNAPSHOT_FILE}`);
}

main().catch(console.error);
