// D27: Quality & feedback handlers for pg-boss scheduler
// src/scheduler/handlers/quality.ts

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { writeIngestionLog } from "@/lib/jobs/poller/ingestion-log";

// ── qualityFlywheelRecalc ───────────────────────────────────────────────────
// Cron: "0 5 * * 0" (Sun 05:00 UTC)

export async function runQualityFlywheelRecalc(): Promise<void> {
  const { recalculateQualityScores } = await import(
    "@/lib/jobs/quality/quality-flywheel"
  );
  const result = await recalculateQualityScores();

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "quality_flywheel_recalc",
    itemsProcessed: result.companiesScored,
    itemsInserted: 0,
    itemsUpdated: result.promoted + result.demoted,
    itemsRejected: result.purgeCandidates,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── recallAuditCron ─────────────────────────────────────────────────────────
// Cron: "0 2 * * 1" (Mon 02:00 UTC)

export async function runRecallAuditCron(): Promise<void> {
  const { openai } = await import("@ai-sdk/openai");
  const { generateObject } = await import("ai");
  const { z } = await import("zod");

  const gates = ["fence", "natsec", "qa"];
  for (const gate of gates) {
    const samplesResult = await db.execute(sql`
      SELECT j.id, j.normalized_text, j.title, mq.llm_verdict, mq.llm_reasoning
      FROM match_queue mq
      INNER JOIN job j ON mq.job_id = j.id
      WHERE mq.status = 'rejected'
        AND mq.llm_blockers::text LIKE ${"%" + gate + "%"}
        AND mq.evaluated_at > NOW() - INTERVAL '7 days'
      ORDER BY RANDOM()
      LIMIT 30
    `);

    const samples = samplesResult.rows as Array<{
      id: string;
      normalized_text: string | null;
      title: string | null;
      llm_verdict: string | null;
      llm_reasoning: string | null;
    }>;

    let falseRejections = 0;
    for (const sample of samples) {
      try {
        const { object } = await generateObject({
          model: openai("gpt-4o-mini"),
          schema: z.object({
            correctRejection: z.boolean(),
            reason: z.string(),
          }),
          prompt: `Evaluate whether this job rejection was correct.
Job: ${sample.title}
Text: ${sample.normalized_text?.slice(0, 2000) ?? ""}
Verdict: ${sample.llm_verdict}
Reasoning: ${sample.llm_reasoning}
Was rejecting this candidate the correct decision?`,
        });
        if (!object.correctRejection) falseRejections++;
      } catch (error) {
        console.error(`[recall-audit] LLM eval failed:`, error);
      }
    }

    const falseRate = samples.length > 0 ? falseRejections / samples.length : 0;

    if (falseRate > 0.1) {
      console.warn(
        `[recall-audit] Gate "${gate}" false-rejection rate: ${(falseRate * 100).toFixed(1)}% (${falseRejections}/${samples.length})`,
      );
    }
  }
}

// ── falseGlobalScopeSampler ─────────────────────────────────────────────────
// Cron: "0 4 * * 1" (Mon 04:00 UTC)

export async function runFalseGlobalScopeSampler(): Promise<void> {
  const { openai } = await import("@ai-sdk/openai");
  const { generateObject } = await import("ai");
  const { z } = await import("zod");

  const suspectsResult = await db.execute(sql`
    SELECT id, title, location_name, normalized_text
    FROM job
    WHERE status = 'active'
      AND remote_scope = 'global'
      AND location_name IS NOT NULL
      AND location_name NOT IN ('Remote', 'remote', 'Anywhere', 'anywhere', 'Worldwide', 'worldwide')
    ORDER BY RANDOM()
    LIMIT 50
  `);

  const suspects = suspectsResult.rows as Array<{
    id: string;
    title: string | null;
    location_name: string | null;
    normalized_text: string | null;
  }>;

  let falseGlobals = 0;
  for (const s of suspects) {
    try {
      const { object } = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: z.object({
          isGlobal: z.boolean(),
          reason: z.string(),
        }),
        prompt: `Is this job truly global/remote-worldwide, or is it restricted to a specific region?
Title: ${s.title}
Location: ${s.location_name}
Text: ${s.normalized_text?.slice(0, 1500) ?? ""}`,
      });
      if (!object.isGlobal) falseGlobals++;
    } catch (error) {
      console.error(`[false-global-sampler] LLM eval failed:`, error);
    }
  }

  const falseRate = suspects.length > 0 ? falseGlobals / suspects.length : 0;

  if (falseRate > 0.2) {
    console.warn(
      `[false-global-sampler] False-GLOBAL rate: ${(falseRate * 100).toFixed(1)}% (${falseGlobals}/${suspects.length}) — reclassification recommended`,
    );
  }
}
