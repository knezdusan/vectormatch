// Shared dashboard filter constants (no server-only imports, safe for client components).

export const MATCH_STATUS_FILTERS = [
  "approved",
  "viewed",
  "rejected",
  "stale",
  "pending",
  "mark_read",
  "mismatch",
  "applied",
  "all",
] as const;
export type MatchStatusFilter = (typeof MATCH_STATUS_FILTERS)[number];

export const MATCH_SORT_OPTIONS = [
  { value: "best_match", label: "Best match" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
] as const;
export type MatchSortOption = (typeof MATCH_SORT_OPTIONS)[number]["value"];

// D20 JOB 6.1 — Dismiss reason values (mirrors dismiss_reason PG enum).
// Moved here (out of src/actions/matches.ts) because that file has a
// top-level "use server" directive: Next.js Server Actions modules may only
// export async functions. Exporting a plain const array/type from a
// "use server" file breaks at the client-component import boundary (the
// value gets replaced with a broken reference), causing DismissButton's
// DISMISS_REASONS.map(...) to throw "X.map is not a function" at runtime.
export const DISMISS_REASONS = [
  "geo_fenced",
  "wrong_stack",
  "too_senior",
  "too_junior",
  "not_development",
  "not_interested",
  "stale",
  "duplicate",
  "other",
] as const;
export type DismissReason = (typeof DISMISS_REASONS)[number];
