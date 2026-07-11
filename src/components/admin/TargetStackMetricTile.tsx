// Target Stack Metric Tile — the North Star metric (v4 lock §1-D.11).
// Server Component that fetches the global-remote target-stack metric.
//
// Leading: active global-remote jobs matching the target stack (baseline ~299).
// Lagging: approved matches in the last 7 days (baseline 0).
//
// Every subsequent pipeline change should report its delta on the leading metric.

import { Globe, Target } from "lucide-react";

import { AdminMetricTooltip } from "@/components/admin/AdminMetricTooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getGlobalRemoteTargetStackMetric } from "@/lib/jobs/admin-queries";

export async function TargetStackMetricTile() {
  let metric: Awaited<
    ReturnType<typeof getGlobalRemoteTargetStackMetric>
  > | null = null;
  let error: string | null = null;

  try {
    metric = await getGlobalRemoteTargetStackMetric();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load metric";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base">Target Stack Metric</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const safe = metric ?? {
    totalGlobalJobs: 0,
    globalJobsWithTargetStackTags: 0,
    globalJobsWithFrontendTitle: 0,
    addressablePool: 0,
    approvedMatches7d: 0,
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              Global-Remote Target Stack
            </CardTitle>
            <CardDescription>
              The North Star — addressable job pool for the target persona
            </CardDescription>
          </div>
          <Target className="size-5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Globe className="size-3" />
              Global Jobs
              <AdminMetricTooltip text="Active jobs marked as globally remote (remote_scope = global)." />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {safe.totalGlobalJobs.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Active, remote_scope=global
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              With Target Tags
              <AdminMetricTooltip text="Global-remote jobs tagged with the target stack (react, typescript, nextjs, nodejs, graphql, tailwindcss, frontend)." />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {safe.globalJobsWithTargetStackTags.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              react, ts, nextjs, node, graphql...
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Addressable Pool
              <AdminMetricTooltip text="Global-remote jobs that either carry target-stack tags or have a frontend-leaning title. This is the leading North Star indicator." />
            </div>
            <p className="text-2xl font-bold tabular-nums text-primary">
              {safe.addressablePool.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">
              Target tags OR frontend title
            </p>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              Approved (7d)
              <AdminMetricTooltip text="Approved matches in the last 7 days. This is the lagging indicator tied to actual applicant value." />
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {safe.approvedMatches7d.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">Lagging indicator</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
