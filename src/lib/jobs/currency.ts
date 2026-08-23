// Currency Conversion Utility for Gate 0.5 Compensation Comparison
// src/lib/jobs/currency.ts
//
// Converts job compensation values to USD for comparison against the applicant's
// expectedCompMin (which is always annual USD).
//
// Uses hardcoded exchange rates (not live API) because:
//   1. Gate 0.5 is a hot-path pre-filter — no room for API latency or failures
//   2. The 70% threshold is generous enough that rate precision isn't critical
//   3. Rates are conservative (slightly unfavorable to the job) so near-threshold
//      jobs don't falsely pass due to rate optimism
//
// Rates should be updated quarterly. For a pre-filter that rejects only when
// `jobMax < applicantMin * 0.7`, a 5-10% rate error doesn't change the decision
// for any job that's clearly above or below the threshold.

/**
 * Approximate USD exchange rates (1 unit of currency = N USD).
 * Conservative rates — slightly lower than typical market rates so that
 * near-threshold jobs don't falsely pass.
 *
 * Sourced from approximate mid-2026 rates. Update quarterly.
 */
const USD_RATES: Record<string, number> = {
  USD: 1,
  // Major currencies
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.12,
  CAD: 0.73,
  AUD: 0.66,
  // CEE/EU currencies (most relevant for NoFluffJobs)
  PLN: 0.25,
  CZK: 0.044,
  HUF: 0.0028,
  RON: 0.22,
  BGN: 0.55,
  HRK: 0.14,
  SEK: 0.094,
  NOK: 0.094,
  DKK: 0.145,
  // Eastern Europe / CIS
  UAH: 0.024,
  RUB: 0.011,
  TRY: 0.029,
  // Asia-Pacific
  INR: 0.012,
  PKR: 0.0036,
  BDT: 0.0091,
  PHP: 0.017,
  IDR: 0.000061,
  MYR: 0.21,
  SGD: 0.74,
  JPY: 0.0067,
  CNY: 0.14,
  KRW: 0.00072,
  VND: 0.000039,
  THB: 0.028,
  // Latin America
  BRL: 0.2,
  MXN: 0.059,
  ARS: 0.0011,
  COP: 0.00025,
  CLP: 0.0011,
  PEN: 0.27,
  // Middle East / Africa
  AED: 0.27,
  SAR: 0.27,
  ILS: 0.27,
  ZAR: 0.054,
  EGP: 0.021,
  KES: 0.0077,
  NGN: 0.00064,
};

/**
 * Minimum plausible annual salary in USD.
 *
 * Values below this after conversion are treated as unreliable/garbage data
 * (e.g. NoFluffJobs entries with 1,608 PLN/yr ≈ $400/yr) rather than real
 * compensation. When a converted value falls below this floor, the compensation
 * check soft-fail-opens — the job is not blocked just because the board
 * provided bad salary data.
 *
 * $5,000/yr is well below any real full-time professional salary in any
 * market, even low-cost-of-living countries (where $8k-$15k/yr is typical
 * for junior roles).
 */
const SANITY_FLOOR_USD = 5000;

/**
 * Convert an amount from a given currency to USD.
 *
 * @param amount   The amount in the source currency
 * @param currency ISO 4217 currency code (e.g. "PLN", "USD", "EUR"), or null
 * @returns        The equivalent amount in USD, or null if the currency is
 *                 unknown and can't be converted. If currency is null, the
 *                 amount is assumed to already be in USD (returned as-is).
 */
export function convertToUSD(
  amount: number,
  currency: string | null,
): number | null {
  if (currency === null || currency === "") {
    // No currency info — assume USD (most ATS jobs are USD-centric)
    return amount;
  }
  const rate = USD_RATES[currency.toUpperCase()];
  if (rate === undefined) {
    // Unknown currency — can't convert reliably, signal failure
    return null;
  }
  return amount * rate;
}

/**
 * Check if a USD amount is a plausible annual salary.
 *
 * Returns false for garbage values (e.g. $400/yr from bad NoFluffJobs data).
 * Used by the pre-filter to decide whether to trust compensation data or
 * soft-fail-open.
 *
 * @param usdAmount  The amount in USD (after conversion), or null
 * @returns          true if the amount is a plausible annual salary
 */
