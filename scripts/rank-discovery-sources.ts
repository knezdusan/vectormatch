/**
 * Census-Ranked Candidate-Source Population
 *
 * Ranks ALL discovery sources by aggregate ADDRESSABLE yield:
 *   addressable_yield = volume × genuine_global_rate
 *
 * "Volume" = total jobs discovered via this source that reached the pool.
 * "Genuine-global rate" = fraction of those jobs that are status='active'
 *   AND remote_scope='global' (the v_addressable_pool definition).
 * "Addressable yield" = volume × global_rate = the count of genuinely
 *   global-remote jobs this source has contributed to the matchable pool.
 *
 * This is the number that should decide L2 targeting — not headline job
 * counts (4 Day Week's 19k → 1.3% global was the trap).
 *
 * The script also includes CANDIDATE sources (not yet enrolled) with
 * estimated yields from research, marked as "estimated" in the output.
 *
 * Usage: npx tsx scripts/rank-discovery-sources.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// ── Candidate sources (not yet enrolled, estimated yields) ──────────────────
// These are sources identified in the L2 mandate that haven't been enrolled yet.
// Yields are estimates from research, not measured data.

interface CandidateSource {
  source: string;
  type: "ats_poller" | "direct_board" | "discovery" | "candidate";
  estVolume: string;
  estGlobalRate: string;
  estAddressable: string;
  notes: string;
}

const CANDIDATE_SOURCES: CandidateSource[] = [
  {
    source: "getro (tech-dense VC networks)",
    type: "candidate",
    estVolume: "50-200 companies/network",
    estGlobalRate: "30-60% resolve to ATS",
    estAddressable: "15-120 companies/network",
    notes:
      "Primary L2 mechanism. Needs GETRO_API_KEY from Dux. Tech-dense networks (S32, HV Capital) resolve better than non-profit ones.",
  },
  {
    source: "crunchbase (funding data)",
    type: "candidate",
    estVolume: "10-50 startups/day (funding RSS)",
    estGlobalRate: "unknown — needs test",
    estAddressable: "unknown",
    notes:
      "Competitive intel: Remote Rocketship likely sources from here. API key required for full data; RSS feeds are free but limited.",
  },
  {
    source: "censys (CT-log alternative)",
    type: "candidate",
    estVolume: "300-1000 companies (historical)",
    estGlobalRate: "same as crt.sh (ATS-hosted = tech companies)",
    estAddressable: "similar to crt.sh",
    notes:
      "Fallback if crt.sh rate-limits. Censys has a free tier with API access for CT log data.",
  },
];

async function main() {
  console.log("═".repeat(80));
  console.log(
    "  DISCOVERY SOURCE CENSUS — Ranked by Aggregate Addressable Yield",
  );
  console.log("═".repeat(80));
  console.log();

  // ── Part 1: Enrolled sources (measured from DB) ──────────────────────────
  // Single efficient query: join company → job, group by discovery_source.
  const rows = await sql`
    SELECT
      c.discovery_source::text AS source,
      COUNT(DISTINCT c.id) AS companies_discovered,
      COUNT(DISTINCT c.id) FILTER (WHERE c.tier != 'dead') AS companies_active,
      COUNT(j.id) AS total_jobs,
      COUNT(j.id) FILTER (WHERE j.status = 'active') AS active_jobs,
      COUNT(j.id) FILTER (
        WHERE j.status = 'active' AND j.remote_scope = 'global'
      ) AS global_active_jobs,
      COUNT(j.id) FILTER (
        WHERE j.status = 'active' AND j.remote_scope = 'global' AND j.job_embedding IS NOT NULL
      ) AS addressable_jobs,
      ROUND(
        COUNT(j.id) FILTER (WHERE j.status = 'active' AND j.remote_scope = 'global')
        ::numeric / NULLIF(COUNT(j.id) FILTER (WHERE j.status = 'active'), 0) * 100,
        1
      ) AS global_rate_pct
    FROM company c
    LEFT JOIN job j ON j.ats_source::text = c.ats_source::text AND j.ats_slug = c.ats_slug
    WHERE c.discovery_source IS NOT NULL
    GROUP BY c.discovery_source::text
    ORDER BY COUNT(j.id) FILTER (
      WHERE j.status = 'active' AND j.remote_scope = 'global'
    ) DESC NULLS LAST
  `;

  console.log("─".repeat(80));
  console.log("  ENROLLED SOURCES (measured from production data)");
  console.log("─".repeat(80));
  console.log();

  const header =
    "Source".padEnd(22) +
    "Cos".padStart(5) +
    "Active".padStart(7) +
    "Jobs".padStart(7) +
    "Active".padStart(7) +
    "Global".padStart(7) +
    "Addrbl".padStart(7) +
    "G%".padStart(6);
  console.log(header);
  console.log("─".repeat(header.length));

  let totalAddressable = 0;
  for (const row of rows) {
    const globalRate = row.global_rate_pct ?? "0.0";
    console.log(
      (row.source ?? "null").slice(0, 21).padEnd(22) +
        String(row.companies_discovered).padStart(5) +
        String(row.companies_active).padStart(7) +
        String(row.total_jobs).padStart(7) +
        String(row.active_jobs).padStart(7) +
        String(row.global_active_jobs).padStart(7) +
        String(row.addressable_jobs).padStart(7) +
        `${globalRate}%`.padStart(6),
    );
    totalAddressable += Number(row.addressable_jobs ?? 0);
  }

  console.log("─".repeat(header.length));
  console.log(
    `Total addressable (embedded global-active): ${totalAddressable}`,
  );
  console.log();

  // ── Part 2: ATS poller sources (not discovery sources, but the delivery layer) ─
  const atsRows = await sql`
    SELECT
      j.ats_source AS source,
      COUNT(DISTINCT j.ats_slug) AS companies,
      COUNT(j.id) AS total_jobs,
      COUNT(j.id) FILTER (WHERE j.status = 'active') AS active_jobs,
      COUNT(j.id) FILTER (
        WHERE j.status = 'active' AND j.remote_scope = 'global'
      ) AS global_active_jobs,
      COUNT(j.id) FILTER (
        WHERE j.status = 'active' AND j.remote_scope = 'global' AND j.job_embedding IS NOT NULL
      ) AS addressable_jobs,
      ROUND(
        COUNT(j.id) FILTER (WHERE j.status = 'active' AND j.remote_scope = 'global')
        ::numeric / NULLIF(COUNT(j.id) FILTER (WHERE j.status = 'active'), 0) * 100,
        1
      ) AS global_rate_pct
    FROM job j
    WHERE j.ats_source IN ('greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee')
    GROUP BY j.ats_source
    ORDER BY COUNT(j.id) FILTER (
      WHERE j.status = 'active' AND j.remote_scope = 'global'
    ) DESC
  `;

  console.log("─".repeat(80));
  console.log(
    "  ATS POLLER SOURCES (the delivery layer — all discovery feeds here)",
  );
  console.log("─".repeat(80));
  console.log();

  const atsHeader =
    "ATS Source".padEnd(18) +
    "Cos".padStart(5) +
    "Jobs".padStart(7) +
    "Active".padStart(7) +
    "Global".padStart(7) +
    "Addrbl".padStart(7) +
    "G%".padStart(6);
  console.log(atsHeader);
  console.log("─".repeat(atsHeader.length));

  for (const row of atsRows) {
    const globalRate = row.global_rate_pct ?? "0.0";
    console.log(
      String(row.source).slice(0, 17).padEnd(18) +
        String(row.companies).padStart(5) +
        String(row.total_jobs).padStart(7) +
        String(row.active_jobs).padStart(7) +
        String(row.global_active_jobs).padStart(7) +
        String(row.addressable_jobs).padStart(7) +
        `${globalRate}%`.padStart(6),
    );
  }
  console.log();

  // ── Part 3: Direct-ingestion boards ──────────────────────────────────────
  const directRows = await sql`
    SELECT
      j.ats_source AS source,
      COUNT(j.id) AS total_jobs,
      COUNT(j.id) FILTER (WHERE j.status = 'active') AS active_jobs,
      COUNT(j.id) FILTER (
        WHERE j.status = 'active' AND j.remote_scope = 'global'
      ) AS global_active_jobs,
      COUNT(j.id) FILTER (
        WHERE j.status = 'active' AND j.remote_scope = 'global' AND j.job_embedding IS NOT NULL
      ) AS addressable_jobs,
      ROUND(
        COUNT(j.id) FILTER (WHERE j.status = 'active' AND j.remote_scope = 'global')
        ::numeric / NULLIF(COUNT(j.id) FILTER (WHERE j.status = 'active'), 0) * 100,
        1
      ) AS global_rate_pct
    FROM job j
    WHERE j.ats_source LIKE '%_direct' OR j.ats_source IN ('himalayas', 'remoteok', 'arbeitnow', 'remotive', 'weworkremotely')
    GROUP BY j.ats_source
    ORDER BY COUNT(j.id) FILTER (
      WHERE j.status = 'active' AND j.remote_scope = 'global'
    ) DESC
  `;

  if (directRows.length > 0) {
    console.log("─".repeat(80));
    console.log("  DIRECT-INGESTION BOARDS");
    console.log("─".repeat(80));
    console.log();

    const directHeader =
      "Board".padEnd(22) +
      "Jobs".padStart(7) +
      "Active".padStart(7) +
      "Global".padStart(7) +
      "Addrbl".padStart(7) +
      "G%".padStart(6);
    console.log(directHeader);
    console.log("─".repeat(directHeader.length));

    for (const row of directRows) {
      const globalRate = row.global_rate_pct ?? "0.0";
      console.log(
        String(row.source).slice(0, 21).padEnd(22) +
          String(row.total_jobs).padStart(7) +
          String(row.active_jobs).padStart(7) +
          String(row.global_active_jobs).padStart(7) +
          String(row.addressable_jobs).padStart(7) +
          `${globalRate}%`.padStart(6),
      );
    }
    console.log();
  }

  // ── Part 4: Candidate sources (not yet enrolled) ─────────────────────────
  console.log("─".repeat(80));
  console.log("  CANDIDATE SOURCES (not yet enrolled — estimated yields)");
  console.log("─".repeat(80));
  console.log();

  for (const c of CANDIDATE_SOURCES) {
    console.log(`  ${c.source}`);
    console.log(`    Type:          ${c.type}`);
    console.log(`    Est. volume:   ${c.estVolume}`);
    console.log(`    Est. global%:  ${c.estGlobalRate}`);
    console.log(`    Est. addressable: ${c.estAddressable}`);
    console.log(`    Notes:         ${c.notes}`);
    console.log();
  }

  // ── Part 5: Summary ranking ──────────────────────────────────────────────
  console.log("═".repeat(80));
  console.log("  SUMMARY: Sources ranked by addressable jobs (enrolled only)");
  console.log("═".repeat(80));
  console.log();

  const ranked = [...rows]
    .sort(
      (a, b) =>
        Number(b.addressable_jobs ?? 0) - Number(a.addressable_jobs ?? 0),
    )
    .filter((r) => Number(r.addressable_jobs ?? 0) > 0);

  if (ranked.length === 0) {
    console.log(
      "  No enrolled sources have addressable jobs. Pipeline may be degraded.",
    );
  } else {
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      const pct =
        totalAddressable > 0
          ? ((Number(r.addressable_jobs) / totalAddressable) * 100).toFixed(1)
          : "0.0";
      console.log(
        `  ${String(i + 1).padStart(2)}. ${(r.source ?? "null").padEnd(22)} ` +
          `${String(r.addressable_jobs).padStart(4)} addressable jobs ` +
          `(${pct}% of total)`,
      );
    }
  }
  console.log();
  console.log("═".repeat(80));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
