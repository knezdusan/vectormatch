import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET, type OpenAIDiagnosticResponse } from "./route";

vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: {
    embedding: vi.fn(() => "mocked-embedding-model"),
  },
}));

vi.mock("ai", () => ({
  embedMany: vi.fn(),
}));

import { embedMany } from "ai";
import { auth } from "@/lib/auth";

const mockedGetSession = vi.mocked(auth.api.getSession);
const mockedEmbedMany = vi.mocked(embedMany);

describe("GET /api/admin/diagnostic/openai", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  afterAll(() => {
    process.env.OPENAI_API_KEY = originalKey;
  });

  it("returns 401 for an unauthenticated request", async () => {
    mockedGetSession.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 401 for a non-admin user", async () => {
    mockedGetSession.mockResolvedValue({
      user: { role: "user" },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("reports key as missing when OPENAI_API_KEY is unset", async () => {
    mockedGetSession.mockResolvedValue({
      user: { role: "admin" },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);

    const response = await GET();
    const body = (await response.json()) as OpenAIDiagnosticResponse;

    expect(body.present).toBe(false);
    expect(body.prefix).toBe("");
    expect(body.wellFormed).toBe(false);
    expect(body.testCall.success).toBe(false);
  });

  it("reports success when the key is present and the test call works", async () => {
    process.env.OPENAI_API_KEY = "sk-test1234567890";
    mockedGetSession.mockResolvedValue({
      user: { role: "admin" },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);
    mockedEmbedMany.mockResolvedValue({
      embeddings: [new Array(1536).fill(0.1)],
    } as Awaited<ReturnType<typeof embedMany>>);

    const response = await GET();
    const body = (await response.json()) as OpenAIDiagnosticResponse;

    expect(body.present).toBe(true);
    expect(body.prefix).toBe("sk-test");
    expect(body.wellFormed).toBe(true);
    expect(body.testCall.success).toBe(true);
    expect(mockedEmbedMany).toHaveBeenCalledWith({
      model: "mocked-embedding-model",
      values: ["diagnostic ping"],
    });
  });

  it("reports the error message when the test call fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test1234567890";
    mockedGetSession.mockResolvedValue({
      user: { role: "admin" },
    } as Awaited<ReturnType<typeof auth.api.getSession>>);
    mockedEmbedMany.mockRejectedValue(new Error("Invalid API key"));

    const response = await GET();
    const body = (await response.json()) as OpenAIDiagnosticResponse;

    expect(body.present).toBe(true);
    expect(body.wellFormed).toBe(true);
    expect(body.testCall.success).toBe(false);
    expect(body.testCall.error).toBe("Invalid API key");
  });
});
