// D27: Maintenance & sweep handlers for pg-boss scheduler
// src/scheduler/handlers/maintenance.ts

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { job } from "@/db/schemas/jobs/job";
import {
  deleteAncientJobs,
  deleteExhaustedSluggerRetries,
  deleteGoneJobs,
  deleteNormalizationFailedJobs,
  deleteOldIngestionLogs,
  deleteOldTerminalMatches,
  deleteRejectedJobs,
} from "@/lib/jobs/poller/cleanup-queries";
import { writeIngestionLog } from "@/lib/jobs/poller/ingestion-log";
import { markStaleJobs } from "@/lib/jobs/poller/job-repository";
import { recalculateTiers } from "@/lib/jobs/poller/tier-queries";
import {
  getApprovedMatchesForVerification,
  markMatchesStale,
} from "@/lib/jobs/stale-job-queries";
import { verifyJobExists } from "@/lib/jobs/verify-job-exists";
import { cleanupOrphanedCvUploads } from "@/lib/onboarding/cleanup-cv-uploads";
import { scheduler } from "../scheduler";

// ── normalizationRetrySweep ─────────────────────────────────────────────────
// Cron: "0 2 * * 3" (Wed 02:00 UTC)

export async function runNormalizationRetrySweep(): Promise<void> {
  const stuckJobs = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      atsSlug: job.atsSlug,
    })
    .from(job)
    .where(
      sql`(${job.status} = 'normalization_failed'
           OR (${job.status} = 'active' AND ${job.normalizedAt} IS NULL))
          AND ${job.rawJson} IS NOT NULL`,
    )
    .orderBy(job.detectedAt)
    .limit(2000);

  if (stuckJobs.length > 0) {
    await scheduler.sendBatch(
      stuckJobs.map((j) => ({
        id: `job-ingested-retry-${j.id}-${Date.now()}`,
        name: "job/ingested",
        data: {
          jobId: j.id,
          atsSource: j.atsSource,
          atsSlug: j.atsSlug,
          isNew: false,
        },
      })),
    );
  }

  await writeIngestionLog({
    type: "tier_recalc",
    status: "success",
    source: "normalization_retry_sweep",
    itemsProcessed: stuckJobs.length,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── nightlyResurrectionSweep ────────────────────────────────────────────────
// Cron: "0 2 * * 4" (Thu 02:00 UTC)

export async function runNightlyResurrectionSweep(): Promise<void> {
  const { extractRemoteScope } = await import(
    "@/lib/jobs/remote-scope-extractor"
  );
  const { extractJobContent } = await import("@/lib/jobs/job-normalizer");

  const candidates = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      rawJson: job.rawJson,
      normalizedText: job.normalizedText,
      workplaceType: job.workplaceType,
    })
    .from(job)
    .where(
      sql`${job.status} = 'active'
          AND (${job.remoteScope} = 'undetermined' OR ${job.remoteScope} = 'unknown')
          AND (${job.rawJson} IS NOT NULL OR ${job.normalizedText} IS NOT NULL)`,
    )
    .limit(500);

  let reclassified = 0;
  const BATCH = 25;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    for (const j of batch) {
      try {
        const content = extractJobContent(
          j.atsSource,
          j.rawJson,
          j.normalizedText ?? "",
          j.normalizedText,
        );
        const scopeResult = await extractRemoteScope(
          content.fullText,
          j.workplaceType as "remote" | "hybrid" | "on-site" | null,
          j.atsSource,
          null,
        );
        await db
          .update(job)
          .set({ remoteScope: scopeResult.remoteScope })
          .where(sql`${job.id} = ${j.id}`);
        reclassified++;
      } catch (error) {
        console.error(`[resurrection-sweep] Failed for job ${j.id}:`, error);
      }
    }
  }

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "nightly_resurrection_sweep",
    itemsProcessed: candidates.length,
    itemsInserted: 0,
    itemsUpdated: reclassified,
    itemsRejected: 0,
    itemsSkipped: candidates.length - reclassified,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── nightlyStaleClassificationSweep ─────────────────────────────────────────
// Cron: "0 2 * * 5" (Fri 02:00 UTC)

