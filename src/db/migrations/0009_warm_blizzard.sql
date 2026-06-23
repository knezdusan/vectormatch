DROP INDEX "match_queue_unique";--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "normalized_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "persona_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "cosine_distance" real;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "llm_verdict" text;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "llm_reasoning" text;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "llm_model" text;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "evaluated_at" timestamp;--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "is_read" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "match_queue" ADD CONSTRAINT "match_queue_persona_id_persona_id_fk" FOREIGN KEY ("persona_id") REFERENCES "public"."persona"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_queue_unique_persona" ON "match_queue" USING btree ("job_id","persona_id");--> statement-breakpoint
CREATE INDEX "match_queue_applicant_status_idx" ON "match_queue" USING btree ("applicant_id","status","created_at" DESC);--> statement-breakpoint
CREATE INDEX "match_queue_unread_badge_idx" ON "match_queue" USING btree ("applicant_id") WHERE "match_queue"."is_read" = false AND "match_queue"."status" = 'approved';