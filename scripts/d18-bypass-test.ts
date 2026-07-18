// D18 Part A — The Bypass Test
// scripts/d18-bypass-test.ts
//
// Takes 20 jobs that should be perfect for the Node persona and traces each
// through every gate stage, recording cosine distance, tag overlap, and
// pass/fail reason. This localizes where the matcher breaks.
//
// Usage: npx tsx --env-file=.env scripts/d18-bypass-test.ts

import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

// Node persona: "Next.js / AI Full-Stack Engineer"
// Tags: typescript, nextjs, react, nodejs, prompt-engineering
const NODE_PERSONA_ID = "381ab6fe-ee04-4dd6-bc03-3136f231112b";
const NODE_TAGS = [
  "typescript",
  "nextjs",
  "react",
  "nodejs",
  "prompt-engineering",
];

// Gate 2 threshold (current production default after D16)
const GATE2_THRESHOLD = 0.55;

// Gate 1 minimum overlap
const GATE1_MIN_OVERLAP = 2;

interface BypassRow {
  jobId: string;
  title: string;
  atsSlug: string;
  atsSource: string;
  tagOverlap: number;
  overlappingTags: string[];
  cosineDistance: number | null;
  // Gate stages
  preFilter: { pass: boolean; reason: string };
  gate1: { pass: boolean; reason: string };
  gate2: { pass: boolean; reason: string };
  fenceGate: { pass: boolean; reason: string };
  natsecGate: { pass: boolean; reason: string };
  qaGate: { pass: boolean; reason: string };
  stackDisjoint: { pass: boolean; reason: string };
  dedupGate: { pass: boolean; reason: string };
  inMatchQueue: boolean;
  matchQueueStatus: string | null;
  // Final verdict
  reachesDashboard: boolean;
  breakPoint: string;
}

