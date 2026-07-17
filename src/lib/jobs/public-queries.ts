// Public Job Listings Query Layer
// src/lib/jobs/public-queries.ts
//
// Read-side queries for the /jobs public page. All queries are public-facing
// (no authentication required) and use appropriate indexes for performance.
//
// Server-only: touches the database. Called from Server Components.

import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";

import { db } from "@/db/db";
import { company } from "@/db/schemas/jobs/company";
import { job } from "@/db/schemas/jobs/job";

// =============================================================================
// TYPES
// =============================================================================

export type JobSortOption = "newest" | "oldest" | "quality" | "salary";
export type JobRemoteScope =
  | "global"
  | "country_fenced"
  | "region_fenced"
  | "all";
export type JobWorkplaceType = "remote" | "hybrid" | "on-site" | "all";
export type JobEmploymentType = "full-time" | "contract" | "part-time" | "all";

/** Unified workplace filter covering both work arrangement and geo scope. */
export type WorkplaceFilter =
  | "all"
  | "global_remote"
  | "country_fenced_remote"
  | "region_fenced_remote"
  | "hybrid"
  | "on_site";

export interface JobFilters {
  search?: string;
  /** Unified workplace filter. Takes precedence over remoteScope/workplaceType. */
  workplace?: WorkplaceFilter;
  /** @deprecated Use `workplace` instead. Kept for URL backward compatibility. */
  remoteScope?: JobRemoteScope;
  /** @deprecated Use `workplace` instead. Kept for URL backward compatibility. */
  workplaceType?: JobWorkplaceType;
  employmentType?: JobEmploymentType;
  minSalary?: number;
  maxSalary?: number;
  minExperience?: number;
  maxExperience?: number;
  department?: string;
  skills?: string[];
  postedWithin?: number; // days
}

export interface PublicJobRow {
  id: string;
  title: string;
  companyName: string | null;
  shortDescription: string | null;
  normalizedText: string | null;
  rawJson: string | null;
  workplaceType: string | null;
  remoteScope: string | null;
  employmentType: string | null;
  locationName: string | null;
  compensationMin: string | null;
  compensationMax: string | null;
  compensationCurrency: string | null;
  experienceMinYears: number | null;
  experienceMaxYears: number | null;
  department: string | null;
  team: string | null;
  extractedTags: string[];
  publishedAt: Date | null;
  detectedAt: Date | null;
  lastSeenAt: Date | null;
  applyUrl: string | null;
  jobUrl: string | null;
  atsSource: string;
  atsSlug: string;
  // Company quality signals joined via (atsSource, atsSlug)
  companyTier: string | null;
  companyHealth: string | null;
  fusionScore: number | null;
  employeeCount: number | null;
  isAgency: boolean | null;
  isPublic: boolean | null;
}

export const JOB_SORT_OPTIONS: readonly {
  value: JobSortOption;
  label: string;
}[] = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "quality", label: "Company Quality" },
  { value: "salary", label: "Highest Pay" },
] as const;

export const REMOTE_SCOPE_OPTIONS: readonly {
  value: JobRemoteScope;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "global", label: "Global Remote" },
  { value: "country_fenced", label: "Country-Fenced" },
  { value: "region_fenced", label: "Region-Fenced" },
] as const;

export const WORKPLACE_TYPE_OPTIONS: readonly {
  value: JobWorkplaceType;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
] as const;

export const EMPLOYMENT_TYPE_OPTIONS: readonly {
  value: JobEmploymentType;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "full-time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "part-time", label: "Part-time" },
] as const;

export const WORKPLACE_FILTER_OPTIONS: readonly {
  value: WorkplaceFilter;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "global_remote", label: "Global Remote" },
  { value: "country_fenced_remote", label: "Country-Fenced Remote" },
  { value: "region_fenced_remote", label: "Region-Fenced Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on_site", label: "On-site" },
] as const;

/**
 * Map the unified workplace filter to the underlying database fields.
 * Returns undefined for a field when the filter should not constrain it.
 */
