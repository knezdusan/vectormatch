/**
 * Unit tests for the PasswordInput component.
 * Tests toggle behaviour, accessibility labels, and prop forwarding.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { PasswordInput } from "@/components/auth/PasswordInput";

describe("PasswordInput", () => {
  it("renders an input of type password by default", () => {
    render(<PasswordInput />);
    // type="password" inputs have no accessible ARIA role — query the DOM directly
    const input = document.querySelector("input");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "password");
  });

  it("shows 'Show password' aria-label on the toggle button by default", () => {
    render(<PasswordInput />);
    expect(
      screen.getByRole("button", { name: "Show password" }),
    ).toBeInTheDocument();
  });

  it("toggles input type to text when the show button is clicked", () => {
    render(<PasswordInput />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle);
    const input = document.querySelector("input");
    expect(input).toHaveAttribute("type", "text");
  });

  it("updates toggle aria-label to 'Hide password' after first click", () => {
    render(<PasswordInput />);
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(
      screen.getByRole("button", { name: "Hide password" }),
    ).toBeInTheDocument();
  });

  it("toggles back to type password on second click", () => {
    render(<PasswordInput />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggle); // → text
    fireEvent.click(screen.getByRole("button", { name: "Hide password" })); // → password
    const input = document.querySelector("input");
    expect(input).toHaveAttribute("type", "password");
  });

  it("forwards placeholder prop to the input", () => {
    render(<PasswordInput placeholder="Enter password" />);
    expect(document.querySelector("input")).toHaveAttribute(
      "placeholder",
      "Enter password",
    );
  });

  it("forwards name prop to the input", () => {
    render(<PasswordInput name="password" />);
    expect(document.querySelector("input")).toHaveAttribute("name", "password");
  });

  it("forwards id prop to the input", () => {
    render(<PasswordInput id="pwd" />);
    expect(document.querySelector("input")).toHaveAttribute("id", "pwd");
  });

  it("forwards disabled prop to the input", () => {
    render(<PasswordInput disabled />);
    expect(document.querySelector("input")).toBeDisabled();
  });

  it("forwards required prop to the input", () => {
    render(<PasswordInput required />);
    expect(document.querySelector("input")).toBeRequired();
  });

  it("toggle button is type='button' to avoid form submission", () => {
    render(<PasswordInput />);
    const toggle = screen.getByRole("button", { name: "Show password" });
    expect(toggle).toHaveAttribute("type", "button");
  });

  it("preserves className on the underlying Input element", () => {
    render(<PasswordInput className="custom-class" />);
    const input = document.querySelector("input");
    expect(input?.className).toContain("custom-class");
  });
});
