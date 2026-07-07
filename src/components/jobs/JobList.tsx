// Job List Component
// src/components/jobs/JobList.tsx
//
// Client component that renders the job listing page with filters,
// sorting, and pagination.

"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import type {
  JobFilters,
  JobSortOption,
  PublicJobRow,
} from "@/lib/jobs/public-queries";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  JOB_SORT_OPTIONS,
  REMOTE_SCOPE_OPTIONS,
  WORKPLACE_TYPE_OPTIONS,
} from "@/lib/jobs/public-queries";
import { JobCard } from "./JobCard";
import { TooltipInfo } from "./TooltipInfo";

interface JobListProps {
  jobs: PublicJobRow[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  sortBy: JobSortOption;
  filters: JobFilters;
  stats: {
    totalJobs: number;
    globalRemote: number;
    countryFenced: number;
    newThisWeek: number;
  };
  isAuthenticated: boolean;
}

// Slider ranges used in the UI (independent of the database outliers).
const SALARY_MIN = 0;
const SALARY_MAX = 300000;
const SALARY_STEP = 5000;
const EXPERIENCE_MIN = 0;
const EXPERIENCE_MAX = 15;
const EXPERIENCE_STEP = 1;

export function JobList({
  jobs,
  totalCount,
  currentPage,
  totalPages,
  sortBy,
  filters,
  stats,
  isAuthenticated,
}: JobListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Local search input state so the URL is only updated on explicit actions.
  const [searchInput, setSearchInput] = useState(filters.search ?? "");

  // Local slider state (fallback to full range when no filter is active).
  const [salaryRange, setSalaryRange] = useState<number[]>([
    filters.minSalary ?? SALARY_MIN,
    filters.maxSalary ?? SALARY_MAX,
  ]);
  const [experienceRange, setExperienceRange] = useState<number[]>([
    filters.minExperience ?? EXPERIENCE_MIN,
    filters.maxExperience ?? EXPERIENCE_MAX,
  ]);

  const updateUrl = (
    newParams: Record<string, string | number | undefined>,
  ) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(newParams).forEach(([key, value]) => {
      if (value === undefined || value === "" || value === "all") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });

    // Reset to page 1 when filters change
    if (newParams.page === undefined) {
      params.delete("page");
    }

    router.push(`/jobs?${params.toString()}`, { scroll: false });
  };

  const handleSortChange = (value: string) => {
    updateUrl({ sort: value, page: 1 });
  };

  const handleSearchSubmit = () => {
    updateUrl({ search: searchInput.trim(), page: 1 });
  };

  const handleSearchBlur = () => {
    if (searchInput.trim() !== (filters.search ?? "")) {
      handleSearchSubmit();
    }
  };

