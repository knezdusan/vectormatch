-- Q4 Bootstrap Polling: new companies default to "active_hot" for first 48h
-- CORPUS_EXPANSION_TDD §3.1 Q4
--
-- Changes the column default from "dormant" to "active_hot" so that all new
-- companies (inserted by any seeder) start in the hot tier and get polled
-- every 3h. The daily tier recalc (recalculateTiers) preserves active_hot
-- for companies discovered within the last 48h, then demotes them to
-- "active" or "dormant" based on job count.

ALTER TABLE "company" ALTER COLUMN "tier" SET DEFAULT 'active_hot';
