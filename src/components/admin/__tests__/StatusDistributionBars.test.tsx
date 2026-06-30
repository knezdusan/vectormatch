/**
 * Unit tests for StatusDistributionBars.
 */

import { render, screen } from "@testing-library/react";
import { StatusDistributionBars } from "@/components/admin/StatusDistributionBars";

describe("StatusDistributionBars", () => {
  it("renders empty state when total is 0", () => {
    render(
      <StatusDistributionBars
        data={[
          {
            status: "active",
            count: 0,
            color: "bg-emerald-500",
            label: "Active",
          },
        ]}
        total={0}
        emptyMessage="No data"
      />,
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("renders status bars with percentage", () => {
    render(
      <StatusDistributionBars
        data={[
          {
            status: "active",
            count: 75,
            color: "bg-emerald-500",
            label: "Active",
          },
          { status: "stale", count: 25, color: "bg-amber-500", label: "Stale" },
        ]}
        total={100}
        emptyMessage="No data"
      />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("75 (75.0%)")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });
});
