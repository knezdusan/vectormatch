// Pipeline Status — job lifecycle + match queue status distributions.
// Server Component that fetches status counts from admin-queries.ts.

import { StatusDistributionBars } from "@/components/admin/StatusDistributionBars";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getJobStatusDistribution,
  getMatchQueueStatusDistribution,
  type StatusDistribution,
} from "@/lib/jobs/admin-queries";

const jobStatusConfig: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "bg-emerald-500" },
  stale: { label: "Stale", color: "bg-amber-500" },
  gone: { label: "Gone", color: "bg-slate-500" },
  rejected: { label: "Rejected", color: "bg-red-500" },
  normalization_failed: {
    label: "Normalization Failed",
    color: "bg-orange-500",
  },
};

const matchQueueStatusConfig: Record<string, { label: string; color: string }> =
  {
    pending: { label: "Pending", color: "bg-amber-500" },
    approved: { label: "Approved", color: "bg-emerald-500" },
    rejected: { label: "Rejected", color: "bg-red-500" },
    error: { label: "Error", color: "bg-orange-500" },
  };

function normalizeDistribution(
  rows: StatusDistribution[],
  config: Record<string, { label: string; color: string }>,
) {
  return rows
    .map((row) => ({
      status: row.status,
      count: row.count,
      label: config[row.status]?.label ?? row.status,
      color: config[row.status]?.color ?? "bg-primary",
    }))
    .sort((a, b) => b.count - a.count);
}

export async function PipelineStatus() {
  let jobStatuses: StatusDistribution[] = [];
  let matchQueueStatuses: StatusDistribution[] = [];
  let error: string | null = null;

  try {
    [jobStatuses, matchQueueStatuses] = await Promise.all([
      getJobStatusDistribution(),
      getMatchQueueStatusDistribution(),
    ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load pipeline status";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Pipeline Status</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const jobData = normalizeDistribution(jobStatuses, jobStatusConfig);
  const matchQueueData = normalizeDistribution(
    matchQueueStatuses,
    matchQueueStatusConfig,
  );
  const jobTotal = jobData.reduce((sum, item) => sum + item.count, 0);
  const matchTotal = matchQueueData.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Job Pipeline</CardTitle>
          <CardDescription>
            Lifecycle distribution across all ingested jobs (
            {jobTotal.toLocaleString()})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusDistributionBars
            data={jobData}
            total={jobTotal}
            emptyMessage="No job pipeline data yet."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Match Queue</CardTitle>
          <CardDescription>
            Gate 3 verdict distribution across all matches (
            {matchTotal.toLocaleString()})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatusDistributionBars
            data={matchQueueData}
            total={matchTotal}
            emptyMessage="No match queue data yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}
