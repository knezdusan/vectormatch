// @ts-nocheck
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/db";

const GATE_ROUTER_LIMIT = 8;
const GATE1_WEIGHT = 0.6;
const GATE2_WEIGHT = 0.4;

function weightedOverlapScore(overlap: number) {
  return 1 - Math.exp(-0.4 * Math.min(overlap, 5));
}

function linearComposite(overlap: number, cosine: number) {
  return overlap * GATE1_WEIGHT + (1 - cosine) * GATE2_WEIGHT;
}

function weightedComposite(overlap: number, cosine: number) {
  return (
    weightedOverlapScore(overlap) * GATE1_WEIGHT + (1 - cosine) * GATE2_WEIGHT
  );
}

async function main() {
  console.log("Analyzing impact of weighted overlap on Gate 1+2 routing\n");

  // Fetch all match_queue rows with their job and persona info
  const rows = await db.execute(sql`
    SELECT
      mq.id,
      mq.job_id,
      mq.persona_id,
      p.persona_label,
      j.title AS job_title,
      j.ats_slug,
      mq.overlap_score,
      mq.cosine_distance,
      mq.status
    FROM match_queue mq
    JOIN job j ON mq.job_id = j.id
    JOIN persona p ON mq.persona_id = p.id
    ORDER BY mq.job_id, mq.cosine_distance ASC
  `);

  // Group by job
  const byJob = new Map();
  for (const row of rows.rows) {
    const jobId = row.job_id as string;
    if (!byJob.has(jobId)) {
      byJob.set(jobId, []);
    }
    byJob.get(jobId).push(row);
  }

  let totalJobs = 0;
  let jobsWithChanges = 0;
  let candidatesEntering = 0;
  let candidatesLeaving = 0;
  let rankChanges = 0;
  let jobsWithMoreThan8Candidates = 0;
  const candidateCounts: number[] = [];

  console.log(`Found ${byJob.size} jobs with match_queue rows\n`);

  for (const [, candidates] of byJob) {
    totalJobs++;
    candidateCounts.push(candidates.length);
    if (candidates.length > GATE_ROUTER_LIMIT) {
      jobsWithMoreThan8Candidates++;
    }

    const linearRanked = candidates
      .map((c) => ({
        ...c,
        score: linearComposite(
          Number(c.overlap_score ?? 0),
          Number(c.cosine_distance ?? 1),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, GATE_ROUTER_LIMIT);

    const weightedRanked = candidates
      .map((c) => ({
        ...c,
        score: weightedComposite(
          Number(c.overlap_score ?? 0),
          Number(c.cosine_distance ?? 1),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, GATE_ROUTER_LIMIT);

    const linearIds = linearRanked.map((c) => c.id);
    const weightedIds = weightedRanked.map((c) => c.id);

    const entering = weightedIds.filter((id) => !linearIds.includes(id));
    const leaving = linearIds.filter((id) => !weightedIds.includes(id));

    // Count rank changes within top 8
    let jobRankChanges = 0;
    for (let i = 0; i < Math.min(linearIds.length, weightedIds.length); i++) {
      if (linearIds[i] !== weightedIds[i]) {
        jobRankChanges++;
      }
    }

    if (entering.length > 0 || leaving.length > 0 || jobRankChanges > 0) {
      jobsWithChanges++;
      candidatesEntering += entering.length;
      candidatesLeaving += leaving.length;
      rankChanges += jobRankChanges;
    }
  }

  const avgCandidates =
    candidateCounts.reduce((a, b) => a + b, 0) / candidateCounts.length;
  const maxCandidates = Math.max(...candidateCounts);
  const minCandidates = Math.min(...candidateCounts);

  console.log("## Routing Impact Summary\n");
  console.log(`- Jobs analyzed: ${totalJobs}`);
  console.log(`- Average candidates per job: ${avgCandidates.toFixed(1)}`);
  console.log(
    `- Min/Max candidates per job: ${minCandidates} / ${maxCandidates}`,
  );
  console.log(
    `- Jobs with more than ${GATE_ROUTER_LIMIT} candidates: ${jobsWithMoreThan8Candidates}`,
  );
  console.log(
    `- Jobs with rank changes or window changes: ${jobsWithChanges} (${((jobsWithChanges / totalJobs) * 100).toFixed(1)}%)`,
  );
  console.log(
    `- Candidates entering the top-${GATE_ROUTER_LIMIT} window: ${candidatesEntering}`,
  );
  console.log(
    `- Candidates leaving the top-${GATE_ROUTER_LIMIT} window: ${candidatesLeaving}`,
  );
  console.log(
    `- Rank changes within the top-${GATE_ROUTER_LIMIT} window: ${rankChanges}`,
  );

  // Detailed examples: show jobs with the most changes
  console.log("\n## Detailed Examples (Jobs with window changes)\n");
  let examplesShown = 0;
  for (const [jobId, candidates] of byJob) {
    const linearRanked = candidates
      .map((c) => ({
        ...c,
        score: linearComposite(
          Number(c.overlap_score ?? 0),
          Number(c.cosine_distance ?? 1),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, GATE_ROUTER_LIMIT);

    const weightedRanked = candidates
      .map((c) => ({
        ...c,
        score: weightedComposite(
          Number(c.overlap_score ?? 0),
          Number(c.cosine_distance ?? 1),
        ),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, GATE_ROUTER_LIMIT);

    const linearIds = linearRanked.map((c) => c.id);
    const weightedIds = weightedRanked.map((c) => c.id);
    const entering = weightedIds.filter((id) => !linearIds.includes(id));
    const leaving = linearIds.filter((id) => !weightedIds.includes(id));

    if (entering.length > 0 || leaving.length > 0) {
      examplesShown++;
      if (examplesShown > 10) break;

      const jobTitle = candidates[0].job_title;
      console.log(`\n### ${jobTitle} (${jobId})`);
      console.log("Linear top 8:");
      linearRanked.forEach((c, i) => {
        console.log(
          `  ${i + 1}. ${c.persona_label} | overlap=${c.overlap_score}, cosine=${Number(c.cosine_distance).toFixed(4)}, score=${c.score.toFixed(3)}`,
        );
      });
      console.log("Weighted top 8:");
      weightedRanked.forEach((c, i) => {
        console.log(
          `  ${i + 1}. ${c.persona_label} | overlap=${c.overlap_score}, cosine=${Number(c.cosine_distance).toFixed(4)}, score=${c.score.toFixed(3)}`,
        );
      });
      if (entering.length > 0) {
        console.log(`Entering: ${entering.length}`);
      }
      if (leaving.length > 0) {
        console.log(`Leaving: ${leaving.length}`);
      }
    }
  }

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
