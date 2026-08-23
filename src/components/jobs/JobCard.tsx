// Job Card Component
// src/components/jobs/JobCard.tsx
//
// Client component that renders a single job listing card with all
// relevant information, tooltips, and actions.

"use client";

import {
  Building2,
  Clock,
  DollarSign,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import Link from "next/link";
import { redirectToJobSignup } from "@/actions/jobs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { normalizeCurrencyCode } from "@/lib/jobs/currency";
import type { PublicJobRow } from "@/lib/jobs/public-queries-types";
import { TooltipInfo } from "./TooltipInfo";

interface JobCardProps {
  job: PublicJobRow;
  isAuthenticated: boolean;
}

export function JobCard({ job, isAuthenticated }: JobCardProps) {
  const formatSalary = () => {
    if (!job.compensationMin && !job.compensationMax) return null;

    const currency = normalizeCurrencyCode(job.compensationCurrency);
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

  const formatTimeAgo = (date: Date | null) => {
    if (!date) return null;

    const now = new Date();
    const diffInMs = now.getTime() - new Date(date).getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    return `${Math.floor(diffInDays / 30)} months ago`;
  };

  const getFreshness = (date: Date | null) => {
    if (!date) return null;

    const diffInDays = Math.floor(
      (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffInDays < 7) {
      return {
        label: `Posted ${formatTimeAgo(date)}`,
        variant: "fresh" as const,
      };
    }
    if (diffInDays <= 30) {
      return {
        label: `Posted ${formatTimeAgo(date)}`,
        variant: "recent" as const,
      };
    }
    return {
      label: `Posted ${formatTimeAgo(date)}`,
      variant: "stale" as const,
    };
  };

  const handleMoreInformation = () => {
    if (isAuthenticated) return;
    redirectToJobSignup(job.id);
  };

  const getRemoteScopeBadge = () => {
    if (job.remoteScope === "global") {
      return (
        <Badge
          variant="default"
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          Global Remote
        </Badge>
      );
    }
    if (job.remoteScope === "country_fenced") {
      return <Badge variant="secondary">Country-Fenced</Badge>;
    }
    if (job.remoteScope === "region_fenced") {
      return <Badge variant="secondary">Region-Fenced</Badge>;
    }
    return null;
  };

  const getWorkplaceBadge = () => {
    if (job.workplaceType === "remote") {
      return <Badge variant="outline">Remote</Badge>;
    }
    if (job.workplaceType === "hybrid") {
      return <Badge variant="outline">Hybrid</Badge>;
    }
    if (job.workplaceType === "on-site") {
      return <Badge variant="outline">On-site</Badge>;
    }
    return null;
  };

  const getEmploymentBadge = () => {
    if (job.employmentType === "full-time") {
      return <Badge variant="outline">Full-time</Badge>;
    }
    if (job.employmentType === "contract") {
      return <Badge variant="outline">Contract</Badge>;
    }
    if (job.employmentType === "part-time") {
      return <Badge variant="outline">Part-time</Badge>;
    }
    return null;
  };

  const getCompanyQualityBadge = () => {
    if (job.companyTier === "active_hot") {
      return (
        <Badge variant="default" className="bg-purple-600 hover:bg-purple-700">
          Active Hot
        </Badge>
      );
    }
    if (job.companyTier === "active") {
      return <Badge variant="secondary">Active</Badge>;
    }
    return null;
  };

  const salary = formatSalary();
  const experience = formatExperience();
  const freshness = getFreshness(job.publishedAt || job.detectedAt);

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-xl mb-2">{job.title}</CardTitle>
            <CardDescription className="flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4" />
              {job.companyName || "Unknown Company"}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 items-end">
            {getCompanyQualityBadge() && (
              <div className="flex items-center gap-1">
                {getCompanyQualityBadge()}
                <TooltipInfo content="Company quality tier based on our internal signals (tier, health, fusion score)." />
              </div>
            )}
            {job.atsSource && (
              <Badge variant="outline" className="text-xs">
                {job.atsSource}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {getRemoteScopeBadge() && (
            <div className="flex items-center gap-1">
              {getRemoteScopeBadge()}
              <TooltipInfo content="Defines where you can work from: Global (anywhere), Country-Fenced (specific country), or Region-Fenced (specific region)." />
            </div>
          )}
          {getWorkplaceBadge() && (
            <div className="flex items-center gap-1">
              {getWorkplaceBadge()}
              <TooltipInfo content="How the team expects you to work: Remote, Hybrid, or On-site." />
            </div>
          )}
          {getEmploymentBadge() && (
            <div className="flex items-center gap-1">
              {getEmploymentBadge()}
              <TooltipInfo content="Type of employment contract: Full-time, Contract, or Part-time." />
            </div>
          )}
        </div>

        {/* Description */}
        {job.shortDescription && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {job.shortDescription}
          </p>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
          {salary && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              <span>{salary}</span>
              <TooltipInfo content="Annual gross compensation range extracted from the job post. Only ~2% of listings currently include this data." />
            </div>
          )}
          {job.locationName && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{job.locationName}</span>
              <TooltipInfo content="Primary location or timezone mentioned in the posting." />
            </div>
          )}
          {experience && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{experience}</span>
              <TooltipInfo content="Years of professional experience required for this role." />
            </div>
          )}
          {freshness && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <Badge
                variant="outline"
                className={
                  freshness.variant === "fresh"
                    ? "border-emerald-500 text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300"
                    : freshness.variant === "recent"
                      ? "border-yellow-500 text-yellow-700 bg-yellow-50 dark:bg-yellow-950 dark:text-yellow-300"
                      : "border-red-500 text-red-700 bg-red-50 dark:bg-red-950 dark:text-red-300"
                }
              >
                {freshness.label}
              </Badge>
              <TooltipInfo content="When this job was first published by the ATS, or when we first detected it if the ATS did not expose a publish date. Green = under 7 days, yellow = 7-30 days, red = over 30 days." />
            </div>
          )}
        </div>

        {/* Skills */}
        {job.extractedTags && job.extractedTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {job.extractedTags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {job.extractedTags.length > 5 && (
              <div className="flex items-center gap-1">
                <Badge variant="secondary" className="text-xs">
                  +{job.extractedTags.length - 5} more
                </Badge>
                <TooltipInfo
                  content={`Additional skills extracted from this job: ${job.extractedTags
                    .slice(5)
                    .join(", ")}.`}
                />
              </div>
            )}
          </div>
        )}

        {/* Department & Team */}
        {(job.department || job.team) && (
          <div className="text-sm text-muted-foreground mb-4">
            {job.department && <span>{job.department}</span>}
            {job.department && job.team && <span> • </span>}
            {job.team && <span>{job.team}</span>}
          </div>
        )}

        {/* Action */}
        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <Button asChild className="w-full sm:w-auto">
              <Link
                href={`/jobs/${job.id}`}
                className="flex items-center gap-2"
              >
                More Information
                <MoreHorizontal className="h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button
              onClick={handleMoreInformation}
              className="w-full sm:w-auto flex items-center gap-2"
            >
              More Information
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          )}
          <TooltipInfo content="View the full job description, requirements, and apply. If you are not signed in, you will be asked to create an account first and then be redirected back to this job." />
        </div>
      </CardContent>
    </Card>
  );
}
