/**
 * Unit tests for onboarding Server Actions.
 *
 * Current coverage:
 *   - parseCvAction rate limiting (3 parses/hour/user)
 *
 * Mock strategy:
 *   - Mock @/lib/auth to control the session.
 *   - Mock @/db/db to control the count of recent cvUpload rows and the
 *     insert/returning of a new cvUpload row.
 *   - Mock the ai SDK so a successful parse path never calls the real LLM.
 */

import { parseCvAction } from "@/actions/onboarding";

// ─── Hoisted mock refs ────────────────────────────────────────────────────────

const { mockGetAuthSession, mockSelectResult, mockInsertReturning } =
  vi.hoisted(() => ({
    mockGetAuthSession: vi.fn(),
    mockSelectResult: { parseCount: 0 },
    mockInsertReturning: [{ id: "cv-upload-1" }],
  }));

vi.mock("@/lib/auth", () => ({
  getAuthSession: () => mockGetAuthSession(),
}));

vi.mock("@/db/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () =>
          Promise.resolve([{ parseCount: mockSelectResult.parseCount }]),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => Promise.resolve(mockInsertReturning),
        onConflictDoNothing: () => ({
          // applicant upsert path
        }),
        onConflictDoUpdate: () => ({
          // finalizeOnboardingAction path
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
  },
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: (model: string) => ({ model }),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SESSION = {
  user: {
    id: "user-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    email: "alice@example.com",
    emailVerified: true,
    name: "Alice",
    role: "user",
    image: null,
    banned: null,
  },
  session: {
    id: "sess-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: "user-1",
    expiresAt: new Date(),
    token: "tok-1",
  },
};

function makeFormData(
  overrides: {
    label?: string;
    rawText?: string;
    originalFileName?: string;
  } = {},
) {
  const formData = new FormData();
  formData.set("label", overrides.label ?? "Test CV");
  formData.set(
    "rawText",
    overrides.rawText ??
      "Software engineer at Acme Inc, January 2020 to March 2024. Built customer-facing React applications with TypeScript, Next.js, and Tailwind CSS. Developed REST and GraphQL APIs using Node.js, Express, and PostgreSQL. Worked in agile teams with Git, GitHub, Jest, and CI/CD pipelines. Mentored junior developers and led code reviews. Additional skills include Docker, AWS, and Prisma.",
  );
  formData.set("originalFileName", overrides.originalFileName ?? "cv.pdf");
  return formData;
}

// ─── parseCvAction rate limiting ──────────────────────────────────────────────

describe("parseCvAction — rate limiting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthSession.mockResolvedValue(SESSION);
    mockSelectResult.parseCount = 0;
  });

  it("allows the request when the user has 0–2 parses in the last hour", async () => {
    mockSelectResult.parseCount = 2;

    const result = await parseCvAction(null, makeFormData());

    expect(result).not.toBeNull();
    if (result === null) throw new Error("Expected result");
    expect(result.error).not.toBe(
      "You have reached the 3 CV parses per hour limit. Please try again later.",
    );
  });

  it("rejects the request when the user has 3 parses in the last hour", async () => {
    mockSelectResult.parseCount = 3;

    const result = await parseCvAction(null, makeFormData());

    expect(result).not.toBeNull();
    if (result === null) throw new Error("Expected result");
    expect(result.error).toBe(
      "You have reached the 3 CV parses per hour limit. Please try again later.",
    );
    expect(result.cvUploadId).toBeNull();
    expect(result.extraction).toBeNull();
  });
});
