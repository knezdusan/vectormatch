ALTER TYPE "public"."discovery_source" ADD VALUE 'github_probe';--> statement-breakpoint
ALTER TYPE "public"."discovery_source" ADD VALUE 'funding_signal';--> statement-breakpoint
ALTER TYPE "public"."remote_scope" ADD VALUE 'region_fenced' BEFORE 'unknown';--> statement-breakpoint
ALTER TYPE "public"."remote_scope" ADD VALUE 'onsite' BEFORE 'unknown';--> statement-breakpoint
ALTER TYPE "public"."remote_scope" ADD VALUE 'undetermined';--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "is_agency" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "employee_count" integer;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "source_orphaned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "company_quality_score" ADD COLUMN "company_size_score" numeric;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "retry_in_flight" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "retry_generation" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "cleared_generation" integer;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "text_hash" text;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "source_fetched_at" timestamp;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "job_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "source_health" ADD COLUMN "escalation_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "source_health" ADD COLUMN "last_escalated_at" timestamp;--> statement-breakpoint
CREATE INDEX "job_retry_in_flight_sweeper_idx" ON "job" USING btree ("updated_at") WHERE "job"."retry_in_flight" = true;