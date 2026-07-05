// Module C — Dashboard Query Layer
// src/lib/jobs/dashboard-queries.ts
//
// Read-side queries for the /dashboard/jobs page and sidebar badge. All
// queries are applicant-scoped (WHERE applicant_id = $userId) and use the
// C0 indexes:
//   - match_queue_applicant_status_idx (applicantId, status, createdAt DESC)
//     → supports the approved matches list query
//   - match_queue_unread_badge_idx (applicantId) WHERE is_read=false AND status='approved'
//     → supports the sidebar unread badge count query
//
// Server-only: touches the database. Called from Server Components and
// Server Actions (AGENTS.md rule 2 — lazy imports not needed here since
// these are only called from server contexts).
//
// (MODULE_C_DECISIONS.md §8)

import "server-only";

import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/db";
import { applicant } from "@/db/schemas/jobs/applicant";
import { company } from "@/db/schemas/jobs/company";
import { companyQualityScore } from "@/db/schemas/jobs/companyQualityScore";
import { job } from "@/db/schemas/jobs/job";
import { matchQueue } from "@/db/schemas/jobs/matchQueue";
import { persona } from "@/db/schemas/jobs/persona";

// =============================================================================
// TYPES
// =============================================================================

import {
  MATCH_SORT_OPTIONS,
  MATCH_STATUS_FILTERS,
  type MatchSortOption,
  type MatchStatusFilter,
} from "./match-filters";

export { MATCH_SORT_OPTIONS, MATCH_STATUS_FILTERS };
export type { MatchSortOption, MatchStatusFilter };

/** A match row joined with job + persona data for the dashboard list. */
export type MatchRow = {
  matchQueueId: string;
  jobId: string;
  jobTitle: string;
  jobAtsSource: string;
  jobAtsSlug: string;
  jobNormalizedText: string | null;
  jobShortDescription: string | null;
  jobWorkplaceType: string | null;
  personaId: string;
  personaLabel: string;
  overlapScore: number;
  cosineDistance: number | null;
  llmVerdict: string | null;
  llmReasoning: string | null;
  llmConfidence: number | null;
  llmBlockers: string[] | null;
  status: string;
  isRead: boolean;
  createdAt: Date | null;
  matchScore: number;
  // Work authorization risk flag (added July 2026). True when the JD was
  // silent on work auth but the role is hybrid or single-country-remote.
  // Renders a warning badge in the dashboard.
  workAuthRiskFlag: boolean;
};

/** A single match detail with full job + persona context. */
export type MatchDetail = {
  matchQueueId: string;
  status: string;
  llmVerdict: string | null;
  llmReasoning: string | null;
  llmConfidence: number | null;
  llmBlockers: string[] | null;
  llmModel: string | null;
  evaluatedAt: Date | null;
  isRead: boolean;
  createdAt: Date | null;
  overlapScore: number;
  cosineDistance: number | null;
  workAuthRiskFlag: boolean;
  job: {
    id: string;
    title: string;
    atsSource: string;
    atsSlug: string;
    rawJson: string | null;
    normalizedText: string | null;
    extractedTags: string[] | null;
  };
  persona: {
    id: string;
    personaLabel: string;
    embeddingSummary: string;
    mustHaveTags: string[];
  };
};

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get matches for the dashboard list (paginated, applicant-scoped, status-filtered).
 *
 * Uses match_queue_applicant_status_idx (applicantId, status, createdAt DESC)
 * — the index returns rows in sorted order without an in-memory sort.
 *
 * @param userId   The authenticated user's ID (applicant.userId)
 * @param status   Filter by status: 'approved', 'rejected', 'pending', or 'all'
 * @param limit    Page size (default 20)
 * @param offset   Pagination offset (default 0)
 * @param sort     Sort order: 'best_match', 'newest', or 'oldest' (default 'best_match')
 * @returns        Array of match rows with job + persona data
 */
