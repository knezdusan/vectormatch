// Tests for subscription health monitoring
// src/lib/subscriptions/__tests__/health.test.ts
//
// Tests the health check logic with mocked OpenAI/Resend API calls.
// Does NOT make real API calls — all external dependencies are mocked.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@ai-sdk/openai", () => ({
  openai: {
    embedding: vi.fn(() => "mocked-embedding-model"),
  },
}));

vi.mock("ai", () => ({
  embedMany: vi.fn(),
}));

// Mock next/cache so "use cache" works in tests
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { embedMany } from "ai";
import { getSubscriptionHealth, hasUnhealthySubscription } from "../health";

const mockedEmbedMany = vi.mocked(embedMany);

describe("subscription health monitoring", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    // Clear all relevant env vars
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESEND_API_KEY;
    delete process.env.BRAVE_SEARCH_API_KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GITHUB_CLIENT_ID;
    delete process.env.GITHUB_CLIENT_SECRET;
  });

  afterAll(() => {
    process.env = { ...originalEnv };
  });

  describe("getSubscriptionHealth", () => {
    it("returns critical for OpenAI when API key is missing", async () => {
      const results = await getSubscriptionHealth();
      const openaiResult = results.find((r) => r.service === "openai");

      expect(openaiResult).toBeDefined();
      expect(openaiResult?.status).toBe("critical");
      expect(openaiResult?.keyPresent).toBe(false);
      expect(openaiResult?.impact).toBe("critical");
      expect(openaiResult?.message).toContain("OPENAI_API_KEY");
    });

    it("returns critical for OpenAI when API call fails with billing error", async () => {
      process.env.OPENAI_API_KEY = "sk-test1234567890";
      mockedEmbedMany.mockRejectedValue(
        new Error("You have no credits remaining."),
      );

      const results = await getSubscriptionHealth();
      const openaiResult = results.find((r) => r.service === "openai");

      expect(openaiResult?.status).toBe("critical");
      expect(openaiResult?.keyPresent).toBe(true);
      expect(openaiResult?.pinged).toBe(true);
      expect(openaiResult?.message).toContain("Billing/credits");
    });

    it("returns healthy for OpenAI when API call succeeds", async () => {
      process.env.OPENAI_API_KEY = "sk-test1234567890";
      mockedEmbedMany.mockResolvedValue({
        embeddings: [new Array(1536).fill(0.1)],
      } as Awaited<ReturnType<typeof embedMany>>);

      const results = await getSubscriptionHealth();
      const openaiResult = results.find((r) => r.service === "openai");

      expect(openaiResult?.status).toBe("healthy");
      expect(openaiResult?.keyPresent).toBe(true);
      expect(openaiResult?.pinged).toBe(true);
      expect(openaiResult?.keyPrefix).toBe("sk-test");
    });

    it("returns critical for OpenAI on generic API error", async () => {
      process.env.OPENAI_API_KEY = "sk-test1234567890";
      mockedEmbedMany.mockRejectedValue(new Error("Network timeout"));

      const results = await getSubscriptionHealth();
      const openaiResult = results.find((r) => r.service === "openai");

      expect(openaiResult?.status).toBe("critical");
      expect(openaiResult?.message).toContain("Network timeout");
      expect(openaiResult?.message).not.toContain("Billing");
    });

    it("returns critical for Resend when API key is missing", async () => {
      const results = await getSubscriptionHealth();
      const resendResult = results.find((r) => r.service === "resend");

      expect(resendResult?.status).toBe("critical");
      expect(resendResult?.keyPresent).toBe(false);
      expect(resendResult?.impact).toBe("critical");
      expect(resendResult?.message).toContain("RESEND_API_KEY");
    });

    it("returns medium impact for Brave Search", async () => {
      process.env.BRAVE_SEARCH_API_KEY = "BSA-test-key";
      const results = await getSubscriptionHealth();
      const braveResult = results.find((r) => r.service === "brave-search");

      expect(braveResult?.impact).toBe("medium");
      expect(braveResult?.status).toBe("healthy");
      expect(braveResult?.pinged).toBe(false);
    });

    it("returns critical for Brave Search when key is missing", async () => {
      const results = await getSubscriptionHealth();
      const braveResult = results.find((r) => r.service === "brave-search");

      expect(braveResult?.status).toBe("critical");
      expect(braveResult?.impact).toBe("medium");
    });

    it("returns healthy for Google OAuth when credentials are present", async () => {
      process.env.GOOGLE_CLIENT_ID = "1234567890.apps.googleusercontent.com";
      process.env.GOOGLE_CLIENT_SECRET = "secret";

      const results = await getSubscriptionHealth();
      const googleResult = results.find((r) => r.service === "google-oauth");

      expect(googleResult?.status).toBe("healthy");
      expect(googleResult?.pinged).toBe(false);
    });

    it("returns critical for Google OAuth when credentials are missing", async () => {
      const results = await getSubscriptionHealth();
      const googleResult = results.find((r) => r.service === "google-oauth");

      expect(googleResult?.status).toBe("critical");
      expect(googleResult?.impact).toBe("medium");
    });

    it("returns healthy for GitHub OAuth when credentials are present", async () => {
      process.env.GITHUB_CLIENT_ID = "gh-client-id";
      process.env.GITHUB_CLIENT_SECRET = "gh-secret";

      const results = await getSubscriptionHealth();
      const githubResult = results.find((r) => r.service === "github-oauth");

      expect(githubResult?.status).toBe("healthy");
    });

    it("returns all 5 services", async () => {
      const results = await getSubscriptionHealth();
      expect(results).toHaveLength(5);
      const services = results.map((r) => r.service);
      expect(services).toContain("openai");
      expect(services).toContain("resend");
      expect(services).toContain("brave-search");
      expect(services).toContain("google-oauth");
      expect(services).toContain("github-oauth");
    });
  });

  describe("hasUnhealthySubscription", () => {
    it("returns true when any critical service is unhealthy", async () => {
      // No env vars set — OpenAI and Resend will be critical
      const result = await hasUnhealthySubscription();
      expect(result).toBe(true);
    });

    it("returns false when all critical services are healthy", async () => {
      process.env.OPENAI_API_KEY = "sk-test1234567890";
      process.env.RESEND_API_KEY = "re_test_key";
      mockedEmbedMany.mockResolvedValue({
        embeddings: [new Array(1536).fill(0.1)],
      } as Awaited<ReturnType<typeof embedMany>>);

      // Mock Resend fetch
      const fetchMock = vi.fn().mockResolvedValue(
        new Response("[]", { status: 200 }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await hasUnhealthySubscription();
      expect(result).toBe(false);

      vi.unstubAllGlobals();
    });
  });
});
