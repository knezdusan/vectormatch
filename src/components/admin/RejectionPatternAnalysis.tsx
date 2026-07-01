// Gate 3 Rejection Pattern Analysis — Sprint 8 Task 10
// Server Component that displays Gate 3 rejection patterns and approval rates
// by prompt variant, persona, and ATS source.

import { BarChart3 } from "lucide-react";

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
  getApprovalByAtsSource,
  getApprovalByPersona,
  getApprovalByPromptVariant,
  getRejectionCategories,
} from "@/lib/jobs/admin-queries";

function approvalRateColor(rate: number): string {
  if (rate >= 2)
    return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
  if (rate >= 1) return "bg-amber-500/20 text-amber-700 dark:text-amber-400";
  return "bg-red-500/20 text-red-700 dark:text-red-400";
}

export async function RejectionPatternAnalysis() {
  let categories: { category: string; count: number }[] = [];
  let variants: {
    variant: string;
    total: number;
    approved: number;
    approvalRate: number;
  }[] = [];
  let personas: {
    personaId: string;
    personaLabel: string;
    total: number;
    approved: number;
    approvalRate: number;
  }[] = [];
  let atsSources: {
    atsSource: string;
    total: number;
    approved: number;
    approvalRate: number;
  }[] = [];
  let error: string | null = null;

  try {
    [categories, variants, personas, atsSources] = await Promise.all([
      getRejectionCategories(),
      getApprovalByPromptVariant(),
      getApprovalByPersona(),
      getApprovalByAtsSource(),
    ]);
  } catch (e) {
    error =
      e instanceof Error ? e.message : "Failed to load rejection analysis";
  }

  if (error) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle>Gate 3 Rejection Patterns</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const totalRejections = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-muted-foreground" />
          <CardTitle>Gate 3 Rejection Patterns</CardTitle>
        </div>
        <CardDescription>
          Rejection reasons by category and approval rates by variant, persona,
          and ATS source (last 30 days)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Rejection categories */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Rejection Reasons by Category ({totalRejections} total blockers)
          </h4>
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No rejection data available
            </p>
          ) : (
            <div className="space-y-2">
              {categories.map((c) => {
                const pct =
                  totalRejections > 0
                    ? ((c.count / totalRejections) * 100).toFixed(0)
                    : "0";
                return (
                  <div key={c.category} className="flex items-center gap-3">
                    <span className="text-sm w-24 capitalize">
                      {c.category}
                    </span>
                    <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-primary h-full rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums w-16 text-right">
                      {c.count} ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Approval rate by prompt variant */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Approval Rate by Prompt Variant
          </h4>
          {variants.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Approval %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => (
                  <TableRow key={v.variant}>
                    <TableCell className="font-medium capitalize">
                      {v.variant}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.approved}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={approvalRateColor(v.approvalRate)}>
                        {v.approvalRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Approval rate by persona */}
        <div>
          <h4 className="text-sm font-medium mb-2">Approval Rate by Persona</h4>
          {personas.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Approval %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personas.map((p) => (
                  <TableRow key={p.personaId}>
                    <TableCell className="font-medium">
                      {p.personaLabel}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.approved}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={approvalRateColor(p.approvalRate)}>
                        {p.approvalRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Approval rate by ATS source */}
        <div>
          <h4 className="text-sm font-medium mb-2">
            Approval Rate by ATS Source
          </h4>
          {atsSources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ATS Source</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Approval %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atsSources.map((a) => (
                  <TableRow key={a.atsSource}>
                    <TableCell className="font-mono text-xs">
                      {a.atsSource}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.total}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.approved}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge className={approvalRateColor(a.approvalRate)}>
                        {a.approvalRate}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
