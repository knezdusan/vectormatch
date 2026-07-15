// Tests for the Fingerprint v2 stack-profile gate
// src/lib/jobs/seeders/__tests__/fingerprint-v2.test.ts

import { describe, expect, it } from "vitest";
import {
  evaluateStackGate,
  isWebDevTitle,
  MIN_WEBDEV_ROLES,
  matchWebDevTitle,
} from "@/lib/jobs/seeders/fingerprint-v2";

describe("fingerprint-v2 stack-profile gate", () => {
  // ── isWebDevTitle ──────────────────────────────────────────────────────────

  describe("isWebDevTitle", () => {
    it("matches frontend roles", () => {
      expect(isWebDevTitle("Senior Frontend Engineer")).toBe(true);
      expect(isWebDevTitle("Front-End Developer")).toBe(true);
    });

    it("matches fullstack roles", () => {
      expect(isWebDevTitle("Fullstack Engineer")).toBe(true);
      expect(isWebDevTitle("Full-Stack Developer")).toBe(true);
    });

    it("matches JS/TS ecosystem roles", () => {
      expect(isWebDevTitle("React Developer")).toBe(true);
      expect(isWebDevTitle("Senior Next.js Engineer")).toBe(true);
      expect(isWebDevTitle("Node.js Backend Developer")).toBe(true);
    });

    it("matches PHP ecosystem roles", () => {
      expect(isWebDevTitle("PHP Developer")).toBe(true);
      expect(isWebDevTitle("Laravel Engineer")).toBe(true);
      expect(isWebDevTitle("WordPress Developer")).toBe(true);
    });

    it("matches web developer title", () => {
      expect(isWebDevTitle("Web Developer")).toBe(true);
      expect(isWebDevTitle("Senior Web Engineer")).toBe(true);
    });

    it("does NOT match non-web-dev engineering roles", () => {
      expect(isWebDevTitle("Senior Python Engineer")).toBe(false);
      expect(isWebDevTitle("DevOps Engineer")).toBe(false);
      expect(isWebDevTitle("Data Scientist")).toBe(false);
      expect(isWebDevTitle("Mobile Developer (iOS)")).toBe(false);
      expect(isWebDevTitle("Security Engineer")).toBe(false);
    });

    it("does NOT match non-engineering roles", () => {
      expect(isWebDevTitle("Account Executive")).toBe(false);
      expect(isWebDevTitle("HR Manager")).toBe(false);
      expect(isWebDevTitle("Product Manager")).toBe(false);
    });

    it("is case-insensitive", () => {
      expect(isWebDevTitle("FRONTEND DEVELOPER")).toBe(true);
      expect(isWebDevTitle("react engineer")).toBe(true);
      expect(isWebDevTitle("PHP Developer")).toBe(true);
    });
  });

  // ── matchWebDevTitle (match-basis logging) ─────────────────────────────────

  describe("matchWebDevTitle", () => {
    it("returns matched keywords for a frontend role", () => {
      const matches = matchWebDevTitle("Senior Frontend Engineer");
      expect(matches).toContain("frontend");
      expect(matches.length).toBeGreaterThan(0);
    });

    it("returns matched keywords for a PHP/Laravel role", () => {
      const matches = matchWebDevTitle("Laravel Developer");
      expect(matches).toContain("laravel");
    });

    it("returns empty array for non-web-dev roles", () => {
      const matches = matchWebDevTitle("Senior Python Engineer");
      expect(matches).toEqual([]);
    });

    it("returns multiple keywords when several match", () => {
      const matches = matchWebDevTitle("Full-Stack JavaScript Developer");
      expect(matches).toContain("full-stack");
      expect(matches).toContain("javascript");
    });
  });

  // ── evaluateStackGate (absolute count only: ≥2, fraction as ranking key) ───

  describe("evaluateStackGate", () => {
    it("passes with ≥2 web-dev roles (absolute threshold)", () => {
      const result = evaluateStackGate(5, 3);
      expect(result.passed).toBe(true);
      expect(result.reason).toContain("pass");
      expect(result.fraction).toBe(0.6);
    });

    it("passes with 2 web-dev out of 100 (2% but ≥2 absolute — Canonical case)", () => {
      // This is the Canonical case: 301 jobs, 6 web-dev. The fraction is low
      // but the absolute count is sufficient. Role-scoped ingestion handles
      // the corpus pollution — we embed only the 6 web-dev jobs, not all 301.
      const result = evaluateStackGate(100, 2);
      expect(result.passed).toBe(true);
      expect(result.fraction).toBe(0.02);
    });

    it("passes with 6 web-dev out of 301 (Canonical's actual numbers)", () => {
      const result = evaluateStackGate(301, 6);
      expect(result.passed).toBe(true);
      expect(result.fraction).toBeCloseTo(0.0199, 2);
    });

    it("fails with 1 web-dev out of 3 (< 2 absolute)", () => {
      const result = evaluateStackGate(3, 1);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("abs");
    });

    it("fails with 0 total jobs", () => {
      const result = evaluateStackGate(0, 0);
      expect(result.passed).toBe(false);
      expect(result.reason).toBe("no_jobs");
      expect(result.fraction).toBe(0);
    });

    it("fails with 1 web-dev role out of 10 (< 2 absolute)", () => {
      const result = evaluateStackGate(10, 1);
      expect(result.passed).toBe(false);
      expect(result.reason).toContain("abs");
    });

    it("passes with 2 web-dev out of 5", () => {
      const result = evaluateStackGate(5, 2);
      expect(result.passed).toBe(true);
      expect(result.fraction).toBe(0.4);
    });

    it("passes with 2 web-dev out of 7 (28.6% — fraction not a filter)", () => {
      // Under the old AND gate, this would fail on fraction. Now it passes
      // because the absolute count (2 ≥ 2) is sufficient.
      const result = evaluateStackGate(7, 2);
      expect(result.passed).toBe(true);
      expect(result.fraction).toBeCloseTo(0.286, 2);
    });

    it("returns fraction as ranking key", () => {
      const result = evaluateStackGate(10, 5);
      expect(result.fraction).toBe(0.5);
    });

    it("constants are set correctly", () => {
      expect(MIN_WEBDEV_ROLES).toBe(2);
    });
  });
});
