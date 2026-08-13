// Subscription Health List — renders the cached health check results
// src/components/admin/SubscriptionHealthList.tsx
//
// Server Component. Reads from the 5-minute cached getSubscriptionHealth().
// Each service is rendered as a row with a status badge, key presence
// indicator, and the status message.

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { SubscriptionHealthResult } from "@/lib/subscriptions/health";
import { getSubscriptionHealth } from "@/lib/subscriptions/health";
import { cn } from "@/lib/utils";

function StatusBadge({ result }: { result: SubscriptionHealthResult }) {
  const isCritical = result.status === "critical";
  const Icon = isCritical ? XCircle : CheckCircle2;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        isCritical
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      )}
    >
      <Icon className="size-3.5" />
      {isCritical ? "Critical" : "Healthy"}
    </span>
  );
}

function ImpactBadge({ impact }: { impact: "critical" | "medium" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        impact === "critical"
          ? "bg-destructive/5 text-destructive/70"
          : "bg-muted text-muted-foreground",
      )}
    >
      {impact === "critical" ? <AlertTriangle className="size-3" /> : null}
      {impact === "critical" ? "App-halting" : "Feature degradation"}
    </span>
  );
}

export async function SubscriptionHealthList() {
  const results = await getSubscriptionHealth();
  const unhealthyCount = results.filter((r) => r.status === "critical").length;

  return (
    <div className="space-y-3">
      {unhealthyCount > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            {unhealthyCount} service{unhealthyCount > 1 ? "s" : ""} require
            attention
          </p>
        </div>
      )}
      <div className="divide-y divide-border rounded-lg border border-border">
        {results.map((result) => (
          <div
            key={result.service}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{result.label}</span>
                <StatusBadge result={result} />
                <ImpactBadge impact={result.impact} />
              </div>
              <p
                className={cn(
                  "text-xs",
                  result.status === "critical"
                    ? "text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {result.message}
              </p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Key:{" "}
                  {result.keyPresent ? (
                    <code className="rounded bg-muted px-1 py-0.5">
                      {result.keyPrefix}…
                    </code>
                  ) : (
                    <span className="text-destructive">missing</span>
                  )}
                </span>
                <span>
                  Check: {result.pinged ? "API ping" : "env-var only"}
                </span>
                <span>
                  {new Date(result.checkedAt).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
