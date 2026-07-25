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
-- This script:
-- 1. Creates a frontend_employer_openness view that scores companies
--    based on their frontend hiring history
-- 2. Boosts high-scoring companies to active_hot tier
-- 3. Logs the changes for auditability
--
-- Idempotent — safe to run multiple times.

-- ── Step 1: Create the frontend employer openness view ────────────────────
-- This view scores each company on its frontend hiring openness.
-- Score components:
--   +50 per approved frontend match (last 90 days)
--   +20 per approved frontend match (last 365 days, outside 90d)
--   +10 per pending frontend match (last 30 days — may be approved soon)
--   +5  per frontend job ingested (last 90 days, even if not matched)
--
-- A "frontend job" is one whose extracted_tags overlap with frontend
-- persona must_have_tags (react, vue, angular, typescript, css, etc.)

CREATE OR REPLACE VIEW frontend_employer_openness AS
SELECT
  c.id AS company_id,
  c.ats_source,
  c.ats_slug,
  c.company_name,
  c.tier AS current_tier,
  c.last_job_posted_at,
  c.active_job_count,
  -- Approved frontend matches in last 90 days (strongest signal)
  (
    SELECT count(*)::int FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
      AND mq.status = 'approved'
      AND mq.evaluated_at > NOW() - INTERVAL '90 days'
      AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
  ) AS approved_frontend_90d,
  -- Approved frontend matches in last 365 days (outside 90d)
  (
    SELECT count(*)::int FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
      AND mq.status = 'approved'
      AND mq.evaluated_at BETWEEN NOW() - INTERVAL '365 days' AND NOW() - INTERVAL '90 days'
      AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
  ) AS approved_frontend_365d,
  -- Pending frontend matches in last 30 days
  (
    SELECT count(*)::int FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    JOIN persona p ON p.id = mq.persona_id
    WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
      AND mq.status = 'pending'
      AND mq.created_at > NOW() - INTERVAL '30 days'
      AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
  ) AS pending_frontend_30d,
  -- Frontend jobs ingested in last 90 days (even without a match)
  (
    SELECT count(*)::int FROM job j
    WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
      AND j.detected_at > NOW() - INTERVAL '90 days'
      AND j.extracted_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
      AND j.status = 'active'
  ) AS frontend_jobs_90d,
  -- Computed openness score
  (
    COALESCE(
      (SELECT count(*)::int FROM match_queue mq
       JOIN job j ON j.id = mq.job_id
       JOIN persona p ON p.id = mq.persona_id
       WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
         AND mq.status = 'approved'
         AND mq.evaluated_at > NOW() - INTERVAL '90 days'
         AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
      ) * 50, 0
    ) +
    COALESCE(
      (SELECT count(*)::int FROM match_queue mq
       JOIN job j ON j.id = mq.job_id
       JOIN persona p ON p.id = mq.persona_id
       WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
         AND mq.status = 'approved'
         AND mq.evaluated_at BETWEEN NOW() - INTERVAL '365 days' AND NOW() - INTERVAL '90 days'
         AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
      ) * 20, 0
    ) +
    COALESCE(
      (SELECT count(*)::int FROM match_queue mq
       JOIN job j ON j.id = mq.job_id
       JOIN persona p ON p.id = mq.persona_id
       WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
         AND mq.status = 'pending'
         AND mq.created_at > NOW() - INTERVAL '30 days'
         AND p.must_have_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
      ) * 10, 0
    ) +
    COALESCE(
      (SELECT count(*)::int FROM job j
       WHERE j.ats_source = c.ats_source AND j.ats_slug = c.ats_slug
         AND j.detected_at > NOW() - INTERVAL '90 days'
         AND j.extracted_tags && ARRAY['react','vue','angular','typescript','javascript','css','html','frontend','front-end','svelte','nextjs','tailwind']
         AND j.status = 'active'
      ) * 5, 0
    )
  ) AS openness_score
FROM company c
WHERE c.polling_enabled = true
  AND c.tier != 'dead'::company_tier;

-- ── Step 2: Boost high-scoring companies to active_hot ────────────────────
-- Companies with openness_score >= 50 (at least one approved frontend match
-- in the last 90 days) are boosted to active_hot for more frequent polling.
-- This is a SUPPLEMENT to the existing tier recalc — it catches companies
-- that may have been demoted by the generic tier logic but are still
-- valuable for frontend hiring.

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
    WHERE feo.company_id = c.id AND feo.openness_score >= 50
  );

UPDATE company c
SET tier = 'active_hot'::company_tier,
    updated_at = NOW()
WHERE c.polling_enabled = true
  AND c.tier NOT IN ('dead'::company_tier, 'active_hot'::company_tier)
  AND EXISTS (
    SELECT 1 FROM frontend_employer_openness feo
    WHERE feo.company_id = c.id AND feo.openness_score >= 50
  );

-- ── Step 3: Report ────────────────────────────────────────────────────────
SELECT
  company_name,
  ats_source,
  ats_slug,
  current_tier,
  openness_score,
  approved_frontend_90d,
  approved_frontend_365d,
  pending_frontend_30d,
  frontend_jobs_90d
FROM frontend_employer_openness
WHERE openness_score > 0
ORDER BY openness_score DESC
LIMIT 50;
