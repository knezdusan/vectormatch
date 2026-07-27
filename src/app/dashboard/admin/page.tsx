import { ArrowLeft, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminDashboardTabs } from "@/components/admin/AdminDashboardTabs";
import { AdminOverview } from "@/components/admin/AdminOverview";
import {
  AdminOverviewSkeleton,
  InfrastructureHealthSkeleton,
  IngestionAnalyticsSkeleton,
  MatchingFunnelSkeleton,
  PipelineHealthMonitorSkeleton,
  PipelineStatusSkeleton,
  RejectionPatternAnalysisSkeleton,
} from "@/components/admin/AdminSkeletons";
import { AlertsPanel } from "@/components/admin/AlertsPanel";
import { BulkReprocessButton } from "@/components/admin/BulkReprocessButton";
import { CountryExclusionManager } from "@/components/admin/CountryExclusionManager";
import { InfrastructureHealth } from "@/components/admin/InfrastructureHealth";
import { IngestionAnalytics } from "@/components/admin/IngestionAnalytics";
import { MatchingFunnel } from "@/components/admin/MatchingFunnel";
import { PipelineHealthMonitor } from "@/components/admin/PipelineHealthMonitor";
import { PipelineStatus } from "@/components/admin/PipelineStatus";
import { RecentAlerts } from "@/components/admin/RecentAlerts";
import { RejectionPatternAnalysis } from "@/components/admin/RejectionPatternAnalysis";
import { SchedulerStatusControl } from "@/components/admin/SchedulerStatusControl";
import { TargetStackMetricTile } from "@/components/admin/TargetStackMetricTile";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { getExcludedCountryRecords } from "@/lib/jobs/excluded-countries";

export const metadata: Metadata = {
  title: "Admin Dashboard | VectorMatch",
  description: "Administrative overview and pipeline monitoring",
  robots: { index: false, follow: false },
};

interface AdminPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps = {}) {
  await requireRole("admin", "/dashboard");

  const params = await searchParams;
  const range = typeof params?.range === "string" ? params.range : undefined;
  const tab = typeof params?.tab === "string" ? params.tab : "infrastructure";

  // Fetch excluded countries for the CountryExclusionManager (cached via
  // Cache Components "use cache" + cacheTag("excluded-countries")).
  const excludedCountryRecords = await getExcludedCountryRecords();

  return (
    <main className="flex flex-col gap-4 sm:gap-6 px-4 py-6 sm:px-6 max-w-7xl mx-auto w-full">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Back to Home
      </Link>

      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          System health, matching funnel, and operational controls
        </p>
      </div>

      {/* Quick navigation to Users management */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/dashboard/admin/users">
          <Card className="hover:bg-sidebar-accent/50 transition-colors h-full">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="size-5 text-muted-foreground" />
                <CardTitle>Users</CardTitle>
              </div>
              <CardDescription>
                Manage user accounts, roles, and permissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View, ban, unban, impersonate, and delete user accounts.
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* System overview stat cards */}
      <Suspense fallback={<AdminOverviewSkeleton />}>
        <AdminOverview />
      </Suspense>

      {/* Active alerts (only renders when there are alerts) */}
      <AlertsPanel />

      {/* Tabbed sections */}
      <AdminDashboardTabs
        defaultTab={tab}
        tabs={[
          { value: "infrastructure", label: "Infrastructure" },
          { value: "ingestion", label: "Ingestion" },
          { value: "matching", label: "Matching" },
          { value: "pipeline", label: "Pipeline" },
          { value: "activity", label: "Activity" },
        ]}
      >
        <TabsContent value="infrastructure" className="space-y-4">
          <Suspense fallback={<InfrastructureHealthSkeleton />}>
            <InfrastructureHealth />
          </Suspense>
        </TabsContent>
        <TabsContent value="ingestion" className="space-y-4">
          <Suspense fallback={<IngestionAnalyticsSkeleton />}>
            <IngestionAnalytics range={range} />
          </Suspense>
        </TabsContent>
        <TabsContent value="matching" className="space-y-4">
          <Suspense fallback={<MatchingFunnelSkeleton />}>
            <TargetStackMetricTile />
          </Suspense>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Match Pipeline Controls
              </CardTitle>
              <CardDescription>
                Manually trigger a bulk reprocess to re-evaluate all active
                embedded jobs against all personas. Use after filter or prompt
                changes to retroactively match existing jobs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkReprocessButton />
            </CardContent>
          </Card>
          <Suspense fallback={<MatchingFunnelSkeleton />}>
            <MatchingFunnel range={range} />
          </Suspense>
          <Suspense fallback={<RejectionPatternAnalysisSkeleton />}>
            <RejectionPatternAnalysis range={range} />
          </Suspense>
        </TabsContent>
        <TabsContent value="pipeline" className="space-y-4">
          <SchedulerStatusControl />
          <Suspense fallback={<PipelineHealthMonitorSkeleton />}>
            <PipelineHealthMonitor />
          </Suspense>
          <Suspense fallback={<PipelineStatusSkeleton />}>
            <PipelineStatus />
          </Suspense>
        </TabsContent>
        <TabsContent value="activity" className="space-y-4">
          <RecentAlerts />
        </TabsContent>
      </AdminDashboardTabs>

      {/* Country Exclusions — admin-managed ingestion blocklist */}
      <CountryExclusionManager excludedCountries={excludedCountryRecords} />
    </main>
  );
}
