#!/usr/bin/env npx tsx
// One-time backfill: Set remote_scope for 309 normalized jobs that have
// remote_scope='unknown' but no raw_json (G7 nullified it). Uses
// inferRemoteScope() on normalized_text + location_name + workplace_type.
//
// Jobs that remain "unknown" after Step 1 will be picked up by the
// nightlyResurrectionSweep for Step 2 LLM extraction.

import { config } from "dotenv";

config();

import { Pool } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { job } from "../src/db/schemas/jobs/job";

// ── Inlined inferRemoteScope (from job-normalizer.ts) ───────────────────────
// Step 1 deterministic regex path — no LLM cost.

const GLOBAL_REMOTE_PATTERNS: RegExp[] = [
  /\bremote\s*[-–]\s*(?:global|worldwide|anywhere)\b/i,
  /\b(?:global[,\s]+remote|remote[,\s]+global)\b/i,
  /\bremote[- ]first\s+(?:organization|company|team|startup)\b/i,
  /\bwork\s+from\s+anywhere\b/i,
  /\bwork\s+from\s+any\s+location\b/i,
  /\bany\s+country\b/i,
  /\bany\s+location\b/i,
  /\bworldwide\b/i,
  /\bdistributed\s+(?:team|workforce|company|organization)\b/i,
  /\bteam\s+members\s+across\s+\d+\s+countries\b/i,
  /\boperates?\s+in\s+\d+\s+countries\b/i,
];

const COUNTRY_FENCED_REMOTE_PATTERNS: RegExp[] = [
  /\bremote\s*[-–]\s*(?:us|usa|united\s+states|u\.s\.)\b/i,
  /\bremote\s*[-–]\s*(?:uk|united\s+kingdom|england)\b/i,
  /\bremote\s*[-–]\s*(?:eu|europe|european\s+union)\b/i,
  /\bremote\s*[-–]\s*(?:germany|france|spain|italy|netherlands|poland|portugal)\b/i,
  /\bremote\s*[-–]\s*(?:canada|australia|india|brazil|mexico|argentina|colombia)\b/i,
  /\bremote\s*[-–]\s*(?:latam|apac|emea|balkans|eastern\s+europe)\b/i,
  /\bremote\s+(?:within|in|only|restricted)\b/i,
  /\bmust\s+(?:be\s+)?(?:located|reside)\s+in\b/i,
  /\b(?:us|uk|eu)\s+only\b/i,
  /\bnorth\s+america\s+only\b/i,
];

function inferRemoteScope(
  locationName: string | null,
  content: string | null,
  workplaceType: "remote" | "hybrid" | "on-site" | null,
): "global" | "country_fenced" | "region_fenced" | "onsite" | "unknown" {
  if (workplaceType === "on-site" || workplaceType === "hybrid") {
    return "onsite";
  }

  const locationText = locationName ?? "";
  const contentText = content ?? "";
  const combined = `${locationText} ${contentText}`;

  for (const pattern of GLOBAL_REMOTE_PATTERNS) {
    if (pattern.test(combined)) return "global";
  }

  for (const pattern of COUNTRY_FENCED_REMOTE_PATTERNS) {
    if (pattern.test(combined)) return "country_fenced";
  }

  if (
    /\bremote\s*[-–]\s*(?:latam|latin\s+america)\b/i.test(combined) ||
    /\bremote\s*[-–]\s*(?:apac|asia[- ]?pacific)\b/i.test(combined) ||
    /\bremote\s*[-–]\s*(?:emea|europe[- ]?middle[- ]?east[- ]?africa)\b/i.test(
      combined,
    ) ||
    /\bremote\s*[-–]\s*(?:balkans|eastern\s+europe)\b/i.test(combined)
  )
    return "region_fenced";

  if (workplaceType === "remote" && /^\s*remote\s*$/i.test(locationText)) {
    return "global";
  }

  return "unknown";
}

// ── Main ────────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

async function main() {
  const jobs = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      title: job.title,
      locationName: job.locationName,
      normalizedText: job.normalizedText,
      workplaceType: job.workplaceType,
      remoteScope: job.remoteScope,
    })
    .from(job)
    .where(
      sql`(${job.remoteScope} = 'unknown' OR ${job.remoteScope} IS NULL)
         AND ${job.normalizedAt} IS NOT NULL
         AND ${job.status} = 'active'`,
    )
    .orderBy(job.detectedAt);

  console.log(`Found ${jobs.length} jobs to backfill`);

  const results: Record<string, number> = {};
  const updates: { id: string; scope: string }[] = [];

  for (const j of jobs) {
    const scope = inferRemoteScope(
      j.locationName,
      j.normalizedText,
      j.workplaceType as "remote" | "hybrid" | "on-site" | null,
    );
    results[scope] = (results[scope] ?? 0) + 1;
    updates.push({ id: j.id, scope });
  }

  console.log("\nInferred scopes:");
  for (const [scope, count] of Object.entries(results).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${scope}: ${count}`);
  }

  let updated = 0;
  for (const u of updates) {
    if (u.scope === "unknown") continue;
    await db
      .update(job)
      .set({ remoteScope: u.scope as any })
      .where(eq(job.id, u.id));
    updated++;
  }

  console.log(
    `\nUpdated ${updated} jobs (skipped ${updates.length - updated} that remain "unknown")`,
  );
  console.log(
    "Done. Remaining 'unknown' jobs will be picked up by nightlyResurrectionSweep.",
  );

  await pool.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
