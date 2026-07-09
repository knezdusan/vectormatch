/**
 * M1 Measurement: Rejection Rate + False-Negative Rate
 *
 * Replays the 51 rejected match_queue entries through the current Gate 0.5
 * pre-filter to measure:
 * 1. How many would still be rejected (rejection rate)
 * 2. How many geo-fenced rejections would now pass through (recall improvement)
 * 3. Whether any that pass through are genuine global-contractor roles (false negatives)
 *
 * Also backfills rejection_reason on the existing rejected entries (R3).
 *
 * Usage: npx tsx scripts/measure-m1-rejection-replay.ts
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Inline Check 8 logic (mirrors gate-zero-pre-filter.ts)
const FENCING_PATTERNS = [
  /\bmust\s+be\s+(?:authorized|eligible)\s+to\s+work\s+(?:in|within)\b/i,
  /\bmust\s+reside\s+in\b/i,
  /\beligible\s+to\s+work\s+in\b/i,
  /\bauthorized\s+to\s+work\s+in\b/i,
  /\bmust\s+have\s+(?:work\s+)?authorization\s+(?:for|in)\b/i,
  /\brequires\s+(?:work\s+)?authorization\s+(?:for|in)\b/i,
  /\bonly\s+(?:accepting|considering)\s+(?:candidates|applicants)\s+(?:from|in|located\s+in)\b/i,
  /\bcandidates\s+must\s+be\s+(?:based|located)\s+in\b/i,
];

const CONTRACTOR_PATTERNS = [
  /\bwork\s+from\s+anywhere\b/i,
  /\bglobal\s+remote\b/i,
  /\bremote\s*[-–]\s*global\b/i,
  /\bdistributed\s+team\b/i,
  /\bworldwide\s+remote\b/i,
  /\bany\s+location\b/i,
  /\bany\s+country\b/i,
  /\bwork\s+from\s+any\s+country\b/i,
  /\bcontractor\s+friendly\b/i,
  /\bopen\s+to\s+(?:remote|global)\s+(?:contractors|candidates)\b/i,
  /\bw-?8ben\b/i,
  /\bic_global\b/i,
  /\bindependent\s+contractor\b/i,
];

// Simplified Gate 0.5 replay — checks the key rules (Check 8, Check 3, region tags)
function replayGate05(
  job: any,
  applicant: any,
): { passes: boolean; blockers: string[]; pattern: string | null } {
  const blockers: string[] = [];
  let pattern: string | null = null;

  // Check 1: Title region tag
  if (job.title_region_tag && applicant.country) {
    const friendly: Record<string, string[]> = {
      RS: [
        "emea",
        "europe",
        "eu",
        "balkans",
        "eastern europe",
        "global",
        "worldwide",
        "remote",
      ],
      US: [
        "united states",
        "us only",
        "north america",
        "global",
        "worldwide",
        "remote",
      ],
    };
    const friendlyRegions = friendly[applicant.country.toUpperCase()];
    if (
      friendlyRegions &&
      !friendlyRegions.some((f) =>
        job.title_region_tag.toLowerCase().includes(f),
      )
    ) {
      blockers.push(
        `Region tag "${job.title_region_tag}" excludes ${applicant.country}`,
      );
      pattern = "title_region_tag";
    }
  }

  // Check 3: On-site in foreign country
  if (job.workplace_type === "on-site" && job.remote_scope === "onsite") {
    blockers.push("On-site job in foreign country");
    if (!pattern) pattern = "onsite_foreign";
  }

  // Check 8: Work-auth fencing (with C2 fix — skip global-remote)
  if (
    job.location_countries &&
    job.location_countries.length > 0 &&
    (job.workplace_type === "remote" || job.workplace_type === null) &&
    job.remote_scope !== "onsite" &&
    job.remote_scope !== "global" // C2 fix
  ) {
    const country = applicant.country;
    const isAllowed = job.location_countries.some(
      (c: string) =>
        c.toLowerCase().includes(country.toLowerCase()) ||
        country.toLowerCase().includes(c.toLowerCase()),
    );

    if (!isAllowed && job.normalized_text) {
      const hasContractorFriendly = CONTRACTOR_PATTERNS.some((re) =>
        re.test(job.normalized_text),
      );
      if (!hasContractorFriendly) {
        const hasFencing = FENCING_PATTERNS.some((re) =>
          re.test(job.normalized_text),
        );
        if (hasFencing) {
          blockers.push(
            `Work-auth fencing: requires authorization in ${job.location_countries.join(", ")}`,
          );
          if (!pattern) pattern = "work_auth_fencing";
        }
      }
    }
  }

  return { passes: blockers.length === 0, blockers, pattern };
}

// Rejection reason classifier (mirrors gate-3.ts classifyRejectionReason)
function classifyRejectionReason(blockers: string[]): string {
  const text = blockers.join(" ").toLowerCase();
  if (
    text.includes("country") ||
    text.includes("geo") ||
    text.includes("fenc") ||
    text.includes("region") ||
    text.includes("location") ||
    text.includes("authorization") ||
    text.includes("residency")
  ) {
    if (text.includes("region")) return "geo_region_fenced";
    return "geo_country_fenced";
  }
  if (
    text.includes("stack") ||
    text.includes("skill") ||
    text.includes("tech") ||
    text.includes("language")
  ) {
    return "stack_mismatch";
  }
  if (
    text.includes("senior") ||
    text.includes("experience") ||
    text.includes("junior") ||
    text.includes("level")
  ) {
    return "seniority_mismatch";
  }
  if (
    text.includes("contract") ||
    text.includes("compliance") ||
    text.includes("w2") ||
    text.includes("w-2") ||
    text.includes("employee")
  ) {
    return "contract_compliance";
  }
  if (
    text.includes("stale") ||
    text.includes("expired") ||
    text.includes("closed")
  ) {
    return "stale";
  }
  return "other";
}

async function main() {
  console.log(
    "=== M1: Rejection Rate + False-Negative Rate (Autopsy Replay) ===\n",
  );

  // 1. Get all rejected match_queue entries with job data
  const rejected = await sql`
    SELECT mq.id as mq_id, mq.job_id, mq.llm_blockers, mq.evaluated_at,
           j.title, j.location_name, j.workplace_type, j.remote_scope,
           j.location_countries, j.normalized_text, j.title_region_tag,
           j.experience_min_years, j.experience_max_years,
           j.compensation_min, j.compensation_max, j.compensation_currency,
           j.status as job_status
    FROM match_queue mq
    JOIN job j ON j.id = mq.job_id
    WHERE mq.status = 'rejected'
    ORDER BY mq.evaluated_at DESC
  `;

  console.log(`Total rejected match_queue entries: ${rejected.length}\n`);

  // 2. The applicant is Serbia-based (RS) — the core mission user
  const p = {
    country: "RS",
    assignment_types: ["remote"],
    preferred_compliance: ["w8ben", "ic_global"],
  };
  console.log(
    `Applicant: country=${p.country}, assignment_types=${p.assignment_types}`,
  );
  console.log(`Preferred compliance: ${p.preferred_compliance}\n`);

  // 3. Replay each rejected case through the current Gate 0.5
  let stillRejected = 0;
  let nowPasses = 0;
  const nowPassesJobs: any[] = [];
  const stillRejectedJobs: any[] = [];

  for (const r of rejected) {
    const result = replayGate05(
      {
        title: r.title,
        location_name: r.location_name,
        workplace_type: r.workplace_type,
        normalized_text: r.normalized_text,
        title_region_tag: r.title_region_tag,
        location_countries: r.location_countries || null,
        remote_scope: r.remote_scope,
      },
      {
        country: p.country,
        assignment_types: p.assignment_types || ["remote"],
      },
    );

    if (result.passes) {
      nowPasses++;
      nowPassesJobs.push({
        mq_id: r.mq_id,
        job_id: r.job_id?.substring(0, 8),
        title: r.title,
        remote_scope: r.remote_scope,
        old_blockers: (r.llm_blockers || []).join("; ").substring(0, 80),
      });
    } else {
      stillRejected++;
      stillRejectedJobs.push({
        mq_id: r.mq_id,
        job_id: r.job_id?.substring(0, 8),
        title: r.title,
        remote_scope: r.remote_scope,
        new_blockers: result.blockers.join("; ").substring(0, 80),
        pattern: result.pattern,
        rejection_reason: classifyRejectionReason(result.blockers),
      });
    }
  }

  // 4. Results
  console.log("=== Replay Results ===");
  console.log(`  Still rejected by Gate 0.5: ${stillRejected}`);
  console.log(`  Now passes Gate 0.5:        ${nowPasses}`);
  console.log(
    `  Recall improvement:         ${((nowPasses / rejected.length) * 100).toFixed(1)}% of previously rejected now pass`,
  );

  if (nowPassesJobs.length > 0) {
    console.log(`\nJobs that NOW PASS (were rejected before, pass now):`);
    console.table(nowPassesJobs.slice(0, 15));
  }

  if (stillRejectedJobs.length > 0) {
    console.log(`\nJobs still rejected by Gate 0.5:`);
    console.table(stillRejectedJobs.slice(0, 15));
  }

  // 5. Backfill rejection_reason (R3) — use original llm_blockers, not Gate 0.5 replay
  console.log(
    "\n=== R3: Backfilling rejection_reason on existing rejected entries ===",
  );
  let backfilled = 0;
  for (const r of rejected) {
    const blockers = r.llm_blockers || [];
    const blockerText = Array.isArray(blockers) ? blockers : [String(blockers)];
    const reason = classifyRejectionReason(blockerText);
    await sql`UPDATE match_queue SET rejection_reason = ${reason}::rejection_reason WHERE id = ${r.mq_id} AND rejection_reason IS NULL`;
    backfilled++;
  }
  console.log(`  Backfilled ${backfilled} entries with rejection_reason`);

  // Verify backfill
  const reasonCounts = await sql`
    SELECT rejection_reason, COUNT(*) as cnt
    FROM match_queue
    WHERE status = 'rejected' AND rejection_reason IS NOT NULL
    GROUP BY rejection_reason
    ORDER BY cnt DESC
  `;
  console.log("\n  rejection_reason distribution after backfill:");
  console.table(reasonCounts);

  // 6. Summary
  console.log("\n=== M1 Summary ===");
  console.log(`  Total autopsy cases replayed: ${rejected.length}`);
  console.log(`  Still rejected by Gate 0.5:    ${stillRejected}`);
  console.log(
    `  Now pass (recall improvement): ${nowPasses} (${((nowPasses / rejected.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  False negatives (pass but shouldn't): need Gate 3 LLM to verify`,
  );

  // Check if any now-passing jobs are geo-fenced that were previously blocked for geo reasons
  const geoPreviouslyBlocked = nowPassesJobs.filter(
    (j) =>
      j.old_blockers?.toLowerCase().includes("country") ||
      j.old_blockers?.toLowerCase().includes("geo") ||
      j.old_blockers?.toLowerCase().includes("fenc") ||
      j.old_blockers?.toLowerCase().includes("region"),
  );
  console.log(
    `  Previously geo-blocked, now pass: ${geoPreviouslyBlocked.length}`,
  );
  console.log(
    `  These will be evaluated by Gate 3 LLM (correct — ambiguous cases go to LLM)`,
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("M1 verification failed:", err);
  process.exit(1);
});
