/**
 * Unit tests for the /dashboard smart redirect page.
 *
 * The page checks isOnboarded and redirects:
 *   - No session → /auth?tab=signin
 *   - isOnboarded=true → /dashboard/jobs
 *   - isOnboarded=false (or no applicant row) → /dashboard/profile-management
 */

import { redirect } from "next/navigation";
import Dashboard from "@/app/dashboard/page";

// Mock next/navigation redirect
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));

// Mock auth session
vi.mock("@/lib/auth", () => ({
  getAuthSession: vi.fn(),
}));

// Mock DB
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
  },
}));

import { getAuthSession } from "@/lib/auth";

describe("Dashboard page (smart redirect)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth when no session", async () => {
    vi.mocked(getAuthSession).mockResolvedValue(null);

    await expect(Dashboard()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/auth?tab=signin");
  });

  it("redirects to /dashboard/profile-management when not onboarded", async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      user: { id: "user-123", email: "test@test.com" },
      session: { id: "session-123" },
    } as never);

    // DB mock returns no applicant row (not onboarded)
    const { db } = await import("@/db/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    } as never);

    await expect(Dashboard()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard/profile-management");
  });

  it("redirects to /dashboard/jobs when onboarded", async () => {
    vi.mocked(getAuthSession).mockResolvedValue({
      user: { id: "user-123", email: "test@test.com" },
      session: { id: "session-123" },
    } as never);

    // DB mock returns applicant with isOnboarded=true
    const { db } = await import("@/db/db");
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{ isOnboarded: true }]),
        })),
      })),
    } as never);

    await expect(Dashboard()).rejects.toThrow("REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard/jobs");
  });
});
