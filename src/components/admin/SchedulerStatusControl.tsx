"use client";

import { Activity, AlertCircle, CheckCircle2, Loader2, Zap } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { triggerNormalizationRetryAction } from "@/actions/admin";
import type { SchedulerControlState } from "@/actions/scheduler-control";
import { getSchedulerStatusAction } from "@/actions/scheduler-control";
import { AdminMetricTooltip } from "@/components/admin/AdminMetricTooltip";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ running }: { running: boolean }) {
  const color = running
    ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    : "bg-red-500/15 text-red-600 border-red-500/30";
  const label = running ? "Running" : "Stopped";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${color}`}
    >
      {running ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
      {label}
    </span>
  );
}

// ── Metric Card ──────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  tooltip,
  accent,
}: {
  label: string;
  value: number | string;
  tooltip?: string;
  accent?: "default" | "warning" | "danger";
}) {
  const valueColor =
    accent === "danger"
      ? "text-red-600"
      : accent === "warning"
        ? "text-amber-600"
        : "text-foreground";
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {tooltip && <AdminMetricTooltip text={tooltip} />}
      </div>
      <div className={`text-2xl font-semibold tabular-nums ${valueColor}`}>
        {value}
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SchedulerStatusControl() {
  const [state, setState] = useState<SchedulerControlState | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getSchedulerStatusAction();
      setState(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Refresh every 30 seconds
    const interval = setInterval(fetchStatus, 30_000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleNormalizationRetry = async () => {
    startTransition(true);
    try {
      await triggerNormalizationRetryAction();
    } finally {
      startTransition(false);
    }
  };

  const status = state?.status;
  const running = status?.running ?? false;
  const queueCounts = status?.queueCounts;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              pg-boss Scheduler
            </CardTitle>
            <CardDescription>
              In-process Postgres-backed job queue (replaces Inngest)
            </CardDescription>
          </div>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <StatusBadge running={running} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {state?.error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600">
            Error: {state.error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <MetricCard
            label="Schedules"
            value={status?.activeSchedules ?? 0}
            tooltip="Number of cron schedules registered with pg-boss"
          />
          <MetricCard
            label="Event Handlers"
            value={status?.registeredEvents ?? 0}
            tooltip="Number of event handlers registered with pg-boss"
          />
          <MetricCard
            label="Active Jobs"
            value={queueCounts?.active ?? 0}
            tooltip="Jobs currently being processed"
            accent={
              (queueCounts?.active ?? 0) > 100 ? "warning" : "default"
            }
          />
          <MetricCard
            label="Failed Jobs"
            value={queueCounts?.failed ?? 0}
            tooltip="Jobs that have failed and are still retained"
            accent={
              (queueCounts?.failed ?? 0) > 50 ? "danger" : "default"
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <MetricCard
            label="Queued"
            value={queueCounts?.created ?? 0}
            tooltip="Jobs waiting to be processed"
          />
          <MetricCard
            label="Completed (approx)"
            value={queueCounts?.completed ?? 0}
            tooltip="Approximate completed jobs (totalCount minus other states)"
          />
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Activity className="h-3 w-3" />
              Status
            </div>
            <div className="text-sm font-medium">
              {running ? "Healthy" : "Not running"}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            onClick={handleNormalizationRetry}
            disabled={isPending}
            variant="outline"
            size="sm"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Activity className="mr-2 h-4 w-4" />
            )}
            Trigger Normalization Retry
          </Button>
          <Button
            onClick={fetchStatus}
            disabled={loading}
            variant="ghost"
            size="sm"
          >
            <Loader2
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : "hidden"}`}
            />
            Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
