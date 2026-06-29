/**
 * Unit tests for B9 — Cross-Pollination from Job Descriptions Seeder (TDD §2.1)
 *
 * Tests:
 *   - filterNewCompanyNames: pure function filtering known vs new names
 *   - runCrossPollinationSeeder: full seeder with mocked DB + Slugger
 *   - Error handling: DB query failures
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

// Mock the Slugger
vi.mock("@/lib/jobs/seeders/slugger", () => ({
  resolveSlugger: vi.fn(),
}));

// Mock the company schema (used by drizzle select)
vi.mock("@/db/schemas/jobs/company", () => ({
  company: {
    canonicalName: "canonical_name",
  },
}));

import { db } from "@/db/db";
import {
  filterNewCompanyNames,
  runCrossPollinationSeeder,
} from "@/lib/jobs/seeders/batch-sources/cross-pollination";
import { resolveSlugger } from "@/lib/jobs/seeders/slugger";

// ── filterNewCompanyNames ────────────────────────────────────────────────────

describe("filterNewCompanyNames", () => {
  it("filters out names that exist in the existing set", () => {
    const names = ["Acme", "Foobar", "NewCo"];
    const existing = new Set(["acme", "foobar"]);

    const result = filterNewCompanyNames(names, existing);

    expect(result).toEqual(["NewCo"]);
  });

  it("is case-insensitive", () => {
    const names = ["ACME", "acme", "AcMe"];
    const existing = new Set(["acme"]);

    const result = filterNewCompanyNames(names, existing);

    expect(result).toHaveLength(0);
  });

  it("trims whitespace before comparison", () => {
    const names = ["  Acme  ", "NewCo"];
    const existing = new Set(["acme"]);

    const result = filterNewCompanyNames(names, existing);

    expect(result).toEqual(["NewCo"]);
  });

  it("excludes empty strings", () => {
    const names = ["", "  ", "Acme"];
    const existing = new Set<string>();

    const result = filterNewCompanyNames(names, existing);

    expect(result).toEqual(["Acme"]);
  });

  it("returns all names when existing set is empty", () => {
    const names = ["Acme", "Foobar"];
    const existing = new Set<string>();

    const result = filterNewCompanyNames(names, existing);

    expect(result).toHaveLength(2);
  });

  it("returns empty array when all names exist", () => {
    const names = ["Acme", "Foobar"];
    const existing = new Set(["acme", "foobar"]);

    const result = filterNewCompanyNames(names, existing);

    expect(result).toHaveLength(0);
  });
});

// ── runCrossPollinationSeeder ────────────────────────────────────────────────

describe("runCrossPollinationSeeder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDbQueries(jobNames: string[], existingNames: string[]): void {
    // Mock db.execute for getDistinctCompanyNames
    vi.mocked(db.execute).mockResolvedValue({
      rows: jobNames.map((n) => ({ company_name: n })),
    } as never);

    // Mock db.select for getExistingCompanyNames
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockResolvedValue(existingNames.map((n) => ({ name: n }))),
    } as never);
  }

  it("queries job table, filters known, runs Slugger on new names", async () => {
    mockDbQueries(["Acme", "Foobar", "NewCo"], ["acme"]);
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "newco",
      resolvedBy: "slug_probe",
      canonicalName: "newco",
    });

    const result = await runCrossPollinationSeeder();

    expect(result.totalCompanyNames).toBe(3);
    expect(result.alreadyExists).toBe(1); // "Acme"
    expect(result.sluggerAttempts).toBe(2); // "Foobar" + "NewCo"
    expect(result.resolved).toBe(2);
    expect(result.unresolved).toBe(0);
    expect(result.error).toBeUndefined();
  });

  it("counts resolved and unresolved correctly", async () => {
    mockDbQueries(["Acme", "Foobar"], []);
    vi.mocked(resolveSlugger)
      .mockResolvedValueOnce({
        success: true,
        atsSource: "greenhouse",
        atsSlug: "acme",
        resolvedBy: "slug_probe",
        canonicalName: "acme",
      })
      .mockResolvedValueOnce({
        success: false,
        canonicalName: "foobar",
      });

    const result = await runCrossPollinationSeeder();

    expect(result.resolved).toBe(1);
    expect(result.unresolved).toBe(1);
  });

  it("passes correct SluggerInput with discoverySource=cross_pollination", async () => {
    mockDbQueries(["Acme"], []);
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runCrossPollinationSeeder();

    expect(resolveSlugger).toHaveBeenCalledWith(
      expect.objectContaining({
        companyName: "Acme",
        discoverySource: "cross_pollination",
      }),
      expect.objectContaining({
        insertCompany: true,
      }),
    );
  });

  it("handles all names already existing", async () => {
    mockDbQueries(["Acme", "Foobar"], ["acme", "foobar"]);
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runCrossPollinationSeeder();

    expect(result.totalCompanyNames).toBe(2);
    expect(result.alreadyExists).toBe(2);
    expect(result.sluggerAttempts).toBe(0);
    expect(result.resolved).toBe(0);
    expect(resolveSlugger).not.toHaveBeenCalled();
  });

  it("handles empty job table", async () => {
    mockDbQueries([], []);
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runCrossPollinationSeeder();

    expect(result.totalCompanyNames).toBe(0);
    expect(result.alreadyExists).toBe(0);
    expect(result.sluggerAttempts).toBe(0);
    expect(result.resolved).toBe(0);
  });

  it("handles DB query error gracefully", async () => {
    vi.mocked(db.execute).mockRejectedValue(new Error("DB connection lost"));
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    const result = await runCrossPollinationSeeder();

    expect(result.error).toBeDefined();
    expect(result.error).toBe("DB connection lost");
    expect(result.totalCompanyNames).toBe(0);
  });

  it("includes discoveryContext with job_table provenance", async () => {
    mockDbQueries(["Acme"], []);
    vi.mocked(resolveSlugger).mockResolvedValue({
      success: true,
      atsSource: "greenhouse",
      atsSlug: "acme",
      resolvedBy: "slug_probe",
      canonicalName: "acme",
    });

    await runCrossPollinationSeeder();

    expect(resolveSlugger).toHaveBeenCalledWith(
      expect.objectContaining({
        discoveryContext: "job_table:Acme",
      }),
      expect.anything(),
    );
  });
});
