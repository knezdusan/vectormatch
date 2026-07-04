import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import type z from "zod";
import { applicant } from "./applicant";
import { job } from "./job";
import { persona } from "./persona";

// Module C — matchQueue (the 3-Gate funnel output table)
//
// A row is inserted by Gate 1+2 (src/lib/jobs/gate-1-2.ts) when a job + persona
// pair passes the GIN overlap + HNSW cosine distance filters. Gate 3
// (gate3Evaluator Inngest function) then fills in the LLM verdict columns.
//
// Schema decisions: docs/reports/MODULE_C_DECISIONS.md §2.
//   - `personaId` (NOT NULL, FK → persona) — required for multi-persona users
//     (up to 3). A user with a "React" persona and a "Node.js" persona can
//     legitimately match the same full-stack job via both. The prior
//     `(jobId, applicantId)` unique index silently dropped the second match;
//     the corrected `(jobId, personaId)` index allows it.
//   - `cosineDistance` (real, 0.0–2.0, lower is better) — named "distance" not
//     "similarityScore" to prevent future ORDER BY ... DESC sorting bugs.
//   - `isRead` (boolean, default false) — drives the sidebar unread badge (§8).
export const matchQueue = pgTable(
  "match_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id, { onDelete: "cascade" }),
    applicantId: text("applicant_id")
      .notNull()
      .references(() => applicant.userId, { onDelete: "cascade" }),
    // Which persona matched. Required for multi-persona users and Gate 3
    // debugging. The unique index is on (jobId, personaId), NOT
    // (jobId, applicantId) — see §2.2.
    personaId: uuid("persona_id")
      .notNull()
      .references(() => persona.id, { onDelete: "cascade" }),
    overlapScore: integer("overlap_score").notNull(),
    // Gate 2 HNSW cosine distance (0.0–2.0, lower is better). Stored for
    // ranking, debugging, and calibration.
    cosineDistance: real("cosine_distance"),
    status: text("status").notNull().default("pending"),
    // ── Gate 3 LLM verdict columns (filled by gate3Evaluator) ───────────────
    // approved | rejected | error. Null until Gate 3 completes.
    llmVerdict: text("llm_verdict"),
    // 1–3 sentence LLM explanation. Audit trail for false positive/negative
    // debugging.
    llmReasoning: text("llm_reasoning"),
    // LLM confidence score (0.0–1.0). Critical for calibration — distinguishes
    // high-confidence verdicts from borderline ones. Persisted from
    // verdict.matchConfidence in the Gate 3 evaluator.
    llmConfidence: real("llm_confidence"),
    // LLM blockers array (reasons for rejection). Persisted from
    // verdict.blockers. Empty for approved matches. Useful for calibration —
    // shows WHY the LLM rejected a candidate.
    llmBlockers: text("llm_blockers").array(),
    // Which model evaluated: gpt-4o-mini (MVP) | gpt-4o (escalation, post-MVP).
    llmModel: text("llm_model"),
    // Which Gate 3 prompt variant was used for this evaluation. Used for A/B
    // testing prompt variations to optimize approval rates. Null for rows
    // evaluated before the A/B test feature was deployed.
    promptVariant: text("prompt_variant"),
    // Work authorization risk flag (added July 2026). Set to true by Gate 3
    // when the job description is SILENT on work authorization/visa/citizenship
    // requirements BUT the role is hybrid or single-country-remote (not global).
    // This surfaces the Ketryx-class risk: work-auth requirements hidden in the
    // application form, not the JD. The job is NOT rejected — it still goes
    // through the normal approve/reject flow. The flag renders a warning badge
    // in the dashboard: "Work authorization not verified — confirm eligibility
    // before applying." See docs/reports/GATE_0_5_GEO_FENCING_HANDOFF.md.
    workAuthRiskFlag: boolean("work_auth_risk_flag").default(false).notNull(),
    // When Gate 3 ran. Null until Gate 3 completes.
    evaluatedAt: timestamp("evaluated_at"),
    // When the match was marked stale by staleJobVerifier. Separate from
    // evaluatedAt because a match can be approved for days before the underlying
    // job is closed at the source.
    staleAt: timestamp("stale_at"),
    // In-app notification badge (§8). Defaults to false; set true when the
    // user views the match.
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    // §2.2 — Correct uniqueness constraint: a persona matches a job at most
    // once, but an applicant (via different personas) can match the same job
    // multiple times. Replaces the buggy (jobId, applicantId) index.
    uniqueMatchPersona: uniqueIndex("match_queue_unique_persona").on(
      table.jobId,
      table.personaId,
    ),
    // §2.3 #1 — Dashboard list query:
    //   WHERE applicant_id = ? AND status = 'approved' ORDER BY created_at DESC
    // The createdAt DESC in the index lets Postgres return rows in sorted
    // order without an in-memory sort.
    applicantStatusIdx: index("match_queue_applicant_status_idx").on(
      table.applicantId,
      table.status,
      sql`${table.createdAt} DESC`,
    ),
    // §2.3 #2 — Sidebar unread badge count query:
    //   WHERE applicant_id = ? AND is_read = false AND status = 'approved'
    // Partial index — only indexes the unread rows (a small fraction of total
    // matches), so it's smaller and faster than folding isRead into the main
    // index.
    unreadBadgeIdx: index("match_queue_unread_badge_idx")
      .on(table.applicantId)
      .where(sql`${table.isRead} = false AND ${table.status} = 'approved'`),
  }),
);

export const matchQueueSchema = createInsertSchema(matchQueue);
export type MatchQueueSchema = z.infer<typeof matchQueueSchema>;

export type MatchQueue = typeof matchQueue.$inferSelect;
export type NewMatchQueue = typeof matchQueue.$inferInsert;
