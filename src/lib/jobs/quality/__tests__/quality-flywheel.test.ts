/**
 * Unit tests for Q2 — Adversarial Quality Flywheel (CORPUS_EXPANSION_TDD §3.2)
 *
 * Tests the pure functions (calculateQualityScore, determineTierAction) and
 * the database recalculation function (recalculateQualityScores) with mocked db.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateQualityScore,
  determineTierAction,
  type TierAction,
} from "@/lib/jobs/quality/quality-flywheel";

// =============================================================================
// calculateQualityScore — pure function
// =============================================================================

describe("calculateQualityScore", () => {
  it("returns 0 when totalJobsProcessed is 0 (no division by zero)", () => {
    expect(calculateQualityScore(0, 0)).toBe(0);
    expect(calculateQualityScore(5, 0)).toBe(0);
  });

  it("calculates score as (approved / total) * 100", () => {
    expect(calculateQualityScore(5, 10)).toBe(50);
    expect(calculateQualityScore(3, 10)).toBe(30);
    expect(calculateQualityScore(10, 10)).toBe(100);
  });

  it("rounds to nearest integer", () => {
    expect(calculateQualityScore(1, 3)).toBe(33);
    expect(calculateQualityScore(2, 3)).toBe(67);
    expect(calculateQualityScore(1, 7)).toBe(14);
  });

  it("returns 0 when approvedMatches is 0", () => {
    expect(calculateQualityScore(0, 100)).toBe(0);
  });
});

// =============================================================================
// determineTierAction — pure function
// =============================================================================

describe("determineTierAction", () => {
  it("returns 'promote' when score > 50 AND approvedMatches > 3", () => {
    expect(determineTierAction(60, 5, 10)).toBe<TierAction>("promote");
    expect(determineTierAction(100, 10, 10)).toBe<TierAction>("promote");
    expect(determineTierAction(51, 4, 8)).toBe<TierAction>("promote");
  });

  it("does not promote when approvedMatches <= 3 even if score > 50", () => {
    expect(determineTierAction(60, 3, 5)).toBe<TierAction>("none");
    expect(determineTierAction(100, 1, 1)).toBe<TierAction>("none");
  });

  it("does not promote when score <= 50 even if approvedMatches > 3", () => {
    expect(determineTierAction(50, 5, 10)).toBe<TierAction>("none");
    expect(determineTierAction(40, 10, 25)).toBe<TierAction>("none");
  });

  it("returns 'demote' when score < 10 AND totalJobsProcessed > 20", () => {
    expect(determineTierAction(5, 1, 25)).toBe<TierAction>("demote");
    expect(determineTierAction(0, 0, 50)).toBe<TierAction>("demote");
    expect(determineTierAction(9, 2, 100)).toBe<TierAction>("demote");
  });

  it("does not demote when totalJobsProcessed <= 20 even if score < 10", () => {
    expect(determineTierAction(5, 0, 20)).toBe<TierAction>("none");
    expect(determineTierAction(0, 0, 10)).toBe<TierAction>("none");
  });

  it("does not demote when score >= 10 even if totalJobsProcessed > 20", () => {
    expect(determineTierAction(10, 2, 25)).toBe<TierAction>("none");
    expect(determineTierAction(15, 3, 50)).toBe<TierAction>("none");
  });

  it("returns 'none' for edge cases between promote and demote thresholds", () => {
    // score = 30, approved = 2, total = 10 — middle ground
    expect(determineTierAction(30, 2, 10)).toBe<TierAction>("none");
    // score = 10, approved = 0, total = 5 — too few jobs to demote
    expect(determineTierAction(10, 0, 5)).toBe<TierAction>("none");
  });
});

// =============================================================================
// recalculateQualityScores — database function (mocked)
// =============================================================================

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { recalculateQualityScores } from "@/lib/jobs/quality/quality-flywheel";

describe("recalculateQualityScores", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counts for companiesScored, promoted, demoted, and purgeCandidates", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

    // Mock 4 sequential db.execute calls:
    // 1. Upsert quality scores → rowCount: 100
    // 2. Promote to active_hot → rowCount: 5
    // 3. Demote to dormant → rowCount: 10
    // 4. Count purge candidates → rows: [{ cnt: 3 }]
    executeMock
      .mockResolvedValueOnce({ rowCount: 100 })
      .mockResolvedValueOnce({ rowCount: 5 })
      .mockResolvedValueOnce({ rowCount: 10 })
      .mockResolvedValueOnce({ rows: [{ cnt: 3 }] });

    const result = await recalculateQualityScores();

    expect(result).toEqual({
      companiesScored: 100,
      promoted: 5,
      demoted: 10,
      purgeCandidates: 3,
    });
    expect(executeMock).toHaveBeenCalledTimes(4);
  });

  it("handles null rowCount gracefully (returns 0)", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

    executeMock
      .mockResolvedValueOnce({ rowCount: null })
      .mockResolvedValueOnce({ rowCount: null })
      .mockResolvedValueOnce({ rowCount: null })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    const result = await recalculateQualityScores();

    expect(result).toEqual({
      companiesScored: 0,
      promoted: 0,
      demoted: 0,
      purgeCandidates: 0,
    });
  });

  it("upsert query joins match_queue → job → company for aggregation", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

    executeMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    await recalculateQualityScores();

    // First call is the upsert — check its SQL
    const upsertSqlObj = executeMock.mock.calls[0][0];
    const fullSql = getSqlText(upsertSqlObj);

    expect(fullSql).toContain("company_quality_score");
    expect(fullSql).toContain("match_queue");
    expect(fullSql).toContain("job");
    expect(fullSql).toContain("company");
    expect(fullSql).toContain("approved");
    expect(fullSql).toContain("ON CONFLICT");
  });

  it("promote query uses score > 50 AND approved_matches > 3 threshold", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

    executeMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    await recalculateQualityScores();

    // Second call is the promote query
    const promoteSqlObj = executeMock.mock.calls[1][0];
    const fullSql = getSqlText(promoteSqlObj);

    expect(fullSql).toContain("active_hot");
    expect(fullSql).toContain("score > 50");
    expect(fullSql).toContain("approved_matches > 3");
  });

  it("demote query protects Q4 bootstrap companies (discovered within 48h)", async () => {
    const { db } = await import("@/db/db");
    const executeMock = db.execute as unknown as ReturnType<typeof vi.fn>;

    executeMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    await recalculateQualityScores();

    // Third call is the demote query
    const demoteSqlObj = executeMock.mock.calls[2][0];
    const fullSql = getSqlText(demoteSqlObj);

    expect(fullSql).toContain("dormant");
    expect(fullSql).toContain("score < 10");
    expect(fullSql).toContain("total_jobs_processed > 20");
    // Q4 bootstrap protection: don't demote companies discovered within 48h
    expect(fullSql).toContain("discovered_at");
    expect(fullSql).toContain("48 hours");
  });
});

// ── Helper ───────────────────────────────────────────────────────────────────

/**
 * Extract SQL text from a drizzle sql template tag result.
 * Same helper as tier-recalc.test.ts.
 */
function getSqlText(sqlObj: unknown): string {
  if (sqlObj === null || typeof sqlObj !== "object") return String(sqlObj);
  const obj = sqlObj as Record<string, unknown>;
  const chunks = obj.queryChunks;
  if (Array.isArray(chunks)) {
    return chunks
      .map((chunk) => {
        if (chunk && typeof chunk === "object" && "value" in chunk) {
          const val = (chunk as { value: unknown }).value;
          return Array.isArray(val) ? val.join("") : String(val);
        }
        return String(chunk);
      })
      .join("");
  }
  return String(sqlObj);
}
