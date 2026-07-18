/**
 * Directive 17 Part D1 — CertStream Discovery Funnel Trace
 *
 * First end-to-end trace of the certstream discovery channel:
 *   domains seen → careers-relevant → slug-resolved → v3-passed → enrollable
 *
 * The certstream detector (dailySourceD6CertStream) runs at 3am and has NEVER
 * been traced discovery→slug→probe→enrollment. This script takes one week of
 * certstream output and walks every entry through the full path.
 *
 * Usage: npx tsx --env-file=.env scripts/d17-certstream-funnel.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

interface CompanyRow {
  id: string;
  ats_slug: string;
  ats_source: string;
  company_name: string | null;
  root_domain: string | null;
  discovery_source: string;
  discovered_at: string;
  discovery_context: string | null;
  tier: string;
  polling_enabled: boolean;
  health: string;
  source_orphaned: boolean | null;
}

interface IngestionLogRow {
  type: string;
  status: string;
  source: string;
  items_processed: number;
  items_inserted: number;
  error_message: string | null;
  created_at: string;
}

interface FunnelReport {
  generatedAt: string;
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  funnel: {
    domainsSeen: number;
    careersRelevant: number;
    slugResolved: number;
    v3Passed: number;
    enrollable: number;
  };
  certstreamCompanies: CompanyRow[];
  ingestionLogs: IngestionLogRow[];
  cronRunning: boolean;
  discoverySourceEnumHasCertstream: boolean;
  seederDiscoverySourceWritten: string;
  findings: string[];
  funnelBreaks: string[];
}

async function main() {
  const windowDays = 7;
  const windowEnd = new Date();
  const windowStart = new Date(
    windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000,
  );

  const findings: string[] = [];
  const funnelBreaks: string[] = [];

  // ── Stage 0: ingestion_log for certstream cron activity ────────────────────
  let ingestionLogs: IngestionLogRow[] = [];
  let cronRunning = false;
  try {
    ingestionLogs = await sql`
      SELECT type, status, source, items_processed, items_inserted, error_message, created_at
      FROM ingestion_log
      WHERE source ILIKE '%certstream%'
        AND created_at >= ${windowStart.toISOString()}
      ORDER BY created_at DESC
    `;
    cronRunning = ingestionLogs.length > 0;
  } catch (err) {
    findings.push(
      `ingestion_log query failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // ── Stage 1: domains seen ──────────────────────────────────────────────────
  // The certstream seeder writes discovery_source = 'hn_algolia' (NOT 'certstream')
  // because the discovery_source enum has no 'certstream' value. The only certstream
  // provenance lives in discovery_context, which is prefixed with "certstream:".
  // So we query two ways: (a) discovery_source containing certstream (expected 0),
  // (b) discovery_context LIKE 'certstream%'.
  const certstreamCompanies: CompanyRow[] = [];
  let byDiscoverySource: CompanyRow[] = [];
  let byDiscoveryContext: CompanyRow[] = [];
  try {
    byDiscoverySource = await sql`
      SELECT id, ats_slug, ats_source, company_name, root_domain,
             discovery_source::text AS discovery_source, discovered_at, discovery_context,
             tier, polling_enabled, health, source_orphaned
      FROM company
      WHERE discovery_source::text ILIKE '%certstream%'
        AND discovered_at >= ${windowStart.toISOString()}
      ORDER BY discovered_at DESC
    `;
  } catch (err) {
    findings.push(
      `company discovery_source query failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    byDiscoveryContext = await sql`
      SELECT id, ats_slug, ats_source, company_name, root_domain,
             discovery_source::text AS discovery_source, discovered_at, discovery_context,
             tier, polling_enabled, health, source_orphaned
      FROM company
      WHERE discovery_context ILIKE 'certstream%'
        AND discovered_at >= ${windowStart.toISOString()}
      ORDER BY discovered_at DESC
    `;
  } catch (err) {
    findings.push(
      `company discovery_context query failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Prefer the discovery_context match (the real certstream provenance). Merge in
  // any discovery_source matches (expected empty) deduped by id.
  const seenIds = new Set<string>();
  for (const row of byDiscoveryContext) {
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id);
      certstreamCompanies.push(row);
    }
  }
  for (const row of byDiscoverySource) {
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id);
      certstreamCompanies.push(row);
    }
  }

  // ── Stage 2: careers-relevant ──────────────────────────────────────────────
  // The certstream seeder ONLY emits domains that already passed the career-page
  // label filter (careers.*, jobs.*, boards.*, etc.) AND matched an ATS CNAME.
  // So every company that made it into the DB from certstream is, by construction,
  // careers-relevant. We count rows whose discovery_context contains a career-page
  // subdomain label.
  const careerLabels = [
    "careers",
    "jobs",
    "boards",
    "apply",
    "hiring",
    "openings",
    "career",
    "job",
    "recruiting",
    "talent",
  ];
  const careersRelevant = certstreamCompanies.filter((c) => {
    const ctx = c.discovery_context ?? "";
    // discovery_context format: "certstream:careers.acme.com→boards.greenhouse.io"
    const domainPart = ctx.replace(/^certstream:/i, "").split("→")[0] ?? "";
    const firstLabel = domainPart.split(".")[0]?.toLowerCase() ?? "";
    return careerLabels.includes(firstLabel);
  });

  // ── Stage 3: slug-resolved ─────────────────────────────────────────────────
  // A company is slug-resolved if it has a non-empty ats_slug AND ats_source is
  // one of the three MVP ATS platforms (greenhouse/lever/ashby). The certstream
  // seeder runs through the Slugger, which sets these on insert.
  const slugAtsSources = new Set(["greenhouse", "lever", "ashby"]);
  const slugResolved = careersRelevant.filter(
    (c) =>
      c.ats_slug && c.ats_slug.length > 0 && slugAtsSources.has(c.ats_source),
  );

  // ── Stage 4: v3-passed (remote_scope fingerprint probe) ────────────────────
  // The v3 fingerprint probe (probeStackProfileV3 in fingerprint-v3.ts) is the
  // remote_scope check. It is DEFINED but NEVER WIRED into the certstream path
  // (or any seeder path) — the slugger only runs countGateZeroJobs (v2-style
  // absolute web-dev count gate), not the v3 remote-scope probe. So no company
  // has a v3-passed flag recorded. We approximate "v3-passed" as companies whose
  // tier is NOT 'dormant'/'dead' (i.e. the quality probe found ≥2 gate-zero jobs,
  // which is the v2 gate that v3 extends). This is a proxy, clearly flagged.
  const v3Passed = slugResolved.filter(
    (c) => c.tier !== "dormant" && c.tier !== "dead",
  );

  // ── Stage 5: enrollable ────────────────────────────────────────────────────
  // Enrollable = polling_enabled = true AND a tier is assigned (tier is notNull
  // by schema, so this reduces to polling_enabled = true).
  const enrollable = v3Passed.filter((c) => c.polling_enabled === true);

  // ── Findings & funnel breaks ───────────────────────────────────────────────
  // Check whether the discovery_source enum even has a 'certstream' value.
  let discoverySourceEnumHasCertstream = false;
  try {
    const enumValues = await sql`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'discovery_source'
    `;
    discoverySourceEnumHasCertstream = enumValues.some(
      (r: { enumlabel: string }) =>
        r.enumlabel.toLowerCase().includes("certstream"),
    );
  } catch (err) {
    findings.push(
      `pg_enum query failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // The seeder hard-codes discoverySource: "hn_algolia" (certstream-processor.ts:335)
  const seederDiscoverySourceWritten = "hn_algolia";

  if (!discoverySourceEnumHasCertstream) {
    funnelBreaks.push(
      "discovery_source enum has NO 'certstream' value — the seeder cannot tag companies as certstream-discovered via discovery_source. It falls back to writing 'hn_algolia' and only records certstream provenance in discovery_context.",
    );
  }
  if (seederDiscoverySourceWritten === "hn_algolia") {
    funnelBreaks.push(
      "certstream-processor.ts:335 hard-codes discoverySource: 'hn_algolia' instead of a certstream source. Querying company by discovery_source ILIKE '%certstream%' returns 0 rows — the certstream channel is invisible in the discovery_source column.",
    );
  }
  if (!cronRunning) {
    funnelBreaks.push(
      `No ingestion_log rows with source ILIKE '%certstream%' in the last ${windowDays} days — the dailySourceD6CertStream cron (3am) does not appear to have run, or it ran but logged under a different source string (the Inngest function uses logSource: 'certstream').`,
    );
  } else {
    // Report per-run totals from the logs
    const totalProcessed = ingestionLogs.reduce(
      (sum, l) => sum + (l.items_processed ?? 0),
      0,
    );
    const totalInserted = ingestionLogs.reduce(
      (sum, l) => sum + (l.items_inserted ?? 0),
      0,
    );
    findings.push(
      `ingestion_log: ${ingestionLogs.length} certstream run(s) in last ${windowDays} days; items_processed=${totalProcessed}, items_inserted=${totalInserted}.`,
    );
    // items_processed maps to r.totalCertificates. If every run reports 0, the
    // CertStream WebSocket collected 0 certificate_update messages in its 60s
    // window — the top of the funnel is empty before any filtering happens.
    const zeroCertRuns = ingestionLogs.filter(
      (l) => (l.items_processed ?? 0) === 0,
    ).length;
    if (zeroCertRuns === ingestionLogs.length && ingestionLogs.length > 0) {
      funnelBreaks.push(
        `All ${ingestionLogs.length} certstream runs reported items_processed=0 (totalCertificates=0). The CertStream WebSocket (wss://certstream.calidog.io/) is collecting 0 certificate_update messages per 60s window — the funnel is empty at the very top, before career-page filtering or CNAME resolution. Likely cause: the WebSocket connects but closes immediately without streaming messages (defaultCollectFromCertStream resolves with an empty array on ws.onclose), or the upstream CertStream service is unavailable. No error is surfaced because onclose is treated as a successful (empty) collection.`,
      );
    }
    // Cron timing observation
    if (ingestionLogs.length > 0) {
      const first = ingestionLogs[ingestionLogs.length - 1].created_at;
      const last = ingestionLogs[0].created_at;
      findings.push(
        `certstream cron observed at ~${new Date(ingestionLogs[0].created_at).toISOString().slice(11, 16)} UTC daily (Inngest cron '0 3 * * *'); first run in window=${first}, last=${last}.`,
      );
    }
  }
  if (certstreamCompanies.length === 0) {
    funnelBreaks.push(
      `Zero companies in the company table with certstream provenance (discovery_context ILIKE 'certstream%') in the last ${windowDays} days. The funnel is empty at the top — either the cron never ran, the WebSocket produced no ATS-CNAME matches, or matches were written under 'hn_algolia' with no 'certstream:' context prefix.`,
    );
  }
  // v3 probe wiring check
  funnelBreaks.push(
    "probeStackProfileV3 (fingerprint-v3.ts:354) is defined but never called anywhere in the codebase. The slugger only runs countGateZeroJobs (v2 absolute web-dev gate). The 'v3-passed' stage is therefore NOT actually executed in the certstream path — the count above is a proxy (non-dormant/non-dead tier).",
  );

  const report: FunnelReport = {
    generatedAt: new Date().toISOString(),
    windowDays,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    funnel: {
      domainsSeen: certstreamCompanies.length,
      careersRelevant: careersRelevant.length,
      slugResolved: slugResolved.length,
      v3Passed: v3Passed.length,
      enrollable: enrollable.length,
    },
    certstreamCompanies,
    ingestionLogs,
    cronRunning,
    discoverySourceEnumHasCertstream,
    seederDiscoverySourceWritten,
    findings,
    funnelBreaks,
  };

  const outPath = "docs/reports/d17-certstream-funnel.json";
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

  // ── Console summary ────────────────────────────────────────────────────────
  console.log("═".repeat(72));
  console.log("Directive 17 Part D1 — CertStream Discovery Funnel Trace");
  console.log("═".repeat(72));
  console.log(
    `Window: ${windowStart.toISOString()} → ${windowEnd.toISOString()}`,
  );
  console.log();
  console.log("FUNNEL (last 7 days):");
  console.log(`  domains seen      : ${report.funnel.domainsSeen}`);
  console.log(`  careers-relevant  : ${report.funnel.careersRelevant}`);
  console.log(`  slug-resolved     : ${report.funnel.slugResolved}`);
  console.log(`  v3-passed (proxy) : ${report.funnel.v3Passed}`);
  console.log(`  enrollable        : ${report.funnel.enrollable}`);
  console.log();
  console.log(`ingestion_log certstream runs : ${ingestionLogs.length}`);
  console.log(
    `discovery_source enum has 'certstream': ${discoverySourceEnumHasCertstream}`,
  );
  console.log(
    `seeder writes discovery_source as     : ${seederDiscoverySourceWritten}`,
  );
  console.log();
  console.log("FUNNEL BREAKS:");
  for (const b of funnelBreaks) console.log(`  • ${b}`);
  if (findings.length > 0) {
    console.log();
    console.log("FINDINGS:");
    for (const f of findings) console.log(`  • ${f}`);
  }
  console.log();
  console.log(`Report written to ${outPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
