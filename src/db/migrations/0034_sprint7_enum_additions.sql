-- Sprint 7: Pipeline Activation & Monitoring
-- Adds two new enum values:
--   1. 'batch_poll' to ingestion_log_type — for batchPollTier ingestion log entries
--   2. 'pipeline_health' to alert_type — for the pipeline health monitor alerts
--
-- ALTER TYPE ... ADD VALUE is idempotent-safe with IF NOT EXISTS (Postgres 9.3+).
-- These are additive changes — no data loss, no downtime.

-- Add 'batch_poll' to ingestion_log_type enum
ALTER TYPE "ingestion_log_type" ADD VALUE IF NOT EXISTS 'batch_poll';

-- Add 'pipeline_health' to alert_type enum
ALTER TYPE "alert_type" ADD VALUE IF NOT EXISTS 'pipeline_health';
