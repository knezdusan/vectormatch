// Inngest API Route — Next.js App Router
// src/app/api/inngest/route.ts
//
// Serves all Inngest functions at /api/inngest. The Inngest Dev Server
// (local) and the self-hosted Inngest server (production) poll this endpoint
// to discover and invoke registered functions.
//
// Auto-sync: src/instrumentation.ts automatically sends a PUT request to
// this endpoint on server startup, syncing function definitions with the
// self-hosted Inngest server after every deploy. No manual `curl -X PUT` needed.
//
// Environment:
//   INNGEST_DEV=1      → connect to local dev server
//   INNGEST_EVENT_KEY  → production event sending
//   INNGEST_SIGNING_KEY→ production function authentication

import { serve } from "inngest/next";
import {
  breakerCheck,
  sourceBanRecoveryCheck,
} from "@/inngest/circuit-breaker-functions";
import { inngest } from "@/inngest/client";
import {
  aggregatorJobHandler,
  aggressiveCleanup,
  batchPollTier,
  batchSourceB1Workable,
  batchSourceB2BraveSearch,
  batchSourceB3YcDirectory,
  batchSourceB4VcPortfolios,
  batchSourceB5NewsletterArchives,
  batchSourceB7WaybackCdx,
  batchSourceB8CrtSh,
  batchSourceB8Rapid7Fdns,
  batchSourceB9CrossPollination,
  batchSourceB10SitemapProbe,
  bigQuerySeeder,
  cleanupOrphanedCvUploads,
  companyRevivalSweep,
  customUrlResolver,
  dailyHealthCheck,
  dailySourceD1BraveSearch,
  dailySourceD2HnAlgolia,
  dailySourceD3RedditRss,
  dailySourceD4RemoteJobBoards,
  dailySourceD5WwrRss,
  dailySourceD6CertStream,
  dailySourceD7FundingSignal,
  dailySourceD8ProductHunt,
  dailySourceD9EngineeringBlogs,
  dailySourceD10GithubTrending,
  dailySourceD11TechNewsRss,
  dailySourceD12NpmRegistry,
  dailySourceD13MetaAds,
  emergencyStoragePurge,
  gate3Evaluator,
  hnAlgoliaSeeder,
  inngestHealthMonitor,
  jobIngestedHandler,
  jobSummarizeHandler,
  jobSummaryBackfill,
  layoffSignalChecker,
  matchBulkReprocess,
  matchRetrySweep,
  nightlyResurrectionSweep,
  normalizationRetrySweep,
  pendingQueueSweep,
  personaUpdatedHandler,
  phalanxPoller,
  pipelineHealthMonitor,
  qualityFlywheelRecalc,
  sluggerRetryProcessor,
  staleCleanup,
  staleJobVerifier,
  storageMonitor,
  tierRecalc,
  v2FundingSignalRss,
  v2GithubEventsProbe,
  vacuumAnalyze,
} from "@/inngest/functions";
import {
  normalizeProvisionalJob,
  retryInFlightSweeper,
} from "@/inngest/normalize-provisional-job";

/**
 * Max duration for the Inngest endpoint.
 * Inngest v4 uses checkpointing by default: multiple steps can execute in a
 * single request. Setting this high ensures long-running workflows don't hit
 * Next.js timeout. For Coolify/Docker self-hosted, this is primarily a
 * safety boundary.
 */
export const maxDuration = 300;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    // Infrastructure functions
    hnAlgoliaSeeder,
    customUrlResolver,
    bigQuerySeeder,
    aggregatorJobHandler,
    batchPollTier,
    phalanxPoller,
    tierRecalc,
    qualityFlywheelRecalc,
    layoffSignalChecker,
    aggressiveCleanup,
    staleCleanup,
    staleJobVerifier,
    companyRevivalSweep,
    normalizationRetrySweep,
    nightlyResurrectionSweep,
    jobIngestedHandler,
    jobSummarizeHandler,
    jobSummaryBackfill,
    gate3Evaluator,
    matchBulkReprocess,
    matchRetrySweep,
    pendingQueueSweep,
    personaUpdatedHandler,
    pipelineHealthMonitor,
    inngestHealthMonitor,
    cleanupOrphanedCvUploads,
    vacuumAnalyze,
    sluggerRetryProcessor,
    storageMonitor,
    emergencyStoragePurge,
    // Daily source functions (TDD §2.2 — staggered cron schedule)
    // Sprint 3 Task 7: D1 replaced Google CSE with Brave Search API.
    dailySourceD1BraveSearch,
    dailySourceD2HnAlgolia,
    dailySourceD3RedditRss,
    dailySourceD4RemoteJobBoards,
    dailySourceD5WwrRss,
    dailySourceD6CertStream,
    dailySourceD7FundingSignal,
    dailySourceD8ProductHunt,
    dailySourceD9EngineeringBlogs,
    dailySourceD10GithubTrending,
    dailySourceD11TechNewsRss,
    dailySourceD12NpmRegistry,
    dailySourceD13MetaAds,
    // v2 Corpus Expansion: Funding-Signal Seeders (Criterion 1 Discovery Layer)
    v2FundingSignalRss,
    v2GithubEventsProbe,
    // v2 Corpus Expansion: Provisional Job Lifecycle (Criterion 1)
    normalizeProvisionalJob,
    retryInFlightSweeper,
    // v2 Corpus Expansion: Circuit Breaker (Criterion 3 — 5-tier action chain)
    breakerCheck,
    sourceBanRecoveryCheck,
    // Batch source functions (TDD §2.1 — event-triggered for one-time flush)
    // Sprint 3 Task 7: B2 replaced Google CSE with Brave Search API.
    batchSourceB1Workable,
    batchSourceB2BraveSearch,
    batchSourceB3YcDirectory,
    batchSourceB4VcPortfolios,
    batchSourceB5NewsletterArchives,
    batchSourceB7WaybackCdx,
    batchSourceB8CrtSh,
    batchSourceB8Rapid7Fdns,
    batchSourceB9CrossPollination,
    batchSourceB10SitemapProbe,
    dailyHealthCheck,
  ],
});
