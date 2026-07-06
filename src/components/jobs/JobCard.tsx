// Job Card Component
// src/components/jobs/JobCard.tsx
//
// Client component that renders a single job listing card with all
// relevant information and actions.

"use client";

import {
  Building2,
  Clock,
  DollarSign,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { PublicJobRow } from "@/lib/jobs/public-queries";

interface JobCardProps {
  job: PublicJobRow;
}

export function JobCard({ job }: JobCardProps) {
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
  const timeAgo = formatTimeAgo(job.publishedAt || job.detectedAt);

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
            {getCompanyQualityBadge()}
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
        <div className="flex flex-wrap gap-2 mb-4">
          {getRemoteScopeBadge()}
          {getWorkplaceBadge()}
          {getEmploymentBadge()}
        </div>

        {/* Description */}
        {(job.shortDescription || job.normalizedText) && (
          <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
            {job.shortDescription ||
              (job.normalizedText && job.normalizedText.length > 200
                ? `${job.normalizedText.substring(0, 200)}...`
                : job.normalizedText)}
          </p>
        )}

        {/* Metadata */}
        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
          {salary && (
            <div className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              <span>{salary}</span>
            </div>
          )}
          {job.locationName && (
            <div className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              <span>{job.locationName}</span>
            </div>
          )}
          {experience && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>{experience}</span>
            </div>
          )}
          {timeAgo && (
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              <span>Posted {timeAgo}</span>
            </div>
          )}
        </div>

        {/* Skills */}
        {job.extractedTags && job.extractedTags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {job.extractedTags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {job.extractedTags.length > 5 && (
              <Badge variant="secondary" className="text-xs">
                +{job.extractedTags.length - 5} more
              </Badge>
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
        {job.applyUrl && (
          <Button asChild className="w-full sm:w-auto">
            <a
              href={job.applyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              View Job
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
