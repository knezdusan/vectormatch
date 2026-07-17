ALTER TABLE "applicant" ADD COLUMN "github_handle" text;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "github_org" text;--> statement-breakpoint
CREATE INDEX "company_github_org_idx" ON "company" USING btree ("github_org");