async function main() {
  // 1. Get the Node persona embedding
  const persona = await sql`
    SELECT id, persona_label, must_have_tags, persona_embedding
    FROM persona
    WHERE id = ${NODE_PERSONA_ID}::uuid
  `;
  if (persona.length === 0) {
    console.error("Node persona not found");
    process.exit(1);
  }
  console.log(`=== Node Persona: ${persona[0].persona_label} ===`);
  console.log(`Tags: ${persona[0].must_have_tags.join(", ")}`);
  console.log(`Has embedding: ${persona[0].persona_embedding !== null}`);
  console.log();

  // 2. Get 20 candidate jobs — active, global, embedded, with Node tag overlap ≥2
  // Exclude natsec/fenced/qa (those are gate failures we already understand)
  const jobs = await sql`
    SELECT
      j.id, j.title, j.ats_slug, j.ats_source, j.remote_scope,
      j.extracted_tags, j.normalized_text, j.location_name,
      j.is_fenced, j.is_natsec, j.is_qa,
      j.job_embedding
    FROM job j
    WHERE j.status = 'active'
    AND j.remote_scope = 'global'
    AND j.job_embedding IS NOT NULL
    AND j.extracted_tags && ${NODE_TAGS}::text[]
    AND COALESCE(j.is_natsec, false) = false
    AND COALESCE(j.is_fenced, false) = false
    AND COALESCE(j.is_qa, false) = false
    ORDER BY (
      cardinality(
        array(
          SELECT unnest(j.extracted_tags)
          INTERSECT
          SELECT unnest(${NODE_TAGS}::text[])
        )
      )
    ) DESC, j.title
    LIMIT 30
  `;

  // Also get a few that ARE natsec/fenced to show they get blocked
  const blockedJobs = await sql`
    SELECT
      j.id, j.title, j.ats_slug, j.ats_source, j.remote_scope,
      j.extracted_tags, j.normalized_text, j.location_name,
      j.is_fenced, j.is_natsec, j.is_qa,
      j.job_embedding
    FROM job j
    WHERE j.status = 'active'
    AND j.remote_scope = 'global'
    AND j.job_embedding IS NOT NULL
    AND j.extracted_tags && ${NODE_TAGS}::text[]
    AND (COALESCE(j.is_natsec, false) = true OR COALESCE(j.is_fenced, false) = true)
    LIMIT 5
  `;

  console.log(
    `Found ${jobs.length} clean candidates + ${blockedJobs.length} blocked by gates`,
  );
  console.log();

  // 3. For each job, compute cosine distance and trace through gates
  const rows: BypassRow[] = [];

  for (const job of [...jobs, ...blockedJobs]) {
    // Compute tag overlap
    const overlappingTags = job.extracted_tags.filter((t: string) =>
      NODE_TAGS.includes(t),
    );
    const tagOverlap = overlappingTags.length;

    // Compute cosine distance between job embedding and persona embedding
    const cosineResult = await sql`
      SELECT (
        j.job_embedding <=> p.persona_embedding
      ) as cosine_distance
      FROM job j, persona p
      WHERE j.id = ${job.id}::uuid
      AND p.id = ${NODE_PERSONA_ID}::uuid
    `;

    const cosineDistance =
      cosineResult.length > 0 ? Number(cosineResult[0].cosine_distance) : null;

    // Check if job is in match_queue for this persona
    const mqResult = await sql`
      SELECT id, status, cosine_distance, overlap_score
      FROM match_queue
      WHERE job_id = ${job.id}::uuid
      AND persona_id = ${NODE_PERSONA_ID}::uuid
    `;

    const inMatchQueue = mqResult.length > 0;
    const matchQueueStatus = inMatchQueue ? mqResult[0].status : null;
    const mqCosine = inMatchQueue ? Number(mqResult[0].cosine_distance) : null;
    const mqOverlap = inMatchQueue ? mqResult[0].overlap_score : null;

    // Trace through gates
    // Pre-filter: status=active, remote_scope=global, has embedding
    const preFilter = {
      pass: true,
      reason: "active + global + embedded",
    };

    // Gate 1: tag overlap ≥ GATE1_MIN_OVERLAP
    const gate1Pass = tagOverlap >= GATE1_MIN_OVERLAP;
    const gate1 = {
      pass: gate1Pass,
      reason: gate1Pass
        ? `overlap=${tagOverlap} ≥ ${GATE1_MIN_OVERLAP}`
        : `overlap=${tagOverlap} < ${GATE1_MIN_OVERLAP}`,
    };

    // Gate 2: cosine distance < GATE2_THRESHOLD
    const gate2Pass =
      cosineDistance !== null && cosineDistance < GATE2_THRESHOLD;
    const gate2 = {
      pass: gate2Pass,
      reason:
        cosineDistance === null
          ? "no embedding"
          : gate2Pass
            ? `dist=${cosineDistance.toFixed(4)} < ${GATE2_THRESHOLD}`
            : `dist=${cosineDistance.toFixed(4)} ≥ ${GATE2_THRESHOLD}`,
    };

    // Fence gate
    const fencePass = !job.is_fenced;
    const fenceGate = {
      pass: fencePass,
      reason: fencePass ? "not fenced" : `fenced: ${job.location_name}`,
    };

    // Natsec gate
    const natsecPass = !job.is_natsec;
    const natsecGate = {
      pass: natsecPass,
      reason: natsecPass ? "not natsec" : "natsec keywords detected",
    };

    // QA gate
    const qaPass = !job.is_qa;
    const qaGate = {
      pass: qaPass,
      reason: qaPass ? "not QA" : "QA role detected",
    };

    // Stack disjoint check (from gate-1-2.ts)
    // The stackDisjointClause checks if the job's tags have NO overlap with
    // persona's must_have_tags after removing blocklist — if completely disjoint, reject
    const stackDisjoint = {
      pass: tagOverlap > 0,
      reason:
        tagOverlap > 0 ? `${tagOverlap} tags overlap` : "completely disjoint",
    };

    // Dedup gate: NOT EXISTS check against approved matches for same ats_slug+title
    const dedupResult = await sql`
      SELECT 1
      FROM match_queue mq
      JOIN job j2 ON mq.job_id = j2.id
      WHERE j2.ats_slug = ${job.ats_slug}
      AND j2.title = ${job.title}
      AND mq.persona_id = ${NODE_PERSONA_ID}::uuid
      AND mq.status = 'approved'
      LIMIT 1
    `;
    const dedupPass = dedupResult.length === 0;
    const dedupGate = {
      pass: dedupPass,
      reason: dedupPass
        ? "no duplicate approved"
        : "duplicate approved match exists",
    };

    // Determine break point (first gate that fails)
    let breakPoint = "NONE — reaches dashboard";
    let reachesDashboard = true;
    const gates = [
      ["preFilter", preFilter],
      ["gate1", gate1],
      ["gate2", gate2],
      ["fence", fenceGate],
      ["natsec", natsecGate],
      ["qa", qaGate],
      ["stackDisjoint", stackDisjoint],
      ["dedup", dedupGate],
    ];
    for (const [name, gate] of gates) {
      if (!gate.pass) {
        breakPoint = name as string;
        reachesDashboard = false;
        break;
      }
    }

    // If all gates pass but not in match_queue, the break is in the
    // candidate selection (the job was never considered by the gate router)
    if (reachesDashboard && !inMatchQueue) {
      breakPoint =
        "CANDIDATE_SELECTION — all gates pass but not in match_queue";
      reachesDashboard = false;
    }

    rows.push({
      jobId: job.id,
      title: job.title,
      atsSlug: job.ats_slug,
      atsSource: job.ats_source,
      tagOverlap,
      overlappingTags,
      cosineDistance,
      preFilter,
      gate1,
      gate2,
      fenceGate,
      natsecGate,
      qaGate,
      stackDisjoint,
      dedupGate,
      inMatchQueue,
      matchQueueStatus,
      reachesDashboard,
      breakPoint,
    });
  }

  // 4. Print the table
  console.log("=== THE BYPASS TABLE ===");
  console.log();
  console.log(
    "Job ID    | Title (40)                              | Overlap | Cosine  | Gate1 | Gate2 | Fence | Natsec | QA    | In MQ | Break Point",
  );
  console.log("-".repeat(150));
  for (const r of rows) {
    console.log(
      `${r.jobId.slice(0, 8)} | ${r.title.slice(0, 40).padEnd(40)} | ${String(r.tagOverlap).padStart(7)} | ${(r.cosineDistance?.toFixed(4) ?? "—").padStart(7)} | ${r.gate1.pass ? "PASS" : "FAIL"} | ${r.gate2.pass ? "PASS" : "FAIL"} | ${r.fenceGate.pass ? "PASS" : "FAIL"} | ${r.natsecGate.pass ? "PASS  " : "FAIL"} | ${r.qaGate.pass ? "PASS" : "FAIL"} | ${r.inMatchQueue ? "YES" : "NO "} | ${r.breakPoint}`,
    );
  }

  // 5. Summary
  console.log();
  console.log("=== BREAK POINT SUMMARY ===");
  const breakCounts: Record<string, number> = {};
  for (const r of rows) {
    breakCounts[r.breakPoint] = (breakCounts[r.breakPoint] || 0) + 1;
  }
  for (const [bp, count] of Object.entries(breakCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${bp}: ${count}`);
  }

  // 6. Cosine distance distribution
  console.log();
  console.log("=== COSINE DISTANCE DISTRIBUTION ===");
  const distances = rows
    .map((r) => r.cosineDistance)
    .filter((d) => d !== null) as number[];
  distances.sort((a, b) => a - b);
  console.log(`  Min: ${distances[0]?.toFixed(4)}`);
  console.log(`  Max: ${distances[distances.length - 1]?.toFixed(4)}`);
  console.log(
    `  Median: ${distances[Math.floor(distances.length / 2)]?.toFixed(4)}`,
  );
  console.log(`  < 0.40: ${distances.filter((d) => d < 0.4).length}`);
  console.log(
    `  0.40-0.45: ${distances.filter((d) => d >= 0.4 && d < 0.45).length}`,
  );
  console.log(
    `  0.45-0.50: ${distances.filter((d) => d >= 0.45 && d < 0.5).length}`,
  );
  console.log(
    `  0.50-0.55: ${distances.filter((d) => d >= 0.5 && d < 0.55).length}`,
  );
  console.log(
    `  0.55-0.60: ${distances.filter((d) => d >= 0.55 && d < 0.6).length}`,
  );
  console.log(`  ≥ 0.60: ${distances.filter((d) => d >= 0.6).length}`);

  // 7. Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    directive: "D18",
    part: "A — Bypass Test",
    persona: {
      id: NODE_PERSONA_ID,
      label: persona[0].persona_label,
      tags: NODE_TAGS,
    },
    gate2Threshold: GATE2_THRESHOLD,
    gate1MinOverlap: GATE1_MIN_OVERLAP,
    totalJobs: rows.length,
    breakCounts,
    cosineDistribution: {
      min: distances[0]?.toFixed(4),
      max: distances[distances.length - 1]?.toFixed(4),
      median: distances[Math.floor(distances.length / 2)]?.toFixed(4),
      "lt_0.40": distances.filter((d) => d < 0.4).length,
      "0.40-0.45": distances.filter((d) => d >= 0.4 && d < 0.45).length,
      "0.45-0.50": distances.filter((d) => d >= 0.45 && d < 0.5).length,
      "0.50-0.55": distances.filter((d) => d >= 0.5 && d < 0.55).length,
      "0.55-0.60": distances.filter((d) => d >= 0.55 && d < 0.6).length,
      "ge_0.60": distances.filter((d) => d >= 0.6).length,
    },
    rows: rows.map((r) => ({
      jobId: r.jobId,
      title: r.title,
      atsSlug: r.atsSlug,
      atsSource: r.atsSource,
      tagOverlap: r.tagOverlap,
      overlappingTags: r.overlappingTags,
      cosineDistance: r.cosineDistance,
      gates: {
        preFilter: r.preFilter,
        gate1: r.gate1,
        gate2: r.gate2,
        fence: r.fenceGate,
        natsec: r.natsecGate,
        qa: r.qaGate,
        stackDisjoint: r.stackDisjoint,
        dedup: r.dedupGate,
      },
      inMatchQueue: r.inMatchQueue,
      matchQueueStatus: r.matchQueueStatus,
      reachesDashboard: r.reachesDashboard,
      breakPoint: r.breakPoint,
    })),
  };

  const fs = await import("fs");
  fs.writeFileSync(
    "docs/reports/d18-bypass-test.json",
    JSON.stringify(report, null, 2),
  );
  console.log();
  console.log("Report written to docs/reports/d18-bypass-test.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
