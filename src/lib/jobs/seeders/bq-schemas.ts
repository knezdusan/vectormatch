// BigQuery HTTPArchive Row Schemas
// src/lib/jobs/seeders/bq-schemas.ts
//
// Defensive Zod schemas for BigQuery HTTPArchive query results.
// The BigQuery seeder queries the public `httparchive.crawl.pages` dataset
// for domains running target tech stacks that also contain ATS script URLs
// in their homepage payload.
//
// ── Query result shape ───────────────────────────────────────────────────────
// The query returns rows with:
//   - root_page: the root domain (e.g. "acme.com")
//   - page: the full page URL (e.g. "https://acme.com/")
//   - Optional: extracted ATS slugs (via REGEXP_EXTRACT from payload)
//
// See TDD §4.1.1 for the full query specification.

import { z } from "zod";

// A single BigQuery HTTPArchive query result row.
// The query uses REGEXP_EXTRACT to pull ATS slugs directly from the homepage
// payload when present. If a slug is null, the domain still had an ATS script
// URL in its payload (the query filtered on that), but the regex couldn't
// extract the slug — the slug probe resolver handles those cases.
export const bigQueryRowSchema = z
  .object({
    // Root domain (e.g. "acme.com"). This is the primary identifier.
    root_page: z.string().min(1),
    // Full page URL (e.g. "https://acme.com/"). Used for provenance.
    page: z.string().optional(),
    // Extracted Greenhouse slug (null if not found in payload).
    greenhouse_slug: z.string().nullable().optional(),
    // Extracted Lever slug (null if not found in payload).
    lever_slug: z.string().nullable().optional(),
    // Extracted Ashby slug (null if not found in payload).
    ashby_slug: z.string().nullable().optional(),
  })
  .passthrough();

// Array of BigQuery rows — the full query response.
export const bigQueryRowsSchema = z.array(bigQueryRowSchema);

// ── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type BigQueryRow = z.infer<typeof bigQueryRowSchema>;
