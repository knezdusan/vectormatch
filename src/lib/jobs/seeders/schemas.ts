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

// The three ATS platforms supported in the MVP. Mirrors atsSourceEnum but as a
// Zod enum for runtime validation (the DB enum is for Postgres, this is for
// application-level validation before the insert).
export const atsSourceSchema = z.enum(["greenhouse", "lever", "ashby"]);

// How a company was discovered. Mirrors discoverySourceEnum.
export const discoverySourceSchema = z.enum([
  "httparchive",
  "hn_algolia",
  "crt_sh",
  "hn_custom_url",
  "manual",
]);

// Input to the company insert function — used by all seeders. This is the
// contract between a seeder's discovery logic and the company repository.
//
// Required fields: atsSlug, atsSource, discoverySource.
// Optional fields: companyName (filled in by poller from ATS metadata),
// rootDomain (for cross-seeder dedup), discoveryContext (provenance URL).
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
});

// ── TYPE EXPORTS ─────────────────────────────────────────────────────────────

export type SeedCompanyInput = z.infer<typeof seedCompanyInputSchema>;
export type AtsSource = z.infer<typeof atsSourceSchema>;
export type DiscoverySource = z.infer<typeof discoverySourceSchema>;
