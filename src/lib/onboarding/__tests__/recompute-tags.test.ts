/**
 * Unit tests for the recomputeTagsExperience overlap algorithm.
 *
 * The DB-touching parts of recomputeTagsExperience require a real Postgres
 * instance and are covered by integration tests. These tests cover the pure
 * date-range math: mergeOverlappingRanges and sumYearsFromRanges.
 *
 * Covers the test plan from MODULE_A_IMPLEMENTATION_HANDOFF.md §10.
 */

import {
  type DateRange,
  mergeOverlappingRanges,
  sumYearsFromRanges,
} from "@/lib/onboarding/recompute-tags";

// ─── mergeOverlappingRanges ───────────────────────────────────────────────────

describe("mergeOverlappingRanges", () => {
  it("handles an empty array", () => {
    expect(mergeOverlappingRanges([])).toEqual([]);
  });

  it("handles a single range", () => {
    const range: DateRange = {
      start: new Date("2020-01-01"),
      end: new Date("2021-01-01"),
    };
    expect(mergeOverlappingRanges([range])).toHaveLength(1);
  });

  it("merges fully overlapping ranges into one", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2024-01-01") },
      { start: new Date("2021-01-01"), end: new Date("2022-01-01") },
    ];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(new Date("2020-01-01"));
    expect(merged[0].end).toEqual(new Date("2024-01-01"));
  });

  it("merges partially overlapping ranges", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2022-06-01") },
      { start: new Date("2022-01-01"), end: new Date("2024-01-01") },
    ];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(new Date("2020-01-01"));
    expect(merged[0].end).toEqual(new Date("2024-01-01"));
  });

  it("does not merge non-overlapping ranges", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2021-01-01") },
      { start: new Date("2022-01-01"), end: new Date("2024-01-01") },
    ];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(2);
  });

  it("merges adjacent ranges (start == previous end)", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2022-01-01") },
      { start: new Date("2022-01-01"), end: new Date("2024-01-01") },
    ];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(new Date("2020-01-01"));
    expect(merged[0].end).toEqual(new Date("2024-01-01"));
  });

  it("handles unsorted input by sorting internally", () => {
    const ranges: DateRange[] = [
      { start: new Date("2022-01-01"), end: new Date("2024-01-01") },
      { start: new Date("2020-01-01"), end: new Date("2022-06-01") },
    ];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(new Date("2020-01-01"));
    expect(merged[0].end).toEqual(new Date("2024-01-01"));
  });

  it("merges a chain of overlapping ranges into one", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2021-06-01") },
      { start: new Date("2021-01-01"), end: new Date("2022-06-01") },
      { start: new Date("2022-01-01"), end: new Date("2023-01-01") },
    ];
    const merged = mergeOverlappingRanges(ranges);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toEqual(new Date("2020-01-01"));
    expect(merged[0].end).toEqual(new Date("2023-01-01"));
  });
});

// ─── sumYearsFromRanges ───────────────────────────────────────────────────────

describe("sumYearsFromRanges", () => {
  it("returns 0 for an empty array", () => {
    expect(sumYearsFromRanges([])).toBe(0);
  });

  it("calculates correct years for a single range", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2024-01-01") },
    ];
    // 4 years exactly → 4.0
    expect(sumYearsFromRanges(ranges)).toBe(4);
  });

  it("sums years across multiple non-overlapping ranges with the same tag", () => {
    const ranges: DateRange[] = [
      { start: new Date("2018-01-01"), end: new Date("2020-01-01") }, // 2 years
      { start: new Date("2021-01-01"), end: new Date("2024-01-01") }, // 3 years
    ];
    expect(sumYearsFromRanges(ranges)).toBe(5);
  });

  it("deduplicates overlapping ranges (does not double-count overlap)", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2024-01-01") }, // 4 years
      { start: new Date("2022-01-01"), end: new Date("2023-01-01") }, // 1 year (inside)
    ];
    // Overlap should not be double-counted → still 4 years
    expect(sumYearsFromRanges(ranges)).toBe(4);
  });

  it("deduplicates partially overlapping ranges", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2022-06-01") }, // 2.5 years
      { start: new Date("2022-01-01"), end: new Date("2024-01-01") }, // 2 years (0.5 overlap)
    ];
    // Merged: 2020-01-01 → 2024-01-01 = 4 years
    expect(sumYearsFromRanges(ranges)).toBe(4);
  });

  it("rounds to one decimal place", () => {
    const ranges: DateRange[] = [
      { start: new Date("2020-01-01"), end: new Date("2020-04-01") }, // ~0.25 years
    ];
    // ~0.246 years → rounds to 0.2
    expect(sumYearsFromRanges(ranges)).toBe(0.2);
  });
});