export function isPlausibleAnnualUSD(usdAmount: number | null): boolean {
  if (usdAmount === null) return false;
  return usdAmount >= SANITY_FLOOR_USD;
}

/**
 * Convert an amount to USD and check if it's a plausible annual salary.
 *
 * Convenience function combining convertToUSD + isPlausibleAnnualUSD.
 * Returns null if the conversion fails or the result is implausible —
 * signaling the caller to soft-fail-open.
 *
 * @param amount   The amount in the source currency
 * @param currency ISO 4217 currency code, or null (assumed USD)
 * @returns        The USD equivalent if plausible, null otherwise
 */
export function toPlausibleAnnualUSD(
  amount: number,
  currency: string | null,
): number | null {
  const usd = convertToUSD(amount, currency);
  if (usd === null) return null;
  return isPlausibleAnnualUSD(usd) ? usd : null;
}

/**
 * Map of common currency symbols and non-ISO codes to their ISO 4217 equivalents.
 * Used by `normalizeCurrencyCode` to handle boards (e.g. LaraJobs) that store
 * currency symbols (£, €, $) instead of ISO codes.
 */
const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  $: "USD",
  "£": "GBP",
  "€": "EUR",
  "¥": "JPY",
  "₹": "INR",
  "₽": "RUB",
  "₩": "KRW",
  "₺": "TRY",
  "₴": "UAH",
  "฿": "THB",
  "₦": "NGN",
  "₱": "PHP",
  "₲": "PYG",
  "₡": "CRC",
  "₪": "ILS",
  "₫": "VND",
  "₸": "KZT",
  "₭": "LAK",
  "₮": "MNT",
  R$: "BRL",
  kr: "SEK",
  Fr: "CHF",
  RM: "MYR",
  Rp: "IDR",
  Rs: "PKR",
  zł: "PLN",
  Kč: "CZK",
  Ft: "HUF",
  lei: "RON",
  kn: "HRK",
  дин: "RSD",
  // Mojibake variants (UTF-8 decoded as Latin-1)
  "Â£": "GBP",
  "â‚¬": "EUR",
  "Â¥": "JPY",
  "â‚¹": "INR",
  "â‚½": "RUB",
  "â‚©": "KRW",
  "â‚º": "TRY",
  "â‚´": "UAH",
  "à¸¿": "THB",
};

/**
 * Normalize a currency code to a valid ISO 4217 3-letter code.
 *
 * Handles:
 *   - Already-valid ISO codes (USD, EUR, GBP) → returned as-is (uppercased)
 *   - Currency symbols (£, €, $) → mapped to ISO code
 *   - Mojibake variants (Â£, â‚¬) → mapped to ISO code
 *   - Invalid/unknown codes → falls back to `fallback` (default "USD")
 *
 * This prevents `Intl.NumberFormat` from throwing `RangeError: Invalid currency code`
 * when a board stores a symbol or corrupted string instead of an ISO code.
 *
 * @param currency  The raw currency string from the job/board
 * @param fallback  The fallback ISO code when normalization fails (default "USD")
 * @returns         A valid ISO 4217 currency code
 */
export function normalizeCurrencyCode(
  currency: string | null | undefined,
  fallback: string = "USD",
): string {
  if (!currency || typeof currency !== "string") return fallback;

  const trimmed = currency.trim();
  if (!trimmed) return fallback;

  // Check if it's already a valid 3-letter ISO code
  const upper = trimmed.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper) && USD_RATES[upper] !== undefined) {
    return upper;
  }

  // Check symbol map (try both raw and uppercased)
  const mapped = CURRENCY_SYMBOL_MAP[trimmed] ?? CURRENCY_SYMBOL_MAP[upper];
  if (mapped) return mapped;

  // If it's a 3-letter code we don't have rates for, still return it
  // (Intl.NumberFormat supports all ISO 4217 codes, even rare ones)
  if (/^[A-Z]{3}$/.test(upper)) return upper;

  return fallback;
}
