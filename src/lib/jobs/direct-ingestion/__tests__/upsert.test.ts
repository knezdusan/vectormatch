/**
 * Unit tests for the direct ingestion upsert age filtering.
 *
 * Verifies that upsertDirectJobs rejects jobs with publishedAt older than
 * MAX_JOB_INJECTION_AGE_DAYS (default 60) and reports them as rejectedTooOld.
 * The database layer is mocked — we only test the filtering logic.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module — upsertDirectJobs uses db.select and db.insert
// The insert mock captures the values array and returns synthetic rows
// matching the number of jobs passed to .values().
vi.mock("@/db/db", () => {
  const valuesMock = vi.fn();
  const insertMock = vi.fn(() => ({
    values: valuesMock,
  }));
  // Chain: values() returns { onConflictDoUpdate() } which returns { returning() }
  valuesMock.mockImplementation((jobs: unknown[]) => ({
    onConflictDoUpdate: vi.fn(() => ({
      returning: vi.fn(() =>
        Promise.resolve(
          (Array.isArray(jobs) ? jobs : []).map((_: unknown, i: number) => ({
            id: `job-uuid-${i}`,
            externalJobId: `synthetic-${i}`,
          })),
        ),
      ),
    })),
  }));
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => Promise.resolve([])),
        })),
      })),
      insert: insertMock,
    },
    _valuesMock: valuesMock,
  };
});

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

describe("upsertDirectJobs — A2 fence-skip embedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips embedding for country_fenced/region_fenced jobs, embeds only global/unknown", async () => {
    const embedFn = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

    const globalJob = makeJob({ externalJobId: "global-1" });
    const fencedJob = makeJob({
      externalJobId: "fenced-1",
      remoteScope: "country_fenced",
    });
    const regionFencedJob = makeJob({
      externalJobId: "region-1",
      remoteScope: "region_fenced",
    });

    const result = await upsertDirectJobs(
      "remotive",
      "remotive",
      [globalJob, fencedJob, regionFencedJob],
      embedFn,
    );

    // embedFn called only for the global job — fenced jobs skipped
    expect(embedFn).toHaveBeenCalledTimes(1);
    expect(embedFn).toHaveBeenCalledWith(globalJob.normalizedText);
    expect(result.embeddedCount).toBe(1);
  });

  it("embeds unknown-scope jobs (Gate 3 adjudicates scope, needs a vector)", async () => {
    const embedFn = vi.fn().mockResolvedValue([0.1, 0.2, 0.3]);

    const unknownJob = makeJob({
      externalJobId: "unknown-1",
      remoteScope: "unknown",
    });

    const result = await upsertDirectJobs(
      "himalayas_direct",
      "himalayas_direct",
      [unknownJob],
      embedFn,
    );

    expect(embedFn).toHaveBeenCalledTimes(1);
    expect(result.embeddedCount).toBe(1);
  });
});

describe("upsertDirectJobs — D29 duplicate externalJobId dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates jobs with the same externalJobId before insert (WWR bug)", async () => {
    // D29: WeWorkRemotely returns the same job twice with different location
    // text (e.g., "Remote - US" and "Remote - Canada" variants). Without
    // dedup, the ON CONFLICT DO UPDATE clause matches the same row twice,
    // raising SQLSTATE 21000 and aborting the entire batch.
    const dupId = "dropbox-director-product-design";
    const job1 = makeJob({
      externalJobId: dupId,
      title: "Director, Product Design",
    });
    const job2 = makeJob({
      externalJobId: dupId,
      title: "Director, Product Design",
    });
    const uniqueJob = makeJob({ externalJobId: "unique-1" });

    const result = await upsertDirectJobs("weworkremotely", "weworkremotely", [
      job1,
      job2,
      uniqueJob,
    ]);

    // Only 2 jobs should be upserted (1 deduped out)
    expect(result.totalUpserted).toBe(2);
  });

  it("handles all-duplicate input without crashing", async () => {
    const dupId = "same-job";
    const result = await upsertDirectJobs("remotive", "remotive", [
      makeJob({ externalJobId: dupId }),
      makeJob({ externalJobId: dupId }),
      makeJob({ externalJobId: dupId }),
    ]);

    // Only 1 job should be upserted
    expect(result.totalUpserted).toBe(1);
  });

  it("preserves the first occurrence when deduplicating", async () => {
    const dupId = "dup-first-wins";
    const first = makeJob({ externalJobId: dupId, title: "First Title" });
    const second = makeJob({ externalJobId: dupId, title: "Second Title" });

    const result = await upsertDirectJobs("weworkremotely", "weworkremotely", [
      first,
      second,
    ]);

    expect(result.totalUpserted).toBe(1);
  });
});
