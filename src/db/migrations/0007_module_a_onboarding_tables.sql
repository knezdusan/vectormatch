CREATE TYPE "public"."cv_upload_status" AS ENUM('processing', 'valid', 'invalid', 'abandoned');--> statement-breakpoint
CREATE TABLE "cv_upload" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" text NOT NULL,
	"label" text NOT NULL,
	"original_file_name" text,
	"raw_text" text NOT NULL,
	"extracted_json" jsonb,
	"status" "cv_upload_status" DEFAULT 'processing' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags_experience" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" text NOT NULL,
	"canonical_tag" text NOT NULL,
	"years_of_experience" numeric(3, 1) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "working_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"applicant_id" text NOT NULL,
	"cv_upload_id" uuid NOT NULL,
	"company" text NOT NULL,
	"role" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_current" boolean NOT NULL,
	"summary" text,
	"canonical_skills_detected" text[] NOT NULL,
	"raw_skills_detected" text[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cv_upload" ADD CONSTRAINT "cv_upload_applicant_id_applicant_user_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags_experience" ADD CONSTRAINT "tags_experience_applicant_id_applicant_user_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_history" ADD CONSTRAINT "working_history_applicant_id_applicant_user_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."applicant"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "working_history" ADD CONSTRAINT "working_history_cv_upload_id_cv_upload_id_fk" FOREIGN KEY ("cv_upload_id") REFERENCES "public"."cv_upload"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cv_upload_applicant_id_idx" ON "cv_upload" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "cv_upload_applicant_status_idx" ON "cv_upload" USING btree ("applicant_id","status");--> statement-breakpoint
CREATE INDEX "tags_experience_tag_idx" ON "tags_experience" USING btree ("canonical_tag");--> statement-breakpoint
CREATE INDEX "tags_experience_applicant_id_idx" ON "tags_experience" USING btree ("applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_experience_unique" ON "tags_experience" USING btree ("applicant_id","canonical_tag");--> statement-breakpoint
CREATE INDEX "working_history_role_idx" ON "working_history" USING btree ("role");--> statement-breakpoint
CREATE INDEX "working_history_applicant_id_idx" ON "working_history" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "working_history_cv_upload_id_idx" ON "working_history" USING btree ("cv_upload_id");