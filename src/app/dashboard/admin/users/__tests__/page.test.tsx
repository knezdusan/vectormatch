/**
 * Unit tests for the /dashboard/admin/users page.
 *
 * Verifies that the users admin page is accessible only to users with the "admin"
 * role and renders the users table correctly.
 *
 * Mock strategy:
 *   - Mock @/lib/auth so we can control what requireRole returns and what
 *     auth.api.listUsers returns.
 *   - redirect() is already mocked globally in vitest.setup.ts.
 */

import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import AdminUsersPage from "@/app/dashboard/admin/users/page";

// ─── Hoisted mock refs ─────────────────────────────────────────────────────────

const { mockRequireRole, mockListUsers } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockListUsers: vi.fn().mockResolvedValue({ users: [] }),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      listUsers: mockListUsers,
    },
  },
  requireRole: async (role: string, redirectTo = "/dashboard") => {
    return mockRequireRole(role, redirectTo);
  },
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

const ADMIN_SESSION = {
  user: {
    id: "admin-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    email: "admin@example.com",
    emailVerified: true,
    name: "Admin User",
    role: "admin",
    image: null,
    banned: null,
  },
  session: {
    id: "sess_admin",
    token: "tok_admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "admin-id",
    expiresAt: new Date(),
  },
};

const USER_SESSION = {
  user: {
    id: "user-id",
    createdAt: new Date(),
    updatedAt: new Date(),
    email: "user@example.com",
    emailVerified: true,
    name: "Regular User",
    role: "user",
    image: null,
    banned: null,
  },
  session: {
    id: "sess_user",
    token: "tok_user",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "user-id",
    expiresAt: new Date(),
  },
};

const MOCK_USERS = [
  {
    id: "u1",
    name: "Alice Smith",
    email: "alice@example.com",
    role: "user",
    banned: false,
    emailVerified: true,
    createdAt: new Date("2025-09-16"),
  },
  {
    id: "u2",
    name: "Bob Jones",
    email: "bob@example.com",
    role: "admin",
    banned: false,
    emailVerified: false,
    createdAt: new Date("2025-09-16"),
  },
];

// ─── Admin access ──────────────────────────────────────────────────────────────

describe("AdminUsersPage — admin access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN_SESSION);
    mockListUsers.mockResolvedValue({ users: [] });
  });

  it("renders the users admin page for admin users", async () => {
    render(await AdminUsersPage());
    expect(screen.getByText("Users (0)")).toBeInTheDocument();
  });

  it("does NOT redirect when user has admin role", async () => {
    render(await AdminUsersPage());
    expect(redirect).not.toHaveBeenCalled();
  });

  it("renders the users table with data", async () => {
    mockListUsers.mockResolvedValue({ users: MOCK_USERS });
    render(await AdminUsersPage());
    expect(screen.getByText("Users (2)")).toBeInTheDocument();
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("Bob Jones")).toBeInTheDocument();
    expect(
      screen.getByText("Manage user accounts, roles, and permissions"),
    ).toBeInTheDocument();
  });

  it("renders 'Back to Home' link", async () => {
    render(await AdminUsersPage());
    const link = screen.getByRole("link", { name: /back to home/i });
    expect(link).toHaveAttribute("href", "/");
  });
});

// ─── Non-admin redirect ────────────────────────────────────────────────────────

describe("AdminUsersPage — non-admin redirect", () => {
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
    mockRequireRole.mockImplementation((role, redirectTo) => {
      if (role === "admin") {
        redirect(redirectTo);
      }
      return USER_SESSION;
    });
    await expect(AdminUsersPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /dashboard when session is null", async () => {
    mockRequireRole.mockImplementation((_role, redirectTo) => {
      redirect(redirectTo);
    });
    await expect(AdminUsersPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
