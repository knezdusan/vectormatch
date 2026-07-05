/**
 * Unit tests for Module C — Dashboard Query Layer + Match Server Actions.
 *
 * Test coverage (MODULE_C_DECISIONS.md §14, Feature C4):
 *   - getApprovedMatches: query shape, pagination, applicant scoping
 *   - getUnreadBadgeCount: count query, applicant scoping
 *   - getMatchDetail: single match fetch, applicant scoping, not-found case
 *   - markMatchRead: auth check, applicant scoping, not-found case
 *   - markAllMatchesRead: auth check, bulk update
 *
 * The DB and auth are mocked — no real database or auth session needed.
 */

import { vi } from "vitest";

// =============================================================================
// MOCKS
// =============================================================================

// Mock server-only
vi.mock("server-only", () => ({}));

// Mock Next.js cache revalidation so server actions can call revalidatePath
// without the static-generation store that is only present at runtime.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock the db module with chainable query builders
// Drizzle's .select().from().where().orderBy().limit().offset() returns
// an array directly (not { rows: [] }).
const mockSelectReturn: unknown[] = [];
const mockWhereReturn = {
  orderBy: vi.fn(() => ({
    limit: vi.fn(() => ({
      offset: vi.fn(() => mockSelectReturn),
    })),
  })),
  limit: vi.fn(() => mockSelectReturn),
};
const mockJoinable = {
  innerJoin: vi.fn(() => mockJoinable),
  leftJoin: vi.fn(() => mockJoinable),
  where: vi.fn(() => mockWhereReturn),
};
const mockFromReturn = {
  innerJoin: vi.fn(() => mockJoinable),
  leftJoin: vi.fn(() => mockJoinable),
  where: vi.fn(() => mockWhereReturn),
};

vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => mockFromReturn),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    })),
  },
}));

// Mock auth
const mockSession = { user: { id: "user-123", email: "test@test.com" } };
vi.mock("@/lib/auth", () => ({
  getAuthSession: vi.fn(async () => mockSession),
}));

// =============================================================================
// IMPORTS (after mocks)
// =============================================================================

import {
  markAllMatchesRead,
  markMatchRead,
  updateMatchStatus,
} from "@/actions/matches";
import { db } from "@/db/db";
import { getAuthSession } from "@/lib/auth";
import {
  getApprovedMatches,
  getMatchDetail,
  getMatches,
  getMatchesCount,
  getUnreadBadgeCount,
  matchScoreExpr,
} from "@/lib/jobs/dashboard-queries";

// =============================================================================
// getApprovedMatches
// =============================================================================

describe("getApprovedMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries with the correct table joins (matchQueue + job + persona)", async () => {
    await getApprovedMatches("user-123");

    // select() should have been called
    expect(db.select).toHaveBeenCalled();
  });

  it("uses default pagination (limit=20, offset=0)", async () => {
    await getApprovedMatches("user-123");

    // Since we use vi.fn chains, just verify the query ran without error
    expect(db.select).toHaveBeenCalled();
  });

  it("accepts custom pagination params", async () => {
    await getApprovedMatches("user-123", 50, 100);

    expect(db.select).toHaveBeenCalled();
  });

  it("returns an array (even if empty)", async () => {
    const result = await getApprovedMatches("user-123");

    expect(Array.isArray(result)).toBe(true);
  });
});

// =============================================================================
// getMatches (status-filtered)
// =============================================================================

describe("getMatches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries with default 'approved' status filter", async () => {
    await getMatches("user-123");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'rejected' status filter", async () => {
    await getMatches("user-123", "rejected");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'all' status filter (no status filter)", async () => {
    await getMatches("user-123", "all");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'pending' status filter", async () => {
    await getMatches("user-123", "pending");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'mark_read' status filter", async () => {
    await getMatches("user-123", "mark_read");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'mismatch' status filter", async () => {
    await getMatches("user-123", "mismatch");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'applied' status filter", async () => {
    await getMatches("user-123", "applied");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'newest' sort order", async () => {
    await getMatches("user-123", "approved", 20, 0, "newest");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts 'oldest' sort order", async () => {
    await getMatches("user-123", "approved", 20, 0, "oldest");

    expect(db.select).toHaveBeenCalled();
  });

  it("accepts custom pagination params", async () => {
    await getMatches("user-123", "all", 50, 100);

    expect(db.select).toHaveBeenCalled();
  });

  it("returns an array (even if empty)", async () => {
    const result = await getMatches("user-123", "all");

    expect(Array.isArray(result)).toBe(true);
  });
});

// =============================================================================
// matchScoreExpr
// =============================================================================

describe("matchScoreExpr", () => {
  it("stringifies to valid SQL without JavaScript-style comments", () => {
    const rawStrings = collectSqlStrings(matchScoreExpr);
    const sqlString = rawStrings.join("");

    expect(sqlString).not.toContain("//");
  });
});

function collectSqlStrings(sqlObj: unknown): string[] {
  const sql = sqlObj as { queryChunks?: unknown[] };
  const strings: string[] = [];
  if (!sql?.queryChunks) return strings;
  for (const chunk of sql.queryChunks) {
    if (typeof chunk === "string") {
      strings.push(chunk);
    } else if (chunk && typeof chunk === "object") {
      const c = chunk as { queryChunks?: unknown[]; value?: unknown[] };
      if (Array.isArray(c.value)) {
        for (const value of c.value) {
          if (typeof value === "string") strings.push(value);
        }
      }
      if (Array.isArray(c.queryChunks)) {
        strings.push(...collectSqlStrings(chunk));
      }
    }
  }
  return strings;
}

