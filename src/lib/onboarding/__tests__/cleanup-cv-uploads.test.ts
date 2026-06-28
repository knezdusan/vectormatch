/**
 * Unit tests for the CV upload cleanup logic.
 *
 * Mock strategy:
 *   - Mock @/db/db to capture the delete/select queries and return controlled
 *     rows so the cleanup logic can be exercised without a real database.
 */

import { cleanupOrphanedCvUploads } from "@/lib/onboarding/cleanup-cv-uploads";

const { mockSelectResults } = vi.hoisted(() => ({
  mockSelectResults: [] as unknown[],
}));

vi.mock("@/db/db", () => ({
  db: {
    delete: () => ({
      where: () => ({
        returning: () => Promise.resolve([{ id: "deleted" }]),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mockSelectResults.shift() ?? []),
      }),
    }),
  },
}));

vi.mock("@/db/schemas", () => ({
  cvUpload: {
    id: "cvUpload.id",
    status: "cvUpload.status",
    createdAt: "cvUpload.createdAt",
  },
  workingHistory: { cvUploadId: "workingHistory.cvUploadId" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ type: "and", args }),
  eq: (a: unknown, b: unknown) => ({ type: "eq", a, b }),
  inArray: (a: unknown, b: unknown) => ({ type: "inArray", a, b }),
  lt: (a: unknown, b: unknown) => ({ type: "lt", a, b }),
  notExists: (q: unknown) => ({ type: "notExists", q }),
}));

describe("cleanupOrphanedCvUploads", () => {
  beforeEach(() => {
    mockSelectResults.length = 0;
  });

  it("deletes stuck processing uploads and orphaned uploads", async () => {
    // The first select() is the inner notExists subquery, the second is the outer
    // orphaned-cvUpload query.
    mockSelectResults.push([], [{ id: "orphan-1" }]);

    const result = await cleanupOrphanedCvUploads(
      24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
    );

    expect(result).toEqual({
      deletedProcessingCount: 1,
      deletedOrphanCount: 1,
    });
  });

  it("returns zero orphans when no orphaned rows exist", async () => {
    mockSelectResults.push([], []);

    const result = await cleanupOrphanedCvUploads(
      24 * 60 * 60 * 1000,
      7 * 24 * 60 * 60 * 1000,
    );

    expect(result).toEqual({
      deletedProcessingCount: 1,
      deletedOrphanCount: 0,
    });
  });
});
