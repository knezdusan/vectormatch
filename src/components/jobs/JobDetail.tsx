// Job Detail Component
// src/components/jobs/JobDetail.tsx
//
// Server component that fetches a single job, enforces the auth wall, and
// renders the public job detail in the same layout as the dashboard match page.

import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAuthSession } from "@/lib/auth";
import { ATS_ENDPOINTS } from "@/lib/jobs/ats-endpoints";
import { normalizeCurrencyCode } from "@/lib/jobs/currency";
import { formatDescriptionHtml } from "@/lib/jobs/description-formatter";
import { extractJobUrl } from "@/lib/jobs/job-normalizer";
import { getPublicJobById } from "@/lib/jobs/public-queries";

interface JobDetailProps {
  params: Promise<{ id: string }>;
}

function formatSalary(
  compensationMin: string | number | null,
  compensationMax: string | number | null,
  currency: string | null,
): string | null {
  if (!compensationMin && !compensationMax) return null;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: normalizeCurrencyCode(currency),
    maximumFractionDigits: 0,
  });

  if (compensationMin && compensationMax) {
    return `${formatter.format(Number(compensationMin))} - ${formatter.format(Number(compensationMax))}`;
  }
  if (compensationMin) {
    return `${formatter.format(Number(compensationMin))}+`;
  }
  if (compensationMax) {
    return `Up to ${formatter.format(Number(compensationMax))}`;
  }
  return null;
}

function formatExperience(
  experienceMinYears: number | null,
  experienceMaxYears: number | null,
): string | null {
  if (!experienceMinYears && !experienceMaxYears) return null;

  if (experienceMinYears && experienceMaxYears) {
    return `${experienceMinYears}-${experienceMaxYears} years`;
  }
  if (experienceMinYears) {
    return `${experienceMinYears}+ years`;
  }
  if (experienceMaxYears) {
    return `Up to ${experienceMaxYears} years`;
  }
  return null;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getRemoteScopeBadge(remoteScope: string | null) {
  if (remoteScope === "global") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-700">
        Global Remote
      </Badge>
    );
  }
  if (remoteScope === "country_fenced") {
    return <Badge variant="secondary">Country-Fenced</Badge>;
  }
  if (remoteScope === "region_fenced") {
    return <Badge variant="secondary">Region-Fenced</Badge>;
  }
  return null;
}

function resolveExternalUrl(
  url: string | null | undefined,
  base: string | null | undefined,
): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("http://") && trimmed.indexOf("http://", 7) !== -1) {
    return trimmed.slice(trimmed.indexOf("http://", 7));
  }
  if (trimmed.startsWith("https://") && trimmed.indexOf("https://", 8) !== -1) {
    return trimmed.slice(trimmed.indexOf("https://", 8));
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      return new URL(trimmed).href;
    } catch {
      return null;
    }
  }

  if (!base) return null;
  try {
    return new URL(trimmed, base).href;
  } catch {
    return null;
  }
}

