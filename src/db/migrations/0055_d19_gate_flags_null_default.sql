-- D19: Fix COALESCE default-false bug. The is_fenced/is_natsec/is_qa columns
-- were created via raw SQL (outside Drizzle) with DEFAULT FALSE. This made the
-- COALESCE(is_fenced, <regex>, false) fallback in gate-1-2.ts dead code —
-- COALESCE never reached the regex because every un-backfilled row had FALSE
-- (not NULL). This migration:
-- 1. Drops the FALSE default (new rows get NULL = "not yet scanned")
-- 2. Sets all existing FALSE rows to NULL (un-scanned)
-- 3. Runs the gate-1-2.ts regex backfill to set TRUE where the regex matches
-- 4. Sets remaining NULL rows to FALSE (scanned, confirmed not fenced/natsec/QA)
-- After this migration: NULL = not yet scanned (regex fallback runs), FALSE =
-- scanned and clean, TRUE = scanned and fenced/natsec/QA. The ingestion code
-- (D19) now sets these flags at normalization time, so new jobs are scanned
-- immediately and never stay NULL.

-- Step 1: Drop the FALSE defaults
ALTER TABLE "job" ALTER COLUMN "is_fenced" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "is_natsec" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "is_qa" DROP DEFAULT;--> statement-breakpoint

-- Step 2: Set all FALSE rows to NULL (un-scanned — will be re-evaluated)
UPDATE "job" SET "is_fenced" = NULL WHERE "is_fenced" = false;--> statement-breakpoint
UPDATE "job" SET "is_natsec" = NULL WHERE "is_natsec" = false;--> statement-breakpoint
UPDATE "job" SET "is_qa" = NULL WHERE "is_qa" = false;--> statement-breakpoint

-- Step 3: Regex backfill — set is_fenced = TRUE for rows that match the
-- gate-1-2.ts title/location fence regex. This catches the "US Remote" title
-- pattern, country names in location, region names (EMEA/APAC/etc.), and
-- short location strings that indicate country-fencing.
UPDATE "job" SET "is_fenced" = true WHERE "is_fenced" IS NULL AND (
  title ~* '(U\.?S\.?A?\.?|United States)\s*[-/]?\s*Remote'
  OR title ~* 'Remote\s*[-/]\s*(U\.?S\.?A?\.?|United States|USA)\M'
  OR title ~* 'Remote\s*[\[(]\s*(U\.?S\.?A?\.?|United States|USA)\s*[\])]'
  OR title ~* 'Remote\s*[,;:-]\s*(U\.?S\.?A?\.?|United States|USA)\M'
  OR title ~* 'Remote\s+within\s+'
  OR title ~* 'Remote\s*[;,-]\s*(Argentina|Brazil|Colombia|Mexico|Canada|Germany|France|Spain|Italy|Portugal|Netherlands|Poland|Ukraine|India|Pakistan|Philippines|Australia|United Kingdom|UK|Ireland|Sweden|Norway|Denmark|Finland|Belgium|Switzerland|Austria|Greece|Romania|South Africa|Nigeria|Israel|Turkey|Japan|South Korea|Singapore|Hong Kong|New Zealand)'
  OR COALESCE(location_name, '') ~* '(U\.?S\.?A?\.?|United States)\s*[-/]?\s*Remote'
  OR COALESCE(location_name, '') ~* 'Remote\s*[-/]\s*(U\.?S\.?A?\.?|United States|USA)\M'
  OR COALESCE(location_name, '') ~* 'Remote\s*[\[(]\s*(U\.?S\.?A?\.?|United States|USA)\s*[\])]'
  OR COALESCE(location_name, '') ~* 'Remote\s*[,;:-]\s*(U\.?S\.?A?\.?|United States|USA)\M'
  OR COALESCE(location_name, '') ~* 'Remote\s+within\s+'
  OR COALESCE(location_name, '') ~* 'Remote\s*[;,-]\s*(Argentina|Brazil|Colombia|Mexico|Canada|Germany|France|Spain|Italy|Portugal|Netherlands|Poland|Ukraine|India|Pakistan|Philippines|Australia|United Kingdom|UK|Ireland|Sweden|Norway|Denmark|Finland|Belgium|Switzerland|Austria|Greece|Romania|South Africa|Nigeria|Israel|Turkey|Japan|South Korea|Singapore|Hong Kong|New Zealand)'
  OR COALESCE(location_name, '') ~* 'Remote\s*,\s*[A-Za-z]{2}\M'
  OR COALESCE(location_name, '') ~* '(European Union|NAMER|EMEA|APAC|LATAM|North America|South America|Middle East|Balkans|Eastern Europe|Western Europe|Nordics|Scandinavia|DACH|Benelux)'
  OR COALESCE(location_name, '') ~* '(United States|USA|Canada|Argentina|Brazil|Colombia|Mexico|Germany|France|Spain|Italy|Portugal|Netherlands|Poland|Ukraine|India|Pakistan|Philippines|Australia|United Kingdom|England|Scotland|Wales|Ireland|Sweden|Norway|Denmark|Finland|Belgium|Switzerland|Austria|Greece|Romania|South Africa|Nigeria|Kenya|Egypt|Morocco|Israel|Turkey|Japan|South Korea|Singapore|Hong Kong|New Zealand)'
  OR (length(trim(COALESCE(location_name, ''))) <= 5 AND COALESCE(location_name, '') ~* '\mus\M')
  OR (
    COALESCE(location_name, '') != ''
    AND COALESCE(location_name, '') !~* '(remote|anywhere|worldwide|global|distributed|any location)'
    AND (COALESCE(location_name, '') ~* ';' OR COALESCE(location_name, '') ~* '^[a-z].*,\s*[a-z]' OR length(trim(COALESCE(location_name, ''))) < 50)
  )
  -- D19: E-Verify + federal work-eligibility language → country_fenced(US)
  -- D21 FIX: PostgreSQL POSIX regex uses \m (word start) and \M (word end),
  -- NOT \b (which is backspace). The original \b patterns never matched.
  OR COALESCE(normalized_text, '') ~* '\me-?verify\M'
  OR COALESCE(normalized_text, '') ~* '\meligibility\s+to\s+work\s+in\s+(?:the\s+)?(?:u\.?s\.?a?\.?|united\s+states)\M'
  OR COALESCE(normalized_text, '') ~* '\mauthorized\s+to\s+work\s+in\s+(?:the\s+)?(?:u\.?s\.?a?\.?|united\s+states)\M'
);--> statement-breakpoint

