// Public Job Detail Page
// src/app/(public)/jobs/[id]/page.tsx
//
// Authenticated job detail page. Users must be signed in to view the full
// job description. Unauthenticated users are redirected to the sign-up flow,
// which brings them back here after account creation.

import type { Metadata } from "next";
import { Suspense } from "react";
import { JobDetail } from "@/components/jobs/JobDetail";
import { Spinner } from "@/components/ui/spinner";
import { getPublicJobById } from "@/lib/jobs/public-queries";
import { SITE_URL } from "@/lib/site";

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({
  params,
}: JobDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const job = await getPublicJobById(id);

  if (!job) {
    return {
      title: "Job Details | VectorMatch",
      description: "View the full job description and requirements",
    };
  }

  const title = job.companyName
    ? `${job.title} at ${job.companyName} | VectorMatch`
    : `${job.title} | VectorMatch`;
  const description =
    job.shortDescription?.slice(0, 160) ??
    "View the full job description and requirements";
  const url = `${SITE_URL}/jobs/${id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "article",
      url,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function JobDetailPage({ params }: JobDetailPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <Suspense
        fallback={
          <div className="container mx-auto px-4 py-8 max-w-4xl flex justify-center">
            <Spinner className="size-8" />
          </div>
        }
      >
        <JobDetail params={params} />
      </Suspense>
    </div>
  );
}
