/**
 * D14 JOB 4 — v3 Tranche Probe
 *
 * Probes all 95 D13 tranche candidates' ATS feeds, counts web-dev roles,
 * gates ≥2 web-dev roles, ranks by addressable-global yield, outputs top-25
 * for Dux signature.
 *
 * Usage: npx tsx scripts/d14-v3-tranche-probe.ts
 */
import { neon } from "@neondatabase/serverless";
import { ATS_ENDPOINTS, type AtsSource } from "@/lib/jobs/ats-endpoints";
import { classifyRemoteScope } from "@/lib/jobs/seeders/fingerprint-v3";

const sql = neon(process.env.DATABASE_URL!);

interface TrancheCandidate {
  slug: string;
  atsSource: AtsSource;
  priority: number;
  alreadyEnrolled: boolean;
  existingJobCount: number;
  existingGlobalJobCount: number;
  estimatedCost: number;
}

interface ProbeResult {
  slug: string;
  atsSource: AtsSource;
  totalJobs: number;
  webDevJobs: number;
  globalJobs: number;
  globalWebDevJobs: number;
  remoteJobs: number;
  passed: boolean;
  error: string | null;
  sampleTitles: string[];
}

// Web-dev title keywords (case-insensitive)
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

// Web-dev tag families
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
  "backbone",
  "jquery",
  "vite",
  "webpack",
  "babel",
  "esbuild",
  "rollup",
  "parcel",
  "redux",
  "mobx",
  "zustand",
  "recoil",
  "tanstack",
  "react-query",
  "prisma",
  "drizzle",
  "trpc",
  "hono",
  "elysia",
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
  "composer",
  "artisan",
  "blade",
  "eloquent",
  "livewire",
  "inertia",
  "codeigniter",
  "yii",
  "cakephp",
  "fuelphp",
  "slim",
  "ruby",
  "rails",
  "sinatra",
  "hanami",
  "padrino",
  "roda",
  "rspec",
  "minitest",
  "capybara",
  "sidekiq",
  "resque",
  "python",
  "django",
  "flask",
  "fastapi",
  "tornado",
  "aiohttp",
  "asyncio",
  "celery",
  "pytest",
  "html",
  "css",
  "scss",
  "sass",
  "less",
]);

function isWebDevJob(title: string, tags: string[]): boolean {
  const titleLower = title.toLowerCase();

  // Check title keywords
  if (WEB_DEV_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw))) {
    return true;
  }

  // Check tags
  if (tags.some((t) => WEB_DEV_TAGS.has(t.toLowerCase()))) {
    return true;
  }

  return false;
}

