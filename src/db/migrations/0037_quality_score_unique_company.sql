-- Migration 0037: Add unique constraint on company_quality_score.company_id
--
-- The quality flywheel's upsert (recalculateQualityScores) uses
-- ON CONFLICT (company_id) DO UPDATE SET, which requires a unique constraint
-- or unique index on company_id. The original migration (0030) created a
-- non-unique index, causing the upsert to fail with:
--   "there is no unique or exclusion constraint matching the ON CONFLICT"
--
-- This migration replaces the non-unique index with a unique one, enabling
-- the quality flywheel to populate company_quality_score rows.
--
-- The table is currently empty (0 rows), so there's no risk of duplicate
-- company_id values blocking the constraint creation.

DROP INDEX IF EXISTS company_quality_score_company_idx;

CREATE UNIQUE INDEX company_quality_score_company_idx
  ON company_quality_score (company_id);
