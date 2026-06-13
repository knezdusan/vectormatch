/**
 * Component tests for the DashboardSidebar.
 *
 * Covers:
 *   - Logo presence in header
 *   - Navigation items (Account, CV, Jobs, conditional Admin)
 *   - Footer user info (avatar, name, email)
 *   - Sign Out button styling
 *   - Responsive collapse behaviour
 */

import { render, screen } from "@testing-library/react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

// ─── Hoisted mock refs ─────────────────────────────────────────────────────────

const { mockIsMobile } = vi.hoisted(() => ({
  mockIsMobile: vi.fn(() => false),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mockIsMobile(),
}));

vi.mock("@/actions/auth", () => ({
  signOutAction: vi.fn(),
}));

vi.mock("@/components/public/home/Logo", () => ({
  Logo: ({ className }: { className?: string }) => (
    <div data-testid="logo" className={className}>
      Logo
    </div>
  ),
}));

vi.mock("@/components/public/home/icons", () => ({
  BrandGlyph: (props: React.ComponentProps<"svg">) => (
    <svg data-testid="brand-glyph" {...props} />
  ),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

const USER_SESSION = {
  user: {
    name: "Alice Smith",
    email: "alice@example.com",
    role: "user",
    image: null,
  },
};

const ADMIN_SESSION = {
  user: {
    name: "Admin User",
    email: "admin@example.com",
    role: "admin",
    image: null,
  },
};

function renderSidebar(session: typeof USER_SESSION, _pathname = "/dashboard") {
  // Override usePathname for active-state tests if needed.
  // The global vitest.setup.ts returns "/" by default.
  return render(
    <TooltipProvider>
      <DashboardSidebar session={session}>
        <div data-testid="page-content">Page Content</div>
      </DashboardSidebar>
    </TooltipProvider>,
  );
}

// ─── Desktop (expanded) ──────────────────────────────────────────────────────

describe("DashboardSidebar — desktop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile.mockReturnValue(false);
  });

  it("renders the logo in the header", () => {
    renderSidebar(USER_SESSION);
    expect(screen.getByTestId("logo")).toBeInTheDocument();
  });

  it("renders Account, CV, and Jobs nav items", () => {
    renderSidebar(USER_SESSION);
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("CV")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
  });

  it("does NOT render Admin link for non-admin users", () => {
    renderSidebar(USER_SESSION);
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("renders Admin link for admin users", () => {
    renderSidebar(ADMIN_SESSION);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("renders user avatar fallback with initials in footer", () => {
    renderSidebar(USER_SESSION);
    expect(screen.getByText("AS")).toBeInTheDocument();
  });

  it("renders user name and email in footer", () => {
    renderSidebar(USER_SESSION);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("renders the Sign Out button with btn-brand-outline class", () => {
    renderSidebar(USER_SESSION);
    const button = screen.getByRole("button", { name: /sign out/i });
    expect(button).toHaveClass("btn-brand-outline");
  });

  it("renders children inside the inset area", () => {
    renderSidebar(USER_SESSION);
    expect(screen.getByTestId("page-content")).toBeInTheDocument();
  });
});

// ─── Mobile (collapsed) ────────────────────────────────────────────────────────

describe("DashboardSidebar — mobile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsMobile.mockReturnValue(true);
  });

  it("still renders nav items (icons only)", () => {
    renderSidebar(USER_SESSION);
    // Labels may be visually hidden when collapsed, but the buttons are still
    // present in the DOM via SidebarMenuButton.
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("CV")).toBeInTheDocument();
    expect(screen.getByText("Jobs")).toBeInTheDocument();
  });

  it("renders footer user info", () => {
    renderSidebar(USER_SESSION);
    expect(screen.getByText("Alice Smith")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });
});
