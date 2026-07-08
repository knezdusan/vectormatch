#!/usr/bin/env tsx
// Backfill job_url for jobs where it is missing.
//
// Two strategies are used:
//   1. ATS jobs: reverse-engineer the public posting URL from
//      (atsSource, atsSlug, externalJobId) using src/lib/jobs/ats-endpoints.ts.
//   2. Direct board jobs: copy the existing applyUrl to jobUrl, because direct
//      boards do not have a separate application-form URL.
//
// By default it only previews what would be updated. Run with --apply to write.
//
// Usage:
//   npx tsx scripts/backfill-job-urls.ts              # dry-run, all active jobs
//   npx tsx scripts/backfill-job-urls.ts --apply    # apply updates
//   npx tsx scripts/backfill-job-urls.ts --user-id <uuid> --apply  # only approved matches for one user

import "dotenv/config";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { buildJobUrl } from "@/lib/jobs/ats-endpoints";

const DIRECT_BOARD_SOURCES = [
  "himalayas_direct",
  "remoteok_direct",
  "nofluffjobs",
  "arbeitnow",
  "remotive",
  "weworkremotely",
];

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const userIdFlag = args.find((a) => a.startsWith("--user-id="));
const userId = userIdFlag ? userIdFlag.split("=")[1] : null;

async function main() {
  // If a user is provided, restrict to jobs that appear in their approved
  // match_queue rows.
  let matchedIds: string[] | null = null;
  if (userId) {
    const matchedJobIds = await db
      .select({ jobId: matchQueue.jobId })
      .from(matchQueue)
      .where(
        and(
          eq(matchQueue.applicantId, userId),
          eq(matchQueue.status, "approved"),
        ),
      );

    matchedIds = matchedJobIds.map((r) => r.jobId);
    if (matchedIds.length === 0) {
      console.log(`No approved matches found for user ${userId}.`);
      return;
    }
  }

  // Build base query: active jobs with missing jobUrl.
  const conditions = [eq(job.status, "active"), isNull(job.jobUrl)];
  if (matchedIds) {
    conditions.push(inArray(job.id, matchedIds));
  }

  const rows = await db
    .select({
      jobId: job.id,
      atsSource: job.atsSource,
      atsSlug: job.atsSlug,
      externalJobId: job.externalJobId,
      applyUrl: job.applyUrl,
      title: job.title,
    })
    .from(job)
    .where(and(...conditions))
    .limit(1000);

  if (rows.length === 0) {
    console.log("No active jobs with missing job_url found.");
    return;
  }

  const updates: {
    jobId: string;
    url: string;
    source: string;
    strategy: string;
  }[] = [];
  const skipped: { jobId: string; source: string; reason: string }[] = [];

  for (const row of rows) {
    if (DIRECT_BOARD_SOURCES.includes(row.atsSource)) {
      if (row.applyUrl) {
        updates.push({
          jobId: row.jobId,
          url: row.applyUrl,
          source: row.atsSource,
          strategy: "copy applyUrl",
        });
      } else {
        skipped.push({
          jobId: row.jobId,
          source: row.atsSource,
          reason: "direct board job with no applyUrl",
        });
      }
      continue;
    }

    const url = buildJobUrl(row.atsSource, row.atsSlug, row.externalJobId);
    if (url) {
      updates.push({
        jobId: row.jobId,
        url,
        source: row.atsSource,
        strategy: "reverse-engineer",
      });
    } else {
      skipped.push({
        jobId: row.jobId,
        source: row.atsSource,
        reason: "no URL builder for this source",
      });
    }
  }

  console.log(`Found ${rows.length} active job(s) with missing job_url.`);
  console.log(`  - Buildable URLs: ${updates.length}`);
  console.log(`  - Skipped:        ${skipped.length}`);

  if (updates.length > 0) {
    console.log("\nPreview of buildable URLs:");
    for (const u of updates) {
      console.log(`  [${u.source}] (${u.strategy}) ${u.url}`);
    }
  }

  if (skipped.length > 0) {
    console.log("\nSkipped rows:");
    for (const s of skipped) {
      console.log(`  ${s.jobId} [${s.source}]: ${s.reason}`);
    }
  }

  if (!apply) {
    console.log(
      "\nDry run complete. Add --apply to write these URLs to the database.",
    );
    return;
  }

  // Apply in batches to keep queries small.
  const BATCH_SIZE = 100;
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((u) =>
        db.update(job).set({ jobUrl: u.url }).where(eq(job.id, u.jobId)),
      ),
    );
    updated += batch.length;
  }

  console.log(
    `\nUpdated ${updated} job(s) with reverse-engineered or copied job_url values.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
