/**
 * Unit tests for v2 Provisional Job Repository
 * src/lib/jobs/seeders/provisional-job-repository.ts
 *
 * Tests the provisional-job insert path, staleness gate, dedup guard,
 * content-drift guard, and retryInFlight fencing.
 *
 * Per AGENTS.md: the database layer is mocked — no real DB mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module — no real DB mutations.
vi.mock("@/db/db", () => {
  const returningMock = vi.fn();
  const onConflictDoNothingMock = vi.fn(() => ({ returning: returningMock }));
  const valuesMock = vi.fn(() => ({
    onConflictDoNothing: onConflictDoNothingMock,
  }));
  const insertMock = vi.fn(() => ({ values: valuesMock }));
  return {
    db: {
      insert: insertMock,
      update: vi.fn(),
      select: vi.fn(),
      delete: vi.fn(),
    },
  };
});

import { db } from "@/db/db";
import type { ProvisionalJobSeed } from "@/lib/jobs/seeders/domain-probe";
import {
  CONTENT_DRIFT_COSINE_THRESHOLD,
  checkFencing,
  computeExternalJobId,
  computeTextHash,
  cosineDistance,
  DOMAIN_PROBE_ATS_SOURCE,
  dedupGuard,
  insertProvisionalJobs,
  isMaterialContentDrift,
  stalenessGate,
} from "@/lib/jobs/seeders/provisional-job-repository";

// ── computeExternalJobId ─────────────────────────────────────────────────────

describe("computeExternalJobId", () => {
  it("returns a stable SHA-256 hash for a URL", () => {
    const id1 = computeExternalJobId("https://acme.com/jobs/1");
    const id2 = computeExternalJobId("https://acme.com/jobs/1");
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64); // SHA-256 hex
  });

  it("returns different hashes for different URLs", () => {
    const id1 = computeExternalJobId("https://acme.com/jobs/1");
    const id2 = computeExternalJobId("https://acme.com/jobs/2");
    expect(id1).not.toBe(id2);
  });
});

// ── computeTextHash ──────────────────────────────────────────────────────────

describe("computeTextHash", () => {
  it("returns a stable SHA-256 hash for text", () => {
    const h1 = computeTextHash("Senior Engineer role");
    const h2 = computeTextHash("Senior Engineer role");
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("returns different hashes for different text", () => {
    const h1 = computeTextHash("Senior Engineer role");
    const h2 = computeTextHash("Junior Engineer role");
    expect(h1).not.toBe(h2);
  });
});

// ── stalenessGate ────────────────────────────────────────────────────────────

describe("stalenessGate", () => {
  it("returns 'resume' when lastPolledAt is null (never polled)", () => {
    expect(stalenessGate(null, new Date("2026-07-05"))).toBe("resume");
  });

  it("returns 'resume' when sourceFetchedAt is null", () => {
    expect(stalenessGate(new Date("2026-07-05"), null)).toBe("resume");
  });

  it("returns 'resume' when lastPolledAt <= sourceFetchedAt (cached data is fresh)", () => {
    const fetched = new Date("2026-07-05T12:00:00Z");
    const polled = new Date("2026-07-05T10:00:00Z"); // earlier
    expect(stalenessGate(polled, fetched)).toBe("resume");
  });

  it("returns 'refetch' when lastPolledAt > sourceFetchedAt (source re-polled)", () => {
    const fetched = new Date("2026-07-05T10:00:00Z");
    const polled = new Date("2026-07-05T12:00:00Z"); // later
    expect(stalenessGate(polled, fetched)).toBe("refetch");
  });

  it("returns 'resume' when timestamps are equal", () => {
    const ts = new Date("2026-07-05T12:00:00Z");
    expect(stalenessGate(ts, ts)).toBe("resume");
  });
});

// ── dedupGuard ───────────────────────────────────────────────────────────────

describe("dedupGuard", () => {
  it("returns 'skip' when textHashes match", () => {
    const hash = computeTextHash("same content");
    expect(dedupGuard(hash, hash)).toBe("skip");
  });

  it("returns 'drift' when textHashes differ", () => {
    const oldHash = computeTextHash("old content");
    const newHash = computeTextHash("new content");
    expect(dedupGuard(oldHash, newHash)).toBe("drift");
  });

  it("returns 'drift' when existingTextHash is null (first normalization)", () => {
    const newHash = computeTextHash("content");
    expect(dedupGuard(null, newHash)).toBe("drift");
  });
});

// ── cosineDistance ───────────────────────────────────────────────────────────

describe("cosineDistance", () => {
  it("returns 0 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineDistance(v, v)).toBeCloseTo(0, 5);
  });

  it("returns 2 for opposite vectors", () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineDistance(a, b)).toBeCloseTo(2, 5);
  });

  it("returns 1 for orthogonal vectors", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineDistance(a, b)).toBeCloseTo(1, 5);
  });

  it("returns 1 for empty vectors", () => {
    expect(cosineDistance([], [])).toBe(1);
  });

  it("returns 1 for mismatched-length vectors", () => {
    expect(cosineDistance([1, 2], [1, 2, 3])).toBe(1);
  });

  it("returns 1 for zero-norm vectors", () => {
    expect(cosineDistance([0, 0], [0, 0])).toBe(1);
  });
});

// ── isMaterialContentDrift ───────────────────────────────────────────────────

describe("isMaterialContentDrift", () => {
  it("returns false for identical embeddings (no drift)", () => {
    const v = [1, 2, 3];
    expect(isMaterialContentDrift(v, v)).toBe(false);
  });

  it("returns true for opposite embeddings (max drift)", () => {
    expect(isMaterialContentDrift([1, 0], [-1, 0])).toBe(true);
  });

  it("returns false for small drift below threshold", () => {
    // Tiny perturbation — cosine distance ~0
    const a = [1, 0, 0];
    const b = [1, 0.001, 0];
    expect(isMaterialContentDrift(a, b)).toBe(false);
  });

  it("exports the threshold constant", () => {
    expect(CONTENT_DRIFT_COSINE_THRESHOLD).toBe(0.15);
  });
});

// ── checkFencing ─────────────────────────────────────────────────────────────

describe("checkFencing", () => {
  it("returns 'legitimate' when clearedGeneration is null (no clears yet)", () => {
    expect(checkFencing(1, null)).toBe("legitimate");
    expect(checkFencing(0, null)).toBe("legitimate");
  });

  it("returns 'legitimate' when retryGeneration > clearedGeneration", () => {
    expect(checkFencing(5, 3)).toBe("legitimate");
    expect(checkFencing(4, 3)).toBe("legitimate");
  });

  it("returns 'zombie' when retryGeneration <= clearedGeneration", () => {
    expect(checkFencing(3, 3)).toBe("zombie"); // equal
    expect(checkFencing(2, 3)).toBe("zombie"); // less
    expect(checkFencing(0, 3)).toBe("zombie"); // much less
  });
});

// ── insertProvisionalJobs ────────────────────────────────────────────────────

describe("insertProvisionalJobs", () => {
  beforeEach(() => {
    vi.mocked(db.insert).mockReset();
  });

  function makeSeed(
    overrides: Partial<ProvisionalJobSeed> = {},
  ): ProvisionalJobSeed {
    return {
      title: "Senior Engineer",
      htmlSnippet: "<p>We are hiring.</p>",
      cleanedText: "We are hiring a senior engineer to build things.",
      email: null,
      sourceUrl: "https://acme.com/jobs/1",
      discoveredBy: "step3_jsonld",
      ...overrides,
    };
  }

  function setupInsertMock(returnedRows: { id: string }[]) {
    const returningMock = vi.fn().mockResolvedValue(returnedRows);
    const onConflictDoNothingMock = vi.fn(() => ({ returning: returningMock }));
    const valuesMock = vi.fn<(rows: unknown[]) => unknown>(() => ({
      onConflictDoNothing: onConflictDoNothingMock,
    }));
    vi.mocked(db.insert).mockReturnValue({
      values: valuesMock,
    } as never);
    return { returningMock, onConflictDoNothingMock, valuesMock };
  }

  it("returns zero counts for empty seeds array", async () => {
    const result = await insertProvisionalJobs("acme.com", []);
    expect(result.totalSeeds).toBe(0);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.insertedJobIds).toEqual([]);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("inserts jobs and returns inserted IDs", async () => {
    const seeds = [
      makeSeed(),
      makeSeed({ sourceUrl: "https://acme.com/jobs/2" }),
    ];
    setupInsertMock([{ id: "job-1" }, { id: "job-2" }]);

    const result = await insertProvisionalJobs("acme.com", seeds);

    expect(result.totalSeeds).toBe(2);
    expect(result.inserted).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.insertedJobIds).toEqual(["job-1", "job-2"]);
    expect(result.error).toBeUndefined();
  });

  it("counts skipped rows (dedup hits) correctly", async () => {
    const seeds = [
      makeSeed(),
      makeSeed({ sourceUrl: "https://acme.com/jobs/2" }),
      makeSeed({ sourceUrl: "https://acme.com/jobs/3" }),
    ];
    // Only 1 of 3 inserted (2 dedup hits)
    setupInsertMock([{ id: "job-1" }]);

    const result = await insertProvisionalJobs("acme.com", seeds);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(2);
    expect(result.insertedJobIds).toEqual(["job-1"]);
  });

  it("handles DB errors gracefully", async () => {
    const seeds = [makeSeed()];
    vi.mocked(db.insert).mockImplementation(() => {
      throw new Error("connection refused");
    });

    const result = await insertProvisionalJobs("acme.com", seeds);

    expect(result.inserted).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.error).toBe("connection refused");
    expect(result.insertedJobIds).toEqual([]);
  });

  it("uses DOMAIN_PROBE_ATS_SOURCE as the atsSource", async () => {
    const seeds = [makeSeed()];
    const { valuesMock } = setupInsertMock([{ id: "job-1" }]);

    await insertProvisionalJobs("acme.com", seeds);

    expect(valuesMock).toHaveBeenCalledTimes(1);
    const rows = valuesMock.mock.calls[0][0] as Array<{
      atsSource: string;
      atsSlug: string;
    }>;
    expect(rows[0].atsSource).toBe(DOMAIN_PROBE_ATS_SOURCE);
    expect(rows[0].atsSlug).toBe("acme.com");
  });

  it("sets status to 'provisional'", async () => {
    const seeds = [makeSeed()];
    const { valuesMock } = setupInsertMock([{ id: "job-1" }]);

    await insertProvisionalJobs("acme.com", seeds);

    const rows = valuesMock.mock.calls[0][0] as Array<{ status: string }>;
    expect(rows[0].status).toBe("provisional");
  });

  it("computes externalJobId from the source URL", async () => {
    const seeds = [makeSeed({ sourceUrl: "https://acme.com/jobs/42" })];
    const { valuesMock } = setupInsertMock([{ id: "job-1" }]);

    await insertProvisionalJobs("acme.com", seeds);

    const rows = valuesMock.mock.calls[0][0] as Array<{
      externalJobId: string;
    }>;
    expect(rows[0].externalJobId).toBe(
      computeExternalJobId("https://acme.com/jobs/42"),
    );
  });

  it("computes textHash from the cleaned text", async () => {
    const cleanedText = "We are hiring a senior engineer.";
    const seeds = [makeSeed({ cleanedText })];
    const { valuesMock } = setupInsertMock([{ id: "job-1" }]);

    await insertProvisionalJobs("acme.com", seeds);

    const rows = valuesMock.mock.calls[0][0] as Array<{ textHash: string }>;
    expect(rows[0].textHash).toBe(computeTextHash(cleanedText));
  });

  it("caps rawJson at 15KB", async () => {
    const longSnippet = "x".repeat(20000);
    const seeds = [makeSeed({ htmlSnippet: longSnippet })];
    const { valuesMock } = setupInsertMock([{ id: "job-1" }]);

    await insertProvisionalJobs("acme.com", seeds);

    const rows = valuesMock.mock.calls[0][0] as Array<{ rawJson: string }>;
    expect(rows[0].rawJson.length).toBe(15000);
  });
});
