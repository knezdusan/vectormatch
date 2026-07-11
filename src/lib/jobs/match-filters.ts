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
