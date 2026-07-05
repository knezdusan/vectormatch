// Shared Seeder Schemas
// src/lib/jobs/seeders/schemas.ts
//
// Schemas shared across all seeders (HN Algolia, BigQuery, crt.sh). The key
// schema is `seedCompanyInputSchema` — the validated input to the company
// table insert function. Every seeder produces tuples that conform to this
// schema before they reach the database.
//
// See TDD §4.2.3 (Zod schema inventory) and §4.0 (company table).

import { z } from "zod";

// The six ATS platforms supported. Mirrors atsSourceEnum but as a Zod enum
// for runtime validation (the DB enum is for Postgres, this is for
// application-level validation before the insert).
export const atsSourceSchema = z.enum([
  "greenhouse",
  "lever",
  "ashby",
  "smartrecruiters",
  "recruitee",
  "workable",
]);

// How a company was discovered. Mirrors discoverySourceEnum.
export const discoverySourceSchema = z.enum([
  "httparchive",
  "hn_algolia",
  "crt_sh",
  "hn_custom_url",
  "manual",
  "workable_meta_search",
  "google_cse",
  "yc_directory",
  "vc_portfolio",
  "newsletter_archive",
  "wayback_cdx",
  "rapid7_fdns",
  "cross_pollination",
  "sitemap_probe",
  // v2 corpus expansion (company-corpus-expansion-new.md Criterion 1):
  "github_probe", // GitHub Events API poller for YC/VC-funded orgs
  "funding_signal", // RSS/Atom funding feed sourcing (TechCrunch, etc.)
]);

// Input to the company insert function — used by all seeders. This is the
// contract between a seeder's discovery logic and the company repository.
//
// Required fields: atsSlug, atsSource, discoverySource.
// Optional fields: companyName (filled in by poller from ATS metadata),
// rootDomain (for cross-seeder dedup), discoveryContext (provenance URL).
//
// v2 Corpus Expansion optional fields (Criterion 3 scoring signals):
//   - employeeCount: from funding-signal metadata (round/stage estimate).
//     Null when unknown. Drives the startup filter (<50) and the scoring
//     matrix employee_count signal.
//   - isPublic: true for publicly-listed companies (detected from funding
//     feed metadata — IPO/stock-exchange mentions). Defaults to false.
//   - isAgency: true for known agencies/aggregators. Usually set by
//     aggregator-blacklist.ts at insert time, but seeders may pre-flag.
//
// The seeder does NOT set tier, health, pollingEnabled, or polling state —
// those have sensible defaults in the DB schema (tier=dormant, health=healthy,
// pollingEnabled=true). The seeder only discovers; the poller owns runtime state.
export const seedCompanyInputSchema = z.object({
  atsSlug: z.string().min(1),
  atsSource: atsSourceSchema,
  companyName: z.string().optional(),
  rootDomain: z.string().optional(),
  discoverySource: discoverySourceSchema,
  // Provenance: HN comment URL, BQ query date, etc. Stored in
  // company.discoveryContext for auditability.
  discoveryContext: z.string().optional(),
  // v2: scoring-signal fields (optional — legacy seeders omit them).
  employeeCount: z.number().int().nonnegative().optional(),
  isPublic: z.boolean().optional(),
  isAgency: z.boolean().optional(),
});

// ── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type SeedCompanyInput = z.infer<typeof seedCompanyInputSchema>;
export type AtsSource = z.infer<typeof atsSourceSchema>;
export type DiscoverySource = z.infer<typeof discoverySourceSchema>;
