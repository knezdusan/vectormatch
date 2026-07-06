// Public Jobs Listing Page
// src/app/(public)/jobs/page.tsx
//
// Server Component that renders the public job listings page with
// Suspense boundary for non-blocking data fetching.

import { Suspense } from "react";
import { JobListContent } from "@/components/jobs/JobListContent";

export const metadata = {
  title: "Jobs | VectorMatch",
  description: "Find your next remote role at top tech companies",
};

export default function JobsPage({
  searchParams,
}: {
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
}) {
  return (
    <div className="min-h-screen bg-background">
      <Suspense
        fallback={
          <div className="container mx-auto px-4 py-8">Loading jobs...</div>
        }
      >
        <JobListContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