export async function runNightlyStaleClassificationSweep(): Promise<void> {
  const candidates = await db.execute(sql`
    SELECT id, location_name, normalized_text
    FROM job
    WHERE status = 'active'
      AND remote_scope = 'global'
      AND location_name IS NOT NULL
      AND location_name NOT IN ('Remote', 'remote', 'Anywhere', 'anywhere', 'Worldwide', 'worldwide')
      AND (normalized_text IS NULL OR normalized_text !~* 'global|worldwide|anywhere|remote-only')
    LIMIT 500
  `);

  const rows = candidates.rows as Array<{
    id: string;
    location_name: string;
    normalized_text: string | null;
  }>;
  let reclassified = 0;
  const BATCH = 50;
  const regionKeywords = [
    "emea",
    "apac",
    "latam",
    "americas",
    "europe",
    "asia",
    "africa",
  ];

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const r of batch) {
      const loc = r.location_name.toLowerCase();
      const newScope = regionKeywords.some((k) => loc.includes(k))
        ? "region_fenced"
        : "country_fenced";
      await db.execute(sql`
        UPDATE job
        SET remote_scope = ${newScope}, job_embedding = NULL
        WHERE id = ${r.id}
      `);
      reclassified++;
    }
  }

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "nightly_stale_classification_sweep",
    itemsProcessed: rows.length,
    itemsInserted: 0,
    itemsUpdated: reclassified,
    itemsRejected: 0,
    itemsSkipped: rows.length - reclassified,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── tierRecalc ──────────────────────────────────────────────────────────────
// Cron: "0 3 * * 0" (Sun 03:00 UTC)

