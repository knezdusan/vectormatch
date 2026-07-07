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
import { job } from "@/db/schemas/jobs/job";

// =============================================================================
// TYPES
// =============================================================================

export type JobSortOption = "newest" | "relevance" | "quality" | "salary";
export type JobRemoteScope =
  | "global"
  | "country_fenced"
  | "region_fenced"
  | "all";
export type JobWorkplaceType = "remote" | "hybrid" | "on-site" | "all";
export type JobEmploymentType = "full-time" | "contract" | "part-time" | "all";

export interface JobFilters {
  search?: string;
  remoteScope?: JobRemoteScope;
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
  atsSource: string;
  // Company quality signals - temporarily disabled until company join is fixed
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
  { value: "relevance", label: "Relevance" },
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

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function addCondition(conditions: SQL[], condition: SQL | undefined) {
  if (condition !== undefined) {
    conditions.push(condition);
  }
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

    // Remote scope filter
    if (filters.remoteScope && filters.remoteScope !== "all") {
      addCondition(conditions, eq(job.remoteScope, filters.remoteScope));
    }

    // Workplace type filter
    if (filters.workplaceType && filters.workplaceType !== "all") {
      addCondition(conditions, eq(job.workplaceType, filters.workplaceType));
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
    if (filters.skills && filters.skills.length > 0) {
      addCondition(
        conditions,
        sql`${job.extractedTags}::text[] && ARRAY[${sql.raw(filters.skills.join(","))}]`,
      );
    }

    // Posted within X days filter
    if (filters.postedWithin !== undefined && filters.postedWithin > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.postedWithin);
      addCondition(
        conditions,
        or(gte(job.publishedAt, cutoffDate), gte(job.detectedAt, cutoffDate)),
      );
    }

    // Build the base query with sorting and pagination in one fluent chain
    const orderByClause =
      sortBy === "salary"
        ? [desc(job.compensationMax), desc(job.publishedAt)]
        : [desc(job.publishedAt), desc(job.detectedAt)];

    const rows = await db
      .select({
        id: job.id,
        title: job.title,
        companyName: job.companyName,
        shortDescription: job.shortDescription,
        normalizedText: job.normalizedText,
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
        atsSource: job.atsSource,
      })
      .from(job)
      .where(and(...conditions))
      .orderBy(...orderByClause)
      .limit(pageSize)
      .offset(offset);

    return rows.map((row) => ({
      ...row,
      // Company quality signals - temporarily disabled until company join is fixed
      companyTier: null,
      companyHealth: null,
      fusionScore: null,
      employeeCount: null,
      isAgency: null,
      isPublic: null,
    })) as PublicJobRow[];
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
        atsSource: job.atsSource,
      })
      .from(job)
      .where(and(eq(job.id, jobId), eq(job.status, "active")))
      .limit(1);

    if (rows.length === 0) return null;

    const row = rows[0];
    if (!row.shortDescription) return null;

    return {
      ...row,
      companyTier: null,
      companyHealth: null,
      fusionScore: null,
      employeeCount: null,
      isAgency: null,
      isPublic: null,
    } as PublicJobRow;
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

    // Remote scope filter
    if (filters.remoteScope && filters.remoteScope !== "all") {
      addCondition(conditions, eq(job.remoteScope, filters.remoteScope));
    }

    // Workplace type filter
    if (filters.workplaceType && filters.workplaceType !== "all") {
      addCondition(conditions, eq(job.workplaceType, filters.workplaceType));
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
    if (filters.skills && filters.skills.length > 0) {
      addCondition(
        conditions,
        sql`${job.extractedTags}::text[] && ARRAY[${sql.raw(filters.skills.join(","))}]`,
      );
    }

    // Posted within X days filter
    if (filters.postedWithin !== undefined && filters.postedWithin > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.postedWithin);
      addCondition(
        conditions,
        or(gte(job.publishedAt, cutoffDate), gte(job.detectedAt, cutoffDate)),
      );
    }

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
    const [totalJobs, globalRemote, countryFenced, newThisWeek] =
      await Promise.all([
        db.select({ count: count() }).from(job).where(eq(job.status, "active")),
        db
          .select({ count: count() })
          .from(job)
          .where(and(eq(job.status, "active"), eq(job.remoteScope, "global"))),
        db
          .select({ count: count() })
          .from(job)
          .where(
            and(
              eq(job.status, "active"),
              eq(job.remoteScope, "country_fenced"),
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
    .where(eq(job.status, "active"))
    .groupBy(sql`unnest(${job.extractedTags})`)
    .orderBy(desc(count()))
    .limit(limit);

  return result;
}
