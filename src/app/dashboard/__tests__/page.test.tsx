/**
 * Unit tests for the /dashboard page.
 *
 * The session guard and user info have moved to the Dashboard layout and
 * sidebar respectively. This page now renders static welcome content.
 */

import { render, screen } from "@testing-library/react";
import Dashboard from "@/app/dashboard/page";

describe("Dashboard page", () => {
  it("displays the welcome heading", () => {
    render(<Dashboard />);
    expect(screen.getByText("Welcome to Dashboard")).toBeInTheDocument();
  });

  it("displays the sidebar instruction", () => {
    render(<Dashboard />);
    expect(
      screen.getByText(/please select an option from the sidebar/i),
    ).toBeInTheDocument();
  });
});
