/**
 * D16 Part C — S4 v2 Search Probe
 *
 * Re-tries the Brave Search discovery channel at its best slice after the
 * D14 0/95 verdict was deemed contaminated (query dilution, stale 404s,
 * probe blindness).
 *
 * Strategy:
 *   - 30 exact-phrase queries × ATS domains (5 phrases × 6 ATS)
 *   - Top 20 results per query (deeper pages — small companies live past p1)
 *   - Exclude known enterprise brands
 *   - For each job-posting-looking URL, extract slug + probe ATS feed
 *   - Count web-dev jobs, count global jobs (classifyRemoteScope)
 *   - Report the TRUE global rate of this slice
 *
 * Usage: npx tsx --env-file=.env scripts/d16-s4-v2-probe.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { neon } from "@neondatabase/serverless";
import { ATS_ENDPOINTS, type AtsSource } from "@/lib/jobs/ats-endpoints";
import {
  extractSlugFromAtsUrl,
  inferAtsSourceFromUrl,
} from "@/lib/jobs/seeders/batch-sources/ats-url-utils";
import { classifyRemoteScope } from "@/lib/jobs/seeders/fingerprint-v3";

// ── Config ───────────────────────────────────────────────────────────────────

const BRAVE_API_KEY =
  process.env.BRAVE_API_KEY ?? process.env.BRAVE_SEARCH_API_KEY;
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const RESULTS_PER_QUERY = 20;
const RATE_LIMIT_MS = 1100; // 1 req/sec + buffer
const ATS_FEED_TIMEOUT_MS = 15000;

const sql = neon(process.env.DATABASE_URL!);

// ── Query matrix ─────────────────────────────────────────────────────────────

const EXACT_PHRASES = [
  "work from anywhere in the world",
  "open to candidates worldwide",
  "remote (worldwide)",
  "fully remote, worldwide",
  "we hire globally",
];

const ATS_DOMAINS: { domain: string; source: AtsSource }[] = [
  { domain: "greenhouse.io", source: "greenhouse" },
  { domain: "lever.co", source: "lever" },
  { domain: "ashbyhq.com", source: "ashby" },
  { domain: "smartrecruiters.com", source: "smartrecruiters" },
  { domain: "workable.com", source: "workable" },
  { domain: "recruitee.com", source: "recruitee" },
];

// Known enterprise brands to exclude (lowercased)
const ENTERPRISE_BRANDS = new Set([
  "google",
  "amazon",
  "microsoft",
  "apple",
  "meta",
  "stripe",
  "coinbase",
  "twilio",
  "shopify",
  "salesforce",
  "adobe",
  "netflix",
  "spotify",
  "uber",
  "airbnb",
  "dropbox",
  "slack",
  "atlassian",
  "github",
  "gitlab",
  "datadog",
  "cloudflare",
  "vercel",
  "mongodb",
]);

// Job-posting URL path indicators
const JOB_PATH_REGEX = /\/(job|jobs|posting|apply)\b/i;

// ── Web-dev detection (mirrors d14-v3-tranche-probe) ─────────────────────────

const WEB_DEV_TITLE_KEYWORDS = [
  "frontend",
  "front-end",
  "front end",
  "fullstack",
  "full-stack",
  "full stack",
  "backend",
  "back-end",
  "back end",
  "web developer",
  "web development",
  "software engineer",
  "software developer",
  "react",
  "vue",
  "angular",
  "svelte",
  "node",
  "javascript",
  "typescript",
  "php",
  "laravel",
  "wordpress",
  "ruby",
  "rails",
  "python",
  "django",
  "flask",
  "ui developer",
  "ux developer",
];

const TAG_REGEX =
  /\b(typescript|javascript|react|nextjs|next\.js|nodejs|node\.js|vue|vuejs|nuxt|express|graphql|tailwindcss|tailwind|svelte|sveltekit|remix|gatsby|astro|solidjs|preact|angular|ember|jquery|vite|webpack|redux|prisma|drizzle|trpc|hono|fastify|koa|nestjs|typeorm|sequelize|mongoose|mongodb|php|laravel|symfony|wordpress|drupal|magento|blade|eloquent|livewire|codeigniter|ruby|rails|sinatra|rspec|sidekiq|python|django|flask|fastapi|celery|pytest|html|css|scss|sass|aws|docker|kubernetes|redis|postgresql|postgres|mysql|sql|go|golang|rust|java|spring|kotlin|csharp|dotnet|\.net|azure|gcp)\b/gi;

function simpleTagScan(text: string): string[] {
  const tags = new Set<string>();
  for (const m of text.matchAll(TAG_REGEX)) {
    tags.add(m[1].toLowerCase().replace(/[.\s]/g, ""));
  }
  return [...tags];
}

const WEB_DEV_TAGS = new Set([
  "typescript",
  "javascript",
  "react",
  "nextjs",
  "nodejs",
  "vue",
  "nuxt",
  "express",
  "graphql",
  "tailwindcss",
  "svelte",
  "sveltekit",
  "remix",
  "gatsby",
  "astro",
  "solidjs",
  "preact",
  "angular",
  "ember",
  "jquery",
  "vite",
  "webpack",
  "redux",
  "prisma",
  "drizzle",
  "trpc",
  "hono",
  "fastify",
  "koa",
  "nestjs",
  "typeorm",
  "sequelize",
  "mongoose",
  "mongodb",
  "php",
  "laravel",
  "symfony",
  "wordpress",
  "drupal",
  "magento",
  "blade",
  "eloquent",
  "livewire",
  "codeigniter",
  "ruby",
  "rails",
  "sinatra",
  "rspec",
  "sidekiq",
  "python",
  "django",
  "flask",
  "fastapi",
  "celery",
  "pytest",
  "html",
  "css",
  "scss",
  "sass",
]);

function isWebDevJob(title: string, tags: string[]): boolean {
  const titleLower = title.toLowerCase();
  if (WEB_DEV_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) {
    return true;
  }
  if (tags.some((t) => WEB_DEV_TAGS.has(t))) {
    return true;
  }
  return false;
}

// ── Types ────────────────────────────────────────────────────────────────────

interface BraveResult {
  url?: string;
  title?: string;
  description?: string;
}

interface QueryResult {
  query: string;
  phrase: string;
  atsDomain: string;
  atsSource: AtsSource;
  resultsCount: number;
  jobPostUrls: number;
  error: string | null;
}

interface CompanyHit {
  url: string;
  company: string;
  atsSource: AtsSource;
  atsDomain: string;
  slug: string;
  phrase: string;
}

interface CompanyProbe {
  slug: string;
  atsSource: AtsSource;
  company: string;
  totalJobs: number;
  webDevJobs: number;
  globalJobs: number;
  globalWebDevJobs: number;
  remoteJobs: number;
  passed: boolean;
  error: string | null;
  sampleTitles: string[];
  discoveredVia: string[];
}

// ── Brave Search ─────────────────────────────────────────────────────────────

async function braveSearch(
  query: string,
): Promise<{ results: BraveResult[]; error: string | null }> {
  const url = new URL(BRAVE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(RESULTS_PER_QUERY));

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url.toString(), {
        headers: {
          Accept: "application/json",
          "X-Subscription-Token": BRAVE_API_KEY!,
        },
        signal: AbortSignal.timeout(20000),
      });

      if (resp.status === 429) {
        // Rate limited — back off
        const backoff = 2000 * (attempt + 1);
        console.log(`  429 rate-limited, backing off ${backoff}ms...`);
        await sleep(backoff);
        continue;
      }

      if (!resp.ok) {
        return { results: [], error: `HTTP ${resp.status}` };
      }

      const data = (await resp.json()) as {
        web?: { results?: BraveResult[] };
      };
      return { results: data.web?.results ?? [], error: null };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      return { results: [], error: msg };
    }
  }
  return { results: [], error: "max retries exceeded" };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Company name extraction from title ───────────────────────────────────────

function extractCompanyFromTitle(title: string): string {
  // Titles often look like "Company Name - Job Title" or "Job Title | Company Name"
  // Try splitting on common separators and pick the shorter segment (usually company)
  const parts = title.split(/\s[-–|]\s/);
  if (parts.length >= 2) {
    // Heuristic: the part that doesn't contain job keywords is the company
    const jobish =
      /(engineer|developer|designer|manager|remote|senior|junior|lead|front|back|full|stack|software)/i;
    const nonJob = parts.find((p) => !jobish.test(p));
    if (nonJob) return nonJob.trim().slice(0, 80);
    return parts[0].trim().slice(0, 80);
  }
  return title.slice(0, 80);
}

function isEnterpriseBrand(company: string): boolean {
  const lower = company.toLowerCase();
  for (const brand of ENTERPRISE_BRANDS) {
    if (lower.includes(brand)) return true;
  }
  return false;
}

// ── ATS feed probing (mirrors d14-v3-tranche-probe) ──────────────────────────

async function fetchAtsFeed(
  slug: string,
  atsSource: AtsSource,
): Promise<{ jobs: any[]; error: string | null }> {
  const config = ATS_ENDPOINTS[atsSource];
  if (!config) {
    return { jobs: [], error: `Unknown ATS source: ${atsSource}` };
  }

  const feedUrl = config.jobsList(slug);
  try {
    const response = await fetch(feedUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(ATS_FEED_TIMEOUT_MS),
    });

    if (!response.ok) {
      return { jobs: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    let jobs: any[] = [];
    if (atsSource === "greenhouse") {
      jobs = data.jobs ?? [];
    } else if (atsSource === "lever") {
      jobs = Array.isArray(data) ? data : [];
    } else if (atsSource === "ashby") {
      jobs = data.postings ?? [];
    } else if (atsSource === "smartrecruiters") {
      jobs = data.content ?? [];
    } else if (atsSource === "workable") {
      jobs = data.jobs ?? data.data ?? [];
    } else if (atsSource === "recruitee") {
      jobs = data.offers ?? [];
    }

    return { jobs, error: null };
  } catch (e) {
    return {
      jobs: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function extractJobFields(
  job: any,
  atsSource: AtsSource,
): {
  title: string;
  description: string;
  location: string;
  workplaceType: "remote" | "hybrid" | "on-site" | null;
} {
  let title = "";
  let description = "";
  let location = "";
  let workplaceType: "remote" | "hybrid" | "on-site" | null = null;

  if (atsSource === "greenhouse") {
    title = job.title ?? "";
    description = job.content ?? "";
    location = job.location?.name ?? "";
    workplaceType = (job.location?.workplace_type as any) ?? null;
  } else if (atsSource === "lever") {
    title = job.text ?? "";
    description = job.descriptionPlain ?? job.description ?? "";
    location = job.categories?.location ?? "";
    workplaceType = (job.workplaceType as any) ?? null;
  } else if (atsSource === "ashby") {
    title = job.title ?? "";
    description = job.descriptionHtml ?? job.description ?? "";
    location = job.locationName ?? "";
    workplaceType = (job.workplaceType as any) ?? null;
  } else if (atsSource === "smartrecruiters") {
    title = job.name ?? job.title ?? "";
    description = job.jobAd?.sections?.jobDescription?.text ?? "";
    location = job.location?.fullLocation ?? job.location?.city ?? "";
    workplaceType = job.location?.remote
      ? "remote"
      : job.location?.hybrid
        ? "hybrid"
        : null;
  } else if (atsSource === "workable") {
    title = job.title ?? "";
    description = job.description ?? job.full_description ?? "";
    const city = job.city ?? "";
    const country = job.country ?? "";
    location = [city, country].filter(Boolean).join(", ");
    workplaceType = job.telecommuting
      ? "remote"
      : ((job.workplace_type as any) ?? null);
  } else if (atsSource === "recruitee") {
    title = job.title ?? "";
    description = job.description ?? "";
    location = job.location ?? "";
    workplaceType = (job.employment_type as any) ?? null;
  }

  return { title, description, location, workplaceType };
}

async function probeCompany(
  slug: string,
  atsSource: AtsSource,
  company: string,
  discoveredVia: string[],
): Promise<CompanyProbe> {
  const { jobs, error } = await fetchAtsFeed(slug, atsSource);

  if (error) {
    return {
      slug,
      atsSource,
      company,
      totalJobs: 0,
      webDevJobs: 0,
      globalJobs: 0,
      globalWebDevJobs: 0,
      remoteJobs: 0,
      passed: false,
      error,
      sampleTitles: [],
      discoveredVia,
    };
  }

  let webDevJobs = 0;
  let globalJobs = 0;
  let globalWebDevJobs = 0;
  let remoteJobs = 0;
  const sampleTitles: string[] = [];

  for (const job of jobs) {
    const { title, description, location, workplaceType } = extractJobFields(
      job,
      atsSource,
    );

    const tags = simpleTagScan(`${title} ${description}`);
    const isWebDev = isWebDevJob(title, tags);

    const scope = classifyRemoteScope(
      workplaceType ?? null,
      location || null,
      atsSource,
    );

    const isRemote =
      scope === "global" ||
      scope === "country_fenced" ||
      scope === "region_fenced";
    const isGlobal = scope === "global";

    if (isWebDev) {
      webDevJobs++;
      if (isGlobal) {
        globalWebDevJobs++;
      }
      if (sampleTitles.length < 3) {
        sampleTitles.push(title.slice(0, 60));
      }
    }

    if (isGlobal) {
      globalJobs++;
    }
    if (isRemote) {
      remoteJobs++;
    }
  }

  return {
    slug,
    atsSource,
    company,
    totalJobs: jobs.length,
    webDevJobs,
    globalJobs,
    globalWebDevJobs,
    remoteJobs,
    passed: webDevJobs >= 2,
    error: null,
    sampleTitles,
    discoveredVia,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(80));
  console.log("  D16 Part C — S4 v2 Search Probe (30 queries × 20 results)");
  console.log("  5 exact phrases × 6 ATS domains");
  console.log("═".repeat(80));
  console.log();

  if (!BRAVE_API_KEY) {
    console.error(
      "FATAL: BRAVE_API_KEY (or BRAVE_SEARCH_API_KEY) not set in env",
    );
    process.exit(1);
  }

  // Build 30 queries
  const queries: {
    phrase: string;
    atsDomain: string;
    atsSource: AtsSource;
    query: string;
  }[] = [];
  for (const phrase of EXACT_PHRASES) {
    for (const ats of ATS_DOMAINS) {
      queries.push({
        phrase,
        atsDomain: ats.domain,
        atsSource: ats.source,
        query: `"${phrase}" site:${ats.domain}`,
      });
    }
  }

  console.log(`Total queries: ${queries.length}`);
  console.log(`Results per query: ${RESULTS_PER_QUERY}`);
  console.log(`Rate limit: ${RATE_LIMIT_MS}ms between queries`);
  console.log();

  // ── Phase 1: Brave Search ──────────────────────────────────────────────────
  const queryResults: QueryResult[] = [];
  const companyHits: CompanyHit[] = [];
  const seenCompanies = new Map<
    string,
    CompanyHit & { phrases: Set<string> }
  >();

  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    process.stdout.write(
      `  [${String(i + 1).padStart(2)}/${queries.length}] "${q.phrase}" × ${q.atsDomain}`,
    );

    const { results, error } = await braveSearch(q.query);

    if (error) {
      console.log(`  ERROR: ${error}`);
      queryResults.push({
        query: q.query,
        phrase: q.phrase,
        atsDomain: q.atsDomain,
        atsSource: q.atsSource,
        resultsCount: 0,
        jobPostUrls: 0,
        error,
      });
    } else {
      // Filter: exclude enterprise brands, keep job-posting-looking URLs
      let jobPostCount = 0;
      for (const r of results) {
        const url = r.url ?? "";
        if (!url) continue;

        // Infer ATS source from URL (handles hosted subdomains)
        const inferredSource = inferAtsSourceFromUrl(url);
        if (!inferredSource) continue;

        const company = extractCompanyFromTitle(r.title ?? "");
        if (isEnterpriseBrand(company)) continue;

        // Must look like a job posting
        if (!JOB_PATH_REGEX.test(url)) continue;

        const slug = extractSlugFromAtsUrl(url, inferredSource);
        if (!slug) continue;

        jobPostCount++;

        const key = `${inferredSource}:${slug}`;
        const existing = seenCompanies.get(key);
        if (existing) {
          existing.phrases.add(q.phrase);
        } else {
          seenCompanies.set(key, {
            url,
            company,
            atsSource: inferredSource,
            atsDomain: q.atsDomain,
            slug,
            phrase: q.phrase,
            phrases: new Set([q.phrase]),
          });
          companyHits.push({
            url,
            company,
            atsSource: inferredSource,
            atsDomain: q.atsDomain,
            slug,
            phrase: q.phrase,
          });
        }
      }

      console.log(`  ${results.length} results, ${jobPostCount} job-post URLs`);
      queryResults.push({
        query: q.query,
        phrase: q.phrase,
        atsDomain: q.atsDomain,
        atsSource: q.atsSource,
        resultsCount: results.length,
        jobPostUrls: jobPostCount,
        error: null,
      });
    }

    // Rate limit
    if (i < queries.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  console.log();
  console.log("─".repeat(80));
  console.log(`  Phase 1 complete: ${queryResults.length} queries executed`);
  console.log(
    `  Total results: ${queryResults.reduce((s, r) => s + r.resultsCount, 0)}`,
  );
  console.log(`  Unique companies found: ${seenCompanies.size}`);
  console.log();

  // ── Phase 2: ATS feed probing ──────────────────────────────────────────────
  console.log("─".repeat(80));
  console.log("  Phase 2: Probing ATS feeds for unique companies");
  console.log("─".repeat(80));
  console.log();

  const uniqueCompanies = [...seenCompanies.values()];
  const probes: CompanyProbe[] = [];

  for (let i = 0; i < uniqueCompanies.length; i++) {
    const c = uniqueCompanies[i];
    process.stdout.write(
      `  [${String(i + 1).padStart(3)}/${uniqueCompanies.length}] ${c.slug.padEnd(30)} (${c.atsSource})`,
    );

    const probe = await probeCompany(c.slug, c.atsSource, c.company, [
      ...c.phrases,
    ]);
    probes.push(probe);

    if (probe.error) {
      console.log(`  ERROR: ${probe.error}`);
    } else {
      console.log(
        `  total=${String(probe.totalJobs).padStart(3)} webDev=${String(probe.webDevJobs).padStart(3)} global=${String(probe.globalJobs).padStart(3)} gwDev=${String(probe.globalWebDevJobs).padStart(3)}`,
      );
    }

    // Light rate limit on ATS feeds
    if (i < uniqueCompanies.length - 1) {
      await sleep(400);
    }
  }

  console.log();

  // ── Phase 3: Report ────────────────────────────────────────────────────────
  const totalQueries = queryResults.length;
  const totalResults = queryResults.reduce((s, r) => s + r.resultsCount, 0);
  const uniqueCompaniesCount = seenCompanies.size;
  const companiesWithGe2WebDev = probes.filter(
    (p) => !p.error && p.webDevJobs >= 2,
  ).length;
  const companiesWithGe1Global = probes.filter(
    (p) => !p.error && p.globalJobs >= 1,
  ).length;
  const probedSuccessfully = probes.filter((p) => !p.error);
  const totalGlobalJobs = probedSuccessfully.reduce(
    (s, p) => s + p.globalJobs,
    0,
  );
  const totalJobs = probedSuccessfully.reduce((s, p) => s + p.totalJobs, 0);
  const trueGlobalRate = totalJobs > 0 ? totalGlobalJobs / totalJobs : 0;

  console.log("═".repeat(80));
  console.log("  D16 S4 v2 PROBE — FINAL REPORT");
  console.log("═".repeat(80));
  console.log();
  console.log(`  Total queries:                  ${totalQueries}`);
  console.log(`  Total results (Brave):          ${totalResults}`);
  console.log(`  Unique companies found:         ${uniqueCompaniesCount}`);
  console.log(`  Companies with ≥2 web-dev jobs: ${companiesWithGe2WebDev}`);
  console.log(`  Companies with ≥1 global job:   ${companiesWithGe1Global}`);
  console.log(
    `  TRUE global rate (jobs):         ${(trueGlobalRate * 100).toFixed(2)}%  (${totalGlobalJobs}/${totalJobs})`,
  );
  console.log();

  // Top companies by global web-dev yield
  const ranked = probedSuccessfully
    .filter((p) => p.webDevJobs >= 2)
    .sort((a, b) => b.globalWebDevJobs - a.globalWebDevJobs);

  if (ranked.length > 0) {
    console.log("─".repeat(80));
    console.log("  TOP COMPANIES (≥2 web-dev, ranked by global web-dev yield)");
    console.log("─".repeat(80));
    console.log(
      "  Rank | Slug                           | ATS            | Total | WebDev | Global | GWDev | Company",
    );
    console.log("  " + "-".repeat(110));
    for (let i = 0; i < Math.min(ranked.length, 25); i++) {
      const r = ranked[i];
      console.log(
        `  ${String(i + 1).padStart(4)} | ${r.slug.padEnd(30)} | ${r.atsSource.padEnd(14)} | ${String(r.totalJobs).padStart(5)} | ${String(r.webDevJobs).padStart(6)} | ${String(r.globalJobs).padStart(6)} | ${String(r.globalWebDevJobs).padStart(5)} | ${r.company.slice(0, 30)}`,
      );
    }
    console.log();
  }

  // Errored probes
  const errored = probes.filter((p) => p.error);
  if (errored.length > 0) {
    console.log("─".repeat(80));
    console.log("  ERRORED ATS FEEDS");
    console.log("─".repeat(80));
    for (const r of errored) {
      console.log(
        `  ${r.slug.padEnd(30)} | ${r.atsSource.padEnd(14)} | ${r.error}`,
      );
    }
    console.log();
  }

  // ── Write JSON output ──────────────────────────────────────────────────────
  const reportPath = "docs/reports/d16-s4-v2-probe.json";
  const output = {
    timestamp: new Date().toISOString(),
    directive: "D16-PartC",
    summary: {
      totalQueries,
      totalResults,
      uniqueCompaniesFound: uniqueCompaniesCount,
      companiesWithGe2WebDev,
      companiesWithGe1Global,
      trueGlobalRate: Number((trueGlobalRate * 100).toFixed(2)),
      totalGlobalJobs,
      totalJobsProbed: totalJobs,
    },
    phrases: EXACT_PHRASES,
    atsDomains: ATS_DOMAINS.map((a) => a.domain),
    enterpriseBrandsExcluded: [...ENTERPRISE_BRANDS],
    queryResults,
    companies: probes.map((p) => ({
      ...p,
      discoveredVia: p.discoveredVia,
    })),
  };

  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(output, null, 2));
  console.log(`Written: ${reportPath}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
