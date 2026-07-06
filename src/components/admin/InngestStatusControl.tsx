"use client";

import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pause,
  Play,
  RotateCw,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { triggerNormalizationRetryAction } from "@/actions/admin";
import type { InngestControlState } from "@/actions/inngest-control";
import {
  getInngestStatusAction,
  pauseInngestAction,
  restartInngestAction,
  resumeInngestAction,
} from "@/actions/inngest-control";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// ── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({
  label,
  reachable,
}: {
  label: string;
  reachable: boolean;
}) {
  // When Coolify can't tell us the status but the Inngest HTTP endpoint is
  // still responding, show a yellow "Reachable" badge instead of the red
  // "Unknown" badge. The health check is a more reliable signal than a
  // missing or read-only Coolify API configuration.
  const effectiveLabel = label === "Unknown" && reachable ? "Reachable" : label;

  const color =
    effectiveLabel === "Running"
      ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
      : effectiveLabel === "Reachable"
        ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
        : effectiveLabel === "Paused"
          ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
          : effectiveLabel === "Restarting"
            ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
            : "bg-red-500/15 text-red-600 border-red-500/30";

  const icon =
    effectiveLabel === "Running" ? (
      <CheckCircle2 className="size-3.5" />
    ) : effectiveLabel === "Paused" ? (
      <Pause className="size-3.5" />
    ) : effectiveLabel === "Restarting" ? (
      <RotateCw className="size-3.5 animate-spin" />
    ) : (
      <AlertCircle className="size-3.5" />
    );

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${color}`}
    >
      {icon}
      {effectiveLabel}
    </span>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function InngestStatusControl() {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<InngestControlState | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const refreshStatus = useCallback(() => {
    startTransition(async () => {
      const res = await getInngestStatusAction();
      setState(res);
    });
  }, []);

  // Fetch initial status on mount
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(refreshStatus, 30_000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  const status = state?.status;
  const healthCheck = state?.healthCheck;
  const isRunning = status?.isRunning ?? false;
  const isPaused = status?.isPaused ?? false;
  const label = status?.label ?? "Unknown";

  function handlePause() {
    setActionMessage(null);
    startTransition(async () => {
      const res = await pauseInngestAction();
      setState(res);
      setActionMessage(
        res.success
          ? "Inngest server paused. Critical alert created."
          : `Error: ${res.error}`,
      );
    });
  }

  function handleResume() {
    setActionMessage(null);
    startTransition(async () => {
      const res = await resumeInngestAction();
      setState(res);
      setActionMessage(
        res.success
          ? "Inngest server resuming. Alert resolved."
          : `Error: ${res.error}`,
      );
    });
  }

  function handleRestart() {
    setActionMessage(null);
    startTransition(async () => {
      const res = await restartInngestAction();
      setState(res);
      setActionMessage(
        res.success ? "Inngest server restarting..." : `Error: ${res.error}`,
      );
    });
  }

  function handleNormalizationRetry() {
    setActionMessage(null);
    startTransition(async () => {
      const res = await triggerNormalizationRetryAction();
      setActionMessage(
        res.success
          ? res.eventsSent && res.eventsSent > 0
            ? `Normalization retry triggered — ${res.eventsSent} jobs queued. Check Inngest dashboard for progress.`
            : "No unnormalized jobs found — nothing to retry."
          : `Error: ${res.error}`,
      );
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Inngest Server</CardTitle>
            <CardDescription>
              Background job engine status and controls
            </CardDescription>
          </div>
          <StatusBadge
            label={label}
            reachable={healthCheck?.reachable ?? false}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status details */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              Container status
            </span>
            <span className="font-medium">{status?.coolifyStatus ?? "—"}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Health check</span>
            <span className="font-medium">
              {healthCheck
                ? `${healthCheck.reachable ? "Reachable" : "Unreachable"}${healthCheck.statusCode ? ` (${healthCheck.statusCode})` : ""}`
                : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Response time</span>
            <span className="font-medium">
              {healthCheck?.responseTimeMs != null
                ? `${healthCheck.responseTimeMs}ms`
                : "—"}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">Last checked</span>
            <span className="font-medium">
              {status?.checkedAt
                ? new Date(status.checkedAt).toLocaleTimeString()
                : "—"}
            </span>
          </div>
        </div>

        {/* Error display */}
        {(state?.error || status?.error) && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">
            {state?.error ?? status?.error}
          </div>
        )}

        {/* Control buttons */}
        <div className="flex flex-wrap gap-2">
          {isPaused ? (
            <Button
              size="sm"
              variant="default"
              disabled={isPending}
              onClick={handleResume}
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Resume
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || !isRunning}
              onClick={handlePause}
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Pause className="size-3.5" />
              )}
              Pause
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={handleRestart}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
            Restart
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={isPending || !isRunning}
            onClick={handleNormalizationRetry}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Zap className="size-3.5" />
            )}
            Retry Normalization
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isPending}
            onClick={refreshStatus}
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCw className="size-3.5" />
            )}
            Refresh
          </Button>
        </div>

        {/* Action feedback */}
        {actionMessage && (
          <p
            className={`text-xs ${actionMessage.startsWith("Error") ? "text-red-500" : "text-emerald-500"}`}
          >
            {actionMessage}
          </p>
        )}

        {/* Warning when paused */}
        {isPaused && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600">
            <strong>Inngest server is paused.</strong> No background jobs will
            run (job polling, normalization, matching, cleanup). Resume the
            server to restore the pipeline.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
