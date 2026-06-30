-- Source Health Tracking + Circuit Breakers (Sprint 3 Task 4)
-- CORPUS_EXPANSION_HANDOFF.md §"Task 4"
--
-- Per-source health row used by the circuit breaker that wraps every batch +
-- daily source Inngest function. A source is auto-disabled after 5 consecutive
-- failures (hard circuit breaker); flagged `degraded` after 3 (soft signal).
-- Manual disableSource()/enableSource() calls override the automatic state.

CREATE TABLE "source_health" (
	"source_name" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"last_error" text,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"total_failures" integer DEFAULT 0 NOT NULL,
	"disabled_at" timestamp,
	"disabled_reason" text
);
