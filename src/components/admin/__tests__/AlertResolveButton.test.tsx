/**
 * Unit tests for AlertResolveButton (Sprint 4 — admin interactivity)
 *
 * Tests:
 *   - Renders a "Resolve" button with the correct label
 *   - Clicking the button calls resolveAlertAction with the alert ID
 *   - Shows "Resolving..." and disables the button during the transition
 *   - Does not call the action when disabled
 *
 * Mock strategy:
 *   - Mock @/actions/admin to capture resolveAlertAction calls and control
 *     the resolution timing.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AlertResolveButton } from "@/components/admin/AlertResolveButton";

const { mockResolveAlertAction } = vi.hoisted(() => ({
  mockResolveAlertAction: vi.fn(),
}));

vi.mock("@/actions/admin", () => ({
  resolveAlertAction: (alertId: string) => mockResolveAlertAction(alertId),
}));

describe("AlertResolveButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a 'Resolve' button", () => {
    render(
      <AlertResolveButton alertId="550e8400-e29b-41d4-a716-446655440000" />,
    );
    expect(
      screen.getByRole("button", { name: /resolve/i }),
    ).toBeInTheDocument();
  });

  it("calls resolveAlertAction with the alert ID on click", async () => {
    mockResolveAlertAction.mockResolvedValue({ success: true });
    render(
      <AlertResolveButton alertId="550e8400-e29b-41d4-a716-446655440000" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /resolve/i }));
    await waitFor(() => {
      expect(mockResolveAlertAction).toHaveBeenCalledWith(
        "550e8400-e29b-41d4-a716-446655440000",
      );
    });
  });

  it("shows 'Resolving...' and disables the button during the transition", async () => {
    // Create a promise we control so the transition stays pending
    let resolveTransition: (value?: unknown) => void = () => {};
    mockResolveAlertAction.mockReturnValue(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );

    render(
      <AlertResolveButton alertId="550e8400-e29b-41d4-a716-446655440000" />,
    );
    const button = screen.getByRole("button", { name: /resolve/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Resolving...")).toBeInTheDocument();
    });
    expect(button).toBeDisabled();

    // Resolve the transition to clean up
    resolveTransition();
    await waitFor(() => {
      expect(mockResolveAlertAction).toHaveBeenCalled();
    });
  });

  it("does not call the action when button is disabled (double-click guard)", async () => {
    let resolveTransition: (value?: unknown) => void = () => {};
    mockResolveAlertAction.mockReturnValue(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );

    render(
      <AlertResolveButton alertId="550e8400-e29b-41d4-a716-446655440000" />,
    );
    const button = screen.getByRole("button", { name: /resolve/i });

    // First click starts the transition
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    // Second click should be a no-op (button is disabled)
    fireEvent.click(button);

    resolveTransition();
    await waitFor(() =>
      expect(mockResolveAlertAction).toHaveBeenCalledTimes(1),
    );
  });
});
