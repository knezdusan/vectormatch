ALTER TABLE "job" ALTER COLUMN "raw_json" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "normalized_text" text;