// Sorted country list for UI selection — derived from COUNTRY_NAMES
// src/lib/jobs/country-list.ts
//
// Exports a sorted array of { code, name } pairs for use in the admin
// country exclusion multi-select. The primary name (first entry in
// COUNTRY_NAMES) is used as the display name.

import { COUNTRY_NAMES } from "@/lib/jobs/location-utils";

export interface CountryOption {
  code: string;
  name: string;
}

/** Sorted list of all known countries for UI selection. */
export const COUNTRY_OPTIONS: CountryOption[] = Object.entries(COUNTRY_NAMES)
  .map(([code, names]) => ({
    code,
    name: names[0].replace(/\b\w/g, (c) => c.toUpperCase()),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
