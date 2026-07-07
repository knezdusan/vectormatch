// @ts-nocheck
// Re-evaluate the 3 work-auth risk matches through Gate 3 directly
// (bypassing Inngest orchestration — same logic, just no event queue).
//
// This calls evaluateGate3() directly, which makes the same OpenAI
// generateObject() call with the new prompt (criterion 7 + workAuthRiskFlag).
// The verdict is then written to match_queue, exactly as the Inngest handler
// would do.
//
// Usage: npx tsx scripts/rerun-gate-3-direct.ts

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "@/db/db";
import { applicant } from "@/db/schemas/jobs/applicant";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { persona } from "@/db/schemas/jobs/persona";

const MATCH_QUEUE_IDS = [
  "63300041-5893-4601-ac45-1f2385ec5672", // Software Mind (Kraków, remote)
  "d0612c50-aedb-4fd6-b528-71ba9455cf80", // Ro (NYC, hybrid)
  "3773ab29-6b13-4d75-a5fc-3879988a1436", // Ssr. Fullstack (Argentina, remote)
];

async function main() {
  console.log("=".repeat(70));
  console.log("Direct Gate 3 re-evaluation (new workAuthRiskFlag logic)");
  console.log(`${"=".repeat(70)}\n`);

  // Dynamic imports to avoid server-only check at module load time
  const { evaluateGate3, mapVerdict } = await import("@/lib/jobs/gate-3");
  const { extractJobContent } = await import("@/lib/jobs/job-normalizer");

  for (const matchQueueId of MATCH_QUEUE_IDS) {
    console.log(`\nProcessing ${matchQueueId}...`);

    // Fetch the match_queue row
    const [mqRow] = await db
      .select({
        id: matchQueue.id,
        jobId: matchQueue.jobId,
        personaId: matchQueue.personaId,
        applicantId: matchQueue.applicantId,
        promptVariant: matchQueue.promptVariant,
        status: matchQueue.status,
      })
      .from(matchQueue)
      .where(eq(matchQueue.id, matchQueueId))
      .limit(1);

    if (!mqRow) {
      console.log(`  SKIP: match_queue row not found`);
      continue;
    }

    // Fetch job, persona, applicant in parallel
    const [jobRows, personaRows, applicantRows] = await Promise.all([
      db
        .select({
          title: job.title,
          rawJson: job.rawJson,
          normalizedText: job.normalizedText,
          atsSource: job.atsSource,
          extractedTags: job.extractedTags,
          workplaceType: job.workplaceType,
          locationName: job.locationName,
          employmentType: job.employmentType,
        })
        .from(job)
        .where(eq(job.id, mqRow.jobId))
        .limit(1),
      db
        .select({
          personaLabel: persona.personaLabel,
          embeddingSummary: persona.embeddingSummary,
          mustHaveTags: persona.mustHaveTags,
          blocklistTags: persona.blocklistTags,
          seniorityLevels: persona.seniorityLevels,
        })
        .from(persona)
        .where(eq(persona.id, mqRow.personaId))
        .limit(1),
      db
        .select({
          allTags: applicant.allTags,
          country: applicant.country,
          canWorkUsHours: applicant.canWorkUsHours,
          preferredCompliance: applicant.preferredCompliance,
          modalities: applicant.modalities,
          assignmentTypes: applicant.assignmentTypes,
          workAuthorizations: applicant.workAuthorizations,
        })
        .from(applicant)
        .where(eq(applicant.userId, mqRow.applicantId))
        .limit(1),
    ]);

    if (
      jobRows.length === 0 ||
      personaRows.length === 0 ||
      applicantRows.length === 0
    ) {
      console.log(`  SKIP: missing job/persona/applicant data`);
      continue;
    }

    const jobContent = extractJobContent({
      rawJson: jobRows[0].rawJson,
      normalizedText: jobRows[0].normalizedText,
    });

    const ctx: Parameters<typeof evaluateGate3>[0] = {
      job: {
        title: jobRows[0].title,
        description: jobContent,
        extractedTags: jobRows[0].extractedTags ?? [],
        workplaceType: jobRows[0].workplaceType as
          | "remote"
          | "hybrid"
          | "on-site"
          | null,
        locationName: jobRows[0].locationName,
        employmentType: jobRows[0].employmentType,
      },
      persona: {
        personaLabel: personaRows[0].personaLabel,
        embeddingSummary: personaRows[0].embeddingSummary,
        mustHaveTags: personaRows[0].mustHaveTags ?? [],
        blocklistTags: personaRows[0].blocklistTags ?? [],
        seniorityLevels: personaRows[0].seniorityLevels ?? [],
      },
      applicant: {
        allTags: applicantRows[0].allTags,
        country: applicantRows[0].country,
        canWorkUsHours: applicantRows[0].canWorkUsHours,
        preferredCompliance: applicantRows[0].preferredCompliance ?? [],
        modalities: applicantRows[0].modalities ?? [],
        assignmentTypes: applicantRows[0].assignmentTypes ?? [],
        workAuthorizations: applicantRows[0].workAuthorizations ?? [],
      },
    };

    const variant = (mqRow.promptVariant ?? "balanced") as
      | "balanced"
      | "strict"
      | "thorough";

    console.log(`  Job: ${jobRows[0].title}`);
    console.log(`  Location: ${jobRows[0].locationName}`);
    console.log(`  Workplace: ${jobRows[0].workplaceType}`);
    console.log(`  Persona: ${personaRows[0].personaLabel}`);
    console.log(`  Variant: ${variant}`);
    console.log(`  Calling Gate 3 LLM (gpt-4o-mini)...`);

    try {
      const verdict = await evaluateGate3(ctx, variant);
      const verdictString = mapVerdict(verdict);

      console.log(`  Verdict: ${verdictString}`);
      console.log(`  Approved: ${verdict.approved}`);
      console.log(`  Confidence: ${verdict.matchConfidence}`);
      console.log(`  workAuthRiskFlag: ${verdict.workAuthRiskFlag}`);
      console.log(`  Reasoning: ${verdict.matchReasoning.slice(0, 200)}`);
      if (verdict.blockers.length > 0) {
        console.log(`  Blockers: ${verdict.blockers.join(", ")}`);
      }

      // Write verdict to match_queue (same as Inngest handler)
      await db
        .update(matchQueue)
        .set({
          status: verdictString,
          llmVerdict: verdictString,
          llmReasoning: verdict.matchReasoning,
          llmConfidence: verdict.matchConfidence,
          llmBlockers: verdict.blockers,
          llmModel: "gpt-4o-mini",
          promptVariant: variant,
          workAuthRiskFlag: verdict.workAuthRiskFlag ?? false,
          evaluatedAt: new Date(),
        })
        .where(eq(matchQueue.id, matchQueueId));

      console.log(`  ✅ Written to match_queue`);
    } catch (err) {
      console.error(`  ❌ Gate 3 failed:`, err);
      // Restore status to approved since the evaluation failed
      await db
        .update(matchQueue)
        .set({ status: "approved" })
        .where(eq(matchQueue.id, matchQueueId));
      console.log(`  Restored status to approved`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log("Done! Refresh the dashboard to see updated verdicts + badges.");
  console.log("=".repeat(70));
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
