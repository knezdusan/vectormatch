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
    // active | stale | gone. Module C's Gate 1+2 query must filter
    // WHERE status = 'active'. Resurrected to 'active' on re-poll.
    status: text("status").notNull().default("active"),
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
  }),
);

export const jobSchema = createInsertSchema(job);
export type JobSchema = z.infer<typeof jobSchema>;

export type Job = typeof job.$inferSelect;
export type NewJob = typeof job.$inferInsert;
