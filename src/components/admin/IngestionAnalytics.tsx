// Ingestion Analytics — Admin Dashboard Ingestion tab
// src/components/admin/IngestionAnalytics.tsx
//
// Server Component that renders full ingestion performance analytics:
//   - Executive summary cards with tooltips
//   - Daily ingestion trend chart
//   - Per-source performance table with circuit-breaker status
//   - Recent run history
//   - Top non-success errors

import { AlertTriangle, Info, Layers } from "lucide-react";

import { CsvExportButton } from "@/components/admin/CsvExportButton";
import { IngestionTrendsChart } from "@/components/admin/IngestionTrendsChart";
import { JobStalenessDistribution } from "@/components/admin/JobStalenessDistribution";
import {
  type TimeRange,
  TimeRangeSelector,
} from "@/components/admin/TimeRangeSelector";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  getIngestionSummary,
  getIngestionTrends,
  getRecentIngestionRuns,
  getSourcePerformance,
  getTopIngestionErrors,
  type IngestionSummary,
  type IngestionTrendPoint,
  type RecentRunRow,
  type SourcePerformanceRow,
  type TopErrorRow,
} from "@/lib/jobs/ingestion-analytics";
import { cn } from "@/lib/utils";

function parseRange(value: string | undefined): TimeRange {
  if (value === "7" || value === "30") return value;
  return "1";
}

function statusBadgeColor(status: string | null): string {
  switch (status) {
    case "active":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
    case "degraded":
      return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
    case "disabled":
      return "bg-red-500/20 text-red-700 dark:text-red-400";
    case "banned":
      return "bg-red-500/30 text-red-700 dark:text-red-400";
    default:
      return "bg-slate-500/20 text-slate-700 dark:text-slate-400";
  }
}

function runStatusBadgeColor(status: string): string {
  switch (status) {
    case "success":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
    case "partial":
      return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
    case "failed":
      return "bg-red-500/20 text-red-700 dark:text-red-400";
    default:
      return "bg-slate-500/20 text-slate-700 dark:text-slate-400";
  }
}

function rateColor(rate: number): string {
  if (rate >= 0.5) return "text-emerald-500";
  if (rate >= 0.2) return "text-yellow-500";
  return "text-red-500";
}

