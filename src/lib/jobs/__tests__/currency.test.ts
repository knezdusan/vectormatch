/**
 * Unit tests for the currency conversion utility (src/lib/jobs/currency.ts).
 *
 * Tests:
 *   - convertToUSD: known currencies, null currency, unknown currency
 *   - isPlausibleAnnualUSD: sanity floor boundary
 *   - toPlausibleAnnualUSD: combined conversion + sanity check
 */

import { describe, expect, it } from "vitest";

import {
  convertToUSD,
  isPlausibleAnnualUSD,
  toPlausibleAnnualUSD,
} from "@/lib/jobs/currency";

// ── convertToUSD ─────────────────────────────────────────────────────────────

describe("convertToUSD", () => {
  it("returns amount as-is for USD", () => {
    expect(convertToUSD(60000, "USD")).toBe(60000);
  });

  it("returns amount as-is for null currency (assumed USD)", () => {
    expect(convertToUSD(60000, null)).toBe(60000);
  });

  it("returns amount as-is for empty string currency (assumed USD)", () => {
    expect(convertToUSD(60000, "")).toBe(60000);
  });

  it("converts PLN to USD", () => {
    // 100,000 PLN × 0.25 = 25,000 USD
    expect(convertToUSD(100000, "PLN")).toBe(25000);
  });

  it("converts EUR to USD", () => {
    // 50,000 EUR × 1.08 = 54,000 USD
    expect(convertToUSD(50000, "EUR")).toBe(54000);
  });

  it("converts GBP to USD", () => {
    // 40,000 GBP × 1.27 = 50,800 USD
    expect(convertToUSD(40000, "GBP")).toBe(50800);
  });

  it("is case-insensitive (lowercase currency codes)", () => {
    expect(convertToUSD(100000, "pln")).toBe(25000);
    expect(convertToUSD(50000, "eur")).toBe(54000);
  });

  it("returns null for unknown currency", () => {
    expect(convertToUSD(50000, "XYZ")).toBeNull();
  });

  it("handles HUF (very small rate)", () => {
    // 10,000,000 HUF × 0.0028 = 28,000 USD
    expect(convertToUSD(10000000, "HUF")).toBe(28000);
  });

  it("handles JPY (very small rate)", () => {
    // 5,000,000 JPY × 0.0067 = 33,500 USD
    expect(convertToUSD(5000000, "JPY")).toBe(33500);
  });
});

// ── isPlausibleAnnualUSD ─────────────────────────────────────────────────────

describe("isPlausibleAnnualUSD", () => {
  it("returns false for null", () => {
    expect(isPlausibleAnnualUSD(null)).toBe(false);
  });

  it("returns false for garbage values below $5,000", () => {
    expect(isPlausibleAnnualUSD(400)).toBe(false);
    expect(isPlausibleAnnualUSD(4999)).toBe(false);
  });

  it("returns true at the $5,000 floor", () => {
    expect(isPlausibleAnnualUSD(5000)).toBe(true);
  });

  it("returns true for realistic salaries", () => {
    expect(isPlausibleAnnualUSD(25000)).toBe(true);
    expect(isPlausibleAnnualUSD(60000)).toBe(true);
    expect(isPlausibleAnnualUSD(150000)).toBe(true);
  });
});

// ── toPlausibleAnnualUSD ─────────────────────────────────────────────────────

describe("toPlausibleAnnualUSD", () => {
  it("converts and passes sanity check for PLN", () => {
    // 100,000 PLN → 25,000 USD → plausible
    expect(toPlausibleAnnualUSD(100000, "PLN")).toBe(25000);
  });

  it("returns null for garbage PLN data (below sanity floor)", () => {
    // 1,608 PLN → 402 USD → below $5,000 floor → null
    expect(toPlausibleAnnualUSD(1608, "PLN")).toBeNull();
  });

  it("returns null for unknown currency", () => {
    expect(toPlausibleAnnualUSD(50000, "XYZ")).toBeNull();
  });

  it("returns null when conversion result is below floor", () => {
    // 10,000 HUF → 28 USD → below floor
    expect(toPlausibleAnnualUSD(10000, "HUF")).toBeNull();
  });

  it("passes through USD values above floor", () => {
    expect(toPlausibleAnnualUSD(60000, "USD")).toBe(60000);
    expect(toPlausibleAnnualUSD(60000, null)).toBe(60000);
  });

  it("returns null for USD values below floor (garbage)", () => {
    expect(toPlausibleAnnualUSD(400, "USD")).toBeNull();
  });

  it("handles EUR conversion + sanity check", () => {
    // 50,000 EUR → 54,000 USD → plausible
    expect(toPlausibleAnnualUSD(50000, "EUR")).toBe(54000);
    // 3,000 EUR → 3,240 USD → below floor → null
    expect(toPlausibleAnnualUSD(3000, "EUR")).toBeNull();
  });
});
