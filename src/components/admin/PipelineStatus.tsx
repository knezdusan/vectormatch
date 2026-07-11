// Pipeline Status — job lifecycle + match queue status distributions.
// Server Component that fetches status counts from admin-queries.ts.

import { AdminMetricTooltip } from "@/components/admin/AdminMetricTooltip";
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

const jobStatusConfig: Record<
  string,
  { label: string; color: string; tooltip: string }
> = {
  active: {
    label: "Active",
    color: "bg-emerald-500",
    tooltip: "Jobs currently eligible for the matching pipeline.",
  },
  stale: {
    label: "Stale",
    color: "bg-amber-500",
    tooltip:
      "Jobs no longer seen by the poller for the configured stale threshold period.",
  },
  gone: {
    label: "Gone",
    color: "bg-slate-500",
    tooltip: "Jobs confirmed removed from the ATS source.",
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-500",
    tooltip: "Jobs rejected during Gate 0 normalization or quality checks.",
  },
  normalization_failed: {
    label: "Normalization Failed",
    color: "bg-orange-500",
    tooltip: "Jobs that failed normalization and may be retried.",
  },
};

const matchQueueStatusConfig: Record<
  string,
  { label: string; color: string; tooltip: string }
> = {
  pending: {
    label: "Pending",
    color: "bg-amber-500",
    tooltip: "Matches awaiting Gate 3 LLM evaluation.",
  },
  approved: {
    label: "Approved",
    color: "bg-emerald-500",
    tooltip: "Matches approved by the LLM and visible to applicants.",
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-500",
    tooltip: "Matches rejected by the LLM because of explicit blockers.",
  },
  error: {
    label: "Error",
    color: "bg-orange-500",
    tooltip: "Matches that encountered an error during evaluation.",
  },
};

function normalizeDistribution(
  rows: StatusDistribution[],
  config: Record<string, { label: string; color: string; tooltip: string }>,
) {
  return rows
    .map((row) => ({
      status: row.status,
      count: row.count,
      label: config[row.status]?.label ?? row.status,
      color: config[row.status]?.color ?? "bg-primary",
      tooltip: config[row.status]?.tooltip,
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
          <div className="flex items-center gap-2">
            <CardTitle>Job Pipeline</CardTitle>
            <AdminMetricTooltip text="Current lifecycle distribution of all ingested jobs. Active jobs are eligible for matching; stale/gone/rejected/failed jobs have dropped out of the pipeline." />
          </div>
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
          <div className="flex items-center gap-2">
            <CardTitle>Match Queue</CardTitle>
            <AdminMetricTooltip text="Current Gate 3 verdict distribution across all match queue rows. Pending rows still need LLM arbitration; approved rows are visible to applicants." />
          </div>
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
