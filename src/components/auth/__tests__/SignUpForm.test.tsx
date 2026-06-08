/**
 * Unit tests for SignUpForm.
 * Same vi.hoisted + vi.mock("react") pattern as SignInForm.
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

// ─── State helpers ─────────────────────────────────────────────────────────────

function setupState(
  state: { error: string; success: boolean } | null,
  isPending = false,
) {
  mockUseActionState.mockReturnValue([state, vi.fn(), isPending]);
}

// ─── Default rendering ─────────────────────────────────────────────────────────

describe("SignUpForm — default rendering", () => {
  beforeEach(() => setupState(null));

  it("renders the Full Name field with type='text'", () => {
    render(<SignUpForm />);
    const nameInput = screen.getByLabelText(/full name/i);
    expect(nameInput).toBeInTheDocument();
    expect(nameInput).toHaveAttribute("type", "text");
  });

  it("renders the email field with type='email'", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("type", "email");
  });

  it("renders the password field", () => {
    render(<SignUpForm />);
    const pwd = document.querySelector('input[name="password"]');
    expect(pwd).toBeInTheDocument();
    expect(pwd).toHaveAttribute("type", "password");
  });

  it("renders the submit button labelled 'Sign Up'", () => {
    render(<SignUpForm />);
    expect(
      screen.getByRole("button", { name: /^sign up$/i }),
    ).toBeInTheDocument();
  });

  it("renders the password character hint", () => {
    render(<SignUpForm />);
    expect(
      screen.getByText(/must be at least 8 characters/i),
    ).toBeInTheDocument();
  });

  it("does not render an error message when state is null", () => {
    render(<SignUpForm />);
    expect(document.querySelector(".text-destructive")).not.toBeInTheDocument();
  });

  it("all inputs are enabled when not pending", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/full name/i)).not.toBeDisabled();
    expect(screen.getByLabelText(/email/i)).not.toBeDisabled();
    expect(document.querySelector('input[name="password"]')).not.toBeDisabled();
  });
});

// ─── Error state ───────────────────────────────────────────────────────────────

describe("SignUpForm — error state", () => {
  it("displays the error message", () => {
    setupState({ error: "Email already in use", success: false });
    render(<SignUpForm />);
    expect(screen.getByText("Email already in use")).toBeInTheDocument();
  });

  it("error container has destructive styling", () => {
    setupState({ error: "Something failed", success: false });
    render(<SignUpForm />);
    // getByText returns the <div> itself — check its own className
    const errorEl = screen.getByText("Something failed");
    expect(errorEl.className).toContain("destructive");
  });
});

// ─── Pending state ─────────────────────────────────────────────────────────────

describe("SignUpForm — pending state", () => {
  beforeEach(() => setupState(null, true));

  it("shows 'Creating account...' while pending", () => {
    render(<SignUpForm />);
    expect(
      screen.getByRole("button", { name: /creating account/i }),
    ).toBeInTheDocument();
  });

  it("disables the submit button while pending", () => {
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

// ─── Accessibility ─────────────────────────────────────────────────────────────

describe("SignUpForm — accessibility", () => {
  beforeEach(() => setupState(null));

  it("name input id='name' matches its label", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/full name/i)).toHaveAttribute("id", "name");
  });

  it("email input id='email' matches its label", () => {
    render(<SignUpForm />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("id", "email");
  });

  it("submit button has type='submit'", () => {
    render(<SignUpForm />);
    expect(screen.getByRole("button", { name: /^sign up$/i })).toHaveAttribute(
      "type",
      "submit",
    );
  });
});
