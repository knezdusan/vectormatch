/**
 * ATS-Agnostic Fingerprint (location-filtered)
 *
 * Applies the location filter to the fingerprint + strips the ATS criterion.
 * The target is a company PROFILE (remote-first, modern-tech, AI/dev-tools),
 * not "ashby-hosted." The ATS is a confound — greenhouse/lever are stale, not
 * dead as platforms.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

const FENCING_PATTERNS = [
  /poland/i, /germany/i, /india/i, /ukraine/i, /brazil/i, /pakistan/i,
  /nigeria/i, /serbia/i, /romania/i, /hungary/i, /czech/i, /spain/i,
  /portugal/i, /italy/i, /france/i, /netherlands/i, /belgium/i, /sweden/i,
  /norway/i, /denmark/i, /finland/i, /ireland/i, /greece/i, /bulgaria/i,
  /lithuania/i, /latvia/i, /estonia/i, /mexico/i, /argentina/i, /colombia/i,
  /chile/i, /peru/i, /costa rica/i, /guatemala/i,
  /united kingdom|uk\b|london|manchester|england/i,
  /canada|toronto|vancouver|montreal|ottawa|calgary/i,
  /united states|\busa\b|\bus\b|san francisco|new york|chicago|boston|seattle|austin|denver|remote.*us/i,
  /emea/i, /apac|asia/i, /latam|latin america/i, /europe/i,
  /hong kong/i, /china/i, /philippines/i, /indonesia/i, /turkey/i,
  /egypt/i, /singapore/i, /vietnam/i, /thailand/i, /malaysia/i,
  /japan/i, /korea/i, /taiwan/i, /australia/i, /new zealand/i,
  /south africa/i, /kenya/i, /morocco/i,
  /são paulo/i, /buenos aires/i, /mexico city/i,
  /dublin/i, /berlin/i, /paris/i, /amsterdam/i, /stockholm/i,
  /warsaw/i, /krakow/i, /athens/i, /lisbon/i, /madrid/i,
  /remote.*u\.?s/i, /remote.*canada/i, /remote.*uk/i, /remote.*eu/i,
  /u\.?s\.?\s*remote/i, /remote.*can/i,
];

function isLocationFenced(location: string): boolean {
  if (!location) return false;
  const lower = location.toLowerCase();
  const hasRemoteIndicator = ["remote", "global", "worldwide", "anywhere", "distributed", "work from"].some(ind => lower.includes(ind));
  if (!hasRemoteIndicator) return true;
  return FENCING_PATTERNS.some(p => p.test(lower));
}

const MAINSTACK_KEYWORDS = [
  "react", "nextjs", "typescript", "javascript", "node", "graphql",
  "frontend", "fullstack", "full stack", "full-stack", "web developer",
  "web engineer", "software engineer", "software developer", "engineer",
  "developer", "react native", "lead", "senior", "staff", "principal",
];

async function main() {
  console.log("=== ATS-Agnostic Fingerprint (location-filtered) ===\n");

  const allCompanies = await sql`
    SELECT id, ats_slug, ats_source::text as ats_source, company_name, active_job_count
    FROM company
    WHERE polling_enabled = true AND active_job_count > 0 AND health = 'healthy'
    ORDER BY active_job_count DESC
  `;
  console.log("Total healthy companies with active jobs:", allCompanies.length);

  const addressable: any[] = [];
  let totalChecked = 0;

  for (const c of allCompanies) {
    const jobs = await sql`
      SELECT id, title, location_name, workplace_type
      FROM job WHERE ats_source = ${c.ats_source} AND ats_slug = ${c.ats_slug}
        AND status = 'active'
    `;
    if (jobs.length === 0) continue;
    totalChecked++;

    let addressableJobs = 0;
    let remoteJobs = 0;
    let globalRemoteJobs = 0;
    const locations = new Set<string>();

    for (const j of jobs) {
      const loc = j.location_name || "";
      if (loc) locations.add(loc);

      const w = (j.workplace_type || "").toLowerCase();
      const l = loc.toLowerCase();
      const isRemote = w === "remote" || w === "hybrid" || l.includes("remote");
      const isFenced = isLocationFenced(loc);
      const isMainstream = MAINSTACK_KEYWORDS.some(k => j.title.toLowerCase().includes(k));

      if (isRemote) remoteJobs++;
      if (isRemote && !isFenced) globalRemoteJobs++;
      if (isRemote && !isFenced && isMainstream) addressableJobs++;
    }

    if (addressableJobs > 0) {
      addressable.push({
        slug: c.ats_slug,
        source: c.ats_source,
        name: (c.company_name || c.ats_slug).replace(/&amp;/g, "&").substring(0, 30),
        jobs: jobs.length,
        remote: remoteJobs,
        global_remote: globalRemoteJobs,
        addressable: addressableJobs,
        locations: [...locations].slice(0, 3).join(" | ").substring(0, 50),
        remote_density: jobs.length > 0 ? Math.round((remoteJobs / jobs.length) * 100) + "%" : "0%",
        addr_density: jobs.length > 0 ? Math.round((addressableJobs / jobs.length) * 100) + "%" : "0%",
      });
    }
  }

  console.log("Companies checked:", totalChecked);
  console.log("Addressable companies (location-filtered, ATS-agnostic):", addressable.length, "\n");

  const bySource: Record<string, number> = {};
  for (const a of addressable) {
    bySource[a.source] = (bySource[a.source] || 0) + 1;
  }
  console.log("Per-source breakdown:");
  console.table(Object.entries(bySource).map(([s, c]) => ({ source: s, count: c })));

  console.log("\n=== Validated ATS-Agnostic Fingerprint ===");
  console.table(
    addressable
      .sort((a, b) => b.addressable - a.addressable)
      .map(a => ({
        slug: a.slug.substring(0, 25),
        source: a.source.substring(0, 8),
        name: a.name,
        jobs: a.jobs,
        remote_pct: a.remote_density,
        addr: a.addressable,
        addr_pct: a.addr_density,
        locations: a.locations,
      }))
  );

  console.log("\n=== Fingerprint Characteristics ===");
  console.log("Total addressable companies:", addressable.length);
  console.log("ATS-agnostic: companies from", Object.keys(bySource).length, "sources");
  console.log("Remote-first (>=50% remote):", addressable.filter(a => parseInt(a.remote_density) >= 50).length);
  console.log("High addressable density (>=50%):", addressable.filter(a => parseInt(a.addr_density) >= 50).length);

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