-- Step 4: Regex backfill — set is_natsec = TRUE for rows that match the
-- gate-zero.ts natsec regex (including context-dependent e-verify + clearance)
UPDATE "job" SET "is_natsec" = true WHERE "is_natsec" IS NULL AND (
  title ~* '(security clearance|top secret|ts/sci|secret clearance|clearance required|active clearance)'
  OR title ~* '(us citizen|u\.s\. citizen|us citizenship|must be a us citizen)'
  OR title ~* '(\mitar\M|export control|\mdod\M|department of defense|defense contract)'
  OR title ~* '(national security|homeland security|intelligence community)'
  OR COALESCE(normalized_text, '') ~* '(security clearance|top secret|ts/sci|secret clearance|clearance required|active clearance)'
  OR COALESCE(normalized_text, '') ~* '(us citizen|u\.s\. citizen|us citizenship|must be a us citizen)'
  OR COALESCE(normalized_text, '') ~* '(\mitar\M|export control|\mdod\M|department of defense|defense contract)'
  OR COALESCE(normalized_text, '') ~* '(national security|homeland security|intelligence community)'
  OR (
    COALESCE(normalized_text, '') ~* '(e-verify|everify|public trust|polygraph|counterintelligence|background investigation)'
    AND COALESCE(normalized_text, '') ~* '(security clearance|top secret|ts/sci|secret clearance|clearance required|active clearance|\mitar\M|export control|\mdod\M|department of defense|defense contract|national security|homeland security|intelligence community)'
  )
);--> statement-breakpoint

-- Step 5: Regex backfill — set is_qa = TRUE for QA/test engineering titles
UPDATE "job" SET "is_qa" = true WHERE "is_qa" IS NULL AND (
  title ~* '(qa engineer|qa automation|quality assurance|software engineer in test|software development engineer in test|sdet|test automation engineer|automation tester|test engineer|qa lead|quality engineer)'
);--> statement-breakpoint

-- Step 6: Set remaining NULL rows to FALSE (scanned, confirmed not fenced/natsec/QA)
UPDATE "job" SET "is_fenced" = false WHERE "is_fenced" IS NULL;--> statement-breakpoint
UPDATE "job" SET "is_natsec" = false WHERE "is_natsec" IS NULL;--> statement-breakpoint
UPDATE "job" SET "is_qa" = false WHERE "is_qa" IS NULL;
