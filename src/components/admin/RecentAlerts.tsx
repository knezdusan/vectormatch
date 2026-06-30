// Recent Alerts History — shows resolved + active alerts from the last 7 days.
// Server Component that reads from the alerting module.

import { AlertCircle, Bell, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type Alert, getRecentAlerts } from "@/lib/jobs/alerting";

function severityBadge(severity: string) {
  if (severity === "critical") {
    return <Badge variant="destructive">{severity}</Badge>;
  }
  if (severity === "warning") {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
        {severity}
      </Badge>
    );
  }
  return <Badge variant="secondary">{severity}</Badge>;
}

function statusIcon(status: string) {
  if (status === "active") {
    return <AlertCircle className="size-4 text-red-500" />;
  }
  return <CheckCircle2 className="size-4 text-emerald-500" />;
}

export async function RecentAlerts() {
  let alertsList: Alert[] = [];
  let error: string | null = null;

  try {
    alertsList = await getRecentAlerts(7);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load recent alerts";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (alertsList.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bell className="size-5 text-muted-foreground" />
            <CardTitle>Recent Alerts</CardTitle>
          </div>
          <CardDescription>No alerts in the last 7 days.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-muted-foreground" />
          <CardTitle>Recent Alerts</CardTitle>
        </div>
        <CardDescription>
          Active and resolved alerts from the last 7 days
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {alertsList.map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <div className="mt-0.5">{statusIcon(alert.status)}</div>
              <div className="flex-1 space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {severityBadge(alert.severity)}
                  <span className="text-xs font-mono text-muted-foreground">
                    {alert.type}
                  </span>
                  {alert.sourceName ? (
                    <span className="text-xs font-mono text-muted-foreground truncate">
                      {alert.sourceName}
                    </span>
                  ) : null}
                  <Badge
                    variant={
                      alert.status === "active" ? "destructive" : "outline"
                    }
                    className="text-xs"
                  >
                    {alert.status}
                  </Badge>
                </div>
                <p className="text-sm">{alert.message}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(alert.createdAt).toLocaleString()}
                  {alert.resolvedAt
                    ? ` • resolved ${new Date(alert.resolvedAt).toLocaleString()}`
                    : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