export function mapWorkplaceFilter(workplace?: WorkplaceFilter): {
  remoteScope?: Exclude<JobRemoteScope, "all">;
  workplaceType?: Exclude<JobWorkplaceType, "all">;
} {
  switch (workplace) {
    case "global_remote":
      return { remoteScope: "global", workplaceType: "remote" };
    case "country_fenced_remote":
      return { remoteScope: "country_fenced", workplaceType: "remote" };
    case "region_fenced_remote":
      return { remoteScope: "region_fenced", workplaceType: "remote" };
    case "hybrid":
      return { workplaceType: "hybrid" };
    case "on_site":
      return { workplaceType: "on-site" };
    default:
      return {};
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition !== undefined) {
    conditions.push(condition);
  }
}

/**
 * Default freshness window for the public /jobs page. Jobs older than this are
 * excluded from listings even if their status is still "active" — the daily
 * stale sweep may not have caught them yet, or the ATS keeps returning an
 * ancient posting that the company never took down.
 *
 * Set to 60 days to match MAX_JOB_AGE_DAYS. Override per-request via the
 * `postedWithin` filter (which can be narrower, e.g. 7/30 days).
 */
const DEFAULT_PUBLIC_FRESHNESS_DAYS = 60;

/**
 * Build the default age-filter condition. Uses publishedAt with a detectedAt
 * fallback for jobs where the ATS didn't provide a publish date.
 *
 * If the caller provides a `postedWithin` filter that is narrower than the
 * default, the narrower filter takes precedence (the caller's filter replaces
 * the default — we don't AND them, since that would be redundant).
 */
function buildDefaultAgeCondition(postedWithin?: number): SQL {
  const days =
    postedWithin && postedWithin > 0
      ? postedWithin
      : DEFAULT_PUBLIC_FRESHNESS_DAYS;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);
  return (
    or(
      gte(job.publishedAt, cutoffDate),
      and(sql`${job.publishedAt} IS NULL`, gte(job.detectedAt, cutoffDate)),
    ) ?? sql`TRUE`
  );
}

// =============================================================================
// QUERIES
// =============================================================================

/**
 * Get public job listings with filters and pagination
 */
