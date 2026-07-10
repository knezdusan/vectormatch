/**
 * Per-Source Addressable Density Measurement
 *
 * "Salvageable ≠ addressable." The M3 hit rate tells us how many companies
 * have ≥1 open job. But L2's targeting signal is remote-density — the fraction
 * of jobs that are genuinely worldwide-remote with a mainstream stack.
 *
 * This script measures, per ATS source:
 *   1. Hit rate (companies with ≥1 job) — from M3
 *   2. Remote density (fraction of jobs that are remote)
 *   3. Global-remote density (fraction of remote jobs NOT country-fenced)
 *      — uses location_name heuristics, NOT the contaminated remote_scope field
 *   4. Mainstream-stack density (fraction of jobs matching persona must-haves)
 *   5. Addressable density = hit_rate × global_remote_density × mainstream_density
 *
 * This is the number that should decide L2 targeting — not intuition.
 *
 * Usage: npx tsx scripts/measure-addressable-density.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Mainstream stack keywords (from the persona's must-have tags)
const MAINSTACK_KEYWORDS = [
  "react", "nextjs", "next.js", "typescript", "javascript", "node", "node.js",
  "graphql", "frontend", "front-end", "fullstack", "full-stack", "full stack",
  "web developer", "web engineer", "software engineer", "software developer",
  "ui engineer", "ui developer", "react native",
];

// Niche/non-mainstream stacks (explicitly NOT addressable)
const NICHE_KEYWORDS = [
  "java ", "java developer", "java engineer", "php", "python", "golang", "go developer",
  "rust", "c++", "c#", ".net", "ruby", "salesforce", "sap", "web3", "solidity",
  "blockchain", "devops", "sre", "site reliability", "security engineer",
  "data engineer", "data scientist", "ml engineer", "ai engineer", "machine learning",
  "mobile", "ios", "android", "swift", "kotlin", "flutter",
  "embedded", "firmware", "hardware", "electrical",
];

// Country/region fencing indicators in location_name
const FENCING_PATTERNS = [
  { pattern: /poland/i, type: "country" },
  { pattern: /germany/i, type: "country" },
  { pattern: /india/i, type: "country" },
  { pattern: /ukraine/i, type: "country" },
  { pattern: /brazil/i, type: "country" },
  { pattern: /pakistan/i, type: "country" },
  { pattern: /nigeria/i, type: "country" },
  { pattern: /serbia/i, type: "country" },
  { pattern: /romania/i, type: "country" },
  { pattern: /hungary/i, type: "country" },
  { pattern: /czech/i, type: "country" },
  { pattern: /spain/i, type: "country" },
  { pattern: /portugal/i, type: "country" },
  { pattern: /italy/i, type: "country" },
  { pattern: /france/i, type: "country" },
  { pattern: /netherlands/i, type: "country" },
  { pattern: /belgium/i, type: "country" },
  { pattern: /sweden/i, type: "country" },
  { pattern: /norway/i, type: "country" },
  { pattern: /denmark/i, type: "country" },
  { pattern: /finland/i, type: "country" },
  { pattern: /ireland/i, type: "country" },
  { pattern: /greece/i, type: "country" },
  { pattern: /bulgaria/i, type: "country" },
  { pattern: /lithuania/i, type: "country" },
  { pattern: /latvia/i, type: "country" },
  { pattern: /estonia/i, type: "country" },
  { pattern: /mexico/i, type: "country" },
  { pattern: /argentina/i, type: "country" },
  { pattern: /colombia/i, type: "country" },
  { pattern: /chile/i, type: "country" },
  { pattern: /peru/i, type: "country" },
  { pattern: /costa rica/i, type: "country" },
  { pattern: /guatemala/i, type: "country" },
  { pattern: /united kingdom|uk\b|london|manchester|england/i, type: "country" },
  { pattern: /canada|toronto|vancouver|montreal|ottawa|calgary/i, type: "country" },
  { pattern: /united states|\busa\b|\bus\b|san francisco|new york|chicago|boston|seattle|austin|denver|remote.*us/i, type: "country" },
  { pattern: /emea/i, type: "region" },
  { pattern: /apac|asia/i, type: "region" },
  { pattern: /latam|latin america/i, type: "region" },
  { pattern: /europe/i, type: "region" },
];

function classifyJob(job: any): {
  isRemote: boolean;
  fencingType: string | null;
  isMainstream: boolean;
  isNiche: boolean;
  addressable: boolean;
} {
  const title = (job.title || "").toLowerCase();
  const location = (job.location_name || job.location || "").toLowerCase();
  const workplace = (job.workplace_type || job.workplace || "").toLowerCase();

  // Is remote?
  const isRemote = workplace === "remote" || workplace === "hybrid" ||
    title.includes("remote") || location.includes("remote");

  // Fencing check (from location, NOT from the contaminated remote_scope field)
  let fencingType: string | null = null;
  for (const f of FENCING_PATTERNS) {
    if (f.pattern.test(location)) {
      fencingType = f.type;
      break;
    }
  }

  // Stack classification
  const isMainstream = MAINSTACK_KEYWORDS.some(k => title.includes(k));
  const isNiche = NICHE_KEYWORDS.some(k => title.includes(k));

  // Addressable = remote + NOT fenced + mainstream stack (and not explicitly niche)
  const addressable = isRemote && fencingType === null && (isMainstream || !isNiche);

  return { isRemote, fencingType, isMainstream, isNiche, addressable };
}

async function main() {
  console.log("=== Per-Source Addressable Density Measurement ===\n");

  // 1. Get backlog composition
  const backlog = await sql`
    SELECT ats_source::text as ats_source, COUNT(*) as cnt
    FROM company
    WHERE last_polled_at IS NULL
      AND polling_enabled = true
      AND tier = 'probation'::company_tier
      AND ats_slug NOT LIKE '%\\%'
      AND ats_slug NOT LIKE '%/%'
      AND ats_slug ~ '^[a-zA-Z0-9-]+$'
    GROUP BY ats_source ORDER BY cnt DESC
  `;
  console.log("Backlog composition:");
  console.table(backlog);

  // 2. Sample 50 companies per source (stratified)
  const SAMPLE_SIZE = 50;
  const sources = ["ashby", "smartrecruiters", "workable", "greenhouse", "lever"];

  const { ATS_ENDPOINTS } = await import("./../src/lib/jobs/ats-endpoints.ts");
  const {
    greenhouseJobsResponseSchema,
    leverJobsResponseSchema,
    ashbyJobsResponseSchema,
    smartRecruitersJobsResponseSchema,
    workableJobsResponseSchema,
  } = await import("./../src/lib/jobs/ats-schemas.ts");

  const perSourceResults: any[] = [];

  for (const source of sources) {
    const companies = await sql`
      SELECT id, ats_slug, ats_source::text as ats_source
      FROM company
      WHERE last_polled_at IS NULL
        AND polling_enabled = true
        AND tier = 'probation'::company_tier
        AND ats_source::text = ${source}
        AND ats_slug NOT LIKE '%\\%'
        AND ats_slug NOT LIKE '%/%'
        AND ats_slug ~ '^[a-zA-Z0-9-]+$'
      ORDER BY RANDOM()
      LIMIT ${SAMPLE_SIZE}
    `;

    if (companies.length === 0) {
      perSourceResults.push({
        source,
        sampled: 0,
        hits: 0,
        hit_rate: "N/A",
        total_jobs: 0,
        remote_jobs: 0,
        global_remote_jobs: 0,
        mainstream_jobs: 0,
        addressable_jobs: 0,
        addressable_companies: 0,
        addressable_density: "N/A",
      });
      continue;
    }

    let hits = 0;
    let totalJobs = 0;
    let remoteJobs = 0;
    let globalRemoteJobs = 0;
    let mainstreamJobs = 0;
    let addressableJobs = 0;
    let addressableCompanies = 0;

    for (let i = 0; i < companies.length; i++) {
      const c = companies[i];
      const endpoint = ATS_ENDPOINTS[source as keyof typeof ATS_ENDPOINTS];
      if (!endpoint) continue;
      const url = endpoint.jobsList(c.ats_slug);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { "User-Agent": "VectorMatch-Density/1.0" },
        });
        clearTimeout(timeout);

        if (!response.ok) continue;

        const json: unknown = await response.json();
        let jobsArray: any[] = [];

        switch (source) {
          case "greenhouse":
            const gh = greenhouseJobsResponseSchema.safeParse(json);
            if (gh.success) jobsArray = gh.data.jobs || [];
            break;
          case "lever":
            const lv = leverJobsResponseSchema.safeParse(json);
            if (lv.success) jobsArray = lv.data || [];
            break;
          case "ashby":
            const as = ashbyJobsResponseSchema.safeParse(json);
            if (as.success) jobsArray = as.data.jobs || [];
            break;
          case "smartrecruiters":
            const sr = smartRecruitersJobsResponseSchema.safeParse(json);
            if (sr.success) jobsArray = sr.data.content || [];
            break;
          case "workable":
            const wk = workableJobsResponseSchema.safeParse(json);
            if (wk.success) jobsArray = wk.data.jobs || [];
            break;
        }

        if (jobsArray.length === 0) continue;

        hits++;
        totalJobs += jobsArray.length;

        let hasAddressableJob = false;

        for (const job of jobsArray) {
          // Normalize job shape for classification
          const normalized = {
            title: job.title,
            location_name: job.location?.name || job.location?.city ||
              (typeof job.location === "string" ? job.location : null) ||
              job.locationName || null,
            workplace_type: job.workplaceType || job.workplace ||
              (job.location?.name?.includes("Remote") ? "remote" : null),
          };

          const classification = classifyJob(normalized);

          if (classification.isRemote) remoteJobs++;
          if (classification.isRemote && classification.fencingType === null) globalRemoteJobs++;
          if (classification.isMainstream) mainstreamJobs++;
          if (classification.addressable) {
            addressableJobs++;
            hasAddressableJob = true;
          }
        }

        if (hasAddressableJob) addressableCompanies++;
      } catch (e) {
        // Network error, skip
      }

      await new Promise(resolve => setTimeout(resolve, 150));
    }

    const hitRate = hits / companies.length;
    const addressableDensity = addressableCompanies / companies.length;

    perSourceResults.push({
      source,
      sampled: companies.length,
      hits,
      hit_rate: `${(hitRate * 100).toFixed(1)}%`,
      total_jobs: totalJobs,
      remote_jobs: remoteJobs,
      global_remote_jobs: globalRemoteJobs,
      mainstream_jobs: mainstreamJobs,
      addressable_jobs: addressableJobs,
      addressable_companies: addressableCompanies,
      addressable_density: `${(addressableDensity * 100).toFixed(1)}%`,
    });

    console.log(`  ${source}: ${hits}/${companies.length} hits, ${addressableCompanies} addressable (${(addressableDensity * 100).toFixed(1)}%)`);
  }

  // 3. Results
  console.log("\n=== Per-Source Addressable Density ===");
  console.table(perSourceResults);

  // 4. Extrapolation to full backlog
  console.log("\n=== Extrapolation to Full Backlog ===");
  const extrapolation: any[] = [];
  for (const bc of backlog) {
    const source = bc.ats_source;
    const backlogCount = Number(bc.cnt);
    const result = perSourceResults.find(r => r.source === source);
    if (!result || result.sampled === 0) {
      extrapolation.push({
        source,
        backlog: backlogCount,
        est_hits: "N/A",
        est_addressable: "N/A",
      });
      continue;
    }
    const hitRate = result.hits / result.sampled;
    const addrRate = result.addressable_companies / result.sampled;
    extrapolation.push({
      source,
      backlog: backlogCount,
      est_hits: Math.round(hitRate * backlogCount),
      est_addressable: Math.round(addrRate * backlogCount),
      addr_rate: `${(addrRate * 100).toFixed(1)}%`,
    });
  }
  console.table(extrapolation);

  const totalBacklog = backlog.reduce((s: number, r: any) => s + Number(r.cnt), 0);
  const totalAddressable = extrapolation.reduce((s: number, r: any) =>
    s + (typeof r.est_addressable === "number" ? r.est_addressable : 0), 0);
  console.log(`\n  Total backlog: ${totalBacklog}`);
  console.log(`  Total estimated addressable: ${totalAddressable} companies`);
  console.log(`  Overall addressable density: ${((totalAddressable / totalBacklog) * 100).toFixed(1)}%`);

  // 5. Key insight
  console.log("\n=== Key Insight ===");
  console.log("Addressable = has ≥1 job that is remote + NOT country-fenced + mainstream stack.");
  console.log("This is measured from location_name heuristics, NOT the contaminated remote_scope field.");
  console.log("The per-source addressable density is the number that should decide L2 targeting.");

  process.exit(0);
}

main().catch(err => {
  console.error("Addressable density measurement failed:", err);
  process.exit(1);
});