export async function getMatches(
  userId: string,
  status: MatchStatusFilter = "approved",
  limit = 20,
  offset = 0,
  sort: MatchSortOption = "best_match",
): Promise<MatchRow[]> {
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 1);

  const statusFilter =
    status === "all"
      ? undefined
      : status === "pending"
        ? inArray(matchQueue.status, ["pending", "error"])
        : status === "stale"
          ? sql`${matchQueue.status} = 'stale' AND ${matchQueue.staleAt} >= ${staleCutoff}`
          : eq(matchQueue.status, status);

  // Composite match score (0–100) used for ranking and the 5-star rating.
  //   25% semantic similarity (1 - cosine distance)
  //   30% must-have tag overlap (capped at 5, non-linear so the first
  //       matching tags contribute more than the marginal ones)
  //   12% workplace/modality alignment
  //    8% location alignment (global remote > country-specific remote)
  //    8% seniority alignment (inferred from job title vs persona levels)
  //   17% company quality score (default 50 if missing)
  //   subtract up to 10% for blocklist tag hits
  //   subtract up to 10% for coverage gap (fraction of persona must-have
  //       tags not matched by the job)
  //   subtract up to 10% for secondary domain mismatch (alternative
  //       framework/language tags present in the job but not in the persona)
  const matchScoreExpr = sql<number>`
    ROUND(
      GREATEST(
        0,
        LEAST(
          1,
          (
            (1 - COALESCE(${matchQueue.cosineDistance}, 1)) * 0.25
            + (1 - EXP(-0.4 * LEAST(COALESCE(${matchQueue.overlapScore}, 0), 5))) * 0.30
            + (
              CASE
                WHEN ${job.workplaceType} IS NULL OR COALESCE(array_length(${applicant.assignmentTypes}, 1), 0) = 0 THEN 0.5
                WHEN ${job.workplaceType}::text = ANY(${applicant.assignmentTypes}::text[]) THEN 1.0
                WHEN ${job.workplaceType}::text = 'hybrid' AND ('remote' = ANY(${applicant.assignmentTypes}::text[]) OR 'remote_local' = ANY(${applicant.assignmentTypes}::text[])) THEN 0.5
                WHEN ${job.workplaceType}::text = 'remote' AND 'hybrid' = ANY(${applicant.assignmentTypes}::text[]) THEN 0.5
                WHEN ${job.workplaceType}::text = 'on-site' AND 'hybrid' = ANY(${applicant.assignmentTypes}::text[]) THEN 0.5
                ELSE 0.0
              END
            ) * 0.12
            + (
              CASE
                WHEN ${applicant.country} IS NULL OR ${job.locationName} IS NULL OR ${job.locationName} = '' THEN 0.5
                -- Remote scope: global remote gets perfect location score
                WHEN ${job.remoteScope}::text = 'global' THEN 1.0
                WHEN ${job.locationName} ~* 'remote|global|anywhere|worldwide' THEN
                  CASE
                    WHEN ${applicant.country} = 'RS' AND ${job.locationName} ~* 'serbia' THEN 1.0
                    WHEN ${applicant.country} = 'US' AND ${job.locationName} ~* '(united states|u\.s\.|usa| america)' THEN 1.0
                    WHEN ${applicant.country} = 'BR' AND ${job.locationName} ~* 'brazil' THEN 1.0
                    WHEN ${applicant.country} = 'CA' AND ${job.locationName} ~* 'canada' THEN 1.0
                    WHEN ${applicant.country} = 'GB' AND ${job.locationName} ~* '(uk|united kingdom|england|scotland|wales)' THEN 1.0
                    WHEN ${applicant.country} = 'AU' AND ${job.locationName} ~* '(australia|aest)' THEN 1.0
                    WHEN ${applicant.country} = 'TW' AND ${job.locationName} ~* 'taiwan' THEN 1.0
                    WHEN ${applicant.country} = 'MY' AND ${job.locationName} ~* 'malaysia' THEN 1.0
                    WHEN ${applicant.country} = 'CO' AND ${job.locationName} ~* 'colombia' THEN 1.0
                    WHEN ${applicant.country} = 'NG' AND ${job.locationName} ~* 'nigeria' THEN 1.0
                    WHEN ${applicant.country} = 'PT' AND ${job.locationName} ~* 'portugal' THEN 1.0
                    WHEN ${applicant.country} = 'MT' AND ${job.locationName} ~* 'malta' THEN 1.0
                    WHEN ${applicant.country} = 'CH' AND ${job.locationName} ~* 'switzerland' THEN 1.0
                    WHEN ${applicant.country} = 'DE' AND ${job.locationName} ~* 'germany' THEN 1.0
                    WHEN ${applicant.country} = 'RO' AND ${job.locationName} ~* 'romania' THEN 1.0
                    WHEN ${applicant.country} = 'UA' AND ${job.locationName} ~* 'ukraine' THEN 1.0
                    WHEN ${applicant.country} = 'IE' AND ${job.locationName} ~* 'ireland' THEN 1.0
                    WHEN ${applicant.country} = 'FR' AND ${job.locationName} ~* 'france' THEN 1.0
                    WHEN ${applicant.country} = 'IN' AND ${job.locationName} ~* 'india' THEN 1.0
                    WHEN ${applicant.country} = 'AR' AND ${job.locationName} ~* 'argentina' THEN 1.0
                    WHEN ${applicant.country} = 'MX' AND ${job.locationName} ~* 'mexico' THEN 1.0
                    WHEN ${job.locationName} ~* '(united states|u\.s\.|usa| america|brazil|canada|argentina|mexico|uk|united kingdom|england|scotland|wales|australia|aest|taiwan|malaysia|colombia|nigeria|portugal|malta|switzerland|germany|romania|ukraine|ireland|france|india|serbia)' THEN 0.0
                    ELSE 1.0
                  END
                ELSE 0.5
              END
            ) * 0.08
            + (
              CASE
                WHEN COALESCE(array_length(${persona.seniorityLevels}, 1), 0) = 0 THEN 0.5
                WHEN ${job.title} ~* '(junior|associate|entry|intern|trainee)' THEN
                  CASE WHEN 'junior' = ANY(${persona.seniorityLevels}::text[]) THEN 1.0 ELSE 0.0 END
                WHEN ${job.title} ~* '(senior|sr\.|sr )' THEN
                  CASE WHEN 'senior' = ANY(${persona.seniorityLevels}::text[]) THEN 1.0 ELSE 0.0 END
                WHEN ${job.title} ~* '(lead|staff|principal|architect|manager|director|head|expert)' THEN
                  CASE WHEN ('lead' = ANY(${persona.seniorityLevels}::text[]) OR 'staff' = ANY(${persona.seniorityLevels}::text[]) OR 'principal' = ANY(${persona.seniorityLevels}::text[])) THEN 1.0 ELSE 0.0 END
                ELSE 0.5
              END
            ) * 0.08
            // v2 Corpus Expansion (Criterion 3): company_size_score is a clamped
            // [-0.30, +0.30] offset applied WITHIN the existing 0.17 companyQuality
            // weight bucket — NOT a separate weight bucket. The locked weighting
            // scheme must not change. companySizeScore is clamped at write time
            // (see src/lib/jobs/company-scorer.ts SCORE_CLAMP_MIN/MAX), so the
            // combined term ranges from (0.20 * 0.17) to (1.30 * 0.17).
            + (COALESCE(${companyQualityScore.score}, 50) / 100.0 + COALESCE(${companyQualityScore.companySizeScore}::numeric, 0)) * 0.17
          )
          - (
            CASE
              WHEN COALESCE(array_length(${persona.blocklistTags}, 1), 0) = 0 OR COALESCE(array_length(${job.extractedTags}, 1), 0) = 0 THEN 0.0
              WHEN ${persona.blocklistTags} && ${job.extractedTags} THEN 1.0
              ELSE 0.0
            END
          ) * 0.10
          - (
            CASE
              WHEN COALESCE(array_length(${persona.mustHaveTags}, 1), 0) = 0 OR COALESCE(array_length(${job.extractedTags}, 1), 0) = 0 THEN 0.0
              WHEN COALESCE(${matchQueue.overlapScore}, 0) = 0 THEN 1.0
              ELSE 1.0 - (COALESCE(${matchQueue.overlapScore}, 0)::float / LEAST(array_length(${persona.mustHaveTags}, 1), array_length(${job.extractedTags}, 1)))
            END
          ) * 0.10
          - (
            LEAST(
              COALESCE(array_length(
                ARRAY(
                  SELECT unnest(${job.extractedTags})
                  INTERSECT
                  SELECT unnest(ARRAY['wordpress','vue','nuxt','angular','svelte','solidjs','php','laravel','ruby','rails','csharp','dotnet','aspnet','swift','kotlin','flutter','ios','android'])
                  EXCEPT
                  SELECT unnest(${persona.mustHaveTags})
                ), 1
              ), 0)::float / 3,
              1.0
            )
          ) * 0.08
        )
      ) * 100
    )
  `;

  const rows = await db
    .select({
      matchQueueId: matchQueue.id,
      jobId: matchQueue.jobId,
      jobTitle: job.title,
      jobAtsSource: job.atsSource,
      jobAtsSlug: job.atsSlug,
      jobNormalizedText: job.normalizedText,
      jobShortDescription: job.shortDescription,
      jobWorkplaceType: job.workplaceType,
      personaId: matchQueue.personaId,
      personaLabel: persona.personaLabel,
      overlapScore: matchQueue.overlapScore,
      cosineDistance: matchQueue.cosineDistance,
      llmVerdict: matchQueue.llmVerdict,
      llmReasoning: matchQueue.llmReasoning,
      llmConfidence: matchQueue.llmConfidence,
      llmBlockers: matchQueue.llmBlockers,
      status: matchQueue.status,
      isRead: matchQueue.isRead,
      createdAt: matchQueue.createdAt,
      matchScore: matchScoreExpr,
      workAuthRiskFlag: matchQueue.workAuthRiskFlag,
    })
    .from(matchQueue)
    .innerJoin(job, eq(matchQueue.jobId, job.id))
    .innerJoin(persona, eq(matchQueue.personaId, persona.id))
    .innerJoin(applicant, eq(matchQueue.applicantId, applicant.userId))
    .leftJoin(
      company,
      sql`${company.atsSource}::text = ${job.atsSource} AND ${company.atsSlug} = ${job.atsSlug}`,
    )
    .leftJoin(
      companyQualityScore,
      eq(company.id, companyQualityScore.companyId),
    )
    .where(
      statusFilter
        ? and(eq(matchQueue.applicantId, userId), statusFilter)
        : eq(matchQueue.applicantId, userId),
    )
    .orderBy(
      ...(sort === "newest"
        ? [desc(matchQueue.createdAt)]
        : sort === "oldest"
          ? [asc(matchQueue.createdAt)]
          : [desc(matchScoreExpr), desc(matchQueue.createdAt)]),
    )
    .limit(limit)
    .offset(offset);

  return rows as MatchRow[];
}

