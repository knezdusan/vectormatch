-- Q2 Adversarial Quality Flywheel — company_quality_score table
-- CORPUS_EXPANSION_TDD §3.2
--
-- Tracks per-company match quality metrics. The daily qualityFlywheelRecalc
-- Inngest function updates these scores and promotes/demotes company tiers
-- based on approval rates.

CREATE TABLE IF NOT EXISTS "company_quality_score" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "company"("id") ON DELETE CASCADE,
  "score" integer NOT NULL DEFAULT 0,
  "approved_matches" integer NOT NULL DEFAULT 0,
  "rejected_matches" integer NOT NULL DEFAULT 0,
  "total_jobs_processed" integer NOT NULL DEFAULT 0,
  "last_approved_at" timestamp,
  "calculated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "company_quality_score_company_idx" ON "company_quality_score" ("company_id");
CREATE INDEX IF NOT EXISTS "company_quality_score_score_idx" ON "company_quality_score" ("score");
