/**
 * Unit tests for profile editing Server Actions.
 *
 * Current coverage:
 *   - updateApplicantPreferencesAction validation and success path
 *
 * Mock strategy:
 *   - Mock @/lib/auth to control the session.
 *   - Mock @/db/db to capture the update call.
 */

import { updateApplicantPreferencesAction } from "@/actions/profile";

const { mockGetAuthSession, mockUpdateCalls } = vi.hoisted(() => ({
  mockGetAuthSession: vi.fn(),
  mockUpdateCalls: [] as { set: unknown; where: unknown }[],
}));

vi.mock("@/lib/auth", () => ({
  getAuthSession: () => mockGetAuthSession(),
}));

vi.mock("@/db/db", () => ({
  db: {
    update: () => ({
      set: (setValues: unknown) => ({
        where: (whereValue: unknown) => {
          mockUpdateCalls.push({ set: setValues, where: whereValue });
          return Promise.resolve();
        },
      }),
    }),
  },
}));

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

function makePreferencesFormData(payload: unknown) {
  const formData = new FormData();
  formData.set("payload", JSON.stringify(payload));
  return formData;
}

describe("updateApplicantPreferencesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateCalls.length = 0;
    mockGetAuthSession.mockResolvedValue(SESSION);
  });

  it("returns an error when not authenticated", async () => {
    mockGetAuthSession.mockResolvedValue(null);
    const result = await updateApplicantPreferencesAction(
      null,
      makePreferencesFormData({}),
    );
    expect(result).toEqual({ error: "Not authenticated", success: false });
  });

  it("returns an error for invalid payload", async () => {
    const result = await updateApplicantPreferencesAction(
      null,
      makePreferencesFormData({ country: "USA" }),
    );
    expect(result?.success).toBe(false);
    expect(result?.error).toBeTruthy();
  });

  it("updates the applicant row when payload is valid", async () => {
    const payload = {
      country: "RS",
      canWorkUsHours: true,
      assignmentTypes: ["remote"],
      modalities: ["contract"],
      preferredCompliance: ["b2b"],
    };

    const result = await updateApplicantPreferencesAction(
      null,
      makePreferencesFormData(payload),
    );

    expect(result).toEqual({ error: null, success: true });
    expect(mockUpdateCalls).toHaveLength(1);
    expect(mockUpdateCalls[0]?.set).toMatchObject({
      country: "RS",
      canWorkUsHours: true,
      assignmentTypes: ["remote"],
      modalities: ["contract"],
      preferredCompliance: ["b2b"],
    });
  });
});
