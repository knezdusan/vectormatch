// Tests for the S4 targeted Brave Search query templates
// src/lib/jobs/seeders/batch-sources/__tests__/brave-search-targeted.test.ts

import { describe, expect, it } from "vitest";
import {
  generateDailyQuerySubset,
  generateQueryMatrix,
} from "@/lib/jobs/seeders/batch-sources/brave-search-targeted";

describe("S4 targeted Brave Search query templates", () => {
  // ── generateQueryMatrix ────────────────────────────────────────────────────

  describe("generateQueryMatrix", () => {
    it("generates the full matrix: 6 ATS × 10 stacks × 5 scopes = 300 queries", () => {
      const queries = generateQueryMatrix();
      expect(queries).toHaveLength(300);
    });

    it('each query has the correct format: site:{domain} "{stack}" "{scope}"', () => {
      const queries = generateQueryMatrix();
      const sample = queries[0];
      expect(sample.query).toMatch(/^site:[\w.]+ "[\w.]+" "[\w ]+"$/);
    });

    it("covers all 6 ATS domains", () => {
      const queries = generateQueryMatrix();
      const domains = new Set(queries.map((q) => q.atsDomain));
      expect(domains.size).toBe(6);
      expect(domains.has("boards.greenhouse.io")).toBe(true);
      expect(domains.has("jobs.lever.co")).toBe(true);
      expect(domains.has("jobs.ashbyhq.com")).toBe(true);
    });

    it("covers all 10 stack keywords", () => {
      const queries = generateQueryMatrix();
      const stacks = new Set(queries.map((q) => q.stackKeyword));
      expect(stacks.size).toBe(10);
      expect(stacks.has("Laravel")).toBe(true);
      expect(stacks.has("Next.js")).toBe(true);
      expect(stacks.has("WordPress")).toBe(true);
      expect(stacks.has("PHP")).toBe(true);
    });

    it("covers all 5 scope keywords", () => {
      const queries = generateQueryMatrix();
      const scopes = new Set(queries.map((q) => q.scopeKeyword));
      expect(scopes.size).toBe(5);
      expect(scopes.has("worldwide")).toBe(true);
      expect(scopes.has("anywhere")).toBe(true);
      expect(scopes.has("fully remote")).toBe(true);
    });

    it("each query has the correct ATS source mapping", () => {
      const queries = generateQueryMatrix();
      const greenhouseQueries = queries.filter(
        (q) => q.atsDomain === "boards.greenhouse.io",
      );
      expect(greenhouseQueries.every((q) => q.atsSource === "greenhouse")).toBe(
        true,
      );

      const leverQueries = queries.filter(
        (q) => q.atsDomain === "jobs.lever.co",
      );
      expect(leverQueries.every((q) => q.atsSource === "lever")).toBe(true);
    });
  });

  // ── generateDailyQuerySubset ───────────────────────────────────────────────

  describe("generateDailyQuerySubset", () => {
    it("returns a subset of the full matrix", () => {
      const fullMatrix = generateQueryMatrix();
      const subset = generateDailyQuerySubset(0);
      expect(subset.length).toBeLessThan(fullMatrix.length);
      expect(subset.length).toBeGreaterThan(0);
    });

    it("different days return different subsets", () => {
      const day0 = generateDailyQuerySubset(0);
      const day1 = generateDailyQuerySubset(1);
      const day2 = generateDailyQuerySubset(2);

      // Each day should have different queries (different ATS×stack combos)
      const day0Keys = new Set(
        day0.map((q) => `${q.atsDomain}:${q.stackKeyword}`),
      );
      const day1Keys = new Set(
        day1.map((q) => `${q.atsDomain}:${q.stackKeyword}`),
      );
      const day2Keys = new Set(
        day2.map((q) => `${q.atsDomain}:${q.stackKeyword}`),
      );

      // Days should have minimal overlap
      const overlap01 = [...day0Keys].filter((k) => day1Keys.has(k)).length;
      const overlap12 = [...day1Keys].filter((k) => day2Keys.has(k)).length;
      expect(overlap01).toBeLessThanOrEqual(1);
      expect(overlap12).toBeLessThanOrEqual(1);
    });

    it("all 7 days together cover the full matrix", () => {
      const fullMatrix = generateQueryMatrix();
      const allDays: string[] = [];
      for (let d = 0; d < 7; d++) {
        const subset = generateDailyQuerySubset(d);
        allDays.push(...subset.map((q) => q.query));
      }
      // Every query in the full matrix should appear in at least one day's subset
      for (const q of fullMatrix) {
        expect(allDays).toContain(q.query);
      }
    });

    it("each daily subset has ~45 queries (9 combos × 5 scopes)", () => {
      const subset = generateDailyQuerySubset(3);
      // 60 combos / 7 days ≈ 9 combos/day, × 5 scopes = ~45 queries
      expect(subset.length).toBeGreaterThanOrEqual(40);
      expect(subset.length).toBeLessThanOrEqual(50);
    });
  });
});
