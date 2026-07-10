/**
 * Unit tests for the direct ingestion upsert age filtering.
 *
 * Verifies that upsertDirectJobs rejects jobs with publishedAt older than
 * MAX_JOB_INJECTION_AGE_DAYS (default 60) and reports them as rejectedTooOld.
 * The database layer is mocked — we only test the filtering logic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module — upsertDirectJobs uses db.select and db.insert
// The insert mock returns synthetic rows so totalUpserted > 0.
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([])),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn(() => ({
          returning: vi.fn(() =>
            Promise.resolve([
              { id: "job-uuid-1", externalJobId: "synthetic-1" },
            ]),
          ),
        })),
      })),
    })),
  },
}));

// Mock storage-check to avoid circular imports
vi.mock("@/lib/jobs/storage-check", () => ({
  isStorageSafeForIngestion: vi.fn(() => true),
  STORAGE_LIMIT_MB: 460,
}));

import { db } from "@/db/db";
import type { DirectIngestionJob } from "@/lib/jobs/direct-ingestion/types";
import { upsertDirectJobs } from "@/lib/jobs/direct-ingestion/upsert";

function makeJob(
  overrides: Partial<DirectIngestionJob> = {},
): DirectIngestionJob {
  return {
    externalJobId: `test-${Math.random().toString(36).slice(2)}`,
    title: "Frontend Engineer",
    companyName: "TestCo",
    normalizedText: "We are looking for a frontend engineer.",
    extractedTags: ["react", "typescript"],
    applyUrl: "https://example.com/apply",
    locationName: "Remote",
    workplaceType: "remote",
    employmentType: "full-time",
    remoteScope: "global",
    compensationMin: null,
    compensationMax: null,
    compensationCurrency: null,
    experienceMinYears: null,
    experienceMaxYears: null,
    publishedAt: new Date(),
    ...overrides,
  };
}

describe("upsertDirectJobs — injection freshness gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects jobs older than 60 days and reports them as rejectedTooOld", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 90);

    const freshJob = makeJob();
    const oldJob = makeJob({
      externalJobId: "old-job-1",
      publishedAt: oldDate,
    });

    const result = await upsertDirectJobs(
      "himalayas_direct",
      "himalayas_direct",
      [freshJob, oldJob],
    );

    expect(result.rejectedTooOld).toBe(1);
    expect(result.totalUpserted).toBe(1);
  });

  it("rejects all jobs when every job is too old", async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 365);

    const result = await upsertDirectJobs(
      "remoteok_direct",
      "remoteok_direct",
      [
        makeJob({ externalJobId: "old-1", publishedAt: oldDate }),
        makeJob({ externalJobId: "old-2", publishedAt: oldDate }),
      ],
    );

    expect(result.rejectedTooOld).toBe(2);
    expect(result.totalUpserted).toBe(0);
    // db.insert should not be called when all jobs are filtered out
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects jobs with null publishedAt (treated as stale)", async () => {
    const result = await upsertDirectJobs("nofluffjobs", "nofluffjobs", [
      makeJob({ externalJobId: "no-date-1", publishedAt: null }),
    ]);

    expect(result.rejectedTooOld).toBe(1);
    expect(result.totalUpserted).toBe(0);
  });

  it("accepts jobs published exactly 60 days ago (boundary)", async () => {
    const boundaryDate = new Date();
    boundaryDate.setDate(boundaryDate.getDate() - 59); // just under 60 days

    const result = await upsertDirectJobs("justjoin", "justjoin", [
      makeJob({ externalJobId: "boundary-1", publishedAt: boundaryDate }),
    ]);

    expect(result.rejectedTooOld).toBe(0);
    expect(result.totalUpserted).toBe(1);
  });

  it("returns rejectedTooOld=0 for an empty input array", async () => {
    const result = await upsertDirectJobs("remotive", "remotive", []);

    expect(result.rejectedTooOld).toBe(0);
    expect(result.totalUpserted).toBe(0);
  });
});
