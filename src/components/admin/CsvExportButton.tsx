"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SourcePerformanceRow } from "@/lib/jobs/ingestion-analytics";

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

interface CsvExportButtonProps {
  data: SourcePerformanceRow[];
  rangeLabel: string;
}

export function CsvExportButton({ data, rangeLabel }: CsvExportButtonProps) {
  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();

    const headers = [
      "source",
      "runs",
      "successfulRuns",
      "partialRuns",
      "failedRuns",
      "itemsProcessed",
      "itemsInserted",
      "itemsUpdated",
      "itemsRejected",
      "itemsSkipped",
      "yieldRate",
      "rejectionRate",
      "skipRate",
      "successRate",
      "avgDurationMs",
      "lastRunAt",
      "sourceHealthStatus",
    ];

    const rows = data.map((row) => [
      row.source,
      row.runs,
      row.successfulRuns,
      row.partialRuns,
      row.failedRuns,
      row.itemsProcessed,
      row.itemsInserted,
      row.itemsUpdated,
      row.itemsRejected,
      row.itemsSkipped,
      formatPercent(row.yieldRate),
      formatPercent(row.rejectionRate),
      formatPercent(row.skipRate),
      formatPercent(row.successRate),
      row.avgDurationMs,
      row.lastRunAt?.toISOString() ?? "",
      row.sourceHealthStatus ?? "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `ingestion-performance-${rangeLabel}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Revoke the object URL after the download starts to avoid leaking memory.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className="h-auto px-0 py-0 text-xs text-muted-foreground hover:text-foreground"
    >
      <Download className="size-3.5" />
      Export CSV
    </Button>
  );
}