async function fetchAtsFeed(
  slug: string,
  atsSource: AtsSource,
): Promise<{ jobs: any[]; error: string | null }> {
  const config = ATS_ENDPOINTS[atsSource];
  if (!config) {
    return { jobs: [], error: `Unknown ATS source: ${atsSource}` };
  }

  const url = config.jobsList(slug);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { jobs: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json();

    // Normalize different ATS response shapes
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
      // Workable widget API returns { jobs: [...] } or { data: [...] }
      jobs = data.jobs ?? data.data ?? [];
    } else if (atsSource === "recruitee") {
      // Recruitee returns { offers: [...] }
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
  workplaceType: string | null;
} {
  let title = "";
  let description = "";
  let location = "";
  let workplaceType: string | null = null;

  if (atsSource === "greenhouse") {
    title = job.title ?? "";
    description = job.content ?? "";
    location = job.location?.name ?? "";
    workplaceType = job.location?.workplace_type ?? null;
  } else if (atsSource === "lever") {
    title = job.text ?? "";
    description = job.descriptionPlain ?? job.description ?? "";
    location = job.categories?.location ?? "";
    workplaceType = job.workplaceType ?? null;
  } else if (atsSource === "ashby") {
    title = job.title ?? "";
    description = job.descriptionHtml ?? job.description ?? "";
    location = job.locationName ?? "";
    workplaceType = job.workplaceType ?? null;
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
    // Workable widget API: telecommuting (bool), country, city, locations[]
    const city = job.city ?? "";
    const country = job.country ?? "";
    location = [city, country].filter(Boolean).join(", ");
    workplaceType = job.telecommuting ? "remote" : (job.workplace_type ?? null);
  } else if (atsSource === "recruitee") {
    title = job.title ?? "";
    description = job.description ?? "";
    location = job.location ?? "";
    workplaceType = job.employment_type ?? null;
  }

  return { title, description, location, workplaceType };
}

async function probeCandidate(
  candidate: TrancheCandidate,
): Promise<ProbeResult> {
  const { jobs, error } = await fetchAtsFeed(
    candidate.slug,
    candidate.atsSource,
  );

  if (error) {
    return {
      slug: candidate.slug,
      atsSource: candidate.atsSource,
      totalJobs: 0,
      webDevJobs: 0,
      globalJobs: 0,
      globalWebDevJobs: 0,
      remoteJobs: 0,
      passed: false,
      error,
      sampleTitles: [],
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
      candidate.atsSource,
    );

    // Extract tags — inline simple regex scan (avoid server-only import)
    const tags = simpleTagScan(`${title} ${description}`);
    const isWebDev = isWebDevJob(title, tags);

    // Determine remote scope (deterministic, no LLM — uses fingerprint-v3)
    const scope = classifyRemoteScope(
      (workplaceType as "remote" | "hybrid" | "on-site" | null) ?? null,
      location || null,
      candidate.atsSource,
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
    slug: candidate.slug,
    atsSource: candidate.atsSource,
    totalJobs: jobs.length,
    webDevJobs,
    globalJobs,
    globalWebDevJobs,
    remoteJobs,
    passed: webDevJobs >= 2,
    error: null,
    sampleTitles,
  };
}

// Inline simple tag scanner — avoids the server-only import in job-normalizer.
// Covers the most common web-dev tags for the gating decision.
const TAG_REGEX =
  /\b(typescript|javascript|react|nextjs|next\.js|nodejs|node\.js|vue|vuejs|nuxt|express|graphql|tailwindcss|tailwind|svelte|sveltekit|remix|gatsby|astro|solidjs|preact|angular|ember|jquery|vite|webpack|redux|prisma|drizzle|trpc|hono|fastify|koa|nestjs|typeorm|sequelize|mongoose|mongodb|php|laravel|symfony|wordpress|drupal|magento|blade|eloquent|livewire|codeigniter|ruby|rails|sinatra|rspec|sidekiq|python|django|flask|fastapi|celery|pytest|html|css|scss|sass|aws|docker|kubernetes|redis|postgresql|postgres|mysql|sql|go|golang|rust|java|spring|kotlin|csharp|dotnet|\.net|azure|gcp)\b/gi;

function simpleTagScan(text: string): string[] {
  const matches = text.matchAll(TAG_REGEX);
  const tags = new Set<string>();
  for (const m of matches) {
    tags.add(m[1].toLowerCase().replace(/[.\s]/g, ""));
  }
  return [...tags];
}

async function main() {
  console.log("═".repeat(80));
  console.log("  D14 JOB 4 — v3 Tranche Probe (95 candidates)");
  console.log("═".repeat(80));
  console.log();

  // Load tranche
  const fs = await import("fs");
  const trancheData = JSON.parse(
    fs.readFileSync("docs/reports/d13-enrollment-tranche.json", "utf-8"),
  );
  const candidates: TrancheCandidate[] = trancheData.candidates;

  console.log(`Loaded ${candidates.length} candidates`);
  console.log();

  // Probe each candidate (with concurrency limit)
  const CONCURRENCY = 10;
  const results: ProbeResult[] = [];

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(probeCandidate));
    results.push(...batchResults);

    const progress = Math.min(i + CONCURRENCY, candidates.length);
    process.stdout.write(`\rProbing: ${progress}/${candidates.length}`);
  }
  console.log("\n");

  // Sort by globalWebDevJobs descending
  results.sort((a, b) => b.globalWebDevJobs - a.globalWebDevJobs);

  // Summary
  const passed = results.filter((r) => r.passed);
  const failed = results.filter((r) => !r.passed && !r.error);
  const errored = results.filter((r) => r.error);

  console.log("═══ SUMMARY ═══");
  console.log(`Total candidates: ${results.length}`);
  console.log(`Passed (≥2 web-dev): ${passed.length}`);
  console.log(`Failed (<2 web-dev): ${failed.length}`);
  console.log(`Errored: ${errored.length}`);
  console.log();

  // Top 25 for Dux
  console.log("═══ TOP 25 (by global web-dev yield) ═══\n");
  const top25 = passed.slice(0, 25);
  console.log(
    "Rank | Slug                           | ATS            | Total | WebDev | Global | GWDev | Sample Title",
  );
  console.log("-".repeat(120));

  for (let i = 0; i < top25.length; i++) {
    const r = top25[i];
    console.log(
      `${String(i + 1).padStart(4)} | ${r.slug.padEnd(30)} | ${r.atsSource.padEnd(14)} | ${String(r.totalJobs).padStart(5)} | ${String(r.webDevJobs).padStart(6)} | ${String(r.globalJobs).padStart(6)} | ${String(r.globalWebDevJobs).padStart(5)} | ${r.sampleTitles[0] ?? ""}`,
    );
  }

  // Errored candidates
  if (errored.length > 0) {
    console.log();
    console.log("═══ ERRORED CANDIDATES ═══\n");
    for (const r of errored) {
      console.log(
        `  ${r.slug.padEnd(30)} | ${r.atsSource.padEnd(14)} | ${r.error}`,
      );
    }
  }

  // Failed candidates (probed but <2 web-dev)
  if (failed.length > 0) {
    console.log();
    console.log("═══ FAILED GATE (<2 web-dev) ═══\n");
    for (const r of failed) {
      console.log(
        `  ${r.slug.padEnd(30)} | ${r.atsSource.padEnd(14)} | total=${r.totalJobs} webDev=${r.webDevJobs}`,
      );
    }
  }

  // Write JSON output
  const output = {
    timestamp: new Date().toISOString(),
    totalCandidates: results.length,
    passed: passed.length,
    failed: failed.length,
    errored: errored.length,
    top25: top25.map((r, i) => ({
      rank: i + 1,
      ...r,
    })),
    allResults: results,
  };

  fs.writeFileSync(
    "docs/reports/d14-v3-tranche-probe.json",
    JSON.stringify(output, null, 2),
  );
  console.log();
  console.log("Written: docs/reports/d14-v3-tranche-probe.json");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
