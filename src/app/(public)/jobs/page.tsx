// Public Jobs Listing Page
// src/app/(public)/jobs/page.tsx
//
// Server Component that renders the public job listings page with
// Suspense boundary for non-blocking data fetching.

import type { Metadata } from "next";
import { Suspense } from "react";
import { JobListContent } from "@/components/jobs/JobListContent";
import { JsonLd } from "@/components/seo/JsonLd";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Jobs | VectorMatch",
  description: "Find your next remote role at top tech companies",
  alternates: {
    canonical: `${SITE_URL}/jobs`,
  },
  openGraph: {
    title: "Jobs | VectorMatch",
    description: "Find your next remote role at top tech companies",
    type: "website",
    url: `${SITE_URL}/jobs`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Jobs | VectorMatch",
    description: "Find your next remote role at top tech companies",
  },
};

export default function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    search?: string;
    /** Unified workplace filter. */
    workplace?: string;
    /** @deprecated Use workplace instead. */
    remoteScope?: string;
    /** @deprecated Use workplace instead. */
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
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "VectorMatch Job Listings",
          url: `${SITE_URL}/jobs`,
          description: "Remote tech jobs matched by AI",
        }}
      />
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
