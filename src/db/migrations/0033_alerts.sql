-- Sprint 4 Task 8: Alerting system + schema validation monitoring
-- Creates the `alerts` table for recording infrastructure and pipeline alerts.
--
-- Alert types: storage_near_limit, storage_critical, schema_validation_spike,
-- circuit_breaker_trip
-- Alert severities: info, warning, critical
--
-- Alerts start as "active" and are resolved when the underlying condition
-- clears or an admin manually resolves them.

DO $$ BEGIN
  CREATE TYPE "alert_severity" AS ENUM('info', 'warning', 'critical');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "alert_type" AS ENUM('storage_near_limit', 'storage_critical', 'schema_validation_spike', 'circuit_breaker_trip');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "alerts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "type" "alert_type" NOT NULL,
  "severity" "alert_severity" NOT NULL,
  "message" text NOT NULL,
  "details" text,
  "source_name" text,
  "status" text DEFAULT 'active' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "resolved_by" text
);

CREATE INDEX IF NOT EXISTS "alerts_status_idx" ON "alerts" ("status");
CREATE INDEX IF NOT EXISTS "alerts_type_idx" ON "alerts" ("type");
CREATE INDEX IF NOT EXISTS "alerts_source_name_idx" ON "alerts" ("source_name");
