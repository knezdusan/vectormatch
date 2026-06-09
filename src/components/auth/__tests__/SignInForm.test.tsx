/**
 * Unit tests for SignInForm.
 *
 * vi.spyOn cannot patch ESM named exports — use vi.hoisted + vi.mock("react")
 * to replace useActionState with a configurable vi.fn().
 *
 * Kept: conditional rendering (error/pending states), submit guard, label
 * associations, and accessibility attributes. Removed: trivial renders of
 * fields that are immediately visible from loading the page.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { SignInForm } from "@/components/auth/SignInForm";

// ─── Hoisted refs ──────────────────────────────────────────────────────────────

const mockUseActionState = vi.hoisted(() => vi.fn());
const mockSignIn = vi.hoisted(() => vi.fn());

vi.mock("@/actions/auth", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
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

describe("SignInForm — default state", () => {
  beforeEach(() => {
    setupState(null);
    mockSignIn.mockReset();
  });

  it("does not render an error element when state is null", () => {
    render(<SignInForm />);
    expect(document.querySelector(".text-destructive")).not.toBeInTheDocument();
  });

  it("submit button has type='submit'", () => {
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: /^sign in$/i })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("email input id matches its label's htmlFor", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toHaveAttribute("id", "email");
  });
});

// ─── Error state ───────────────────────────────────────────────────────────────

describe("SignInForm — error state", () => {
  beforeEach(() => {
    setupState(null);
    mockSignIn.mockReset();
  });

  it("displays the error message with destructive styling", () => {
    setupState({ error: "Invalid email or password", success: false });
    render(<SignInForm />);
    const el = screen.getByText("Invalid email or password");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("destructive");
  });
});

// ─── Pending state ─────────────────────────────────────────────────────────────

describe("SignInForm — pending state", () => {
  beforeEach(() => {
    setupState(null, true);
    mockSignIn.mockReset();
  });

  it("shows 'Signing in...' button text while pending", () => {
    render(<SignInForm />);
    expect(
      screen.getByRole("button", { name: /signing in/i }),
    ).toBeInTheDocument();
  });

  it("disables submit button while pending", () => {
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled();
  });

  it("disables all inputs while pending", () => {
    render(<SignInForm />);
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(document.querySelector('input[name="password"]')).toBeDisabled();
  });
});

// ─── Social Sign In ────────────────────────────────────────────────────────────

describe("SignInForm — social sign-in", () => {
  beforeEach(() => {
    setupState(null);
    mockSignIn.mockReset();
  });

  it("renders Google and GitHub buttons", () => {
    render(<SignInForm />);
    expect(screen.getByRole("button", { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /github/i })).toBeInTheDocument();
  });

  it("calls signIn('google') when Google button is clicked", () => {
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: /google/i }));
    expect(mockSignIn).toHaveBeenCalledWith("google");
  });

  it("calls signIn('github') when GitHub button is clicked", () => {
    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: /github/i }));
    expect(mockSignIn).toHaveBeenCalledWith("github");
  });

  it("disables other fields and buttons when a social sign-in is pending", () => {
    mockSignIn.mockImplementation(() => new Promise(() => {}));

    render(<SignInForm />);
    fireEvent.click(screen.getByRole("button", { name: /google/i }));

    // Now social sign-in is pending
    expect(screen.getByLabelText(/email/i)).toBeDisabled();
    expect(document.querySelector('input[name="password"]')).toBeDisabled();
    expect(screen.getByRole("button", { name: /^sign in$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /google/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /github/i })).toBeDisabled();
  });
});
