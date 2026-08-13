// Tests for subscription recheck server action
// src/actions/__tests__/subscriptions.test.ts

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthSession: vi.fn(),
}));

import { revalidateTag } from "next/cache";
import { getAuthSession } from "@/lib/auth";
import { recheckSubscriptions } from "../subscriptions";

const mockedGetSession = vi.mocked(getAuthSession);
const mockedRevalidateTag = vi.mocked(revalidateTag);

describe("recheckSubscriptions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns success=false for unauthenticated user", async () => {
    mockedGetSession.mockResolvedValue(null);

    const result = await recheckSubscriptions();

    expect(result.success).toBe(false);
    expect(mockedRevalidateTag).not.toHaveBeenCalled();
  });

  it("returns success=false for non-admin user", async () => {
    mockedGetSession.mockResolvedValue({
      user: { id: "u1", role: "user" },
    } as Awaited<ReturnType<typeof getAuthSession>>);

    const result = await recheckSubscriptions();

    expect(result.success).toBe(false);
    expect(mockedRevalidateTag).not.toHaveBeenCalled();
  });

  it("busts cache and returns success=true for admin user", async () => {
    mockedGetSession.mockResolvedValue({
      user: { id: "u1", role: "admin" },
    } as Awaited<ReturnType<typeof getAuthSession>>);

    const result = await recheckSubscriptions();

    expect(result.success).toBe(true);
    expect(mockedRevalidateTag).toHaveBeenCalledWith(
      "subscription-health",
      "max",
    );
  });
});
