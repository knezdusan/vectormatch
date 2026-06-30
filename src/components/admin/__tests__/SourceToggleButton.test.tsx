/**
 * Unit tests for SourceToggleButton (Sprint 4 — admin interactivity)
 *
 * Tests:
 *   - Renders "Enable" button when status is "disabled"
 *   - Renders "Disable" button when status is "active"
 *   - Renders "Disable" button when status is "degraded"
 *   - Clicking "Enable" calls enableSourceAction with the source name
 *   - Clicking "Disable" calls disableSourceAction with the source name
 *   - Shows "..." and disables the button during the transition
 *
 * Mock strategy:
 *   - Mock @/actions/admin to capture enable/disable action calls
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SourceToggleButton } from "@/components/admin/SourceToggleButton";

const { mockEnableSourceAction, mockDisableSourceAction } = vi.hoisted(() => ({
  mockEnableSourceAction: vi.fn(),
  mockDisableSourceAction: vi.fn(),
}));

vi.mock("@/actions/admin", () => ({
  enableSourceAction: (sourceName: string) =>
    mockEnableSourceAction(sourceName),
  disableSourceAction: (sourceName: string) =>
    mockDisableSourceAction(sourceName),
}));

describe("SourceToggleButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnableSourceAction.mockResolvedValue({ success: true });
    mockDisableSourceAction.mockResolvedValue({ success: true });
  });

  it("renders 'Enable' button when status is 'disabled'", () => {
    render(
      <SourceToggleButton
        sourceName="batch-source-crt-sh"
        currentStatus="disabled"
      />,
    );
    expect(screen.getByRole("button", { name: /enable/i })).toBeInTheDocument();
  });

  it("renders 'Disable' button when status is 'active'", () => {
    render(
      <SourceToggleButton
        sourceName="batch-source-crt-sh"
        currentStatus="active"
      />,
    );
    expect(
      screen.getByRole("button", { name: /disable/i }),
    ).toBeInTheDocument();
  });

  it("renders 'Disable' button when status is 'degraded'", () => {
    render(
      <SourceToggleButton
        sourceName="batch-source-crt-sh"
        currentStatus="degraded"
      />,
    );
    expect(
      screen.getByRole("button", { name: /disable/i }),
    ).toBeInTheDocument();
  });

  it("calls enableSourceAction when 'Enable' is clicked", async () => {
    render(
      <SourceToggleButton
        sourceName="batch-source-crt-sh"
        currentStatus="disabled"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /enable/i }));
    await waitFor(() => {
      expect(mockEnableSourceAction).toHaveBeenCalledWith(
        "batch-source-crt-sh",
      );
    });
    expect(mockDisableSourceAction).not.toHaveBeenCalled();
  });

  it("calls disableSourceAction when 'Disable' is clicked", async () => {
    render(
      <SourceToggleButton
        sourceName="batch-source-crt-sh"
        currentStatus="active"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /disable/i }));
    await waitFor(() => {
      expect(mockDisableSourceAction).toHaveBeenCalledWith(
        "batch-source-crt-sh",
      );
    });
    expect(mockEnableSourceAction).not.toHaveBeenCalled();
  });

  it("shows '...' and disables the button during the transition", async () => {
    let resolveTransition: (value?: unknown) => void = () => {};
    mockDisableSourceAction.mockReturnValue(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );

    render(
      <SourceToggleButton
        sourceName="batch-source-crt-sh"
        currentStatus="active"
      />,
    );
    const button = screen.getByRole("button", { name: /disable/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("...")).toBeInTheDocument();
    });
    expect(button).toBeDisabled();

    resolveTransition();
    await waitFor(() => expect(mockDisableSourceAction).toHaveBeenCalled());
  });

  it("does not call the action when button is disabled (double-click guard)", async () => {
    let resolveTransition: (value?: unknown) => void = () => {};
    mockEnableSourceAction.mockReturnValue(
      new Promise((resolve) => {
        resolveTransition = resolve;
      }),
    );

    render(
      <SourceToggleButton
        sourceName="batch-source-crt-sh"
        currentStatus="disabled"
      />,
    );
    const button = screen.getByRole("button", { name: /enable/i });

    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());

    // Second click should be a no-op
    fireEvent.click(button);

    resolveTransition();
    await waitFor(() =>
      expect(mockEnableSourceAction).toHaveBeenCalledTimes(1),
    );
  });
});
