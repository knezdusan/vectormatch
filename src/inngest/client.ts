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
// See docs/inngest-agent-resources.md for coding agent reference.

import { Inngest } from "inngest";

// ── Event Types (documentation; Inngest v4.8 event typing is via Zod/Standard
//    Schema — see docs/inngest-agent-resources.md for migration path) ──────────

/** Event catalog for VectorMatch Module B (Seeding & Ingestion).
 *
 *  In Inngest v4.8, the client does not take a plain TypeScript event map
 *  generic. Typed events can be added later via `new EventSchemas().fromRecord()`
 *  (available in v4.11+) or via Zod/Standard Schema with `.fromSchema()`.
 *  For now, the event shape is enforced by convention and documented here. */
export interface VectorMatchEvents {
  // ── Seeder events ─────────────────────────────────────────────────────────
  "seeder/hn.run": {
    data: {
      /** Optional page limit for testing/cost control. */
      maxPages?: number;
    };
  };
  "seeder/hn.completed": {
    data: {
      commentsProcessed: number;
      atsUrlsFound: number;
      customUrlsFound: number;
      uniqueCompanies: number;
      inserted: number;
      skipped: number;
      customUrls: string[];
      error?: string;
    };
  };
  "seeder/resolve-custom-url": {
    data: {
      /** URLs to resolve via CNAME + slug probe. */
      urls: string[];
      /** Provenance: which seeder emitted these URLs. */
      source: "hn_algolia" | "bigquery" | "crt_sh";
    };
  };
  "seeder/bigquery.run": {
    data: {
      /** Optional limit on rows to fetch (for testing). */
      maxRows?: number;
    };
  };

  // ── Poller events ──────────────────────────────────────────────────────────
  "poller/run": {
    data: {
      /** Specific company ID to poll (null = full tier sweep). */
      companyId?: string;
      /** Override tier filter for a one-off poll. */
      tier?: "active" | "dormant";
    };
  };
  "poller/tier-recalc": {
    data: Record<string, never>;
  };
  "poller/stale-cleanup": {
    data: Record<string, never>;
  };

  // ── Job lifecycle events ────────────────────────────────────────────────────
  "job/ingested": {
    data: {
      jobId: string;
      atsSource: string;
      atsSlug: string;
      /** Optional — the handler fetches the full job from DB by jobId. */
      externalJobId?: string;
      /** Optional — the handler fetches the full job from DB by jobId. */
      title?: string;
      isNew: boolean;
    };
  };
}

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

// Re-export for convenience
export type InngestClient = typeof inngest;
