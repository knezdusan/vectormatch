// Pipeline Health Monitor — Sprint 7 Task 6c
// Server Component that displays real-time pipeline health metrics.
//
// Queries the DB directly via the pipeline-health module. Renders a grid of
// metric cards with color-coded status indicators. Shown in the admin
// dashboard's "Pipeline" tab.

import { Activity, AlertTriangle, CheckCircle } from "lucide-react";

import { AdminMetricTooltip } from "@/components/admin/AdminMetricTooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ALERT_THRESHOLDS,
  getPipelineHealthMetrics,
  type PipelineHealthMetrics,
} from "@/lib/jobs/pipeline-health";

// ── Helpers ──────────────────────────────────────────────────────────────────

type Status = "healthy" | "warning" | "critical";

function metricStatus(
  value: number,
  threshold: number,
  isLowerBetter: boolean,
): Status {
  if (isLowerBetter) {
    if (value === 0) return "healthy";
    if (value > threshold) return "critical";
    return "warning";
  }
  // Higher is better (e.g. companies polled, matches)
  if (value === threshold) return "critical";
  if (value < threshold / 2) return "warning";
  return "healthy";
}

function statusColor(status: Status): string {
  switch (status) {
    case "healthy":
      return "text-emerald-500";
    case "warning":
      return "text-amber-500";
    case "critical":
      return "text-red-500";
  }
}

function statusBg(status: Status): string {
  switch (status) {
    case "healthy":
      return "bg-emerald-500/10 border-emerald-500/30";
    case "warning":
      return "bg-amber-500/10 border-amber-500/30";
    case "critical":
      return "bg-red-500/10 border-red-500/30";
  }
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "healthy") {
    return <CheckCircle className="size-4 text-emerald-500" />;
  }
  return <AlertTriangle className="size-4 text-amber-500" />;
}

// ── Metric Card ──────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number;
  unit?: string;
  status: Status;
  description: string;
  tooltip: string;
}

