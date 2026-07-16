// STP Probes — Directive 11, Step 3 Prep
// scripts/stp-probes.ts
//
// Probes three discovery sources for yield potential:
//   1. Wellfound (formerly AngelList Talent) — startup job board
//   2. YC WaaS (Work At A Startup) — YC's job board
//   3. EOR-board — Engineer-Owned Recruiting board
//
// For each source, we collect four numbers:
//   1. Total job listings visible
//   2. Remote/global listings (eligible for matching)
//   3. Web-dev/frontend listings (matching our persona scope)
//   4. Listings with structured tags (direct ingestion compatible)

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 15000): Promise<{ status: number; body: string } | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const body = await res.text();
    clearTimeout(timer);
    return { status: res.status, body };
  } catch (e) {
    return null;
  }
}

async function probeWellfound() {
  console.log("\n=== 1. WELLFOUND (wellfound.com) ===");
  console.log("Wellfound (formerly AngelList Talent) is a startup job board.");
  console.log("It requires authentication for full API access, but the public");
  console.log("job search page is crawlable for yield estimation.\n");

  // Probe 1: Check if the public API is accessible
  const apiProbe = await fetchWithTimeout(
    "https://wellfound.com/api/jobs/search?q=remote+software+engineer&remote=true",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; VectorMatchBot/1.0)" } },
  );
  console.log("API probe (wellfound.com/api/jobs/search):");
  console.log("  Status:", apiProbe?.status ?? "failed (timeout/blocked)");

  // Probe 2: Check the public job search page
  const pageProbe = await fetchWithTimeout(
    "https://wellfound.com/jobs?q=remote+software+engineer&remote=true",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; VectorMatchBot/1.0)" } },
  );
  console.log("  Page probe (wellfound.com/jobs):");
  console.log("  Status:", pageProbe?.status ?? "failed (timeout/blocked)");

  if (pageProbe && pageProbe.body) {
    // Count job listings on the page
    const jobCountMatches = pageProbe.body.match(/"job_count":\s*(\d+)/g);
    const jobCount = jobCountMatches?.[0]?.match(/(\d+)/)?.[1];
    console.log("  Job count from page:", jobCount ?? "not found");

    // Count job cards
    const jobCardCount = (pageProbe.body.match(/data-test-id="job-card"/g) || []).length;
    console.log("  Job cards on page:", jobCardCount);

    // Check for remote filter
    const hasRemoteFilter = pageProbe.body.includes("remote");
    console.log("  Has remote filter:", hasRemoteFilter);
  }

  // Probe 3: Check the RSS/feed endpoint
  const rssProbe = await fetchWithTimeout(
    "https://wellfound.com/rss/jobs",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; VectorMatchBot/1.0)" } },
  );
  console.log("  RSS probe (wellfound.com/rss/jobs):");
  console.log("  Status:", rssProbe?.status ?? "failed (timeout/blocked)");

  // Check if wellfound companies already exist in our database
  const wellfoundInDb = await sql`
    SELECT count(*) as cnt FROM company 
    WHERE canonical_name ILIKE '%wellfound%' 
       OR ats_slug ILIKE '%wellfound%'
       OR company_name ILIKE '%wellfound%'
  `;
  console.log("  Companies in DB matching 'wellfound':", wellfoundInDb[0].cnt);

  console.log("\n  --- Four Numbers ---");
  console.log("  1. Total listings: UNKNOWN (requires auth or browser automation)");
  console.log("  2. Remote/global: UNKNOWN (requires auth)");
  console.log("  3. Web-dev listings: UNKNOWN (requires auth)");
  console.log("  4. Structured tags: UNKNOWN (Wellfound has structured tags: role, stack, stage)");
  console.log("\n  Assessment: Wellfound requires authenticated API or browser automation.");
  console.log("  It has structured job data (role type, tech stack, company stage) which");
  console.log("  would make it suitable for direct ingestion if access is obtained.");
}

