/**
 * Unit tests for AuthTabs (async Server Component).
 *
 * AuthTabs is an async function component — we call it directly, await the
 * returned JSX, then pass it to render(). This pattern works in Vitest +
 * happy-dom for Server Components.
 *
 * Child form components are mocked to isolate this component's own logic
 * (defaultTab resolution) from their dependency chains.
 */

import { render, screen } from "@testing-library/react";
import { AuthTabs } from "@/components/auth/AuthTabs";

// Isolate from form component dependency chains (auth actions → auth → db)
vi.mock("@/components/auth/SignInForm", () => ({
  SignInForm: () => <div data-testid="sign-in-form">Sign In Form</div>,
}));
vi.mock("@/components/auth/SignUpForm", () => ({
  SignUpForm: () => <div data-testid="sign-up-form">Sign Up Form</div>,
}));

// Helper: resolve searchParams with optional tab value
async function renderTabs(tab?: string) {
  const element = await AuthTabs({
    searchParams: Promise.resolve(tab ? { tab } : {}),
  });
  return render(element);
}

// ─── Tab trigger rendering ─────────────────────────────────────────────────────

describe("AuthTabs — tab triggers", () => {
  it("renders a 'Sign In' tab trigger", async () => {
    await renderTabs();
    expect(screen.getByRole("tab", { name: /sign in/i })).toBeInTheDocument();
  });

  it("renders a 'Sign Up' tab trigger", async () => {
    await renderTabs();
    expect(screen.getByRole("tab", { name: /sign up/i })).toBeInTheDocument();
  });

  it("renders exactly 2 tab triggers", async () => {
    await renderTabs();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
  });
});

// ─── Default tab (no ?tab= param) ─────────────────────────────────────────────

describe("AuthTabs — default tab (no param)", () => {
  it("activates the Sign In tab by default", async () => {
    await renderTabs();
    const signinTab = screen.getByRole("tab", { name: /sign in/i });
    expect(signinTab).toHaveAttribute("data-state", "active");
  });

  it("Sign Up tab is inactive by default", async () => {
    await renderTabs();
    const signupTab = screen.getByRole("tab", { name: /sign up/i });
    expect(signupTab).toHaveAttribute("data-state", "inactive");
  });

  it("renders the SignInForm in the active panel", async () => {
    await renderTabs();
    expect(screen.getByTestId("sign-in-form")).toBeInTheDocument();
  });
});

// ─── ?tab=signin ──────────────────────────────────────────────────────────────

describe("AuthTabs — ?tab=signin", () => {
  it("activates the Sign In tab", async () => {
    await renderTabs("signin");
    expect(
      screen.getByRole("tab", { name: /sign in/i }),
    ).toHaveAttribute("data-state", "active");
  });
});

// ─── ?tab=signup ──────────────────────────────────────────────────────────────

describe("AuthTabs — ?tab=signup", () => {
  it("activates the Sign Up tab", async () => {
    await renderTabs("signup");
    expect(
      screen.getByRole("tab", { name: /sign up/i }),
    ).toHaveAttribute("data-state", "active");
  });

  it("Sign In tab is inactive when signup is selected", async () => {
    await renderTabs("signup");
    expect(
      screen.getByRole("tab", { name: /sign in/i }),
    ).toHaveAttribute("data-state", "inactive");
  });
});

// ─── Unknown / invalid ?tab= value ────────────────────────────────────────────

describe("AuthTabs — unknown tab value", () => {
  it("falls back to Sign In tab for unknown ?tab= value", async () => {
    await renderTabs("oauth"); // not a valid tab
    expect(
      screen.getByRole("tab", { name: /sign in/i }),
    ).toHaveAttribute("data-state", "active");
  });

  it("falls back to Sign In tab for empty string", async () => {
    await renderTabs("");
    expect(
      screen.getByRole("tab", { name: /sign in/i }),
    ).toHaveAttribute("data-state", "active");
  });
});
