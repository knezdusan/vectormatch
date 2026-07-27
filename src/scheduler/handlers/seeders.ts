// D27: Seeder & discovery handlers for pg-boss scheduler
// src/scheduler/handlers/seeders.ts
//
// All daily/batch source seeders migrated from Inngest. Each uses the
// pg-boss-compatible runSourceFunction helper (circuit-breaker + storage
// checks + ingestion logging).

import { writeIngestionLog } from "@/lib/jobs/poller/ingestion-log";
import { scheduler } from "../scheduler";
import { runSourceFunction } from "../source-helpers";

// ── Batch sources (B1-B10) ──────────────────────────────────────────────────

export async function runBatchSourceB1Workable(): Promise<void> {
  const { runWorkableMetaSearch } = await import(
    "@/lib/jobs/seeders/batch-sources/workable-meta-search"
  );
  await runSourceFunction({
    sourceName: "batch-source-workable-meta-search",
    logSource: "workable_meta_search",
    checkStorage: true,
    execute: () => runWorkableMetaSearch(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalJobsFound ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });
}

export async function runBatchSourceB2BraveSearch(): Promise<void> {
  const { runBraveSearchBatch } = await import(
    "@/lib/jobs/seeders/batch-sources/brave-search"
  );
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return;
  await runSourceFunction({
    sourceName: "batch-source-brave-search",
    logSource: "brave_search",
    checkStorage: true,
    execute: () => runBraveSearchBatch({ apiKey }),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalResultsFound ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });
}

export async function runBatchSourceB3YcDirectory(): Promise<void> {
  const { runYcDirectorySeeder } = await import(
    "@/lib/jobs/seeders/batch-sources/yc-directory"
  );
  await runSourceFunction({
    sourceName: "batch-source-yc-directory",
    logSource: "yc_directory",
    checkStorage: true,
    execute: () => runYcDirectorySeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalHiringCompanies ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runBatchSourceB4VcPortfolios(): Promise<void> {
  const { runVcPortfolioSeeder } = await import(
    "@/lib/jobs/seeders/batch-sources/vc-portfolios"
  );
  await runSourceFunction({
    sourceName: "batch-source-vc-portfolios",
    logSource: "vc_portfolio",
    checkStorage: true,
    execute: () => runVcPortfolioSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalCompaniesExtracted ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.pagesFailed ?? 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runBatchSourceB5NewsletterArchives(): Promise<void> {
  const { runNewsletterArchiveSeeder } = await import(
    "@/lib/jobs/seeders/batch-sources/newsletter-archives"
  );
  await runSourceFunction({
    sourceName: "batch-source-newsletter-archives",
    logSource: "newsletter_archive",
    checkStorage: true,
    execute: () => runNewsletterArchiveSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.issuesCrawled ?? 0,
      itemsInserted: (r.directSlugInserts ?? 0) + (r.sluggerResolved ?? 0),
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.sluggerUnresolved ?? 0,
    }),
  });
}

export async function runBatchSourceB7WaybackCdx(): Promise<void> {
  const { runWaybackCdxSeeder } = await import(
    "@/lib/jobs/seeders/batch-sources/wayback-cdx"
  );
  await runSourceFunction({
    sourceName: "batch-source-wayback-cdx",
    logSource: "wayback_cdx",
    checkStorage: true,
    execute: () => runWaybackCdxSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalRows ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });
}

export async function runBatchSourceB8CrtSh(): Promise<void> {
  const { runCrtShBatch } = await import(
    "@/lib/jobs/seeders/batch-sources/crt-sh"
  );
  await runSourceFunction({
    sourceName: "batch-source-crt-sh",
    logSource: "crt_sh",
    checkStorage: true,
    execute: () => runCrtShBatch(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalRows ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });
}

export async function runBatchSourceB8Rapid7Fdns(): Promise<void> {
  const { runRapid7CnameSeeder } = await import(
    "@/lib/jobs/seeders/batch-sources/rapid7-cname"
  );
  const filePath = process.env.RAPID7_FDNS_FILE;
  if (!filePath) return;
  await runSourceFunction({
    sourceName: "batch-source-rapid7-fdns",
    logSource: "rapid7_fdns",
    checkStorage: false,
    execute: () => runRapid7CnameSeeder(filePath),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalRecords ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runBatchSourceB9CrossPollination(): Promise<void> {
  const { runCrossPollinationSeeder } = await import(
    "@/lib/jobs/seeders/batch-sources/cross-pollination"
  );
  await runSourceFunction({
    sourceName: "batch-source-cross-pollination",
    logSource: "cross_pollination",
    checkStorage: true,
    execute: () => runCrossPollinationSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalCompanyNames ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: r.alreadyExists ?? 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runBatchSourceB10SitemapProbe(): Promise<void> {
  const { runSitemapProbeSeeder } = await import(
    "@/lib/jobs/seeders/batch-sources/sitemap-probe"
  );
  await runSourceFunction({
    sourceName: "batch-source-sitemap-probe",
    logSource: "sitemap_probe",
    checkStorage: true,
    execute: () => runSitemapProbeSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.companiesProbed ?? 0,
      itemsInserted: r.companiesInserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: 0,
    }),
  });
}

// ── Daily sources (D1-D13) ──────────────────────────────────────────────────

export async function runDailySourceD1BraveSearch(): Promise<void> {
  const { runBraveSearchDaily } = await import(
    "@/lib/jobs/seeders/batch-sources/brave-search"
  );
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return;
  await runSourceFunction({
    sourceName: "daily-source-brave-search",
    logSource: "brave_search",
    checkStorage: false,
    execute: () => runBraveSearchDaily({ apiKey }),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalResultsFound ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });
}

export async function runDailySourceD2HnAlgolia(): Promise<void> {
  const { runHnAlgoliaDailySeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/hn-algolia-daily"
  );
  await runSourceFunction({
    sourceName: "daily-source-hn-algolia",
    logSource: "hn_algolia",
    checkStorage: false,
    execute: () => runHnAlgoliaDailySeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalComments ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });
}

export async function runDailySourceD3RedditRss(): Promise<void> {
  const { runRedditRssSeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/reddit-rss"
  );
  await runSourceFunction({
    sourceName: "daily-source-reddit-rss",
    logSource: "reddit_rss",
    checkStorage: false,
    execute: () => runRedditRssSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalPosts ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });
}

// D4, D5, D6, D13 are frozen/retired — skip migration.

export async function runDailySourceD7FundingSignal(): Promise<void> {
  const { runFundingSignalSeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/funding-signal"
  );
  await runSourceFunction({
    sourceName: "daily-source-funding-signal",
    logSource: "funding_signal",
    checkStorage: false,
    execute: () => runFundingSignalSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalRetried ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runDailySourceD8ProductHunt(): Promise<void> {
  const { runProductHuntDailySeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/producthunt-daily"
  );
  await runSourceFunction({
    sourceName: "daily-source-producthunt",
    logSource: "product_hunt",
    checkStorage: false,
    execute: () => runProductHuntDailySeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalProducts ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runDailySourceD9EngineeringBlogs(): Promise<void> {
  const { runEngineeringBlogsRssSeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/engineering-blogs-rss"
  );
  await runSourceFunction({
    sourceName: "daily-source-engineering-blogs",
    logSource: "engineering_blogs",
    checkStorage: false,
    execute: () => runEngineeringBlogsRssSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalPosts ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runDailySourceD10GithubTrending(): Promise<void> {
  const { runGithubTrendingSeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/github-trending"
  );
  await runSourceFunction({
    sourceName: "daily-source-github-trending",
    logSource: "github_trending",
    checkStorage: false,
    execute: () => runGithubTrendingSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalRepos ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runDailySourceD11TechNewsRss(): Promise<void> {
  const { runTechNewsRssSeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/tech-news-rss"
  );
  await runSourceFunction({
    sourceName: "daily-source-tech-news-rss",
    logSource: "tech_news_rss",
    checkStorage: false,
    execute: () => runTechNewsRssSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalArticles ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runDailySourceD12NpmRegistry(): Promise<void> {
  const { runNpmRegistrySeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/npm-registry"
  );
  await runSourceFunction({
    sourceName: "daily-source-npm-registry",
    logSource: "npm_registry",
    checkStorage: false,
    execute: () => runNpmRegistrySeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalPackages ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

// ── v2 sources ──────────────────────────────────────────────────────────────

export async function runV2FundingSignalRss(): Promise<void> {
  const { runFundingSignalRssSeeder } = await import(
    "@/lib/jobs/seeders/daily-sources/funding-signal-rss"
  );
  await runSourceFunction({
    sourceName: "v2-funding-signal-rss",
    logSource: "funding_signal_rss",
    checkStorage: false,
    execute: () => runFundingSignalRssSeeder(),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalArticles ?? 0,
      itemsInserted: r.resolved ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.filteredByStartupThreshold ?? 0,
      itemsSkipped: r.unresolved ?? 0,
    }),
  });
}

export async function runV2FrontendJobScanner(): Promise<void> {
  const { runFrontendJobScannerDaily } = await import(
    "@/lib/jobs/seeders/daily-sources/frontend-job-scanner"
  );
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) return;

  const result = await runSourceFunction({
    sourceName: "v2-frontend-job-scanner",
    logSource: "frontend_job_scanner",
    checkStorage: false,
    execute: () => runFrontendJobScannerDaily({ apiKey }),
    buildLogEntry: (r) => ({
      itemsProcessed: r.totalResultsFound ?? 0,
      itemsInserted: r.insertResult?.inserted ?? 0,
      itemsUpdated: 0,
      itemsRejected: r.insertResult?.rejected.length ?? 0,
      itemsSkipped: r.insertResult?.skipped ?? 0,
    }),
  });

  // Auto-poll newly discovered companies
  if (result && "insertResult" in result && result.insertResult) {
    const insertedCompanies = result.insertResult.insertedCompanies;
    if (insertedCompanies && insertedCompanies.length > 0) {
      await scheduler.sendBatch(
        insertedCompanies.map((c) => ({
          id: `poller-run-${c.id}-${Date.now()}`,
          name: "poller/run",
          data: { companyId: c.id },
        })),
      );
    }
  }
}

// ── Special seeders ─────────────────────────────────────────────────────────

export async function runHnAlgoliaSeeder(): Promise<void> {
  const { runHnAlgoliaSeeder: runFn } = await import(
    "@/lib/jobs/seeders/hn-algolia"
  );

  const result = await runFn();
  await writeIngestionLog({
    type: "seed",
    status: result.error ? "failed" : "success",
    source: "hn_algolia",
    itemsProcessed: result.commentsProcessed ?? 0,
    itemsInserted: result.insertResult?.inserted ?? 0,
    itemsUpdated: 0,
    itemsRejected: result.insertResult?.rejected.length ?? 0,
    itemsSkipped: result.insertResult?.skipped ?? 0,
    errorMessage: result.error ?? undefined,
    startedAt: new Date(),
    finishedAt: new Date(),
  });

  // Emit custom URL resolution events for non-ATS URLs
  if (result.customUrls && result.customUrls.length > 0) {
    await scheduler.sendBatch(
      result.customUrls.map((url: string) => ({
        id: `resolve-custom-url-${url}-${Date.now()}`,
        name: "seeder/resolve-custom-url",
        data: { url },
      })),
    );
  }
}

export async function runBigQuerySeeder(): Promise<void> {
  const {
    runBigQuerySeeder: runFn,
    createDefaultBigQueryFn,
    generateCrawlDates,
  } = await import("@/lib/jobs/seeders/bigquery-seeder");

  const crawlDates = generateCrawlDates(6);
  const bigQueryFn = await createDefaultBigQueryFn();
  const result = await runFn(crawlDates, bigQueryFn);

  await writeIngestionLog({
    type: "seed",
    status: result.error ? "failed" : "success",
    source: "httparchive",
    itemsProcessed: result.domainsFound ?? 0,
    itemsInserted: result.insertResult?.inserted ?? 0,
    itemsUpdated: 0,
    itemsRejected: result.insertResult?.rejected.length ?? 0,
    itemsSkipped: result.unresolved ?? 0,
    errorMessage: result.error ?? undefined,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

export async function runCustomUrlResolver(
  data: Record<string, unknown>,
): Promise<void> {
  const { resolveCustomUrls } = await import(
    "@/lib/jobs/seeders/resolve-custom-url"
  );
  const { insertDiscoveredCompanies } = await import(
    "@/lib/jobs/seeders/company-repository"
  );

  const urls = (data.urls as string[]) ?? [];
  if (urls.length === 0) return;

  const result = await resolveCustomUrls(urls);
  if (result.resolved.length > 0) {
    await insertDiscoveredCompanies(result.resolved);
  }
}

export async function runSluggerRetryProcessor(): Promise<void> {
  const { processRetryQueue } = await import(
    "@/lib/jobs/seeders/slugger-retry-processor"
  );

  const result = await processRetryQueue();
  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "slugger_retry_processor",
    itemsProcessed: result.processed ?? 0,
    itemsInserted: result.succeeded ?? 0,
    itemsUpdated: 0,
    itemsRejected: result.failed ?? 0,
    itemsSkipped: 0,
    errorMessage: result.errors?.join("; ") ?? undefined,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}
