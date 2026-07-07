"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { StalenessBucket } from "@/lib/jobs/ingestion-analytics";

interface StalenessDistributionChartProps {
  data: Record<StalenessBucket, number>;
}

const BUCKET_ORDER: StalenessBucket[] = [
  "<1d",
  "2-7d",
  "8-30d",
  "30-60d",
  ">60d",
];

const BUCKET_LABELS: Record<StalenessBucket, string> = {
  "<1d": "<1d",
  "2-7d": "2-7d",
  "8-30d": "8-30d",
  "30-60d": "30-60d",
  ">60d": ">60d",
};

const tooltipStyle = {
  backgroundColor: "var(--background)",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  color: "var(--foreground)",
};

const tooltipItemStyle = { color: "var(--foreground)" };
const tooltipLabelStyle = { color: "var(--foreground)" };

export function StalenessDistributionChart({
  data,
}: StalenessDistributionChartProps) {
  const chartData = BUCKET_ORDER.map((bucket) => ({
    bucket: BUCKET_LABELS[bucket],
    jobs: data[bucket] ?? 0,
    fill:
      bucket === "8-30d"
        ? "var(--chart-4)"
        : bucket === "30-60d" || bucket === ">60d"
          ? "var(--chart-5)"
          : "var(--chart-2)",
  }));

  const isEmpty = chartData.every((d) => d.jobs === 0);

  if (isEmpty) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No active jobs to display.
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={0}
      >
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="bucket"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            itemStyle={tooltipItemStyle}
            labelStyle={tooltipLabelStyle}
          />
          <Bar dataKey="jobs" name="Active Jobs" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