export async function getPublicJobs(
  filters: JobFilters = {},
  pageSize: number = 20,
  offset: number = 0,
  sortBy: JobSortOption = "newest",
): Promise<PublicJobRow[]> {
  try {
    const conditions: SQL[] = [eq(job.status, "active")];

    // Search filter (title + description + tags)
    if (filters.search?.trim()) {
      const searchTerm = `%${filters.search.trim()}%`;
      addCondition(
        conditions,
        or(
          ilike(job.title, searchTerm),
          ilike(job.normalizedText, searchTerm),
          ilike(job.shortDescription, searchTerm),
          sql`${job.extractedTags}::text[] && ARRAY[${filters.search}]`,
        ),
      );
    }

    // Default freshness gate — exclude jobs older than 60 days (or the
    // user-specified postedWithin, whichever is narrower). This is a
    // defense-in-depth layer on top of the daily stale sweep.
    addCondition(conditions, buildDefaultAgeCondition(filters.postedWithin));

    // Unified workplace filter (remote scope + workplace type). Takes precedence
    // over legacy individual filters for backward-compatible URL handling.
    const effectiveWorkplace =
      filters.workplace && filters.workplace !== "all"
        ? mapWorkplaceFilter(filters.workplace)
        : {};

    // Fallback to legacy filters only when the unified filter is not active.
    const effectiveRemoteScope =
      effectiveWorkplace.remoteScope ??
      (filters.remoteScope && filters.remoteScope !== "all"
        ? filters.remoteScope
        : undefined);
    const effectiveWorkplaceType =
      effectiveWorkplace.workplaceType ??
      (filters.workplaceType && filters.workplaceType !== "all"
        ? filters.workplaceType
        : undefined);

    if (effectiveRemoteScope) {
      addCondition(conditions, eq(job.remoteScope, effectiveRemoteScope));
    }
    if (effectiveWorkplaceType) {
      addCondition(conditions, eq(job.workplaceType, effectiveWorkplaceType));
    }

    // Employment type filter
    if (filters.employmentType && filters.employmentType !== "all") {
      addCondition(conditions, eq(job.employmentType, filters.employmentType));
    }

    // Salary range filter
    if (filters.minSalary !== undefined && filters.minSalary > 0) {
      addCondition(
        conditions,
        or(
          gte(job.compensationMin, sql`${filters.minSalary}`),
          sql`${job.compensationMin} IS NULL`,
        ),
      );
    }
    if (filters.maxSalary !== undefined && filters.maxSalary > 0) {
      addCondition(
        conditions,
        or(
          lte(job.compensationMax, sql`${filters.maxSalary}`),
          sql`${job.compensationMax} IS NULL`,
        ),
      );
    }

    // Experience range filter
    if (filters.minExperience !== undefined && filters.minExperience >= 0) {
      addCondition(
        conditions,
        or(
          gte(job.experienceMinYears, filters.minExperience),
          sql`${job.experienceMinYears} IS NULL`,
        ),
      );
    }
    if (filters.maxExperience !== undefined && filters.maxExperience >= 0) {
      addCondition(
        conditions,
        or(
          lte(job.experienceMaxYears, filters.maxExperience),
          sql`${job.experienceMaxYears} IS NULL`,
        ),
      );
    }

    // Department filter
    if (filters.department) {
      addCondition(
        conditions,
        ilike(job.department, `%${filters.department}%`),
      );
    }

    // Skills filter (must have at least one matching skill)
    // SECURITY: Each skill is bound as a parameterized value via sql.join(),
    // never interpolated as raw SQL. This prevents SQL injection from
    // user-supplied ?skills= query params (regression fix for SQLi vuln).
    if (filters.skills && filters.skills.length > 0) {
      addCondition(
        conditions,
        sql`${job.extractedTags}::text[] && ARRAY[${sql.join(
          filters.skills.map((s) => sql`${s}`),
          sql`, `,
        )}]`,
      );
    }

    // Note: postedWithin is handled by buildDefaultAgeCondition above (added
    // near the top of the conditions list). When postedWithin is provided, it
    // replaces the 60-day default; when absent, the 60-day default applies.

    // Effective date for sorting: use the ATS publish date when available,
    // otherwise fall back to the first time we detected the job. This matches
    // the COALESCE(published_at, detected_at) semantics used by the age filter.
    const effectiveDate = sql`COALESCE(${job.publishedAt}, ${job.detectedAt})`;

    // Sort order clause
    let orderByClause: SQL[];
    switch (sortBy) {
      case "newest":
        orderByClause = [sql`${effectiveDate} DESC`];
        break;
      case "oldest":
        orderByClause = [sql`${effectiveDate} ASC`];
        break;
      case "salary":
        orderByClause = [
          sql`${job.compensationMax} DESC NULLS LAST`,
          sql`${effectiveDate} DESC`,
        ];
        break;
      case "quality":
        orderByClause = [
          sql`${company.fusionScore} DESC NULLS LAST`,
          sql`${company.tier} DESC NULLS LAST`,
          sql`${effectiveDate} DESC`,
        ];
        break;
      default:
        orderByClause = [sql`${effectiveDate} DESC`];
        break;
    }

    const rows = await db
      .select({
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        shortDescription: job.shortDescription,
        normalizedText: job.normalizedText,
        rawJson: job.rawJson,
        workplaceType: job.workplaceType,
        remoteScope: job.remoteScope,
        employmentType: job.employmentType,
        locationName: job.locationName,
        compensationMin: job.compensationMin,
        compensationMax: job.compensationMax,
        compensationCurrency: job.compensationCurrency,
        experienceMinYears: job.experienceMinYears,
        experienceMaxYears: job.experienceMaxYears,
        department: job.department,
        team: job.team,
        extractedTags: job.extractedTags,
        publishedAt: job.publishedAt,
        detectedAt: job.detectedAt,
        lastSeenAt: job.lastSeenAt,
        applyUrl: job.applyUrl,
        jobUrl: job.jobUrl,
        atsSource: job.atsSource,
        atsSlug: job.atsSlug,
        // Company quality signals joined via (atsSource, atsSlug)
        companyTier: company.tier,
        companyHealth: company.health,
        fusionScore: company.fusionScore,
        employeeCount: company.activeJobCount,
        isAgency: sql<boolean>`FALSE`.as("isAgency"),
        isPublic: sql<boolean>`TRUE`.as("isPublic"),
      })
      .from(job)
      .leftJoin(
        company,
        sql`${job.atsSource}::text = ${company.atsSource}::text AND ${job.atsSlug} = ${company.atsSlug}`,
      )
      .where(and(...conditions))
      .orderBy(...orderByClause)
      .limit(pageSize)
      .offset(offset);

    return rows as PublicJobRow[];
  } catch (error) {
    console.error("Error in getPublicJobs:", error);
    return [];
  }
}

