-- Q5 Multi-Intent Fusion Scoring — fusion_score column + tracking table
-- CORPUS_EXPANSION_TDD §3.4
--
-- Adds a fusion_score column to the company table and a company_discovery_sources
-- tracking table. When a new discovery source finds an existing company, the
-- fusion score is incremented. High-fusion companies get priority for polling.

-- Add fusion_score column to company table (default 1 — first discovery)
ALTER TABLE "company" ADD COLUMN IF NOT EXISTS "fusion_score" integer NOT NULL DEFAULT 1;

-- Create the discovery sources tracking table
CREATE TABLE IF NOT EXISTS "company_discovery_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
  "discovery_source" "discovery_source" NOT NULL,
  "discovered_at" timestamp DEFAULT now() NOT NULL
);

-- Unique constraint: one row per (company, source) — prevents double-counting
CREATE UNIQUE INDEX IF NOT EXISTS "company_discovery_sources_unique"
  ON "company_discovery_sources" ("company_id", "discovery_source");

-- Index for looking up all sources for a company
CREATE INDEX IF NOT EXISTS "company_discovery_sources_company_idx"
  ON "company_discovery_sources" ("company_id");
