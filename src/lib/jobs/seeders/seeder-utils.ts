// Shared Seeder Utilities
// src/lib/jobs/seeders/seeder-utils.ts
//
// Pure helper functions extracted from duplicate implementations across
// daily source seeders (meta-ads, remote-job-boards, weworkremotely-rss,
// github-trending, npm-registry).

/**
 * Deduplicate an array of company names (case-insensitive).
 * Preserves the first occurrence of each name (in original casing).
 * Empty/whitespace-only strings are filtered out.
 *
 * @param names  Array of company names (possibly with duplicates)
 * @returns      Deduplicated array preserving first-occurrence order
 */
export function deduplicateCompanyNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length === 0) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Deduplicate org names case-insensitively, preserving first-seen order.
 *
 * @param names  Array of org names (possibly with duplicates)
 * @returns      Deduplicated array, first occurrence wins
 */
export function deduplicateOrgNames(names: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}
