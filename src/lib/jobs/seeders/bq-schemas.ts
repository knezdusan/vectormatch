// BigQuery HTTPArchive Row Schemas
// src/lib/jobs/seeders/bq-schemas.ts
//
// Defensive Zod schemas for BigQuery HTTPArchive query results.
// The BigQuery seeder queries the public `httparchive.crawl.pages` dataset
// for domains running target tech stacks that also have ATS systems detected
// by Wappalyzer (Greenhouse or Lever).
//
// ── Query result shape ───────────────────────────────────────────────────────
// The optimized query (June 2026) uses the `technologies` column instead of
// scanning the `payload` column. This reduces BigQuery cost from ~4 TB to
// ~15 GB per monthly partition (270x cheaper, fits free tier).
//
// The query returns rows with:
//   - root_page: the root domain (e.g. "acme.com")
//   - page: the full page URL (e.g. "https://acme.com/")
//   - ats_source: which ATS was detected ("greenhouse" or "lever")
//
// Slugs are NOT extracted from the query — all domains go through the slug
// probe resolver (CNAME check + ATS API probe) using the detected ats_source
// as a hint for targeted probing.
//
// See TDD §4.1.1 for the full query specification.

import { z } from "zod";

// A single BigQuery HTTPArchive query result row.
// The optimized query returns root_page + ats_source (detected by Wappalyzer).
// No slug columns — all slug resolution happens via the slug probe resolver.
// fallow-ignore-next-line unused-export
export const bigQueryRowSchema = z
  .object({
    // Root domain (e.g. "acme.com"). This is the primary identifier.
    root_page: z.string().min(1),
    // Full page URL (e.g. "https://acme.com/"). Used for provenance.
    page: z.string().optional(),
    // Which ATS was detected by Wappalyzer ("greenhouse" or "lever").
    // Used as a hint for targeted slug probing (avoids trying all 3 ATS APIs).
    ats_source: z.enum(["greenhouse", "lever"]),
  })
  .passthrough();

// Array of BigQuery rows — the full query response.
export const bigQueryRowsSchema = z.array(bigQueryRowSchema);

// ── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type BigQueryRow = z.infer<typeof bigQueryRowSchema>;