function MetricCard({
  label,
  value,
  unit,
  status,
  description,
  tooltip,
}: MetricCardProps) {
  return (
    <Card className={`border ${statusBg(status)}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            {label}
            <AdminMetricTooltip text={tooltip} />
          </CardTitle>
          <StatusIcon status={status} />
        </div>
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${statusColor(status)}`}>
          {value.toLocaleString()}
          {unit ? (
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {unit}
            </span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </CardContent>
    </Card>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export async function PipelineHealthMonitor() {
  let metrics: PipelineHealthMetrics | null = null;
  let error: string | null = null;

  try {
    metrics = await getPipelineHealthMetrics();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load pipeline health";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Pipeline Health Monitor</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!metrics) return null;

  const unnormalizedStatus = metricStatus(
    metrics.unnormalizedJobs,
    ALERT_THRESHOLDS.UNNORMALIZED_JOBS,
    true,
  );
  const unembeddedStatus = metricStatus(
    metrics.unembeddedJobs,
    ALERT_THRESHOLDS.UNEMBEDDED_JOBS,
    true,
  );
  const pollerStatus: Status =
    metrics.companiesPolled4h === 0 ? "critical" : "healthy";
  const matchStatus: Status = metrics.matches24h === 0 ? "warning" : "healthy";
  const sourceHealthStatus: Status =
    metrics.sourceHealthRows === 0 ? "warning" : "healthy";
  const dbStatus: Status =
    metrics.dbSizeMb > ALERT_THRESHOLDS.DB_STORAGE_MB
      ? "critical"
      : metrics.dbSizeMb > 400
        ? "warning"
        : "healthy";
  const pendingStatus = metricStatus(
    metrics.pendingMatchesStale,
    ALERT_THRESHOLDS.PENDING_MATCHES_STALE,
    true,
  );
  const failedStatus = metricStatus(metrics.normalizationFailed, 50, true);
  // Sprint 8: match-specific metrics
  const approvedStatus: Status =
    metrics.approvedMatches24h < ALERT_THRESHOLDS.APPROVED_MATCHES_24H
      ? "critical"
      : metrics.approvedMatches24h < 5
        ? "warning"
        : "healthy";
  const gate3RateStatus: Status =
    metrics.gate3ApprovalRate7d < ALERT_THRESHOLDS.GATE3_APPROVAL_RATE_7D
      ? "critical"
      : metrics.gate3ApprovalRate7d < 0.02
        ? "warning"
        : "healthy";
  const unmatchedStatus = metricStatus(
    metrics.unmatchedEmbeddedJobs,
    ALERT_THRESHOLDS.UNMATCHED_EMBEDDED_JOBS,
    true,
  );

  const hasIssues =
    unnormalizedStatus !== "healthy" ||
    unembeddedStatus !== "healthy" ||
    pollerStatus !== "healthy" ||
    matchStatus !== "healthy" ||
    sourceHealthStatus !== "healthy" ||
    dbStatus !== "healthy" ||
    pendingStatus !== "healthy" ||
    failedStatus !== "healthy" ||
    approvedStatus !== "healthy" ||
    gate3RateStatus !== "healthy" ||
    unmatchedStatus !== "healthy";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-muted-foreground" />
          <CardTitle>Pipeline Health Monitor</CardTitle>
        </div>
        <CardDescription>
          Real-time pipeline metrics (updated every 30 min by the
          pipeline-health-monitor Inngest function)
          {hasIssues ? " — issues detected" : " — all systems healthy"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Unnormalized Jobs"
            value={metrics.unnormalizedJobs}
            status={unnormalizedStatus}
            description="Active jobs >1h old without normalization"
            tooltip="Active jobs detected more than 1 hour ago that still have not been normalized."
          />
          <MetricCard
            label="Unembedded Jobs"
            value={metrics.unembeddedJobs}
            status={unembeddedStatus}
            description="Normalized but missing embeddings"
            tooltip="Normalized active jobs that are missing a vector embedding, blocking them from Gate 2 matching."
          />
          <MetricCard
            label="Companies Polled (4h)"
            value={metrics.companiesPolled4h}
            status={pollerStatus}
            description="Poller liveness signal"
            tooltip="Unique ATS companies successfully polled by the ingestion poller in the last 4 hours."
          />
          <MetricCard
            label="Matches (24h)"
            value={metrics.matches24h}
            status={matchStatus}
            description="Match generation rate"
            tooltip="Match queue entries created in the last 24 hours."
          />
          <MetricCard
            label="Source Health Rows"
            value={metrics.sourceHealthRows}
            status={sourceHealthStatus}
            description="Circuit breaker coverage"
            tooltip="Total rows in the source_health circuit-breaker table. Zero means no sources are being monitored."
          />
          <MetricCard
            label="Normalization Failed"
            value={metrics.normalizationFailed}
            status={failedStatus}
            description="Retryable normalization failures"
            tooltip="Jobs with status 'normalization_failed' that can be retried once the underlying issue is fixed."
          />
          <MetricCard
            label="Stale Pending Matches"
            value={metrics.pendingMatchesStale}
            status={pendingStatus}
            description="Pending matches >30min old"
            tooltip="Match queue rows still in 'pending' status older than 30 minutes, signaling a Gate 3 backlog or failure."
          />
          <MetricCard
            label="DB Storage"
            value={Math.round(metrics.dbSizeMb)}
            unit="/ 512 MB"
            status={dbStatus}
            description="Neon storage usage"
            tooltip="Current database size against the 512 MB Neon storage limit."
          />
          {/* Sprint 8: Match-specific metrics */}
          <MetricCard
            label="Approved Matches (24h)"
            value={metrics.approvedMatches24h}
            status={approvedStatus}
            description="Target: 5-10 approved per day"
            tooltip="Matches approved by Gate 3 LLM arbitration in the last 24 hours. Target range is 5-10 per day."
          />
          <MetricCard
            label="Gate 3 Approval Rate (7d)"
            value={metrics.gate3ApprovalRate7d * 100}
            unit="%"
            status={gate3RateStatus}
            description="Target: 2-4% approval rate"
            tooltip="Approved / total Gate 3 evaluated over the last 7 days. Target range is 2-4%."
          />
          <MetricCard
            label="Unmatched Embedded Jobs"
            value={metrics.unmatchedEmbeddedJobs}
            status={unmatchedStatus}
            description="Embedded jobs missed by matching"
            tooltip="Embedded jobs that have no match queue entry, signaling a matching coverage gap."
          />
          <MetricCard
            label="Avg Gate 3 Confidence (7d)"
            value={metrics.avgGate3Confidence * 100}
            unit="%"
            status={metrics.avgGate3Confidence > 0.5 ? "healthy" : "warning"}
            description="LLM certainty for recent evaluations"
            tooltip="Average LLM confidence score for Gate 3 evaluations over the last 7 days."
          />
        </div>
      </CardContent>
    </Card>
  );
}