/**
 * Get a single public job by ID.
 * Only returns active jobs with a non-empty shortDescription (same filter as
 * getPublicJobs). Returns null if not found or not active.
 */
export async function getPublicJobById(
  jobId: string,
): Promise<PublicJobRow | null> {
  try {
    const rows = await db
      .select({
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        shortDescription: job.shortDescription,
        normalizedText: job.normalizedText,
        rawJson: job.rawJson,
        workplaceType: job.workplaceType,
        remoteScope: job.remoteScope,
        employmentType: job.employmentType,
        locationName: job.locationName,
        compensationMin: job.compensationMin,
        compensationMax: job.compensationMax,
        compensationCurrency: job.compensationCurrency,
        experienceMinYears: job.experienceMinYears,
        experienceMaxYears: job.experienceMaxYears,
        department: job.department,
        team: job.team,
        extractedTags: job.extractedTags,
        publishedAt: job.publishedAt,
        detectedAt: job.detectedAt,
        lastSeenAt: job.lastSeenAt,
        applyUrl: job.applyUrl,
        jobUrl: job.jobUrl,
        atsSource: job.atsSource,
        atsSlug: job.atsSlug,
        companyTier: company.tier,
        companyHealth: company.health,
        fusionScore: company.fusionScore,
        employeeCount: company.activeJobCount,
        isAgency: sql<boolean>`FALSE`.as("isAgency"),
        isPublic: sql<boolean>`TRUE`.as("isPublic"),
      })
      .from(job)
      .leftJoin(
        company,
        sql`${job.atsSource}::text = ${company.atsSource}::text AND ${job.atsSlug} = ${company.atsSlug}`,
      )
      .where(
        and(
          eq(job.id, jobId),
          eq(job.status, "active"),
          sql`${job.shortDescription} IS NOT NULL`,
          sql`${job.shortDescription} <> ''`,
        ),
      )
      .limit(1);

    if (rows.length === 0) return null;

    return rows[0] as PublicJobRow;
  } catch (error) {
    console.error("Error in getPublicJobById:", error);
    return null;
  }
}

/**
 * Get total count of jobs matching filters
 */
