/**
 * Unit tests for the /dashboard/profile-management page.
 *
 * Verifies the 3-state onboarding state machine renders the correct
 * presentation based on applicant.isOnboarded and cvUpload existence.
 *
 * Mock strategy:
 *   - Mock @/lib/auth to control the session.
 *   - Mock @/db/db with a mutable ref that returns controlled query results.
 *   - redirect() is already mocked globally in vitest.setup.ts.
 *   - The three presentation components are mocked to simple stubs so we can
 *     assert which one was rendered without depending on their internals.
 *
 * Covers the test plan from MODULE_A_IMPLEMENTATION_HANDOFF.md §10.
 */

import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";

import ProfileManagementPage from "@/app/dashboard/profile-management/page";

// ─── Hoisted mock refs ────────────────────────────────────────────────────────

// The db mock ref holds the current "queue" of result arrays. Each db.select()
// call pops the next array from the queue. This lets us control the sequence of
// queries the page makes (applicant first, then cvUpload or persona/history/tags).
const { mockGetAuthSession, dbMockRef } = vi.hoisted(() => ({
  mockGetAuthSession: vi.fn(),
  dbMockRef: { resultQueues: [] as unknown[][] },
}));

vi.mock("@/lib/auth", () => ({
  getAuthSession: () => mockGetAuthSession(),
}));

// Mock the db module. The factory runs once at import time (hoisted), so we
// return a stable object that reads from the mutable dbMockRef.
vi.mock("@/db/db", () => ({
  db: {
    select: () => {
      const rows = dbMockRef.resultQueues.shift() ?? [];
      // Build a chainable that resolves to `rows` regardless of the query
      // builder methods called (.from().where().orderBy().limit() etc).
      // The chain is a Promise so `await` works at any point in the chain.
      const chain = Promise.resolve(rows) as Promise<unknown[]> & {
        from: () => typeof chain;
        where: () => typeof chain;
        orderBy: () => typeof chain;
        limit: () => Promise<unknown[]>;
      };
      chain.from = () => chain;
      chain.where = () => chain;
      chain.orderBy = () => chain;
      chain.limit = () => Promise.resolve(rows);
      return chain;
    },
    transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
  },
}));

// Mock the three presentation components as simple identifiable stubs.
vi.mock("@/components/onboarding/CvUploadForm", () => ({
  CvUploadForm: () => (
    <div data-testid="state-1-cv-upload-form">CV Upload Form</div>
  ),
}));
vi.mock("@/components/onboarding/OnboardingReview", () => ({
  OnboardingReview: () => (
    <div data-testid="state-2-onboarding-review">Onboarding Review</div>
  ),
}));
vi.mock("@/components/onboarding/ProfileManagement", () => ({
  ProfileManagement: () => (
    <div data-testid="state-3-profile-management">Profile Management</div>
  ),
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

/**
 * Configure the db mock to return the given result arrays in order.
 * The page's queries run in this order:
 *   1. applicant select (always)
 *   2a. [State 3] persona, workingHistory, tagsExperience (Promise.all)
 *   2b. [State 1/2] cvUpload select
 */
function setDbResults(...queues: unknown[][]) {
  dbMockRef.resultQueues = [...queues];
}

// ─── State 1: no applicant, no cvUpload → CV upload form ─────────────────────

describe("ProfileManagementPage — State 1 (CV upload form)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthSession.mockResolvedValue(SESSION);
    // Query 1: applicant → empty. Query 2: cvUpload → empty.
    setDbResults([], []);
  });

  it("renders the CV upload form when not onboarded and no cvUpload", async () => {
    render(await ProfileManagementPage());
    expect(screen.getByTestId("state-1-cv-upload-form")).toBeInTheDocument();
  });
});

// ─── State 2: not onboarded, valid cvUpload → onboarding review ──────────────

describe("ProfileManagementPage — State 2 (onboarding review)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthSession.mockResolvedValue(SESSION);
    // Query 1: applicant → not onboarded. Query 2: cvUpload → valid.
    setDbResults(
      [{ userId: "user-1", isOnboarded: false }],
      [
        {
          id: "cv-1",
          status: "valid",
          extractedJson: { roles: [] },
        },
      ],
    );
  });

  it("renders the onboarding review when a valid cvUpload exists", async () => {
    render(await ProfileManagementPage());
    expect(screen.getByTestId("state-2-onboarding-review")).toBeInTheDocument();
  });
});

// ─── State 3: onboarded → profile management ─────────────────────────────────

describe("ProfileManagementPage — State 3 (profile management)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthSession.mockResolvedValue(SESSION);
    // Query 1: applicant → onboarded.
    // Then Promise.all: persona, workingHistory, tagsExperience.
    setDbResults(
      [{ userId: "user-1", isOnboarded: true }],
      [{ id: "p1", personaLabel: "React Dev" }],
      [{ id: "wh1", role: "Dev" }],
      [{ id: "te1", canonicalTag: "react" }],
    );
  });

  it("renders profile management when isOnboarded is true", async () => {
    render(await ProfileManagementPage());
    expect(
      screen.getByTestId("state-3-profile-management"),
    ).toBeInTheDocument();
  });
});

// ─── Unauthenticated → redirect ──────────────────────────────────────────────

describe("ProfileManagementPage — unauthenticated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthSession.mockResolvedValue(null);
    vi.mocked(redirect).mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  afterEach(() => {
    vi.mocked(redirect).mockReset();
  });

  it("redirects to /auth when not authenticated", async () => {
    await expect(ProfileManagementPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(
      "/auth?callbackUrl=%2Fdashboard%2Fprofile-management",
    );
  });
});
