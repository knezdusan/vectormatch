// Aggregator Blacklist — Unit Tests
// src/lib/jobs/seeders/__tests__/aggregator-blacklist.test.ts

import { describe, expect, it } from "vitest";
import {
  isAggregator,
  isAggregatorName,
  isAggregatorSlug,
} from "@/lib/jobs/seeders/aggregator-blacklist";

describe("Aggregator Blacklist", () => {
  describe("isAggregatorSlug", () => {
    it("rejects known aggregator slug 'hirehangar'", () => {
      expect(isAggregatorSlug("hirehangar")).toBe(true);
    });

    it("rejects known aggregator slug 'ketryx'", () => {
      expect(isAggregatorSlug("ketryx")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isAggregatorSlug("HireHangar")).toBe(true);
      expect(isAggregatorSlug("KETRYX")).toBe(true);
    });

    it("passes legitimate company slug", () => {
      expect(isAggregatorSlug("vercel")).toBe(false);
      expect(isAggregatorSlug("perplexity")).toBe(false);
    });

    it("passes empty string", () => {
      expect(isAggregatorSlug("")).toBe(false);
    });
  });

  describe("isAggregatorName", () => {
    it("rejects known aggregator name 'Hirehangar'", () => {
      expect(isAggregatorName("Hirehangar")).toBe(true);
    });

    it("rejects known aggregator name 'Ketryx'", () => {
      expect(isAggregatorName("Ketryx")).toBe(true);
    });

    it("is case-insensitive", () => {
      expect(isAggregatorName("HIREHANGAR LLC")).toBe(true);
      expect(isAggregatorName("ketryx inc")).toBe(true);
    });

    it("matches as substring", () => {
      expect(isAggregatorName("Hirehangar LLC")).toBe(true);
      expect(isAggregatorName("Ketryx Software")).toBe(true);
    });

    it("passes legitimate company name", () => {
      expect(isAggregatorName("Vercel")).toBe(false);
      expect(isAggregatorName("Perplexity AI")).toBe(false);
    });

    it("passes null", () => {
      expect(isAggregatorName(null)).toBe(false);
    });

    it("passes empty string", () => {
      expect(isAggregatorName("")).toBe(false);
    });
  });

  describe("isAggregator (combined)", () => {
    it("rejects by slug only", () => {
      expect(isAggregator("hirehangar", null)).toBe(true);
    });

    it("rejects by name only", () => {
      expect(isAggregator("unknown-slug", "Ketryx")).toBe(true);
    });

    it("rejects when both slug and name match", () => {
      expect(isAggregator("hirehangar", "Hirehangar LLC")).toBe(true);
    });

    it("passes when neither matches", () => {
      expect(isAggregator("vercel", "Vercel")).toBe(false);
    });

    it("passes when both are null", () => {
      expect(isAggregator(null, null)).toBe(false);
    });
  });
});
