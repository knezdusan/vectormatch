/**
 * Unit tests for SignInForm.
 *
 * vi.spyOn cannot patch ESM named exports — use vi.hoisted + vi.mock("react")
 * to replace useActionState with a configurable vi.fn().
 */

import { render, screen } from "@testing-library/react";
import { SignInForm } from "@/components/auth/SignInForm";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────

const mockUseActionState = vi.hoisted(() => vi.fn());

// Mock the server action module so its import chain (auth → db) is never loaded.
vi.mock("@/app/auth/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
}));

// Replace React's useActionState with our configurable mock.
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return { ...actual, useActionState: mockUseActionState };
});

// ─── State helpers ─────────────────────────────────────────────────────────────

function setupState(
  state: { error: string; success: boolean } | null,
  isPending = false,
) {
  mockUseActionState.mockReturnValue([state, vi.fn(), isPending]);
}

// ─── Default rendering ─────────────────────────────────────────────────────────

describe("SignInForm — default rendering", () => {
  beforeEach(() => setupState(null));

  it("renders the email field with correct label and type", () => {
    render(<SignInForm />);
    const email = screen.getByLabelText(/email/i);
    expect(email).toBeInTheDocument();
    expect(email).toHaveAttribute("type", "email");
  });

  it("renders the password field with name='password'", () => {
    render(<SignInForm />);
    const pwd = document.querySelector('input[name="password"]');
    expect(pwd).toBeInTheDocument();
    expect(pwd).toHaveAttribute("type", "password");
  });

  it("renders the submit button labelled 'Sign In'", () => {
    render(<SignInForm />);
    expect(
      screen.getByRole("button", { name: /^sign in$/i }),
    ).toBeInTheDocument();
  });

  it("does not render an error message when state is null", () => {
    render(<SignInForm />);
    // Error div has text-destructive class; when absent no destructive text exists
    expect(document.querySelector(".text-destructive")).not.toBeInTheDocument();
  });

  it("inputs are not disabled when not pending", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).not.toBeDisabled();
    expect(document.querySelector('input[name="password"]')).not.toBeDisabled();
  });
});

// ─── Error state ───────────────────────────────────────────────────────────────

describe("SignInForm — error state", () => {
  it("displays the error message from state", () => {
    setupState({ error: "Invalid email or password", success: false });
    render(<SignInForm />);
    expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
  });

  it("error container has destructive styling", () => {
    setupState({ error: "Something went wrong", success: false });
    render(<SignInForm />);
    // getByText returns the <div> itself — check its own className
    const errorEl = screen.getByText("Something went wrong");
    expect(errorEl.className).toContain("destructive");
  });
});

// ─── Pending state ─────────────────────────────────────────────────────────────

describe("SignInForm — pending state (isPending=true)", () => {
  beforeEach(() => setupState(null, true));

  it("shows 'Signing in...' while pending", () => {
    render(<SignInForm />);
    expect(
      screen.getByRole("button", { name: /signing in/i }),
    ).toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("disables the email input while pending", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
  });

  it("disables the password input while pending", () => {
    render(<SignInForm />);
    expect(document.querySelector('input[name="password"]')).toBeDisabled();
  });
});

// ─── Accessibility ─────────────────────────────────────────────────────────────

describe("SignInForm — accessibility", () => {
  beforeEach(() => setupState(null));

  it("email input has id='email' matching its label's htmlFor", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("id", "email");
  });

  it("submit button has type='submit'", () => {
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toHaveAttribute(
      "type",
      "submit",
    );
  });
});
