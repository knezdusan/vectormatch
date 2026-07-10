/**
 * M3: Never-Polled Hit Rate — Sample Poll 300 wayback_cdx Companies
 *
 * Determines whether the 4,056 never-polled companies are salvageable
 * (cheap corpus win) or mostly dead (L2 is largely duplicative).
 *
 * Strategy:
 *   1. Sample 300 never-polled companies from wayback_cdx (the largest source)
 *   2. Poll each one via its ATS API (greenhouse, lever, ashby, workable, smartrecruiters)
 *   3. Record: HTTP status, job count, error type
 *   4. Report hit rate (% with >= 1 job), yield distribution, dead rate
 *
 * Usage: npx tsx scripts/measure-m3-never-polled-hit-rate.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// ATS endpoint builders (mirrors ats-adapters.ts)
function buildAtsUrl(source: string, slug: string): string | null {
  switch (source) {
    case "greenhouse":
      return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`;
    case "lever":
      return `https://api.lever.co/v0/postings/${slug}?mode=json`;
    case "ashby":
      return `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`;
    case "workable":
      return `https://apply.workable.com/api/v3/accounts/${slug}/jobs?state=published`;
    case "smartrecruiters":
      return `https://api.smartrecruiters.com/v1/companies/${slug}/jobs?limit=100`;
    case "recruitee":
      return `https://api.recruitee.com/c/${slug}/jobs`;
    default:
      return null;
  }
}

// Parse job count from ATS response (lightweight — just count, don't store)
function parseJobCount(source: string, data: any): number {
  try {
    switch (source) {
      case "greenhouse":
        return data.jobs?.length ?? 0;
      case "lever":
        return Array.isArray(data) ? data.length : 0;
      case "ashby":
        return data.jobs?.length ?? 0;
      case "workable":
        return data.jobs?.length ?? 0;
      case "smartrecruiters":
        return data.content?.length ?? 0;
      case "recruitee":
        return data.jobs?.length ?? 0;
      default:
        return 0;
    }
  } catch {
    return 0;
  }
}

async function pollCompany(
  source: string,
  slug: string,
): Promise<{ status: number; jobCount: number; error: string | null }> {
  const url = buildAtsUrl(source, slug);
  if (!url) {
    return { status: 0, jobCount: 0, error: "unsupported ATS source" };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "VectorMatch-Poller/1.0" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return {
        status: response.status,
        jobCount: 0,
        error: `HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as any;
    const jobCount = parseJobCount(source, data);
    return { status: 200, jobCount, error: null };
  } catch (e) {
    return {
      status: 0,
      jobCount: 0,
      error: e instanceof Error ? e.message.substring(0, 60) : String(e),
    };
  }
}

async function main() {
  console.log("=== M3: Never-Polled Hit Rate (Sample 300 wayback_cdx) ===\n");

  // 1. Sample 300 never-polled companies, stratified by ATS source
  const samples = await sql`
    SELECT id, ats_slug, ats_source::text as ats_source, company_name, discovered_at
    FROM company
    WHERE last_polled_at IS NULL
      AND polling_enabled = true
      AND tier = 'probation'::company_tier
      AND ats_slug NOT LIKE '%\\\\%'
      AND ats_slug NOT LIKE '%/%'
      AND length(ats_slug) > 2
      AND ats_slug ~ '^[a-zA-Z0-9-]+$'
    ORDER BY RANDOM()
    LIMIT 300
  `;
  console.log(`Sampled ${samples.length} never-polled companies\n`);

  // Source distribution
  const sourceDist: Record<string, number> = {};
  for (const s of samples) {
    sourceDist[s.ats_source] = (sourceDist[s.ats_source] || 0) + 1;
  }
  console.log("Source distribution:");
  console.table(sourceDist);

  // 2. Poll each company
  console.log("\nPolling 300 companies (10s timeout each)...\n");

  let hitCount = 0; // >= 1 job
  let deadCount = 0; // HTTP 404 or connection error
  let emptyCount = 0; // HTTP 200 but 0 jobs
  let errorCount = 0; // Other errors
  const results: any[] = [];
  const hits: any[] = [];

  for (let i = 0; i < samples.length; i++) {
    const c = samples[i];
    const result = await pollCompany(c.ats_source, c.ats_slug);

    const outcome = result.error
      ? result.status === 404
        ? "dead"
        : "error"
      : result.jobCount > 0
        ? "hit"
        : "empty";

    if (outcome === "hit") {
      hitCount++;
      hits.push({
        slug: c.ats_slug,
        source: c.ats_source,
        jobs: result.jobCount,
      });
    } else if (outcome === "dead") {
      deadCount++;
    } else if (outcome === "empty") {
      emptyCount++;
    } else {
      errorCount++;
    }

    results.push({
      slug: c.ats_slug,
      source: c.ats_source,
      status: result.status,
      jobs: result.jobCount,
      outcome,
      error: result.error,
    });

    // Progress every 50
    if ((i + 1) % 50 === 0) {
      console.log(
        `  [${i + 1}/${samples.length}] hits=${hitCount} dead=${deadCount} empty=${emptyCount} errors=${errorCount}`,
      );
    }

    // Rate limit: 100ms between polls (the bottleneck rate limiter handles per-ATS)
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 3. Results
  const hitRate = (hitCount / samples.length) * 100;
  const deadRate = (deadCount / samples.length) * 100;
  const emptyRate = (emptyCount / samples.length) * 100;

  console.log("\n=== M3 Results ===");
  console.log(`  Total polled: ${samples.length}`);
  console.log(`  Hits (>= 1 job): ${hitCount} (${hitRate.toFixed(1)}%)`);
  console.log(`  Dead (404/error): ${deadCount} (${deadRate.toFixed(1)}%)`);
  console.log(
    `  Empty (200, 0 jobs): ${emptyCount} (${emptyRate.toFixed(1)}%)`,
  );
  console.log(
    `  Other errors: ${errorCount} (${((errorCount / samples.length) * 100).toFixed(1)}%)`,
  );

  // Hit rate by source
  console.log("\n=== Hit Rate by ATS Source ===");
  const bySource: Record<
    string,
    { total: number; hits: number; dead: number; empty: number }
  > = {};
  for (const r of results) {
    if (!bySource[r.source])
      bySource[r.source] = { total: 0, hits: 0, dead: 0, empty: 0 };
    bySource[r.source].total++;
    if (r.outcome === "hit") bySource[r.source].hits++;
    else if (r.outcome === "dead") bySource[r.source].dead++;
    else if (r.outcome === "empty") bySource[r.source].empty++;
  }
  const sourceTable = Object.entries(bySource).map(([source, s]) => ({
    source,
    total: s.total,
    hits: s.hits,
    hit_rate: `${((s.hits / s.total) * 100).toFixed(1)}%`,
    dead: s.dead,
    empty: s.empty,
  }));
  console.table(sourceTable);

  // Top hits
  if (hits.length > 0) {
    console.log("\n=== Top Hits (most jobs) ===");
    hits.sort((a, b) => b.jobs - a.jobs);
    console.table(hits.slice(0, 20));
  }

  // 4. Extrapolation
  console.log("\n=== M3 Extrapolation ===");
  const totalNeverPolled = 4056;
  const extrapolatedHits = Math.round(
    (hitCount / samples.length) * totalNeverPolled,
  );
  const extrapolatedDead = Math.round(
    (deadCount / samples.length) * totalNeverPolled,
  );
  console.log(`  Total never-polled: ${totalNeverPolled}`);
  console.log(
    `  Extrapolated hits (salvageable): ~${extrapolatedHits} companies`,
  );
  console.log(
    `  Extrapolated dead (unsalvageable): ~${extrapolatedDead} companies`,
  );
  console.log(
    `  Conclusion: ${hitRate > 15 ? "L2 is ADDITIVE — significant salvageable corpus" : hitRate > 5 ? "L2 is PARTIALLY ADDITIVE — modest salvageable corpus" : "L2 is largely DUPLICATIVE — most never-polled are dead"}`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("M3 verification failed:", err);
  process.exit(1);
});
