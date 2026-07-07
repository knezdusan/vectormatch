// Public Job Detail Page
// src/app/(public)/jobs/[id]/page.tsx
//
// Authenticated job detail page. Users must be signed in to view the full
// job description. Unauthenticated users are redirected to the sign-up flow,
// which brings them back here after account creation.

import { Suspense } from "react";
import { JobDetail } from "@/components/jobs/JobDetail";
import { Spinner } from "@/components/ui/spinner";

export const metadata = {
  title: "Job Details | VectorMatch",
  description: "View the full job description and requirements",
};

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
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