/**
 * Get approved matches for the dashboard list (paginated, applicant-scoped).
 *
 * Convenience wrapper around getMatches for the default 'approved' filter.
 * Kept for backward compatibility with existing callers.
 *
 * @param userId   The authenticated user's ID (applicant.userId)
 * @param limit    Page size (default 20)
 * @param offset   Pagination offset (default 0)
 * @returns        Array of approved match rows with job + persona data
 */
export async function getApprovedMatches(
  userId: string,
  limit = 20,
  offset = 0,
  sort: MatchSortOption = "best_match",
): Promise<MatchRow[]> {
  return getMatches(userId, "approved", limit, offset, sort);
}

/**
 * Get the total count of matches for pagination (applicant-scoped, status-filtered).
 *
 * @param userId  The authenticated user's ID
 * @param status  Filter by status: 'approved', 'rejected', 'pending', or 'all'
 * @returns        Total count of matching rows
 */
export async function getMatchesCount(
  userId: string,
  status: MatchStatusFilter = "approved",
): Promise<number> {
  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 1);

  const statusFilter =
    status === "all"
      ? undefined
      : status === "pending"
        ? inArray(matchQueue.status, ["pending", "error"])
        : status === "stale"
          ? sql`${matchQueue.status} = 'stale' AND ${matchQueue.staleAt} >= ${staleCutoff}`
          : eq(matchQueue.status, status);

  const rows = await db
    .select({ cnt: count() })
    .from(matchQueue)
    .where(
      statusFilter
        ? and(eq(matchQueue.applicantId, userId), statusFilter)
        : eq(matchQueue.applicantId, userId),
    );

  return rows[0]?.cnt ?? 0;
}

