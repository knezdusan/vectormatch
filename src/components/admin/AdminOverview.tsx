// Admin Overview — top-level system stat cards for the admin dashboard.
// Server Component that fetches aggregated counts from admin-queries.ts.

import {
  Briefcase,
  Building2,
  CircleCheck,
  Layers,
  UserCheck,
  Users,
} from "lucide-react";

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
  icon: React.ComponentType<{ className?: string }>;
  secondary?: { label: string; value: number };
}

function StatCard({
  label,
  value,
  description,
  icon: Icon,
  secondary,
}: StatCardProps) {
  return (
    <Card className="hover:bg-sidebar-accent/40 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardDescription className="text-xs font-medium uppercase tracking-wide">
            {label}
          </CardDescription>
          <Icon className="size-4 text-muted-foreground" />
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
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-6">
      <StatCard
        label="Total Users"
        value={safe.totalUsers}
        description={`${formatOnboardingRate(safe)} have completed onboarding`}
        icon={Users}
        secondary={{ label: "Onboarded", value: safe.onboardedUsers }}
      />
      <StatCard
        label="Companies"
        value={safe.totalCompanies}
        description="Tracked ATS companies in the registry"
        icon={Building2}
      />
      <StatCard
        label="Total Jobs"
        value={safe.totalJobs}
        description="All jobs ever ingested into the system"
        icon={Briefcase}
        secondary={{ label: "Active", value: safe.activeJobs }}
      />
      <StatCard
        label="Active Jobs"
        value={safe.activeJobs}
        description="Jobs currently eligible for matching"
        icon={CircleCheck}
      />
      <StatCard
        label="Matches"
        value={safe.totalMatches}
        description="Total job-to-persona queue rows"
        icon={Layers}
      />
      <StatCard
        label="Onboarded Users"
        value={safe.onboardedUsers}
        description={`${formatOnboardingRate(safe)} of all users completed onboarding`}
        icon={UserCheck}
      />
    </div>
  );
}
