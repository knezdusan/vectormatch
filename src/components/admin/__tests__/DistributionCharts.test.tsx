/**
 * Smoke test for DistributionCharts.
 *
 * Recharts is mocked so the test only verifies that the component renders
 * the expected empty states and chart sections.
 */

import { render, screen } from "@testing-library/react";
import { DistributionCharts } from "@/components/admin/DistributionCharts";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    Bar: () => null,
    BarChart: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    CartesianGrid: () => null,
    Cell: () => null,
    LabelList: () => null,
    Pie: () => null,
    PieChart: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

describe("DistributionCharts", () => {
  it("renders empty states when all data is empty", () => {
    render(
      <DistributionCharts tiers={[]} qualityBuckets={[]} fusionScores={[]} />,
    );
    expect(screen.getByText(/no tier distribution data/i)).toBeInTheDocument();
    expect(
      screen.getByText(/no quality score distribution data/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no fusion score distribution data/i),
    ).toBeInTheDocument();
  });

  it("renders chart sections when data is present", () => {
    render(
      <DistributionCharts
        tiers={[{ tier: "active", count: 10, color: "#000", label: "Active" }]}
        qualityBuckets={[{ bucket: "50-100", count: 5, color: "#000" }]}
        fusionScores={[{ bucket: "1", count: 3, color: "#000" }]}
      />,
    );
    expect(
      screen.queryByText(/no tier distribution data/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no quality score distribution data/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/no fusion score distribution data/i),
    ).not.toBeInTheDocument();
  });
});
