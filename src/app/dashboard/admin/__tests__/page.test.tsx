/**
 * Unit tests for the /dashboard/admin page.
 *
 * Verifies that the admin page is accessible only to users with the "admin" role
 * and redirects non-admin users to /dashboard. Also verifies that the landing
 * card for Users renders correctly.
 *
 * Mock strategy:
 *   - Mock @/lib/auth so we can control what requireRole returns.
 *   - redirect() is already mocked globally in vitest.setup.ts.
 */

import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import AdminPage from "@/app/dashboard/admin/page";

// --- Hoisted mock refs ---

const { mockRequireRole } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      listUsers: vi.fn().mockResolvedValue({ users: [] }),
    },
  },
  requireRole: async (role: string, redirectTo = "/dashboard") => {
    return mockRequireRole(role, redirectTo);
  },
}));

// Mock the admin dashboard components that make DB calls (Sprint 4 Tasks 5, 6, 8)
// + new dashboard components added in the redesign.
vi.mock("@/components/admin/AlertsPanel", () => ({
  AlertsPanel: () => null,
}));
vi.mock("@/components/admin/AdminDashboardTabs", () => ({
  AdminDashboardTabs: () => <div data-testid="admin-dashboard-tabs" />,
}));
vi.mock("@/components/admin/AdminOverview", () => ({
  AdminOverview: () => null,
}));
vi.mock("@/components/admin/InfrastructureHealth", () => ({
  InfrastructureHealth: () => null,
}));
vi.mock("@/components/admin/IngestionAnalytics", () => ({
  IngestionAnalytics: () => null,
}));
vi.mock("@/components/admin/MatchingFunnel", () => ({
  MatchingFunnel: () => null,
}));
vi.mock("@/components/admin/PipelineStatus", () => ({
  PipelineStatus: () => null,
}));
vi.mock("@/components/admin/RecentAlerts", () => ({
  RecentAlerts: () => null,
}));

// --- Helpers ---

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

// --- Admin access ---

describe("AdminPage — admin access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireRole.mockResolvedValue(ADMIN_SESSION);
  });

  it("renders the admin landing page for admin users", async () => {
    render(await AdminPage());
    expect(screen.getByText("Users")).toBeInTheDocument();
  });

  it("does NOT redirect when user has admin role", async () => {
    render(await AdminPage());
    expect(redirect).not.toHaveBeenCalled();
  });

  it("renders Users card with description", async () => {
    render(await AdminPage());
    expect(
      screen.getByText("Manage user accounts, roles, and permissions"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "View, ban, unban, impersonate, and delete user accounts.",
      ),
    ).toBeInTheDocument();
  });

  it("renders 'Back to Home' link", async () => {
    render(await AdminPage());
    const link = screen.getByRole("link", { name: /back to home/i });
    expect(link).toHaveAttribute("href", "/");
  });

  it("links Users card to /dashboard/admin/users", async () => {
    render(await AdminPage());
    const usersCard = screen.getByRole("link", { name: /users/i });
    expect(usersCard).toHaveAttribute("href", "/dashboard/admin/users");
  });
});

// --- Non-admin redirect ---

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
    mockRequireRole.mockImplementation((role, redirectTo) => {
      if (role === "admin") {
        redirect(redirectTo);
      }
      return USER_SESSION;
    });
    await expect(AdminPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("redirects to /dashboard when session is null", async () => {
    mockRequireRole.mockImplementation((_role, redirectTo) => {
      redirect(redirectTo);
    });
    await expect(AdminPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