export async function getPublicJobsCount(
  filters: JobFilters = {},
): Promise<number> {
  try {
    const conditions: SQL[] = [eq(job.status, "active")];

    // Search filter
    if (filters.search?.trim()) {
      const searchTerm = `%${filters.search.trim()}%`;
      addCondition(
        conditions,
        or(
          ilike(job.title, searchTerm),
          ilike(job.normalizedText, searchTerm),
          ilike(job.shortDescription, searchTerm),
          sql`${job.extractedTags}::text[] && ARRAY[${filters.search}]`,
        ),
      );
    }

    // Default freshness gate — same as getPublicJobs
    addCondition(conditions, buildDefaultAgeCondition(filters.postedWithin));

    // Unified workplace filter (remote scope + workplace type). Takes precedence
    // over legacy individual filters for backward-compatible URL handling.
    const effectiveWorkplace =
      filters.workplace && filters.workplace !== "all"
        ? mapWorkplaceFilter(filters.workplace)
        : {};

    // Fallback to legacy filters only when the unified filter is not active.
    const effectiveRemoteScope =
      effectiveWorkplace.remoteScope ??
      (filters.remoteScope && filters.remoteScope !== "all"
        ? filters.remoteScope
        : undefined);
    const effectiveWorkplaceType =
      effectiveWorkplace.workplaceType ??
      (filters.workplaceType && filters.workplaceType !== "all"
        ? filters.workplaceType
        : undefined);

    if (effectiveRemoteScope) {
      addCondition(conditions, eq(job.remoteScope, effectiveRemoteScope));
    }
    if (effectiveWorkplaceType) {
      addCondition(conditions, eq(job.workplaceType, effectiveWorkplaceType));
    }

    // Employment type filter
    if (filters.employmentType && filters.employmentType !== "all") {
      addCondition(conditions, eq(job.employmentType, filters.employmentType));
    }

    // Salary range filter
    if (filters.minSalary !== undefined && filters.minSalary > 0) {
      addCondition(
        conditions,
        or(
          gte(job.compensationMin, sql`${filters.minSalary}`),
          sql`${job.compensationMin} IS NULL`,
        ),
      );
    }
    if (filters.maxSalary !== undefined && filters.maxSalary > 0) {
      addCondition(
        conditions,
        or(
          lte(job.compensationMax, sql`${filters.maxSalary}`),
          sql`${job.compensationMax} IS NULL`,
        ),
      );
    }

    // Experience range filter
    if (filters.minExperience !== undefined && filters.minExperience >= 0) {
      addCondition(
        conditions,
        or(
          gte(job.experienceMinYears, filters.minExperience),
          sql`${job.experienceMinYears} IS NULL`,
        ),
      );
    }
    if (filters.maxExperience !== undefined && filters.maxExperience >= 0) {
      addCondition(
        conditions,
        or(
          lte(job.experienceMaxYears, filters.maxExperience),
          sql`${job.experienceMaxYears} IS NULL`,
        ),
      );
    }

    // Department filter
    if (filters.department) {
      addCondition(
        conditions,
        ilike(job.department, `%${filters.department}%`),
      );
    }

    // Skills filter
    // SECURITY: Parameterized via sql.join() — see getPublicJobs for rationale.
    if (filters.skills && filters.skills.length > 0) {
      addCondition(
        conditions,
        sql`${job.extractedTags}::text[] && ARRAY[${sql.join(
          filters.skills.map((s) => sql`${s}`),
          sql`, `,
        )}]`,
      );
    }

    // Note: postedWithin is handled by buildDefaultAgeCondition above.

    const result = await db
      .select({ count: count() })
      .from(job)
      .where(and(...conditions))
      .then((rows) => rows[0]?.count ?? 0);

    return result;
  } catch (error) {
    console.error("Error in getPublicJobsCount:", error);
    return 0;
  }
}

/**
 * Get aggregate stats for the jobs page
 */
export async function getPublicJobsStats() {
  try {
    // Default freshness gate applied to all stats — only count jobs ≤60 days
    // old, matching the /jobs listing page behavior.
    const freshnessCondition = buildDefaultAgeCondition();

    const [totalJobs, globalRemote, countryFenced, newThisWeek] =
      await Promise.all([
        db
          .select({ count: count() })
          .from(job)
          .where(and(eq(job.status, "active"), freshnessCondition)),
        db
          .select({ count: count() })
          .from(job)
          .where(
            and(
              eq(job.status, "active"),
              eq(job.remoteScope, "global"),
              freshnessCondition,
            ),
          ),
        db
          .select({ count: count() })
          .from(job)
          .where(
            and(
              eq(job.status, "active"),
              eq(job.remoteScope, "country_fenced"),
              freshnessCondition,
            ),
          ),
        db
          .select({ count: count() })
          .from(job)
          .where(
            and(
              eq(job.status, "active"),
              or(
                gte(job.publishedAt, sql`NOW() - INTERVAL '7 days'`),
                gte(job.detectedAt, sql`NOW() - INTERVAL '7 days'`),
              ),
            ),
          ),
      ]);

    return {
      totalJobs: totalJobs[0]?.count ?? 0,
      globalRemote: globalRemote[0]?.count ?? 0,
      countryFenced: countryFenced[0]?.count ?? 0,
      newThisWeek: newThisWeek[0]?.count ?? 0,
    };
  } catch (error) {
    console.error("Error in getPublicJobsStats:", error);
    return {
      totalJobs: 0,
      globalRemote: 0,
      countryFenced: 0,
      newThisWeek: 0,
    };
  }
}

/**
 * Get trending skills (most common tags in active jobs)
 */
export async function getTrendingSkills(
  limit: number = 10,
): Promise<{ skill: string; count: number }[]> {
  const result = await db
    .select({
      skill: sql<string>`unnest(${job.extractedTags})`,
      count: count(),
    })
    .from(job)
    .where(and(eq(job.status, "active"), buildDefaultAgeCondition()))
    .groupBy(sql`unnest(${job.extractedTags})`)
    .orderBy(desc(count()))
    .limit(limit);

  return result;
}
