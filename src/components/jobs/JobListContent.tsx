// Job List Content Component
// src/components/jobs/JobListContent.tsx
//
// Server Component that fetches job data and renders the JobList client component.
// This is separated to allow Suspense boundary for the data fetching.

import { JobList } from "@/components/jobs/JobList";
import type { JobFilters, JobSortOption } from "@/lib/jobs/public-queries";
import {
  getPublicJobs,
  getPublicJobsCount,
  getPublicJobsStats,
} from "@/lib/jobs/public-queries";

const PAGE_SIZE = 20;
const VALID_SORTS: readonly JobSortOption[] = [
  "newest",
  "relevance",
  "quality",
  "salary",
] as const;

interface JobListContentProps {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    search?: string;
    remoteScope?: string;
    workplaceType?: string;
    employmentType?: string;
    minSalary?: string;
    maxSalary?: string;
    minExperience?: string;
    maxExperience?: string;
    department?: string;
    skills?: string;
    postedWithin?: string;
  }>;
}

export async function JobListContent({ searchParams }: JobListContentProps) {
  const params = await searchParams;

  // Parse query params with defaults
  const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const sortParam = params.sort ?? "newest";
  const sortBy: JobSortOption = VALID_SORTS.includes(sortParam as JobSortOption)
    ? (sortParam as JobSortOption)
    : "newest";

  // Build filters object with validation
  const minSalary = params.minSalary
    ? Number.parseInt(params.minSalary, 10)
    : undefined;
  const maxSalary = params.maxSalary
    ? Number.parseInt(params.maxSalary, 10)
    : undefined;
  const minExperience = params.minExperience
    ? Number.parseInt(params.minExperience, 10)
    : undefined;
  const maxExperience = params.maxExperience
    ? Number.parseInt(params.maxExperience, 10)
    : undefined;
  const postedWithin = params.postedWithin
    ? Number.parseInt(params.postedWithin, 10)
    : undefined;

  // Debug logging
  console.log("Raw params:", params);
  console.log("Parsed values:", {
    minSalary,
    maxSalary,
    minExperience,
    maxExperience,
    postedWithin,
  });

  const filters: JobFilters = {
    search: params.search || undefined,
    remoteScope:
      params.remoteScope === "global" ||
      params.remoteScope === "country_fenced" ||
      params.remoteScope === "region_fenced" ||
      params.remoteScope === "all"
        ? params.remoteScope
        : undefined,
    workplaceType:
      params.workplaceType === "remote" ||
      params.workplaceType === "hybrid" ||
      params.workplaceType === "on-site" ||
      params.workplaceType === "all"
        ? params.workplaceType
        : undefined,
    employmentType:
      params.employmentType === "full-time" ||
      params.employmentType === "contract" ||
      params.employmentType === "part-time" ||
      params.employmentType === "all"
        ? params.employmentType
        : undefined,
    // Validate salary ranges - only apply if reasonable values
    minSalary:
      minSalary && minSalary > 0 && minSalary < 1000000 ? minSalary : undefined,
    maxSalary:
      maxSalary && maxSalary > 0 && maxSalary < 1000000 ? maxSalary : undefined,
    // Validate experience ranges - only apply if reasonable values
    minExperience:
      minExperience && minExperience >= 0 && minExperience < 50
        ? minExperience
        : undefined,
    maxExperience:
      maxExperience && maxExperience >= 0 && maxExperience < 50
        ? maxExperience
        : undefined,
    department: params.department || undefined,
    skills: params.skills
      ? params.skills
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    postedWithin:
      postedWithin && postedWithin > 0 && postedWithin <= 365
        ? postedWithin
        : undefined,
  };

  console.log("Final filters:", filters);

  // Additional validation: ensure min <= max for ranges
  if (
    filters.minSalary &&
    filters.maxSalary &&
    filters.minSalary > filters.maxSalary
  ) {
    console.log("Invalid salary range, clearing filters");
    filters.minSalary = undefined;
    filters.maxSalary = undefined;
  }
  if (
    filters.minExperience &&
    filters.maxExperience &&
    filters.minExperience > filters.maxExperience
  ) {
    console.log("Invalid experience range, clearing filters");
    filters.minExperience = undefined;
    filters.maxExperience = undefined;
  }

  // If any invalid params were detected, redirect to clean URL
  const hasInvalidParams =
    (minSalary !== undefined && !filters.minSalary) ||
    (maxSalary !== undefined && !filters.maxSalary) ||
    (minExperience !== undefined && !filters.minExperience) ||
    (maxExperience !== undefined && !filters.maxExperience) ||
    (postedWithin !== undefined && !filters.postedWithin);

  if (hasInvalidParams) {
    console.log("Invalid parameters detected, redirecting to clean URL");
    // Build clean URL with only valid filters
    const cleanParams = new URLSearchParams();
    if (filters.search) cleanParams.set("search", filters.search);
    if (filters.remoteScope && filters.remoteScope !== "all")
      cleanParams.set("remoteScope", filters.remoteScope);
    if (filters.workplaceType && filters.workplaceType !== "all")
      cleanParams.set("workplaceType", filters.workplaceType);
    if (filters.employmentType && filters.employmentType !== "all")
      cleanParams.set("employmentType", filters.employmentType);
    if (filters.minSalary)
      cleanParams.set("minSalary", filters.minSalary.toString());
    if (filters.maxSalary)
      cleanParams.set("maxSalary", filters.maxSalary.toString());
    if (filters.minExperience)
      cleanParams.set("minExperience", filters.minExperience.toString());
    if (filters.maxExperience)
      cleanParams.set("maxExperience", filters.maxExperience.toString());
    if (filters.department) cleanParams.set("department", filters.department);
    if (filters.skills && filters.skills.length > 0)
      cleanParams.set("skills", filters.skills.join(","));
    if (filters.postedWithin)
      cleanParams.set("postedWithin", filters.postedWithin.toString());
    if (sortBy !== "newest") cleanParams.set("sort", sortBy);

    const cleanUrl = cleanParams.toString()
      ? `/jobs?${cleanParams.toString()}`
      : "/jobs";
    redirect(cleanUrl);
  }

  // Fetch data in parallel
  const [jobs, totalCount, stats] = await Promise.all([
    getPublicJobs(filters, PAGE_SIZE, offset, sortBy).catch((error) => {
      console.error("Error fetching jobs:", error);
      return [];
    }),
    getPublicJobsCount(filters).catch((error) => {
      console.error("Error fetching job count:", error);
      return 0;
    }),
    getPublicJobsStats().catch((error) => {
      console.error("Error fetching job stats:", error);
      return {
        totalJobs: 0,
        globalRemote: 0,
        countryFenced: 0,
        newThisWeek: 0,
      };
    }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <JobList
      jobs={jobs}
      totalCount={totalCount}
      currentPage={currentPage}
      totalPages={totalPages}
      sortBy={sortBy}
      filters={filters}
      stats={stats}
    />
  );
}
