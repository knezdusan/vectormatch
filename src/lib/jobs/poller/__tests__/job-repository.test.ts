/**
 * Unit tests for markStaleJobs — daily stale detection.
 *
 * Verifies that the stale marking query includes BOTH triggers:
 *   1. lastSeenAt-based (not seen in 7+ days)
 *   2. publishedAt-based (published >60 days ago, even if still seen)
 *
 * The database layer is mocked — we inspect the SQL AST to verify conditions.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture the SQL passed to .where() for inspection
const capturedWhereArgs: unknown[] = [];

function makeWhereMock(rows: { id: string }[], captureIndex: number) {
  return vi.fn(function (this: unknown, arg: unknown) {
    capturedWhereArgs[captureIndex] = arg;
    return { returning: vi.fn(() => rows) };
  });
}

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

// Mock storage-check
vi.mock("@/lib/jobs/storage-check", () => ({
  isStorageSafeForIngestion: vi.fn(() => true),
  STORAGE_LIMIT_MB: 460,
}));

import { db } from "@/db/db";
import { markStaleJobs } from "@/lib/jobs/poller/job-repository";

/**
 * Extract the full SQL text from a drizzle `sql` template tag result.
 * Falls back to [object Object] for column references, which is fine for
 * our purposes — the template literal string fragments contain the keywords
 * we're checking for ('active', '7 days', '60 days', etc.).
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
          if (Array.isArray(val)) return val.map(String).join("");
          return String(val);
        }
        return String(chunk);
      })
      .join("");
  }
  return String(sqlObj);
}

describe("markStaleJobs — age-based stale detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhereArgs.length = 0;
  });

  it("marks active jobs as stale via BOTH lastSeenAt (7d) AND publishedAt (60d) triggers", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;

    const staleWhere = makeWhereMock([{ id: "j1" }], 0);
    const goneWhere = makeWhereMock([{ id: "j2" }], 1);

    updateMock
      .mockReturnValueOnce({ set: vi.fn(() => ({ where: staleWhere })) })
      .mockReturnValueOnce({ set: vi.fn(() => ({ where: goneWhere })) });

    const result = await markStaleJobs();

    expect(staleWhere).toHaveBeenCalledTimes(1);
    const staleArg = capturedWhereArgs[0];
    expect(staleArg).toBeDefined();

    // Extract SQL text — column refs render as [object Object] but the
    // template literal fragments contain the keywords we need.
    const staleSqlText = getSqlText(staleArg);

    // Must contain both triggers (from the template literal string fragments)
    expect(staleSqlText).toContain("'active'");
    expect(staleSqlText).toContain("7 days");
    expect(staleSqlText).toContain("60 days");
    // Must use OR to combine the two triggers
    expect(staleSqlText.toLowerCase()).toContain("or");

    expect(result.staleMarked).toBe(1);
    expect(result.goneMarked).toBe(1);
  });

  it("marks stale jobs as gone after 30 days (lastSeenAt-based)", async () => {
    const updateMock = db.update as unknown as ReturnType<typeof vi.fn>;

    const staleWhere = makeWhereMock([], 0);
    const goneWhere = makeWhereMock([{ id: "g1" }, { id: "g2" }], 1);

    updateMock
      .mockReturnValueOnce({ set: vi.fn(() => ({ where: staleWhere })) })
      .mockReturnValueOnce({ set: vi.fn(() => ({ where: goneWhere })) });

    const result = await markStaleJobs();

    const goneArg = capturedWhereArgs[1];
    expect(goneArg).toBeDefined();

    const goneSqlText = getSqlText(goneArg);
    expect(goneSqlText).toContain("'stale'");
    expect(goneSqlText).toContain("30 days");

    expect(result.goneMarked).toBe(2);
  });
});
