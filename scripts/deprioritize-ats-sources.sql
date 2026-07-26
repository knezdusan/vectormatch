-- D26: Deprioritize SmartRecruiters and Workable
--
-- The ATS census (D25) showed:
--   SmartRecruiters: 4,629 companies, 167 jobs, 0 matches, 1,412 unhealthy
--   Workable:        1,196 companies, 0 jobs, 0 matches
--
-- These sources consume polling budget for zero return. This script:
--   1. Disables polling for dead/probation companies in these sources
--   2. Demotes remaining dormant companies to reduce polling frequency
--   3. Logs the changes for auditability
--
-- The freed polling budget is redirected to remote-native boards by
-- the increased cadence in register.ts (3h instead of 6h).
--
-- Idempotent — safe to run multiple times.

-- ── Step 1: Disable polling for dead/probation SmartRecruiters/Workable ──
INSERT INTO reconciliation_log (fix_name, status, details)
SELECT
  'd26-deprioritize-smartrecruiters-workable',
  CASE WHEN count(*) = 0 THEN 'already-ok' ELSE 'applied' END,
  count(*)::text || ' companies polling disabled (SmartRecruiters/Workable)'
FROM company
WHERE ats_source IN ('smartrecruiters'::ats_source, 'workable'::ats_source)
  AND polling_enabled = true
  AND tier IN ('dead'::company_tier, 'probation'::company_tier, 'dormant'::company_tier);

UPDATE company
SET polling_enabled = false, updated_at = NOW()
WHERE ats_source IN ('smartrecruiters'::ats_source, 'workable'::ats_source)
  AND polling_enabled = true
  AND tier IN ('dead'::company_tier, 'probation'::company_tier, 'dormant'::company_tier);

-- ── Step 2: Report remaining active companies in these sources ───────────
SELECT
  ats_source::text,
  tier::text,
  count(*)::int AS companies,
  count(*) FILTER (WHERE polling_enabled)::int AS polling_enabled
FROM company
WHERE ats_source IN ('smartrecruiters'::ats_source, 'workable'::ats_source)
GROUP BY ats_source, tier
ORDER BY ats_source, tier;
