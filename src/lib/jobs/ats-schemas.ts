// Defensive Zod Schemas for ATS API Responses
// src/lib/jobs/ats-schemas.ts
//
// Because we don't control the Greenhouse/Lever/Ashby APIs, we MUST use Zod
// to validate their incoming JSON. If a job is missing a description, our
// pipeline gracefully skips it rather than crashing the Inngest worker.
//
// ── Error handling pattern (TDD §4.2.3) ──────────────────────────────────────
// Always use `safeParse()`, never `parse()`. On validation failure:
//   1. Log the Zod error (to ingestionLog.errorDetails)
//   2. Skip the slug (do not insert the job)
//   3. Mark the company as `health = "degraded"`
//   4. Continue to the next slug — the pipeline never crashes on one bad response
//
// ── Zod 4 note ───────────────────────────────────────────────────────────────
// This project uses Zod 4.4.3. The `z.string().url()` form is deprecated —
// use `z.url()` instead. Similarly `z.string().email()` → `z.email()`.
//
// See TDD §4.2.3 for the full specification and schema inventory.

import { z } from "zod";

// =============================================================================
// GREENHOUSE — Job Board API v1
// Docs: https://developers.greenhouse.io/job-board.html
// Endpoint: https://boards-api.greenhouse.io/v1/boards/{slug}/jobs
// =============================================================================

export const greenhouseJobSchema = z.object({
  id: z.number(),
  internal_job_id: z.number().optional(),
  title: z.string(),
  updated_at: z.string().optional(),
  requisition_id: z.string().nullable().optional(),
  location: z.object({ name: z.string() }).optional(),
  absolute_url: z.url(),
  content: z.string().optional(),
  // Greenhouse metadata values can be strings, booleans, numbers, or null
  // depending on the custom field configuration. We don't use metadata in our
  // normalization (only id, title, absolute_url), so we accept all types to
  // avoid breaking on API changes. Discovered via live smoke test 2026-06-23:
  // Airbnb's board returns boolean metadata values (e.g. "Remote eligible").
  metadata: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.boolean(), z.number(), z.null()]),
      }),
    )
    .nullable()
    .optional(),
  language: z.string().optional(),
});

export const greenhouseJobsResponseSchema = z.object({
  jobs: z.array(greenhouseJobSchema),
  meta: z.object({ total: z.number() }).optional(),
});

// =============================================================================
// LEVER — Postings API v0
// Docs: https://github.com/lever/postings-api
// Endpoint: https://api.lever.co/v0/postings/{slug}?mode=json
// =============================================================================

export const leverJobSchema = z.object({
  id: z.string(),
  // Job title — Lever calls it "text"
  text: z.string(),
  categories: z
    .object({
      location: z.string().nullable().optional(),
      commitment: z.string().nullable().optional(),
      team: z.string().nullable().optional(),
      department: z.string().nullable().optional(),
      allLocations: z.array(z.string()).optional(),
    })
    .optional(),
  country: z.string().nullable().optional(),
  descriptionPlain: z.string().optional(),
  description: z.string().optional(),
  hostedUrl: z.url(),
  applyUrl: z.url().optional(),
  // Lever may return workplaceType values outside our enum (e.g. new types
  // they add). We don't use this field in normalization, so accept any string.
  // Discovered via live smoke test 2026-06-23: tonic slug returned an unknown
  // workplaceType value.
  workplaceType: z.string().optional(),
  salaryRange: z
    .object({
      currency: z.string().optional(),
      interval: z.string().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
    })
    .nullable()
    .optional(),
});

// Lever v0 returns a bare JSON array of postings (not wrapped in an object).
export const leverJobsResponseSchema = z.array(leverJobSchema);

// =============================================================================
// ASHBY — Public Job Posting API
// Docs: https://developers.ashbyhq.com/docs/public-job-posting-api
// Endpoint: https://api.ashbyhq.com/posting-api/job-board/{slug}
// =============================================================================

// Ashby adds fields frequently and without notice. `.passthrough()` allows
// extra fields so a payload shape change doesn't break validation — only the
// fields we depend on (id, title) are strictly required.
export const ashbyJobSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    // Ashby's location can be either an object { locationName } or a plain
    // string depending on the board configuration. We don't use this field in
    // normalization, so accept both. Discovered via live smoke test 2026-06-23:
    // linear and exa boards return location as a string.
    location: z
      .union([z.string(), z.object({ locationName: z.string().optional() })])
      .optional(),
    descriptionHtml: z.string().optional(),
    descriptionPlain: z.string().optional(),
    externalLink: z.url().optional(),
    workplace: z.enum(["remote", "hybrid", "on-site"]).optional(),
  })
  .passthrough();

export const ashbyJobsResponseSchema = z
  .object({
    jobs: z.array(ashbyJobSchema),
  })
  .passthrough();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;
export type GreenhouseJobsResponse = z.infer<
  typeof greenhouseJobsResponseSchema
>;
export type LeverJob = z.infer<typeof leverJobSchema>;
export type LeverJobsResponse = z.infer<typeof leverJobsResponseSchema>;
export type AshbyJob = z.infer<typeof ashbyJobSchema>;
export type AshbyJobsResponse = z.infer<typeof ashbyJobsResponseSchema>;
