CREATE TYPE "public"."remote_scope" AS ENUM('global', 'country_fenced', 'unknown');--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "remote_scope" "remote_scope" DEFAULT 'unknown';--> statement-breakpoint
CREATE INDEX "job_remote_scope_idx" ON "job" USING btree ("remote_scope");