CREATE TABLE "migration_tracking" (
	"migration_number" text PRIMARY KEY NOT NULL,
	"migration_name" text NOT NULL,
	"hash" text NOT NULL,
	"applied_by" text DEFAULT 'drizzle_kit' NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"git_commit" text,
	"verified" boolean DEFAULT false NOT NULL
);
