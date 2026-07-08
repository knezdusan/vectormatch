ALTER TABLE "public"."job" ADD COLUMN "job_url" text;--> statement-breakpoint
CREATE INDEX "job_job_url_idx" ON "public"."job" ("job_url") WHERE "job_url" IS NOT NULL;
