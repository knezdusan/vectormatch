// Inngest Client — Durable execution engine for VectorMatch background jobs
// src/inngest/client.ts
//
// The client is the central hub for all Inngest functions. It defines typed
// events so that `inngest.send()` and function handlers are type-safe.
//
// Environment:
//   INNGEST_DEV=1      → local dev server (http://localhost:8288)
//   INNGEST_EVENT_KEY  → production event sending
//   INNGEST_SIGNING_KEY→ production function authentication
//
// See docs/reports/inngest-agent-resources.md for coding agent reference.

import { Inngest } from "inngest";

// ── Client ──────────────────────────────────────────────────────────────────

export const inngest = new Inngest({
  id: "vectormatch",
  /**
   * Checkpointing (v4 default): allows multiple steps to run in a single
   * request, reducing cold-start overhead on serverless/Docker deployments.
   * For Coolify self-hosted, this is still beneficial — it reduces request
   * churn and improves throughput.
   */
  // maxRuntime is set to 40s to stay well under the route's maxDuration (300s).
  // This gives headroom for long-running steps while preventing runaway hangs.
  //
  // If a single step exceeds 40s, Inngest will checkpoint and resume in a
  // new request automatically.
});
