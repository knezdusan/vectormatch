/**
 * Unit tests for SignUpForm.
 * Same vi.hoisted + vi.mock("react") pattern as SignInForm.
 *
 * Kept: password hint copy (UX regression risk), conditional rendering
 * (error/pending), submit guard, label associations.
 * Removed: trivial field presence tests visible from a single page load.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { SignUpForm } from "@/components/auth/SignUpForm";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────

const mockUseActionState = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());

vi.mock("@/actions/auth", () => ({
  signUpAction: vi.fn(),
  signInAction: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: mockSignIn,
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
  beforeEach(() => {
    setupState(null);
    mockSignIn.mockReset();
  });

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
  beforeEach(() => {
    setupState(null);
    mockSignIn.mockReset();
  });

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
  beforeEach(() => {
    setupState(null, true);
    mockSignIn.mockReset();
  });

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

// ─── Social Sign In ────────────────────────────────────────────────────────────

describe("SignUpForm — social sign-in", () => {
  beforeEach(() => {
    setupState(null);
    mockSignIn.mockReset();
  });

  it("renders Google and GitHub buttons", () => {
    render(<SignUpForm />);
    expect(screen.getByRole("button", { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /github/i })).toBeInTheDocument();
  });

  it("calls signIn('google') when Google button is clicked", () => {
    render(<SignUpForm />);
    fireEvent.click(screen.getByRole("button", { name: /google/i }));
    expect(mockSignIn).toHaveBeenCalledWith("google", {
      callbackURL: "/dashboard/jobs",
    });
  });

  it("calls signIn('github') when GitHub button is clicked", () => {
    render(<SignUpForm />);
    fireEvent.click(screen.getByRole("button", { name: /github/i }));
    expect(mockSignIn).toHaveBeenCalledWith("github", {
      callbackURL: "/dashboard/jobs",
    });
  });

  it("disables other fields and buttons when a social sign-in is pending", () => {
    mockSignIn.mockImplementation(() => new Promise(() => {}));

    render(<SignUpForm />);
    fireEvent.click(screen.getByRole("button", { name: /google/i }));

    // Now social sign-in is pending
    expect(screen.getByLabelText(/full name/i)).toBeDisabled();
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(document.querySelector('input[name="password"]')).toBeDisabled();
    expect(screen.getByRole("button", { name: /^sign up$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /google/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /github/i })).toBeDisabled();
  });
});
