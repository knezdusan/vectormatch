// Excluded Countries — unit tests for findExcludedCountry helper
// src/lib/jobs/__tests__/excluded-countries.test.ts

import { describe, expect, it } from "vitest";
import { findExcludedCountry } from "@/lib/jobs/excluded-countries";

describe("findExcludedCountry", () => {
  it("returns null when excluded set is empty", () => {
    expect(findExcludedCountry(["IN"], "Mumbai, India", new Set())).toBeNull();
  });

  it("matches structured locationCountries (exact uppercase)", () => {
    expect(findExcludedCountry(["IN"], null, new Set(["IN", "PK"]))).toBe("IN");
  });

  it("matches structured locationCountries (lowercase normalized to uppercase)", () => {
    expect(findExcludedCountry(["in"], null, new Set(["IN"]))).toBe("IN");
  });

  it("matches first excluded country when multiple codes present", () => {
    expect(
      findExcludedCountry(["DE", "IN", "PK"], null, new Set(["IN", "PK"])),
    ).toBe("IN");
  });

  it("does not match structured locationCountries when none are excluded", () => {
    expect(
      findExcludedCountry(["DE", "FR"], null, new Set(["IN", "PK"])),
    ).toBeNull();
  });

  it("matches via extractLocationCountry from locationName string", () => {
    expect(findExcludedCountry(null, "Bangalore, India", new Set(["IN"]))).toBe(
      "IN",
    );
  });

  it("matches via locationMentionsCountry for 'Pakistan' in locationName", () => {
    expect(findExcludedCountry(null, "Lahore, Pakistan", new Set(["PK"]))).toBe(
      "PK",
    );
  });

  it("prefers structured locationCountries over locationName", () => {
    // locationCountries has DE (not excluded), locationName has India (excluded)
    // Should match IN via the locationName fallback
    expect(findExcludedCountry(["DE"], "Remote, India", new Set(["IN"]))).toBe(
      "IN",
    );
  });

  it("returns null when locationName has no country mention", () => {
    expect(
      findExcludedCountry(null, "Remote - Global", new Set(["IN", "PK"])),
    ).toBeNull();
  });

  it("returns null when both locationCountries and locationName are null", () => {
    expect(findExcludedCountry(null, null, new Set(["IN", "PK"]))).toBeNull();
  });

  it("returns null when locationCountries is empty array", () => {
    expect(
      findExcludedCountry([], "Berlin, Germany", new Set(["IN", "PK"])),
    ).toBeNull();
  });

  it("matches 'in' as India (not as substring of 'Indonesia')", () => {
    // The locationMentionsCountry helper uses non-letter boundary matching
    // to avoid false positives like "in" inside "Indonesia"
    expect(
      findExcludedCountry(null, "Jakarta, Indonesia", new Set(["IN"])),
    ).toBeNull();
  });
});
