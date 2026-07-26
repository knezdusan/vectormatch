// D25: Pipeline runner — replaces the Inngest critical path
// src/scheduler/pipeline.ts
//
// Calls the same internal modules that the Inngest functions used, but
// directly (in-process) instead of via HTTP/Docker DNS. Uses pg-boss only
// for cron scheduling and Gate 3 fan-out.
//
// The critical path becomes:
//   cron:batch-poll-tier → pollCompanies() → for each new job:
//     normalizeJob() → embedJob() → gateRouteJob() →
//       for each candidate: enqueue gate-3-evaluate
//
// All in-process. No HTTP hops. No Docker DNS. No cached step URIs.

import { scheduler } from "./scheduler";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PipelineResult {
  tier: string;
  polled: number;
  newJobs: number;
  normalized: number;
  embedded: number;
  gateCandidates: number;
  gate3Queued: number;
  errors: number;
  storageBlocked: boolean;
}

// ── Batch Poll Tier ──────────────────────────────────────────────────────────

const BATCH_SIZE = 100;
const POLL_CHUNK_SIZE = 10;

type Tier = "active_hot" | "active" | "probation" | "dormant";

/**
 * Determine the tier from the cron expression.
 * Matches the cronToTier function in functions.ts.
 */
function cronToTier(cron: string): Tier {
  if (cron.includes("*/1")) return "active_hot";
  if (cron.includes("*/3")) return "active";
  if (cron.includes("*/6")) return "probation";
  return "dormant";
}

/**
 * Batch Poll Tier — the main ingestion entry point.
 *
 * Polls companies in batches by tier, then for each unnormalized job found,
 * runs the full pipeline (normalize → embed → gate-route → gate-3 fan-out).
 *
 * This replaces the Inngest batchPollTier + jobIngestedHandler chain.
 */
