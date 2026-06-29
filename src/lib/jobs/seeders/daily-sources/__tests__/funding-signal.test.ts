/**
 * Unit tests for D7 — Funding Signal Seeder (TDD §2.7)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    execute: vi.fn(),
  },
}));
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));
vi.mock("@/db/schemas/jobs/sluggerRetry", () => ({
  sluggerRetry: {
    companyName: "company_name",
    website: "website",
    discoverySource: "discovery_source",
    discoveryContext: "discovery_context",
    retryCount: "retry_count",
    nextRetryAt: "next_retry_at",
  },
}));

import { db } from "@/db/db";
import {
  computeNextRetryAt,
  getDueRetryCompanies,
  runFundingSignalSeeder,
} from "@/lib/jobs/seeders/daily-sources/funding-signal";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";
import type { FetchFn } from "@/lib/jobs/types";

// ── computeNextRetryAt ────────────────────────────────────────────────────────

describe("computeNextRetryAt", () => {
  it("returns a date 30 days in the future for retryCount 0", () => {
    const before = Date.now();
    const result = computeNextRetryAt(0);
    const after = Date.now();
    const expectedMin = before + 30 * 86400 * 1000;
    const expectedMax = after + 30 * 86400 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("returns a date 60 days in the future for retryCount 1", () => {
    const before = Date.now();
    const result = computeNextRetryAt(1);
    const after = Date.now();
    const expectedMin = before + 60 * 86400 * 1000;
    const expectedMax = after + 60 * 86400 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("returns a date 90 days in the future for retryCount 2", () => {
    const before = Date.now();
    const result = computeNextRetryAt(2);
    const after = Date.now();
    const expectedMin = before + 90 * 86400 * 1000;
    const expectedMax = after + 90 * 86400 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
  });

  it("returns a date 90 days in the future for retryCount 5 (caps at 90)", () => {
    const before = Date.now();
    const result = computeNextRetryAt(5);
    const after = Date.now();
    const expectedMin = before + 90 * 86400 * 1000;
    const expectedMax = after + 90 * 86400 * 1000;
    expect(result.getTime()).toBeGreaterThanOrEqual(expectedMin);
    expect(result.getTime()).toBeLessThanOrEqual(expectedMax);
  });
});

// ── getDueRetryCompanies ──────────────────────────────────────────────────────

describe("getDueRetryCompanies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("queries the slugger_retry table and returns due rows", async () => {
    const mockRows = [
      {
        companyName: "Acme",
        website: "https://acme.com",
        discoveryContext: "hn-daily url:test",
        retryCount: 0,
      },
    ];
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockRows),
      }),
    } as never);

    const result = await getDueRetryCompanies();

    expect(result).toEqual(mockRows);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("returns an empty array when no companies are due", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as never);

    const result = await getDueRetryCompanies();
    expect(result).toEqual([]);
  });
});

// ── runFundingSignalSeeder ────────────────────────────────────────────────────

describe("runFundingSignalSeeder", () => {
  const mockFetchFn = vi.fn() as unknown as FetchFn;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockSelectReturn(rows: unknown[]): void {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(rows),
      }),
    } as never);
  }

  function mockDeleteChain(): void {
    vi.mocked(db.delete).mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    } as never);
  }

  function mockUpdateChain(): void {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as never);
  }

  it("retries due companies, resolves successful ones, and removes them from the queue", async () => {
    const dueCompanies = [
      {
        companyName: "Acme",
        website: "https://acme.com",
        discoveryContext: "hn-daily url:test",
        retryCount: 0,
      },
      {
        companyName: "Globex",
        website: null,
        discoveryContext: null,
        retryCount: 1,
      },
    ];
    mockSelectReturn(dueCompanies);
    mockDeleteChain();

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runFundingSignalSeeder(mockFetchFn);

    expect(result.totalRetried).toBe(2);
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();

    // Slugger called with correct inputs
    expect(resolveSlugger).toHaveBeenCalledTimes(2);
    expect(vi.mocked(resolveSlugger).mock.calls[0][0]).toEqual({
      companyName: "Acme",
      website: "https://acme.com",
      discoverySource: "hn_algolia",
      discoveryContext: "hn-daily url:test",
    });
    expect(vi.mocked(resolveSlugger).mock.calls[0][1]).toEqual({
      fetchFn: mockFetchFn,
      insertCompany: true,
      addToRetryOnFailure: false,
    });
    expect(vi.mocked(resolveSlugger).mock.calls[1][0]).toEqual({
      companyName: "Globex",
      website: undefined,
      discoverySource: "hn_algolia",
      discoveryContext: undefined,
    });

    // Removed from retry queue on success
    expect(db.delete).toHaveBeenCalledTimes(2);
  });

  it("increments retry count and updates nextRetryAt for unresolved companies", async () => {
    const dueCompanies = [
      {
        companyName: "FailedCo",
        website: "https://failed.co",
        discoveryContext: "hn-daily url:failed",
        retryCount: 0,
      },
    ];
    mockSelectReturn(dueCompanies);
    mockUpdateChain();

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "failedco",
    });

    const result = await runFundingSignalSeeder(mockFetchFn);

    expect(result.totalRetried).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);

    // Retry queue updated (not deleted)
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.delete).not.toHaveBeenCalled();

    const setArg = vi.mocked(db.update).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setArg.retryCount).toBe(1);
    expect(setArg.nextRetryAt).toBeInstanceOf(Date);
  });

  it("uses 60-day backoff when retryCount goes from 1 to 2", async () => {
    const dueCompanies = [
      {
        companyName: "SecondFail",
        website: null,
        discoveryContext: null,
        retryCount: 1,
      },
    ];
    mockSelectReturn(dueCompanies);
    mockUpdateChain();

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: false,
      canonicalName: "secondfail",
    });

    await runFundingSignalSeeder(mockFetchFn);

    const setArg = vi.mocked(db.update).mock.results[0].value.set.mock
      .calls[0][0];
    expect(setArg.retryCount).toBe(2);
    const before = Date.now();
    const expectedMin = before + 90 * 86400 * 1000;
    expect(setArg.nextRetryAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
  });

  it("handles a mix of resolved and unresolved companies", async () => {
    const dueCompanies = [
      {
        companyName: "Acme",
        website: "https://acme.com",
        discoveryContext: "ctx-1",
        retryCount: 0,
      },
      {
        companyName: "FailCo",
        website: null,
        discoveryContext: "ctx-2",
        retryCount: 2,
      },
    ];
    mockSelectReturn(dueCompanies);
    mockDeleteChain();
    mockUpdateChain();

    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce({
        success: true,
        atsSource: "lever",
        atsSlug: "acme",
        resolvedBy: "cname",
        canonicalName: "acme",
      })
      .mockResolvedValueOnce({
        success: false,
        canonicalName: "failco",
      });

    const result = await runFundingSignalSeeder(mockFetchFn);

    expect(result.totalRetried).toBe(2);
    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("returns zero counts when the retry queue is empty", async () => {
    mockSelectReturn([]);

    const result = await runFundingSignalSeeder(mockFetchFn);

    expect(result.totalRetried).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("returns an error result when the DB query fails", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error("Connection refused")),
      }),
    } as never);

    const result = await runFundingSignalSeeder(mockFetchFn);

    expect(result.totalRetried).toBe(0);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(0);
    expect(result.error).toContain("Failed to query retry queue");
    expect(result.error).toContain("Connection refused");
  });

  it("treats a Slugger throw as unresolved and re-queues the company", async () => {
    const dueCompanies = [
      {
        companyName: "ThrowCo",
        website: "https://throw.co",
        discoveryContext: "ctx",
        retryCount: 0,
      },
    ];
    mockSelectReturn(dueCompanies);
    mockUpdateChain();

    vi.mocked(resolveSlugger).mockRejectedValue(new Error("Network error"));

    const result = await runFundingSignalSeeder(mockFetchFn);

    expect(result.totalRetried).toBe(1);
    expect(result.resolved).toBe(0);
    expect(result.unresolved).toBe(1);
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("passes insertCompany: true and addToRetryOnFailure: false to resolveSlugger", async () => {
    mockSelectReturn([
      {
        companyName: "Acme",
        website: "https://acme.com",
        discoveryContext: "ctx",
        retryCount: 0,
      },
    ]);
    mockDeleteChain();

    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runFundingSignalSeeder(mockFetchFn);

    const opts = vi.mocked(resolveSlugger).mock.calls[0][1];
    expect(opts?.insertCompany).toBe(true);
    expect(opts?.addToRetryOnFailure).toBe(false);
  });
});
