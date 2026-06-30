"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface FunnelChartProps {
  data: {
    stage: string;
    count: number;
    color: string;
  }[];
}

function tooltipFormatter(value: unknown) {
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

export function FunnelChart({ data }: FunnelChartProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No funnel data for the selected period.
      </div>
    );
  }

  return (
    <div className="aspect-video w-full text-xs">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 16, right: 8, left: 8, bottom: 8 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
          />
          <XAxis
            dataKey="stage"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={60}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
            allowDecimals={false}
          />
          <Tooltip
            formatter={tooltipFormatter}
            contentStyle={{
              backgroundColor: "var(--background)",
              borderColor: "var(--border)",
              borderRadius: "var(--radius-md)",
              fontSize: 12,
              color: "var(--foreground)",
            }}
            itemStyle={{ color: "var(--foreground)" }}
            labelStyle={{ color: "var(--foreground)" }}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} activeBar={false}>
            {data.map((entry) => (
              <Cell
                key={entry.stage}
                fill={entry.color}
                fillOpacity={hovered === entry.stage ? 0.7 : 1}
                stroke={hovered === entry.stage ? "var(--foreground)" : "none"}
                strokeWidth={hovered === entry.stage ? 2 : 0}
                onMouseEnter={() => setHovered(entry.stage)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              />
            ))}
            <LabelList
              dataKey="count"
              position="top"
              className="fill-foreground text-xs"
              formatter={(value: unknown) =>
                typeof value === "number"
                  ? value.toLocaleString()
                  : String(value)
              }
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
