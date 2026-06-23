CREATE TYPE "public"."ats_source" AS ENUM('greenhouse', 'lever', 'ashby');--> statement-breakpoint
CREATE TYPE "public"."company_health" AS ENUM('healthy', 'degraded', 'rate_limited', 'blocked', 'error', 'dead');--> statement-breakpoint
CREATE TYPE "public"."company_tier" AS ENUM('active', 'dormant', 'dead');--> statement-breakpoint
CREATE TYPE "public"."discovery_source" AS ENUM('httparchive', 'hn_algolia', 'crt_sh', 'hn_custom_url', 'manual');--> statement-breakpoint
CREATE TYPE "public"."ingestion_log_status" AS ENUM('success', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."ingestion_log_type" AS ENUM('seed', 'poll', 'tier_recalc', 'stale_cleanup');--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ats_slug" text NOT NULL,
	"ats_source" "ats_source" NOT NULL,
	"company_name" text,
	"root_domain" text,
	"discovery_source" "discovery_source" NOT NULL,
	"discovered_at" timestamp DEFAULT now() NOT NULL,
	"discovery_context" text,
	"tier" "company_tier" DEFAULT 'dormant' NOT NULL,
	"last_polled_at" timestamp,
	"last_job_posted_at" timestamp,
	"active_job_count" integer DEFAULT 0 NOT NULL,
	"health" "company_health" DEFAULT 'healthy' NOT NULL,
	"last_error_message" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"polling_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "ingestion_log_type" NOT NULL,
	"status" "ingestion_log_status" NOT NULL,
	"company_id" uuid,
	"source" text,
	"items_processed" integer DEFAULT 0 NOT NULL,
	"items_inserted" integer DEFAULT 0 NOT NULL,
	"items_updated" integer DEFAULT 0 NOT NULL,
	"items_rejected" integer DEFAULT 0 NOT NULL,
	"items_skipped" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"error_details" jsonb,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "external_job_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "last_seen_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_log" ADD CONSTRAINT "ingestion_log_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_unique_ats_slug" ON "company" USING btree ("ats_source","ats_slug");--> statement-breakpoint
CREATE INDEX "company_tier_polling_idx" ON "company" USING btree ("tier","polling_enabled","last_polled_at");--> statement-breakpoint
CREATE INDEX "company_root_domain_idx" ON "company" USING btree ("root_domain");--> statement-breakpoint
CREATE INDEX "company_health_idx" ON "company" USING btree ("health");--> statement-breakpoint
CREATE INDEX "ingestion_log_type_idx" ON "ingestion_log" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_log_company_idx" ON "ingestion_log" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "ingestion_log_status_idx" ON "ingestion_log" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_unique_ats_job" ON "job" USING btree ("ats_source","ats_slug","external_job_id");--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "job" USING btree ("status","last_seen_at");