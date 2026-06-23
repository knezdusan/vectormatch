// Inngest API Route — Next.js App Router
// src/app/api/inngest/route.ts
//
// Serves all Inngest functions at /api/inngest. The Inngest Dev Server
// (and Inngest Cloud in production) polls this endpoint to discover and
// invoke registered functions.
//
// For self-hosted Coolify deployments, sync your app after each deploy:
//   curl -X PUT https://your-app.com/api/inngest --fail-with-body
//
// Environment:
//   INNGEST_DEV=1      → connect to local dev server
//   INNGEST_EVENT_KEY  → production event sending
//   INNGEST_SIGNING_KEY→ production function authentication

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import {
  bigQuerySeeder,
  customUrlResolver,
  hnAlgoliaSeeder,
  jobIngestedHandler,
  phalanxPoller,
  pollCompanyFn,
  staleCleanup,
  tierActiveFanOut,
  tierDormantFanOut,
  tierRecalc,
} from "@/inngest/functions";

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
    hnAlgoliaSeeder,
    customUrlResolver,
    bigQuerySeeder,
    pollCompanyFn,
    tierActiveFanOut,
    tierDormantFanOut,
    phalanxPoller,
    tierRecalc,
    staleCleanup,
    jobIngestedHandler,
  ],
});
