// Alerts Panel — Admin Dashboard (Sprint 4 Task 8)
// src/components/admin/AlertsPanel.tsx
//
// Server Component that renders active alerts at the top of the admin dashboard.
// Critical alerts appear first, then warnings, then info. Includes a bulk
// "Resolve all" action in the header.

import { AlertCircle, Bell } from "lucide-react";

import { AlertResolveButton } from "@/components/admin/AlertResolveButton";
import { ResolveAllAlertsButton } from "@/components/admin/ResolveAllAlertsButton";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type Alert, getActiveAlerts } from "@/lib/jobs/alerting";

function severityBadge(severity: string) {
  switch (severity) {
    case "critical":
      return <Badge variant="destructive">{severity}</Badge>;
    case "warning":
      return (
        <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
          {severity}
        </Badge>
      );
    default:
      return <Badge variant="secondary">{severity}</Badge>;
  }
}

function severityIcon(severity: string) {
  if (severity === "critical") {
    return <AlertCircle className="size-4 text-red-500" />;
  }
  if (severity === "warning") {
    return <AlertCircle className="size-4 text-yellow-500" />;
  }
  return <Bell className="size-4 text-muted-foreground" />;
}

export async function AlertsPanel() {
  let alertsList: Alert[] = [];
  let error: string | null = null;

  try {
    alertsList = await getActiveAlerts();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load alerts";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-destructive" />
            <CardTitle>Alerts</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (alertsList.length === 0) {
    return null; // No alerts — don't render the panel
  }

  return (
    <Card className="border-yellow-500/30">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-yellow-500" />
            <CardTitle>Active Alerts ({alertsList.length})</CardTitle>
          </div>
          <ResolveAllAlertsButton count={alertsList.length} />
        </div>
        <CardDescription>
          Infrastructure and pipeline alerts requiring attention
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {alertsList.map((alert) => (
          <div
            key={alert.id}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <div className="mt-0.5">{severityIcon(alert.severity)}</div>
            <div className="flex-1 space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {severityBadge(alert.severity)}
                <span className="text-xs font-mono text-muted-foreground">
                  {alert.type}
                </span>
                {alert.sourceName && (
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {alert.sourceName}
                  </span>
                )}
              </div>
              <p className="text-sm">{alert.message}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(alert.createdAt).toLocaleString()}
              </p>
            </div>
            <AlertResolveButton alertId={alert.id} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
