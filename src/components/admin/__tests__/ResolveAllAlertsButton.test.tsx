/**
 * Unit tests for ResolveAllAlertsButton.
 *
 * Tests:
 *   - Renders nothing when count is 0
 *   - Renders "Resolve all (N)" button when count > 0
 *   - Calls resolveAllAlertsAction on click
 *   - Shows loading state during transition
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResolveAllAlertsButton } from "@/components/admin/ResolveAllAlertsButton";

const mockResolveAllAlertsAction = vi.hoisted(() => vi.fn());

vi.mock("@/actions/admin", () => ({
  resolveAllAlertsAction: () => mockResolveAllAlertsAction(),
}));

describe("ResolveAllAlertsButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveAllAlertsAction.mockResolvedValue({ success: true });
  });

  it("renders nothing when count is 0", () => {
    const { container } = render(<ResolveAllAlertsButton count={0} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders resolve all button with count", () => {
    render(<ResolveAllAlertsButton count={5} />);
    expect(
      screen.getByRole("button", { name: /resolve all \(5\)/i }),
    ).toBeInTheDocument();
  });

  it("calls resolveAllAlertsAction when clicked", async () => {
    render(<ResolveAllAlertsButton count={3} />);
    fireEvent.click(screen.getByRole("button", { name: /resolve all/i }));
    await waitFor(() => {
      expect(mockResolveAllAlertsAction).toHaveBeenCalledTimes(1);
    });
  });

  it("shows resolving state and disables button during transition", async () => {
    let resolveTransition: (value?: unknown) => void = () => {};
    mockResolveAllAlertsAction.mockReturnValue(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );

    render(<ResolveAllAlertsButton count={2} />);
    const button = screen.getByRole("button", { name: /resolve all/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Resolving...")).toBeInTheDocument();
    });
    expect(button).toBeDisabled();

    resolveTransition();
    await waitFor(() => {
      expect(mockResolveAllAlertsAction).toHaveBeenCalledTimes(1);
    });
  });
});
