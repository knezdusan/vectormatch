// Matching Funnel & Quality Card — Admin Dashboard (Sprint 4 Task 6)
// src/components/admin/MatchingFunnel.tsx
//
// Server Component that renders the matching funnel and quality metrics:
//   - Funnel: total jobs → Gate 0 → Gate 1+2 candidates → Gate 3 approved
//   - Approval rate
//   - Tier distribution (active_hot, active, dormant, dead)
//   - Quality score distribution (0-10, 10-30, 30-50, 50-100)
//   - Fusion score distribution
//   - Top companies by quality + purge candidates
//
// Data is fetched server-side via admin-queries.ts.

import { Award, Filter, TrendingUp, Users } from "lucide-react";

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
      return "bg-green-500/20 text-green-700 dark:text-green-400";
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
    <div className="rounded-lg border">
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

export async function MatchingFunnel() {
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
        getFunnelStats(7),
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
      <Card>
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Filter className="size-5 text-muted-foreground" />
          <CardTitle>Matching Funnel & Quality</CardTitle>
        </div>
        <CardDescription>
          7-day matching funnel, tier distribution, and quality metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Funnel stats */}
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-lg border p-3 space-y-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <TrendingUp className="size-3" />
              <span>Total Jobs (7d)</span>
            </div>
            <p className="text-xl font-bold">{funnel?.totalJobs ?? 0}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Gate 0 Passed</p>
            <p className="text-xl font-bold">{funnel?.gate0Passed ?? 0}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Gate 1+2 Candidates</p>
            <p className="text-xl font-bold">{funnel?.gate12Candidates ?? 0}</p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Gate 3 Approved</p>
            <p className="text-xl font-bold text-green-500">
              {funnel?.gate3Approved ?? 0}
            </p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Gate 3 Rejected</p>
            <p className="text-xl font-bold text-red-500">
              {funnel?.gate3Rejected ?? 0}
            </p>
          </div>
          <div className="rounded-lg border p-3 space-y-1">
            <p className="text-xs text-muted-foreground">Approval Rate</p>
            <p className="text-xl font-bold">{approvalPct}%</p>
          </div>
        </div>

        {/* Tier + Quality + Fusion distributions */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Tier distribution */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Tier Distribution</h4>
            <div className="space-y-1">
              {tiers.map((t) => (
                <div
                  key={t.tier}
                  className="flex items-center justify-between text-sm"
                >
                  <Badge className={tierColor(t.tier)}>{t.tier}</Badge>
                  <span className="font-mono">{t.count}</span>
                </div>
              ))}
              {tiers.length === 0 && (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
            </div>
          </div>

          {/* Quality score distribution */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">
              Quality Score Distribution
            </h4>
            <div className="space-y-1">
              {qualityBuckets.map((b) => (
                <div
                  key={b.bucket}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">{b.bucket}</span>
                  <span className="font-mono">{b.count}</span>
                </div>
              ))}
              {qualityBuckets.length === 0 && (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
            </div>
          </div>

          {/* Fusion score distribution */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Fusion Score Distribution</h4>
            <div className="space-y-1">
              {fusionDist.map((f) => (
                <div
                  key={f.fusionScore}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-muted-foreground">
                    {f.fusionScore >= 5 ? "5+" : f.fusionScore} source
                    {f.fusionScore === 1 ? "" : "s"}
                  </span>
                  <span className="font-mono">{f.count}</span>
                </div>
              ))}
              {fusionDist.length === 0 && (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
            </div>
          </div>
        </div>

        {/* Top companies by quality */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Award className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Top Companies by Quality</h4>
          </div>
          <CompanyTable
            rows={topCompanies}
            emptyMessage="No quality scores yet."
          />
        </div>

        {/* Purge candidates */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">
              Purge Candidates (active tier, score &lt; 10)
            </h4>
          </div>
          <CompanyTable
            rows={purgeCandidates}
            emptyMessage="No purge candidates."
          />
        </div>
      </CardContent>
    </Card>
  );
}
