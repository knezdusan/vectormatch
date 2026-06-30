// Company Discovery Sources — Q5 Multi-Intent Fusion Scoring (TDD §3.4)
// src/db/schemas/jobs/companyDiscoverySources.ts
//
// Tracks which discovery sources have found each company. When a new source
// discovers an existing company, a row is inserted here and the company's
// fusionScore is incremented. The unique constraint on (companyId, discoverySource)
// prevents double-counting when the same source re-discovers a company.
//
// See CORPUS_EXPANSION_TDD §3.4 for the full specification.

import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { company } from "./company";
import { discoverySourceEnum } from "./enums";

export const companyDiscoverySources = pgTable(
  "company_discovery_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "cascade" }),
    discoverySource: discoverySourceEnum("discovery_source").notNull(),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
  },
  (table) => ({
    // One row per (company, source) — prevents double-counting
    uniqueCompanySource: uniqueIndex("company_discovery_sources_unique").on(
      table.companyId,
      table.discoverySource,
    ),
    // Index for looking up all sources for a company
    companyIdx: index("company_discovery_sources_company_idx").on(
      table.companyId,
    ),
  }),
);

export type CompanyDiscoverySource =
  typeof companyDiscoverySources.$inferSelect;
export type NewCompanyDiscoverySource =
  typeof companyDiscoverySources.$inferInsert;