export async function JobDetail({ params }: JobDetailProps) {
  const { id } = await params;
  const session = await getAuthSession();

  // Auth wall: unauthenticated users are sent to sign up, with the job ID
  // in the URL so they land back here after creating an account.
  if (!session) {
    redirect(`/auth?tab=signup&jobId=${id}`);
  }

  const job = await getPublicJobById(id);

  if (!job) {
    notFound();
  }

  // Prefer the persisted job-specific posting URL (set during normalization
  // before G7 nullifies rawJson). Fall back to the company board or the
  // apply URL for legacy jobs normalized before the jobUrl column existed.
  const hostedBoardUrl = ATS_ENDPOINTS[
    job.atsSource as keyof typeof ATS_ENDPOINTS
  ]?.hostedBoard(job.atsSlug);
  const rawJobUrl =
    job.jobUrl ??
    extractJobUrl(job.atsSource, job.rawJson) ??
    job.applyUrl ??
    hostedBoardUrl;
  const jobUrl = resolveExternalUrl(rawJobUrl, hostedBoardUrl) ?? rawJobUrl;

  const resolvedApplyUrl = job.applyUrl
    ? (resolveExternalUrl(job.applyUrl, jobUrl) ?? jobUrl)
    : null;

  // Build the best candidate-facing HTML we have. New jobs store
  // descriptionHtml. Legacy jobs may still carry rawJson (pre-G7) or only
  // normalizedText; we derive HTML from whichever source is available.
  const displayDescriptionHtml =
    job.descriptionHtml ??
    formatDescriptionHtml({
      rawJson: job.rawJson,
      normalizedText: job.normalizedText,
      atsSource: job.atsSource,
    });

  const salary = formatSalary(
    job.compensationMin,
    job.compensationMax,
    job.compensationCurrency,
  );
  const experience = formatExperience(
    job.experienceMinYears,
    job.experienceMaxYears,
  );
  const remoteScopeBadge = getRemoteScopeBadge(job.remoteScope);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex flex-col gap-6">
          {/* Back navigation */}
          <Link href="/jobs">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="size-4" />
              Back to jobs
            </Button>
          </Link>

          {/* Header */}
          <div className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold text-foreground">
                  {job.title}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {job.companyName || "Unknown Company"}
                  {job.locationName ? ` · ${job.locationName}` : ""}
                  {job.atsSource ? ` · ${job.atsSource}` : ""}
                </p>
              </div>
              {remoteScopeBadge && (
                <Badge variant="outline" className="shrink-0">
                  {remoteScopeBadge}
                </Badge>
              )}
            </div>

            <div className="flex items-center justify-between gap-4">
              {jobUrl ? (
                <a
                  href={jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit"
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 cursor-pointer"
                  >
                    <ExternalLink className="size-4" />
                    View on {job.atsSource}
                  </Button>
                </a>
              ) : (
                <span />
              )}
              {resolvedApplyUrl && (
                <Button size="sm" className="gap-1.5" asChild>
                  <a
                    href={resolvedApplyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Apply on company site
                    <ExternalLink className="size-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          {/* Role metadata */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              Role Details
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {salary && (
                <div>
                  <span className="text-xs text-muted-foreground">Salary</span>
                  <p className="text-sm text-foreground font-medium">
                    {salary}
                  </p>
                </div>
              )}
              {experience && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Experience
                  </span>
                  <p className="text-sm text-foreground font-medium">
                    {experience}
                  </p>
                </div>
              )}
              {job.workplaceType && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Workplace
                  </span>
                  <p className="text-sm text-foreground font-medium">
                    {job.workplaceType}
                  </p>
                </div>
              )}
              {job.employmentType && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Employment
                  </span>
                  <p className="text-sm text-foreground font-medium">
                    {job.employmentType}
                  </p>
                </div>
              )}
              {job.department && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Department
                  </span>
                  <p className="text-sm text-foreground font-medium">
                    {job.department}
                  </p>
                </div>
              )}
              {job.team && (
                <div>
                  <span className="text-xs text-muted-foreground">Team</span>
                  <p className="text-sm text-foreground font-medium">
                    {job.team}
                  </p>
                </div>
              )}
              <div>
                <span className="text-xs text-muted-foreground">Published</span>
                <p className="text-sm text-foreground font-medium">
                  {formatDate(job.publishedAt)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Detected</span>
                <p className="text-sm text-foreground font-medium">
                  {formatDate(job.detectedAt)}
                </p>
              </div>
              {job.companyTier && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Company tier
                  </span>
                  <p className="text-sm text-foreground font-medium">
                    {job.companyTier}
                  </p>
                </div>
              )}
              {job.fusionScore !== null && (
                <div>
                  <span className="text-xs text-muted-foreground">
                    Fusion score
                  </span>
                  <p className="text-sm text-foreground font-medium">
                    {job.fusionScore}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Job description */}
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              About this role
            </h2>
            {displayDescriptionHtml ? (
              <div
                className="prose prose-sm dark:prose-invert max-w-none"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized HTML from ATS job descriptions; scripts, event handlers, and non-semantic tags are stripped in sanitizeJobDescription.
                dangerouslySetInnerHTML={{ __html: displayDescriptionHtml }}
              />
            ) : job.shortDescription ? (
              <p className="text-sm text-muted-foreground">
                {job.shortDescription}
              </p>
            ) : null}
          </Card>

          {/* Skills */}
          {job.extractedTags && job.extractedTags.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-3 text-sm font-medium text-muted-foreground">
                Skills
              </h2>
              <div className="flex flex-wrap gap-2">
                {job.extractedTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
