// Infrastructure Health Card — Admin Dashboard (Sprint 4 Task 5)
// src/components/admin/InfrastructureHealth.tsx
//
// Server Component that renders the infrastructure health section:
//   - Neon storage usage (current / limit / percentage)
//   - Gate 2 cosine distance threshold
//   - Source health table (circuit breaker status per source)
//
// Data is fetched server-side via admin-queries.ts. No client interactivity
// needed — the page refreshes on navigation.

import { AlertTriangle, CheckCircle, Database, HardDrive } from "lucide-react";

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
  getAllSourceHealth,
  getInfraStats,
  type InfraStats,
  type SourceHealthStats,
} from "@/lib/jobs/admin-queries";

function statusBadge(status: string) {
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
  if (percentage >= 0.94) return "text-red-500";
  if (percentage >= 0.88) return "text-yellow-500";
  return "text-green-500";
}

export async function InfrastructureHealth() {
  let infra: InfraStats | null = null;
  let sources: SourceHealthStats[] = [];
  let error: string | null = null;

  try {
    [infra, sources] = await Promise.all([
      getInfraStats(),
      getAllSourceHealth(),
    ]);
  } catch (e) {
    error =
      e instanceof Error ? e.message : "Failed to load infrastructure data";
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-muted-foreground" />
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
  const storagePct = infra?.storagePercentage ?? 0;
  const storageMb = infra?.storageMb ?? 0;
  const storageLimit = infra?.storageLimitMb ?? 512;
  const gate2 = infra?.gate2Threshold ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <HardDrive className="size-5 text-muted-foreground" />
          <CardTitle>Infrastructure Health</CardTitle>
        </div>
        <CardDescription>
          Neon storage, Gate 2 threshold, and circuit breaker status
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Storage + Gate 2 stats */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="size-4" />
              <span>Neon Storage</span>
            </div>
            <p className={`text-2xl font-bold ${storageColor(storagePct)}`}>
              {storageMb.toFixed(0)} MB
            </p>
            <p className="text-xs text-muted-foreground">
              of {storageLimit} MB ({(storagePct * 100).toFixed(1)}%)
            </p>
          </div>

          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle className="size-4" />
              <span>Gate 2 Threshold</span>
            </div>
            <p className="text-2xl font-bold">{gate2.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              cosine distance (env-configurable)
            </p>
          </div>

          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="size-4" />
              <span>Circuit Breakers</span>
            </div>
            <p className="text-2xl font-bold">
              {disabledCount} disabled
              {degradedCount > 0 && (
                <span className="text-yellow-500">
                  {" "}
                  / {degradedCount} degraded
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              of {sources.length} total sources
            </p>
          </div>
        </div>

        {/* Source health table */}
        {sources.length > 0 ? (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Failures</TableHead>
                  <TableHead className="text-right">Total Runs</TableHead>
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
                    <TableCell className="text-right">{s.totalRuns}</TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
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
  );
}
