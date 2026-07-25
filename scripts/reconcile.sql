-- D25: Reconciliation Script — Codifies all manual SQL fixes from D20-D24
--
-- This script is IDEMPOTENT — safe to run multiple times. It checks for
-- the condition before applying any fix, and only writes if the condition
-- is met.
--
-- Run after every deploy to ensure the database is in the expected state:
--   docker exec <postgres-container> psql -U vectormatch -d vectormatch -f /app/scripts/reconcile.sql
--
-- All fixes are logged to the reconciliation_log table (created if not exists).

-- ── Reconciliation log table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reconciliation_log (
  id SERIAL PRIMARY KEY,
  fix_name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'applied' | 'already-ok' | 'skipped'
  details TEXT,
  applied_at TIMESTAMP DEFAULT NOW()
);

-- ── Fix 1: Ensure all jobs with remote_scope='global' have location_countries=NULL
-- (D20 Fix 5: global remote jobs have no country restrictions)
INSERT INTO reconciliation_log (fix_name, status, details)
SELECT
  'global-scope-null-countries',
  CASE
    WHEN count(*) = 0 THEN 'already-ok'
    ELSE 'applied'
  END,
  count(*)::text || ' jobs fixed'
FROM job
WHERE remote_scope = 'global' AND location_countries IS NOT NULL;

UPDATE job
SET location_countries = NULL
WHERE remote_scope = 'global' AND location_countries IS NOT NULL;

-- ── Fix 2: Ensure all fenced jobs have NULL embeddings (storage reclamation)
-- (D20 rolling-window storage: fenced jobs are not addressable)
INSERT INTO reconciliation_log (fix_name, status, details)
SELECT
  'fenced-null-embedding',
  CASE
    WHEN count(*) = 0 THEN 'already-ok'
    ELSE 'applied'
  END,
  count(*)::text || ' embeddings reclaimed'
FROM job
WHERE remote_scope IN ('country_fenced', 'region_fenced', 'onsite')
  AND job_embedding IS NOT NULL;

UPDATE job
SET job_embedding = NULL
WHERE remote_scope IN ('country_fenced', 'region_fenced', 'onsite')
  AND job_embedding IS NOT NULL;

-- ── Fix 3: Ensure is_fenced flag matches remote_scope
-- (D19: materialized gate flags must be consistent)
INSERT INTO reconciliation_log (fix_name, status, details)
SELECT
  'is-fenced-consistency',
  CASE
    WHEN count(*) = 0 THEN 'already-ok'
    ELSE 'applied'
  END,
  count(*)::text || ' is_fenced flags fixed'
FROM job
WHERE (remote_scope IN ('country_fenced', 'region_fenced', 'onsite') AND is_fenced = false)
   OR (remote_scope NOT IN ('country_fenced', 'region_fenced', 'onsite') AND is_fenced = true);

UPDATE job
SET is_fenced = true
WHERE remote_scope IN ('country_fenced', 'region_fenced', 'onsite')
  AND is_fenced = false;

UPDATE job
SET is_fenced = false
WHERE remote_scope NOT IN ('country_fenced', 'region_fenced', 'onsite')
  AND is_fenced = true;

-- ── Fix 4: Ensure rejected jobs have normalized_at set (terminal state)
-- (prevents retry sweeps from re-processing rejected jobs)
INSERT INTO reconciliation_log (fix_name, status, details)
SELECT
  'rejected-normalized-at',
  CASE
    WHEN count(*) = 0 THEN 'already-ok'
    ELSE 'applied'
  END,
  count(*)::text || ' rejected jobs fixed'
FROM job
WHERE status = 'rejected' AND normalized_at IS NULL;

UPDATE job
SET normalized_at = NOW()
WHERE status = 'rejected' AND normalized_at IS NULL;

-- ── Fix 5: Ensure pg-boss schema exists
-- (D25: the new scheduler stores queue state in pgboss schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata
    WHERE schema_name = 'pgboss'
  ) THEN
    EXECUTE 'CREATE SCHEMA IF NOT EXISTS pgboss';
    INSERT INTO reconciliation_log (fix_name, status, details)
    VALUES ('pgboss-schema', 'applied', 'Created pgboss schema');
  ELSE
    INSERT INTO reconciliation_log (fix_name, status, details)
    VALUES ('pgboss-schema', 'already-ok', 'pgboss schema exists');
  END IF;
END $$;

-- ── Fix 6: Clean up stale Inngest function configs (if Inngest is still running)
-- (D24: Inngest was caching outdated app URLs. This clears them.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'functions' AND table_schema = 'inngest'
  ) THEN
    -- Mark all Inngest functions as needing re-sync
    UPDATE inngest.functions
    SET config = jsonb_set(
      config,
      '{app}',
      jsonb_build_object('url', 'http://vectormatch-app:3000/api/inngest')
    )
    WHERE config->'app'->>'url' NOT LIKE '%vectormatch-app%';

    INSERT INTO reconciliation_log (fix_name, status, details)
    SELECT
      'inngest-url-fix',
      CASE WHEN count(*) = 0 THEN 'already-ok' ELSE 'applied' END,
      count(*)::text || ' function configs updated'
    FROM inngest.functions
    WHERE config->'app'->>'url' NOT LIKE '%vectormatch-app%';
  ELSE
    INSERT INTO reconciliation_log (fix_name, status, details)
    VALUES ('inngest-url-fix', 'skipped', 'Inngest tables not found');
  END IF;
END $$;

-- ── Summary ───────────────────────────────────────────────────────────────
SELECT fix_name, status, details, applied_at
FROM reconciliation_log
WHERE applied_at > NOW() - INTERVAL '5 minutes'
ORDER BY applied_at DESC;
