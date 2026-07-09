// Excluded Countries — admin-managed country exclusion list
// src/db/schemas/jobs/excludedCountries.ts
//
// Stores ISO 3166-1 alpha-2 country codes that the admin has excluded from
// the ingestion pipeline. Jobs sourced from or located in these countries
// are hard-blocked before entering the matching pipeline.
//
// The list is dynamic — the admin can add/remove countries from the dashboard
// without a redeploy. Reads are cached via Cache Components ("use cache" +
// cacheTag("excluded-countries")) so the ingestion pipeline and Gate 0.5
// don't hit the DB on every job.

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

export const excludedCountries = pgTable("excluded_countries", {
  countryCode: text("country_code").primaryKey(), // ISO 3166-1 alpha-2
  countryName: text("country_name").notNull(),
  excludedAt: timestamp("excluded_at").defaultNow().notNull(),
  excludedBy: text("excluded_by"), // admin user email
  reason: text("reason"),
});

export const excludedCountrySchema = createInsertSchema(excludedCountries);
export type ExcludedCountrySchema = z.infer<typeof excludedCountrySchema>;

export type ExcludedCountry = typeof excludedCountries.$inferSelect;
export type NewExcludedCountry = typeof excludedCountries.$inferInsert;