/**
 * Get the unread approved match count for the sidebar badge.
 *
 * Uses match_queue_unread_badge_idx — a partial index that only indexes
 * rows WHERE is_read = false AND status = 'approved'. This is a tiny fraction
 * of total matches, so the index is very small and fast.
 *
 * Resilient: if the DB query fails (e.g. transient WebSocket connection issue
 * with the Neon serverless driver in the Turbopack dev server), returns 0
 * instead of crashing the dashboard layout. The badge is non-critical UI.
 *
 * @param userId  The authenticated user's ID
 * @returns       Count of unread approved matches (0 if none or on error)
 */
export async function getUnreadBadgeCount(userId: string): Promise<number> {
  try {
    const rows = await db
      .select({ cnt: count() })
      .from(matchQueue)
      .where(
        and(
          eq(matchQueue.applicantId, userId),
          eq(matchQueue.isRead, false),
          eq(matchQueue.status, "approved"),
        ),
      );

    return rows[0]?.cnt ?? 0;
  } catch (error) {
    console.warn(
      "[getUnreadBadgeCount] Query failed — returning 0 for sidebar badge.",
      error instanceof Error ? error.message : error,
    );
    return 0;
  }
}

/**
 * Get a single match detail with full job + persona context.
 *
 * Used on the match detail view (clicking a match in the list).
 * Applicant-scoped — a user can only view their own matches.
 *
 * @param userId       The authenticated user's ID
 * @param matchQueueId The match queue row ID
 * @returns            The match detail, or null if not found / not owned
 */
