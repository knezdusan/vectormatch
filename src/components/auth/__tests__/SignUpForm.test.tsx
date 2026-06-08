/**
 * Unit tests for SignUpForm.
 * Same vi.hoisted + vi.mock("react") pattern as SignInForm.
 *
 * Kept: password hint copy (UX regression risk), conditional rendering
 * (error/pending), submit guard, label associations.
 * Removed: trivial field presence tests visible from a single page load.
 */

import { render, screen } from "@testing-library/react";
import { SignUpForm } from "@/components/auth/SignUpForm";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────

const mockUseActionState = vi.hoisted(() => vi.fn());

vi.mock("@/app/auth/actions", () => ({
  signUpAction: vi.fn(),
  signInAction: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

function setupState(
  state: { error: string; success: boolean } | null,
  isPending = false,
) {
  mockUseActionState.mockReturnValue([state, vi.fn(), isPending]);
}

// ─── Default state ─────────────────────────────────────────────────────────────

describe("SignUpForm — default state", () => {
  beforeEach(() => setupState(null));

  // UX copy regression — if someone changes the hint text it would silently
  // break the user's understanding of the password policy.
  it("renders the '8 characters minimum' password hint", () => {
    render(<SignUpForm />);
    expect(
      screen.getByText(/must be at least 8 characters/i),
    ).toBeInTheDocument();
  });

  it("does not render an error element when state is null", () => {
    render(<SignUpForm />);
    expect(document.querySelector(".text-destructive")).not.toBeInTheDocument();
  });

  it("submit button has type='submit'", () => {
    render(<SignUpForm />);
    expect(screen.getByRole("button", { name: /^sign up$/i })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("name input id matches its label's htmlFor", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/full name/i)).toHaveAttribute("id", "name");
  });

  it("email input id matches its label's htmlFor", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("id", "email");
  });
});

// ─── Error state ───────────────────────────────────────────────────────────────

describe("SignUpForm — error state", () => {
  it("displays the error message with destructive styling", () => {
    setupState({ error: "Email already in use", success: false });
    render(<SignUpForm />);
    const el = screen.getByText("Email already in use");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("destructive");
  });
});

// ─── Pending state ─────────────────────────────────────────────────────────────

describe("SignUpForm — pending state", () => {
  beforeEach(() => setupState(null, true));

  it("shows 'Creating account...' button text while pending", () => {
    render(<SignUpForm />);
    expect(
      screen.getByRole("button", { name: /creating account/i }),
    ).toBeInTheDocument();
  });

  it("disables submit button while pending", () => {
    render(<SignUpForm />);
    expect(
      screen.getByRole("button", { name: /creating account/i }),
    ).toBeDisabled();
  });

  it("disables all inputs while pending", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/full name/i)).toBeDisabled();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(document.querySelector('input[name="password"]')).toBeDisabled();
  });
});
