/**
 * Unit tests for the /dashboard/admin page.
 *
 * Verifies that the admin page is accessible only to users with the "admin" role
 * and redirects non-admin users to /dashboard.
 *
 * Mock strategy:
 *   - Mock @/lib/auth so we can control what getSession returns.
 *   - redirect() is already mocked globally in vitest.setup.ts.
 */

import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { AdminData } from "@/app/dashboard/admin/page";

// ─── Hoisted mock refs ─────────────────────────────────────────────────────────

const { mockGetSession } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthSession: async () => mockGetSession(),
  requireRole: async (role: string, redirectTo = "/dashboard") => {
    const session = await mockGetSession();
    if (!session || session.user.role !== role) {
      redirect(redirectTo);
    }
    return session;
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: { email: "admin@example.com", name: "Admin User", role: "admin" },
  session: { id: "sess_admin", token: "tok_admin" },
};

const USER_SESSION = {
  user: { email: "user@example.com", name: "Regular User", role: "user" },
  session: { id: "sess_user", token: "tok_user" },
};

// ─── Admin access ──────────────────────────────────────────────────────────────

describe("AdminPage — admin access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(ADMIN_SESSION);
  });

  it("renders the admin page for admin users", async () => {
    render(await AdminData());
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("does NOT redirect when user has admin role", async () => {
    render(await AdminData());
    expect(redirect).not.toHaveBeenCalled();
  });
});

// ─── Non-admin redirect ────────────────────────────────────────────────────────

describe("AdminPage — non-admin redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  afterEach(() => {
    vi.mocked(redirect).mockReset();
  });

  it("redirects to /dashboard for regular users", async () => {
    mockGetSession.mockResolvedValue(USER_SESSION);
    await expect(AdminData()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /dashboard when session is null", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(AdminData()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /dashboard when session is undefined", async () => {
    mockGetSession.mockResolvedValue(undefined);
    await expect(AdminData()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
