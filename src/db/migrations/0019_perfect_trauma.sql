CREATE TABLE "slugger_retry" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" text NOT NULL,
	"website" text,
	"discovery_source" "discovery_source" NOT NULL,
	"discovery_context" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "canonical_name" text;--> statement-breakpoint
CREATE INDEX "company_canonical_name_idx" ON "company" USING btree ("canonical_name");