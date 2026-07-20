/**
 * D20 JOB 1.3: Backfill stranded direct-ingestion jobs through the production
 * gate router.
 *
 * Finds direct-ingestion jobs that are:
 *  - active
 *  - embedded (job_embedding IS NOT NULL)
 *  - global (remote_scope = 'global' or 'country_fenced')
 *  - unfenced (COALESCE(is_fenced, false) = false)
 *  - have NO match_queue entries (the gate router never ran)
 *
 * Emits `job/ingested` events for each one to the PRODUCTION Inngest endpoint,
 * which triggers the production `jobInngedHandler` → D18 route-only recovery
 * path → `runGateSQLRouter` (the real gate-1-2.ts, not a stripped copy) →
 * `match/gate-3-evaluate` fan-out.
 *
 * Idempotent: match_queue has UNIQUE(job_id, persona_id), so re-running won't
 * create duplicates. The jobInngedHandler idempotency guard also skips jobs
 * that already have match_queue entries.
 *
 * Usage:
 *   INNGEST_EVENT_KEY=<prod_key> npx tsx scripts/d20-backfill-stranded-direct-jobs.ts
 *
 * Or if .env has the prod key:
 *   npx tsx scripts/d20-backfill-stranded-direct-jobs.ts
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "../src/db/db";
import { job } from "../src/db/schemas/jobs/job";

const PROD_INNGEST_URL = "https://inngest.vectormatch.dev";
const DIRECT_SOURCES = [
  "weworkremotely",
  "remoteok_direct",
  "remotive",
  "larajobs",
];

async function main() {
  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey || eventKey === "dev-dummy-key") {
    console.error(
      "FAIL: INNGEST_EVENT_KEY not set or is dev dummy. Set the production key:",
      "INNGEST_EVENT_KEY=<prod_key> npx tsx scripts/d20-backfill-stranded-direct-jobs.ts",
    );
    process.exit(1);
  }

  const sourceList = DIRECT_SOURCES.map((s) => `'${s}'`).join(", ");

  // Find stranded jobs
  const stranded = await db.execute(sql`
    SELECT
      j.id,
      j.title,
      j.ats_source,
      j.remote_scope,
      j.location_name
    FROM job j
    LEFT JOIN match_queue mq ON mq.job_id = j.id
    WHERE j.ats_source IN (${sql.raw(sourceList)})
      AND j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.remote_scope IN ('global', 'country_fenced')
      AND COALESCE(j.is_fenced, false) = false
      AND mq.id IS NULL
    ORDER BY j.ats_source, j.title
  `);

  const rows = stranded.rows as Array<{
    id: string;
    title: string;
    ats_source: string;
    remote_scope: string;
    location_name: string | null;
  }>;

  console.log(
    `\nFound ${rows.length} stranded direct-ingestion jobs to route.\n`,
  );

  if (rows.length === 0) {
    console.log("Nothing to backfill. Exiting.");
    process.exit(0);
  }

  // Emit job/ingested events to production Inngest
  // Inngest event API: POST /e/{key} with body = JSON array of events
  // (NOT wrapped in { events: [...] } — the SDK sends a raw array)
  // Each event needs: id (unique), name, data, ts (timestamp)
  const now = Date.now();
  const events = rows.map((r) => ({
    id: `d20-backfill-${r.id}-${now}`,
    name: "job/ingested",
    ts: now,
    data: {
      jobId: r.id,
      atsSource: r.ats_source,
      atsSlug: r.ats_source,
      isNew: false, // not new — historical backfill
      backfillSource: "d20-job-1-3",
    },
  }));

  console.log(
    `Emitting ${events.length} job/ingested events to ${PROD_INNGEST_URL}...`,
  );

  // Send in batches of 50 to avoid request size limits
  const BATCH_SIZE = 50;
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(events.length / BATCH_SIZE);

    console.log(`  Batch ${batchNum}/${totalBatches}: ${batch.length} events`);

    const resp = await fetch(`${PROD_INNGEST_URL}/e/${eventKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Inngest expects a raw JSON array of events, not { events: [...] }
      body: JSON.stringify(batch),
    });

    if (resp.ok) {
      const body = await resp.text();
      console.log(`    OK (${resp.status}): ${body.slice(0, 100)}`);
      sent += batch.length;
    } else {
      const body = await resp.text();
      console.error(`    FAIL (${resp.status}): ${body.slice(0, 200)}`);
      failed += batch.length;
    }
  }

  console.log(`\nDone. Sent: ${sent}, Failed: ${failed}`);
  console.log("\nStranded jobs routed (by source):");
  const bySource = new Map<string, number>();
  for (const r of rows) {
    bySource.set(r.ats_source, (bySource.get(r.ats_source) ?? 0) + 1);
  }
  for (const [source, count] of bySource) {
    console.log(`  ${source.padEnd(22)} ${count}`);
  }

  console.log("\nNext steps:");
  console.log(
    "  1. Wait 2-5 minutes for jobInngedHandler to process the events",
  );
  console.log("  2. Check match_queue for new entries from these jobs");
  console.log("  3. Check Inngest dashboard for jobInngedHandler run status");
  console.log(
    "  4. Run scripts/d20-quantify-stranded-supply.ts to verify 0 stranded",
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("FAIL:", e);
  process.exit(1);
});
