CREATE TABLE "applicant_company_block" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"ats_slug" text NOT NULL,
	"company_name" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applicant_company_block" ADD CONSTRAINT "applicant_company_block_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applicant_company_block_unique_idx" ON "applicant_company_block" USING btree ("user_id","ats_slug");