export async function runTierRecalc(): Promise<void> {
  const companiesRecalculated = await recalculateTiers();
  await writeIngestionLog({
    type: "tier_recalc",
    status: "success",
    source: "tier_recalc",
    itemsProcessed: companiesRecalculated,
    itemsInserted: 0,
    itemsUpdated: companiesRecalculated,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── staleCleanup ────────────────────────────────────────────────────────────
// Cron: "0 2 * * 1" (Mon 02:00 UTC)

export async function runStaleCleanup(): Promise<void> {
  const result = await markStaleJobs();
  await writeIngestionLog({
    type: "stale_cleanup",
    status: "success",
    source: "stale_cleanup",
    itemsProcessed: result.staleMarked + result.goneMarked,
    itemsInserted: 0,
    itemsUpdated: result.staleMarked + result.goneMarked,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── staleJobVerifier ────────────────────────────────────────────────────────
// Cron: "0 10 * * *" (daily 10:00 UTC)

export async function runStaleJobVerifier(): Promise<void> {
  const matches = await getApprovedMatchesForVerification(30);
  const toMarkStale: string[] = [];
  for (const m of matches) {
    try {
      const result = await verifyJobExists(
        m.atsSource as never,
        m.atsSlug,
        m.externalJobId,
      );
      if (!result.exists) toMarkStale.push(m.matchId);
    } catch (error) {
      console.error(
        `[stale-job-verifier] Failed for match ${m.matchId}:`,
        error,
      );
    }
  }
  if (toMarkStale.length > 0) {
    await markMatchesStale(toMarkStale);
  }
  await writeIngestionLog({
    type: "stale_cleanup",
    status: "success",
    source: "stale_job_verifier",
    itemsProcessed: matches.length,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: matches.length - toMarkStale.length,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── companyRevivalSweep ─────────────────────────────────────────────────────
// Cron: "0 2 * * 2" (Tue 02:00 UTC)

export async function runCompanyRevivalSweep(): Promise<void> {
  const result = await db
    .update(company)
    .set({
      pollingEnabled: true,
      health: "healthy",
      consecutiveFailures: 0,
    })
    .where(
      sql`${company.health} = 'dead'
          AND ${company.pollingEnabled} = false
          AND ${company.lastPolledAt} < NOW() - INTERVAL '7 days'`,
    )
    .returning({ id: company.id });

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "company_revival_sweep",
    itemsProcessed: result.length,
    itemsInserted: 0,
    itemsUpdated: result.length,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── aggressiveCleanup ───────────────────────────────────────────────────────
// Cron: "0 2 * * 0" (Sun 02:00 UTC)

export async function runAggressiveCleanup(): Promise<void> {
  const rejected = await deleteRejectedJobs();
  const gone = await deleteGoneJobs();
  const ancient = await deleteAncientJobs();
  const normFailed = await deleteNormalizationFailedJobs();
  const oldMatches = await deleteOldTerminalMatches();
  const oldLogs = await deleteOldIngestionLogs();
  const sluggerRetries = await deleteExhaustedSluggerRetries();

  const totalDeleted =
    rejected.deletedCount +
    gone.deletedCount +
    ancient.deletedCount +
    normFailed.deletedCount +
    oldMatches.deletedCount +
    oldLogs.deletedCount +
    sluggerRetries.deletedCount;

  await writeIngestionLog({
    type: "stale_cleanup",
    status: "success",
    source: "aggressive_cleanup",
    itemsProcessed: totalDeleted,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── vacuumAnalyze ───────────────────────────────────────────────────────────
// Cron: "0 2 * * 0" (Sun 02:00 UTC)

export async function runVacuumAnalyze(): Promise<void> {
  const { vacuumAnalyze: vacuumFn } = await import(
    "@/lib/jobs/poller/cleanup-queries"
  );
  await vacuumFn();
  await writeIngestionLog({
    type: "stale_cleanup",
    status: "success",
    source: "vacuum_analyze",
    itemsProcessed: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── cleanupOrphanedCvUploads ────────────────────────────────────────────────
// Cron: "0 9 * * *" (daily 09:00 UTC)

export async function runCleanupOrphanedCvUploads(): Promise<void> {
  const result = await cleanupOrphanedCvUploads();
  console.info(
    `[cleanup-orphaned-cv-uploads] Deleted ${result.deletedProcessingCount} processing + ${result.deletedOrphanCount} orphaned uploads`,
  );
}

// ── probationEmbeddingBackfill ──────────────────────────────────────────────
// Cron: "0 4 * * 6" (Sat 04:00 UTC)

export async function runProbationEmbeddingBackfill(): Promise<void> {
  const { embedJob } = await import("@/lib/jobs/job-embedder");

  const candidates = await db.execute(sql`
    SELECT j.id, j.normalized_text
    FROM job j
    LEFT JOIN company c ON j.company_id = c.id
    WHERE j.status = 'active'
      AND j.job_embedding IS NULL
      AND j.normalized_text IS NOT NULL
      AND c.tier NOT IN ('probation', 'dead')
      AND j.remote_scope NOT IN ('country_fenced', 'region_fenced', 'on-site')
    LIMIT 200
  `);

  const rows = candidates.rows as Array<{
    id: string;
    normalized_text: string;
  }>;
  let embedded = 0;
  for (const r of rows) {
    try {
      const embedding = await embedJob(r.normalized_text);
      await db
        .update(job)
        .set({ jobEmbedding: embedding })
        .where(sql`${job.id} = ${r.id}`);
      embedded++;
    } catch (error) {
      console.error(`[probation-backfill] Failed for job ${r.id}:`, error);
    }
  }

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "probation_embedding_backfill",
    itemsProcessed: rows.length,
    itemsInserted: 0,
    itemsUpdated: embedded,
    itemsRejected: 0,
    itemsSkipped: rows.length - embedded,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── jobSummaryBackfill ──────────────────────────────────────────────────────
// Cron: "0 6 * * 6" (Sat 06:00 UTC)

export async function runJobSummaryBackfill(): Promise<void> {
  const jobsToSummarize = await db
    .select({ id: job.id })
    .from(job)
    .where(
      sql`${job.shortDescription} IS NULL
          AND ${job.normalizedAt} IS NOT NULL
          AND ${job.status} = 'active'`,
    )
    .limit(200);

  if (jobsToSummarize.length > 0) {
    await scheduler.sendBatch(
      jobsToSummarize.map((j) => ({
        id: `job-summarize-${j.id}-${Date.now()}`,
        name: "job/summarize",
        data: { jobId: j.id },
      })),
    );
  }
}

// ── jobSummarizeHandler (event handler) ─────────────────────────────────────
// Event: "job/summarize"

export async function runJobSummarizeHandler(jobId: string): Promise<void> {
  const { extractJobContent, summarizeJobLLM } = await import(
    "@/lib/jobs/job-normalizer"
  );

  const [jobRow] = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      rawJson: job.rawJson,
      normalizedText: job.normalizedText,
      shortDescription: job.shortDescription,
      normalizedAt: job.normalizedAt,
    })
    .from(job)
    .where(sql`${job.id} = ${jobId}`)
    .limit(1);

  if (!jobRow) return;
  if (jobRow.shortDescription || !jobRow.normalizedAt) return;

  const content = extractJobContent(
    jobRow.atsSource,
    jobRow.rawJson,
    jobRow.normalizedText ?? "",
    jobRow.normalizedText,
  );
  const summary = await summarizeJobLLM(content.fullText, content.title);
  if (summary) {
    await db
      .update(job)
      .set({ shortDescription: summary })
      .where(sql`${job.id} = ${jobId}`);
  }
}

// ── retryInFlightSweeper ────────────────────────────────────────────────────
// Cron: "*/30 * * * *" (every 30 min)

export async function runRetryInFlightSweeper(): Promise<void> {
  const stale = await db
    .select({ id: job.id, retryGeneration: job.retryGeneration })
    .from(job)
    .where(
      sql`${job.retryInFlight} = true
          AND ${job.sourceFetchedAt} < NOW() - INTERVAL '10 minutes'`,
    )
    .limit(100);

  for (const j of stale) {
    await db
      .update(job)
      .set({
        retryInFlight: false,
        clearedGeneration: j.retryGeneration,
      })
      .where(sql`${job.id} = ${j.id}`);
  }

  console.info(`[retry-in-flight-sweeper] Cleared ${stale.length} stale flags`);
}

// ── matchRetrySweep ─────────────────────────────────────────────────────────
// Cron: "0 7 * * *" (daily 07:00 UTC)

export async function runMatchRetrySweep(): Promise<void> {
  const { GATE2_MAX_COSINE_DISTANCE } = await import(
    "@/lib/jobs/matching-config"
  );

  const result = await db.execute(sql`
    WITH candidates AS (
      SELECT DISTINCT j.id
      FROM job j
      INNER JOIN persona p ON (j.extracted_tags && p.must_have_tags)
      WHERE j.status = 'active'
        AND j.job_embedding IS NOT NULL
        AND j.extracted_tags IS NOT NULL
        AND cardinality(j.extracted_tags) > 0
        AND p.persona_embedding IS NOT NULL
        AND 1 - (j.job_embedding <=> p.persona_embedding) >= ${1 - GATE2_MAX_COSINE_DISTANCE}
        AND NOT EXISTS (
          SELECT 1 FROM match_queue mq
          WHERE mq.job_id = j.id AND mq.persona_id = p.id
        )
      LIMIT 500
    )
    SELECT count(*)::int AS cnt FROM candidates
  `);

  const count = (result.rows[0] as { cnt: number }).cnt;
  if (count > 0) {
    await scheduler.send("match/bulk-reprocess", {
      personaId: null,
      includeRejected: false,
    });
  }

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "match_retry_sweep",
    itemsProcessed: count,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── normalizeProvisionalJob (event handler) ─────────────────────────────────
// Event: "job/provisional-ingested"
//
// D27: Ported from src/inngest/normalize-provisional-job.ts.
// The original used Inngest's multi-step retry ladder with step.run()
// checkpointing. pg-boss retries the entire job as a unit, so we run
// all steps in sequence within a single handler invocation.
//
// The retry schedule (4 attempts: immediate, +5min, +15min, +45min) is
// handled by pg-boss's retry configuration in register.ts.

export async function runNormalizeProvisionalJob(
  jobId: string,
  retryGeneration = 0,
): Promise<void> {
  const { eq } = await import("drizzle-orm");
  const { sanitizeJobDescription } = await import("@/lib/jobs/sanitize-html");
  const { computeTextHash, dedupGuard, stalenessGate, checkFencing } =
    await import("@/lib/jobs/seeders/provisional-job-repository");
  const { embedJob } = await import("@/lib/jobs/job-embedder");
  const { extractRemoteScope } = await import(
    "@/lib/jobs/remote-scope-extractor"
  );
  const { buildScoringInputFromCompany, scoreAndPersistCompany } = await import(
    "@/lib/jobs/company-scorer"
  );

  // ── Step 1: Fetch the provisional job + company data ───────────────────
  const rows = await db
    .select({
      id: job.id,
      atsSource: job.atsSource,
      atsSlug: job.atsSlug,
      title: job.title,
      rawJson: job.rawJson,
      status: job.status,
      textHash: job.textHash,
      sourceFetchedAt: job.sourceFetchedAt,
      jobVersion: job.jobVersion,
      clearedGeneration: job.clearedGeneration,
      retryInFlight: job.retryInFlight,
      // Company fields for staleness gate + scoring matrix
      companyLastPolledAt: company.lastPolledAt,
      companyId: company.id,
      companyCanonicalName: company.canonicalName,
      companyName: company.companyName,
      companyEmployeeCount: company.employeeCount,
      companyIsAgency: company.isAgency,
      companyIsPublic: company.isPublic,
      companyDiscoverySource: company.discoverySource,
      companyDiscoveredAt: company.discoveredAt,
    })
    .from(job)
    .leftJoin(company, eq(job.atsSlug, company.atsSlug))
    .where(eq(job.id, jobId))
    .limit(1);

  if (rows.length === 0) {
    console.warn(`[normalize-provisional-job] Job ${jobId} not found`);
    return;
  }

  const jobRow = rows[0];

  // Idempotency — skip if already active/normalized
  if (jobRow.status !== "provisional") {
    console.info(
      `[normalize-provisional-job] Job ${jobId} status is '${jobRow.status}', skipping`,
    );
    return;
  }

  // ── Step 2: Staleness gate ─────────────────────────────────────────────
  const lastPolledRaw = jobRow.companyLastPolledAt as unknown;
  const fetchedAtRaw = jobRow.sourceFetchedAt as unknown;
  const lastPolled = lastPolledRaw instanceof Date ? lastPolledRaw : null;
  const fetchedAt = fetchedAtRaw instanceof Date ? fetchedAtRaw : null;
  const staleness = stalenessGate(lastPolled, fetchedAt);
  console.info(
    `[normalize-provisional-job] Staleness gate: ${staleness} for job ${jobId}`,
  );

  // ── Step 3: Extract and clean ──────────────────────────────────────────
  const rawText = jobRow.rawJson ?? "";
  const sanitized = sanitizeJobDescription(rawText);
  const cleanedText = sanitized
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const htmlDescription = sanitized.trim().length > 0 ? sanitized : null;

  if (cleanedText.length < 100) {
    // Content too short — reject
    await db
      .update(job)
      .set({
        status: "rejected",
        normalizedText: cleanedText,
        descriptionHtml: htmlDescription,
        normalizedAt: new Date(),
        retryInFlight: false,
      })
      .where(eq(job.id, jobId));
    await scheduler.send("job/normalization-attempt-completed", { jobId });
    return;
  }

  const newTextHash = computeTextHash(cleanedText);
  const dedup = dedupGuard(jobRow.textHash, newTextHash);

  // ── Step 4: Embed + classify-scope ─────────────────────────────────────
  let embedding: number[] | null = null;
  if (dedup === "drift") {
    embedding = await embedJob(cleanedText);
  }

  const scopeResult = await extractRemoteScope(
    cleanedText,
    null, // workplaceType — unknown for provisional jobs
    jobRow.atsSource,
    null, // companyLocation — unknown for provisional jobs
  );

  // A2 reorder: if scope is fenced/onsite, drop the embedding
  if (
    embedding !== null &&
    ["country_fenced", "region_fenced", "onsite"].includes(
      scopeResult.remoteScope,
    )
  ) {
    embedding = null;
  }

  // ── Step 5: Persist normalized job (with fencing check) ────────────────
  const fencing = checkFencing(
    retryGeneration,
    jobRow.clearedGeneration ?? null,
  );
  if (fencing === "zombie") {
    console.warn(
      `[normalize-provisional-job] Zombie write rejected for job ${jobId}`,
    );
    await scheduler.send("job/normalization-attempt-completed", { jobId });
    return;
  }

  let jobVersion = jobRow.jobVersion;
  if (embedding !== null && dedup === "drift" && jobRow.textHash !== null) {
    jobVersion += 1;
  }

  await db
    .update(job)
    .set({
      normalizedText: cleanedText,
      descriptionHtml: htmlDescription,
      textHash: newTextHash,
      jobEmbedding: embedding,
      remoteScope: scopeResult.remoteScope,
      status: "active",
      normalizedAt: new Date(),
      rawJson: null, // G7: reclaim storage
      retryInFlight: false,
      jobVersion,
    })
    .where(eq(job.id, jobId));

  // ── Step 6: Trigger Gate 1+2 routing ───────────────────────────────────
  await scheduler.send("job/ingested", {
    jobId,
    atsSource: jobRow.atsSource,
    atsSlug: jobRow.atsSlug,
    isNew: false,
  });

  // ── Step 5.5: Company scoring matrix (Criterion 3) ─────────────────────
  if (jobRow.companyId) {
    const discoveredAtRaw = jobRow.companyDiscoveredAt;
    const discoveredAt = discoveredAtRaw
      ? new Date(discoveredAtRaw)
      : new Date();

    const scoringInput = buildScoringInputFromCompany({
      id: jobRow.companyId,
      canonicalName: jobRow.companyCanonicalName,
      atsSlug: jobRow.atsSlug,
      companyName: jobRow.companyName,
      employeeCount: jobRow.companyEmployeeCount,
      isAgency: jobRow.companyIsAgency ?? false,
      isPublic: jobRow.companyIsPublic ?? false,
      discoverySource: jobRow.companyDiscoverySource ?? "manual",
      discoveredAt,
    });
    await scoreAndPersistCompany(scoringInput);
  }

  // ── Trigger event-driven sweeper ───────────────────────────────────────
  await scheduler.send("job/normalization-attempt-completed", { jobId });
}
