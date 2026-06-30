/**
 * Unit tests for TimeRangeSelector.
 *
 * Tests:
 *   - Renders the selected range
 *   - Changing the range calls router.push with the updated query string
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TimeRangeSelector } from "@/components/admin/TimeRangeSelector";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams("tab=matching"),
  usePathname: () => "/dashboard/admin",
}));

describe("TimeRangeSelector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the current value", () => {
    render(<TimeRangeSelector value="7" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Last 7 days");
  });

  it("updates the URL with the new range while preserving other params", async () => {
    render(<TimeRangeSelector value="7" />);
    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: /last 30 days/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        "/dashboard/admin?tab=matching&range=30",
        { scroll: false },
      );
    });
  });
});
