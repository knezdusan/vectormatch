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
  internal_job_id: z.number().nullable().optional(),
  title: z.string(),
  updated_at: z.string().optional(),
  requisition_id: z.string().nullable().optional(),
  location: z.object({ name: z.string() }).optional(),
  absolute_url: z.url(),
  content: z.string().optional(),
  // Fields only present with ?content=true query parameter:
  departments: z
    .array(z.object({ id: z.number(), name: z.string() }))
    .nullable()
    .optional(),
  offices: z
    .array(
      z.object({
        id: z.number(),
        name: z.string(),
        location: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
  first_published: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  // Greenhouse metadata values can be strings, booleans, numbers, null, or
  // even objects depending on the custom field configuration. We don't use
  // metadata in our normalization (only id, title, absolute_url), so we accept
  // any value type to avoid breaking on API changes. Discovered via live tests:
  //   - 2026-06-23: Airbnb returns boolean values (e.g. "Remote eligible")
  //   - 2026-06-26: qventus returns object values (e.g. {"id": 123, "name": "..."})
  metadata: z
    .array(
      z.object({
        name: z.string(),
        value: z.unknown(),
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
//
// Field names verified against the Public Job Posting API docs and 200
// production records (2026-06-26):
// - `jobUrl` (NOT `externalLink` — that's the RPC API field name)
// - `workplaceType` (NOT `workplace` — PascalCase values: "OnSite", "Remote",
//   "Hybrid", or null in 53.5% of records)
// - `isRemote` is documented as boolean but real data returns string
//   "true"/"false" or null — accept both types defensively
// - `location` is always a string in the Public API (the object form
//   { locationName } only exists in the RPC API)
export const ashbyJobSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    location: z.string().optional(),
    descriptionHtml: z.string().optional(),
    descriptionPlain: z.string().optional(),
    jobUrl: z.url().optional(),
    applyUrl: z.url().optional(),
    workplaceType: z.string().nullable().optional(),
    employmentType: z.string().nullable().optional(),
    isRemote: z.union([z.boolean(), z.string()]).nullable().optional(),
    department: z.string().nullable().optional(),
    team: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    shouldDisplayCompensationOnJobPostings: z.boolean().optional(),
  })
  .passthrough();

export const ashbyJobsResponseSchema = z
  .object({
    jobs: z.array(ashbyJobSchema),
  })
  .passthrough();

// =============================================================================
// SMARTRECRUITERS — Posting API v1 (F2)
// Docs: https://developers.smartrecruiters.com/docs/posting-api
// Endpoint: https://api.smartrecruiters.com/v1/companies/{slug}/postings
// Public — no auth required.
//
// The list endpoint returns a ListResult wrapper with a `content` array.
// Each Posting has `name` (not "title") and `id` (string). The list endpoint
// does NOT include the job description — only the detail endpoint does
// (/postings/{postingId}). For the MVP, we use the list endpoint only;
// the normalizer degrades to title-only (same as Greenhouse without
// ?content=true). The detail endpoint can be added later if needed.
// =============================================================================

export const smartRecruitersJobSchema = z
  .object({
    id: z.string(),
    uuid: z.string().optional(),
    // Job title — SmartRecruiters calls it "name"
    name: z.string(),
    jobAdId: z.string().optional(),
    refNumber: z.string().nullable().optional(),
    company: z
      .object({
        identifier: z.string().optional(),
        name: z.string().optional(),
      })
      .nullable()
      .optional(),
    releasedDate: z.string().nullable().optional(),
    location: z
      .object({
        city: z.string().nullable().optional(),
        region: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        remote: z.boolean().nullable().optional(),
      })
      .nullable()
      .optional(),
    department: z
      .object({
        id: z.union([z.string(), z.number()]).nullable().optional(),
        label: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    function: z
      .object({
        id: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    typeOfEmployment: z
      .object({
        id: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    experienceLevel: z
      .object({
        id: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    // URL to the detail endpoint (NOT the hosted job page)
    ref: z.string().optional(),
  })
  .passthrough();

export const smartRecruitersJobsResponseSchema = z
  .object({
    limit: z.number().optional(),
    offset: z.number().optional(),
    totalFound: z.number().optional(),
    content: z.array(smartRecruitersJobSchema),
  })
  .passthrough();

// ── SmartRecruiters Detail (Tier 2 — Sprint 4 Task 7) ───────────────────────
// The detail endpoint returns a PostingDetails object with jobAd.sections
// containing the full job description, qualifications, and company description.
// Used selectively for jobs where the list endpoint's Tier 1 pseudo-description
// is too short for a good embedding.

const smartRecruitersJobAdSectionSchema = z
  .object({
    title: z.string().optional(),
    text: z.string().optional(),
  })
  .passthrough();

const smartRecruitersJobAdSchema = z
  .object({
    sections: z
      .record(z.string(), smartRecruitersJobAdSectionSchema)
      .optional(),
  })
  .passthrough();

export const smartRecruitersJobDetailSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    jobAd: smartRecruitersJobAdSchema.optional(),
    applyUrl: z.string().optional(),
    location: z
      .object({
        city: z.string().nullable().optional(),
        region: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        remote: z.boolean().nullable().optional(),
      })
      .nullable()
      .optional(),
    department: z
      .object({
        id: z.union([z.string(), z.number()]).nullable().optional(),
        label: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    typeOfEmployment: z
      .object({
        id: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    experienceLevel: z
      .object({
        id: z.string().nullable().optional(),
        label: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

// =============================================================================
// WORKABLE — Public Widget API v1 (F2)
// Endpoint: https://apply.workable.com/api/v1/widget/accounts/{slug}?details=true
// Public — no auth required.
//
// The widget API returns job postings with `?details=true` including the
// full HTML description. Field names verified via Apify scraper output
// (2026-06-30) and the fantastic.jobs API documentation.
// =============================================================================

export const workableJobSchema = z
  .object({
    id: z.string().optional(),
    shortcode: z.string().optional(),
    title: z.string(),
    companyName: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    employmentType: z.string().nullable().optional(),
    // Workable uses lowercase: "remote", "hybrid", "on_site"
    workplace: z.string().nullable().optional(),
    location: z
      .object({
        city: z.string().nullable().optional(),
        region: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        countryCode: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    // Job URL (apply.workable.com/j/{shortcode})
    url: z.string().optional(),
    applyUrl: z.string().optional(),
    // HTML description (only with ?details=true)
    description: z.string().optional(),
    publishedAt: z.string().nullable().optional(),
  })
  .passthrough();

// Workable widget API returns a bare array of jobs (like Lever v0)
export const workableJobsResponseSchema = z.array(workableJobSchema);

// =============================================================================
// RECRUITEE — Careers Site API v1 (F2)
// Docs: https://docs.recruitee.com/reference/offers
// Endpoint: https://{slug}.recruitee.com/api/offers/ (careers site, public)
//          or https://api.recruitee.com/v1/companies/{slug}/offers (API)
// Public — no auth required for the careers site endpoint.
//
// The careers site API returns `{ offers: [...] }` with full job details
// including description, requirements, and location. Field names verified
// via the Recruitee OpenAPI spec (2026-06-30).
// =============================================================================

export const recruiteeJobSchema = z
  .object({
    id: z.number(),
    title: z.string(),
    company_name: z.string().nullable().optional(),
    slug: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    // Hosted job URL
    careers_url: z.string().optional(),
    careers_apply_url: z.string().optional(),
    // Plain text description and requirements
    description: z.string().nullable().optional(),
    requirements: z.string().nullable().optional(),
    highlight: z.string().nullable().optional(),
    // Workplace type — Recruitee uses separate boolean flags
    remote: z.boolean().nullable().optional(),
    on_site: z.boolean().nullable().optional(),
    hybrid: z.boolean().nullable().optional(),
    // Employment type code: "fulltime_permanent", "contract", etc.
    employment_type_code: z.string().nullable().optional(),
    experience_code: z.string().nullable().optional(),
    // Multiple locations (array of objects)
    locations: z
      .array(
        z
          .object({
            id: z.number().optional(),
            name: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            country: z.string().nullable().optional(),
            country_code: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .optional(),
    published_at: z.string().nullable().optional(),
    created_at: z.string().nullable().optional(),
  })
  .passthrough();

export const recruiteeJobsResponseSchema = z
  .object({
    offers: z.array(recruiteeJobSchema),
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
export type SmartRecruitersJob = z.infer<typeof smartRecruitersJobSchema>;
export type WorkableJob = z.infer<typeof workableJobSchema>;
