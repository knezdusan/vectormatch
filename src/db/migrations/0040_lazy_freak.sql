ALTER TABLE "applicant" ADD COLUMN "work_authorizations" text[];--> statement-breakpoint
ALTER TABLE "match_queue" ADD COLUMN "work_auth_risk_flag" boolean DEFAULT false NOT NULL;