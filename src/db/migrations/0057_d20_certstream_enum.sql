-- D20 JOB 6.5 Fix 3: Add 'certstream' to the discovery_source enum
-- This makes certstream-discovered companies visible in the discovery_source
-- column for funnel analytics. Previously the seeder hard-coded 'hn_algolia'.

ALTER TYPE discovery_source ADD VALUE IF NOT EXISTS 'certstream';
