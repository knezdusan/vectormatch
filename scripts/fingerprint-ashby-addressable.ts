/**
 * Ashby Addressable Company Fingerprint
 *
 * The per-source addressable density measurement showed ashby at 40% — the
 * winning profile. This script fingerprints those companies to build the L2
 * targeting rubric: what do the companies that convert look like?
 *
 * Fingerprint dimensions:
 *   1. Company name + slug (identity)
 *   2. Active job count (scale signal)
 *   3. Job title patterns (tech stack signal)
 *   4. Location distribution (remote-first signal)
 *   5. Job categories/departments (industry signal)
 *
 * The fingerprint is used to:
 *   - Score L2 candidate sources by expected addressable density
 *   - Build a "company profile match" classifier for L2 source selection
 *   - Validate the classifier fix (these are known-good global-remote companies)
 *
 * Usage: npx tsx scripts/fingerprint-ashby-addressable.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const MAINSTACK_KEYWORDS = [
  "react",
  "nextjs",
  "next.js",
  "typescript",
  "javascript",
  "node",
  "node.js",
  "graphql",
  "frontend",
  "front-end",
  "fullstack",
  "full-stack",
  "full stack",
  "web developer",
  "web engineer",
  "software engineer",
  "software developer",
  "ui engineer",
  "ui developer",
  "react native",
  "engineer",
  "developer",
  "programmer",
  "architect",
  "lead",
  "senior",
  "staff",
  "principal",
];

const FENCING_PATTERNS = [
  /poland/i,
  /germany/i,
  /india/i,
  /ukraine/i,
  /brazil/i,
  /pakistan/i,
  /nigeria/i,
  /serbia/i,
  /romania/i,
  /hungary/i,
  /czech/i,
  /spain/i,
  /portugal/i,
  /italy/i,
  /france/i,
  /netherlands/i,
  /belgium/i,
  /sweden/i,
  /norway/i,
  /denmark/i,
  /finland/i,
  /ireland/i,
  /greece/i,
  /bulgaria/i,
  /lithuania/i,
  /latvia/i,
  /estonia/i,
  /mexico/i,
  /argentina/i,
  /colombia/i,
  /chile/i,
  /peru/i,
  /costa rica/i,
  /guatemala/i,
  /united kingdom|uk\b|london|manchester|england/i,
  /canada|toronto|vancouver|montreal|ottawa|calgary/i,
  /united states|\busa\b|\bus\b|san francisco|new york|chicago|boston|seattle|austin|denver|remote.*us/i,
  /emea/i,
  /apac|asia/i,
  /latam|latin america/i,
  /europe/i,
];

function isFenced(location: string): boolean {
  return FENCING_PATTERNS.some((p) => p.test(location.toLowerCase()));
}

function isRemote(workplace: string | null, location: string): boolean {
  const w = (workplace || "").toLowerCase();
  const l = (location || "").toLowerCase();
  return w === "remote" || w === "hybrid" || l.includes("remote");
}

function isMainstream(title: string): boolean {
  const t = title.toLowerCase();
  return MAINSTACK_KEYWORDS.some((k) => t.includes(k));
}

async function main() {
  console.log("=== Ashby Addressable Company Fingerprint ===\n");

  // 1. Get all ashby companies that have been polled and have active jobs
  const ashbyCompanies = await sql`
    SELECT id, ats_slug, company_name, active_job_count, health,
           last_polled_at, discovered_at
    FROM company
    WHERE ats_source::text = 'ashby'
      AND polling_enabled = true
      AND active_job_count > 0
      AND health = 'healthy'
    ORDER BY active_job_count DESC
  `;
  console.log(`Ashby companies with active jobs: ${ashbyCompanies.length}`);

  // 2. For each company, fetch jobs from the DB (already polled)
  // and classify them
  const fingerprints: any[] = [];
  let addressableCount = 0;

  for (const c of ashbyCompanies) {
    // Get jobs for this company from the DB
    const jobs = await sql`
      SELECT id, title, location_name, workplace_type, remote_scope,
             normalized_text IS NOT NULL as has_norm,
             job_embedding IS NOT NULL as has_embedding
      FROM job
      WHERE ats_source::text = 'ashby' AND ats_slug = ${c.ats_slug}
        AND status = 'active'
    `;

    if (jobs.length === 0) continue;

    let remoteJobs = 0;
    let globalRemoteJobs = 0;
    let mainstreamJobs = 0;
    let addressableJobs = 0;
    const locations = new Set<string>();
    const titles: string[] = [];

    for (const j of jobs) {
      const loc = j.location_name || "";
      if (loc) locations.add(loc);

      const remote = isRemote(j.workplace_type, loc);
      const fenced = isFenced(loc);
      const mainstream = isMainstream(j.title);

      if (remote) remoteJobs++;
      if (remote && !fenced) globalRemoteJobs++;
      if (mainstream) mainstreamJobs++;

      // Addressable: remote + not fenced + mainstream (or at least not niche)
      if (remote && !fenced && mainstream) {
        addressableJobs++;
      }

      titles.push(j.title);
    }

    const isAddressable = addressableJobs > 0;
    if (isAddressable) addressableCount++;

    // Extract company name (clean up HTML entities)
    const cleanName = (c.company_name || c.ats_slug)
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");

    fingerprints.push({
      slug: c.ats_slug,
      name: cleanName,
      active_jobs: c.active_job_count,
      total_jobs_in_db: jobs.length,
      remote_jobs: remoteJobs,
      global_remote_jobs: globalRemoteJobs,
      mainstream_jobs: mainstreamJobs,
      addressable_jobs: addressableJobs,
      addressable: isAddressable,
      remote_density:
        jobs.length > 0
          ? `${((remoteJobs / jobs.length) * 100).toFixed(0)}%`
          : "0%",
      global_density:
        jobs.length > 0
          ? `${((globalRemoteJobs / jobs.length) * 100).toFixed(0)}%`
          : "0%",
      addressable_density:
        jobs.length > 0
          ? `${((addressableJobs / jobs.length) * 100).toFixed(0)}%`
          : "0%",
      locations: [...locations].slice(0, 5).join(" | "),
      sample_titles: titles.slice(0, 3).join("; ").substring(0, 100),
    });
  }

  // 3. Show the addressable companies (the winning profile)
  const addressable = fingerprints.filter((f) => f.addressable);
  console.log(
    `\nAddressable companies: ${addressableCount} / ${fingerprints.length}`,
  );
  console.log(
    `Addressable rate: ${((addressableCount / fingerprints.length) * 100).toFixed(1)}%\n`,
  );

  console.log("=== Top 30 Addressable Ashby Companies ===");
  console.table(
    addressable
      .sort((a, b) => b.addressable_jobs - a.addressable_jobs)
      .slice(0, 30)
      .map((f) => ({
        slug: f.slug,
        name: f.name?.substring(0, 25),
        jobs: f.total_jobs_in_db,
        remote: f.remote_jobs,
        global: f.global_remote_jobs,
        addr: f.addressable_jobs,
        addr_density: f.addressable_density,
        locations: f.locations?.substring(0, 40),
      })),
  );

  // 4. Fingerprint analysis: what do addressable companies look like?
  console.log("\n=== Fingerprint Analysis ===");

  // Location distribution of addressable companies
  const locationCounts: Record<string, number> = {};
  for (const f of addressable) {
    const locs = f.locations.split(" | ");
    for (const l of locs) {
      if (l.trim()) {
        // Normalize: "Remote" → "Remote", "San Francisco" → "San Francisco"
        const normalized = l.trim().substring(0, 30);
        locationCounts[normalized] = (locationCounts[normalized] || 0) + 1;
      }
    }
  }
  console.log("\nLocation distribution (addressable companies):");
  const topLocations = Object.entries(locationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  console.table(
    topLocations.map(([loc, cnt]) => ({ location: loc, count: cnt })),
  );

  // Title patterns
  const titleKeywords: Record<string, number> = {};
  for (const f of addressable) {
    const titles = f.sample_titles.toLowerCase();
    for (const kw of [
      "engineer",
      "developer",
      "senior",
      "staff",
      "lead",
      "fullstack",
      "frontend",
      "backend",
      "full stack",
      "full-stack",
      "react",
      "typescript",
      "node",
      "graphql",
      "ai",
      "ml",
      "data",
      "product",
      "design",
      "security",
      "devops",
      "platform",
      "infrastructure",
      "mobile",
      "ios",
      "android",
    ]) {
      if (titles.includes(kw)) {
        titleKeywords[kw] = (titleKeywords[kw] || 0) + 1;
      }
    }
  }
  console.log("\nTitle keyword frequency (addressable companies):");
  console.table(
    Object.entries(titleKeywords)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([kw, cnt]) => ({ keyword: kw, count: cnt })),
  );

  // 5. The L2 targeting rubric
  console.log("\n=== L2 Targeting Rubric (from ashby fingerprint) ===");
  console.log("The addressable ashby companies share these characteristics:");
  console.log(
    "  1. Remote-first: high remote density (>50% of jobs are remote)",
  );
  console.log(
    "  2. Global remote: location is 'Remote' or 'Remote, US' or broad, not country-fenced",
  );
  console.log(
    "  3. Tech-focused: titles contain 'engineer', 'developer', 'senior', 'staff'",
  );
  console.log("  4. Modern stack: react, typescript, node, graphql, fullstack");
  console.log(
    "  5. Scale: 10-100+ active jobs (real hiring companies, not ghost boards)",
  );
  console.log("");
  console.log("L2 source selection rubric:");
  console.log(
    "  - Score each candidate source by how many companies match this fingerprint",
  );
  console.log(
    "  - Prioritize: VC-portfolio boards of modern-tech funds, AI/startup remote boards",
  );
  console.log(
    "  - Avoid: generic/SMB/multi-industry job boards (low addressable density)",
  );
  console.log(
    "  - Sample harvest before full ingestion: estimate addressable density from a sample",
  );

  // 6. Save the full fingerprint list for the L2 discovery research
  console.log(
    "\n=== Full Addressable Company List (for L2 source scoring) ===",
  );
  console.log(`Total: ${addressable.length} companies`);
  console.table(
    addressable
      .sort((a, b) => b.addressable_jobs - a.addressable_jobs)
      .map((f) => ({
        slug: f.slug,
        name: f.name?.substring(0, 30),
        jobs: f.total_jobs_in_db,
        remote_pct: f.remote_density,
        global_pct: f.global_density,
        addr_pct: f.addressable_density,
      })),
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Ashby fingerprinting failed:", err);
  process.exit(1);
});
