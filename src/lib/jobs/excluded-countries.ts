// Excluded Countries — cached read + job matching logic
// src/lib/jobs/excluded-countries.ts
//
// Provides cached access to the admin-managed excluded countries list and
// a helper to check if a job is located in / sourced from an excluded country.
//
// Caching: uses Next.js 16 Cache Components ("use cache" + cacheTag). The
// Inngest ingestion pipeline and Gate 0.5 call getExcludedCountries() on
// every job — the cache prevents a DB hit each time. The admin server
// actions call revalidateTag("excluded-countries") to invalidate the cache
// when the list changes.

import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/db";
import { excludedCountries } from "@/db/schemas/jobs/excludedCountries";
import {
  extractLocationCountry,
  locationMentionsCountry,
} from "@/lib/jobs/location-utils";

/**
 * Get the set of excluded country codes (ISO 3166-1 alpha-2), cached via
 * Cache Components. Returns a Set for O(1) lookup.
 *
 * Cache invalidation: revalidateTag("excluded-countries") is called by the
 * admin server actions when countries are added or removed.
 */
export async function getExcludedCountries(): Promise<Set<string>> {
  "use cache";
  cacheLife("minutes");
  cacheTag("excluded-countries");
  return getExcludedCountriesRaw();
}

/**
 * Uncached read — fetches directly from DB. Used by the cached wrapper
 * and by code paths that need fresh data (e.g. server actions after a write).
 */
export async function getExcludedCountriesRaw(): Promise<Set<string>> {
  const rows = await db
    .select({ countryCode: excludedCountries.countryCode })
    .from(excludedCountries);
  return new Set(rows.map((r) => r.countryCode.toUpperCase()));
}

/**
 * Get the full excluded country records (with name, reason, etc.) for the
 * admin UI. Cached via Cache Components.
 */
export async function getExcludedCountryRecords() {
  "use cache";
  cacheLife("minutes");
  cacheTag("excluded-countries");
  return db
    .select()
    .from(excludedCountries)
    .orderBy(excludedCountries.countryName);
}

/**
 * Check if a job is located in or mentions an excluded country.
 *
 * Checks two signals:
 * 1. locationCountries — structured ISO codes from the adapter/ATS (highest
 *    confidence). If any code is in the excluded set, the job is blocked.
 * 2. locationName — free-text location string. Falls back to
 *    extractLocationCountry() to detect country names, and
 *    locationMentionsCountry() for each excluded code.
 *
 * @param locationCountries Structured country codes (may be null for ATS
 *        jobs that don't provide structured location data)
 * @param locationName Raw location string (e.g. "Pune, MH, in", "Pakistan")
 * @param excludedSet The cached set of excluded country codes
 * @returns The matching excluded country code, or null if no exclusion applies
 */
export function findExcludedCountry(
  locationCountries: string[] | null,
  locationName: string | null,
  excludedSet: Set<string>,
): string | null {
  if (excludedSet.size === 0) return null;

  // 1. Structured country codes — highest confidence
  if (locationCountries && locationCountries.length > 0) {
    for (const code of locationCountries) {
      if (excludedSet.has(code.toUpperCase())) {
        return code.toUpperCase();
      }
    }
  }

  // 2. Free-text location string fallback
  if (locationName) {
    // Try to extract a country code from the location string
    const extracted = extractLocationCountry(locationName);
    if (extracted && excludedSet.has(extracted)) {
      return extracted;
    }
    // Check each excluded country's name variants against the location string
    for (const code of excludedSet) {
      if (locationMentionsCountry(locationName, code)) {
        return code;
      }
    }
  }

  return null;
}
