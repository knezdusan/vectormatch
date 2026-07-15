// Tests for Fingerprint v3 — addressable-global yield ranking
// src/lib/jobs/seeders/__tests__/fingerprint-v3.test.ts

import { describe, expect, it } from "vitest";
import { classifyRemoteScope } from "@/lib/jobs/seeders/fingerprint-v3";

describe("fingerprint-v3 addressable-global yield", () => {
  // ── classifyRemoteScope ────────────────────────────────────────────────────

  describe("classifyRemoteScope", () => {
    // ATS-native trust path (Lever/Ashby)
    it("returns onsite for on-site workplaceType (Lever)", () => {
      expect(classifyRemoteScope("on-site", "San Francisco, CA", "lever")).toBe(
        "onsite",
      );
    });

    it("returns onsite for hybrid workplaceType (Ashby)", () => {
      expect(classifyRemoteScope("hybrid", "New York, NY", "ashby")).toBe(
        "onsite",
      );
    });

    it("skips trust path for Greenhouse on-site (no structured field)", () => {
      // Greenhouse has no structured workplaceType — should not trust it
      // and fall through to location-based check
      const result = classifyRemoteScope(
        "on-site",
        "Remote - Worldwide",
        "greenhouse",
      );
      expect(result).toBe("global");
    });

    // Location-based: global indicators
    it("returns global for 'Worldwide' location", () => {
      expect(classifyRemoteScope("remote", "Worldwide", "lever")).toBe(
        "global",
      );
    });

    it("returns global for 'Anywhere' location", () => {
      expect(classifyRemoteScope("remote", "Anywhere", "ashby")).toBe("global");
    });

    it("returns global for 'Remote - Worldwide' with null workplaceType", () => {
      expect(
        classifyRemoteScope(null, "Remote - Worldwide", "greenhouse"),
      ).toBe("global");
    });

    // Multi-continent → global
    it("returns global for multi-continent location (Americas, Europe, Asia)", () => {
      expect(
        classifyRemoteScope(
          "remote",
          "Americas, Europe, Asia, Oceania",
          "ashby",
        ),
      ).toBe("global");
    });

    it("returns global for 'North America, Europe, APAC'", () => {
      expect(
        classifyRemoteScope("remote", "North America, Europe, APAC", "lever"),
      ).toBe("global");
    });

    // Location-based: country-fenced
    it("returns country_fenced for 'Remote - US'", () => {
      expect(classifyRemoteScope("remote", "Remote - US", "lever")).toBe(
        "country_fenced",
      );
    });

    it("returns country_fenced for 'Remote - United States'", () => {
      expect(
        classifyRemoteScope("remote", "Remote - United States", "ashby"),
      ).toBe("country_fenced");
    });

    it("returns country_fenced for 'Poland / Remote / Poland'", () => {
      expect(
        classifyRemoteScope(null, "Poland / Remote / Poland", "greenhouse"),
      ).toBe("country_fenced");
    });

    // Specific city + null workplaceType → onsite
    it("returns onsite for specific city with null workplaceType", () => {
      expect(classifyRemoteScope(null, "San Francisco, CA", "greenhouse")).toBe(
        "onsite",
      );
    });

    it("returns onsite for 'London, UK' with null workplaceType", () => {
      expect(classifyRemoteScope(null, "London, UK", "greenhouse")).toBe(
        "onsite",
      );
    });

    // Remote with no country → undetermined
    it("returns undetermined for 'Remote' with no country (null workplaceType)", () => {
      expect(classifyRemoteScope(null, "Remote", "greenhouse")).toBe(
        "undetermined",
      );
    });

    it("returns undetermined for remote workplaceType with null location", () => {
      expect(classifyRemoteScope("remote", null, "lever")).toBe("undetermined");
    });

    it("returns undetermined for remote workplaceType with empty location", () => {
      expect(classifyRemoteScope("remote", "", "ashby")).toBe("undetermined");
    });

    // Null everything → undetermined
    it("returns undetermined for null workplaceType + null location", () => {
      expect(classifyRemoteScope(null, null, "greenhouse")).toBe(
        "undetermined",
      );
    });

    // Edge cases
    it("returns country_fenced for 'Remote - Germany' (Lever)", () => {
      expect(classifyRemoteScope("remote", "Remote - Germany", "lever")).toBe(
        "country_fenced",
      );
    });

    it("returns global for 'Remote - Global' (explicit global indicator)", () => {
      expect(classifyRemoteScope("remote", "Remote - Global", "ashby")).toBe(
        "global",
      );
    });

    // The Stripe/Coinbase case: country-fenced
    it("returns country_fenced for 'Remote - US' (Stripe case)", () => {
      expect(classifyRemoteScope("remote", "Remote - US", "greenhouse")).toBe(
        "country_fenced",
      );
    });

    it("returns country_fenced for 'Remote - United States' (Coinbase case)", () => {
      expect(
        classifyRemoteScope("remote", "Remote - United States", "greenhouse"),
      ).toBe("country_fenced");
    });
  });
});
