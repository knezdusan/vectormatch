/**
 * Unit tests for the /dashboard page.
 *
 * Core concern: verify the page reads the session via the server-side SDK
 * (auth.api.getSession) and NOT via the browser client (authClient.getSession).
 * Using the browser client in a Server Component is the exact bug that caused
 * the post-signup redirect loop — it performs an outbound HTTP fetch with no
 * cookies, always returning null.
 *
 * Mock strategy:
 *   - Mock @/lib/auth so we can control what getSession returns.
 *   - redirect() is already mocked globally in vitest.setup.ts.
 *   - next/headers (cookies/headers) is already mocked globally.
 */

import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import Dashboard from "@/app/dashboard/page";

// ─── Hoisted mock refs ─────────────────────────────────────────────────────────

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
    },
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MOCK_SESSION = {
  user: { email: "alice@example.com", name: "Alice Smith" },
  session: { id: "sess_123", token: "tok" },
};

// ─── Authenticated rendering ───────────────────────────────────────────────────

describe("Dashboard — authenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(MOCK_SESSION);
  });

  it("renders the welcome heading", async () => {
    render(await Dashboard());
    expect(screen.getByText(/welcome to dashboard/i)).toBeInTheDocument();
  });

  it("displays the logged-in user's email", async () => {
    render(await Dashboard());
    expect(screen.getByText(/alice@example\.com/i)).toBeInTheDocument();
  });

  it("displays the logged-in user's name", async () => {
    render(await Dashboard());
    expect(screen.getByText(/alice smith/i)).toBeInTheDocument();
  });

  it("renders the Sign Out form targeting /api/auth/sign-out", async () => {
    render(await Dashboard());
    const form = document.querySelector('form[action="/api/auth/sign-out"]');
    expect(form).toBeInTheDocument();
  });

  it("does NOT redirect when session exists", async () => {
    render(await Dashboard());
    expect(redirect).not.toHaveBeenCalled();
  });

  it("calls auth.api.getSession with the request headers", async () => {
    render(await Dashboard());
    expect(mockGetSession).toHaveBeenCalledOnce();
    const arg = mockGetSession.mock.calls[0][0];
    // The headers argument must be present — proves we're not using authClient
    expect(arg).toHaveProperty("headers");
  });
});

// ─── Unauthenticated redirect ─────────────────────────────────────────────────
//
// Real Next.js redirect() THROWS a special error to stop component execution.
// Our global mock is a no-op vi.fn(), so without the override below the component
// would continue past the guard and crash on `null.user`. We locally override
// redirect to throw so the behaviour matches the runtime.

describe("Dashboard — unauthenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Match real Next.js: redirect() throws to abort rendering.
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  afterEach(() => {
    // Restore to a no-op so other suites are unaffected.
    vi.mocked(redirect).mockReset();
  });

  it("redirects to /auth when session is null", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(Dashboard()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth");
  });

  it("redirects to /auth when session is undefined", async () => {
    mockGetSession.mockResolvedValue(undefined);
    await expect(Dashboard()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth");
  });
});
