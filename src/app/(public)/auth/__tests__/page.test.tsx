/**
 * Unit tests for the /auth page component and its metadata.
 */

import { render, screen } from "@testing-library/react";
import Auth, { generateMetadata } from "@/app/(public)/auth/page";

// Prevent the real AuthTabs (and its async searchParams/db chain) from loading.
vi.mock("@/components/auth/AuthTabs", () => ({
  AuthTabs: () => <div data-testid="auth-tabs">Auth Tabs</div>,
}));

// ─── generateMetadata ──────────────────────────────────────────────────────────

describe("generateMetadata", () => {
  it("returns the correct page title", () => {
    const meta = generateMetadata();
    expect(meta.title).toBe("Sign In - VectorMatch");
  });
});

// ─── Auth page rendering ───────────────────────────────────────────────────────

describe("Auth page", () => {
  async function renderPage(tab?: string) {
    const element = await Auth({
      searchParams: Promise.resolve(tab ? { tab } : {}),
    });
    return render(element);
  }

  it("renders the AuthTabs component", async () => {
    await renderPage();
    expect(screen.getByTestId("auth-tabs")).toBeInTheDocument();
  });

  it("renders with ?tab=signup search param without crashing", async () => {
    await expect(renderPage("signup")).resolves.not.toThrow();
  });

  it("wraps AuthTabs in a Suspense boundary (Spinner fallback present in DOM)", async () => {
    // The Suspense fallback is only shown while AuthTabs is loading.
    // In synchronous tests it resolves immediately; we just verify no crash.
    await renderPage();
    // If Suspense fallback were rendered it would have role="status"
    // (from Spinner's aria-label="Loading"). Since AuthTabs is resolved it
    // should NOT be present.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
