-- D23: job_label_override table
-- Founder dismissals with permanent scope/classification overrides.
-- Survives re-ingestion, re-normalization, and re-routing.

CREATE TABLE IF NOT EXISTS "job_label_override" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "ats_slug" text NOT NULL,
  "title" text NOT NULL,
  "override_type" text NOT NULL,
  "dismiss_reason" text,
  "created_by" text NOT NULL DEFAULT 'founder',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "revoked_at" timestamp
);

-- Index for fast lookup by ats_slug (used by the gate router)
CREATE INDEX IF NOT EXISTS "job_label_override_slug_idx"
  ON "job_label_override" ("ats_slug");

-- Index for fast lookup by (ats_slug, title) (used by the fence classifier)
CREATE INDEX IF NOT EXISTS "job_label_override_slug_title_idx"
  ON "job_label_override" ("ats_slug", "title");

-- Partial unique index: one active override per (ats_slug, title, override_type)
CREATE UNIQUE INDEX IF NOT EXISTS "job_label_override_unique_active"
  ON "job_label_override" ("ats_slug", "title", "override_type")
  WHERE "revoked_at" IS NULL;
