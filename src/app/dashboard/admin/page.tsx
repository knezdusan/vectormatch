import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { AdminDashboardTabs } from "@/components/admin/AdminDashboardTabs";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AlertsPanel } from "@/components/admin/AlertsPanel";
import { InfrastructureHealth } from "@/components/admin/InfrastructureHealth";
import { MatchingFunnel } from "@/components/admin/MatchingFunnel";
import { PipelineStatus } from "@/components/admin/PipelineStatus";
import { RecentAlerts } from "@/components/admin/RecentAlerts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";

interface AdminPageProps {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPage({ searchParams }: AdminPageProps = {}) {
  await requireRole("admin", "/dashboard");

  const params = await searchParams;
  const range = typeof params?.range === "string" ? params.range : undefined;
  const tab = typeof params?.tab === "string" ? params.tab : "infrastructure";

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
      <AdminOverview />

      {/* Active alerts (only renders when there are alerts) */}
      <AlertsPanel />

      {/* Tabbed sections */}
      <AdminDashboardTabs
        defaultTab={tab}
        tabs={[
          { value: "infrastructure", label: "Infrastructure" },
          { value: "matching", label: "Matching" },
          { value: "pipeline", label: "Pipeline" },
          { value: "activity", label: "Activity" },
        ]}
      >
        <TabsContent value="infrastructure" className="space-y-4">
          <InfrastructureHealth />
        </TabsContent>
        <TabsContent value="matching" className="space-y-4">
          <MatchingFunnel range={range} />
        </TabsContent>
        <TabsContent value="pipeline" className="space-y-4">
          <PipelineStatus />
        </TabsContent>
        <TabsContent value="activity" className="space-y-4">
          <RecentAlerts />
        </TabsContent>
      </AdminDashboardTabs>
    </main>
  );
}
