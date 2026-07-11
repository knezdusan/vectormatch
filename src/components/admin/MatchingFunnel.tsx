// Matching Funnel & Quality — Admin Dashboard (Sprint 4 Task 6)
// src/components/admin/MatchingFunnel.tsx
//
// Server Component that renders the matching funnel and quality metrics with
// charts and an interactive time-range selector. Funnel data is fetched for
// the selected range (1, 7, or 30 days); distributions and company tables are
// all-time snapshots.

import { Award, Filter, Info, TrendingUp, Users } from "lucide-react";

import { AdminMetricTooltip } from "@/components/admin/AdminMetricTooltip";
import { DistributionCharts } from "@/components/admin/DistributionCharts";
import { FunnelChart } from "@/components/admin/FunnelChart";
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
  type CompanyQualityRow,
  type FunnelStats,
  type FusionScoreRow,
  getFunnelStats,
  getFusionScoreDistribution,
  getPurgeCandidates,
  getQualityScoreDistribution,
  getTierDistribution,
  getTopCompaniesByQuality,
  type QualityScoreBucket,
  type TierDistribution,
} from "@/lib/jobs/admin-queries";

function tierColor(tier: string) {
  switch (tier) {
    case "active_hot":
      return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
    case "active":
      return "bg-blue-500/20 text-blue-700 dark:text-blue-400";
    case "dormant":
      return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
    case "dead":
      return "bg-red-500/20 text-red-700 dark:text-red-400";
    default:
      return "";
  }
}

function tierChartColor(tier: string) {
  switch (tier) {
    case "active_hot":
      return "var(--chart-2)";
    case "active":
      return "var(--chart-1)";
    case "dormant":
      return "var(--chart-4)";
    case "dead":
      return "var(--chart-5)";
    default:
      return "var(--muted-foreground)";
  }
}

function qualityBucketColor(bucket: string) {
  switch (bucket) {
    case "0-10":
      return "var(--chart-5)";
    case "10-30":
      return "var(--chart-4)";
    case "30-50":
      return "var(--chart-2)";
    case "50-100":
      return "var(--chart-1)";
    default:
      return "var(--primary)";
  }
}

function fusionScoreColor(score: number) {
  const colors = [
    "var(--chart-5)",
    "var(--chart-4)",
    "var(--chart-3)",
    "var(--chart-2)",
    "var(--chart-1)",
  ];
  return colors[Math.min(score, 4)] ?? colors[0];
}

