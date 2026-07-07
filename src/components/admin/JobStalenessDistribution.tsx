// Active Job Staleness Distribution Card
// src/components/admin/JobStalenessDistribution.tsx
//
// Displays how current active jobs are distributed by age since publishedAt.
// Two tables: overall and per-source. Buckets 8-30d, 30-60d, and >60d are
// highlighted with warning/danger colors to surface stale inventory.

import { AlertTriangle, CalendarClock, Info } from "lucide-react";

import { StalenessDistributionChart } from "@/components/admin/StalenessDistributionChart";
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
  getJobStalenessDistribution,
  type StalenessBucket,
  type StalenessBySourceRow,
  type StalenessDistributionRow,
} from "@/lib/jobs/ingestion-analytics";
import { cn } from "@/lib/utils";

const BUCKET_LABELS: Record<StalenessBucket, string> = {
  "<1d": "< 1 day",
  "2-7d": "2 - 7 days",
  "8-30d": "8 - 30 days",
  "30-60d": "30 - 60 days",
  ">60d": "> 60 days",
};

const WARNING_BUCKETS: StalenessBucket[] = ["8-30d"];
const DANGER_BUCKETS: StalenessBucket[] = ["30-60d", ">60d"];

function bucketClass(bucket: StalenessBucket): string {
  if (DANGER_BUCKETS.includes(bucket)) {
    return "bg-red-500/10 text-red-700 dark:text-red-400";
  }
  if (WARNING_BUCKETS.includes(bucket)) {
    return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400";
  }
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
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

function OverallTable({ rows }: { rows: StalenessDistributionRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Age bucket</TableHead>
          <TableHead className="text-right">Jobs</TableHead>
          <TableHead className="text-right">Share</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.bucket}>
            <TableCell>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  bucketClass(row.bucket),
                )}
              >
                {DANGER_BUCKETS.includes(row.bucket) ? (
                  <AlertTriangle className="size-3" />
                ) : null}
                {BUCKET_LABELS[row.bucket]}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.count.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatPercent(row.percentage)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SourceTable({ rows }: { rows: StalenessBySourceRow[] }) {
  const buckets: StalenessBucket[] = ["<1d", "2-7d", "8-30d", "30-60d", ">60d"];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Source</TableHead>
          <TableHead className="text-right">Total</TableHead>
          {buckets.map((bucket) => (
            <TableHead key={bucket} className="text-right text-xs">
              <span
                className={cn(
                  "inline-flex rounded px-1.5 py-0.5",
                  bucketClass(bucket),
                )}
              >
                {bucket}
              </span>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.source}>
            <TableCell className="font-medium capitalize">
              {row.source}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.total.toLocaleString()}
            </TableCell>
            {buckets.map((bucket) => (
              <TableCell
                key={bucket}
                className={cn(
                  "text-right tabular-nums",
                  DANGER_BUCKETS.includes(bucket) && row.buckets[bucket] > 0
                    ? "text-red-600 dark:text-red-400"
                    : null,
                  WARNING_BUCKETS.includes(bucket) && row.buckets[bucket] > 0
                    ? "text-yellow-600 dark:text-yellow-400"
                    : null,
                )}
              >
                {row.buckets[bucket].toLocaleString()}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export async function JobStalenessDistribution() {
  let data: Awaited<ReturnType<typeof getJobStalenessDistribution>> | null =
    null;
  let error: string | null = null;

  try {
    data = await getJobStalenessDistribution();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load staleness data";
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-5 text-muted-foreground" />
            <CardTitle>Active Job Staleness</CardTitle>
          </div>
          <HelpTooltip text="Age of active jobs based on their publishedAt timestamp. Jobs older than 30 days are flagged because many ATS boards keep legacy postings open indefinitely." />
        </div>
        <CardDescription>
          Current distribution of active job listings by age since publication.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : data ? (
          <div className="space-y-6">
            <StalenessDistributionChart
              data={
                Object.fromEntries(
                  data.overall.map((row) => [row.bucket, row.count]),
                ) as Record<StalenessBucket, number>
              }
            />
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Overall distribution</h4>
                <OverallTable rows={data.overall} />
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">By source</h4>
                <SourceTable rows={data.bySource} />
              </div>
            </div>
          </div>
        ) : null}
        {data ? (
          <p className="mt-4 text-xs text-muted-foreground">
            {data.total.toLocaleString()} active jobs · refreshed at{" "}
            {data.refreshedAt.toLocaleTimeString()}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
