// Job Detail Component
// src/components/jobs/JobDetail.tsx
//
// Server component that fetches a single job and enforces the auth wall.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getAuthSession } from "@/lib/auth";
import { getPublicJobById } from "@/lib/jobs/public-queries";

interface JobDetailProps {
  params: Promise<{ id: string }>;
}

export async function JobDetail({ params }: JobDetailProps) {
  const { id } = await params;
  const session = await getAuthSession();

  // Auth wall: unauthenticated users are sent to sign up, with the job ID
  // stored in a cookie so they land back here after creating an account.
  if (!session) {
    redirect(`/auth?tab=signup&jobId=${id}`);
  }

  const job = await getPublicJobById(id);

  if (!job) {
    notFound();
  }

  const formatSalary = () => {
    if (!job.compensationMin && !job.compensationMax) return null;

    const currency = job.compensationCurrency || "USD";
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      maximumFractionDigits: 0,
    });

    if (job.compensationMin && job.compensationMax) {
      return `${formatter.format(Number(job.compensationMin))} - ${formatter.format(Number(job.compensationMax))}`;
    }
    if (job.compensationMin) {
      return `${formatter.format(Number(job.compensationMin))}+`;
    }
    if (job.compensationMax) {
      return `Up to ${formatter.format(Number(job.compensationMax))}`;
    }
    return null;
  };

  const formatExperience = () => {
    if (!job.experienceMinYears && !job.experienceMaxYears) return null;

    if (job.experienceMinYears && job.experienceMaxYears) {
      return `${job.experienceMinYears}-${job.experienceMaxYears} years`;
    }
    if (job.experienceMinYears) {
      return `${job.experienceMinYears}+ years`;
    }
    if (job.experienceMaxYears) {
      return `Up to ${job.experienceMaxYears} years`;
    }
    return null;
  };

  const salary = formatSalary();
  const experience = formatExperience();

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-6">
        <Button variant="ghost" asChild className="px-0">
          <Link href="/jobs">← Back to jobs</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-3xl mb-2">{job.title}</CardTitle>
              <CardDescription className="text-lg">
                {job.companyName || "Unknown Company"}
                {job.locationName && ` • ${job.locationName}`}
              </CardDescription>
            </div>
            {job.atsSource && (
              <Badge variant="outline" className="text-xs">
                {job.atsSource}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Badges */}
          <div className="flex flex-wrap gap-2">
            {job.remoteScope === "global" && (
              <Badge className="bg-emerald-600 hover:bg-emerald-700">
                Global Remote
              </Badge>
            )}
            {job.remoteScope === "country_fenced" && (
              <Badge variant="secondary">Country-Fenced</Badge>
            )}
            {job.remoteScope === "region_fenced" && (
              <Badge variant="secondary">Region-Fenced</Badge>
            )}
            {job.workplaceType && (
              <Badge variant="outline">{job.workplaceType}</Badge>
            )}
            {job.employmentType && (
              <Badge variant="outline">{job.employmentType}</Badge>
            )}
          </div>

          <Separator />

          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {salary && (
              <div>
                <span className="text-muted-foreground">Salary:</span>{" "}
                <span className="font-medium">{salary}</span>
              </div>
            )}
            {experience && (
              <div>
                <span className="text-muted-foreground">Experience:</span>{" "}
                <span className="font-medium">{experience}</span>
              </div>
            )}
            {job.department && (
              <div>
                <span className="text-muted-foreground">Department:</span>{" "}
                <span className="font-medium">{job.department}</span>
              </div>
            )}
            {job.team && (
              <div>
                <span className="text-muted-foreground">Team:</span>{" "}
                <span className="font-medium">{job.team}</span>
              </div>
            )}
            {job.publishedAt && (
              <div>
                <span className="text-muted-foreground">Published:</span>{" "}
                <span className="font-medium">
                  {new Date(job.publishedAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>

          <Separator />

          {/* Description */}
          <div>
            <h3 className="font-semibold mb-2">About this role</h3>
            <p className="text-muted-foreground whitespace-pre-line">
              {job.shortDescription}
            </p>
          </div>

          {/* Skills */}
          {job.extractedTags && job.extractedTags.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {job.extractedTags.map((tag: string) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Apply Action */}
          {job.applyUrl && (
            <div className="pt-4">
              <Button asChild size="lg">
                <a
                  href={job.applyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apply on company site
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
