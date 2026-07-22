CREATE TYPE "public"."dismiss_reason" AS ENUM('geo_fenced', 'wrong_stack', 'too_senior', 'too_junior', 'not_development', 'not_interested', 'stale', 'duplicate', 'other');--> statement-breakpoint
ALTER TYPE "public"."discovery_source" ADD VALUE 'certstream' BEFORE 'hn_custom_url';--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "description_html" text;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "dismiss_reason" "dismiss_reason";--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "dismissed_at" timestamp;--> statement-breakpoint
CREATE INDEX "match_queue_dismiss_reason_idx" ON "match_queue" USING btree ("dismiss_reason");