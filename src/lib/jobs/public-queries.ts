// Public Job Listings Query Layer
// src/lib/jobs/public-queries.ts
//
// Read-side queries for the /jobs public page. All queries are public-facing
// (no authentication required) and use appropriate indexes for performance.
//
// Server-only: touches the database. Called from Server Components.

import { and, count, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";

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
  // Company quality signals - temporarily disabled
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
    const conditions = [eq(job.status, "active")];

    // Search filter (title + description + tags)
    if (filters.search?.trim()) {
      const searchTerm = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(job.title, searchTerm),
          ilike(job.normalizedText, searchTerm),
          ilike(job.shortDescription, searchTerm),
          sql`${job.extractedTags}::text[] && ARRAY[${filters.search}]`,
        ) || undefined,
      );
    }

    // Remote scope filter
    if (filters.remoteScope && filters.remoteScope !== "all") {
      conditions.push(eq(job.remoteScope, filters.remoteScope));
    }

    // Workplace type filter
    if (filters.workplaceType && filters.workplaceType !== "all") {
      conditions.push(eq(job.workplaceType, filters.workplaceType));
    }

    // Employment type filter
    if (filters.employmentType && filters.employmentType !== "all") {
      conditions.push(eq(job.employmentType, filters.employmentType));
    }

    // Salary range filter
    if (filters.minSalary !== undefined && filters.minSalary > 0) {
      conditions.push(
        or(
          gte(job.compensationMin, filters.minSalary),
          sql`${job.compensationMin} IS NULL`,
        ) || undefined,
      );
    }
    if (filters.maxSalary !== undefined && filters.maxSalary > 0) {
      conditions.push(
        or(
          lte(job.compensationMax, filters.maxSalary),
          sql`${job.compensationMax} IS NULL`,
        ) || undefined,
      );
    }

    // Experience range filter
    if (filters.minExperience !== undefined && filters.minExperience >= 0) {
      conditions.push(
        or(
          gte(job.experienceMinYears, filters.minExperience),
          sql`${job.experienceMinYears} IS NULL`,
        ) || undefined,
      );
    }
    if (filters.maxExperience !== undefined && filters.maxExperience >= 0) {
      conditions.push(
        or(
          lte(job.experienceMaxYears, filters.maxExperience),
          sql`${job.experienceMaxYears} IS NULL`,
        ) || undefined,
      );
    }

    // Department filter
    if (filters.department) {
      conditions.push(ilike(job.department, `%${filters.department}%`));
    }

    // Skills filter (must have at least one matching skill)
    if (filters.skills && filters.skills.length > 0) {
      conditions.push(
        sql`${job.extractedTags}::text[] && ARRAY[${sql.raw(filters.skills.join(","))}]`,
      );
    }

    // Posted within X days filter
    if (filters.postedWithin !== undefined && filters.postedWithin > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.postedWithin);
      conditions.push(
        or(gte(job.publishedAt, cutoffDate), gte(job.detectedAt, cutoffDate)) ||
          undefined,
      );
    }

    // Build the base query
    let query = db
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
        // Company quality signals - set to null for now
        companyTier: sql<string>`NULL`.as("companyTier"),
        companyHealth: sql<string>`NULL`.as("companyHealth"),
        fusionScore: sql<number>`NULL`.as("fusionScore"),
        employeeCount: sql<number>`NULL`.as("employeeCount"),
        isAgency: sql<boolean>`NULL`.as("isAgency"),
        isPublic: sql<boolean>`NULL`.as("isPublic"),
      })
      .from(job)
      .where(and(...conditions));

    // Apply sorting
    switch (sortBy) {
      case "newest":
        query = query.orderBy(desc(job.publishedAt), desc(job.detectedAt));
        break;
      case "relevance":
        // For relevance, we'd use embedding similarity if a query vector was provided
        // For now, fall back to newest
        query = query.orderBy(desc(job.publishedAt), desc(job.detectedAt));
        break;
      case "quality":
        query = query.orderBy(
          desc(company.fusionScore),
          desc(company.tier),
          desc(job.publishedAt),
        );
        break;
      case "salary":
        query = query.orderBy(desc(job.compensationMax), desc(job.publishedAt));
        break;
    }

    // Apply pagination
    query = query.limit(pageSize).offset(offset);

    return query;
  } catch (error) {
    console.error("Error in getPublicJobs:", error);
    return [];
  }
}

/**
 * Get total count of jobs matching filters
 */
export async function getPublicJobsCount(
  filters: JobFilters = {},
): Promise<number> {
  try {
    const conditions = [eq(job.status, "active")];

    // Search filter
    if (filters.search?.trim()) {
      const searchTerm = `%${filters.search.trim()}%`;
      conditions.push(
        or(
          ilike(job.title, searchTerm),
          ilike(job.normalizedText, searchTerm),
          ilike(job.shortDescription, searchTerm),
          sql`${job.extractedTags}::text[] && ARRAY[${filters.search}]`,
        ) || undefined,
      );
    }

    // Remote scope filter
    if (filters.remoteScope && filters.remoteScope !== "all") {
      conditions.push(eq(job.remoteScope, filters.remoteScope));
    }

    // Workplace type filter
    if (filters.workplaceType && filters.workplaceType !== "all") {
      conditions.push(eq(job.workplaceType, filters.workplaceType));
    }

    // Employment type filter
    if (filters.employmentType && filters.employmentType !== "all") {
      conditions.push(eq(job.employmentType, filters.employmentType));
    }

    // Salary range filter
    if (filters.minSalary !== undefined && filters.minSalary > 0) {
      conditions.push(
        or(
          gte(job.compensationMin, filters.minSalary),
          sql`${job.compensationMin} IS NULL`,
        ) || undefined,
      );
    }
    if (filters.maxSalary !== undefined && filters.maxSalary > 0) {
      conditions.push(
        or(
          lte(job.compensationMax, filters.maxSalary),
          sql`${job.compensationMax} IS NULL`,
        ) || undefined,
      );
    }

    // Experience range filter
    if (filters.minExperience !== undefined && filters.minExperience >= 0) {
      conditions.push(
        or(
          gte(job.experienceMinYears, filters.minExperience),
          sql`${job.experienceMinYears} IS NULL`,
        ) || undefined,
      );
    }
    if (filters.maxExperience !== undefined && filters.maxExperience >= 0) {
      conditions.push(
        or(
          lte(job.experienceMaxYears, filters.maxExperience),
          sql`${job.experienceMaxYears} IS NULL`,
        ) || undefined,
      );
    }

    // Department filter
    if (filters.department) {
      conditions.push(ilike(job.department, `%${filters.department}%`));
    }

    // Skills filter
    if (filters.skills && filters.skills.length > 0) {
      conditions.push(
        sql`${job.extractedTags}::text[] && ARRAY[${sql.raw(filters.skills.join(","))}]`,
      );
    }

    // Posted within X days filter
    if (filters.postedWithin !== undefined && filters.postedWithin > 0) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.postedWithin);
      conditions.push(
        or(gte(job.publishedAt, cutoffDate), gte(job.detectedAt, cutoffDate)) ||
          undefined,
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
