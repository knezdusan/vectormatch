ALTER TYPE "public"."company_tier" ADD VALUE 'probation' BEFORE 'dormant';--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "zero_yield_poll_count" integer DEFAULT 0 NOT NULL;