// D27: Event handlers for pg-boss scheduler
// src/scheduler/handlers/events.ts
//
// Migrated from Inngest event-triggered functions. These handle events
// that are emitted by admin actions, profile updates, or other handlers.

import { sql } from "drizzle-orm";
import { db } from "@/db/db";
import { job } from "@/db/schemas/jobs/job";
import { writeIngestionLog } from "@/lib/jobs/poller/ingestion-log";
import { scheduler } from "../scheduler";

// ── phalanxPoller (event: poller/run) ───────────────────────────────────────
// Manual single-company poll trigger. Used by admin dashboard and
// v2FrontendJobScanner for auto-polling newly discovered companies.

export async function runPhalanxPoller(companyId: string): Promise<void> {
  const { getCompanyById } = await import("@/lib/jobs/poller/tier-queries");
  const { pollCompany } = await import("@/lib/jobs/poller/phalanx-poller");

  const companyRow = await getCompanyById(companyId);
  if (!companyRow) {
    console.warn(`[phalanx-poller] Company ${companyId} not found`);
    return;
  }

  const result = await pollCompany(
    companyRow.id,
    companyRow.atsSource,
    companyRow.atsSlug,
    fetch,
  );

  if (result.newJobIds.length > 0) {
    await scheduler.sendBatch(
      result.newJobIds.map((jobId) => ({
        id: `job-ingested-${jobId}-${Date.now()}`,
        name: "job/ingested",
        data: {
          jobId,
          atsSource: result.atsSource,
          atsSlug: result.atsSlug,
          isNew: true,
        },
      })),
    );
  }
}

// ── aggregatorJobHandler (event: job/aggregator-ingested) ───────────────────
// Handles jobs from aggregator sources (RSS feeds, etc.) — normalize,
// embed, insert, run Gate 1+2, fan out Gate 3.

export async function runAggregatorJobHandler(
  data: Record<string, unknown>,
): Promise<void> {
  const { normalizeAggregatorJob } = await import("@/lib/jobs/job-normalizer");
  type AggregatorJob = import("@/lib/jobs/job-normalizer").AggregatorJob;
  const { embedJob } = await import("@/lib/jobs/job-embedder");
  const { insertAggregatorJob } = await import(
    "@/lib/jobs/poller/job-repository"
  );
  const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
  const { resolveSlugger } = await import("@/lib/jobs/seeders/slugger");

  // Step 1: Normalize
  const aggregatorJob = data as unknown as AggregatorJob;
  const normalization = await normalizeAggregatorJob(aggregatorJob);
  if (normalization.status !== "normalized") {
    return; // Gate 0 rejected
  }

  // Step 2: Embed
  const embedding = await embedJob(normalization.fullText);

  // Step 3: Insert
  const jobId = await insertAggregatorJob(
    {
      source: aggregatorJob.source,
      externalJobId: aggregatorJob.externalJobId,
      title: aggregatorJob.title,
      applyUrl: aggregatorJob.applyUrl,
      publishedAt: aggregatorJob.publishedAt,
    },
    normalization,
    embedding,
  );
  if (!jobId) return; // duplicate

  // Step 4: Gate 1+2
  const candidates = await runGateSQLRouter(
    jobId,
    normalization.tags,
    embedding,
  );

  // Step 5: Fan out Gate 3
  if (candidates.length > 0) {
    await scheduler.sendBatch(
      candidates.map((c) => ({
        id: `gate-3-${c.matchQueueId}`,
        name: "match/gate-3-evaluate",
        data: {
          matchQueueId: c.matchQueueId,
          jobId,
          personaId: c.personaId,
          applicantId: c.applicantId,
        },
      })),
    );
  }

  // Step 6: Slugger resolve
  try {
    const companyName = (data.companyName as string) ?? "";
    if (companyName) {
      await resolveSlugger({ companyName }, { addToRetryOnFailure: false });
    }
  } catch (error) {
    console.error(`[aggregator-job-handler] Slugger resolve failed:`, error);
  }
}

// ── personaUpdatedHandler (event: persona/updated) ──────────────────────────
// Re-evaluates rejected matches and triggers bulk reprocess for new jobs.

