/**
 * Unit tests for the Circuit Breaker (5-Tier Action Chain — Criterion 3)
 * src/lib/jobs/circuit-breaker.ts
 *
 * Tests all 5 tier evaluation functions, the severity stack, and DB
 * operations (with mocked DB).
 *
 * Per AGENTS.md: the database layer is mocked — no real DB mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module — no real DB mutations.
// The select chain must handle two patterns:
//   1. db.select().from().where(...).limit(1)   → emitBreakerAlert dedup check
//   2. db.select().from().where(...)            → recoverBannedSources (awaitable)
// We make .where() return a thenable that also has a .limit() method.
const selectLimitMock = vi.fn().mockResolvedValue([]);
function makeWhereResult(): Promise<unknown[]> & {
  limit: typeof selectLimitMock;
} {
  const p = Promise.resolve([]) as unknown as Promise<unknown[]> & {
    limit: typeof selectLimitMock;
  };
  p.limit = selectLimitMock;
  return p;
}
const selectWhereMock = vi.fn(() => makeWhereResult());
const selectFromMock = vi.fn(() => ({ where: selectWhereMock }));
const selectChain = {
  from: selectFromMock,
  where: selectWhereMock,
  limit: selectLimitMock,
};
const updateChain = {
  set: vi.fn().mockReturnThis(),
  where: vi.fn().mockResolvedValue({ rowCount: 1 }),
};
const insertChain = {
  values: vi.fn().mockReturnThis(),
  returning: vi.fn().mockResolvedValue([{ id: "test-alert-id" }]),
};
vi.mock("@/db/db", () => ({
  db: {
    select: vi.fn(() => selectChain),
    update: vi.fn(() => updateChain),
    insert: vi.fn(() => insertChain),
    execute: vi.fn().mockResolvedValue({ rows: [{ cnt: "0" }] }),
  },
}));

import {
  applyTier1Action,
  applyTier2Action,
  applyTier5Action,
  type CorpusMetrics,
  clearSourceOrphanedCompanies,
  evaluateTier1,
  evaluateTier2,
  evaluateTier3,
  evaluateTier4,
  evaluateTier5,
  markSourceOrphanedCompanies,
  recoverBannedSources,
  resolveDominantSeverity,
  type SourceMetrics,
  TIER1_CONSECUTIVE_FAILS_THRESHOLD,
  TIER2_BACKLOG_15_PCT,
  TIER2_BACKLOG_25_PCT,
  TIER2_BACKLOG_30_PCT,
  TIER3_UNKNOWN_SUB_FLOOR_PCT,
  TIER4_CORPUS_RATIO_THRESHOLD,
  TIER5_BAN_DURATION_HRS,
  TIER5_ESCALATION_THRESHOLD,
} from "@/lib/jobs/circuit-breaker";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCorpusMetrics(
  overrides: Partial<CorpusMetrics> = {},
): CorpusMetrics {
  return {
    globalCount: 100,
    countryFencedCount: 50,
    unknownCount: 30,
    provisionalCount: 20,
    provisionalOver1hrCount: 5,
    knownScopeRatio: 100 / 150, // 0.667
    unknownSubFloorRatio: 30 / 180, // 0.167
    provisionalRatio: 20 / 200, // 0.10
    ...overrides,
  };
}

function makeSourceMetrics(
  overrides: Partial<SourceMetrics> = {},
): SourceMetrics {
  return {
    sourceName: "test-source",
    consecutiveProvisionalFailures: 0,
    provisionalCount: 10,
    provisionalOver1hrCount: 2,
    escalationCount: 0,
    lastEscalatedAt: null,
    status: "active",
    ...overrides,
  };
}

// ── Tier 1: Per-source early-warning ─────────────────────────────────────────

describe("evaluateTier1 — per-source early-warning", () => {
  it("does not trigger when consecutive fails < 3", () => {
    const result = evaluateTier1(
      makeSourceMetrics({ consecutiveProvisionalFailures: 2 }),
    );
    expect(result.triggered).toBe(false);
    expect(result.action).toBe("no_action");
    expect(result.severity).toBe("normal");
  });

  it("triggers 15min pause on 3 consecutive fails (first escalation)", () => {
    const result = evaluateTier1(
      makeSourceMetrics({
        consecutiveProvisionalFailures: TIER1_CONSECUTIVE_FAILS_THRESHOLD,
        escalationCount: 0,
      }),
    );
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("pause_source_15min");
    expect(result.severity).toBe("hard_pause");
    expect(result.affectedSources).toEqual(["test-source"]);
  });

  it("escalates to 1hr pause when escalationCount > 0", () => {
    const result = evaluateTier1(
      makeSourceMetrics({
        consecutiveProvisionalFailures: 3,
        escalationCount: 1, // already had one 15min pause
      }),
    );
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("pause_source_1hr");
    expect(result.severity).toBe("hard_pause");
  });

  it("triggers on more than 3 consecutive fails", () => {
    const result = evaluateTier1(
      makeSourceMetrics({ consecutiveProvisionalFailures: 10 }),
    );
    expect(result.triggered).toBe(true);
  });

  it("includes metrics in the result", () => {
    const result = evaluateTier1(
      makeSourceMetrics({ consecutiveProvisionalFailures: 5 }),
    );
    expect(result.metrics.consecutiveProvisionalFailures).toBe(5);
  });
});

// ── Tier 2: Provisional backlog throttle ─────────────────────────────────────

describe("evaluateTier2 — provisional backlog throttle", () => {
  it("does not trigger when backlog is low", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 1000,
      countryFencedCount: 500,
      unknownCount: 100,
      provisionalCount: 50,
    });
    const source = makeSourceMetrics({ provisionalOver1hrCount: 5 });
    const result = evaluateTier2(source, corpus);
    expect(result.triggered).toBe(false);
    // 5 / 1650 = 0.3% — well below 15%
  });

  it("triggers 50% rate reduction when backlog > 15%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 100,
      countryFencedCount: 50,
      unknownCount: 30,
      provisionalCount: 20,
    });
    // total = 200, need >15% = >30 provisional >1hr
    const source = makeSourceMetrics({ provisionalOver1hrCount: 35 });
    const result = evaluateTier2(source, corpus);
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("rate_reduce_50");
    expect(result.severity).toBe("rate_reduction");
  });

  it("triggers 90% rate reduction when backlog > 25%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 100,
      countryFencedCount: 50,
      unknownCount: 30,
      provisionalCount: 20,
    });
    // total = 200, need >25% = >50 provisional >1hr
    const source = makeSourceMetrics({ provisionalOver1hrCount: 55 });
    const result = evaluateTier2(source, corpus);
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("rate_reduce_90");
  });

  it("triggers pause-until-clear when backlog > 30%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 100,
      countryFencedCount: 50,
      unknownCount: 30,
      provisionalCount: 20,
    });
    // total = 200, need >30% = >60 provisional >1hr
    const source = makeSourceMetrics({ provisionalOver1hrCount: 70 });
    const result = evaluateTier2(source, corpus);
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("pause_source_until_clear");
    expect(result.severity).toBe("hard_pause");
  });

  it("does not trigger when total jobs is 0", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 0,
      countryFencedCount: 0,
      unknownCount: 0,
      provisionalCount: 0,
    });
    const source = makeSourceMetrics({ provisionalOver1hrCount: 0 });
    const result = evaluateTier2(source, corpus);
    expect(result.triggered).toBe(false);
  });
});

// ── Tier 3: Unknown sub-floor guard ──────────────────────────────────────────

describe("evaluateTier3 — unknown sub-floor guard", () => {
  it("does not trigger when unknown ratio < 30%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 100,
      countryFencedCount: 50,
      unknownCount: 30, // 30/180 = 16.7%
    });
    const result = evaluateTier3(corpus);
    expect(result.triggered).toBe(false);
  });

  it("triggers when unknown ratio >= 30%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 50,
      countryFencedCount: 50,
      unknownCount: 50,
      unknownSubFloorRatio: 50 / 150, // 33.3%
    });
    const result = evaluateTier3(corpus);
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("force_reclassify");
    expect(result.severity).toBe("hard_pause");
  });

  it("triggers at exactly 30%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 35,
      countryFencedCount: 35,
      unknownCount: 30,
      unknownSubFloorRatio: 30 / 100, // 30%
    });
    const result = evaluateTier3(corpus);
    expect(result.triggered).toBe(true);
  });
});

// ── Tier 4: Corpus-ratio breaker ─────────────────────────────────────────────

describe("evaluateTier4 — corpus-ratio breaker", () => {
  it("does not trigger when global ratio >= 50%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 100,
      countryFencedCount: 100, // 100/200 = 50%
    });
    const result = evaluateTier4(corpus);
    expect(result.triggered).toBe(false);
  });

  it("triggers when global ratio < 50%", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 40,
      countryFencedCount: 60,
      knownScopeRatio: 40 / 100, // 40%
    });
    const result = evaluateTier4(corpus);
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("halt_non_global_ingestion");
    expect(result.severity).toBe("hard_pause");
  });

  it("does not trigger when no known-scope jobs exist", () => {
    const corpus = makeCorpusMetrics({
      globalCount: 0,
      countryFencedCount: 0,
      unknownCount: 100,
    });
    const result = evaluateTier4(corpus);
    expect(result.triggered).toBe(false);
  });
});

// ── Tier 5: Daily source ban ─────────────────────────────────────────────────

describe("evaluateTier5 — daily source ban", () => {
  it("does not trigger when escalation_count < 3", () => {
    const result = evaluateTier5(makeSourceMetrics({ escalationCount: 2 }));
    expect(result.triggered).toBe(false);
  });

  it("triggers when escalation_count >= 3", () => {
    const result = evaluateTier5(
      makeSourceMetrics({ escalationCount: TIER5_ESCALATION_THRESHOLD }),
    );
    expect(result.triggered).toBe(true);
    expect(result.action).toBe("ban_source_24hr");
    expect(result.severity).toBe("hard_pause");
  });

  it("triggers on escalation_count > 3", () => {
    const result = evaluateTier5(makeSourceMetrics({ escalationCount: 10 }));
    expect(result.triggered).toBe(true);
  });
});

// ── Severity Stack ───────────────────────────────────────────────────────────

describe("resolveDominantSeverity", () => {
  it("returns 'normal' when no tiers triggered", () => {
    const evals = [
      evaluateTier1(makeSourceMetrics({ consecutiveProvisionalFailures: 0 })),
      evaluateTier3(makeCorpusMetrics({ unknownCount: 10 })),
    ];
    expect(resolveDominantSeverity(evals)).toBe("normal");
  });

  it("returns 'rate_reduction' when only rate reductions triggered", () => {
    const evals = [
      evaluateTier1(makeSourceMetrics({ consecutiveProvisionalFailures: 0 })),
      evaluateTier2(
        makeSourceMetrics({ provisionalOver1hrCount: 35 }),
        makeCorpusMetrics({
          globalCount: 100,
          countryFencedCount: 50,
          unknownCount: 30,
          provisionalCount: 20,
        }),
      ),
    ];
    expect(resolveDominantSeverity(evals)).toBe("rate_reduction");
  });

  it("returns 'hard_pause' when any hard pause is triggered", () => {
    const evals = [
      evaluateTier2(
        makeSourceMetrics({ provisionalOver1hrCount: 35 }),
        makeCorpusMetrics({
          globalCount: 100,
          countryFencedCount: 50,
          unknownCount: 30,
          provisionalCount: 20,
        }),
      ), // rate_reduction
      evaluateTier4(
        makeCorpusMetrics({
          globalCount: 40,
          countryFencedCount: 60,
          knownScopeRatio: 40 / 100, // 40% < 50% → triggers
        }),
      ), // hard_pause
    ];
    expect(resolveDominantSeverity(evals)).toBe("hard_pause");
  });

  it("hard pause takes precedence over rate reduction", () => {
    const evals = [
      {
        tier: 2 as const,
        triggered: true,
        action: "rate_reduce_50" as const,
        severity: "rate_reduction" as const,
        affectedSources: ["src-1"],
        details: "",
        metrics: {},
      },
      {
        tier: 4 as const,
        triggered: true,
        action: "halt_non_global_ingestion" as const,
        severity: "hard_pause" as const,
        affectedSources: [],
        details: "",
        metrics: {},
      },
    ];
    expect(resolveDominantSeverity(evals)).toBe("hard_pause");
  });
});

// ── Action Application (mocked DB) ───────────────────────────────────────────

describe("applyTier1Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when not triggered", async () => {
    await applyTier1Action({
      tier: 1,
      triggered: false,
      action: "no_action",
      severity: "normal",
      affectedSources: [],
      details: "",
      metrics: {},
    });
    expect(updateChain.set).not.toHaveBeenCalled();
  });

  it("sets source to degraded on first pause (15min)", async () => {
    await applyTier1Action({
      tier: 1,
      triggered: true,
      action: "pause_source_15min",
      severity: "hard_pause",
      affectedSources: ["test-source"],
      details: "3 consecutive fails",
      metrics: {},
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "degraded" }),
    );
  });

  it("increments escalation_count on 1hr pause escalation", async () => {
    await applyTier1Action({
      tier: 1,
      triggered: true,
      action: "pause_source_1hr",
      severity: "hard_pause",
      affectedSources: ["test-source"],
      details: "Escalated",
      metrics: {},
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "degraded",
        escalationCount: expect.any(Object), // sql template
        lastEscalatedAt: expect.any(Date),
      }),
    );
  });
});

describe("applyTier2Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets status to disabled on pause-until-clear", async () => {
    await applyTier2Action({
      tier: 2,
      triggered: true,
      action: "pause_source_until_clear",
      severity: "hard_pause",
      affectedSources: ["test-source"],
      details: "backlog >30%",
      metrics: {},
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "disabled",
        disabledAt: expect.any(Date),
      }),
    );
  });

  it("sets status to degraded on rate reduction", async () => {
    await applyTier2Action({
      tier: 2,
      triggered: true,
      action: "rate_reduce_50",
      severity: "rate_reduction",
      affectedSources: ["test-source"],
      details: "backlog >15%",
      metrics: {},
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "degraded" }),
    );
  });
});

describe("applyTier5Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets source status to banned", async () => {
    await applyTier5Action({
      tier: 5,
      triggered: true,
      action: "ban_source_24hr",
      severity: "hard_pause",
      affectedSources: ["test-source"],
      details: "escalation_count >= 3",
      metrics: {},
    });
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "banned",
        disabledAt: expect.any(Date),
      }),
    );
  });
});

// ── Source Orphan Marking ────────────────────────────────────────────────────

describe("markSourceOrphanedCompanies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates companies with matching discovery_source", async () => {
    await markSourceOrphanedCompanies("banned-source");
    expect(updateChain.set).toHaveBeenCalledWith({ sourceOrphaned: true });
  });
});

describe("clearSourceOrphanedCompanies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears source_orphaned flag for recovered source", async () => {
    await clearSourceOrphanedCompanies("recovered-source");
    expect(updateChain.set).toHaveBeenCalledWith({ sourceOrphaned: false });
  });
});

// ── Source Ban Recovery ──────────────────────────────────────────────────────

describe("recoverBannedSources", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // selectWhereMock returns a thenable; override it for this describe block.
    selectWhereMock.mockImplementation(() => {
      const p = Promise.resolve([
        { sourceName: "banned-source-1" },
      ]) as unknown as Promise<unknown[]> & {
        limit: typeof selectLimitMock;
      };
      p.limit = selectLimitMock;
      return p;
    });
  });

  it("recovers banned sources past their 24hr cooldown", async () => {
    const recovered = await recoverBannedSources(
      new Date("2025-07-05T12:00:00Z"),
    );
    expect(recovered).toEqual(["banned-source-1"]);
    expect(updateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "degraded",
        escalationCount: 0,
        disabledAt: null,
      }),
    );
  });

  it("returns empty array when no banned sources are past cooldown", async () => {
    selectWhereMock.mockImplementation(() => {
      const p = Promise.resolve([]) as unknown as Promise<unknown[]> & {
        limit: typeof selectLimitMock;
      };
      p.limit = selectLimitMock;
      return p;
    });
    const recovered = await recoverBannedSources();
    expect(recovered).toEqual([]);
  });
});

// ── Threshold Constants ──────────────────────────────────────────────────────

describe("threshold constants", () => {
  it("Tier 1 triggers at 3 consecutive fails", () => {
    expect(TIER1_CONSECUTIVE_FAILS_THRESHOLD).toBe(3);
  });

  it("Tier 2 has 15/25/30 percent thresholds", () => {
    expect(TIER2_BACKLOG_15_PCT).toBe(0.15);
    expect(TIER2_BACKLOG_25_PCT).toBe(0.25);
    expect(TIER2_BACKLOG_30_PCT).toBe(0.3);
  });

  it("Tier 3 triggers at 30% unknown sub-floor", () => {
    expect(TIER3_UNKNOWN_SUB_FLOOR_PCT).toBe(0.3);
  });

  it("Tier 4 triggers below 50% corpus ratio", () => {
    expect(TIER4_CORPUS_RATIO_THRESHOLD).toBe(0.5);
  });

  it("Tier 5 triggers at 3 escalations with 24hr cooldown", () => {
    expect(TIER5_ESCALATION_THRESHOLD).toBe(3);
    expect(TIER5_BAN_DURATION_HRS).toBe(24);
  });
});
