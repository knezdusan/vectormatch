/**
 * Smoke test for FunnelChart.
 *
 * Recharts is mocked so the test only verifies that the component renders
 * the empty state correctly and accepts the expected data shape.
 */

import { render, screen } from "@testing-library/react";
import { FunnelChart } from "@/components/admin/FunnelChart";

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
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Tooltip: () => null,
    XAxis: () => null,
    YAxis: () => null,
  };
});

describe("FunnelChart", () => {
  it("renders empty state when all counts are zero", () => {
    render(
      <FunnelChart
        data={[
          { stage: "Total Jobs", count: 0, color: "#000" },
          { stage: "Gate 0 Passed", count: 0, color: "#000" },
        ]}
      />,
    );
    expect(
      screen.getByText(/no funnel data for the selected period/i),
    ).toBeInTheDocument();
  });

  it("renders chart container when data is present", () => {
    render(
      <FunnelChart
        data={[
          { stage: "Total Jobs", count: 100, color: "#000" },
          { stage: "Gate 0 Passed", count: 80, color: "#000" },
        ]}
      />,
    );
    expect(
      screen.queryByText(/no funnel data for the selected period/i),
    ).not.toBeInTheDocument();
  });
});
