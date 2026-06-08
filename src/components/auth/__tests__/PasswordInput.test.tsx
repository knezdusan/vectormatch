/**
 * Unit tests for the PasswordInput component.
 *
 * Kept: toggle behaviour, accessibility labels, and the type="button" safety
 * guard. Removed: trivial prop-forwarding tests (placeholder, name, id, etc.)
 * — those are transparent JSX pass-throughs that a single render would surface.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput } from "@/components/auth/PasswordInput";

describe("PasswordInput", () => {
  it("renders type='password' by default", () => {
    render(<PasswordInput />);
    expect(document.querySelector("input")).toHaveAttribute("type", "password");
  });

  it("toggle button starts with aria-label='Show password'", () => {
    render(<PasswordInput />);
    expect(
      screen.getByRole("button", { name: "Show password" }),
    ).toBeInTheDocument();
  });

  it("clicking the toggle reveals the password (type → text)", () => {
    render(<PasswordInput />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(document.querySelector("input")).toHaveAttribute("type", "text");
  });

  it("toggle aria-label changes to 'Hide password' when password is visible", () => {
    render(<PasswordInput />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toBeInTheDocument();
  });

  it("clicking the toggle again hides the password (type → password)", () => {
    render(<PasswordInput />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(document.querySelector("input")).toHaveAttribute("type", "password");
  });

  // type="button" prevents the toggle from submitting the enclosing form
  it("toggle button has type='button' (prevents accidental form submission)", () => {
    render(<PasswordInput />);
    expect(
      screen.getByRole("button", { name: "Show password" }),
    ).toHaveAttribute("type", "button");
  });
});