export async function getMatchDetail(
  userId: string,
  matchQueueId: string,
): Promise<MatchDetail | null> {
  const rows = await db
    .select({
      matchQueueId: matchQueue.id,
      status: matchQueue.status,
      llmVerdict: matchQueue.llmVerdict,
      llmReasoning: matchQueue.llmReasoning,
      llmConfidence: matchQueue.llmConfidence,
      llmBlockers: matchQueue.llmBlockers,
      llmModel: matchQueue.llmModel,
      evaluatedAt: matchQueue.evaluatedAt,
      isRead: matchQueue.isRead,
      createdAt: matchQueue.createdAt,
      overlapScore: matchQueue.overlapScore,
      cosineDistance: matchQueue.cosineDistance,
      workAuthRiskFlag: matchQueue.workAuthRiskFlag,
      jobId: job.id,
      jobTitle: job.title,
      jobAtsSource: job.atsSource,
      jobAtsSlug: job.atsSlug,
      jobRawJson: job.rawJson,
      jobNormalizedText: job.normalizedText,
      jobExtractedTags: job.extractedTags,
      personaId: persona.id,
      personaLabel: persona.personaLabel,
      personaEmbeddingSummary: persona.embeddingSummary,
      personaMustHaveTags: persona.mustHaveTags,
    })
    .from(matchQueue)
    .innerJoin(job, eq(matchQueue.jobId, job.id))
    .innerJoin(persona, eq(matchQueue.personaId, persona.id))
    .where(
      and(eq(matchQueue.id, matchQueueId), eq(matchQueue.applicantId, userId)),
    )
    .limit(1);

  if (rows.length === 0) return null;

  const r = rows[0];
  return {
    matchQueueId: r.matchQueueId,
    status: r.status,
    llmVerdict: r.llmVerdict,
    llmReasoning: r.llmReasoning,
    llmConfidence: r.llmConfidence,
    llmBlockers: r.llmBlockers,
    llmModel: r.llmModel,
    evaluatedAt: r.evaluatedAt,
    isRead: r.isRead,
    createdAt: r.createdAt,
    overlapScore: r.overlapScore,
    cosineDistance: r.cosineDistance,
    workAuthRiskFlag: r.workAuthRiskFlag,
    job: {
      id: r.jobId,
      title: r.jobTitle,
      atsSource: r.jobAtsSource,
      atsSlug: r.jobAtsSlug,
      rawJson: r.jobRawJson,
      normalizedText: r.jobNormalizedText,
      extractedTags: r.jobExtractedTags,
    },
    persona: {
      id: r.personaId,
      personaLabel: r.personaLabel,
      embeddingSummary: r.personaEmbeddingSummary,
      mustHaveTags: r.personaMustHaveTags,
    },
  };
}
