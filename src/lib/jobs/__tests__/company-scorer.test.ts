/**
 * Unit tests for the Company Scorer (Job Scoring Matrix — Criterion 3)
 * src/lib/jobs/company-scorer.ts
 *
 * Tests the 5-signal scoring matrix, clamping, tier assignment, and
 * DB persistence (with mocked DB).
 *
 * Per AGENTS.md: the database layer is mocked — no real DB mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module — no real DB mutations.
const insertChain = {
  values: vi.fn().mockReturnThis(),
  onConflictDoUpdate: vi.fn().mockResolvedValue({ rowCount: 1 }),
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue({ rowCount: 1 }),
};
vi.mock("@/db/db", () => ({
  db: {
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
  },
}));

import {
  buildScoringInputFromCompany,
  type CompanyScoringInput,
  computeCompanySizeScore,
  persistCompanySizeScore,
  resolveEmployeeCount,
  resolveIsPublic,
  SCORE_CLAMP_MAX,
  SCORE_CLAMP_MIN,
  scoreAgency,
  scoreEmployeeCount,
  scoreMaturity,
  scorePublicListing,
  scoreSourceOrigin,
  TIER_ACTIVE_HOT_THRESHOLD,
  TIER_DORMANT_THRESHOLD,
} from "@/lib/jobs/company-scorer";

// ── Helper: build a default scoring input ────────────────────────────────────

function makeInput(
  overrides: Partial<CompanyScoringInput> = {},
): CompanyScoringInput {
  return {
    companyId: "test-company-id",
    canonicalName: "test-startup",
    atsSlug: "test-startup",
    companyName: "Test Startup",
    employeeCount: 30,
    isAgency: false,
    isPublic: false,
    discoverySource: "github_probe",
    discoveredAt: new Date("2025-01-01"),
    ...overrides,
  };
}

// ── Individual Signal Scoring ────────────────────────────────────────────────

describe("scoreEmployeeCount", () => {
  it("returns -25 for >5000 employees", () => {
    expect(scoreEmployeeCount(5001)).toBe(-25);
    expect(scoreEmployeeCount(100000)).toBe(-25);
  });

  it("returns -15 for 1000-5000 employees", () => {
    expect(scoreEmployeeCount(1000)).toBe(-15);
    expect(scoreEmployeeCount(5000)).toBe(-15);
    expect(scoreEmployeeCount(2500)).toBe(-15);
  });

  it("returns -5 for 250-1000 employees", () => {
    expect(scoreEmployeeCount(250)).toBe(-5);
    expect(scoreEmployeeCount(999)).toBe(-5);
  });

  it("returns 0 for 50-250 employees", () => {
    expect(scoreEmployeeCount(50)).toBe(0);
    expect(scoreEmployeeCount(249)).toBe(0);
  });

  it("returns +15 for 20-49 employees", () => {
    expect(scoreEmployeeCount(20)).toBe(15);
    expect(scoreEmployeeCount(49)).toBe(15);
  });

  it("returns +25 for <20 employees", () => {
    expect(scoreEmployeeCount(19)).toBe(25);
    expect(scoreEmployeeCount(1)).toBe(25);
  });

  it("returns 0 for null (graceful degradation)", () => {
    expect(scoreEmployeeCount(null)).toBe(0);
  });
});

describe("scoreAgency", () => {
  it("returns -40 when isAgency is true", () => {
    expect(scoreAgency(true)).toBe(-40);
  });

  it("returns 0 when isAgency is false", () => {
    expect(scoreAgency(false)).toBe(0);
  });
});

describe("scorePublicListing", () => {
  it("returns -20 when isPublic is true", () => {
    expect(scorePublicListing(true)).toBe(-20);
  });

  it("returns 0 when isPublic is false", () => {
    expect(scorePublicListing(false)).toBe(0);
  });
});

describe("scoreSourceOrigin", () => {
  it("returns +15 for YC directory", () => {
    expect(scoreSourceOrigin("yc_directory")).toBe(15);
  });

  it("returns +15 for VC portfolio", () => {
    expect(scoreSourceOrigin("vc_portfolio")).toBe(15);
  });

  it("returns +15 for github_probe (v2)", () => {
    expect(scoreSourceOrigin("github_probe")).toBe(15);
  });

  it("returns +15 for funding_signal (v2)", () => {
    expect(scoreSourceOrigin("funding_signal")).toBe(15);
  });

  it("returns +10 for workable_meta_search (Product Hunt proxy)", () => {
    expect(scoreSourceOrigin("workable_meta_search")).toBe(10);
  });

  it("returns +5 for hn_algolia", () => {
    expect(scoreSourceOrigin("hn_algolia")).toBe(5);
  });

  it("returns +5 for hn_custom_url", () => {
    expect(scoreSourceOrigin("hn_custom_url")).toBe(5);
  });

  it("returns 0 for httparchive (no signal)", () => {
    expect(scoreSourceOrigin("httparchive")).toBe(0);
  });

  it("returns 0 for manual", () => {
    expect(scoreSourceOrigin("manual")).toBe(0);
  });
});

describe("scoreMaturity", () => {
  // Maturity signal is DISABLED — discoveredAt is not a valid company-age proxy.
  // See scoreMaturity() docstring for rationale. All inputs return 0.
  it("returns 0 for a recently-discovered company (signal disabled)", () => {
    const recent = new Date("2024-06-01");
    const now = new Date("2025-06-01");
    expect(scoreMaturity(recent, now)).toBe(0);
  });

  it("returns 0 for an old discovery date (signal disabled)", () => {
    const old = new Date("2010-01-01");
    const now = new Date("2025-01-01");
    expect(scoreMaturity(old, now)).toBe(0);
  });

  it("returns 0 for a mid-range discovery date (signal disabled)", () => {
    const mid = new Date("2018-01-01");
    const now = new Date("2025-01-01");
    expect(scoreMaturity(mid, now)).toBe(0);
  });
});

// ── Resolution Functions (big-tech registry fallback) ────────────────────────

describe("resolveEmployeeCount", () => {
  it("uses company employeeCount when available", () => {
    expect(resolveEmployeeCount("amazon", 100)).toBe(100);
  });

  it("falls back to big-tech registry when company employeeCount is null", () => {
    expect(resolveEmployeeCount("amazon", null)).toBe(1525000);
  });

  it("returns null when neither company nor registry has the count", () => {
    expect(resolveEmployeeCount("nonexistent", null)).toBeNull();
  });

  it("returns null when canonicalName is null", () => {
    expect(resolveEmployeeCount(null, null)).toBeNull();
  });

  it("prefers company employeeCount over registry", () => {
    // If the company row has a more recent/accurate count, use it
    expect(resolveEmployeeCount("amazon", 999)).toBe(999);
  });
});

describe("resolveIsPublic", () => {
  it("returns true when company isPublic is true", () => {
    expect(resolveIsPublic("nonexistent", true)).toBe(true);
  });

  it("falls back to registry when company isPublic is false", () => {
    expect(resolveIsPublic("amazon", false)).toBe(true);
  });

  it("returns false when neither company nor registry says public", () => {
    expect(resolveIsPublic("nonexistent", false)).toBe(false);
  });

  it("returns false when canonicalName is null", () => {
    expect(resolveIsPublic(null, false)).toBe(false);
  });
});

// ── Full Scoring Matrix (computeCompanySizeScore) ────────────────────────────

describe("computeCompanySizeScore", () => {
  it("scores a small YC startup positively", () => {
    const result = computeCompanySizeScore(
      makeInput({
        employeeCount: 15, // <20 → +25
        discoverySource: "yc_directory", // +15
        discoveredAt: new Date("2025-01-01"), // maturity disabled → 0
      }),
      new Date("2025-07-01"),
    );
    // rawScore = 25 + 0 + 0 + 15 + 0 = 40
    expect(result.rawScore).toBe(40);
    expect(result.companySizeScore).toBe(SCORE_CLAMP_MAX); // clamped to 0.30
    expect(result.recommendedTier).toBe("active_hot");
    expect(result.shouldBeDead).toBe(false);
  });

  it("scores a big public tech company negatively", () => {
    const result = computeCompanySizeScore(
      makeInput({
        canonicalName: "amazon",
        employeeCount: 1525000, // >5000 → -25
        isPublic: true, // -20
        discoverySource: "httparchive", // 0
        discoveredAt: new Date("2010-01-01"), // maturity disabled → 0
      }),
      new Date("2025-07-01"),
    );
    // rawScore = -25 + 0 + (-20) + 0 + 0 = -45
    expect(result.rawScore).toBe(-45);
    expect(result.companySizeScore).toBe(SCORE_CLAMP_MIN); // clamped to -0.30
    expect(result.recommendedTier).toBe("dormant");
    expect(result.shouldBeDead).toBe(false);
  });

  it("scores an agency as dead regardless of other signals", () => {
    const result = computeCompanySizeScore(
      makeInput({
        isAgency: true, // -40 + dead
        employeeCount: 10, // +25
        discoverySource: "yc_directory", // +15
      }),
    );
    // rawScore = 25 + (-40) + 0 + 15 + 0 = 0 (maturity disabled)
    expect(result.rawScore).toBe(0);
    expect(result.shouldBeDead).toBe(true);
    expect(result.recommendedTier).toBe("dead");
  });

  it("clamps positive scores to +0.30", () => {
    const result = computeCompanySizeScore(
      makeInput({
        employeeCount: 5, // <20 → +25
        isAgency: false,
        isPublic: false,
        discoverySource: "yc_directory", // +15
        discoveredAt: new Date("2025-01-01"), // +10
      }),
      new Date("2025-07-01"),
    );
    // rawScore = 25 + 0 + 0 + 15 + 10 = 50 → 0.50 → clamped to 0.30
    expect(result.companySizeScore).toBe(SCORE_CLAMP_MAX);
  });

  it("clamps negative scores to -0.30", () => {
    const result = computeCompanySizeScore(
      makeInput({
        employeeCount: 100000, // -25
        isPublic: true, // -20
        discoverySource: "httparchive", // 0
        discoveredAt: new Date("2000-01-01"), // -10
      }),
      new Date("2025-07-01"),
    );
    // rawScore = -25 + 0 + (-20) + 0 + (-10) = -55 → -0.55 → clamped to -0.30
    expect(result.companySizeScore).toBe(SCORE_CLAMP_MIN);
  });

  it("assigns active_hot when rawScore > 15", () => {
    const result = computeCompanySizeScore(
      makeInput({
        employeeCount: 30, // +15
        discoverySource: "yc_directory", // +15
        discoveredAt: new Date("2025-01-01"), // +10
      }),
      new Date("2025-07-01"),
    );
    // rawScore = 15 + 0 + 0 + 15 + 10 = 40
    expect(result.rawScore).toBeGreaterThan(TIER_ACTIVE_HOT_THRESHOLD);
    expect(result.recommendedTier).toBe("active_hot");
  });

  it("assigns dormant when rawScore < -20", () => {
    const result = computeCompanySizeScore(
      makeInput({
        employeeCount: 10000, // -25
        isPublic: true, // -20
        discoverySource: "httparchive", // 0
        discoveredAt: new Date("2010-01-01"), // -10
      }),
      new Date("2025-07-01"),
    );
    expect(result.rawScore).toBeLessThan(TIER_DORMANT_THRESHOLD);
    expect(result.recommendedTier).toBe("dormant");
  });

  it("assigns active for middle scores", () => {
    const result = computeCompanySizeScore(
      makeInput({
        employeeCount: 200, // 50-250 → 0
        isPublic: false,
        discoverySource: "hn_algolia", // +5
        discoveredAt: new Date("2020-01-01"), // 0 (5yr)
      }),
      new Date("2025-07-01"),
    );
    // rawScore = 0 + 0 + 0 + 5 + 0 = 5
    expect(result.rawScore).toBe(5);
    expect(result.recommendedTier).toBe("active");
  });

  it("returns signal breakdown for debugging", () => {
    const result = computeCompanySizeScore(
      makeInput({
        employeeCount: 15,
        isAgency: false,
        isPublic: false,
        discoverySource: "yc_directory",
        discoveredAt: new Date("2025-01-01"),
      }),
      new Date("2025-07-01"),
    );
    expect(result.signals).toHaveProperty("employeeCount");
    expect(result.signals).toHaveProperty("agency");
    expect(result.signals).toHaveProperty("publicListing");
    expect(result.signals).toHaveProperty("sourceOrigin");
    expect(result.signals).toHaveProperty("maturity");
    expect(result.signals.employeeCount).toBe(25);
    expect(result.signals.sourceOrigin).toBe(15);
  });

  it("uses big-tech registry fallback for employee count when null", () => {
    const result = computeCompanySizeScore(
      makeInput({
        canonicalName: "google",
        employeeCount: null, // falls back to registry → 182502 → -25
        isPublic: false, // falls back to registry → true → -20
        discoverySource: "httparchive",
        discoveredAt: new Date("2010-01-01"),
      }),
      new Date("2025-07-01"),
    );
    expect(result.signals.employeeCount).toBe(-25);
    expect(result.signals.publicListing).toBe(-20);
  });

  it("skips employee count signal when unknown (graceful degradation)", () => {
    const result = computeCompanySizeScore(
      makeInput({
        canonicalName: "unknown-startup",
        employeeCount: null, // not in registry → null → 0
        isPublic: false,
        discoverySource: "yc_directory", // +15
        discoveredAt: new Date("2025-01-01"), // maturity disabled → 0
      }),
      new Date("2025-07-01"),
    );
    expect(result.signals.employeeCount).toBe(0);
    // rawScore = 0 + 0 + 0 + 15 + 0 = 15 (maturity disabled)
    expect(result.rawScore).toBe(15);
  });
});

// ── buildScoringInputFromCompany ─────────────────────────────────────────────

describe("buildScoringInputFromCompany", () => {
  it("builds input from a company row", () => {
    const input = buildScoringInputFromCompany({
      id: "company-1",
      canonicalName: "test-co",
      atsSlug: "test-co",
      companyName: "Test Co",
      employeeCount: 50,
      isAgency: false,
      isPublic: false,
      discoverySource: "github_probe",
      discoveredAt: new Date("2025-01-01"),
    });
    expect(input.companyId).toBe("company-1");
    expect(input.employeeCount).toBe(50);
  });

  it("checks aggregator blacklist when isAgency is false", () => {
    const input = buildScoringInputFromCompany({
      id: "company-1",
      canonicalName: "hirehangar",
      atsSlug: "hirehangar", // in aggregator blacklist
      companyName: "Hirehangar",
      employeeCount: 100,
      isAgency: false, // not flagged, but slug matches blacklist
      isPublic: false,
      discoverySource: "httparchive",
      discoveredAt: new Date("2025-01-01"),
    });
    expect(input.isAgency).toBe(true); // detected from blacklist
  });
  // 250-1000 bucket... wait 2500 → 1000-5000 → -15
  it("keeps isAgency true when already set on row", () => {
    const input = buildScoringInputFromCompany({
      id: "company-1",
      canonicalName: "test-co",
      atsSlug: "test-co",
      companyName: "Test Co",
      employeeCount: 50,
      isAgency: true,
      isPublic: false,
      discoverySource: "github_probe",
      discoveredAt: new Date("2025-01-01"),
    });
    expect(input.isAgency).toBe(true);
  });

  it("canonicalizes company name when canonicalName is null", () => {
    const input = buildScoringInputFromCompany({
      id: "company-1",
      canonicalName: null,
      atsSlug: "test-co",
      companyName: "Test Co Inc",
      employeeCount: 50,
      isAgency: false,
      isPublic: false,
      discoverySource: "github_probe",
      discoveredAt: new Date("2025-01-01"),
    });
    expect(input.canonicalName).toBe("testco"); // canonicalized
  });
});

// ── DB Persistence (mocked) ──────────────────────────────────────────────────

describe("persistCompanySizeScore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls db.insert with upsert on company_quality_score", async () => {
    await persistCompanySizeScore("company-1", 0.25);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        companySizeScore: "0.250000",
      }),
    );
    expect(insertChain.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("formats the score with 6 decimal places", async () => {
    await persistCompanySizeScore("company-1", 0.123456789);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        companySizeScore: "0.123457", // rounded to 6 decimals
      }),
    );
  });

  it("handles negative scores", async () => {
    await persistCompanySizeScore("company-1", -0.3);
    expect(insertChain.values).toHaveBeenCalledWith(
      expect.objectContaining({
        companySizeScore: "-0.300000",
      }),
    );
  });
});
