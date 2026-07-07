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
