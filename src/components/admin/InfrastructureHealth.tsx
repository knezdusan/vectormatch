// Infrastructure Health Card — Admin Dashboard (Sprint 4 Task 5)
// src/components/admin/InfrastructureHealth.tsx
//
// Server Component that renders the infrastructure health section:
//   - Neon storage usage (current / limit / percentage) with a Progress bar
//   - Gate 2 cosine distance threshold
//   - Source health table (circuit breaker status per source) with toggle actions
//
// Data is fetched server-side via admin-queries.ts.

import {
  AlertTriangle,
  CheckCircle,
  Database,
  HardDrive,
  ShieldAlert,
} from "lucide-react";

import { EmergencyPurgeButton } from "@/components/admin/EmergencyPurgeButton";
import { NeonStorageTooltip } from "@/components/admin/NeonStorageTooltip";
import { SourceToggleButton } from "@/components/admin/SourceToggleButton";
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
  type BreakerRetryMetrics,
  type CorpusRatioMetrics,
  getAllSourceHealth,
  getBreakerRetryMetrics,
  getCorpusRatioMetrics,
  getInfraStats,
  getSourceOrphanedCompanies,
  type InfraStats,
  type SourceHealthStats,
  type SourceOrphanedCompany,
} from "@/lib/jobs/admin-queries";
import {
  DEGRADED_FAILURE_THRESHOLD,
  HARD_CIRCUIT_BREAKER_THRESHOLD,
} from "@/lib/jobs/source-health";

