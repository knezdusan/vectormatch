/**
 * Unit tests for the Company Repository (TDD §4.0).
 *
 * Tests `insertDiscoveredCompanies` — specifically the Q5 fusion score
 * integration. After a successful insert, `recordDiscoverySource()` should be
 * called for each inserted company using its `discoverySource` from the
 * corresponding input.
 *
 * The DB layer and `recordDiscoverySource` are mocked to avoid database
 * mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module
vi.mock("@/db/db", () => ({
  db: {
    insert: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock recordDiscoverySource so we can verify it's called without hitting the DB
vi.mock("@/lib/jobs/quality/fusion-score", () => ({
  recordDiscoverySource: vi.fn().mockResolvedValue({
    companyId: "mock-id",
    fusionScore: 2,
    isNewSource: true,
  }),
}));

import { recordDiscoverySource } from "@/lib/jobs/quality/fusion-score";
import { insertDiscoveredCompanies } from "@/lib/jobs/seeders/company-repository";
import type { SeedCompanyInput } from "@/lib/jobs/seeders/schemas";

// Type the mocked db
const getMockDb = async () => {
  const { db } = await import("@/db/db");
  return db as unknown as {
    insert: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a valid SeedCompanyInput for testing. */
function makeInput(
  overrides: Partial<SeedCompanyInput> = {},
): SeedCompanyInput {
  return {
    atsSlug: "acme",
    atsSource: "greenhouse",
    discoverySource: "wayback_cdx",
    ...overrides,
  };
}

/**
 * Set up the db.insert mock to return the given rows from the
 * `.values().onConflictDoNothing().returning()` chain.
 */
function mockInsertReturning(
  db: Awaited<ReturnType<typeof getMockDb>>,
  rows: { id: string; atsSource: string; atsSlug: string }[],
) {
  db.insert.mockReturnValueOnce({
    values: vi.fn(() => ({
      onConflictDoNothing: vi.fn(() => ({
        target: [company.atsSource, company.atsSlug],
        returning: vi.fn().mockResolvedValueOnce(rows),
      })),
    })),
  });
}