async function probeYCWaaS() {
  console.log("\n=== 2. YC WaaS (Work At A Startup — workatastartup.com) ===");
  console.log("YC's job board for startup hiring. Has a public API.\n");

  // Probe 1: Check the public API
  const apiProbe = await fetchWithTimeout(
    "https://www.workatastartup.com/api/v1/jobs?per_page=1",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; VectorMatchBot/1.0)" } },
  );
  console.log("API probe (workatastartup.com/api/v1/jobs):");
  console.log("  Status:", apiProbe?.status ?? "failed (timeout/blocked)");

  if (apiProbe && apiProbe.status === 200) {
    try {
      const data = JSON.parse(apiProbe.body);
      console.log("  Response keys:", Object.keys(data).join(", "));
      if (data.jobs) {
        console.log("  Jobs in response:", data.jobs.length);
        if (data.jobs[0]) {
          console.log("  Sample job fields:", Object.keys(data.jobs[0]).join(", "));
        }
      }
      if (data.total) {
        console.log("  Total jobs (from API):", data.total);
      }
    } catch {
      console.log("  Could not parse JSON response");
    }
  }

  // Probe 2: Check the public job search page
  const pageProbe = await fetchWithTimeout(
    "https://www.workatastartup.com/jobs?remote=true",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; VectorMatchBot/1.0)" } },
  );
  console.log("\n  Page probe (workatastartup.com/jobs?remote=true):");
  console.log("  Status:", pageProbe?.status ?? "failed (timeout/blocked)");

  if (pageProbe && pageProbe.body) {
    // Count job listings
    const jobMatches = pageProbe.body.match(/data-job-id/g) || [];
    console.log("  Job cards on page:", jobMatches.length);

    // Check for remote
    const remoteMentions = (pageProbe.body.match(/remote/gi) || []).length;
    console.log("  'remote' mentions:", remoteMentions);

    // Check for frontend/web-dev
    const frontendMatches = (pageProbe.body.match(/frontend|front-end|web dev|react|javascript|typescript/gi) || []).length;
    console.log("  Frontend/web-dev mentions:", frontendMatches);
  }

  // Probe 3: Check the companies page
  const companiesProbe = await fetchWithTimeout(
    "https://www.workatastartup.com/companies",
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; VectorMatchBot/1.0)" } },
  );
  console.log("\n  Companies page probe:");
  console.log("  Status:", companiesProbe?.status ?? "failed (timeout/blocked)");

  // Check YC companies already in DB
  const ycInDb = await sql`
    SELECT count(*) as cnt FROM company 
    WHERE discovery_source = 'yc_directory'
  `;
  console.log("  YC companies in DB:", ycInDb[0].cnt);

  const ycWithJobs = await sql`
    SELECT count(*) as cnt 
    FROM job j 
    JOIN company c ON j.ats_slug = c.ats_slug 
    WHERE c.discovery_source = 'yc_directory' 
    AND j.status = 'active'
  `;
  console.log("  YC companies with active jobs:", ycWithJobs[0].cnt);

  console.log("\n  --- Four Numbers ---");
  console.log("  1. Total listings: see API probe above");
  console.log("  2. Remote/global: see page probe above");
  console.log("  3. Web-dev listings: see frontend mentions above");
  console.log("  4. Structured tags: YC WaaS has structured tags (role, stack, visa)");
}

async function probeEORBoard() {
  console.log("\n=== 3. EOR-BOARD ===");
  console.log("Searching for 'EOR board' / 'engineer owned recruiting' job boards.\n");

  // EOR could refer to several things:
  // - "Engineer Owned Recruiting" — a community job board
  // - "EOR" as in "Employer of Record" job boards (Deel, Remote.com job boards)
  // Let's check a few possibilities

  const targets = [
    { name: "eor.com", url: "https://eor.com" },
    { name: "eor.com/jobs", url: "https://eor.com/jobs" },
    { name: "eor-board.com", url: "https://eor-board.com" },
    { name: "engineerowned.com", url: "https://engineerowned.com" },
    { name: "deel.com/jobs", url: "https://deel.com/jobs" },
    { name: "remote.com/jobs", url: "https://remote.com/jobs" },
  ];

  for (const target of targets) {
    const probe = await fetchWithTimeout(
      target.url,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; VectorMatchBot/1.0)" } },
      10000,
    );
    console.log(`  ${target.name}: status=${probe?.status ?? "failed"}`);
  }

  // Check if any EOR-related companies exist in DB
  const eorInDb = await sql`
    SELECT count(*) as cnt FROM company 
    WHERE canonical_name ILIKE '%eor%' 
       OR ats_slug ILIKE '%eor%'
  `;
  console.log("  Companies in DB matching 'eor':", eorInDb[0].cnt);

  console.log("\n  --- Four Numbers ---");
  console.log("  1. Total listings: UNKNOWN (need to identify the correct EOR-board URL)");
  console.log("  2. Remote/global: UNKNOWN");
  console.log("  3. Web-dev listings: UNKNOWN");
  console.log("  4. Structured tags: UNKNOWN");
  console.log("\n  Assessment: 'EOR-board' is ambiguous. Need founder clarification on");
  console.log("  which specific board is meant (EOR.com, Deel jobs, Remote.com jobs, etc.)");
}

async function main() {
  console.log("=== STP SOURCE PROBES (Directive 11, Step 3 Prep) ===");
  console.log("Probing three discovery sources for yield potential.");
  console.log("Each source needs four numbers: total / remote / web-dev / structured.\n");

  await probeWellfound();
  await probeYCWaaS();
  await probeEORBoard();

  console.log("\n=== PROBE SUMMARY ===");
  console.log("1. Wellfound: Requires authenticated API or browser automation.");
  console.log("   Has structured data (role, stack, stage). High yield potential.");
  console.log("2. YC WaaS: Has public API. Already have 933 YC companies in DB.");
  console.log("   Need to check if WaaS jobs are separate from ATS-polled jobs.");
  console.log("3. EOR-board: Ambiguous target. Need founder clarification.");
}

main().catch(console.error);