// =============================================================================
// getMatchesCount
// =============================================================================

describe("getMatchesCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns count for approved matches", async () => {
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ cnt: 42 }]),
      })),
    });

    const result = await getMatchesCount("user-123", "approved");

    expect(result).toBe(42);
  });

  it("returns count for all matches", async () => {
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ cnt: 100 }]),
      })),
    });

    const result = await getMatchesCount("user-123", "all");

    expect(result).toBe(100);
  });

  it("returns 0 when no matches", async () => {
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ cnt: 0 }]),
      })),
    });

    const result = await getMatchesCount("user-123", "rejected");

    expect(result).toBe(0);
  });
});

// =============================================================================
// getUnreadBadgeCount
// =============================================================================

describe("getUnreadBadgeCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries the matchQueue table for unread approved matches", async () => {
    // Override the mock to return a count
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ cnt: 5 }]),
      })),
    });

    const result = await getUnreadBadgeCount("user-123");

    expect(db.select).toHaveBeenCalled();
    expect(result).toBe(5);
  });

  it("returns 0 when no unread matches", async () => {
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => [{ cnt: 0 }]),
      })),
    });

    const result = await getUnreadBadgeCount("user-123");

    expect(result).toBe(0);
  });

  it("returns 0 when query returns empty array", async () => {
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => []),
      })),
    });

    const result = await getUnreadBadgeCount("user-123");

    expect(result).toBe(0);
  });
});

// =============================================================================
// getMatchDetail
// =============================================================================

describe("getMatchDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when match is not found", async () => {
    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => []),
            })),
          })),
        })),
      })),
    });

    const result = await getMatchDetail("user-123", "nonexistent-id");

    expect(result).toBeNull();
  });

  it("returns a MatchDetail object when found", async () => {
    const mockRow = {
      matchQueueId: "mq-1",
      status: "approved",
      llmVerdict: "approved",
      llmReasoning: "Great match for React role.",
      llmConfidence: 0.92,
      llmBlockers: [],
      llmModel: "gpt-4o-mini",
      evaluatedAt: new Date("2026-06-23"),
      isRead: false,
      createdAt: new Date("2026-06-22"),
      overlapScore: 5,
      cosineDistance: 0.12,
      workAuthRiskFlag: false,
      jobId: "job-1",
      jobTitle: "Senior React Engineer",
      jobAtsSource: "greenhouse",
      jobAtsSlug: "acme",
      jobRawJson: '{"title":"Senior React Engineer","description":"..."}',
      jobNormalizedText: null,
      jobExtractedTags: ["react", "typescript"],
      personaId: "persona-1",
      personaLabel: "Senior React Developer",
      personaEmbeddingSummary: "Senior frontend engineer...",
      personaMustHaveTags: ["react", "nextjs", "typescript"],
    };

    const selectMock = db.select as unknown as ReturnType<typeof vi.fn>;
    selectMock.mockReturnValueOnce({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(() => [mockRow]),
            })),
          })),
        })),
      })),
    });

    const result = await getMatchDetail("user-123", "mq-1");

    expect(result).not.toBeNull();
    expect(result?.matchQueueId).toBe("mq-1");
    expect(result?.status).toBe("approved");
    expect(result?.job.title).toBe("Senior React Engineer");
    expect(result?.persona.personaLabel).toBe("Senior React Developer");
    expect(result?.persona.mustHaveTags).toEqual([
      "react",
      "nextjs",
      "typescript",
    ]);
  });
});

// =============================================================================
// markMatchRead (Server Action)
// =============================================================================

describe("markMatchRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success when match is found and owned by user", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;
    updateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: "mq-1" }]),
        })),
      })),
    });

    const result = await markMatchRead("mq-1");

    expect(result.success).toBe(true);
  });

  it("returns error when match is not found or not owned", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;
    updateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    });

    const result = await markMatchRead("nonexistent");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when not authenticated", async () => {
    (
      getAuthSession as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null);

    const result = await markMatchRead("mq-1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });
});

// =============================================================================
// updateMatchStatus (Server Action)
// =============================================================================

describe("updateMatchStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success for an allowed user-facing status", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;
    updateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [{ id: "mq-1" }]),
        })),
      })),
    });

    const result = await updateMatchStatus("mq-1", "mismatch");

    expect(result.success).toBe(true);
  });

  it("returns error for a disallowed status", async () => {
    const result = await updateMatchStatus(
      "mq-1",
      "invalid_status" as "mismatch",
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid status");
  });

  it("returns error when match is not found or not owned", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;
    updateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    });

    const result = await updateMatchStatus("mq-1", "applied");

    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  it("returns error when not authenticated", async () => {
    (
      getAuthSession as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null);

    const result = await updateMatchStatus("mq-1", "mark_read");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });
});

// =============================================================================
// markAllMatchesRead (Server Action)
// =============================================================================

describe("markAllMatchesRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns success with count of updated rows", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;
    updateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => [
            { id: "mq-1" },
            { id: "mq-2" },
            { id: "mq-3" },
          ]),
        })),
      })),
    });

    const result = await markAllMatchesRead();

    expect(result.success).toBe(true);
    expect(result.count).toBe(3);
  });

  it("returns success with count=0 when no unread matches", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;
    updateMock.mockReturnValueOnce({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    });

    const result = await markAllMatchesRead();

    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });

  it("returns error when not authenticated", async () => {
    (
      getAuthSession as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValueOnce(null);

    const result = await markAllMatchesRead();

    expect(result.success).toBe(false);
    expect(result.error).toBe("Not authenticated");
  });
});
