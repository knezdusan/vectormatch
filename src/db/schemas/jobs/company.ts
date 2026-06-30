import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

import {
  atsSourceEnum,
  companyHealthEnum,
  companyTierEnum,
  discoverySourceEnum,
} from "./enums";

// COMPANY TABLE — The ATS Slug Registry
// src/db/schemas/jobs/company.ts
//
// The seeders discover (company_domain, ats_source, ats_slug) tuples. These
// persist here — the `job` table stores jobs, not companies. Without this
// registry the Phalanx Poller has nowhere to read from and seeders have
// nowhere to write to.
//
// Key design decisions (TDD §4.0):
// - uniqueIndex(atsSource, atsSlug): a company might use Greenhouse for eng
//   and Lever for sales — slug alone isn't globally unique.
// - tier (active/dormant/dead) is about polling cadence; health
//   (healthy/degraded/rate_limited/blocked/error/dead) is about the last poll
//   result. These are orthogonal.
// - lastJobPostedAt drives tier transitions — no separate tracking table.
//   The poller updates this field; tier recalculation runs as a daily query.
// - consecutiveFailures threshold of 3 → automatic `dead` transition.
// - No FK to the `job` table — the relationship is logical (jobs matched by
//   atsSource + atsSlug), not enforced. This prevents poller failures when a
//   job arrives for a slug not yet in the registry.
export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── Identity ────────────────────────────────────────────────────────────
    atsSlug: text("ats_slug").notNull(),
    atsSource: atsSourceEnum("ats_source").notNull(),
    companyName: text("company_name"), // Filled in by poller from ATS metadata
    rootDomain: text("root_domain"), // For cross-seeder dedup
    canonicalName: text("canonical_name"), // F1: Canonicalized name for cross-platform dedup

    // ── Discovery Provenance ────────────────────────────────────────────────
    discoverySource: discoverySourceEnum("discovery_source").notNull(),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    discoveryContext: text("discovery_context"), // HN comment URL, BQ query date, etc.

    // ── Tier & Polling State ────────────────────────────────────────────────
    // Q4 Bootstrap: new companies default to "active_hot" for the first 48h
    // (poll every 3h) to immediately test their ATS endpoint. The daily tier
    // recalc demotes them to "active" or "dormant" after 48h based on job count.
    tier: companyTierEnum("tier").notNull().default("active_hot"),
    lastPolledAt: timestamp("last_polled_at"),
    lastJobPostedAt: timestamp("last_job_posted_at"), // Drives tier transitions
    activeJobCount: integer("active_job_count").notNull().default(0),

    // ── Health & Error Tracking ─────────────────────────────────────────────
    health: companyHealthEnum("health").notNull().default("healthy"),
    lastErrorMessage: text("last_error_message"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),

    // ── Operational Flags ───────────────────────────────────────────────────
    pollingEnabled: boolean("polling_enabled").notNull().default(true),

    // ── Q5: Multi-Intent Fusion Score ────────────────────────────────────────
    // Increments each time a DIFFERENT discovery source finds this company.
    // High-fusion companies (discovered by HN + GitHub + Product Hunt, etc.)
    // get priority for polling. See CORPUS_EXPANSION_TDD §3.4.
    fusionScore: integer("fusion_score").notNull().default(1),

    // ── Timestamps ──────────────────────────────────────────────────────────
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => ({
    // A company can have multiple ATS sources — uniqueness is (ats_source, ats_slug)
    uniqueAtsSlug: uniqueIndex("company_unique_ats_slug").on(
      table.atsSource,
      table.atsSlug,
    ),
    // Index for the poller's daily query: tier + pollingEnabled + lastPolledAt
    tierPollingIdx: index("company_tier_polling_idx").on(
      table.tier,
      table.pollingEnabled,
      table.lastPolledAt,
    ),
    // Index for domain-based dedup across seeders
    domainIdx: index("company_root_domain_idx").on(table.rootDomain),
    // F1: Index for canonical name dedup (Slugger DB cache check)
    canonicalNameIdx: index("company_canonical_name_idx").on(
      table.canonicalName,
    ),
    // Index for health dashboard queries
    healthIdx: index("company_health_idx").on(table.health),
  }),
);

export const companySchema = createInsertSchema(company);
export type CompanySchema = z.infer<typeof companySchema>;

export type Company = typeof company.$inferSelect;
export type NewCompany = typeof company.$inferInsert;