function statusBadge(status: string) {
  if (status === "banned") {
    return (
      <Badge className="bg-red-500/20 text-red-700 dark:text-red-400">
        {status}
      </Badge>
    );
  }
  if (status === "disabled") {
    return <Badge variant="destructive">{status}</Badge>;
  }
  if (status === "degraded") {
    return (
      <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400">
        {status}
      </Badge>
    );
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function storageColor(percentage: number) {
  if (percentage >= 0.88) return "text-red-500";
  if (percentage >= 0.8) return "text-yellow-500";
  return "text-emerald-500";
}

function backlogColor(count: number, max: number) {
  const ratio = max > 0 ? count / max : 0;
  if (ratio >= 1) return "text-red-500";
  if (ratio >= 0.83) return "text-yellow-500"; // ~2,500 / 3,000
  return "text-emerald-500";
}

export async function InfrastructureHealth() {
  let infra: InfraStats | null = null;
  let sources: SourceHealthStats[] = [];
  let corpusMetrics: CorpusRatioMetrics | null = null;
  let orphanedCompanies: SourceOrphanedCompany[] = [];
  let retryMetrics: BreakerRetryMetrics | null = null;
  let error: string | null = null;

  try {
    [infra, sources, corpusMetrics, orphanedCompanies, retryMetrics] =
      await Promise.all([
        getInfraStats(),
        getAllSourceHealth(),
        getCorpusRatioMetrics(),
        getSourceOrphanedCompanies(),
        getBreakerRetryMetrics(),
      ]);
  } catch (e) {
    error =
      e instanceof Error ? e.message : "Failed to load infrastructure data";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            <CardTitle>Infrastructure Health</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error}</p>
        </CardContent>
      </Card>
    );
  }

  const disabledCount = sources.filter((s) => s.status === "disabled").length;
  const degradedCount = sources.filter((s) => s.status === "degraded").length;
  const bannedCount = sources.filter((s) => s.status === "banned").length;
  const storagePct = infra?.storagePercentage ?? 0;
  const storageMb = infra?.storageMb ?? 0;
  const storageLimit = infra?.storageLimitMb ?? 460;
  // Neon synthetic storage (what Neon actually enforces). Falls back to
  // pg_database_size values if the Neon API is unavailable.
  const neonPct = infra?.neonPercentage ?? storagePct;
  const neonMb = infra?.neonSyntheticMb ?? storageMb;
  const neonLimit = infra?.neonLimitMb ?? 512;
  const gate2 = infra?.gate2Threshold ?? 0;
  const unnormalizedCount = infra?.unnormalizedCount ?? 0;
  const maxUnnormalized = infra?.maxUnnormalized ?? 3000;

  return (
    <div className="space-y-4">
      {/* Key infra metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="size-4" />
              <span>Neon Storage</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${storageColor(neonPct)}`}>
                {neonMb.toFixed(0)} MB
              </span>
              <span className="text-sm text-muted-foreground">
                of {neonLimit} MB
              </span>
            </div>
            <NeonStorageTooltip
              neonPct={neonPct}
              storageMb={storageMb}
              storageLimit={storageLimit}
              storagePct={storagePct}
            />
            {neonPct >= 0.8 && (
              <EmergencyPurgeButton storagePercentage={neonPct} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="size-4" />
              <span>Gate 2 Threshold</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold">{gate2.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              Max cosine distance for HNSW match candidates.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="size-4" />
              <span>Circuit Breakers</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-3xl font-bold">
              {disabledCount}{" "}
              <span className="text-sm font-medium text-muted-foreground">
                disabled
              </span>
            </p>
            {bannedCount > 0 && (
              <p className="text-sm text-red-500">
                {bannedCount} banned (24hr cooldown)
              </p>
            )}
            {degradedCount > 0 ? (
              <p className="text-sm text-yellow-500">
                {degradedCount} degraded
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Degraded after {DEGRADED_FAILURE_THRESHOLD} failures; hard open
                after {HARD_CIRCUIT_BREAKER_THRESHOLD}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="size-4" />
              <span>Normalizer Backlog</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-3xl font-bold ${backlogColor(unnormalizedCount, maxUnnormalized)}`}
              >
                {unnormalizedCount}
              </span>
              <span className="text-sm text-muted-foreground">
                / {maxUnnormalized} jobs
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Ingestion pauses at {maxUnnormalized} unnormalized jobs.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Source health table */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <HardDrive className="size-5 text-muted-foreground" />
            <CardTitle>Source Health</CardTitle>
          </div>
          <CardDescription>
            Per-source circuit breaker status and failure history
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length > 0 ? (
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                    <TableHead className="text-right">Total Runs</TableHead>
                    <TableHead>Last Success</TableHead>
                    <TableHead>Last Error</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sources.map((s) => (
                    <TableRow key={s.sourceName}>
                      <TableCell className="font-mono text-xs">
                        {s.sourceName}
                      </TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell className="text-right">
                        {s.consecutiveFailures}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.totalRuns}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {s.lastSuccessAt
                          ? new Date(s.lastSuccessAt).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-48 truncate text-xs text-muted-foreground"
                        title={s.lastError ?? undefined}
                      >
                        {s.lastError ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <SourceToggleButton
                          sourceName={s.sourceName}
                          currentStatus={s.status}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No source health records yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* v2 Corpus Ratio Metrics (Circuit Breaker Tier 3 + 4) */}
      {corpusMetrics && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-muted-foreground" />
              <CardTitle>Corpus Ratio Metrics (v2)</CardTitle>
            </div>
            <CardDescription>
              Circuit breaker Tier 3 (unknown sub-floor) and Tier 4 (global
              ratio)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Global Remote</p>
                <p className="text-2xl font-bold">
                  {corpusMetrics.globalCount}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Country Fenced</p>
                <p className="text-2xl font-bold">
                  {corpusMetrics.countryFencedCount}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Unknown</p>
                <p
                  className={`text-2xl font-bold ${
                    corpusMetrics.unknownSubFloorRatio >= 0.3
                      ? "text-red-500"
                      : "text-emerald-500"
                  }`}
                >
                  {corpusMetrics.unknownCount}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(corpusMetrics.unknownSubFloorRatio * 100).toFixed(1)}% of
                  corpus (breaker at 30%)
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Global Ratio</p>
                <p
                  className={`text-2xl font-bold ${
                    corpusMetrics.knownScopeRatio < 0.5
                      ? "text-red-500"
                      : "text-emerald-500"
                  }`}
                >
                  {(corpusMetrics.knownScopeRatio * 100).toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  Breaker halts ingestion below 50%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* v2 Circuit Breaker Retry Monitoring (Task A4) */}
      {retryMetrics && retryMetrics.totalTrips > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-muted-foreground" />
              <CardTitle>Breaker Retry Monitoring (v2)</CardTitle>
            </div>
            <CardDescription>
              Single-test retry success ratio (last 7 days). &gt;80% = breaker
              catching blips correctly; &lt;50% = sources genuinely broken.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Retry Success</p>
                <p
                  className={`text-3xl font-bold ${
                    retryMetrics.retrySuccessRatio >= 0.8
                      ? "text-emerald-500"
                      : retryMetrics.retrySuccessRatio >= 0.5
                        ? "text-yellow-500"
                        : "text-red-500"
                  }`}
                >
                  {(retryMetrics.retrySuccessRatio * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {retryMetrics.autoResolved} auto-recovered /{" "}
                  {retryMetrics.totalTrips} total trips
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Escalations</p>
                <p className="text-3xl font-bold">{retryMetrics.escalations}</p>
                <p className="text-xs text-muted-foreground">
                  Tier 5 bans from retry failure
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Active Alerts</p>
                <p
                  className={`text-3xl font-bold ${
                    retryMetrics.activeAlerts > 0
                      ? "text-yellow-500"
                      : "text-emerald-500"
                  }`}
                >
                  {retryMetrics.activeAlerts}
                </p>
                <p className="text-xs text-muted-foreground">
                  Unresolved breaker alerts
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Active Bans</p>
                <p
                  className={`text-3xl font-bold ${
                    retryMetrics.activeBans > 0
                      ? "text-red-500"
                      : "text-emerald-500"
                  }`}
                >
                  {retryMetrics.activeBans}
                </p>
                <p className="text-xs text-muted-foreground">
                  Sources in 24hr cooldown
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source-Orphaned Companies (Circuit Breaker Tier 5) */}
      {orphanedCompanies.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-yellow-500" />
              <CardTitle>
                Source-Orphaned Companies ({orphanedCompanies.length})
              </CardTitle>
            </div>
            <CardDescription>
              Companies whose only discovery source was banned. They remain in
              the corpus but cannot receive new job postings until the source
              recovers.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>ATS Slug</TableHead>
                    <TableHead>Discovery Source</TableHead>
                    <TableHead>Tier</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orphanedCompanies.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.companyName ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {c.atsSlug}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {c.discoverySource ?? "—"}
                      </TableCell>
                      <TableCell>{statusBadge(c.tier)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