export async function runPersonaUpdatedHandler(
  personaId: string,
): Promise<void> {
  // Step 1: Find rejected matches for this persona (limit 50)
  const rejectedRows = await db.execute(sql`
    SELECT mq.id, mq.job_id, mq.applicant_id, mq.persona_id
    FROM match_queue mq
    INNER JOIN job j ON mq.job_id = j.id
    WHERE mq.persona_id = ${personaId}
      AND mq.status = 'rejected'
      AND j.status = 'active'
    LIMIT 50
  `);

  const rows = rejectedRows.rows as Array<{
    id: string;
    job_id: string;
    applicant_id: string;
    persona_id: string;
  }>;

  // Step 2: Reset to pending + emit Gate 3 events
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    await db.execute(sql`
      UPDATE match_queue
      SET status = 'pending',
          llm_verdict = NULL,
          llm_reasoning = NULL,
          llm_confidence = NULL,
          llm_blockers = NULL,
          evaluated_at = NULL
      WHERE persona_id = ${personaId}
        AND id = ANY(${sql.raw(`ARRAY[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
    `);

    await scheduler.sendBatch(
      rows.map((r) => ({
        id: `gate-3-feedback-${r.id}-${Date.now()}`,
        name: "match/gate-3-evaluate",
        data: {
          matchQueueId: r.id,
          jobId: r.job_id,
          personaId: r.persona_id,
          applicantId: r.applicant_id,
        },
      })),
    );
  }

  // Step 3: Find new jobs never matched
  const newJobsResult = await db.execute(sql`
    SELECT count(*)::int AS cnt
    FROM job j, persona p
    WHERE p.id = ${personaId}
      AND j.status = 'active'
      AND j.job_embedding IS NOT NULL
      AND j.extracted_tags && p.must_have_tags
      AND NOT EXISTS (
        SELECT 1 FROM match_queue mq
        WHERE mq.job_id = j.id AND mq.persona_id = p.id
      )
  `);

  const newJobsCount = (newJobsResult.rows[0] as { cnt: number }).cnt;
  if (newJobsCount > 0) {
    await scheduler.send("match/bulk-reprocess", {
      personaId,
      includeRejected: false,
    });
  }
}

// ── matchBulkReprocess (event: match/bulk-reprocess) ────────────────────────
// Re-processes unmatched jobs through Gate 0.5 + Gate 1+2 + Gate 3 fan-out.
// Concurrency: 1 (heavy operation).

export async function runMatchBulkReprocess(
  data: Record<string, unknown>,
): Promise<void> {
  const personaId = data.personaId as string | null;
  const includeRejected = (data.includeRejected as boolean) ?? false;

  const { runGateSQLRouter } = await import("@/lib/jobs/gate-1-2");
  const { runHardBlockerPreFilter } = await import(
    "@/lib/jobs/gate-zero-pre-filter"
  );
  const { getExcludedCountriesRaw } = await import(
    "@/lib/jobs/excluded-countries"
  );
  const { applicant: applicantSchema } = await import(
    "@/db/schemas/jobs/applicant"
  );

  // Step 1: Get unmatched job IDs (limit 1000)
  const jobIdsResult = personaId
    ? await db.execute(sql`
        SELECT DISTINCT j.id
        FROM job j
        WHERE j.status = 'active'
          AND j.job_embedding IS NOT NULL
          AND j.extracted_tags IS NOT NULL
          AND cardinality(j.extracted_tags) > 0
          AND EXISTS (
            SELECT 1 FROM persona p
            WHERE p.id = ${personaId}
              AND j.extracted_tags && p.must_have_tags
          )
          AND NOT EXISTS (
            SELECT 1 FROM match_queue mq
            WHERE mq.job_id = j.id AND mq.persona_id = ${personaId}
            ${includeRejected ? sql`` : sql`AND mq.status = 'approved'`}
          )
        ORDER BY j.id
        LIMIT 1000
      `)
    : await db.execute(sql`
        SELECT DISTINCT j.id
        FROM job j
        INNER JOIN persona p ON (j.extracted_tags && p.must_have_tags)
        WHERE j.status = 'active'
          AND j.job_embedding IS NOT NULL
          AND j.extracted_tags IS NOT NULL
          AND cardinality(j.extracted_tags) > 0
          AND p.persona_embedding IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM match_queue mq
            WHERE mq.job_id = j.id AND mq.persona_id = p.id
            ${includeRejected ? sql`` : sql`AND mq.status = 'approved'`}
          )
        ORDER BY j.id
        LIMIT 1000
      `);

  const jobIds = (jobIdsResult.rows as Array<{ id: string }>).map((r) => r.id);
  if (jobIds.length === 0) return;

  // Step 2: Process in batches of 25
  const BATCH = 25;
  const excludedSet = await getExcludedCountriesRaw();
  const applicants = await db
    .select({
      userId: applicantSchema.userId,
      country: applicantSchema.country,
      assignmentTypes: applicantSchema.assignmentTypes,
      preferredCompliance: applicantSchema.preferredCompliance,
      expectedCompMin: applicantSchema.expectedCompMin,
      yearsOfExperience: applicantSchema.yearsOfExperience,
    })
    .from(applicantSchema);

  let totalCandidates = 0;
  let totalGate05Rejected = 0;

  for (let i = 0; i < jobIds.length; i += BATCH) {
    const batchIds = jobIds.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;

    // Load batch metadata
    const batchResult = await db.execute(sql`
      SELECT
        j.id, j.extracted_tags, j.job_embedding::text AS job_embedding_str,
        j.title, j.location_name, j.workplace_type,
        j.normalized_text, j.title_region_tag,
        j.comp_min, j.comp_max, j.comp_currency,
        j.assignment_types
      FROM job j
      WHERE j.id = ANY(${sql.raw(`ARRAY[${batchIds.map((id) => `'${id}'`).join(",")}]::uuid[]`)})
    `);

    const batchRows = batchResult.rows as Array<Record<string, unknown>>;
    const gate05Passed: Array<{
      id: string;
      extractedTags: string[];
      jobEmbedding: number[];
    }> = [];

    for (const row of batchRows) {
      const tags = row.extracted_tags as string[];
      const embeddingStr = row.job_embedding_str as string;
      let embedding: number[];
      try {
        embedding = JSON.parse(embeddingStr) as number[];
      } catch {
        continue;
      }

      // Run Gate 0.5
      const results = await Promise.all(
        applicants.map((app) =>
          runHardBlockerPreFilter({
            job: {
              title: row.title as string,
              locationName: row.location_name as string | null,
              workplaceType: row.workplace_type as
                | "remote"
                | "hybrid"
                | "on-site"
                | null,
              normalizedText: row.normalized_text as string | null,
              titleRegionTag: row.title_region_tag as string | null,
              locationCountries: null,
              experienceMinYears: null,
              experienceMaxYears: null,
              compensationMin:
                row.comp_min !== null ? Number(row.comp_min) : null,
              compensationMax:
                row.comp_max !== null ? Number(row.comp_max) : null,
              compensationCurrency: row.comp_currency as string | null,
              remoteScope: "undetermined",
            },
            applicant: {
              country: app.country,
              assignmentTypes: app.assignmentTypes ?? [],
              preferredCompliance: app.preferredCompliance ?? [],
              expectedCompMin:
                app.expectedCompMin !== null
                  ? Number(app.expectedCompMin)
                  : null,
              yearsOfExperience: app.yearsOfExperience,
            },
            excludedCountries: excludedSet,
          }),
        ),
      );

      if (results.some((r) => r.passes)) {
        gate05Passed.push({
          id: row.id as string,
          extractedTags: tags,
          jobEmbedding: embedding,
        });
      } else {
        await db
          .update(job)
          .set({ status: "rejected" })
          .where(sql`${job.id} = ${row.id}`);
        totalGate05Rejected++;
      }
    }

    // Run Gate 1+2 in parallel
    const batchResults = await Promise.all(
      gate05Passed.map((j) =>
        runGateSQLRouter(j.id, j.extractedTags, j.jobEmbedding).then(
          (jobCandidates) =>
            jobCandidates.map((c) => ({
              matchQueueId: c.matchQueueId,
              jobId: j.id,
              personaId: c.personaId,
              applicantId: c.applicantId,
            })),
        ),
      ),
    );

    const candidates: Array<{
      matchQueueId: string;
      jobId: string;
      personaId: string;
      applicantId: string;
    }> = [];
    for (const jobCandidates of batchResults) {
      candidates.push(...jobCandidates);
    }

    // Fan out Gate 3
    if (candidates.length > 0) {
      await scheduler.sendBatch(
        candidates.map((c) => ({
          id: `gate-3-bulk-${c.matchQueueId}`,
          name: "match/gate-3-evaluate",
          data: {
            matchQueueId: c.matchQueueId,
            jobId: c.jobId,
            personaId: c.personaId,
            applicantId: c.applicantId,
          },
        })),
      );
      totalCandidates += candidates.length;
    }

    console.info(
      `[match-bulk-reprocess] Batch ${batchNum}: ${gate05Passed.length} passed Gate 0.5, ${candidates.length} candidates`,
    );
  }

  await writeIngestionLog({
    type: "seed",
    status: "success",
    source: "match_bulk_reprocess",
    itemsProcessed: jobIds.length,
    itemsInserted: totalCandidates,
    itemsUpdated: 0,
    itemsRejected: totalGate05Rejected,
    itemsSkipped: jobIds.length - totalCandidates - totalGate05Rejected,
    startedAt: new Date(),
    finishedAt: new Date(),
  });
}

// ── emergencyStoragePurge (event + cron) ────────────────────────────────────
// Triggered manually via admin dashboard OR automatically every 6 hours.

export async function runEmergencyStoragePurge(
  data: Record<string, unknown> | null,
): Promise<void> {
  const { isStorageSafeForIngestion, getDatabaseSizeMb } = await import(
    "@/lib/jobs/storage-check"
  );
  const { shouldSkipEmergencyPurge } = await import("@/lib/jobs/storage-check");
  const { runEmergencyPurge } = await import(
    "@/lib/jobs/poller/cleanup-queries"
  );
  const { sendStorageAlertEmail } = await import("@/lib/jobs/storage-alert");
  const { resolveAlertsByType } = await import("@/lib/jobs/alerting");

  const manualTrigger = data?.triggeredBy === "admin-dashboard";

  // Check current storage status
  const storageStatus = await isStorageSafeForIngestion();

  // Skip if auto-triggered and storage is safe
  if (
    !manualTrigger &&
    shouldSkipEmergencyPurge(manualTrigger, storageStatus.percentage)
  ) {
    console.info(
      "[emergency-storage-purge] Skipped — storage within safe limits",
    );
    return;
  }

  const storageBeforeMb = await getDatabaseSizeMb();
  const purgeResult = await runEmergencyPurge(getDatabaseSizeMb);

  await writeIngestionLog({
    type: "stale_cleanup",
    status: "success",
    source: "emergency_storage_purge",
    itemsProcessed: purgeResult.totalDeleted ?? 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    startedAt: new Date(),
    finishedAt: new Date(),
  });

  // Send alert email if meaningful action
  if (
    manualTrigger ||
    (purgeResult.totalDeleted ?? 0) > 0 ||
    !purgeResult.recovered
  ) {
    const storageAfterMb = purgeResult.storageAfterMb;
    const { STORAGE_LIMIT_MB } = await import("@/lib/jobs/storage-check");
    const percentage = storageAfterMb / STORAGE_LIMIT_MB;
    await sendStorageAlertEmail({
      severity: purgeResult.recovered ? "warning" : "critical",
      currentMb: storageAfterMb,
      limitMb: STORAGE_LIMIT_MB,
      percentage,
      reason: purgeResult.stopReason ?? "emergency purge",
      ingestionHalted: !purgeResult.recovered,
    });
  }

  if (purgeResult.recovered) {
    await resolveAlertsByType("storage_critical");
  }
}
