// Company Quality Score — Q2 Adversarial Quality Flywheel (TDD §3.2)
// src/db/schemas/jobs/companyQualityScore.ts
//
// Tracks per-company match quality metrics. The daily qualityFlywheelRecalc
// Inngest function updates these scores and promotes/demotes company tiers
// based on approval rates:
//   - score > 50 AND approvedMatches > 3 → promote to active_hot
//   - score < 10 AND totalJobsProcessed > 20 → demote to dormant
//   - 0 approved matches in 90 days → mark for purge review
//
// See CORPUS_EXPANSION_TDD §3.2 for the full specification.

import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { company } from "./company";

export const companyQualityScore = pgTable(
  "company_quality_score",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),

    // ── Quality Metrics ──────────────────────────────────────────────────────
    score: integer("score").notNull().default(0), // Bayesian score 0-100
    approvedMatches: integer("approved_matches").notNull().default(0),
    rejectedMatches: integer("rejected_matches").notNull().default(0),
    totalJobsProcessed: integer("total_jobs_processed").notNull().default(0),
    lastApprovedAt: timestamp("last_approved_at"),

    // ── Timestamps ────────────────────────────────────────────────────────────
    calculatedAt: timestamp("calculated_at").defaultNow().notNull(),
  },
  (table) => ({
    // One score row per company — UNIQUE so ON CONFLICT (company_id) works.
    // The quality flywheel upsert relies on this unique constraint.
    companyUniqueIdx: uniqueIndex("company_quality_score_company_idx").on(
      table.companyId,
    ),
    // For finding high/low quality companies during recalc
    scoreIdx: index("company_quality_score_score_idx").on(table.score),
  }),
);

export type CompanyQualityScore = typeof companyQualityScore.$inferSelect;
export type NewCompanyQualityScore = typeof companyQualityScore.$inferInsert;
