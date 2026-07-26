// D26: Geo Pattern Regression Fixtures
// src/lib/jobs/__tests__/geo-pattern-fixtures.test.ts
//
// The 5 founder exhibits that must be correctly classified by the
// deterministic geo patterns. These are the regression tests that
// prevent the HONK/silver/Talkiatry leaks from recurring.

import { describe, expect, it } from "vitest";
import { inferRemoteScope } from "../job-normalizer";

describe("D26: Geo Pattern Regression Fixtures (5 Founder Exhibits)", () => {
  describe("Exhibit 1: HONK — 'thrive from anywhere in the US'", () => {
    it("classifies 'thrive from anywhere in the US' as country_fenced", () => {
      const scope = inferRemoteScope(
        "Remote",
        "Thrive from anywhere in the US. We hire in all 50 states.",
        "remote",
      );
      expect(scope).toBe("country_fenced");
    });

    it("classifies 'anywhere in the US' as country_fenced (short form)", () => {
      const scope = inferRemoteScope("Anywhere in the US", "", "remote");
      expect(scope).toBe("country_fenced");
    });
  });

  describe("Exhibit 2: silver — Argentina-fenced job classified as global", () => {
    it("classifies Argentina-only remote job as country_fenced", () => {
      const scope = inferRemoteScope(
        "Remote - Argentina",
        "Must be based in Argentina. Remote work within Argentina only.",
        "remote",
      );
      expect(scope).toBe("country_fenced");
    });

    it("classifies 'Remote, Argentina' location as country_fenced", () => {
      const scope = inferRemoteScope("Remote, Argentina", "", "remote");
      expect(scope).toBe("country_fenced");
    });
  });

  describe("Exhibit 3: Talkiatry — US-only job classified as global", () => {
    it("classifies US-only remote job as country_fenced", () => {
      const scope = inferRemoteScope(
        "Remote - US",
        "Must be licensed to practice in the United States. US-based candidates only.",
        "remote",
      );
      expect(scope).toBe("country_fenced");
    });

    it("classifies 'authorized to work in the US' as country_fenced", () => {
      const scope = inferRemoteScope(
        "Remote",
        "Must be authorized to work in the United States.",
        "remote",
      );
      expect(scope).toBe("country_fenced");
    });
  });

  describe("Exhibit 4: MongoDB — geo-fenced job classified as global", () => {
    it("classifies 'Remote - US Only' as country_fenced", () => {
      const scope = inferRemoteScope("Remote - US Only", "", "remote");
      expect(scope).toBe("country_fenced");
    });

    it("classifies 'must be based in the US' as country_fenced", () => {
      const scope = inferRemoteScope(
        "Remote",
        "Must be based in the United States.",
        "remote",
      );
      expect(scope).toBe("country_fenced");
    });
  });

  describe("Exhibit 5: Tysons — geo-fenced job classified as global", () => {
    it("classifies 'Remote - North America Only' as country_fenced", () => {
      const scope = inferRemoteScope(
        "Remote - North America Only",
        "",
        "remote",
      );
      expect(scope).toBe("country_fenced");
    });

    it("classifies 'must reside in the US or Canada' as country_fenced", () => {
      const scope = inferRemoteScope(
        "Remote",
        "Must reside in the US or Canada.",
        "remote",
      );
      expect(scope).toBe("country_fenced");
    });
  });

  describe("Negative cases — genuinely global jobs must stay global", () => {
    it("classifies 'Anywhere in the World' as global", () => {
      const scope = inferRemoteScope("Anywhere in the World", "", "remote");
      expect(scope).toBe("global");
    });

    it("classifies 'Work from anywhere' as global", () => {
      const scope = inferRemoteScope(
        "Work from anywhere",
        "We are a distributed team across 12 countries.",
        "remote",
      );
      expect(scope).toBe("global");
    });

    it("classifies 'Worldwide' as global", () => {
      const scope = inferRemoteScope("Worldwide", "", "remote");
      expect(scope).toBe("global");
    });
  });
});
