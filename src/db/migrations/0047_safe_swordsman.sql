CREATE TABLE "excluded_countries" (
	"country_code" text PRIMARY KEY NOT NULL,
	"country_name" text NOT NULL,
	"excluded_at" timestamp DEFAULT now() NOT NULL,
	"excluded_by" text,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "job_url" text;