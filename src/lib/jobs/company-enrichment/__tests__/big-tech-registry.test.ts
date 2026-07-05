/**
 * Unit tests for the Big-Tech Registry
 * src/lib/jobs/company-enrichment/big-tech-registry.ts
 *
 * Verifies registry structure, lookup behavior, and that the canonicalName
 * keys match the canonicalizeCompanyName() output from slugger.ts.
 */

import { describe, expect, it } from "vitest";

import {
  BIG_TECH_BY_NAME,
  BIG_TECH_REGISTRY,
  BIG_TECH_REGISTRY_SIZE,
  lookupBigTech,
} from "@/lib/jobs/company-enrichment/big-tech-registry";
import { canonicalizeCompanyName } from "@/lib/jobs/seeders/slugger";

// ── Registry Structure ──────────────────────────────────────────────────────

describe("Big-Tech Registry — structure", () => {
  it("has at least 100 entries (MVP scope)", () => {
    expect(BIG_TECH_REGISTRY_SIZE).toBeGreaterThanOrEqual(100);
  });

  it("BIG_TECH_BY_NAME map size matches registry array length", () => {
    expect(BIG_TECH_BY_NAME.size).toBe(BIG_TECH_REGISTRY_SIZE);
  });

  it("every entry has a non-empty canonicalName", () => {
    for (const entry of BIG_TECH_REGISTRY) {
      expect(entry.canonicalName).toBeTruthy();
      expect(entry.canonicalName.length).toBeGreaterThan(0);
    }
  });

  it("every entry has a positive employeeCount", () => {
    for (const entry of BIG_TECH_REGISTRY) {
      expect(entry.employeeCount).toBeGreaterThan(0);
    }
  });

  it("every entry has isPublic as a boolean", () => {
    for (const entry of BIG_TECH_REGISTRY) {
      expect(typeof entry.isPublic).toBe("boolean");
    }
  });

  it("public entries have a ticker", () => {
    for (const entry of BIG_TECH_REGISTRY) {
      if (entry.isPublic) {
        expect(entry.ticker).toBeTruthy();
      }
    }
  });

  it("has no duplicate canonicalName keys", () => {
    const names = BIG_TECH_REGISTRY.map((e) => e.canonicalName);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ── Lookup Function ─────────────────────────────────────────────────────────

describe("lookupBigTech", () => {
  it("returns the entry for a known company (amazon)", () => {
    const entry = lookupBigTech("amazon");
    expect(entry).not.toBeNull();
    expect(entry?.canonicalName).toBe("amazon");
    expect(entry?.employeeCount).toBeGreaterThan(100000);
    expect(entry?.isPublic).toBe(true);
    expect(entry?.ticker).toBe("AMZN");
  });

  it("returns the entry for a known company (google)", () => {
    const entry = lookupBigTech("google");
    expect(entry).not.toBeNull();
    expect(entry?.isPublic).toBe(true);
  });

  it("returns null for an unknown company", () => {
    expect(lookupBigTech("nonexistent-startup-12345")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(lookupBigTech("")).toBeNull();
  });

  it("is case-sensitive (canonicalName is pre-canonicalized to lowercase)", () => {
    // The registry stores lowercase canonical names. The caller must
    // canonicalize before lookup. A non-canonicalized name won't match.
    expect(lookupBigTech("Amazon")).toBeNull();
    expect(lookupBigTech("AMAZON")).toBeNull();
    expect(lookupBigTech("amazon")).not.toBeNull();
  });
});

// ── Canonical Name Consistency ──────────────────────────────────────────────

describe("Big-Tech Registry — canonicalName consistency with slugger", () => {
  // Test that the registry's canonicalName keys match what
  // canonicalizeCompanyName() produces for the human-readable company names.
  // This ensures the scorer's lookup will work correctly.

  it("canonicalizeCompanyName('Amazon') matches registry key 'amazon'", () => {
    expect(canonicalizeCompanyName("Amazon")).toBe("amazon");
    expect(lookupBigTech(canonicalizeCompanyName("Amazon"))).not.toBeNull();
  });

  it("canonicalizeCompanyName('Microsoft Corporation') matches registry key 'microsoft'", () => {
    expect(canonicalizeCompanyName("Microsoft Corporation")).toBe("microsoft");
    expect(
      lookupBigTech(canonicalizeCompanyName("Microsoft Corporation")),
    ).not.toBeNull();
  });

  it("canonicalizeCompanyName('Meta Platforms Inc') matches registry key 'meta'", () => {
    // canonicalizeCompanyName strips "Platforms" (in the suffix list) and "Inc"
    // → "meta"
    expect(canonicalizeCompanyName("Meta Platforms Inc")).toBe("meta");
    expect(
      lookupBigTech(canonicalizeCompanyName("Meta Platforms Inc")),
    ).not.toBeNull();
  });

  it("canonicalizeCompanyName('Stripe Inc') matches registry key 'stripe'", () => {
    expect(canonicalizeCompanyName("Stripe Inc")).toBe("stripe");
    expect(lookupBigTech(canonicalizeCompanyName("Stripe Inc"))).not.toBeNull();
  });

  it("canonicalizeCompanyName('Palantir Technologies') matches registry key 'palantir'", () => {
    // Note: canonicalizeCompanyName strips "Technologies" suffix
    expect(canonicalizeCompanyName("Palantir Technologies")).toBe("palantir");
    expect(
      lookupBigTech(canonicalizeCompanyName("Palantir Technologies")),
    ).not.toBeNull();
  });
});

// ── Coverage by Employee Count Bucket ───────────────────────────────────────

describe("Big-Tech Registry — employee count buckets", () => {
  it("has entries in the >5000 bucket (−25 score)", () => {
    const big = BIG_TECH_REGISTRY.filter((e) => e.employeeCount > 5000);
    expect(big.length).toBeGreaterThan(20);
  });

  it("has entries in the 1000-5000 bucket (−15 score)", () => {
    const mid = BIG_TECH_REGISTRY.filter(
      (e) => e.employeeCount >= 1000 && e.employeeCount <= 5000,
    );
    expect(mid.length).toBeGreaterThan(5);
  });

  it("has both public and private entries", () => {
    const publicCount = BIG_TECH_REGISTRY.filter((e) => e.isPublic).length;
    const privateCount = BIG_TECH_REGISTRY.filter((e) => !e.isPublic).length;
    expect(publicCount).toBeGreaterThan(0);
    expect(privateCount).toBeGreaterThan(0);
  });
});
