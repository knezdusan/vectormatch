// One-off analysis script: pull all approved matches for the onboarded user
// along with full job + persona context, then emit a JSON report to stdout.
//
// Run with:  npx tsx scripts/analyze-approved-matches.ts
//
// Reads DATABASE_URL from .env (Next.js loads .env automatically; tsx does not,
// so we load it manually with dotenv-style parsing).

import { Pool } from "@neondatabase/serverless";
import { config } from "dotenv";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { applicant } from "../src/db/schemas/jobs/applicant";
import { job } from "../src/db/schemas/jobs/job";
import { matchQueue } from "../src/db/schemas/jobs/matchQueue";
import { persona } from "../src/db/schemas/jobs/persona";

config();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const db = drizzle(pool);

  // Find the onboarded applicant(s). If multiple, list them and pick the one
  // with the most approved matches (most likely the user).
  const applicants = await db
    .select({
      userId: applicant.userId,
      isOnboarded: applicant.isOnboarded,
      country: applicant.country,
      canWorkUsHours: applicant.canWorkUsHours,
      assignmentTypes: applicant.assignmentTypes,
      modalities: applicant.modalities,
      preferredCompliance: applicant.preferredCompliance,
      allTags: applicant.allTags,
    })
    .from(applicant);

  if (applicants.length === 0) {
    console.error("No applicants found in the database.");
    await pool.end();
    return;
  }

  // For each applicant, count approved matches; pick the one with the most.
  let bestUser = applicants[0];
  let bestCount = -1;
  for (const a of applicants) {
    const cnt = await db
      .select({ id: matchQueue.id })
      .from(matchQueue)
      .where(
        and(
          eq(matchQueue.applicantId, a.userId),
          eq(matchQueue.status, "approved"),
        ),
      );
    if (cnt.length > bestCount) {
      bestCount = cnt.length;
      bestUser = a;
    }
  }

  const userId = bestUser.userId;
  console.error(`\n[info] Selected applicant: ${userId}`);
  console.error(`[info] Approved matches: ${bestCount}`);
  console.error(`[info] Onboarded: ${bestUser.isOnboarded}`);

  // Fetch personas for this user
  const personas = await db
    .select()
    .from(persona)
    .where(eq(persona.applicantId, userId));

  // Fetch approved matches joined with job + persona
  const matches = await db
    .select({
      matchQueueId: matchQueue.id,
      jobId: matchQueue.jobId,
      personaId: matchQueue.personaId,
      overlapScore: matchQueue.overlapScore,
      cosineDistance: matchQueue.cosineDistance,
      status: matchQueue.status,
      llmVerdict: matchQueue.llmVerdict,
      llmReasoning: matchQueue.llmReasoning,
      llmConfidence: matchQueue.llmConfidence,
      llmBlockers: matchQueue.llmBlockers,
      llmModel: matchQueue.llmModel,
      evaluatedAt: matchQueue.evaluatedAt,
      isRead: matchQueue.isRead,
      createdAt: matchQueue.createdAt,
      // job fields
      jobTitle: job.title,
      jobAtsSource: job.atsSource,
      jobAtsSlug: job.atsSlug,
      jobStatus: job.status,
      jobExtractedTags: job.extractedTags,
      jobWorkplaceType: job.workplaceType,
      jobEmploymentType: job.employmentType,
      jobLocationName: job.locationName,
      jobDepartment: job.department,
      jobTeam: job.team,
      jobApplyUrl: job.applyUrl,
      jobPublishedAt: job.publishedAt,
      jobCompanyName: job.companyName,
      jobRawJson: job.rawJson,
      jobLastSeenAt: job.lastSeenAt,
      // persona fields
      personaLabel: persona.personaLabel,
      personaIdRaw: persona.personaId,
      personaEmbeddingSummary: persona.embeddingSummary,
      personaMustHaveTags: persona.mustHaveTags,
      personaBlocklistTags: persona.blocklistTags,
    })
    .from(matchQueue)
    .innerJoin(job, eq(matchQueue.jobId, job.id))
    .innerJoin(persona, eq(matchQueue.personaId, persona.id))
    .where(
      and(
        eq(matchQueue.applicantId, userId),
        eq(matchQueue.status, "approved"),
      ),
    )
    .orderBy(desc(matchQueue.createdAt));

  const report = {
    generatedAt: new Date().toISOString(),
    applicant: {
      userId,
      isOnboarded: bestUser.isOnboarded,
      country: bestUser.country,
      canWorkUsHours: bestUser.canWorkUsHours,
      assignmentTypes: bestUser.assignmentTypes,
      modalities: bestUser.modalities,
      preferredCompliance: bestUser.preferredCompliance,
      allTags: bestUser.allTags,
    },
    personas: personas.map((p) => ({
      id: p.id,
      personaId: p.personaId,
      personaLabel: p.personaLabel,
      embeddingSummary: p.embeddingSummary,
      mustHaveTags: p.mustHaveTags,
      blocklistTags: p.blocklistTags,
    })),
    approvedMatches: matches.map((m) => ({
      matchQueueId: m.matchQueueId,
      createdAt: m.createdAt,
      evaluatedAt: m.evaluatedAt,
      isRead: m.isRead,
      match: {
        overlapScore: m.overlapScore,
        cosineDistance: m.cosineDistance,
        llmVerdict: m.llmVerdict,
        llmConfidence: m.llmConfidence,
        llmReasoning: m.llmReasoning,
        llmBlockers: m.llmBlockers,
        llmModel: m.llmModel,
      },
      persona: {
        personaId: m.personaIdRaw,
        personaLabel: m.personaLabel,
        embeddingSummary: m.personaEmbeddingSummary,
        mustHaveTags: m.personaMustHaveTags,
        blocklistTags: m.personaBlocklistTags,
      },
      job: {
        id: m.jobId,
        title: m.jobTitle,
        atsSource: m.jobAtsSource,
        atsSlug: m.jobAtsSlug,
        status: m.jobStatus,
        companyName: m.jobCompanyName,
        workplaceType: m.jobWorkplaceType,
        employmentType: m.jobEmploymentType,
        locationName: m.jobLocationName,
        department: m.jobDepartment,
        team: m.jobTeam,
        applyUrl: m.jobApplyUrl,
        publishedAt: m.jobPublishedAt,
        lastSeenAt: m.jobLastSeenAt,
        extractedTags: m.jobExtractedTags,
        rawJson: m.jobRawJson,
      },
    })),
  };

  console.log(JSON.stringify(report, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
