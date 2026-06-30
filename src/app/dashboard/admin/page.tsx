import { ArrowLeft, Users } from "lucide-react";
import Link from "next/link";
import { AlertsPanel } from "@/components/admin/AlertsPanel";
import { InfrastructureHealth } from "@/components/admin/InfrastructureHealth";
import { MatchingFunnel } from "@/components/admin/MatchingFunnel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireRole } from "@/lib/auth";

export default async function AdminPage() {
  await requireRole("admin", "/dashboard");

  return (
    <main className="flex flex-col gap-4 sm:gap-6 px-4 py-6 sm:px-6 max-w-5xl mx-auto w-full">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
      >
        <ArrowLeft className="size-4" />
        Back to Home
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>

      {/* Navigation cards for admin areas */}
      <div className="grid gap-4 sm:grid-cols-2">
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

      {/* Sprint 4 Task 8: Active Alerts (only renders if there are alerts) */}
      <AlertsPanel />

      {/* Sprint 4 Task 5: Infrastructure Health */}
      <InfrastructureHealth />

      {/* Sprint 4 Task 6: Matching Funnel & Quality */}
      <MatchingFunnel />
    </main>
  );
}
