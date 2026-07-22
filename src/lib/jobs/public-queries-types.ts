// Public Job Listings — Shared Types & Constants
// src/lib/jobs/public-queries-types.ts
//
// Type definitions and UI constants for the /jobs public page.
// This file is safe to import from both Client and Server Components —
// it does NOT import the database layer (db.ts → pg), so it won't
// pull Node.js built-ins (dns, net, tls, fs) into the browser bundle.
//
// Server-only query functions live in public-queries.ts.

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
  descriptionHtml: string | null;
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

// =============================================================================
// UI CONSTANTS
// =============================================================================

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