function formatDuration(ms: number): string {
  if (ms <= 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
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

function SummaryCard({
  label,
  value,
  secondary,
  tooltip,
  highlightClass,
}: {
  label: string;
  value: string | number;
  secondary?: string;
  tooltip: string;
  highlightClass?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </CardTitle>
          <HelpTooltip text={tooltip} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span
            className={cn("text-2xl font-bold tabular-nums", highlightClass)}
          >
            {value}
          </span>
          {secondary ? (
            <span className="text-xs text-muted-foreground">{secondary}</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function buildTrendData(trends: IngestionTrendPoint[]): {
  date: string;
  processed: number;
  inserted: number;
  rejected: number;
  skipped: number;
}[] {
  const byDate = new Map<
    string,
    { processed: number; inserted: number; rejected: number; skipped: number }
  >();

  for (const point of trends) {
    const existing = byDate.get(point.date) ?? {
      processed: 0,
      inserted: 0,
      rejected: 0,
      skipped: 0,
    };
    existing.processed += point.itemsProcessed;
    existing.inserted += point.itemsInserted;
    existing.rejected += point.itemsRejected;
    existing.skipped += point.itemsSkipped;
    byDate.set(point.date, existing);
  }

  return Array.from(byDate.entries())
    .map(([date, values]) => ({ date, ...values }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface IngestionAnalyticsProps {
  range?: string;
}

export async function IngestionAnalytics({ range }: IngestionAnalyticsProps) {
  const daysBack = Number.parseInt(parseRange(range), 10);
  const rangeLabel = daysBack === 1 ? "24h" : `${daysBack}d`;

  let summary: IngestionSummary | null = null;
  let sources: SourcePerformanceRow[] = [];
  let trends: IngestionTrendPoint[] = [];
  let recentRuns: RecentRunRow[] = [];
  let topErrors: TopErrorRow[] = [];
  let error: string | null = null;

  try {
    [summary, sources, trends, recentRuns, topErrors] = await Promise.all([
      getIngestionSummary(daysBack),
      getSourcePerformance(daysBack),
      getIngestionTrends(daysBack),
      getRecentIngestionRuns(daysBack),
      getTopIngestionErrors(daysBack),
    ]);
  } catch (e) {
    error =
      e instanceof Error ? e.message : "Failed to load ingestion analytics";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Ingestion Analytics</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const safe = summary ?? {
    totalRuns: 0,
    successfulRuns: 0,
    partialRuns: 0,
    failedRuns: 0,
    itemsProcessed: 0,
    itemsInserted: 0,
    itemsUpdated: 0,
    itemsRejected: 0,
    itemsSkipped: 0,
    successRate: 0,
    yieldRate: 0,
    rejectionRate: 0,
    skipRate: 0,
    avgDurationMs: 0,
  };

  const trendData = buildTrendData(trends);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Layers className="size-5 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight">
            Ingestion Performance
          </h2>
        </div>
        <TimeRangeSelector value={parseRange(range)} />
      </div>
      <p className="text-sm text-muted-foreground">
        Source throughput and efficiency for the last {rangeLabel}. All metrics
        are read from the ingestion log.
      </p>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Runs"
          value={safe.totalRuns.toLocaleString()}
          secondary={`${formatPercent(safe.successRate)} success`}
          tooltip="Total number of seeder and poller runs that completed in the selected window. Success rate = successful runs / total runs."
        />
        <SummaryCard
          label="Items Processed"
          value={safe.itemsProcessed.toLocaleString()}
          secondary={`${safe.itemsInserted.toLocaleString()} inserted`}
          tooltip="Total items discovered by all sources. Inserted items survived deduplication and Gate 0 and became corpus jobs."
        />
        <SummaryCard
          label="Yield Rate"
          value={formatPercent(safe.yieldRate)}
          tooltip="Items inserted / items processed. A low yield rate means the source is returning many duplicates or low-quality listings."
          highlightClass={rateColor(safe.yieldRate)}
        />
        <SummaryCard
          label="Rejection Rate"
          value={formatPercent(safe.rejectionRate)}
          tooltip="Items rejected / items processed. Rejections are items that failed Zod validation or Gate 0 quality checks."
          highlightClass={
            safe.rejectionRate > 0.2 ? "text-red-500" : "text-emerald-500"
          }
        />
        <SummaryCard
          label="Skip Rate"
          value={formatPercent(safe.skipRate)}
          tooltip="Items skipped / items processed. Skips are usually duplicates that already exist in the job table."
          highlightClass={
            safe.skipRate > 0.3 ? "text-yellow-500" : "text-emerald-500"
          }
        />
        <SummaryCard
          label="Avg Run Duration"
          value={formatDuration(safe.avgDurationMs)}
          tooltip="Average wall-clock duration of a run, measured from started_at to finished_at. Slow runs may indicate rate-limiting or large payloads."
        />
      </div>

      {/* Active job staleness distribution */}
      <JobStalenessDistribution />

      {/* Trends chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Daily Ingestion Trends</CardTitle>
            <HelpTooltip text="Grouped daily view of processed, inserted, rejected, and skipped items across all sources. Rejected + skipped explain why processed items did not become corpus jobs." />
          </div>
          <CardDescription>
            Volume and disposition per day (last {rangeLabel})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <IngestionTrendsChart data={trendData} />
        </CardContent>
      </Card>

      {/* Source performance table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Source Performance</CardTitle>
              <HelpTooltip text="Per-source breakdown of throughput, success rate, and efficiency. Status is pulled from the circuit-breaker source_health table." />
            </div>
            <CsvExportButton data={sources} rangeLabel={rangeLabel} />
          </div>
          <CardDescription>
            Sorted by items processed (last {rangeLabel})
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No ingestion runs in the selected window.
            </p>
          ) : (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <div className="flex items-center gap-1.5">
                        Source
                        <HelpTooltip text="The ingestion source identifier, matching the source column in ingestion_log." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Status
                        <HelpTooltip text="Circuit-breaker status from source_health. Active sources are running normally; degraded/disabled/banned sources are stopped or throttled." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Runs
                        <HelpTooltip text="Number of completed runs for this source in the selected window." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Processed
                        <HelpTooltip text="Total items discovered by this source." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Inserted
                        <HelpTooltip text="Items that became new corpus jobs." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Yield
                        <HelpTooltip text="Inserted / processed. Higher is better." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Reject %
                        <HelpTooltip text="Rejected / processed. High values indicate schema changes or low-quality source output." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Skip %
                        <HelpTooltip text="Skipped / processed. Skips are mostly duplicates." />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        Avg Duration
                        <HelpTooltip text="Average run duration for this source." />
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-1.5">
                        Last Run
                        <HelpTooltip text="Timestamp of the most recent run for this source." />
                      </div>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.source}>
                      <TableCell className="font-mono text-xs">
                        {s.source}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          className={statusBadgeColor(s.sourceHealthStatus)}
                        >
                          {s.sourceHealthStatus ?? "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.runs.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.itemsProcessed.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.itemsInserted.toLocaleString()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums font-medium",
                          rateColor(s.yieldRate),
                        )}
                      >
                        {formatPercent(s.yieldRate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(s.rejectionRate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPercent(s.skipRate)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatDuration(s.avgDurationMs)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.lastRunAt
                          ? new Date(s.lastRunAt).toLocaleString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent runs + top errors */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Recent Runs</CardTitle>
              <HelpTooltip text="Latest individual ingestion runs ordered by timestamp. Useful for spotting a specific source failure." />
            </div>
            <CardDescription>Last {recentRuns.length} runs</CardDescription>
          </CardHeader>
          <CardContent>
            {recentRuns.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No recent runs in the selected window.
              </p>
            ) : (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Processed</TableHead>
                      <TableHead className="text-right">Inserted</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentRuns.map((run) => (
                      <TableRow key={run.id}>
                        <TableCell className="font-mono text-xs">
                          {run.source}
                        </TableCell>
                        <TableCell>
                          <Badge className={runStatusBadgeColor(run.status)}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.itemsProcessed.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {run.itemsInserted.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                          {formatDuration(run.durationMs ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Top Errors</CardTitle>
              <AlertTriangle className="size-5 text-muted-foreground" />
              <HelpTooltip text="Most frequent non-success error messages grouped by source. Click the source-health table to disable noisy or broken sources." />
            </div>
            <CardDescription>
              Grouped failures (last {rangeLabel})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topErrors.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No errors in the selected window.
              </p>
            ) : (
              <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                {topErrors.map((err, idx) => (
                  <div
                    key={`${err.source}-${err.errorMessage}-${idx}`}
                    className="rounded-lg border p-3 space-y-1"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">
                        {err.source}
                      </span>
                      <Badge variant="destructive">{err.count}×</Badge>
                    </div>
                    <p
                      className="text-sm line-clamp-2"
                      title={err.errorMessage}
                    >
                      {err.errorMessage}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Last: {new Date(err.lastAt).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
