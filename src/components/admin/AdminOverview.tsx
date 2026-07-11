// Admin Overview — top-level system stat cards for the admin dashboard.
// Server Component that fetches aggregated counts from admin-queries.ts.

import {
  Briefcase,
  Building2,
  CircleCheck,
  Layers,
  Users,
  XCircle,
} from "lucide-react";

import { AdminMetricTooltip } from "@/components/admin/AdminMetricTooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getSystemOverviewStats,
  type SystemOverviewStats,
} from "@/lib/jobs/admin-queries";

interface StatCardProps {
  label: string;
  value: number;
  description: string;
  tooltip: string;
  icon: React.ComponentType<{ className?: string }>;
  secondary?: { label: string; value: number };
}

function StatCard({
  label,
  value,
  description,
  tooltip,
  icon: Icon,
  secondary,
}: StatCardProps) {
  return (
    <Card className="hover:bg-sidebar-accent/40 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardDescription className="text-xs font-medium uppercase tracking-wide">
            {label}
          </CardDescription>
          <div className="flex items-center gap-1.5">
            <AdminMetricTooltip text={tooltip} />
            <Icon className="size-4 text-muted-foreground" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <CardTitle className="text-3xl font-bold tabular-nums">
            {value.toLocaleString()}
          </CardTitle>
          {secondary ? (
            <span className="text-xs text-muted-foreground">
              {secondary.label}: {secondary.value.toLocaleString()}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function formatOnboardingRate(stats: SystemOverviewStats): string {
  if (stats.totalUsers === 0) return "0%";
  return `${((stats.onboardedUsers / stats.totalUsers) * 100).toFixed(1)}%`;
}

export async function AdminOverview() {
  let stats: SystemOverviewStats | null = null;
  let error: string | null = null;

  try {
    stats = await getSystemOverviewStats();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load overview stats";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const safe = stats ?? {
    totalUsers: 0,
    onboardedUsers: 0,
    totalCompanies: 0,
    totalJobs: 0,
    activeJobs: 0,
    totalMatches: 0,
    approvedMatches: 0,
    staleMatches24h: 0,
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-6">
      <StatCard
        label="Users (Total / Onboarded)"
        value={safe.totalUsers}
        secondary={{ label: "Onboarded", value: safe.onboardedUsers }}
        description={`${formatOnboardingRate(safe)} have completed onboarding`}
        tooltip="Total registered accounts. Onboarded users have uploaded a CV and completed the skill-extraction flow."
        icon={Users}
      />
      <StatCard
        label="Companies"
        value={safe.totalCompanies}
        description="Tracked ATS companies in the registry"
        tooltip="ATS companies discovered and tracked across all ingestion sources."
        icon={Building2}
      />
      <StatCard
        label="Total Jobs"
        value={safe.totalJobs}
        description="All jobs ever ingested into the system"
        tooltip="All jobs ever ingested into the corpus, including active, stale, gone, and rejected records."
        icon={Briefcase}
        secondary={{ label: "Active", value: safe.activeJobs }}
      />
      <StatCard
        label="Active Jobs"
        value={safe.activeJobs}
        description="Jobs currently eligible for matching"
        tooltip="Jobs with active status that are eligible to enter the matching pipeline."
        icon={CircleCheck}
      />
      <StatCard
        label="Matches"
        value={safe.approvedMatches}
        description="Total Gate 3 approved matches"
        tooltip="Final approved match_queue rows — matches that passed Gate 3 LLM arbitration and are visible to applicants."
        icon={Layers}
      />
      <StatCard
        label="Closed"
        value={safe.staleMatches24h}
        description="Matches that went stale in the last 24 hours"
        tooltip="Approved matches that became stale or were removed in the last 24 hours."
        icon={XCircle}
      />
    </div>
  );
}
