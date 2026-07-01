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

interface ApprovalRow {
  key: string;
  label: React.ReactNode;
  total: number;
  approved: number;
  approvalRate: number;
}

function approvalRateColor(rate: number): string {
  if (rate >= 2)
    return "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400";
  if (rate >= 1) return "bg-amber-500/20 text-amber-700 dark:text-amber-400";
  return "bg-red-500/20 text-red-700 dark:text-red-400";
}

/**
 * Reusable approval-rate table used by the three breakdown sections (variant,
 * persona, ATS source). Extracted to avoid the 3× duplicated 13-line table
 * blocks flagged by fallow.
 */
function ApprovalRateTable({
  label,
  rows,
  emptyMessage,
}: {
  label: string;
  rows: ApprovalRow[];
  emptyMessage: string;
}) {
  const labelShort = label.replace("Approval Rate by ", "");

  return (
    <div>
      <h4 className="text-sm font-medium mb-2">{label}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{labelShort}</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Approved</TableHead>
              <TableHead className="text-right">Approval %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.label}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.total}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.approved}
                </TableCell>
                <TableCell className="text-right">
                  <Badge className={approvalRateColor(r.approvalRate)}>
                    {r.approvalRate}%
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
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

  const variantRows: ApprovalRow[] = variants.map((v) => ({
    key: v.variant,
    label: <span className="capitalize">{v.variant}</span>,
    total: v.total,
    approved: v.approved,
    approvalRate: v.approvalRate,
  }));

  const personaRows: ApprovalRow[] = personas.map((p) => ({
    key: p.personaId,
    label: p.personaLabel,
    total: p.total,
    approved: p.approved,
    approvalRate: p.approvalRate,
  }));

  const atsRows: ApprovalRow[] = atsSources.map((a) => ({
    key: a.atsSource,
    label: <span className="font-mono text-xs">{a.atsSource}</span>,
    total: a.total,
    approved: a.approved,
    approvalRate: a.approvalRate,
  }));

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

        <ApprovalRateTable
          label="Approval Rate by Prompt Variant"
          rows={variantRows}
          emptyMessage="No prompt variant data available"
        />
        <ApprovalRateTable
          label="Approval Rate by Persona"
          rows={personaRows}
          emptyMessage="No persona data available"
        />
        <ApprovalRateTable
          label="Approval Rate by ATS Source"
          rows={atsRows}
          emptyMessage="No ATS source data available"
        />
      </CardContent>
    </Card>
  );
}
