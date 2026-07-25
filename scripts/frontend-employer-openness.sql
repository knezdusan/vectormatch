-- D25: Frontend Employer-Openness Prior
--
-- Identifies companies that have historically hired for frontend roles
-- (approved matches for frontend personas) and boosts their polling priority.
--
-- The "employer-openness prior" is: companies that have hired frontend
-- developers before are more likely to have frontend openings again.
-- This is a stronger signal than generic "active_hot" (which fires for
-- ANY approved match).
--
-- Idempotent — safe to run multiple times.
-- NOTE: job.ats_source is TEXT, company.ats_source is an enum — cast needed.

-- ── Step 1: Create the frontend employer openness view ────────────────────
CREATE OR REPLACE VIEW frontend_employer_openness AS
SELECT
  c.id AS company_id,
  c.ats_source::text AS ats_source,
  c.ats_slug,
  c.company_name,
  c.tier AS current_tier,
  c.last_job_posted_at,
  c.active_job_count,
  (
    SELECT count(*)::int FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    WHERE j.ats_source = c.ats_source::text AND j.ats_slug = c.ats_slug
      AND mq.status = 'approved'
      AND mq.evaluated_at > NOW() - INTERVAL '90 days'
      AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
  ) AS approved_frontend_90d,
  (
    SELECT count(*)::int FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    WHERE j.ats_source = c.ats_source::text AND j.ats_slug = c.ats_slug
      AND mq.status = 'approved'
      AND mq.evaluated_at BETWEEN NOW() - INTERVAL '365 days' AND NOW() - INTERVAL '90 days'
      AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
  ) AS approved_frontend_365d,
  (
    SELECT count(*)::int FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    WHERE j.ats_source = c.ats_source::text AND j.ats_slug = c.ats_slug
      AND mq.status = 'pending'
      AND mq.created_at > NOW() - INTERVAL '30 days'
      AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
  ) AS pending_frontend_30d,
  (
    SELECT count(*)::int FROM job j
    WHERE j.ats_source = c.ats_source::text AND j.ats_slug = c.ats_slug
      AND j.detected_at > NOW() - INTERVAL '90 days'
      AND j.extracted_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
      AND j.status = 'active'
  ) AS frontend_jobs_90d
FROM company c
WHERE c.polling_enabled = true
  AND c.tier != 'dead'::company_tier;

-- ── Step 2: Boost companies with approved frontend matches to active_hot ──
INSERT INTO reconciliation_log (fix_name, status, details)
SELECT
  'frontend-employer-openness-boost',
  CASE WHEN count(*) = 0 THEN 'already-ok' ELSE 'applied' END,
  count(*)::text || ' companies boosted to active_hot'
FROM company c
WHERE c.polling_enabled = true
  AND c.tier NOT IN ('dead'::company_tier, 'active_hot'::company_tier)
  AND EXISTS (
    SELECT 1 FROM frontend_employer_openness feo
    WHERE feo.company_id = c.id
      AND (feo.approved_frontend_90d > 0 OR feo.approved_frontend_365d > 0)
  );

UPDATE company c
SET tier = 'active_hot'::company_tier, updated_at = NOW()
WHERE c.polling_enabled = true
  AND c.tier NOT IN ('dead'::company_tier, 'active_hot'::company_tier)
  AND EXISTS (
    SELECT 1 FROM frontend_employer_openness feo
    WHERE feo.company_id = c.id
      AND (feo.approved_frontend_90d > 0 OR feo.approved_frontend_365d > 0)
  );

-- ── Step 3: Report ────────────────────────────────────────────────────────
SELECT
  company_name,
  ats_source,
  ats_slug,
  current_tier,
  approved_frontend_90d,
  approved_frontend_365d,
  pending_frontend_30d,
  frontend_jobs_90d
FROM frontend_employer_openness
WHERE approved_frontend_90d > 0 OR approved_frontend_365d > 0 OR frontend_jobs_90d > 0
ORDER BY approved_frontend_90d DESC, frontend_jobs_90d DESC
LIMIT 50;
