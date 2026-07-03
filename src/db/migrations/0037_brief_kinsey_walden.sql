DROP INDEX "company_quality_score_company_idx";--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "short_description" text;--> statement-breakpoint
CREATE UNIQUE INDEX "company_quality_score_company_idx" ON "company_quality_score" USING btree ("company_id");