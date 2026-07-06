"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TrendDataPoint {
  date: string;
  processed: number;
  inserted: number;
  rejected: number;
  skipped: number;
}

interface IngestionTrendsChartProps {
  data: TrendDataPoint[];
}

const tooltipStyle = {
  backgroundColor: "var(--background)",
  borderColor: "var(--border)",
  borderRadius: "var(--radius-md)",
  fontSize: 12,
  color: "var(--foreground)",
};

const tooltipItemStyle = { color: "var(--foreground)" };
const tooltipLabelStyle = { color: "var(--foreground)" };

export function IngestionTrendsChart({ data }: IngestionTrendsChartProps) {
  const isEmpty = data.length === 0 || data.every((d) => d.processed === 0);

  if (isEmpty) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        No ingestion trend data for the selected window.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        minWidth={0}
        minHeight={0}
      >
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            tickFormatter={(value: string) => {
              const date = new Date(value);
              return date.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              });
            }}
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
          <Legend
            wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }}
          />
          <Bar
            dataKey="processed"
            name="Processed"
            fill="var(--chart-1)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="inserted"
            name="Inserted"
            fill="var(--chart-2)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="rejected"
            name="Rejected"
            fill="var(--chart-5)"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="skipped"
            name="Skipped"
            fill="var(--chart-4)"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
