CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."assignment_type" AS ENUM('remote', 'hybrid', 'on-site', 'remote_local');--> statement-breakpoint
CREATE TYPE "public"."compliance" AS ENUM('w2', 'local_employment', 'eor', 'b2b', '1099', 'w8ben', 'ic_global');--> statement-breakpoint
CREATE TYPE "public"."modality" AS ENUM('full-time', 'part-time', 'contract', 'freelance', 'internship');--> statement-breakpoint
CREATE TABLE "applicant" (
	"user_id" text PRIMARY KEY NOT NULL,
	"is_onboarded" boolean DEFAULT false,
	"country" text,
	"can_work_us_hours" boolean,
	"assignment_types" "assignment_type"[],
	"modalities" "modality"[],
	"preferred_compliance" "compliance"[],
	"all_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ats_source" text NOT NULL,
	"ats_slug" text NOT NULL,
	"title" text NOT NULL,
	"raw_json" text NOT NULL,
	"extracted_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"job_embedding" vector(1536),
	"detected_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "match_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"applicant_id" text NOT NULL,
	"overlap_score" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "persona" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" text NOT NULL,
	"persona_id" text NOT NULL,
	"persona_label" text NOT NULL,
	"embedding_summary" text NOT NULL,
	"persona_embedding" vector(1536),
	"must_have_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"blocklist_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applicant" ADD CONSTRAINT "applicant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_queue" ADD CONSTRAINT "match_queue_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_queue" ADD CONSTRAINT "match_queue_applicant_id_applicant_user_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "persona" ADD CONSTRAINT "persona_applicant_id_applicant_user_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_extracted_tags_idx" ON "job" USING gin ("extracted_tags");--> statement-breakpoint
CREATE INDEX "match_queue_unique" ON "match_queue" USING btree ("job_id","applicant_id");--> statement-breakpoint
CREATE INDEX "persona_must_have_tags_idx" ON "persona" USING gin ("must_have_tags");--> statement-breakpoint
CREATE INDEX "persona_blocklist_tags_idx" ON "persona" USING gin ("blocklist_tags");--> statement-breakpoint
CREATE INDEX "persona_embedding_hnsw_idx" ON "persona" USING hnsw ("persona_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "persona_applicant_id_idx" ON "persona" USING btree ("applicant_id");