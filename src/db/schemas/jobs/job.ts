import { sql } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";

import { workplaceTypeEnum } from "./enums";

export const job = pgTable(
  "job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    atsSource: text("ats_source").notNull(),
    atsSlug: text("ats_slug").notNull(),
    title: text("title").notNull(),
    rawJson: text("raw_json").notNull(),
    extractedTags: text("extracted_tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    jobEmbedding: vector("job_embedding", { dimensions: 1536 }),
    detectedAt: timestamp("detected_at").defaultNow(),

    // ── Module B additions (TDD §4.0c) — Deduplication & Stale Tracking ──────
    // The ATS's internal job ID (Greenhouse numeric id, Lever UUID string).
    // Combined with (atsSource, atsSlug) this is the deduplication anchor for
    // upserts during re-polls.
    externalJobId: text("external_job_id").notNull(),
    // When the job was last seen in a poll. Updated on every re-poll. Drives
    // stale detection (7 days → stale, 30 days → gone).
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    // active | stale | gone | rejected | normalization_failed.
    // - active | stale | gone: set by Module B (stale cleanup + re-poll).
    // - rejected: set by Module C Normalizer — garbage job (Gate 0 false
    //   positive, garbled listing, non-dev content). Tombstone.
    // - normalization_failed: set by Module C Normalizer — system failure
    //   (LLM fallback rate limit / timeout / OpenAI outage). Distinguishable
    //   from 'rejected' so a future retry sweep can re-process these without
    //   re-running garbage jobs. (MODULE_C_DECISIONS.md §1.1)
    // Module C's Gate 1+2 query must filter WHERE status = 'active'.
    // Resurrected to 'active' on re-poll.
    status: text("status").notNull().default("active"),
    // Module C — set when normalization completes (tags + embedding written).
    // Serves two purposes (MODULE_C_DECISIONS.md §1.2):
    //   1. Idempotency guard: jobIngestedHandler checks
    //      IF normalizedAt IS NOT NULL → skip (event re-delivery is safe).
    //   2. Retry sweep filter: WHERE status = 'normalization_failed'
    //      AND normalizedAt IS NULL identifies jobs that failed before
    //      completing normalization.
    // Set ONLY on terminal outcomes (successful normalization OR rejection).
    // NEVER set on 'normalization_failed' — that would turn it into a
    // permanent tombstone identical to 'rejected', defeating the two-status
    // split. Null = never processed by Module C.
    normalizedAt: timestamp("normalized_at"),

    // ── Extracted metadata (Phase 2 schema extension) ─────────────────────
    // Standardized fields extracted from rawJson during ingestion. These enable
    // SQL-level filtering (e.g. workplace type for remote-only matching) without
    // parsing rawJson at query time. Populated by extractJobMetadata() in
    // job-normalizer.ts. NULL when the ATS doesn't provide the field or it
    // can't be determined (notably Greenhouse workplace_type).
    workplaceType: workplaceTypeEnum("workplace_type"),
    employmentType: text("employment_type"),
    locationName: text("location_name"),
    department: text("department"),
    team: text("team"),
    applyUrl: text("apply_url"),
    publishedAt: timestamp("published_at"),
    companyName: text("company_name"),
  },
  (table) => ({
    extractedTagsIdx: index("jobs_extracted_tags_idx").using(
      "gin",
      table.extractedTags,
    ),
    embeddingIdx: index("job_embedding_hnsw_idx").using(
      "hnsw",
      table.jobEmbedding.op("vector_cosine_ops"),
    ),
    // Deduplication anchor — a job is uniquely identified by
    // (ats_source, ats_slug, external_job_id). Enables ON CONFLICT upserts.
    uniqueAtsJob: uniqueIndex("job_unique_ats_job").on(
      table.atsSource,
      table.atsSlug,
      table.externalJobId,
    ),
    // For the daily stale cleanup query (status + lastSeenAt).
    statusIdx: index("job_status_idx").on(table.status, table.lastSeenAt),
    // For the workplace type pre-filter in Gate 1 (remote-only matching).
    workplaceTypeIdx: index("job_workplace_type_idx").on(table.workplaceType),
  }),
);

export const jobSchema = createInsertSchema(job);
export type JobSchema = z.infer<typeof jobSchema>;

export type Job = typeof job.$inferSelect;
export type NewJob = typeof job.$inferInsert;