// Import company for mock target references
import { company } from "@/db/schemas/jobs/company";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("insertDiscoveredCompanies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty result for empty input array", async () => {
    const result = await insertDiscoveredCompanies([]);

    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toHaveLength(0);
    expect(result.insertedCompanyIds).toHaveLength(0);
    expect(result.insertedCompanies).toHaveLength(0);
    expect(recordDiscoverySource).not.toHaveBeenCalled();
  });

  it("calls recordDiscoverySource for each inserted company", async () => {
    const db = await getMockDb();

    const inputs: SeedCompanyInput[] = [
      makeInput({
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "wayback_cdx",
      }),
      makeInput({
        atsSlug: "foobar",
        atsSource: "lever",
        discoverySource: "httparchive",
      }),
    ];

    mockInsertReturning(db, [
      { id: "company-1", atsSource: "greenhouse", atsSlug: "acme" },
      { id: "company-2", atsSource: "lever", atsSlug: "foobar" },
    ]);

    const result = await insertDiscoveredCompanies(inputs);

    expect(result.inserted).toBe(2);
    expect(result.insertedCompanyIds).toEqual(["company-1", "company-2"]);
    expect(recordDiscoverySource).toHaveBeenCalledTimes(2);
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-1",
      "wayback_cdx",
    );
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-2",
      "httparchive",
    );
  });

  it("does not call recordDiscoverySource for skipped (duplicate) companies", async () => {
    const db = await getMockDb();

    const inputs: SeedCompanyInput[] = [
      makeInput({
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "wayback_cdx",
      }),
      makeInput({
        atsSlug: "foobar",
        atsSource: "lever",
        discoverySource: "httparchive",
      }),
    ];

    // Only one row was inserted — the other was a duplicate (onConflictDoNothing)
    mockInsertReturning(db, [
      { id: "company-1", atsSource: "greenhouse", atsSlug: "acme" },
    ]);

    const result = await insertDiscoveredCompanies(inputs);

    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(recordDiscoverySource).toHaveBeenCalledTimes(1);
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-1",
      "wayback_cdx",
    );
  });

  it("maps inserted rows back to correct discoverySource when inputs have different sources", async () => {
    const db = await getMockDb();

    const inputs: SeedCompanyInput[] = [
      makeInput({
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "wayback_cdx",
      }),
      makeInput({
        atsSlug: "acme",
        atsSource: "lever",
        discoverySource: "rapid7_fdns",
      }),
      makeInput({
        atsSlug: "foobar",
        atsSource: "greenhouse",
        discoverySource: "sitemap_probe",
      }),
    ];

    // All three inserted (different atsSource+atsSlug combos)
    mockInsertReturning(db, [
      { id: "company-1", atsSource: "greenhouse", atsSlug: "acme" },
      { id: "company-2", atsSource: "lever", atsSlug: "acme" },
      { id: "company-3", atsSource: "greenhouse", atsSlug: "foobar" },
    ]);

    await insertDiscoveredCompanies(inputs);

    expect(recordDiscoverySource).toHaveBeenCalledTimes(3);
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-1",
      "wayback_cdx",
    );
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-2",
      "rapid7_fdns",
    );
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-3",
      "sitemap_probe",
    );
  });

  it("continues processing if recordDiscoverySource throws", async () => {
    const db = await getMockDb();

    // First call throws, second succeeds
    vi.mocked(recordDiscoverySource)
      .mockRejectedValueOnce(new Error("DB connection lost"))
      .mockResolvedValueOnce({
        companyId: "company-2",
        fusionScore: 2,
        isNewSource: true,
      });

    const inputs: SeedCompanyInput[] = [
      makeInput({
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "wayback_cdx",
      }),
      makeInput({
        atsSlug: "foobar",
        atsSource: "lever",
        discoverySource: "httparchive",
      }),
    ];

    mockInsertReturning(db, [
      { id: "company-1", atsSource: "greenhouse", atsSlug: "acme" },
      { id: "company-2", atsSource: "lever", atsSlug: "foobar" },
    ]);

    // Suppress console.error during this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await insertDiscoveredCompanies(inputs);

    // Both companies should still be in the result — the insert succeeded
    expect(result.inserted).toBe(2);
    expect(result.insertedCompanyIds).toEqual(["company-1", "company-2"]);
    // recordDiscoverySource was called for both
    expect(recordDiscoverySource).toHaveBeenCalledTimes(2);
    // An error was logged for the first failure
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("deduplicates within the batch before inserting", async () => {
    const db = await getMockDb();

    const inputs: SeedCompanyInput[] = [
      makeInput({
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "wayback_cdx",
      }),
      makeInput({
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "hn_algolia",
      }),
    ];

    // Only one row returned (the duplicate was deduped before insert)
    mockInsertReturning(db, [
      { id: "company-1", atsSource: "greenhouse", atsSlug: "acme" },
    ]);

    const result = await insertDiscoveredCompanies(inputs);

    expect(result.inserted).toBe(1);
    // recordDiscoverySource called once — with the FIRST input's discoverySource
    // (batch dedup keeps the first occurrence)
    expect(recordDiscoverySource).toHaveBeenCalledTimes(1);
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-1",
      "wayback_cdx",
    );
  });

  it("rejects invalid inputs and does not call recordDiscoverySource for them", async () => {
    const db = await getMockDb();

    const inputs = [
      makeInput({
        atsSlug: "acme",
        atsSource: "greenhouse",
        discoverySource: "wayback_cdx",
      }),
      // Invalid: missing required atsSlug
      { atsSource: "lever", discoverySource: "httparchive" },
    ];

    mockInsertReturning(db, [
      { id: "company-1", atsSource: "greenhouse", atsSlug: "acme" },
    ]);

    const result = await insertDiscoveredCompanies(
      inputs as SeedCompanyInput[],
    );

    expect(result.inserted).toBe(1);
    expect(result.rejected).toHaveLength(1);
    expect(recordDiscoverySource).toHaveBeenCalledTimes(1);
    expect(recordDiscoverySource).toHaveBeenCalledWith(
      "company-1",
      "wayback_cdx",
    );
  });
});
