// Matched Jobs Dashboard — /dashboard/jobs
// src/app/dashboard/jobs/page.tsx
//
// Server Component that fetches matches from the 3-Gate funnel and renders
// the match list with a status filter dropdown. This is the primary calibration
// interface — cosine distance, overlap score, LLM confidence, and LLM
// reasoning are all visible on the cards.
//
// (MODULE_C_DECISIONS.md §8)

import { redirect } from "next/navigation";
import { MatchList } from "@/components/dashboard/MatchList";
import { getAuthSession } from "@/lib/auth";
import {
  getMatches,
  getMatchesCount,
  getUnreadBadgeCount,
} from "@/lib/jobs/dashboard-queries";
import {
  MATCH_SORT_OPTIONS,
  MATCH_STATUS_FILTERS,
  type MatchSortOption,
  type MatchStatusFilter,
} from "@/lib/jobs/match-filters";

export const metadata = {
  title: "Matched Jobs | VectorMatch",
  description: "Review jobs matched to your personas by the 3-Gate funnel",
};

const PAGE_SIZE = 10;
const VALID_STATUSES: readonly MatchStatusFilter[] = MATCH_STATUS_FILTERS;
const VALID_SORTS: readonly MatchSortOption[] = MATCH_SORT_OPTIONS.map(
  (option) => option.value,
);

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; status?: string; sort?: string }>;
}) {
  const session = await getAuthSession();
  if (!session) {
    redirect("/auth?callbackUrl=%2Fdashboard%2Fjobs");
  }

  const userId = session.user.id;
  const params = await searchParams;

  // Parse query params
  const statusParam = params.status ?? "approved";
  const statusFilter: MatchStatusFilter = VALID_STATUSES.includes(
    statusParam as MatchStatusFilter,
  )
    ? (statusParam as MatchStatusFilter)
    : "approved";
  const sortParam = params.sort ?? "best_match";
  const sortFilter: MatchSortOption = VALID_SORTS.includes(
    sortParam as MatchSortOption,
  )
    ? (sortParam as MatchSortOption)
    : "best_match";
  const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const offset = (currentPage - 1) * PAGE_SIZE;

  // Fetch per-status counts for the filter dropdown.
  const statusCountPromises = MATCH_STATUS_FILTERS.map((status) =>
    getMatchesCount(userId, status),
  );

  // Fetch data in parallel
  const [matches, totalCount, unreadCount, ...statusCounts] = await Promise.all(
    [
      getMatches(userId, statusFilter, PAGE_SIZE, offset, sortFilter),
      getMatchesCount(userId, statusFilter),
      getUnreadBadgeCount(userId),
      ...statusCountPromises,
    ],
  );

  const counts = Object.fromEntries(
    MATCH_STATUS_FILTERS.map((status, index) => [
      status,
      statusCounts[index] ?? 0,
    ]),
  ) as Record<MatchStatusFilter, number>;

  return (
    <div className="flex flex-col gap-6">
      <MatchList
        matches={matches}
        totalCount={totalCount}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        statusFilter={statusFilter}
        sortFilter={sortFilter}
        unreadCount={unreadCount}
        counts={counts}
      />
    </div>
  );
}
