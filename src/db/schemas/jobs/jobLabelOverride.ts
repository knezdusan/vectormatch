import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// JOB LABEL OVERRIDE TABLE — D23
// src/db/schemas/jobs/jobLabelOverride.ts
//
// Founder dismissals with a reason that implies a permanent scope/classification
// override. These overrides ALWAYS win over the classifier and survive
// re-ingestion, re-normalization, and re-routing.
//
// Problem solved: manual data corrections have never survived re-ingestion in
// this project. D19's 13 reclassifications were overwritten by D20/D21 backfills.
// The gate router's ON CONFLICT clause unconditionally reset match_queue rows,
// erasing the founder's feedback on every re-routing wave.
//
// This table is the permanent record of founder intent. The gate router and
// the fence classifier both check this table before applying their own logic.
//
// Override types:
//   geo_fenced     — the job is geo-fenced regardless of what the classifier says
//                    (e.g., HONK "thrive from anywhere in the US" → country_fenced)
//   wrong_stack    — the job is not the founder's tech stack (suppression label)
//   not_development — the job is not a development role (suppression label)
//
// When an override exists for a (ats_slug, title) pair, it applies to ALL jobs
// with that ats_slug + title combination — not just one specific job_id. This
// ensures the override survives even if the job is re-ingested with a new ID.
export const jobLabelOverride = pgTable(
  "job_label_override",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // ── Target ──────────────────────────────────────────────────────────────
    // The ats_slug identifies the company. The title identifies the specific
    // job posting. Together they form a stable identifier that survives
    // re-ingestion (job_id changes on re-ingestion, but ats_slug + title don't).
    atsSlug: text("ats_slug").notNull(),
    title: text("title").notNull(),

    // ── Override ────────────────────────────────────────────────────────────
    // The override type determines what the override does:
    //   geo_fenced     → sets is_fenced=true, remote_scope='country_fenced'
    //   wrong_stack    → suppresses matching (job never enters Gate 1+2)
    //   not_development → suppresses matching (job never enters Gate 1+2)
    overrideType: text("override_type").notNull(),

    // The reason the founder gave for the dismissal (free text)
    dismissReason: text("dismiss_reason"),

    // ── Metadata ────────────────────────────────────────────────────────────
    createdBy: text("created_by").notNull().default("founder"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),

    // Soft delete — allows retraction without losing the audit trail
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    // Unique constraint: one active override per (ats_slug, title, override_type)
    // Partial unique index — only applies to non-revoked overrides
    uniqueActiveOverride: index("job_label_override_unique_active")
      .on(table.atsSlug, table.title, table.overrideType)
      .where({ revokedAt: null } as unknown as never),
    // Index for fast lookup by ats_slug (used by the gate router)
    slugIdx: index("job_label_override_slug_idx").on(table.atsSlug),
    // Index for fast lookup by (ats_slug, title) (used by the fence classifier)
    slugTitleIdx: index("job_label_override_slug_title_idx").on(
      table.atsSlug,
      table.title,
    ),
  }),
);