export async function runBatchPollTier(
  cronExpr: string,
): Promise<PipelineResult> {
  const tier = cronToTier(cronExpr);
  const startedAt = new Date();
  console.info(`[pipeline] Batch poll tier="${tier}" started`);

  // Step 1: Check storage safety
  const { isStorageSafeForIngestion } = await import(
    "@/lib/jobs/storage-check"
  );
  const storage = await isStorageSafeForIngestion();
  if (!storage.allow) {
    console.warn(`[pipeline] Batch poll skipped: ${storage.reason}`);
    return {
      tier,
      polled: 0,
      newJobs: 0,
      normalized: 0,
      embedded: 0,
      gateCandidates: 0,
      gate3Queued: 0,
      errors: 0,
      storageBlocked: true,
    };
  }

  // Step 2: Get batch of companies for this tier
  const { getBatchForTier } = await import("@/lib/jobs/poller/tier-queries");
  const companies = await getBatchForTier(tier, BATCH_SIZE);

  if (companies.length === 0) {
    console.info(`[pipeline] No companies to poll for tier="${tier}"`);
    return {
      tier,
      polled: 0,
      newJobs: 0,
      normalized: 0,
      embedded: 0,
      gateCandidates: 0,
      gate3Queued: 0,
      errors: 0,
      storageBlocked: false,
    };
  }

  // Step 3: Poll companies in chunks (rate-limited per ATS)
  const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");
  const { updateCompanyState } = await import(
    "@/lib/jobs/poller/company-state"
  );

  const pollResults: Array<{
    companyId: string;
    atsSource: string;
    atsSlug: string;
    newJobIds: string[];
    error?: string;
  }> = [];

  for (let i = 0; i < companies.length; i += POLL_CHUNK_SIZE) {
    const chunk = companies.slice(i, i + POLL_CHUNK_SIZE);
    for (const c of chunk) {
      try {
        const result = await pollCompany(c.id, c.atsSource, c.atsSlug, fetch);
        pollResults.push({
          companyId: c.id,
          atsSource: c.atsSource,
          atsSlug: c.atsSlug,
          newJobIds: result.newJobIds,
        });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        try {
          await updateCompanyState(c.id, {
            health: "error",
            lastErrorMessage: errorMsg,
            success: false,
          });
        } catch {
          // If updateCompanyState also fails, nothing more we can do.
        }
        pollResults.push({
          companyId: c.id,
          atsSource: c.atsSource,
          atsSlug: c.atsSlug,
          newJobIds: [],
          error: errorMsg,
        });
      }
    }
  }

  const allNewJobIds = pollResults.flatMap((r) => r.newJobIds);
  const errorCount = pollResults.filter((r) => r.error).length;

  // Step 4: Find unnormalized jobs from the polled companies
  const { sql, inArray } = await import("drizzle-orm");
  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");

  const polledSlugs = companies.map((c) => c.atsSlug);
  const polledSources = [...new Set(companies.map((c) => c.atsSource))];

  const unnormalizedJobs = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      atsSlug: job.atsSlug,
    })
    .from(job)
    .where(
      sql`(${job.status} = 'normalization_failed'
           OR (${job.status} = 'active' AND ${job.normalizedAt} IS NULL))
          AND ${job.rawJson} IS NOT NULL
          AND ${inArray(job.atsSource, polledSources)}
          AND ${inArray(job.atsSlug, polledSlugs)}`,
    )
    .orderBy(job.detectedAt)
    .limit(500);

  console.info(
    `[pipeline] Polled ${companies.length} companies, ` +
      `${allNewJobIds.length} new jobs, ${unnormalizedJobs.length} unnormalized`,
  );

  // Step 5: Run the full pipeline for each unnormalized job
  let normalized = 0;
  let embedded = 0;
  let gateCandidates = 0;
  let gate3Queued = 0;

  for (const j of unnormalizedJobs) {
    try {
      const result = await runJobPipeline(j.id);
      if (result.normalized) normalized++;
      if (result.embedded) embedded++;
      gateCandidates += result.candidates;
      gate3Queued += result.gate3Queued;
    } catch (e) {
      console.error(
        `[pipeline] Job ${j.id} pipeline failed:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Step 6: Write ingestion log
  const { writeIngestionLog } = await import("@/lib/jobs/poller/ingestion-log");
  await writeIngestionLog({
    type: "batch_poll",
    status: errorCount > 0 ? "partial" : "success",
    source: `batch_poll_${tier}`,
    itemsProcessed: companies.length,
    itemsInserted: allNewJobIds.length,
    itemsUpdated: 0,
    itemsRejected: errorCount,
    itemsSkipped:
      companies.length -
      pollResults.filter((r) => r.newJobIds.length > 0).length,
    startedAt,
    finishedAt: new Date(),
  });

  console.info(
    `[pipeline] Batch poll complete: tier="${tier}", ` +
      `polled=${companies.length}, newJobs=${allNewJobIds.length}, ` +
      `normalized=${normalized}, embedded=${embedded}, ` +
      `gateCandidates=${gateCandidates}, gate3Queued=${gate3Queued}`,
  );

  return {
    tier,
    polled: companies.length,
    newJobs: allNewJobIds.length,
    normalized,
    embedded,
    gateCandidates,
    gate3Queued,
    errors: errorCount,
    storageBlocked: false,
  };
}

// ── Job Pipeline (normalize → embed → gate-route → gate-3 fan-out) ──────────

export interface JobPipelineResult {
  jobId: string;
  normalized: boolean;
  embedded: boolean;
  candidates: number;
  gate3Queued: number;
  gate05Rejected: boolean;
  pattern: string | null;
  skipped: boolean;
  skipReason: string | null;
}

/**
 * Run the full pipeline for a single job:
 * 1. Fetch job + idempotency decision
 * 2. Normalize (extract text, tags, description)
 * 3. Check company tier + remote scope (may skip embedding)
 * 4. Embed (generate vector embedding)
 * 5. Write normalization results
 * 6. Deterministic remote scope extraction
 * 7. Gate 0.5 (hard blocker pre-filter)
 * 8. Gate 1+2 (GIN overlap + HNSW vector similarity)
 * 9. LLM remote scope upgrade (for viable jobs)
 * 10. Fan out Gate 3 evaluations
 *
 * This replaces the Inngest jobIngestedHandler function.
 */
export async function runJobPipeline(
  jobId: string,
): Promise<JobPipelineResult> {
  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");
  const { eq } = await import("drizzle-orm");
  const { decideNormalizationAction } = await import(
    "@/lib/jobs/job-normalizer"
  );

  // Step 1: Fetch job + idempotency decision
  const rows = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      atsSlug: job.atsSlug,
      title: job.title,
      rawJson: job.rawJson,
      status: job.status,
      normalizedAt: job.normalizedAt,
    })
    .from(job)
    .where(eq(job.id, jobId))
    .limit(1);

  if (rows.length === 0) {
    return {
      jobId,
      normalized: false,
      embedded: false,
      candidates: 0,
      gate3Queued: 0,
      gate05Rejected: false,
      pattern: null,
      skipped: true,
      skipReason: "Job not found in DB",
    };
  }

  const jobRow = rows[0];
  const idempotencyDecision = decideNormalizationAction({
    status: jobRow.status,
    normalizedAt: jobRow.normalizedAt,
  });

  // D18 Idempotency Trap Fix: If already normalized but never routed
  if (idempotencyDecision.action === "skip") {
    if (jobRow.status === "active" && jobRow.normalizedAt !== null) {
      const fullJob = await db
        .select({
          extractedTags: job.extractedTags,
          jobEmbedding: job.jobEmbedding,
        })
        .from(job)
        .where(eq(job.id, jobId))
        .limit(1);

      if (
        fullJob.length > 0 &&
        fullJob[0].jobEmbedding !== null &&
        fullJob[0].extractedTags &&
        fullJob[0].extractedTags.length > 0
      ) {
        // Route-only: skip normalization, go directly to gate routing
        const tags = fullJob[0].extractedTags;
        const embedding = fullJob[0].jobEmbedding as unknown as number[];
        return await gateRouteAndFanOut(jobId, tags, embedding);
      }
    }

    return {
      jobId,
      normalized: false,
      embedded: false,
      candidates: 0,
      gate3Queued: 0,
      gate05Rejected: false,
      pattern: null,
      skipped: true,
      skipReason: idempotencyDecision.reason ?? null,
    };
  }

  // Step 2: Normalize
  const { normalizeJob } = await import("@/lib/jobs/job-normalizer");
  const normalization = await normalizeJob(
    jobRow.atsSource,
    jobRow.rawJson,
    jobRow.title,
  );

  // Step 3: Embed (only if normalized + not probation + not fenced)
  let embedding: number[] | null = null;
  let isFenced = false;
  let isNatsec = false;
  let isQa = false;

  if (normalization.status === "normalized") {
    // Check company tier
    const { company } = await import("@/db/schemas/jobs/company");
    const { sql: sqlImport } = await import("drizzle-orm");
    const tierRows = await db
      .select({ tier: company.tier })
      .from(company)
      .where(
        sqlImport`${company.atsSource}::text = ${jobRow.atsSource}::text AND ${company.atsSlug} = ${jobRow.atsSlug}`,
      )
      .limit(1);
    const companyTier = tierRows[0]?.tier ?? "active";

    // Check remote scope
    const scopeRows = await db
      .select({ remoteScope: job.remoteScope })
      .from(job)
      .where(eq(job.id, jobId))
      .limit(1);
    const jobRemoteScope = scopeRows[0]?.remoteScope ?? "unknown";

    isFenced = ["country_fenced", "region_fenced", "onsite"].includes(
      jobRemoteScope ?? "unknown",
    );

    // D19: Compute natsec flag
    const { isNationalSecurityJob } = await import("@/lib/jobs/gate-zero");
    isNatsec = isNationalSecurityJob(jobRow.title, normalization.fullText);

    // QA detection
    isQa =
      /\b(qa engineer|qa automation|quality assurance|software engineer in test|software development engineer in test|sdet|test automation engineer|automation tester|test engineer|qa lead|quality engineer)\b/i.test(
        jobRow.title,
      );

    if (companyTier === "probation") {
      embedding = null;
    } else if (isFenced) {
      embedding = null;
    } else {
      const { embedJob } = await import("@/lib/jobs/job-embedder");
      embedding = await embedJob(normalization.fullText);
    }
  }

  // Step 4: Write normalization results to DB
  if (normalization.status === "normalized") {
    await db
      .update(job)
      .set({
        extractedTags: normalization.tags,
        jobEmbedding: embedding,
        normalizedText: normalization.fullText,
        descriptionHtml: normalization.htmlDescription,
        rawJson: null,
        normalizedAt: new Date(),
        shortDescription: normalization.summary,
        jobUrl: normalization.jobUrl ?? null,
        isFenced,
        isNatsec,
        isQa,
      })
      .where(eq(job.id, jobId));
  } else if (normalization.status === "rejected") {
    await db
      .update(job)
      .set({
        status: "rejected",
        extractedTags: normalization.tags,
        normalizedText: normalization.fullText,
        descriptionHtml: normalization.htmlDescription,
        rawJson: null,
        normalizedAt: new Date(),
        jobUrl: normalization.jobUrl ?? null,
      })
      .where(eq(job.id, jobId));

    return {
      jobId,
      normalized: true,
      embedded: false,
      candidates: 0,
      gate3Queued: 0,
      gate05Rejected: false,
      pattern: null,
      skipped: false,
      skipReason: null,
    };
  } else {
    // normalization_failed
    console.error(
      `[pipeline] Normalization failed for job ${jobId}:`,
      normalization.error ?? "unknown error",
    );
    await db
      .update(job)
      .set({
        status: "normalization_failed",
        extractedTags: normalization.tags,
        jobUrl: normalization.jobUrl ?? null,
      })
      .where(eq(job.id, jobId));

    return {
      jobId,
      normalized: false,
      embedded: false,
      candidates: 0,
      gate3Queued: 0,
      gate05Rejected: false,
      pattern: null,
      skipped: false,
      skipReason: normalization.error ?? "normalization_failed",
    };
  }

  // If no embedding (probation or fenced), skip gate routing
  if (embedding === null) {
    return {
      jobId,
      normalized: true,
      embedded: false,
      candidates: 0,
      gate3Queued: 0,
      gate05Rejected: false,
      pattern: null,
      skipped: false,
      skipReason: isFenced ? "fenced" : "probation",
    };
  }

  // Step 5: Deterministic remote scope extraction
  try {
    const { extractRemoteScope } = await import(
      "@/lib/jobs/remote-scope-extractor"
    );
    const scopeRows = await db
      .select({
        remoteScope: job.remoteScope,
        workplaceType: job.workplaceType,
        atsSource: job.atsSource,
        locationName: job.locationName,
        normalizedText: job.normalizedText,
      })
      .from(job)
      .where(eq(job.id, jobId))
      .limit(1);

    if (scopeRows.length > 0 && scopeRows[0].remoteScope === "unknown") {
      const scopeResult = await extractRemoteScope(
        scopeRows[0].normalizedText ?? normalization.fullText,
        scopeRows[0].workplaceType as "remote" | "hybrid" | "on-site" | null,
        scopeRows[0].atsSource,
        scopeRows[0].locationName,
        undefined,
        true, // deterministicOnly
      );

      if (scopeResult.remoteScope !== "undetermined") {
        const newlyFenced = [
          "country_fenced",
          "region_fenced",
          "onsite",
        ].includes(scopeResult.remoteScope);

        await db
          .update(job)
          .set({
            remoteScope: scopeResult.remoteScope,
            locationCountries:
              scopeResult.remoteScope === "global"
                ? null
                : scopeResult.allowedCountries,
            ...(newlyFenced ? { jobEmbedding: null } : {}),
          })
          .where(eq(job.id, jobId));

        if (newlyFenced) {
          return {
            jobId,
            normalized: true,
            embedded: true,
            candidates: 0,
            gate3Queued: 0,
            gate05Rejected: false,
            pattern: null,
            skipped: false,
            skipReason: "newly fenced",
          };
        }
      }
    }
  } catch (e) {
    console.warn(
      `[pipeline] Remote scope extraction failed for ${jobId}:`,
      e instanceof Error ? e.message : e,
    );
  }

  // Step 6: Gate 0.5 — Hard blocker pre-filter
  const { runHardBlockerPreFilter } = await import(
    "@/lib/jobs/gate-zero-pre-filter"
  );
  const { applicant } = await import("@/db/schemas/jobs/applicant");

  const applicants = await db
    .select({
      userId: applicant.userId,
      country: applicant.country,
      assignmentTypes: applicant.assignmentTypes,
      preferredCompliance: applicant.preferredCompliance,
      expectedCompMin: applicant.expectedCompMin,
      yearsOfExperience: applicant.yearsOfExperience,
    })
    .from(applicant);

  if (applicants.length > 0) {
    const results = applicants.map((app) =>
      runHardBlockerPreFilter({
        job: {
          title: jobRow.title,
          locationName: null,
          workplaceType: null,
          normalizedText: normalization.fullText,
          titleRegionTag: null,
          locationCountries: null,
          experienceMinYears: null,
          experienceMaxYears: null,
          compensationMin: null,
          compensationMax: null,
          compensationCurrency: null,
          remoteScope: "unknown" as const,
        },
        applicant: {
          country: app.country,
          assignmentTypes: app.assignmentTypes ?? [],
          preferredCompliance: app.preferredCompliance ?? [],
          expectedCompMin:
            app.expectedCompMin !== null ? Number(app.expectedCompMin) : null,
          yearsOfExperience: app.yearsOfExperience,
        },
        excludedCountries: new Set<string>(),
      }),
    );

    const anyPass = results.some((r) => r.passes);
    if (!anyPass) {
      const firstFailure = results.find((r) => !r.passes);
      await db
        .update(job)
        .set({
          status: "rejected",
          rejectionPattern: firstFailure?.patternDetected ?? null,
          normalizedAt: new Date(),
        })
        .where(eq(job.id, jobId));

      return {
        jobId,
        normalized: true,
        embedded: true,
        candidates: 0,
        gate3Queued: 0,
        gate05Rejected: true,
        pattern: firstFailure?.patternDetected ?? null,
        skipped: false,
        skipReason: null,
      };
    }
  }

  // Step 7: Gate 1+2 + fan out
  return await gateRouteAndFanOut(jobId, normalization.tags, embedding);
}

/**
 * Gate 1+2 SQL router + Gate 3 fan-out.
 * Shared between the normal pipeline and the route-only recovery path.
 */
async function gateRouteAndFanOut(
  jobId: string,
  tags: string[],
  embedding: number[],
): Promise<JobPipelineResult> {
  const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
  const candidates = await runGateSQLRouter(jobId, tags, embedding);

  if (candidates.length === 0) {
    return {
      jobId,
      normalized: true,
      embedded: true,
      candidates: 0,
      gate3Queued: 0,
      gate05Rejected: false,
      pattern: null,
      skipped: false,
      skipReason: null,
    };
  }

  // LLM remote scope upgrade (only for viable jobs with unknown scope)
  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");
  const { eq } = await import("drizzle-orm");

  const scopeRows = await db
    .select({
      remoteScope: job.remoteScope,
      workplaceType: job.workplaceType,
      atsSource: job.atsSource,
      locationName: job.locationName,
      normalizedText: job.normalizedText,
    })
    .from(job)
    .where(eq(job.id, jobId))
    .limit(1);

  if (scopeRows.length > 0 && scopeRows[0].remoteScope === "unknown") {
    try {
      const { extractRemoteScope } = await import(
        "@/lib/jobs/remote-scope-extractor"
      );
      const scopeResult = await extractRemoteScope(
        scopeRows[0].normalizedText ?? "",
        scopeRows[0].workplaceType as "remote" | "hybrid" | "on-site" | null,
        scopeRows[0].atsSource,
        scopeRows[0].locationName,
      );

      await db
        .update(job)
        .set({
          remoteScope: scopeResult.remoteScope,
          locationCountries:
            scopeResult.remoteScope === "global"
              ? null
              : scopeResult.allowedCountries,
        })
        .where(eq(job.id, jobId));
    } catch (e) {
      console.warn(
        `[pipeline] LLM remote scope upgrade failed for ${jobId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  // Fan out Gate 3 evaluations via pg-boss
  for (const c of candidates) {
    await scheduler.send("match/gate-3-evaluate", {
      matchQueueId: c.matchQueueId,
      jobId,
      personaId: c.personaId,
      applicantId: c.applicantId,
    });
  }

  return {
    jobId,
    normalized: true,
    embedded: true,
    candidates: candidates.length,
    gate3Queued: candidates.length,
    gate05Rejected: false,
    pattern: null,
    skipped: false,
    skipReason: null,
  };
}

// ── Gate 3 Evaluator ─────────────────────────────────────────────────────────

/**
 * Gate 3 — LLM Candidate Evaluation.
 * Replaces the Inngest gate3Evaluator function.
 */
export async function runGate3Evaluation(
  matchQueueId: string,
  jobId: string,
  personaId: string,
  applicantId: string,
): Promise<{ status: string; reason: string | null }> {
  const { db } = await import("@/db/db");
  const { job } = await import("@/db/schemas/jobs/job");
  const { persona } = await import("@/db/schemas/jobs/persona");
  const { applicant } = await import("@/db/schemas/jobs/applicant");
  const { matchQueue } = await import("@/db/schemas/jobs/matchQueue");
  const { eq } = await import("drizzle-orm");

  // Idempotency check
  const mqRows = await db
    .select({ status: matchQueue.status })
    .from(matchQueue)
    .where(eq(matchQueue.id, matchQueueId))
    .limit(1);

  if (mqRows.length === 0) {
    return { status: "error", reason: "matchQueue row not found" };
  }

  if (mqRows[0].status !== "pending") {
    return { status: mqRows[0].status, reason: "already evaluated" };
  }

  // Fetch context (same query pattern as the Inngest function)
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
        remoteScope: job.remoteScope,
        locationCountries: job.locationCountries,
      })
      .from(job)
      .where(eq(job.id, jobId))
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
      .where(eq(persona.id, personaId))
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
      .where(eq(applicant.userId, applicantId))
      .limit(1),
  ]);

  if (
    jobRows.length === 0 ||
    personaRows.length === 0 ||
    applicantRows.length === 0
  ) {
    await db
      .update(matchQueue)
      .set({ status: "error", evaluatedAt: new Date() })
      .where(eq(matchQueue.id, matchQueueId));
    return { status: "error", reason: "missing context" };
  }

  // Extract job content
  const { extractJobContent } = await import("@/lib/jobs/job-normalizer");
  const extracted = extractJobContent(
    jobRows[0].atsSource,
    jobRows[0].rawJson,
    jobRows[0].title,
    jobRows[0].normalizedText,
  );

  // Pick prompt variant
  const {
    pickPromptVariant,
    evaluateGate3,
    mapVerdict,
    classifyRejectionReason,
  } = await import("@/lib/jobs/gate-3");
  const promptVariant = pickPromptVariant();

  // Build context for the LLM
  const gate3Context = {
    job: {
      title: jobRows[0].title,
      description: extracted.description,
      extractedTags: jobRows[0].extractedTags ?? [],
      workplaceType: jobRows[0].workplaceType,
      locationName: jobRows[0].locationName,
      employmentType: jobRows[0].employmentType,
      remoteScope: jobRows[0].remoteScope as
        | "global"
        | "country_fenced"
        | "region_fenced"
        | "onsite"
        | "unknown"
        | "undetermined"
        | null,
      locationCountries: jobRows[0].locationCountries ?? null,
    },
    persona: {
      personaLabel: personaRows[0].personaLabel,
      embeddingSummary: personaRows[0].embeddingSummary,
      mustHaveTags: personaRows[0].mustHaveTags,
      blocklistTags: personaRows[0].blocklistTags,
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

  // Run the LLM evaluation
  try {
    const verdict = await evaluateGate3(gate3Context, promptVariant);
    const verdictString = mapVerdict(verdict);

    // Write verdict to DB
    await db
      .update(matchQueue)
      .set({
        status: verdictString,
        llmVerdict: verdictString,
        llmReasoning: verdict.matchReasoning,
        llmConfidence: verdict.matchConfidence,
        llmBlockers: verdict.blockers,
        rejectionReason:
          verdictString === "rejected"
            ? classifyRejectionReason(verdict.blockers)
            : null,
        llmModel: "gpt-4o-mini",
        promptVariant: promptVariant,
        workAuthRiskFlag: verdict.workAuthRiskFlag ?? false,
        evaluatedAt: new Date(),
      })
      .where(eq(matchQueue.id, matchQueueId));

    // Emit match/approved if approved
    if (verdict.approved) {
      await scheduler.send("match/approved", {
        matchQueueId,
        jobId,
        applicantId,
        personaId,
      });
    }

    return {
      status: verdictString,
      reason: verdict.matchReasoning ?? null,
    };
  } catch (e) {
    console.error(
      `[pipeline] Gate 3 evaluation failed for ${matchQueueId}:`,
      e instanceof Error ? e.message : e,
    );

    await db
      .update(matchQueue)
      .set({ status: "error", evaluatedAt: new Date() })
      .where(eq(matchQueue.id, matchQueueId));

    return {
      status: "error",
      reason: e instanceof Error ? e.message : String(e),
    };
  }
}

// ── Pending Queue Sweep ──────────────────────────────────────────────────────

/**
 * Pending Queue Sweep — finds active+embedded jobs without match_queue
 * entries and routes them through Gate 1+2 → Gate 3.
 * Replaces the Inngest pendingQueueSweep function.
 */
export async function runPendingQueueSweep(): Promise<{
  swept: number;
  gate3Queued: number;
}> {
  const { db } = await import("@/db/db");
  const { sql } = await import("drizzle-orm");

  // Find pending match_queue rows older than 10 minutes
  const pendingRows = await db.execute(sql`
    SELECT id, job_id, persona_id, applicant_id
    FROM match_queue
    WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '10 minutes'
    LIMIT 50
  `);

  const pending = pendingRows.rows as Array<{
    id: string;
    job_id: string;
    persona_id: string;
    applicant_id: string;
  }>;

  // Also find unmatched jobs (active, embedded, no match_queue entry)
  const unmatchedJobs = await db.execute(sql`
    SELECT j.id, j.extracted_tags, j.job_embedding
    FROM job j
    WHERE j.status = 'active'
      AND j.remote_scope = 'global'
      AND j.is_fenced = false
      AND j.job_embedding IS NOT NULL
      AND j.id NOT IN (SELECT job_id FROM match_queue)
    LIMIT 100
  `);

  const unmatched = unmatchedJobs.rows as Array<{
    id: string;
    extracted_tags: string[] | null;
    job_embedding: string | null;
  }>;

  // Process stuck pending matches
  let gate3Queued = 0;
  for (const row of pending) {
    await scheduler.send("match/gate-3-evaluate", {
      matchQueueId: row.id,
      jobId: row.job_id,
      personaId: row.persona_id,
      applicantId: row.applicant_id,
    });
    gate3Queued++;
  }

  // Process unmatched jobs
  for (const row of unmatched) {
    try {
      const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
      const tags = row.extracted_tags ?? [];
      const embedding = row.job_embedding ? JSON.parse(row.job_embedding) : [];

      const candidates = await runGateSQLRouter(row.id, tags, embedding);

      for (const c of candidates) {
        await scheduler.send("match/gate-3-evaluate", {
          matchQueueId: c.matchQueueId,
          jobId: row.id,
          personaId: c.personaId,
          applicantId: c.applicantId,
        });
        gate3Queued++;
      }
    } catch (e) {
      console.error(
        `[pipeline] Pending sweep failed for job ${row.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  console.info(
    `[pipeline] Pending queue sweep: ${pending.length} stuck, ` +
      `${unmatched.length} unmatched, ${gate3Queued} gate-3 queued`,
  );

  return { swept: pending.length + unmatched.length, gate3Queued };
}

// ── Direct Job Board Ingestion ───────────────────────────────────────────────

/**
 * Board definition for the remote-native ingestion pipeline.
 * D26: The strategic inversion — discover global JOBS directly from
 * remote-native boards with worldwide filters ON, rather than discovering
 * companies and classifying each job's scope post-hoc.
 */
interface BoardDef {
  name: string;
  atsSource: string;
  atsSlug: string;
  maxJobs: number;
  /** Fetch function — returns DirectFetchResult or WellfoundFetchResult */
  fetch: () => Promise<{
    success: boolean;
    jobs: Array<Record<string, unknown>>;
    error?: string;
    employers?: Array<Record<string, unknown>>;
  }>;
}

/**
 * Direct Job Board Ingestion — fetches jobs from ALL remote-native boards
 * and runs the pipeline for each new job.
 *
 * D26: Expanded from 2 boards (RemoteOK + Wellfound) to all 8 active
 * remote-native boards. This is the strategic inversion — the remote-native
 * boards are 100% remote-first by construction, so their fence rate is
 * structurally lower than ATS-polled companies (71% fenced).
 *
 * Boards called (in priority order):
 *   1. Himalayas (worldwideOnly=true — ~1,393 genuinely-global jobs)
 *   2. RemoteOK (worldwide filter in location field)
 *   3. WeWorkRemotely (RSS, worldwide filter in region field)
 *   4. Remotive (API, worldwide filter in candidate_required_location)
 *   5. Arbeitnow (API, all remote jobs marked global)
 *   6. Wellfound (FlareSolverr, startup/frontend-heavy)
 *   7. Remote.com (Playwright, EOR talent board)
 *   8. LaraJobs (PHP/Laravel persona channel, small volume)
 */
export async function runDirectJobBoardIngestion(): Promise<{
  ingested: number;
  normalized: number;
  gate3Queued: number;
}> {
  const { upsertDirectJobs } = await import(
    "@/lib/jobs/direct-ingestion/upsert"
  );
  const { hasPersonaTechOverlap } = await import(
    "@/lib/jobs/direct-ingestion/filter"
  );
  const { passesGateZeroWebDev } = await import("@/lib/jobs/gate-zero");

  const roleScoped = process.env.ROLE_SCOPED_INGESTION === "true";
  const techFilter = (j: {
    tags: string[];
    title: string;
    description: string;
  }) => {
    if (roleScoped && !passesGateZeroWebDev(j.title)) return false;
    return hasPersonaTechOverlap(j.tags, j.title, j.description);
  };

  // ── Build board definitions ────────────────────────────────────────────
  // Lazy imports to avoid loading all adapters at module level.
  const boards: BoardDef[] = [];

  // Board 1: Himalayas (worldwideOnly=true — the cleanest global slice)
  boards.push({
    name: "Himalayas",
    atsSource: "himalayas",
    atsSlug: "himalayas",
    maxJobs: 500,
    fetch: async () => {
      const { fetchHimalayasJobs } = await import(
        "@/lib/jobs/direct-ingestion/himalayas"
      );
      const r = await fetchHimalayasJobs(500, techFilter, undefined, true);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 2: RemoteOK
  boards.push({
    name: "RemoteOK",
    atsSource: "remoteok_direct",
    atsSlug: "remoteok_direct",
    maxJobs: 500,
    fetch: async () => {
      const { fetchRemoteOKJobs } = await import(
        "@/lib/jobs/direct-ingestion/remoteok"
      );
      const r = await fetchRemoteOKJobs(500, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 3: WeWorkRemotely
  boards.push({
    name: "WeWorkRemotely",
    atsSource: "weworkremotely",
    atsSlug: "weworkremotely",
    maxJobs: 200,
    fetch: async () => {
      const { fetchWeWorkRemotelyJobs } = await import(
        "@/lib/jobs/direct-ingestion/weworkremotely"
      );
      const r = await fetchWeWorkRemotelyJobs(200, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 4: Remotive
  boards.push({
    name: "Remotive",
    atsSource: "remotive",
    atsSlug: "remotive",
    maxJobs: 500,
    fetch: async () => {
      const { fetchRemotiveJobs } = await import(
        "@/lib/jobs/direct-ingestion/remotive"
      );
      const r = await fetchRemotiveJobs(500, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 5: Arbeitnow
  boards.push({
    name: "Arbeitnow",
    atsSource: "arbeitnow",
    atsSlug: "arbeitnow",
    maxJobs: 500,
    fetch: async () => {
      const { fetchArbeitnowJobs } = await import(
        "@/lib/jobs/direct-ingestion/arbeitnow"
      );
      const r = await fetchArbeitnowJobs(500, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 6: Wellfound (FlareSolverr-based, dual-function employer harvest)
  boards.push({
    name: "Wellfound",
    atsSource: "wellfound",
    atsSlug: "wellfound",
    maxJobs: 500,
    fetch: async () => {
      const { fetchWellfoundJobs } = await import(
        "@/lib/jobs/direct-ingestion/wellfound"
      );
      const r = await fetchWellfoundJobs(500, techFilter, 10);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
        employers: r.success
          ? (r.employers as unknown as Array<Record<string, unknown>>)
          : undefined,
      };
    },
  });

  // Board 7: Remote.com (Playwright-based)
  boards.push({
    name: "Remote.com",
    atsSource: "remotecom",
    atsSlug: "remotecom",
    maxJobs: 500,
    fetch: async () => {
      const { fetchRemoteComJobs } = await import(
        "@/lib/jobs/direct-ingestion/remotecom"
      );
      const r = await fetchRemoteComJobs(500, techFilter, 15);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 8: LaraJobs (PHP/Laravel persona channel)
  boards.push({
    name: "LaraJobs",
    atsSource: "larajobs",
    atsSlug: "larajobs",
    maxJobs: 50,
    fetch: async () => {
      const { fetchLaraJobsJobs } = await import(
        "@/lib/jobs/direct-ingestion/larajobs"
      );
      const r = await fetchLaraJobsJobs(50, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 9: Working Nomads (D26 — RSS, remote-first)
  boards.push({
    name: "Working Nomads",
    atsSource: "workingnomads",
    atsSlug: "workingnomads",
    maxJobs: 200,
    fetch: async () => {
      const { fetchWorkingNomadsJobs } = await import(
        "@/lib/jobs/direct-ingestion/workingnomads"
      );
      const r = await fetchWorkingNomadsJobs(200, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 10: 4dayweek.io (D26 — API, remote-first, 4-day work week)
  boards.push({
    name: "4dayweek.io",
    atsSource: "fourdayweek",
    atsSlug: "fourdayweek",
    maxJobs: 200,
    fetch: async () => {
      const { fetchFourDayWeekJobs } = await import(
        "@/lib/jobs/direct-ingestion/fourdayweek"
      );
      const r = await fetchFourDayWeekJobs(200, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // Board 11: Remote.co (D26 — HTML scrape, remote-first)
  boards.push({
    name: "Remote.co",
    atsSource: "remoteco",
    atsSlug: "remoteco",
    maxJobs: 200,
    fetch: async () => {
      const { fetchRemoteCoJobs } = await import(
        "@/lib/jobs/direct-ingestion/remoteco"
      );
      const r = await fetchRemoteCoJobs(200, techFilter);
      return {
        success: r.success,
        jobs: r.success
          ? (r.jobs as unknown as Array<Record<string, unknown>>)
          : [],
        error: r.success ? undefined : r.error,
      };
    },
  });

  // ── Fetch and ingest each board ────────────────────────────────────────
  let totalIngested = 0;
  let totalNormalized = 0;
  let totalGate3Queued = 0;
  const boardResults: Array<{
    board: string;
    fetched: number;
    new: number;
    error: string | null;
  }> = [];

  for (const board of boards) {
    try {
      const result = await board.fetch();

      if (!result.success) {
        console.warn(`[pipeline] ${board.name} fetch failed: ${result.error}`);
        boardResults.push({
          board: board.name,
          fetched: 0,
          new: 0,
          error: result.error ?? "unknown",
        });
        continue;
      }

      if (result.jobs.length === 0) {
        boardResults.push({
          board: board.name,
          fetched: 0,
          new: 0,
          error: null,
        });
        continue;
      }

      // Log employer harvest for Wellfound
      if (result.employers && result.employers.length > 0) {
        console.info(
          `[pipeline] ${board.name}: ${result.jobs.length} jobs, ` +
            `${result.employers.length} employers harvested`,
        );
      }

      const upsertResult = await upsertDirectJobs(
        board.atsSource as Parameters<typeof upsertDirectJobs>[0],
        board.atsSlug,
        result.jobs as unknown as Parameters<typeof upsertDirectJobs>[2],
      );

      console.info(
        `[pipeline] ${board.name}: ${result.jobs.length} fetched, ` +
          `${upsertResult.newJobIds.length} new, ${upsertResult.updatedCount} updated`,
      );

      // Run the pipeline for each new job
      for (const jobId of upsertResult.newJobIds) {
        try {
          const pipelineResult = await runJobPipeline(jobId);
          if (pipelineResult.normalized) totalNormalized++;
          totalGate3Queued += pipelineResult.gate3Queued;
        } catch (e) {
          console.error(
            `[pipeline] ${board.name} pipeline failed for ${jobId}:`,
            e instanceof Error ? e.message : e,
          );
        }
      }

      totalIngested += upsertResult.newJobIds.length;
      boardResults.push({
        board: board.name,
        fetched: result.jobs.length,
        new: upsertResult.newJobIds.length,
        error: null,
      });
    } catch (e) {
      console.error(
        `[pipeline] ${board.name} ingestion error:`,
        e instanceof Error ? e.message : e,
      );
      boardResults.push({
        board: board.name,
        fetched: 0,
        new: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ── Summary log ────────────────────────────────────────────────────────
  const breakdown = boardResults
    .map(
      (r) =>
        `${r.board}=${r.fetched}|new=${r.new}${r.error ? `(${r.error.slice(0, 80)})` : ""}`,
    )
    .join("; ");

  console.info(
    `[pipeline] Direct ingestion complete: ${totalIngested} ingested, ` +
      `${totalNormalized} normalized, ${totalGate3Queued} gate-3 queued`,
  );
  console.info(`[pipeline] Per-board: ${breakdown}`);

  return {
    ingested: totalIngested,
    normalized: totalNormalized,
    gate3Queued: totalGate3Queued,
  };
}
