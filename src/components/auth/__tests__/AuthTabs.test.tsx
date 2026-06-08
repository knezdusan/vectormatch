/**
 * Unit tests for AuthTabs (async Server Component).
 *
 * AuthTabs is an async function component — we call it directly, await the
 * returned JSX, then pass it to render(). This pattern works in Vitest +
 * happy-dom for Server Components.
 *
 * Kept: defaultTab logic, URL-driven tab switching, fallback for unknown values.
 * Removed: trivial renders (tab count, presence of individual tabs) that are
 * immediately visible from a single page load.
 */

import { render, screen } from "@testing-library/react";
import { AuthTabs } from "@/components/auth/AuthTabs";

vi.mock("@/components/auth/SignInForm", () => ({
  SignInForm: () => <div data-testid="sign-in-form">Sign In Form</div>,
}));
vi.mock("@/components/auth/SignUpForm", () => ({
  SignUpForm: () => <div data-testid="sign-up-form">Sign Up Form</div>,
}));

async function renderTabs(tab?: string) {
  const element = await AuthTabs({
    searchParams: Promise.resolve(tab !== undefined ? { tab } : {}),
  });
  return render(element);
}

// ─── Default tab ───────────────────────────────────────────────────────────────

describe("AuthTabs — default tab (no ?tab= param)", () => {
  it("activates Sign In by default", async () => {
    await renderTabs();
    expect(screen.getByRole("tab", { name: /sign in/i })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("renders the SignInForm content in the default panel", async () => {
    await renderTabs();
    expect(screen.getByTestId("sign-in-form")).toBeInTheDocument();
  });
});

// ─── URL-driven tab selection ──────────────────────────────────────────────────

describe("AuthTabs — URL-driven tab selection", () => {
  it("?tab=signup activates the Sign Up tab", async () => {
    await renderTabs("signup");
    expect(screen.getByRole("tab", { name: /sign up/i })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("?tab=signup deactivates the Sign In tab", async () => {
    await renderTabs("signup");
    expect(screen.getByRole("tab", { name: /sign in/i })).toHaveAttribute(
      "data-state",
      "inactive",
    );
  });
});

// ─── Fallback for unknown values ───────────────────────────────────────────────

describe("AuthTabs — unknown ?tab= value", () => {
  it("falls back to Sign In for an unknown value", async () => {
    await renderTabs("oauth");
    expect(screen.getByRole("tab", { name: /sign in/i })).toHaveAttribute(
      "data-state",
      "active",
    );
  });

  it("falls back to Sign In for empty string", async () => {
    await renderTabs("");
    expect(screen.getByRole("tab", { name: /sign in/i })).toHaveAttribute(
      "data-state",
      "active",
    );
  });
});
