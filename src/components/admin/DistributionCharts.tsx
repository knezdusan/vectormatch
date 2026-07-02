"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface TierDistribution {
  tier: string;
  count: number;
  color: string;
  label: string;
}

interface BucketDistribution {
  bucket: string;
  count: number;
  color: string;
}

interface DistributionChartsProps {
  tiers: TierDistribution[];
  qualityBuckets: BucketDistribution[];
  fusionScores: BucketDistribution[];
}

const tierDescriptions: Record<string, string> = {
  active_hot: "Approved matches in the last 30 days → polled every 3h",
  active: "Posted a job in the last 14 days → polled every 12h",
  dormant: "No jobs in >14 days → polled weekly",
  dead: "Endpoint gone or too many failures",
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

interface HoverState {
  tier: string | null;
  quality: string | null;
  fusion: string | null;
}

function ChartSection({
  title,
  children,
  empty,
  footer,
}: {
  title: string;
  children: React.ReactNode;
  empty: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {empty ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No {title.toLowerCase()} data.
        </div>
      ) : (
        <div className="aspect-video w-full text-xs">{children}</div>
      )}
      {footer}
    </div>
  );
}

export function DistributionCharts({
  tiers,
  qualityBuckets,
  fusionScores,
}: DistributionChartsProps) {
  const [hovered, setHovered] = useState<HoverState>({
    tier: null,
    quality: null,
    fusion: null,
  });

  const tiersEmpty = tiers.length === 0 || tiers.every((t) => t.count === 0);
  const qualityEmpty =
    qualityBuckets.length === 0 || qualityBuckets.every((b) => b.count === 0);
  const fusionEmpty =
    fusionScores.length === 0 || fusionScores.every((f) => f.count === 0);

  return (
    <div className="grid gap-6 md:grid-cols-3">
      <ChartSection
        title="Tier Distribution"
        empty={tiersEmpty}
        footer={
          !tiersEmpty ? (
            <div className="space-y-1 pt-1">
              {tiers.map((t) => (
                <div key={t.tier} className="flex items-start gap-2 text-xs">
                  <span
                    className="mt-1 inline-block size-2 rounded-full shrink-0"
                    style={{ backgroundColor: t.color }}
                  />
                  <span className="text-muted-foreground">
                    <span className="font-medium capitalize text-foreground">
                      {t.label}
                    </span>
                    {" — "}
                    {tierDescriptions[t.label] ?? "Unknown tier"}
                  </span>
                </div>
              ))}
            </div>
          ) : null
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
            />
            <Pie
              data={tiers}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              innerRadius="45%"
              outerRadius="70%"
              paddingAngle={2}
              activeShape={false}
            >
              {tiers.map((entry) => (
                <Cell
                  key={entry.tier}
                  fill={entry.color}
                  fillOpacity={hovered.tier === entry.tier ? 0.7 : 1}
                  stroke={
                    hovered.tier === entry.tier ? "var(--foreground)" : "none"
                  }
                  strokeWidth={hovered.tier === entry.tier ? 2 : 0}
                  onMouseEnter={() =>
                    setHovered((prev) => ({ ...prev, tier: entry.tier }))
                  }
                  onMouseLeave={() =>
                    setHovered((prev) => ({ ...prev, tier: null }))
                  }
                  style={{ cursor: "pointer" }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartSection>

      <ChartSection
        title="Quality Score Distribution"
        empty={qualityEmpty}
        footer={
          !qualityEmpty ? (
            <p className="text-xs text-muted-foreground pt-1">
              Per-company score (0–100) based on approved matches / total jobs
              processed. High scores promote companies to active_hot; low scores
              demote them to dormant.
            </p>
          ) : null
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={qualityBuckets}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
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
            <Bar dataKey="count" radius={[4, 4, 0, 0]} activeBar={false}>
              {qualityBuckets.map((entry) => (
                <Cell
                  key={entry.bucket}
                  fill={entry.color}
                  fillOpacity={hovered.quality === entry.bucket ? 0.7 : 1}
                  stroke={
                    hovered.quality === entry.bucket
                      ? "var(--foreground)"
                      : "none"
                  }
                  strokeWidth={hovered.quality === entry.bucket ? 2 : 0}
                  onMouseEnter={() =>
                    setHovered((prev) => ({ ...prev, quality: entry.bucket }))
                  }
                  onMouseLeave={() =>
                    setHovered((prev) => ({ ...prev, quality: null }))
                  }
                  style={{ cursor: "pointer" }}
                />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                className="fill-foreground text-xs"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>

      <ChartSection
        title="Fusion Score Distribution"
        empty={fusionEmpty}
        footer={
          !fusionEmpty ? (
            <p className="text-xs text-muted-foreground pt-1">
              Number of distinct discovery sources that found the same company
              (HN, GitHub, Product Hunt, etc.). Higher-fusion companies get
              priority polling.
            </p>
          ) : null
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={fusionScores}
            margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
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
            <Bar dataKey="count" radius={[4, 4, 0, 0]} activeBar={false}>
              {fusionScores.map((entry) => (
                <Cell
                  key={entry.bucket}
                  fill={entry.color}
                  fillOpacity={hovered.fusion === entry.bucket ? 0.7 : 1}
                  stroke={
                    hovered.fusion === entry.bucket
                      ? "var(--foreground)"
                      : "none"
                  }
                  strokeWidth={hovered.fusion === entry.bucket ? 2 : 0}
                  onMouseEnter={() =>
                    setHovered((prev) => ({ ...prev, fusion: entry.bucket }))
                  }
                  onMouseLeave={() =>
                    setHovered((prev) => ({ ...prev, fusion: null }))
                  }
                  style={{ cursor: "pointer" }}
                />
              ))}
              <LabelList
                dataKey="count"
                position="top"
                className="fill-foreground text-xs"
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartSection>
    </div>
  );
}
