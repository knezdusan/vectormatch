ALTER TABLE "job" ADD COLUMN "required_tags" text[];--> statement-breakpoint
CREATE INDEX "jobs_required_tags_idx" ON "job" USING gin ("required_tags");