function CompanyTable({
  rows,
  emptyMessage,
}: {
  rows: CompanyQualityRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>ATS</TableHead>
            <TableHead className="text-right">Score</TableHead>
            <TableHead className="text-right">Approved</TableHead>
            <TableHead className="text-right">Fusion</TableHead>
            <TableHead>Tier</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.companyId}>
              <TableCell className="font-medium">
                {c.companyName ?? c.atsSlug}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {c.atsSource}
              </TableCell>
              <TableCell className="text-right font-bold">{c.score}</TableCell>
              <TableCell className="text-right">{c.approvedMatches}</TableCell>
              <TableCell className="text-right">{c.fusionScore}</TableCell>
              <TableCell>
                <Badge className={tierColor(c.tier)}>{c.tier}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function parseRange(value: string | undefined): TimeRange {
  if (value === "7" || value === "30") return value;
  return "1";
}

interface MatchingFunnelProps {
  range?: string;
}

export async function MatchingFunnel({ range }: MatchingFunnelProps) {
  const daysBack = Number.parseInt(parseRange(range), 10);
  const rangeLabel = daysBack === 1 ? "24h" : `${daysBack}d`;

  let funnel: FunnelStats | null = null;
  let tiers: TierDistribution[] = [];
  let qualityBuckets: QualityScoreBucket[] = [];
  let fusionDist: FusionScoreRow[] = [];
  let topCompanies: CompanyQualityRow[] = [];
  let purgeCandidates: CompanyQualityRow[] = [];
  let error: string | null = null;

  try {
    [funnel, tiers, qualityBuckets, fusionDist, topCompanies, purgeCandidates] =
      await Promise.all([
        getFunnelStats(daysBack),
        getTierDistribution(),
        getQualityScoreDistribution(),
        getFusionScoreDistribution(),
        getTopCompaniesByQuality(10),
        getPurgeCandidates(10),
      ]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load funnel data";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Matching Funnel & Quality</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const approvalPct = ((funnel?.approvalRate ?? 0) * 100).toFixed(1);

  const funnelData = [
    {
      stage: "Total Jobs",
      count: funnel?.totalJobs ?? 0,
      color: "var(--chart-1)",
    },
    {
      stage: "Gate 0 Passed",
      count: funnel?.gate0Passed ?? 0,
      color: "var(--chart-2)",
    },
    {
      stage: "Gate 1+2",
      count: funnel?.gate12Candidates ?? 0,
      color: "var(--chart-3)",
    },
    {
      stage: "Gate 3 Approved",
      count: funnel?.gate3Approved ?? 0,
      color: "var(--chart-4)",
    },
  ];

  const tierData = tiers.map((t) => ({
    tier: t.tier,
    count: t.count,
    color: tierChartColor(t.tier),
    label: t.tier,
  }));

  const qualityData = qualityBuckets.map((b) => ({
    bucket: b.bucket,
    count: b.count,
    color: qualityBucketColor(b.bucket),
  }));

  const fusionData = fusionDist.map((f) => ({
    bucket: f.fusionScore >= 5 ? "5+" : `${f.fusionScore}`,
    count: f.count,
    color: fusionScoreColor(f.fusionScore),
  }));

  return (
    <div className="space-y-4">
      {/* Header + range selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Filter className="size-5 text-muted-foreground" />
          <h2 className="text-xl font-bold tracking-tight">
            Matching Funnel & Quality
          </h2>
        </div>
        <TimeRangeSelector value={parseRange(range)} />
      </div>
      <p className="text-sm text-muted-foreground">
        Funnel stats for the last {rangeLabel}; distributions and quality tables
        reflect all-time data.
      </p>

      {/* Funnel stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="size-3" />
              <span>Total Jobs ({rangeLabel})</span>
              <AdminMetricTooltip text="All jobs ingested in the selected time window." />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {funnel?.totalJobs ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardDescription className="text-xs flex items-center gap-1 cursor-help">
                    Gate 0 Passed
                    <Info className="size-3" />
                  </CardDescription>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p>
                    Jobs normalized in the last {rangeLabel}. Match queue rows
                    can be created for jobs normalized earlier, so Gate 1+2 and
                    Gate 3 may be positive even when this is zero.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {funnel?.gate0Passed ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Gate 1+2 Candidates</span>
              <AdminMetricTooltip text="Jobs that passed GIN tag filtering (Gate 1) and HNSW vector similarity (Gate 2) and were promoted to LLM arbitration." />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {funnel?.gate12Candidates ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Gate 3 Approved</span>
              <AdminMetricTooltip text="Match queue rows that the LLM arbitration step approved as relevant and visible to applicants." />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-emerald-500">
              {funnel?.gate3Approved ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Gate 3 Rejected</span>
              <AdminMetricTooltip text="Match queue rows that the LLM arbitration step rejected because of explicit blockers." />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums text-red-500">
              {funnel?.gate3Rejected ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Approval Rate</span>
              <AdminMetricTooltip text="Gate 3 approved / total Gate 3 evaluated in the selected time window." />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{approvalPct}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Funnel chart */}
      <Card>
        <CardHeader>
          <CardTitle>Funnel ({rangeLabel})</CardTitle>
          <CardDescription>
            Drop-off from ingestion through Gate 3 approval
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FunnelChart data={funnelData} />
        </CardContent>
      </Card>

      {/* Distribution charts */}
      <Card>
        <CardHeader>
          <CardTitle>Distributions</CardTitle>
          <CardDescription>
            Tier, quality score, and fusion score distributions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DistributionCharts
            tiers={tierData}
            qualityBuckets={qualityData}
            fusionScores={fusionData}
          />
        </CardContent>
      </Card>

      {/* Company tables */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Award className="size-5 text-muted-foreground" />
              <CardTitle>Top Companies by Quality</CardTitle>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p>
                      Quality score = approved matches / total jobs processed
                      (0–100). Companies are ranked by score; high scores
                      promote to active_hot, low scores demote to dormant.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            <CompanyTable
              rows={topCompanies}
              emptyMessage="No quality scores yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="size-5 text-muted-foreground" />
              <CardTitle>Purge Candidates</CardTitle>
              <AdminMetricTooltip text="Active-tier companies whose quality score (approved matches / total jobs processed) has fallen below 10. Candidates for tier demotion or removal." />
            </div>
            <CardDescription>
              Active tier companies with quality score &lt; 10
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CompanyTable
              rows={purgeCandidates}
              emptyMessage="No purge candidates."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