  const handleSearchKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSearchSubmit();
    }
  };

  const handleFilterChange = (key: string, value: string) => {
    updateUrl({ [key]: value, page: 1 });
  };

  const handleSalaryChange = (value: number[]) => {
    setSalaryRange(value);
  };

  const handleSalaryCommit = (value: number[]) => {
    const [min, max] = value;
    const isDefault = min === SALARY_MIN && max === SALARY_MAX;
    updateUrl({
      minSalary: isDefault ? undefined : min,
      maxSalary: isDefault ? undefined : max,
      page: 1,
    });
  };

  const handleExperienceChange = (value: number[]) => {
    setExperienceRange(value);
  };

  const handleExperienceCommit = (value: number[]) => {
    const [min, max] = value;
    const isDefault = min === EXPERIENCE_MIN && max === EXPERIENCE_MAX;
    updateUrl({
      minExperience: isDefault ? undefined : min,
      maxExperience: isDefault ? undefined : max,
      page: 1,
    });
  };

  const handlePageChange = (page: number) => {
    updateUrl({ page });
  };

  const formatSalary = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl font-bold mb-4">VectorMatch Jobs</h1>
            <p className="text-muted-foreground text-lg mb-8">
              Find your next remote role at top tech companies
            </p>

            {/* Search Bar */}
            <div className="max-w-2xl mx-auto flex gap-2">
              <Input
                type="text"
                placeholder="Search jobs by title, skills, or keywords..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onBlur={handleSearchBlur}
                onKeyDown={handleSearchKeyDown}
                className="h-12 text-lg"
                aria-label="Search jobs"
              />
              <Button
                size="lg"
                onClick={handleSearchSubmit}
                className="px-6"
                aria-label="Search"
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter or click the search button to apply your search.
            </p>

            {/* Quick Stats */}
            <div className="flex justify-center gap-8 mt-8 text-sm">
              <div className="flex items-center gap-1">
                <span className="font-semibold text-foreground">
                  {stats.totalJobs.toLocaleString()}
                </span>
                <span className="text-muted-foreground">Active Jobs</span>
                <TooltipInfo content="Total number of jobs currently available with a candidate-facing description." />
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-foreground">
                  {stats.newThisWeek.toLocaleString()}
                </span>
                <span className="text-muted-foreground">New This Week</span>
                <TooltipInfo content="Jobs published or detected in the last 7 days." />
              </div>
              <div className="flex items-center gap-1">
                <span className="font-semibold text-foreground">
                  {stats.globalRemote.toLocaleString()}
                </span>
                <span className="text-muted-foreground">Global Remote</span>
                <TooltipInfo content="Jobs open to candidates worldwide." />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Filter Sidebar */}
          <aside className="w-64 flex-shrink-0 hidden lg:block">
            <div className="sticky top-8 space-y-6">
              <div>
                <h3 className="font-semibold mb-4">Filters</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    router.push("/jobs");
                  }}
                  className="w-full justify-start"
                >
                  Clear all filters
                </Button>
              </div>

              <Separator />

              {/* Remote Scope */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-sm font-medium">Remote Scope</Label>
                  <TooltipInfo content="Filter by where the role allows you to work from." />
                </div>
                <Select
                  value={filters.remoteScope ?? "all"}
                  onValueChange={(value) =>
                    handleFilterChange("remoteScope", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMOTE_SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Workplace Type */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-sm font-medium">Workplace Type</Label>
                  <TooltipInfo content="Filter by in-office, hybrid, or fully remote arrangements." />
                </div>
                <Select
                  value={filters.workplaceType ?? "all"}
                  onValueChange={(value) =>
                    handleFilterChange("workplaceType", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKPLACE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Employment Type */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-sm font-medium">Employment Type</Label>
                  <TooltipInfo content="Filter by full-time, contract, or part-time roles." />
                </div>
                <Select
                  value={filters.employmentType ?? "all"}
                  onValueChange={(value) =>
                    handleFilterChange("employmentType", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Salary Range */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-sm font-medium">Salary Range</Label>
                  <TooltipInfo content="Filter by annual gross salary (USD). Only ~2% of listings currently include salary data." />
                </div>
                <div className="px-1">
                  <Slider
                    value={salaryRange}
                    onValueChange={handleSalaryChange}
                    onValueCommit={handleSalaryCommit}
                    min={SALARY_MIN}
                    max={SALARY_MAX}
                    step={SALARY_STEP}
                    className="mb-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{formatSalary(salaryRange[0])}</span>
                    <span>{formatSalary(salaryRange[1])}</span>
                  </div>
                </div>
              </div>

              {/* Experience Range */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-sm font-medium">
                    Experience Range
                  </Label>
                  <TooltipInfo content="Filter by years of professional experience required." />
                </div>
                <div className="px-1">
                  <Slider
                    value={experienceRange}
                    onValueChange={handleExperienceChange}
                    onValueCommit={handleExperienceCommit}
                    min={EXPERIENCE_MIN}
                    max={EXPERIENCE_MAX}
                    step={EXPERIENCE_STEP}
                    className="mb-2"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{experienceRange[0]} yrs</span>
                    <span>{experienceRange[1]} yrs</span>
                  </div>
                </div>
              </div>

              {/* Posted Within */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Label className="text-sm font-medium">Posted Within</Label>
                  <TooltipInfo content="Show only jobs published by the ATS within the selected time window (falls back to when we detected the job if no publish date is available)." />
                </div>
                <Select
                  value={filters.postedWithin?.toString() ?? "all"}
                  onValueChange={(value) =>
                    handleFilterChange("postedWithin", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="1">Last 24 hours</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </aside>

          {/* Job Listings */}
          <div className="flex-1">
            {/* Sort Bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="text-sm text-muted-foreground">
                Showing {totalCount.toLocaleString()} jobs
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <Label className="text-sm">Sort by:</Label>
                  <TooltipInfo content="Choose how job results are ordered. Newest/Oldest use publish date; Relevance falls back to Newest; Company Quality uses company fusion score + tier; Highest Pay uses the max salary (only ~2% of jobs have salary data)." />
                </div>
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {JOB_SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Job Cards */}
            {jobs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">
                    No jobs found matching your criteria.
                  </p>
                  <Button
                    variant="link"
                    onClick={() => router.push("/jobs")}
                    className="mt-4"
                  >
                    Clear filters
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    isAuthenticated={isAuthenticated}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <Button
                        key={pageNum}
                        variant={
                          currentPage === pageNum ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
