// Job List Component
// src/components/jobs/JobList.tsx
//
// Client component that renders the job listing page with filters,
// sorting, and pagination.

"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
}

export function JobList({
  jobs,
  totalCount,
  currentPage,
  totalPages,
  sortBy,
  filters,
  stats,
}: JobListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  const handleSearchChange = (value: string) => {
    updateUrl({ search: value, page: 1 });
  };

  const handleFilterChange = (key: string, value: string) => {
    updateUrl({ [key]: value, page: 1 });
  };

  const handlePageChange = (page: number) => {
    updateUrl({ page });
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
            <div className="max-w-2xl mx-auto">
              <Input
                type="text"
                placeholder="Search jobs by title, skills, or keywords..."
                value={filters.search ?? ""}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="h-12 text-lg"
              />
            </div>

            {/* Quick Stats */}
            <div className="flex justify-center gap-8 mt-8 text-sm">
              <div>
                <span className="font-semibold text-foreground">
                  {stats.totalJobs.toLocaleString()}
                </span>
                <span className="text-muted-foreground ml-1">Active Jobs</span>
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  {stats.newThisWeek.toLocaleString()}
                </span>
                <span className="text-muted-foreground ml-1">
                  New This Week
                </span>
              </div>
              <div>
                <span className="font-semibold text-foreground">
                  {stats.globalRemote.toLocaleString()}
                </span>
                <span className="text-muted-foreground ml-1">
                  Global Remote
                </span>
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
                <Label className="text-sm font-medium mb-2 block">
                  Remote Scope
                </Label>
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
                <Label className="text-sm font-medium mb-2 block">
                  Workplace Type
                </Label>
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
                <Label className="text-sm font-medium mb-2 block">
                  Employment Type
                </Label>
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
                <Label className="text-sm font-medium mb-2 block">
                  Salary Range
                </Label>
                <div className="space-y-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.minSalary ?? ""}
                    onChange={(e) =>
                      handleFilterChange("minSalary", e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.maxSalary ?? ""}
                    onChange={(e) =>
                      handleFilterChange("maxSalary", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Experience Level */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Experience (Years)
                </Label>
                <div className="space-y-2">
                  <Input
                    type="number"
                    placeholder="Min"
                    value={filters.minExperience ?? ""}
                    onChange={(e) =>
                      handleFilterChange("minExperience", e.target.value)
                    }
                  />
                  <Input
                    type="number"
                    placeholder="Max"
                    value={filters.maxExperience ?? ""}
                    onChange={(e) =>
                      handleFilterChange("maxExperience", e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Posted Within */}
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  Posted Within
                </Label>
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
                <Label className="text-sm">Sort by:</Label>
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
                  <JobCard key={job.id} job={job} />
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
