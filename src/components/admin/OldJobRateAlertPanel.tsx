// Old Job Rate Alert Panel
// src/components/admin/OldJobRateAlertPanel.tsx
//
// Surfaces sources that are suddenly returning a high proportion of jobs older
// than the injection freshness cap. A spike usually means a slug is returning
// archived/all-time postings and needs investigation.

"use client";

import { AlertTriangle, Info } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { OldJobRateAlert } from "@/lib/jobs/ingestion-analytics";

interface OldJobRateAlertPanelProps {
  alerts: OldJobRateAlert[];
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function HelpTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="size-3.5 text-muted-foreground cursor-help shrink-0" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs leading-relaxed">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function OldJobRateAlertPanel({ alerts }: OldJobRateAlertPanelProps) {
  if (alerts.length === 0) return null;

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-yellow-600 dark:text-yellow-400" />
            <CardTitle>High Old-Job Rate Detected</CardTitle>
          </div>
          <HelpTooltip text="Sources where &gt;30% of fetched jobs were rejected because they are older than the 30-day injection cap. This usually means the ATS slug is returning archived or all-time postings." />
        </div>
        <CardDescription>
          Recent ingestion runs are skipping a large share of stale listings.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {alerts.map((alert) => (
            <li
              key={alert.source}
              className="flex items-center justify-between rounded-lg border bg-background/50 px-3 py-2"
            >
              <div className="flex flex-col">
                <span className="font-medium capitalize">{alert.source}</span>
                <span className="text-xs text-muted-foreground">
                  {alert.oldJobs.toLocaleString()} old out of{" "}
                  {alert.totalJobs.toLocaleString()} fetched across {alert.runs}{" "}
                  run{alert.runs === 1 ? "" : "s"}
                </span>
              </div>
              <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 tabular-nums">
                {formatPercent(alert.rate)}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
