-- D20 JOB 6.1: Dismiss button with reason capture
--
-- Adds dismiss_reason enum + dismiss_reason/dismissed_at columns to match_queue.
-- This creates a permanent labeled audit stream for classifier improvement.
-- The founder can dismiss a match with a structured reason (geo_fenced,
-- wrong_stack, too_senior, etc.) instead of just marking it "mismatch".

-- 1. Create the dismiss_reason enum
DO $$ BEGIN
  CREATE TYPE dismiss_reason AS ENUM (
    'geo_fenced',
    'wrong_stack',
    'too_senior',
    'too_junior',
    'not_development',
    'not_interested',
    'stale',
    'duplicate',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add dismiss_reason column (nullable — null for non-dismissed matches)
ALTER TABLE match_queue ADD COLUMN IF NOT EXISTS dismiss_reason dismiss_reason;

-- 3. Add dismissed_at timestamp (nullable — null for non-dismissed matches)
ALTER TABLE match_queue ADD COLUMN IF NOT EXISTS dismissed_at timestamp;

-- 4. Backfill: existing "mismatch" status rows get dismiss_reason='other'
--    and dismissed_at=created_at as fallback. This preserves the founder's
--    manual cleanup from D19.
UPDATE match_queue
SET dismiss_reason = 'other'::dismiss_reason,
    dismissed_at = created_at
WHERE status = 'mismatch'
  AND dismiss_reason IS NULL;

-- 5. Index for querying dismiss reasons (classifier improvement analytics)
CREATE INDEX IF NOT EXISTS match_queue_dismiss_reason_idx
  ON match_queue (dismiss_reason)
  WHERE dismiss_reason IS NOT NULL;
