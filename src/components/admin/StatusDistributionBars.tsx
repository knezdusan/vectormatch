"use client";

import { AdminMetricTooltip } from "@/components/admin/AdminMetricTooltip";
import { cn } from "@/lib/utils";

interface StatusDistributionBarsProps {
  data: {
    status: string;
    count: number;
    color: string;
    label: string;
    tooltip?: string;
  }[];
  total: number;
  emptyMessage: string;
}

export function StatusDistributionBars({
  data,
  total,
  emptyMessage,
}: StatusDistributionBarsProps) {
  if (data.length === 0 || total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.map((item) => {
        const percentage = total > 0 ? (item.count / total) * 100 : 0;
        return (
          <div key={item.status} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-1.5">
                {item.label}
                {item.tooltip ? (
                  <AdminMetricTooltip text={item.tooltip} />
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {item.count.toLocaleString()} ({percentage.toFixed(1)}%)
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-all", item.color)}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
